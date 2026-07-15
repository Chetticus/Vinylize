"""Surface noise & rumble — the medium's noise floor.

Physics: even a brand-new record has a noise floor. Two distinct sources:

  1. *Surface noise*: the vinyl compound is not molecularly smooth — filler
     particles and molding texture make the groove wall microscopically rough.
     The cartridge reads that roughness as broadband noise whose measured
     power spectrum is close to pink (1/f). It enters the chain as groove
     velocity, BEFORE the preamp, so RIAA de-emphasis rolls off its top end —
     that post-filter shape is exactly the familiar 'vinyl hiss'.
  2. *Rumble*: bearing and motor vibration conducted through the platter into
     the stylus, concentrated below ~30 Hz. It is a property of the turntable,
     not the disc.

Deliberately NOT modeled: a radius-dependent noise level. Groove-wall
roughness per unit length is a material property and does not grow toward the
center; the honest driver of 'sounds worse inside' is tracing loss, not a
rising floor (see DESIGN.md 4.2). Left/right noise components are drawn
independently — wall roughness on the two groove faces is uncorrelated, which
is why real surface noise sits diffusely wide in the stereo image.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import signal as sp_signal

from app.dsp.constants import (
    RUMBLE_CUTOFF_HZ,
    RUMBLE_DBFS,
    SURFACE_NOISE_DBFS,
)
from app.dsp.filters import pink_noise


@dataclass(frozen=True)
class NoiseResult:
    left_add: np.ndarray
    right_add: np.ndarray
    noise_floor_dbfs: float


def process(
    n_samples: int,
    sample_rate: int,
    rng: np.random.Generator,
    level_scale: float = 1.0,
) -> NoiseResult:
    """Generate additive noise for the left/right velocity channels."""
    surface_amp = 10.0 ** (SURFACE_NOISE_DBFS / 20.0) * level_scale
    rumble_amp = 10.0 ** (RUMBLE_DBFS / 20.0) * level_scale

    # Independent pink noise per groove wall.
    hiss_l = pink_noise(n_samples, rng) * surface_amp
    hiss_r = pink_noise(n_samples, rng) * surface_amp

    # Rumble: one mechanical source (the bearing), so it is common to both
    # channels — mostly lateral motion, i.e. in-phase L/R.
    sos = sp_signal.butter(2, RUMBLE_CUTOFF_HZ, btype="low", fs=sample_rate, output="sos")
    rumble = sp_signal.sosfilt(sos, rng.standard_normal(n_samples))
    rms = float(np.sqrt(np.mean(rumble * rumble)))
    rumble = rumble / max(rms, 1e-12) * rumble_amp

    return NoiseResult(
        left_add=hiss_l + rumble,
        right_add=hiss_r + rumble,
        noise_floor_dbfs=SURFACE_NOISE_DBFS + 20.0 * np.log10(max(level_scale, 1e-9)),
    )
