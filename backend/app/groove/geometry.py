"""Turn the simulated groove into renderable geometry arrays.

The visualizer does not get a separate 'artistic' groove: it renders the same
x_lateral(s), x_vertical(s) arrays the audio pipeline produced *after* the
groove-medium stages, so what the user sees engraved is exactly what the
stylus will read (DESIGN.md 11.4 — the render must not show detail the audio
already lost, or vice versa).

Decimation is band-limited (polyphase resampling with an anti-aliasing FIR,
scipy.signal.resample_poly), never naive striding: dropping spatial samples
without filtering would alias short-wavelength content into fake large-scale
wiggle — an actively misleading picture for a tool whose whole point is
letting users *inspect* the groove.

Arrays are returned in float32, ready to be concatenated into one binary
payload; the frontend reconstructs 3D positions from (theta, r, lateral,
vertical) itself so the wire format stays compact and exaggeration can be a
client-side slider (no re-request when the user cranks 'magnification').
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import signal as sp_signal

from app.dsp.cutting.spatial_map import SpiralMap

TARGET_POINTS = 30_000
"""Cross-section budget: high enough that a 10 s groove keeps audible-scale
wiggle visible, low enough for smooth orbiting on integrated GPUs."""


@dataclass(frozen=True)
class GrooveGeometry:
    theta: np.ndarray     # cutting angle per point (rad), float32
    radius: np.ndarray    # groove centerline radius (m), float32
    lateral: np.ndarray   # lateral wall displacement (m), float32
    vertical: np.ndarray  # vertical displacement (m), float32
    time_s: np.ndarray    # nominal playback time per point (s), float32
    peak_excursion_um: float
    groove_length_m: float
    revolutions: float

    def as_binary(self) -> bytes:
        """Concatenate all arrays into one little-endian float32 blob."""
        return b"".join(
            np.ascontiguousarray(a, dtype="<f4").tobytes()
            for a in (self.theta, self.radius, self.lateral, self.vertical, self.time_s)
        )

    @property
    def n_points(self) -> int:
        return int(self.theta.shape[0])


def build(
    lateral_s: np.ndarray,
    vertical_s: np.ndarray,
    spiral: SpiralMap,
    target_points: int = TARGET_POINTS,
) -> GrooveGeometry:
    """Band-limit and decimate the spatial groove signals into geometry."""
    n = lateral_s.shape[0]
    factor = max(n // target_points, 1)

    if factor > 1:
        lat = sp_signal.resample_poly(lateral_s, up=1, down=factor)
        vert = sp_signal.resample_poly(vertical_s, up=1, down=factor)
    else:
        lat, vert = lateral_s.copy(), vertical_s.copy()

    m = lat.shape[0]
    # Arc positions of the decimated points, then closed-form maps to
    # angle / radius / nominal playback time.
    s_points = np.arange(m, dtype=np.float64) * (spiral.ds * factor)
    np.clip(s_points, 0.0, spiral.s_total, out=s_points)
    t_points = spiral.t_of_s(s_points)
    from app.dsp.cutting.spatial_map import radius_of_theta, theta_of_s

    theta_points = np.asarray(theta_of_s(s_points, spiral.start_radius_m))
    r_points = np.asarray(radius_of_theta(theta_points, spiral.start_radius_m))

    peak_um = float(np.max(np.sqrt(lat * lat + vert * vert))) * 1e6

    return GrooveGeometry(
        theta=theta_points.astype(np.float32),
        radius=r_points.astype(np.float32),
        lateral=lat.astype(np.float32),
        vertical=vert.astype(np.float32),
        time_s=np.asarray(t_points).astype(np.float32),
        peak_excursion_um=peak_um,
        groove_length_m=spiral.s_total,
        revolutions=float(spiral.theta_total / (2.0 * np.pi)),
    )
