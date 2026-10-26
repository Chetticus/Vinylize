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
from dataclasses import replace

import numpy as np
import soundfile as sf
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response

from app.api import schemas
from app.api.sessions import Session, store
from app.audio import examples
from app.audio.demo import synthesize_demo
from app.audio.ingestion import AudioIngestError, DecodedAudio, decode_upload
from app.audio.waveform import peak_decimate
from app.dsp.constants import GROOVE_HALF_WIDTH_M, GROOVE_PITCH_M, LEAD_IN_SECONDS, MAX_CLIP_SECONDS
from app.dsp.pipeline import PipelineConfig, PipelineResult, run as run_pipeline
from app.explain.metrics import analyze as analyze_track
from app.explain.registry import build_cards

router = APIRouter(prefix="/api")


def _retain_source(session: Session, data: bytes) -> None:
    """Reuse short stereo/mono MP3s verbatim; long/multichannel uploads use WAV.

    Browser MP3 decoding avoids transferring an expanded float WAV. The browser
    adds the same silent lead-in as Vinyl, without applying any audio effects.
    """
    info = sf.info(io.BytesIO(data))
    if (info.format == "MP3" and info.channels <= 2
            and session.audio.full_duration_s <= MAX_CLIP_SECONDS):
        session.source_mp3 = data


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
    _retain_source(session, data)
    return _analyze_response(session)


@router.post("/demo", response_model=schemas.AnalyzeResponse)
async def demo() -> schemas.AnalyzeResponse:
    """Create a session from the built-in synthesized demo loop."""
    audio = await run_in_threadpool(synthesize_demo)
    session = store.create(audio, filename="demo-groove.wav (synthesized)")
    return _analyze_response(session)


@router.get("/examples", response_model=list[schemas.ExampleRecord])
async def list_examples() -> list[schemas.ExampleRecord]:
    """Example records available to cut without an upload."""
    found = await run_in_threadpool(examples.available)
    return [
        schemas.ExampleRecord(id=ex.id, title=ex.title, artist=ex.artist, duration_s=dur)
        for ex, dur in found
    ]


@router.post("/examples/{example_id}", response_model=schemas.AnalyzeResponse)
async def load_example(example_id: str) -> schemas.AnalyzeResponse:
    """Create a session from one of the example records."""
    ex = examples.find(example_id)
    if ex is None or not (examples.examples_dir() / ex.file).is_file():
        raise HTTPException(status_code=404, detail="Unknown example record.")
    try:
        audio = await run_in_threadpool(examples.decode_example, ex)
    except AudioIngestError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    session = store.create(audio, filename=examples.display_name(ex))
    source = await run_in_threadpool((examples.examples_dir() / ex.file).read_bytes)
    _retain_source(session, source)
    return _analyze_response(session)


def _to_wav(samples, sample_rate: int, subtype: str = "PCM_16") -> bytes:
    """Compact PCM16 for noisy vinyl; FLOAT preserves decoded Digital samples."""
    buf = io.BytesIO()
    sf.write(buf, samples, sample_rate, format="WAV", subtype=subtype)
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
        surface_sound=req.surface_sound,
        retain_detail=req.retain_detail,
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

    # Cut a real silent lead-in ahead of the music: the stylus then rides
    # unmodulated groove — with its honest hiss/clicks/rumble — before the
    # first musical turn arrives, like a pressed record. The A/B original
    # gets the same silence below so both renditions stay sample-locked.
    n_lead = int(LEAD_IN_SECONDS * audio.sample_rate)
    padded = np.concatenate(
        [np.zeros((n_lead, audio.samples.shape[1]), dtype=np.float32), audio.samples]
    )

    result: PipelineResult = run_pipeline(padded, audio.sample_rate, config, progress=report)

    # Use the pipeline's *effective* placement (long clips get clamped
    # outward so they physically fit the program area) — the Explorer and
    # the 3D view must describe the disc as cut, not as requested.
    # Measurements run on the MUSIC region only (lead-in silence would poison
    # the quiet-passage and band-energy numbers); moment timestamps then
    # shift by the lead-in so they match the transport clock.
    session.progress_frac, session.progress_label = 0.82, "Measuring your track"
    obs = analyze_track(audio.samples, result.vinyl[n_lead:], audio.sample_rate)
    obs = replace(
        obs,
        brightest_moment_s=obs.brightest_moment_s + LEAD_IN_SECONDS,
        loudest_moment_s=obs.loudest_moment_s + LEAD_IN_SECONDS,
        quietest_moment_s=obs.quietest_moment_s + LEAD_IN_SECONDS,
    )
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
    # Compress the existing PCM16 samples losslessly for network playback.
    # Reading the WAV as int16 guarantees identical samples, not a second
    # float-to-integer conversion with potentially different rounding.
    pcm, _ = sf.read(io.BytesIO(session.vinyl_wav), dtype="int16", always_2d=True)
    compact = io.BytesIO()
    sf.write(compact, pcm, audio.sample_rate, format="FLAC", subtype="PCM_16")
    session.vinyl_flac = compact.getvalue()
    # Digital is the decoded source, not a new lossy/quantized rendition.
    # Only the shared lead-in silence is added for sample-aligned switching.
    session.original_wav = _to_wav(padded, audio.sample_rate, subtype="FLOAT")
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
        original_playback_url=f"/api/session/{sid}/source.mp3" if session.source_mp3 else None,
        vinyl_playback_url=f"/api/session/{sid}/vinyl.flac",
        original_lead_in_s=LEAD_IN_SECONDS if session.source_mp3 else 0.0,
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


@router.get("/session/{session_id}/source.mp3")
async def source_mp3(session_id: str) -> Response:
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Unknown or expired session.")
    return _serve_bytes(session.source_mp3, "audio/mpeg")


@router.get("/session/{session_id}/vinyl.flac")
async def vinyl_flac(session_id: str) -> Response:
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Unknown or expired session.")
    return _serve_bytes(session.vinyl_flac, "audio/flac")


@router.get("/session/{session_id}/geometry.bin")
async def geometry_bin(session_id: str) -> Response:
    session = store.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Unknown or expired session.")
    return _serve_bytes(session.geometry_bin, "application/octet-stream")
