"""Shared test fixtures."""

from __future__ import annotations

import numpy as np
import pytest

SAMPLE_RATE = 44_100


@pytest.fixture
def multitone() -> np.ndarray:
    """5 s stereo test signal: sines spread across the audible band.

    Band-limited to [100 Hz, 10 kHz]: content below the tonearm-resonance
    high-pass (~9 Hz) is physically unreproducible and excluded by design,
    and the top octave is where the (intentional, physical) stylus model
    lives — round-trip tests disable those stages but keep tolerance honest
    by staying in the well-covered band.
    """
    rng = np.random.default_rng(42)
    n = 5 * SAMPLE_RATE
    t = np.arange(n) / SAMPLE_RATE
    freqs = [100.0, 320.0, 880.0, 2400.0, 5200.0, 10_000.0]
    left = np.zeros(n)
    right = np.zeros(n)
    for f in freqs:
        pl, pr = rng.uniform(0, 2 * np.pi, size=2)
        left += np.sin(2 * np.pi * f * t + pl)
        right += np.sin(2 * np.pi * f * t + pr)
    stereo = np.stack([left, right], axis=1)
    return (0.5 * stereo / np.max(np.abs(stereo))).astype(np.float32)
