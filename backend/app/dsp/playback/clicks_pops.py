"""Clicks & pops — groove defects kicking the cantilever.

Physics: dust, micro-scratches, and pressing voids sit *on the groove*, i.e.
they are distributed over physical groove length, not over playback time. A
defect of a given size therefore produces a click whose *rate in time* equals
(defects per meter) x (groove speed in meters/second) — which means clicks are
actually slightly *less* frequent per second near the record's center, where
the groove moves slower. This contradicts the popular claim that 'inner
grooves are noisier with clicks'; the real inner-groove problem is tracing
loss (see stylus_contact.py). We model the honest version: defects are drawn
as a Poisson process over ARC LENGTH and mapped to playback times through the
spiral, so the physics-correct rate falls out automatically.

Each defect 'kicks' the stylus: the waveform of a click is not the defect
itself but the cantilever's own ~5 kHz mechanical resonance ringing for a few
milliseconds (resonant_impulse). Amplitudes are drawn log-normally (many tiny
ticks, occasional big pops) and each defect strikes the two groove walls
unequally, so clicks image randomly across the stereo field — as they do on a
real record. Clicks are injected into the *velocity* signal before RIAA
de-emphasis, so the preamp's treble cut shapes them exactly as it does on
real playback.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import signal as sp_signal

from app.dsp.constants import (
    CARTRIDGE_RESONANCE_HZ,
    CARTRIDGE_RESONANCE_Q,
    CLICK_DENSITY_PER_M,
)
from app.dsp.cutting.spatial_map import SpiralMap
from app.dsp.filters import resonant_impulse

# Log-normal amplitude distribution for defect severity, relative to full
# Intentionally worn-record default: many audible ticks and occasional pops.
_AMP_MEDIAN = 0.025
_AMP_SIGMA = 1.25


@dataclass(frozen=True)
class ClicksResult:
    left_add: np.ndarray
    right_add: np.ndarray
    click_count: int
    rate_start_hz: float
    rate_inner_hz: float
    """Rates reported for the Explorer: clicks/second at the clip's start
    radius vs. what the same disc would give at the innermost radius."""


def process(
    spiral: SpiralMap,
    sample_rate: int,
    rng: np.random.Generator,
    density_scale: float = 1.0,
) -> ClicksResult:
    """Generate additive click signals for the left/right velocity channels."""
    from app.dsp.constants import INNER_RADIUS_M, OMEGA  # local: avoid cycle noise

    density = CLICK_DENSITY_PER_M * density_scale
    n = spiral.n_samples

    expected = density * spiral.s_total
    count = int(rng.poisson(expected)) if expected > 0 else 0

    left = np.zeros(n, dtype=np.float64)
    right = np.zeros(n, dtype=np.float64)

    if count > 0:
        # Uniform over groove length (the physical claim), then mapped to time.
        s_events = rng.uniform(0.0, spiral.s_total, size=count)
        t_events = np.asarray(spiral.t_of_s(s_events))
        idx = np.clip((t_events * sample_rate).astype(np.int64), 0, n - 1)

        amps = _AMP_MEDIAN * np.exp(_AMP_SIGMA * rng.standard_normal(count))
        amps *= rng.choice([-1.0, 1.0], size=count)  # random polarity
        # Unequal strike on the two walls -> random stereo placement.
        wall = rng.uniform(0.0, 1.0, size=count)

        np.add.at(left, idx, amps * wall)
        np.add.at(right, idx, amps * (1.0 - wall))

        ir = resonant_impulse(sample_rate, CARTRIDGE_RESONANCE_HZ, CARTRIDGE_RESONANCE_Q)
        left = sp_signal.fftconvolve(left, ir)[:n]
        right = sp_signal.fftconvolve(right, ir)[:n]

    return ClicksResult(
        left_add=left,
        right_add=right,
        click_count=count,
        rate_start_hz=density * OMEGA * spiral.start_radius_m,
        rate_inner_hz=density * OMEGA * INNER_RADIUS_M,
    )
