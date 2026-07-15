"""RIAA filter correctness: curve shape and exact invertibility."""

from __future__ import annotations

import numpy as np
import pytest
from scipy import signal

from app.dsp.cutting import riaa
from tests.conftest import SAMPLE_RATE


def test_pre_de_is_identity(multitone: np.ndarray) -> None:
    """De-emphasis must be the exact algebraic inverse of pre-emphasis.

    This is the guarantee that any coloration heard in the app is honestly
    attributable to the physical stages, never to a mismatched EQ pair.
    """
    x = multitone[:, 0].astype(np.float64)
    y = riaa.de_emphasis(riaa.pre_emphasis(x, SAMPLE_RATE), SAMPLE_RATE)
    # Ignore the first few ms of filter settle-in.
    skip = 512
    err = np.max(np.abs(x[skip:] - y[skip:]))
    assert err < 1e-8


def _analog_gain_db(freq_hz: float) -> float:
    """Reference analog pre-emphasis curve (with the Neumann pole), 1 kHz = 0 dB."""
    import math

    from app.dsp.constants import RIAA_T1_S, RIAA_T2_S, RIAA_T3_S, RIAA_T4_S

    def h(f: float) -> complex:
        s = 2j * math.pi * f
        return (1 + s * RIAA_T1_S) * (1 + s * RIAA_T3_S) / (
            (1 + s * RIAA_T2_S) * (1 + s * RIAA_T4_S)
        )

    return 20.0 * np.log10(abs(h(freq_hz)) / abs(h(1000.0)))


@pytest.mark.parametrize("freq_hz", [20.0, 100.0, 1000.0, 2122.0, 5000.0, 10_000.0])
def test_curve_matches_analog_reference(freq_hz: float) -> None:
    """The matched-Z digital curve must track the analog RIAA standard within
    0.75 dB through 10 kHz (it undershoots gently above that — bounded,
    conservative error; see riaa.py docstring for the bilinear comparison)."""
    got = riaa.pre_emphasis_gain_db(freq_hz, SAMPLE_RATE)
    assert got == pytest.approx(_analog_gain_db(freq_hz), abs=0.75)


def test_de_emphasis_is_stable() -> None:
    """The inverse filter's poles (= pre-emphasis zeros) must lie inside the
    unit circle, or long clips would blow up."""
    b, a = riaa.design_riaa(SAMPLE_RATE)
    poles_of_inverse = np.roots(b)
    assert np.all(np.abs(poles_of_inverse) < 1.0)
