"""Local groove windows for the frontend microscope.

The 3D inspector never receives the whole retained groove (up to 3M samples
per channel); it asks for a short arc-length window around a playback time:

    "give me ~80 mm of groove centered where the stylus is at t = 41.3 s"

and gets back a compact binary: an 8-float header followed by the lateral and
vertical wall displacements in millimeters. The window is band-limited down
to `max_points` samples (resample_poly, never striding — striding would alias
high-frequency groove detail into fake large-scale wiggle, exactly what an
inspection tool must not fabricate).

Payload layout (little-endian float32):

    [ n, ds_mm, s0_mm, t0_s, r_center_mm, pitch_mm, turn_period_s, duration_s ]
    lateral_mm[n]
    vertical_mm[n]

`t0_s` is the nominal playback time of the window's first sample, so the
client can align adjacent-turn windows (the same groove one revolution —
`turn_period_s` — earlier/later) without re-deriving spiral math.
"""

from __future__ import annotations

import math

import numpy as np
from scipy.signal import resample_poly

from app.dsp.constants import GROOVE_PITCH_M, OMEGA
from app.dsp.cutting.spatial_map import radius_of_theta, s_of_theta, theta_of_s

HEADER_FLOATS = 8
TURN_PERIOD_S = 2.0 * math.pi / OMEGA  # one revolution at 33 1/3 RPM (~1.8 s)


def extract_window(
    lateral_m: np.ndarray,
    vertical_m: np.ndarray,
    ds_m: float,
    start_radius_m: float,
    t_center_s: float,
    span_mm: float = 80.0,
    max_points: int = 2000,
) -> bytes:
    """Slice + band-limit a groove window around playback time `t_center_s`."""
    n_total = int(lateral_m.shape[0])
    s_total = n_total * ds_m
    duration_s = float(theta_of_s(s_total, start_radius_m)) / OMEGA

    t = float(np.clip(t_center_s, 0.0, duration_s))
    s_center = float(s_of_theta(OMEGA * t, start_radius_m))

    span_m = max(span_mm, 1.0) / 1000.0
    span_m = min(span_m, s_total)
    s0 = float(np.clip(s_center - span_m / 2.0, 0.0, s_total - span_m))
    i0 = int(s0 / ds_m)
    i1 = min(i0 + int(span_m / ds_m), n_total)

    lat = lateral_m[i0:i1]
    vert = vertical_m[i0:i1]
    ds_out = ds_m

    factor = max(1, -(-lat.shape[0] // max_points))  # ceil division
    if factor > 1:
        lat = resample_poly(lat, 1, factor)
        vert = resample_poly(vert, 1, factor)
        ds_out = ds_m * factor

    n = int(lat.shape[0])
    s0_actual = i0 * ds_m
    theta0 = float(theta_of_s(s0_actual, start_radius_m))
    r_center = float(radius_of_theta(theta_of_s(s_center, start_radius_m), start_radius_m))

    header = np.array(
        [
            n,
            ds_out * 1000.0,
            s0_actual * 1000.0,
            theta0 / OMEGA,
            r_center * 1000.0,
            GROOVE_PITCH_M * 1000.0,
            TURN_PERIOD_S,
            duration_s,
        ],
        dtype="<f4",
    )
    return (
        header.tobytes()
        + np.ascontiguousarray(lat * 1000.0, dtype="<f4").tobytes()
        + np.ascontiguousarray(vert * 1000.0, dtype="<f4").tobytes()
    )
