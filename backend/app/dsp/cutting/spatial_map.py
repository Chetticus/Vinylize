"""Time <-> groove-arc-length mapping — the geometric core of the simulation.

The groove centerline is an Archimedean spiral:

    r(theta) = r_start - (pitch / 2*pi) * theta

Cutting happens at constant angular velocity OMEGA, so the lathe travels along
the groove at linear speed v(t) = OMEGA * r(theta(t)), which *shrinks* toward
the center. Arc length along the spiral has the closed form

    s(theta) = integral of r dtheta = r_start*theta - (pitch / 4*pi) * theta^2

which we can also invert analytically (quadratic in theta). Because both maps
are closed-form and monotonic over the program area, remapping a signal
between the time domain and the spatial (arc-length) domain reduces to
evaluating a cubic interpolant at analytically computed positions — no
numerical ODE integration and no stored coordinate tables.

Why this matters: any *fixed-size* physical interaction (a stylus tip is the
same micrometers wide everywhere on the disc) becomes a *fixed-width kernel in
the spatial domain*. Converted back to time, that same kernel automatically
degrades more audio bandwidth at the inner radius, because the slower groove
packs more temporal cycles into each millimeter. Inner-groove distortion and
inner-groove treble loss are therefore consequences of this map, not separate
hand-tuned effects.

Memory discipline (v0.3, for 3-minute clips): the spatial arrays run to ~16M
samples, so everything long-lived here is float32, the big diagnostic arrays
(t, r_t, v_t, s_t) are lazy properties allocated only if actually asked for
(tests do; the pipeline does not), and both remaps interpolate from *uniform*
grids so no coordinate array needs to be searched — positions become
fractional indices by closed-form arithmetic.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from scipy import signal as sp_signal

from app.dsp.constants import (
    GROOVE_PITCH_M,
    INNER_RADIUS_M,
    OMEGA,
    OUTER_RADIUS_M,
    SPATIAL_OVERSAMPLE,
)


def s_of_theta(theta: np.ndarray | float, r_start: float) -> np.ndarray | float:
    """Arc length traveled after `theta` radians of cutting (closed form)."""
    return r_start * theta - (GROOVE_PITCH_M / (4.0 * math.pi)) * np.square(theta)


def theta_of_s(s: np.ndarray | float, r_start: float) -> np.ndarray | float:
    """Inverse of s_of_theta on the program area (smaller quadratic root)."""
    k = GROOVE_PITCH_M / (2.0 * math.pi)
    disc = np.maximum(r_start * r_start - 2.0 * k * np.asarray(s, dtype=np.float64), 0.0)
    return (r_start - np.sqrt(disc)) / k


def radius_of_theta(theta: np.ndarray | float, r_start: float) -> np.ndarray | float:
    """Groove radius after `theta` radians of cutting."""
    return r_start - (GROOVE_PITCH_M / (2.0 * math.pi)) * theta


@dataclass
class SpiralMap:
    """Precomputed cutting geometry for one clip.

    `start_radius_m` is where the clip is placed on the disc — exposing this
    as a user control is what makes radius-dependent physics audible (the
    groove only travels ~8 mm inward per minute, so *placement* is the
    experiment). Long clips are clamped outward so they physically fit.
    """

    n_samples: int
    sample_rate: int
    start_radius_m: float = OUTER_RADIUS_M

    # Derived scalars (filled in __post_init__).
    dt: float = field(init=False)
    duration_s: float = field(init=False)
    theta_total: float = field(init=False)   # total cutting angle (rad)
    s_total: float = field(init=False)       # total groove length (m)
    v_min: float = field(init=False)         # slowest groove speed (m/s, at the end)
    v_mean: float = field(init=False)        # s_total / duration
    ds: float = field(init=False)            # spatial sample spacing (m)
    n_spatial: int = field(init=False)       # spatial grid length

    # Cached fractional-index table for to_spatial (shared by both channels).
    _query_idx: np.ndarray | None = field(init=False, default=None, repr=False)
    _upsample: int = field(init=False, default=int(SPATIAL_OVERSAMPLE), repr=False)

    def __post_init__(self) -> None:
        r_lo = INNER_RADIUS_M
        r_hi = OUTER_RADIUS_M

        self.dt = 1.0 / self.sample_rate
        self.duration_s = self.n_samples * self.dt
        self.theta_total = OMEGA * self.duration_s

        # Long clips travel meaningfully inward (~8.3 mm/minute at standard
        # pitch), so the *placement* must be clamped so the clip still fits:
        # start no lower than (inner limit + the clip's own radial travel).
        # A cutting engineer would refuse the same request for the same reason.
        radial_travel = (GROOVE_PITCH_M / (2.0 * math.pi)) * self.theta_total
        min_start = r_lo + radial_travel + 0.001
        if min_start > r_hi:
            raise ValueError(
                f"Clip needs {radial_travel * 1000:.1f} mm of radial travel — "
                "longer than the disc's whole program area."
            )
        self.start_radius_m = float(np.clip(self.start_radius_m, min_start, r_hi))

        self.s_total = float(s_of_theta(self.theta_total, self.start_radius_m))
        self.v_min = OMEGA * (self.start_radius_m - radial_travel)
        self.v_mean = self.s_total / self.duration_s

        # Spatial resolution: even at the *slowest* point of the clip the
        # groove is sampled SPATIAL_OVERSAMPLE times finer than one audio
        # sample's travel; cubic interpolation makes 2x sufficient (see
        # catmull_rom_uniform).
        self.ds = self.v_min / (self.sample_rate * SPATIAL_OVERSAMPLE)
        self.n_spatial = int(self.s_total / self.ds) + 1

    # ------------------------------------------------------------------
    # Domain remapping
    # ------------------------------------------------------------------

    def to_spatial(self, x_t: np.ndarray) -> np.ndarray:
        """Resample a time-domain signal onto the uniform arc-length grid.

        Band-limited 2x FIR upsampling first (interpolating straight off
        audio-rate samples is where naive resamplers lose the top octave),
        then cubic evaluation at the closed-form time of each groove position.
        Returns float32; the index table is computed once and shared between
        the lateral and vertical channels.
        """
        from app.dsp.filters import catmull_rom_uniform

        up = self._upsample
        if self._query_idx is None:
            s_positions = np.arange(self.n_spatial, dtype=np.float64) * self.ds
            t_query = np.asarray(theta_of_s(s_positions, self.start_radius_m)) / OMEGA
            self._query_idx = t_query * (self.sample_rate * up)

        x_fine = sp_signal.resample_poly(np.asarray(x_t, dtype=np.float32), up, 1)
        return catmull_rom_uniform(x_fine, self._query_idx)

    def from_spatial(self, x_s: np.ndarray, theta_play: np.ndarray | None = None) -> np.ndarray:
        """Sample the spatial signal back into the time domain.

        `theta_play` is the platter's angular trajectory; None means an ideal
        constant-speed turntable (wow_flutter passes the imperfect one). The
        spatial grid is uniform, so positions map to fractional indices by a
        single division — no search, no stored grid.
        """
        from app.dsp.filters import catmull_rom_uniform

        if theta_play is None:
            theta_play = OMEGA * np.arange(self.n_samples, dtype=np.float64) * self.dt
        s_play = np.asarray(s_of_theta(theta_play, self.start_radius_m))
        return catmull_rom_uniform(np.asarray(x_s, dtype=np.float32), s_play / self.ds)

    def t_of_s(self, s: np.ndarray) -> np.ndarray:
        """Nominal (ideal-speed) time at which arc position `s` is played."""
        return np.asarray(theta_of_s(s, self.start_radius_m)) / OMEGA

    def radius_of_s(self, s: np.ndarray) -> np.ndarray:
        """Groove radius at arc position `s`."""
        return np.asarray(
            radius_of_theta(theta_of_s(s, self.start_radius_m), self.start_radius_m)
        )

    # ------------------------------------------------------------------
    # Diagnostic arrays — O(n) allocations, used by tests/notebooks only
    # ------------------------------------------------------------------

    @property
    def t(self) -> np.ndarray:
        """Uniform time grid (s)."""
        return np.arange(self.n_samples, dtype=np.float64) * self.dt

    @property
    def theta_t(self) -> np.ndarray:
        """Cutting angle at each sample (rad)."""
        return OMEGA * self.t

    @property
    def r_t(self) -> np.ndarray:
        """Groove radius at each sample (m)."""
        return np.asarray(radius_of_theta(self.theta_t, self.start_radius_m))

    @property
    def v_t(self) -> np.ndarray:
        """Linear groove speed at each sample (m/s)."""
        return OMEGA * self.r_t

    @property
    def s_t(self) -> np.ndarray:
        """Arc-length position at each sample (m)."""
        return np.asarray(s_of_theta(self.theta_t, self.start_radius_m))
