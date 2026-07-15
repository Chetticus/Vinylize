"""End-to-end pipeline behavior: transparency, physics direction, and speed."""

from __future__ import annotations

import time

import numpy as np
import pytest

from app.dsp.constants import INNER_RADIUS_M, OUTER_RADIUS_M
from app.dsp.filters import band_energy_db
from app.dsp.pipeline import PipelineConfig, run
from tests.conftest import SAMPLE_RATE

_ALL_OFF = dict(
    riaa=True,  # RIAA stays on: pre*de is exactly identity (test_riaa proves it)
    stylus=False,
    compliance=False,
    wow_flutter=False,
    clicks=False,
    crosstalk=False,
    noise=False,
)


def test_everything_disabled_is_near_transparent(multitone: np.ndarray) -> None:
    """With all physical stages off, the full chain (RIAA -> integrate ->
    space -> time -> differentiate -> RIAA^-1) must return the input almost
    unchanged. This bounds the numeric floor under every audible effect."""
    result = run(multitone, SAMPLE_RATE, PipelineConfig(**_ALL_OFF))
    x = multitone.astype(np.float64)
    y = result.vinyl.astype(np.float64)
    skip = 4096  # filter + integrator settle-in
    err_rms = np.sqrt(np.mean((x[skip:] - y[skip:]) ** 2))
    sig_rms = np.sqrt(np.mean(x[skip:] ** 2))
    assert err_rms / sig_rms < 0.05


def test_inner_radius_loses_more_treble(multitone: np.ndarray) -> None:
    """The core physics claim: same audio + same stylus = more HF loss at the
    inner radius, with no radius-conditional code anywhere in the stages."""
    cfg_outer = PipelineConfig(**{**_ALL_OFF, "stylus": True},
                               start_radius_mm=OUTER_RADIUS_M * 1000)
    cfg_inner = PipelineConfig(**{**_ALL_OFF, "stylus": True},
                               start_radius_mm=INNER_RADIUS_M * 1000 + 3)
    out_outer = run(multitone, SAMPLE_RATE, cfg_outer).vinyl.mean(axis=1)
    out_inner = run(multitone, SAMPLE_RATE, cfg_inner).vinyl.mean(axis=1)

    hf_outer = band_energy_db(out_outer, SAMPLE_RATE, 5000, 11000)
    hf_inner = band_energy_db(out_inner, SAMPLE_RATE, 5000, 11000)
    assert hf_inner < hf_outer - 1.0  # clearly more loss inside


def test_mono_input_produces_flat_vertical_groove() -> None:
    """A mono groove only wiggles laterally — the 3D view must show that."""
    n = 2 * SAMPLE_RATE
    t = np.arange(n) / SAMPLE_RATE
    mono = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)[:, None]
    result = run(mono, SAMPLE_RATE, PipelineConfig(**_ALL_OFF))
    lat_peak = float(np.max(np.abs(result.geometry.lateral)))
    vert_peak = float(np.max(np.abs(result.geometry.vertical)))
    assert vert_peak < lat_peak * 1e-6


def test_clicks_are_deterministic_per_seed(multitone: np.ndarray) -> None:
    cfg = PipelineConfig(**{**_ALL_OFF, "clicks": True}, seed=7)
    a = run(multitone, SAMPLE_RATE, cfg).vinyl
    b = run(multitone, SAMPLE_RATE, cfg).vinyl
    assert np.array_equal(a, b)


def test_geometry_budget_and_units(multitone: np.ndarray) -> None:
    result = run(multitone, SAMPLE_RATE, PipelineConfig())
    geo = result.geometry
    assert geo.n_points <= 60_000
    # Physical sanity: excursion should be micrometers, not meters or nothing.
    assert 0.1 < geo.peak_excursion_um < 200.0


def test_pipeline_speed_budget(multitone: np.ndarray) -> None:
    """The synchronous-request architecture depends on this staying fast."""
    start = time.perf_counter()
    run(multitone, SAMPLE_RATE, PipelineConfig())
    elapsed = time.perf_counter() - start
    assert elapsed < 5.0, f"pipeline took {elapsed:.2f}s on a 5 s clip"
