"""API routes: analyze (upload), process (simulate), and binary buffers.

The DSP is synchronous CPU-bound NumPy; handlers push it to the thread pool
(`run_in_threadpool`) so it never blocks the async event loop. Audio is
returned as WAV (the browser's decodeAudioData handles it natively); groove
geometry is returned as one raw little-endian float32 blob described by
GeometryMeta — sending hundreds of thousands of floats as JSON would bloat
the payload ~4x and stall the client in JSON.parse.
"""

from __future__ import annotations

import io

import soundfile as sf
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from app.api import schemas
from app.api.sessions import Session, store
from app.audio.demo import synthesize_demo
from app.audio.ingestion import AudioIngestError, DecodedAudio, decode_upload
from app.audio.waveform import peak_decimate
from app.dsp.constants import GROOVE_HALF_WIDTH_M, GROOVE_PITCH_M
from app.dsp.pipeline import PipelineConfig, PipelineResult, run as run_pipeline
from app.explain.metrics import analyze as analyze_track
from app.explain.registry import build_cards

router = APIRouter(prefix="/api")


def _analyze_response(session: Session) -> schemas.AnalyzeResponse:
    audio = session.audio
    mins, maxs = peak_decimate(audio.samples.mean(axis=1))
    return schemas.AnalyzeResponse(
        session_id=session.session_id,
        sample_rate=audio.sample_rate,
        n_channels=audio.n_channels,
        is_stereo=audio.is_stereo,
        full_duration_s=audio.full_duration_s,
        clip_duration_s=audio.clip_duration_s,
        waveform=schemas.WaveformData(mins=mins, maxs=maxs),
        filename=session.filename,
    )


@router.post("/analyze", response_model=schemas.AnalyzeResponse)
async def analyze(file: UploadFile = File(...)) -> schemas.AnalyzeResponse:
    """Decode an upload, cap it to the clip length, return display metadata."""
    data = await file.read()
    try:
        audio: DecodedAudio = await run_in_threadpool(decode_upload, data)
    except AudioIngestError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    session = store.create(audio, filename=file.filename or "upload")
    return _analyze_response(session)


@router.post("/demo", response_model=schemas.AnalyzeResponse)
async def demo() -> schemas.AnalyzeResponse:
    """Create a session from the built-in synthesized demo loop."""
    audio = await run_in_threadpool(synthesize_demo)
    session = store.create(audio, filename="demo-groove.wav (synthesized)")
    return _analyze_response(session)


def _to_wav(samples, sample_rate: int) -> bytes:
    """16-bit PCM WAV: half the bytes of float32 with headroom to spare —
    the simulated noise floor sits ~40 dB above 16-bit quantization, and a
    3-minute stereo clip is ~30 MB instead of ~60 MB to transfer + decode."""
    buf = io.BytesIO()
    sf.write(buf, samples, sample_rate, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def _process_sync(session: Session, req: schemas.ProcessRequest) -> schemas.ProcessResponse:
    config = PipelineConfig(
        riaa=req.riaa,
        stylus=req.stylus,
        compliance=req.compliance,
        wow_flutter=req.wow_flutter,
        clicks=req.clicks,
        crosstalk=req.crosstalk,
        noise=req.noise,
        start_radius_mm=req.start_radius_mm,
        stylus_size=req.stylus_size,
        saturation_drive=req.saturation_drive,
        wow_depth=req.wow_depth,
        click_density=req.click_density,
        crosstalk_amount=req.crosstalk_amount,
        noise_level=req.noise_level,
        seed=req.seed,
    )
    def report(frac: float, label: str) -> None:
        # Pipeline stages span 0–80% of the bar; encode/measure fill the rest.
        session.progress_frac = 0.8 * frac
        session.progress_label = label

    audio = session.audio
    session.progress_frac, session.progress_label = 0.0, "Starting"
    result: PipelineResult = run_pipeline(
        audio.samples, audio.sample_rate, config, progress=report
    )

    # Use the pipeline's *effective* placement (long clips get clamped
    # outward so they physically fit the program area) — the Explorer and
    # the 3D view must describe the disc as cut, not as requested.
    session.progress_frac, session.progress_label = 0.82, "Measuring your track"
    obs = analyze_track(audio.samples, result.vinyl, audio.sample_rate)
    cards = build_cards(
        result.stage_metrics,
        obs,
        start_radius_mm=result.start_radius_mm,
        stylus_size=req.stylus_size,
        is_stereo=audio.is_stereo,
    )

    # Hand the retained groove to the inspection endpoint (replaces any
    # previous config's arrays — the microscope always shows the last render).
    session.detail_lateral = result.detail_lateral
    session.detail_vertical = result.detail_vertical
    session.detail_ds_m = result.detail_ds_m
    session.detail_start_radius_m = result.start_radius_mm / 1000.0

    session.progress_frac, session.progress_label = 0.9, "Encoding audio"
    session.vinyl_wav = _to_wav(result.vinyl, audio.sample_rate)
    session.original_wav = _to_wav(audio.samples, audio.sample_rate)
    session.geometry_bin = result.geometry.as_binary()
    session.progress_frac, session.progress_label = 1.0, "Done"

    sid = session.session_id
    return schemas.ProcessResponse(
        session_id=sid,
        geometry=schemas.GeometryMeta(
            n_points=result.geometry.n_points,
            peak_excursion_um=result.geometry.peak_excursion_um,
            groove_length_m=result.geometry.groove_length_m,
            revolutions=result.geometry.revolutions,
            start_radius_mm=result.start_radius_mm,
            groove_pitch_um=GROOVE_PITCH_M * 1e6,
            groove_half_width_um=GROOVE_HALF_WIDTH_M * 1e6,
        ),
        cards=[schemas.ExplorerCardModel(**card.__dict__) for card in cards],
        vinyl_url=f"/api/session/{sid}/vinyl.wav",
        original_url=f"/api/session/{sid}/original.wav",
        geometry_url=f"/api/session/{sid}/geometry.bin",
    )


@router.post("/process", response_model=schemas.ProcessResponse)
async def process(req: schemas.ProcessRequest) -> schemas.ProcessResponse:
    """Run the vinyl pipeline with the given stage configuration."""
    session = store.get(req.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Unknown or expired session.")
    return await run_in_threadpool(_process_sync, session, req)


@router.get("/session/{session_id}/progress")
async def progress(session_id: str) -> dict[str, float | str]:
    """Live render progress for the session's in-flight /process call."""
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Unknown or expired session.")
    return {"frac": session.progress_frac, "label": session.progress_label}


def _serve_bytes(data: bytes | None, media_type: str) -> Response:
    if data is None:
        raise HTTPException(status_code=404, detail="Not processed yet.")
    return Response(content=data, media_type=media_type)


@router.get("/session/{session_id}/vinyl.wav")
async def vinyl_wav(session_id: str) -> Response:
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Unknown or expired session.")
    return _serve_bytes(session.vinyl_wav, "audio/wav")


@router.get("/session/{session_id}/original.wav")
async def original_wav(session_id: str) -> Response:
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Unknown or expired session.")
    return _serve_bytes(session.original_wav, "audio/wav")


@router.get("/session/{session_id}/geometry.bin")
async def geometry_bin(session_id: str) -> Response:
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Unknown or expired session.")
    return _serve_bytes(session.geometry_bin, "application/octet-stream")
