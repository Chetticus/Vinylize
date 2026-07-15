"""Per-upload measurements that turn generic physics into *your track's* story.

Everything here is computed from the actual decoded/processed buffers — the
Explorer never says 'vinyl generally loses treble'; it says how much treble
THIS clip lost, and points at the moment in THIS clip where each effect bites
hardest.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy import signal as sp_signal
from scipy.ndimage import uniform_filter1d

from app.dsp.constants import (
    INNER_RADIUS_M,
    OMEGA,
    STYLUS_CONTACT_SIGMA_M,
)
from app.dsp.filters import band_energy_db

# Gaussian contact patch: -3 dB where k*sigma = 0.83 (see stylus_contact.py),
# i.e. lambda = 2*pi*sigma / 0.83. Frequency with that wavelength at groove
# speed v is f = 0.83 * v / (2*pi*sigma).
_GAUSSIAN_3DB_K_SIGMA = 0.83


def tracing_cutoff_hz(radius_m: float, tip_scale: float = 1.0) -> float:
    """Raw contact-patch -3 dB frequency at a given groove radius."""
    v = OMEGA * radius_m
    sigma = STYLUS_CONTACT_SIGMA_M * tip_scale
    return _GAUSSIAN_3DB_K_SIGMA * v / (2.0 * math.pi * sigma)


@dataclass(frozen=True)
class TrackObservations:
    brightest_moment_s: float
    """Time of maximum high-frequency energy — where tracing loss bites."""
    loudest_moment_s: float
    """Time of maximum wideband level — where saturation bites."""
    quietest_rms_dbfs: float
    quietest_moment_s: float
    """Level/time of the softest 0.5 s window — where the noise floor shows."""
    hf_loss_db: float
    """Measured 5-14 kHz energy change, original vs vinyl (negative = loss)."""
    stereo_width_rms: float
    """RMS of (L-R)/2 relative to (L+R)/2 — 0 for mono uploads."""


def analyze(
    original: np.ndarray,
    vinyl: np.ndarray,
    sample_rate: int,
) -> TrackObservations:
    """Measure the observations the Explorer copy references."""
    mono_orig = original.mean(axis=1).astype(np.float64)
    mono_vinyl = vinyl.mean(axis=1).astype(np.float64)
    n = mono_orig.shape[0]

    # Brightest moment: envelope of the >5 kHz band. uniform_filter1d is an
    # O(n) running mean — a plain np.convolve here is O(n*win) and was
    # measured at ~80 s on a 10 s clip, so don't "simplify" this back.
    sos = sp_signal.butter(4, 5000.0, btype="high", fs=sample_rate, output="sos")
    hf = sp_signal.sosfilt(sos, mono_orig) ** 2
    win = max(int(0.05 * sample_rate), 1)
    hf_env = uniform_filter1d(hf, size=win, mode="nearest")
    brightest_s = float(np.argmax(hf_env)) / sample_rate

    # Loudest / quietest via 0.5 s RMS windows.
    win_rms = max(int(0.5 * sample_rate), 1)
    sq_env = uniform_filter1d(mono_orig**2, size=win_rms, mode="nearest")
    # Exclude the half-window edges where the average is padded with zeros.
    core = slice(win_rms // 2, max(n - win_rms // 2, win_rms // 2 + 1))
    loudest_s = (core.start + int(np.argmax(sq_env[core]))) / sample_rate
    quiet_idx = core.start + int(np.argmin(sq_env[core]))
    quietest_s = quiet_idx / sample_rate
    quietest_rms = 10.0 * math.log10(float(sq_env[quiet_idx]) + 1e-20)

    hf_loss = band_energy_db(mono_vinyl, sample_rate, 5000.0, 14000.0) - band_energy_db(
        mono_orig, sample_rate, 5000.0, 14000.0
    )

    if original.shape[1] > 1:
        side = (original[:, 0] - original[:, 1]) * 0.5
        mid = (original[:, 0] + original[:, 1]) * 0.5
        width = float(np.sqrt(np.mean(side**2)) / max(np.sqrt(np.mean(mid**2)), 1e-12))
    else:
        width = 0.0

    return TrackObservations(
        brightest_moment_s=brightest_s,
        loudest_moment_s=float(loudest_s),
        quietest_rms_dbfs=float(quietest_rms),
        quietest_moment_s=float(quietest_s),
        hf_loss_db=float(hf_loss),
        stereo_width_rms=width,
    )
