"""RIAA equalization (IEC 60098) — stages 1 and 10 of the pipeline.

Physics: a cutter head driven at constant voltage produces constant groove
*velocity*, so low frequencies would carve enormous excursions (x = v / 2*pi*f)
and collide with neighboring grooves, while high frequencies would sit at tiny
excursions barely above the surface-noise floor. The RIAA standard therefore
cuts bass and boosts treble before cutting (pre-emphasis), and every phono
preamp applies the exact mirror curve on playback (de-emphasis).

Implementation: the analog pre-emphasis transfer function

    H(s) = (1 + s*T1)(1 + s*T3) / ((1 + s*T2)(1 + s*T4))

uses the three standard time constants plus the 'Neumann' pole T4 (~50 kHz)
that real cutting amplifiers add — without it H(s) has more zeros than poles
(unbounded HF gain) and cannot be discretized. We map H(s) to a digital IIR
with the *matched-Z transform* (each analog singularity s0 maps to
z0 = exp(s0/fs)) and normalize to unity gain at 1 kHz.

Matched-Z rather than bilinear, deliberately: the bilinear transform warps
this curve badly near Nyquist (measured +1.4 dB at 10 kHz and +7.5 dB at
20 kHz versus the analog ideal at fs=44.1 kHz, because the T4 pole sits above
Nyquist where tan-prewarping is undefined). Matched-Z handles above-Nyquist
singularities gracefully and tracks the analog curve within ~0.6 dB up to
10 kHz, undershooting gently (never overshooting) above that — a bounded,
conservative error instead of an unbounded one.

The de-emphasis filter is the *exact algebraic inverse* of the digital
pre-emphasis filter (numerator and denominator swapped), not an independently
designed approximation. This guarantees pre * de == identity to float
precision, so any coloration the user hears with only RIAA enabled is honestly
zero — and any coloration with other stages enabled is honestly *theirs*.
The inverse is stable because H(s) is minimum-phase (all zeros in the left
half-plane) and the bilinear transform maps them inside the unit circle.
"""

from __future__ import annotations

from functools import lru_cache

import numpy as np
from scipy import signal

from app.dsp.constants import RIAA_T1_S, RIAA_T2_S, RIAA_T3_S, RIAA_T4_S


@lru_cache(maxsize=8)
def design_riaa(sample_rate: int) -> tuple[tuple[float, ...], tuple[float, ...]]:
    """Digital RIAA pre-emphasis coefficients (b, a), unity gain at 1 kHz.

    Cached per sample rate; returned as tuples so the cache stays immutable.
    """
    # Analog prototype: zeros at -1/T1, -1/T3; poles at -1/T2, -1/T4,
    # mapped via matched-Z (see module docstring for why not bilinear).
    z_digital = np.exp(np.array([-1.0 / RIAA_T1_S, -1.0 / RIAA_T3_S]) / sample_rate)
    p_digital = np.exp(np.array([-1.0 / RIAA_T2_S, -1.0 / RIAA_T4_S]) / sample_rate)
    b_z, a_z = signal.zpk2tf(z_digital, p_digital, 1.0)

    # Normalize to 0 dB at 1 kHz (the RIAA reference frequency).
    w_ref = 2.0 * np.pi * 1000.0 / sample_rate
    _, h = signal.freqz(b_z, a_z, worN=[w_ref])
    b_z = b_z / np.abs(h[0])
    return tuple(b_z), tuple(a_z)


def pre_emphasis(x: np.ndarray, sample_rate: int) -> np.ndarray:
    """Apply RIAA pre-emphasis (cutting side): bass cut, treble boost."""
    b, a = design_riaa(sample_rate)
    return signal.lfilter(b, a, x, axis=0)


def de_emphasis(x: np.ndarray, sample_rate: int) -> np.ndarray:
    """Apply RIAA de-emphasis (phono preamp): exact inverse of pre_emphasis."""
    b, a = design_riaa(sample_rate)
    return signal.lfilter(a, b, x, axis=0)  # inverse: swap numerator/denominator


def pre_emphasis_gain_db(freq_hz: float, sample_rate: int) -> float:
    """Gain of the pre-emphasis curve at one frequency (for explanations)."""
    b, a = design_riaa(sample_rate)
    w = 2.0 * np.pi * freq_hz / sample_rate
    _, h = signal.freqz(b, a, worN=[w])
    return float(20.0 * np.log10(np.abs(h[0])))
