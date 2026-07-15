"""Shared numeric helpers: leaky integration, matched differentiation, noise.

The integrator/differentiator pair is designed to be *mutually exact*: if
x = leaky_integrate(v) then matched_differentiate(x) reconstructs v to float
precision. This matters because the pipeline integrates velocity->displacement
on the way into the groove and differentiates displacement->velocity on the
way out (a cartridge is a velocity transducer); an unmatched pair (e.g.
np.gradient's central difference, which droops -3 dB by 10 kHz) would smear
fake high-frequency loss over every stage's measurements.
"""

from __future__ import annotations

import math

import numpy as np
from scipy import signal


def leak_coefficient(leak_hz: float, step: float) -> float:
    """One-step decay factor for a first-order leak at `leak_hz`.

    `step` is the sample spacing in the integration variable's units
    (seconds for time-domain, meters/velocity-scaled for spatial use).
    """
    return math.exp(-2.0 * math.pi * leak_hz * step)


def leaky_integrate(v: np.ndarray, step: float, leak_hz: float) -> np.ndarray:
    """x[n] = a*x[n-1] + v[n]*step, with a set by `leak_hz`.

    The leak models the tonearm/compliance resonance: below ~9 Hz the playback
    system physically cannot follow displacement, which conveniently also
    bounds numerical DC drift. Implemented as a single scipy IIR pass.
    Coefficients are cast to the input dtype so float32 spatial arrays stay
    float32 (lfilter would otherwise promote everything to float64 — a 2x
    memory regression on 16M-sample grooves).
    """
    a = leak_coefficient(leak_hz, step)
    b = np.asarray([step], dtype=v.dtype)
    aa = np.asarray([1.0, -a], dtype=v.dtype)
    return signal.lfilter(b, aa, v, axis=0)


def matched_differentiate(x: np.ndarray, step: float, leak_hz: float) -> np.ndarray:
    """Exact inverse of leaky_integrate: v[n] = (x[n] - a*x[n-1]) / step."""
    a = leak_coefficient(leak_hz, step)
    b = np.asarray([1.0 / step, -a / step], dtype=x.dtype)
    aa = np.asarray([1.0], dtype=x.dtype)
    return signal.lfilter(b, aa, x, axis=0)


def catmull_rom_uniform(y: np.ndarray, idx: np.ndarray) -> np.ndarray:
    """Cubic Catmull-Rom interpolation of a *uniformly sampled* signal at
    fractional indices, vectorized, float32 out.

    Why not np.interp: linear interpolation of a sinusoid errs by up to
    (w*dt)^2/8 per hop — the v0.1 pipeline needed 4x oversampling to bury
    that. Catmull-Rom's error falls as the 4th power of the sample spacing,
    so 2x oversampling is now the more accurate *and* cheaper option. Both
    domain remaps (time->arc-length and arc-length->time) interpolate from
    uniform grids, which is what makes this simple form applicable.
    """
    n = y.shape[0]
    idx = np.clip(idx, 0.0, n - 1.0)
    i = idx.astype(np.int32)  # spatial grids stay < 2^31; int32 halves index memory
    np.clip(i, 0, n - 2, out=i)
    f = (idx - i).astype(np.float32)

    p0 = y[np.maximum(i - 1, 0)]
    p1 = y[i]
    p2 = y[i + 1]
    p3 = y[np.minimum(i + 2, n - 1)]

    # Horner form of the Catmull-Rom polynomial (fewer temporaries).
    out = p1 + 0.5 * f * (
        (p2 - p0)
        + f * ((2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) + f * (3.0 * (p1 - p2) + p3 - p0))
    )
    return np.asarray(out, dtype=np.float32)


def pink_noise(n: int, rng: np.random.Generator) -> np.ndarray:
    """Unit-RMS pink (1/f power) noise via spectral shaping.

    Surface noise on vinyl measures close to pink: the groove-wall roughness
    spectrum falls with frequency roughly as 1/f in power.
    """
    white = rng.standard_normal(n)
    spectrum = np.fft.rfft(white)
    freqs = np.fft.rfftfreq(n)
    freqs[0] = freqs[1]  # avoid division by zero at DC
    spectrum /= np.sqrt(freqs / freqs[1])
    out = np.fft.irfft(spectrum, n)
    rms = float(np.sqrt(np.mean(out * out)))
    return out / max(rms, 1e-12)


def resonant_impulse(
    sample_rate: int, freq_hz: float, q: float, length_s: float = 0.008
) -> np.ndarray:
    """Impulse response of a lightly damped 2nd-order resonance.

    Models the cartridge cantilever being 'kicked' by a groove defect and
    ringing at its own mechanical resonance: h(t) = exp(-t/tau) sin(2 pi f t),
    tau = Q / (pi f). Normalized to unit peak.
    """
    n = max(int(length_s * sample_rate), 8)
    t = np.arange(n) / sample_rate
    tau = q / (math.pi * freq_hz)
    h = np.exp(-t / tau) * np.sin(2.0 * math.pi * freq_hz * t)
    peak = float(np.max(np.abs(h)))
    return h / max(peak, 1e-12)


def first_order_highpass(x: np.ndarray, corner_hz: float, sample_rate: int) -> np.ndarray:
    """Bilinear-transformed single-pole high-pass (used for crosstalk shaping)."""
    b, a = signal.bilinear([1.0 / (2.0 * math.pi * corner_hz), 0.0],
                           [1.0 / (2.0 * math.pi * corner_hz), 1.0],
                           fs=sample_rate)
    return signal.lfilter(b, a, x, axis=0)


def band_energy_db(x: np.ndarray, sample_rate: int, lo_hz: float, hi_hz: float) -> float:
    """Mean power in a frequency band, in dB (for explanation metrics)."""
    n = x.shape[0]
    spectrum = np.abs(np.fft.rfft(x * np.hanning(n))) ** 2
    freqs = np.fft.rfftfreq(n, d=1.0 / sample_rate)
    mask = (freqs >= lo_hz) & (freqs < hi_hz)
    if not mask.any():
        return -180.0
    return float(10.0 * np.log10(np.mean(spectrum[mask]) + 1e-24))
