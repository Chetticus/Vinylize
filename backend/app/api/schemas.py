"""Pydantic request/response models — the typed contract with the frontend.

`frontend/src/types/api.ts` mirrors these shapes; if you change a field here,
change it there.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.dsp.constants import INNER_RADIUS_M, OUTER_RADIUS_M


class WaveformData(BaseModel):
    """Peak-decimated display waveform (min/max per bucket)."""

    mins: list[float]
    maxs: list[float]


class AnalyzeResponse(BaseModel):
    session_id: str
    sample_rate: int
    n_channels: int
    is_stereo: bool
    full_duration_s: float
    clip_duration_s: float
    waveform: WaveformData
    filename: str


class ProcessRequest(BaseModel):
    """Stage toggles and parameter scales; mirrors dsp.pipeline.PipelineConfig."""

    session_id: str

    riaa: bool = True
    stylus: bool = True
    compliance: bool = True
    wow_flutter: bool = True
    clicks: bool = True
    crosstalk: bool = True
    noise: bool = True

    # Defaults describe a mid-disc cut on a well-worn record rather than a
    # pristine pressing at the outer edge: at 1.0x-everything the differences
    # are real but easy to miss on laptop speakers. 1.0 on every scale is
    # still "measured reality" — the frontend labels this honestly.
    # (Long clips may be clamped outward so they fit the program area; the
    # response reports the effective radius.)
    start_radius_mm: float = Field(
        default=100.0,
        ge=INNER_RADIUS_M * 1000.0 + 2.0,
        le=OUTER_RADIUS_M * 1000.0,
        description="Where on the disc the clip is placed — the inner-groove experiment.",
    )
    stylus_size: float = Field(default=1.5, ge=0.25, le=4.0)
    saturation_drive: float = Field(default=2.0, ge=0.0, le=8.0)
    wow_depth: float = Field(default=2.5, ge=0.0, le=10.0)
    click_density: float = Field(default=3.0, ge=0.0, le=10.0)
    crosstalk_amount: float = Field(default=1.5, ge=0.0, le=10.0)
    noise_level: float = Field(default=3.0, ge=0.0, le=10.0)
    seed: int = 1109


class ExplorerCardModel(BaseModel):
    key: str
    title: str
    subtitle: str
    physics: str
    where_on_record: str
    why_unavoidable: str
    your_track: list[str]
    enabled: bool


class GeometryMeta(BaseModel):
    """Layout of the binary geometry payload: five consecutive float32 arrays
    of `n_points` each — theta, radius, lateral, vertical, time_s."""

    n_points: int
    peak_excursion_um: float
    groove_length_m: float
    revolutions: float
    start_radius_mm: float
    groove_pitch_um: float
    groove_half_width_um: float


class ProcessResponse(BaseModel):
    session_id: str
    geometry: GeometryMeta
    cards: list[ExplorerCardModel]
    vinyl_url: str
    original_url: str
    geometry_url: str


class ErrorResponse(BaseModel):
    detail: str
