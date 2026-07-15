"""The vinyl pipeline: cutting -> groove medium -> playback.

Mirrors the real signal chain (DESIGN.md 4.1). Phase A prepares the groove
(RIAA pre-emphasis, mid/side encode, integrate velocity to displacement, remap
time -> arc length). Phase B applies the physical medium in the SPATIAL domain
(stylus contact patch, compliance saturation) — fixed-size physical effects
become fixed-width spatial kernels there, which is what makes inner-groove
degradation emerge instead of being hand-tuned. Phase C plays the groove back
through an imperfect turntable (wow/flutter remap to time, clicks, crosstalk,
surface noise, RIAA de-emphasis).

Every stage is independently toggleable; the groove geometry handed to the 3D
visualizer is captured at the end of Phase B, so toggling a groove-medium
stage visibly changes the rendered groove as well as the audio.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

import numpy as np

from app.dsp.constants import (
    OUTER_RADIUS_M,
    PEAK_GROOVE_VELOCITY_MS,
    TONEARM_RESONANCE_HZ,
)
from app.dsp.cutting import mid_side, riaa
from app.dsp.cutting.spatial_map import SpiralMap
from app.dsp.filters import leaky_integrate, matched_differentiate
from app.dsp.groove_medium import compliance, stylus_contact
from app.dsp.playback import clicks_pops, crosstalk, surface_noise, wow_flutter
from app.groove.geometry import GrooveGeometry, build as build_geometry


@dataclass(frozen=True)
class PipelineConfig:
    """User-facing switches and scales (all scales are 1.0 = realistic)."""

    riaa: bool = True
    stylus: bool = True
    compliance: bool = True
    wow_flutter: bool = True
    clicks: bool = True
    crosstalk: bool = True
    noise: bool = True

    start_radius_mm: float = OUTER_RADIUS_M * 1000.0
    stylus_size: float = 1.0
    saturation_drive: float = 1.0
    wow_depth: float = 1.0
    click_density: float = 1.0
    crosstalk_amount: float = 1.0
    noise_level: float = 1.0
    seed: int = 1109


@dataclass
class PipelineResult:
    vinyl: np.ndarray                     # (n, 2) float32 in [-1, 1]
    geometry: GrooveGeometry
    start_radius_mm: float                # effective placement after clamping
    stage_metrics: dict[str, dict[str, float]] = field(default_factory=dict)


ProgressFn = Callable[[float, str], None]


def run(
    samples: np.ndarray,
    sample_rate: int,
    config: PipelineConfig,
    progress: ProgressFn | None = None,
) -> PipelineResult:
    """Run the full simulation on a decoded clip ((n, ch) float32).

    `progress` (fraction 0..1, label) is called at stage boundaries; the
    fractions are wall-clock weights measured on a 3-minute clip, so the UI
    bar moves roughly linearly in time.
    """
    rng = np.random.default_rng(config.seed)
    n = samples.shape[0]
    dt = 1.0 / sample_rate
    metrics: dict[str, dict[str, float]] = {}

    def report(frac: float, label: str) -> None:
        if progress is not None:
            progress(frac, label)

    # ------------------------------------------------------------------
    # Phase A — cutting
    # ------------------------------------------------------------------
    report(0.02, "RIAA pre-emphasis")
    # The RIAA IIR runs in float64 (2nd-order recursion wants the headroom);
    # everything downstream lives in float32 — at 3 minutes the time-domain
    # arrays alone are ~250 MB each in double, and float32's 1e-7 relative
    # precision is far below the simulated noise floor.
    emphasized = (
        riaa.pre_emphasis(samples.astype(np.float64), sample_rate) if config.riaa else samples
    ).astype(np.float32)
    if config.riaa:
        metrics["riaa"] = {
            "boost_at_10khz_db": riaa.pre_emphasis_gain_db(10_000.0, sample_rate),
            "cut_at_50hz_db": riaa.pre_emphasis_gain_db(50.0, sample_rate),
        }

    lateral_v, vertical_v = mid_side.encode(emphasized)  # audio-unit velocities
    # Calibrate to physical groove-wall velocity so every later number is in
    # honest units (a 0 dBFS sample cuts at PEAK_GROOVE_VELOCITY m/s).
    lateral_v *= PEAK_GROOVE_VELOCITY_MS
    vertical_v *= PEAK_GROOVE_VELOCITY_MS

    # Cutter head velocity -> groove displacement. The leak sits at the
    # tonearm resonance: reality's own high-pass doubles as drift control.
    lat_x_t = leaky_integrate(lateral_v, dt, TONEARM_RESONANCE_HZ)
    vert_x_t = leaky_integrate(vertical_v, dt, TONEARM_RESONANCE_HZ)

    report(0.10, "Engraving the spiral groove")
    spiral = SpiralMap(
        n_samples=n,
        sample_rate=sample_rate,
        start_radius_m=config.start_radius_mm / 1000.0,
    )
    lat_s = spiral.to_spatial(lat_x_t)
    del lat_x_t
    vert_s = spiral.to_spatial(vert_x_t)
    del vert_x_t

    # ------------------------------------------------------------------
    # Phase B — groove medium (spatial domain)
    # ------------------------------------------------------------------
    report(0.38, "Tracing with the stylus")
    if config.stylus:
        sty = stylus_contact.process(lat_s, vert_s, spiral.ds, tip_scale=config.stylus_size)
        lat_s, vert_s = sty.lateral, sty.vertical
        metrics["stylus"] = {
            "hf_detail_removed_rms_um": sty.hf_detail_removed_rms_m * 1e6,
        }

    report(0.52, "Compressing groove walls")
    if config.compliance:
        comp = compliance.process(
            lat_s,
            vert_s,
            spiral.ds,
            mean_groove_speed=spiral.v_mean,
            drive=config.saturation_drive,
        )
        lat_s, vert_s = comp.lateral, comp.vertical
        metrics["compliance"] = {
            "peak_slope": comp.peak_slope,
            "peak_compression_pct": comp.peak_compression_pct,
        }

    # The groove as physically engraved-and-worn: this is what gets rendered.
    report(0.62, "Building 3D geometry")
    geometry = build_geometry(lat_s, vert_s, spiral)

    # ------------------------------------------------------------------
    # Phase C — playback
    # ------------------------------------------------------------------
    report(0.72, "Playing back on the turntable")
    wf = wow_flutter.process(
        lat_s, vert_s, spiral,
        depth_scale=config.wow_depth if config.wow_flutter else 0.0,
    )
    del lat_s, vert_s  # free the big spatial grids as soon as playback has read them
    if config.wow_flutter:
        metrics["wow_flutter"] = {
            "peak_deviation_pct": wf.peak_deviation_pct,
            "peak_deviation_cents": wf.peak_deviation_cents,
        }

    # Cartridge: velocity transducer. Matched inverse of the cutting
    # integrator, then undo the physical calibration back to audio units.
    lat_out = matched_differentiate(wf.lateral, dt, TONEARM_RESONANCE_HZ) / PEAK_GROOVE_VELOCITY_MS
    vert_out = matched_differentiate(wf.vertical, dt, TONEARM_RESONANCE_HZ) / PEAK_GROOVE_VELOCITY_MS

    left, right = mid_side.decode(lat_out, vert_out)

    report(0.88, "Dust, noise & preamp")
    if config.clicks:
        cl = clicks_pops.process(spiral, sample_rate, rng, density_scale=config.click_density)
        left = left + cl.left_add
        right = right + cl.right_add
        metrics["clicks"] = {
            "click_count": float(cl.click_count),
            "rate_start_hz": cl.rate_start_hz,
            "rate_inner_hz": cl.rate_inner_hz,
        }

    if config.noise:
        nz = surface_noise.process(n, sample_rate, rng, level_scale=config.noise_level)
        left = left + nz.left_add
        right = right + nz.right_add
        metrics["noise"] = {"noise_floor_dbfs": nz.noise_floor_dbfs}

    if config.crosstalk:
        ct = crosstalk.process(left, right, sample_rate, amount_scale=config.crosstalk_amount)
        left, right = ct.left, ct.right
        metrics["crosstalk"] = {
            "separation_at_1khz_db": ct.separation_at_1khz_db,
            "separation_hf_db": ct.separation_hf_db,
        }

    vinyl = np.stack([left, right], axis=1)
    if config.riaa:
        vinyl = riaa.de_emphasis(vinyl, sample_rate)

    np.clip(vinyl, -1.0, 1.0, out=vinyl)
    return PipelineResult(
        vinyl=vinyl.astype(np.float32),
        geometry=geometry,
        start_radius_mm=spiral.start_radius_m * 1000.0,
        stage_metrics=metrics,
    )
