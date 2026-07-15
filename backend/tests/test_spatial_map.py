"""Spiral geometry and the time <-> arc-length round trip.

The round-trip test is the load-bearing one for the whole architecture (see
DESIGN.md 11.1): with every groove-medium stage disabled, going time -> space
-> time must be near-transparent, or every physical effect measured later
would be contaminated by resampling artifacts.
"""

from __future__ import annotations

import numpy as np

from app.dsp.constants import INNER_RADIUS_M, OMEGA, OUTER_RADIUS_M
from app.dsp.cutting.spatial_map import SpiralMap, radius_of_theta, s_of_theta, theta_of_s
from tests.conftest import SAMPLE_RATE


def test_theta_s_maps_are_inverse() -> None:
    theta = np.linspace(0.0, 200.0, 1000)
    s = s_of_theta(theta, OUTER_RADIUS_M)
    theta_back = theta_of_s(s, OUTER_RADIUS_M)
    assert np.max(np.abs(theta - theta_back)) < 1e-9


def test_groove_speed_ratio() -> None:
    """The 2.4x outer/inner speed ratio everything else derives from."""
    ratio = (OMEGA * OUTER_RADIUS_M) / (OMEGA * INNER_RADIUS_M)
    assert 2.4 < ratio < 2.44


def test_long_clip_start_radius_is_clamped_outward() -> None:
    """A 60 s clip travels ~8.3 mm inward; asking to start at the innermost
    program radius must clamp the placement outward so the clip still fits,
    never run past the label or raise."""
    spiral = SpiralMap(
        n_samples=60 * SAMPLE_RATE,
        sample_rate=SAMPLE_RATE,
        start_radius_m=INNER_RADIUS_M + 0.002,
    )
    assert spiral.start_radius_m > INNER_RADIUS_M + 0.008
    assert float(spiral.r_t[-1]) >= INNER_RADIUS_M


def test_radius_decreases_monotonically() -> None:
    spiral = SpiralMap(n_samples=5 * SAMPLE_RATE, sample_rate=SAMPLE_RATE)
    assert np.all(np.diff(spiral.r_t) < 0)
    assert np.all(np.diff(spiral.s_t) > 0)


def test_spatial_round_trip_is_near_transparent(multitone: np.ndarray) -> None:
    """time -> arc-length -> time with an ideal turntable ~= identity.

    Tolerance: 2x spatial oversampling + cubic interpolation both ways keeps
    the round trip under 2% relative RMS error over the multitone
    (100 Hz - 10 kHz) — the bound every audible effect sits on top of.
    """
    x = multitone[:, 0].astype(np.float64)
    spiral = SpiralMap(n_samples=x.shape[0], sample_rate=SAMPLE_RATE)

    x_s = spiral.to_spatial(x)
    # Ideal playback: theta_play=None samples at the nominal positions.
    x_back = spiral.from_spatial(x_s).astype(np.float64)

    skip = 512
    err_rms = np.sqrt(np.mean((x[skip:] - x_back[skip:]) ** 2))
    sig_rms = np.sqrt(np.mean(x[skip:] ** 2))
    assert err_rms / sig_rms < 0.02
