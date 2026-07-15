"""Arc-length -> time remapping through an imperfect turntable (wow & flutter).

Physics: the platter never spins at exactly 33 1/3 RPM. Two periodicities
dominate: *wow* at the revolution rate (~0.556 Hz), caused mostly by the
record's spindle hole being punched slightly off-center — the groove radius
seen by the stylus breathes once per turn; and *flutter* at tens of Hz from
motor cogging / belt tooth engagement. Both are literally speed variations,
so we model them as exactly that: the playback clock

    omega(t) = OMEGA * (1 + d_w sin(2 pi f_w t + p_w) + d_f sin(2 pi f_f t + p_f))

is integrated (in closed form — the integral of a sine is a cosine) to get the
true angular position, converted to arc position through the same spiral
closed form used at cutting time, and the groove displacement is sampled
there. Pitch wobble then *emerges* from reading the groove at a varying rate,
rather than being painted on with a pitch-shifter LFO — which also means it
automatically interacts correctly with every spatial effect upstream.

This stage is also where the simulation returns from the spatial domain to
the time domain even when wow/flutter is disabled (depths = 0 gives the ideal
constant-speed remap).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from app.dsp.constants import (
    FLUTTER_DEPTH,
    FLUTTER_RATE_HZ,
    OMEGA,
    WOW_DEPTH,
    WOW_RATE_HZ,
)
from app.dsp.cutting.spatial_map import SpiralMap


@dataclass(frozen=True)
class WowFlutterResult:
    lateral: np.ndarray
    vertical: np.ndarray
    peak_deviation_pct: float
    peak_deviation_cents: float


def _integrated_phase(t: np.ndarray, depth: float, rate_hz: float, phase: float) -> np.ndarray:
    """Closed-form integral of OMEGA*depth*sin(2 pi rate t + phase), zero at t=0."""
    w = 2.0 * math.pi * rate_hz
    return OMEGA * depth * (np.cos(phase) - np.cos(w * t + phase)) / w


def process(
    lateral_s: np.ndarray,
    vertical_s: np.ndarray,
    spiral: SpiralMap,
    depth_scale: float = 1.0,
) -> WowFlutterResult:
    """Sample the spatial groove signals at the imperfect playback position.

    `depth_scale` = 0 disables the stage (ideal turntable); 1 is a realistic
    mid-tier deck; larger values exaggerate for teaching.
    """
    t = spiral.t  # transient O(n) allocation, freed on return
    d_w = WOW_DEPTH * depth_scale
    d_f = FLUTTER_DEPTH * depth_scale

    # True angular position: nominal ramp + integrated speed deviations.
    # (from_spatial clamps any boundary overshoot to the recorded groove.)
    theta_play = (
        OMEGA * t
        + _integrated_phase(t, d_w, WOW_RATE_HZ, phase=0.35)
        + _integrated_phase(t, d_f, FLUTTER_RATE_HZ, phase=1.7)
    )
    lateral_t = spiral.from_spatial(lateral_s, theta_play)
    vertical_t = spiral.from_spatial(vertical_s, theta_play)

    peak_dev = d_w + d_f
    return WowFlutterResult(
        lateral=lateral_t,
        vertical=vertical_t,
        peak_deviation_pct=100.0 * peak_dev,
        # 1200 * log2(1 + d) cents of pitch deviation at the extreme.
        peak_deviation_cents=1200.0 * math.log2(1.0 + peak_dev) if peak_dev > 0 else 0.0,
    )
