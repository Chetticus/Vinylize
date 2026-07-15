"""API contract tests via FastAPI's TestClient."""

from __future__ import annotations

import io

import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _wav_bytes(seconds: float = 2.0, sr: int = 22_050) -> bytes:
    t = np.arange(int(seconds * sr)) / sr
    x = 0.4 * np.sin(2 * np.pi * 440 * t).astype(np.float32)
    buf = io.BytesIO()
    sf.write(buf, x, sr, format="WAV")
    return buf.getvalue()


def test_analyze_then_process_then_buffers() -> None:
    r = client.post("/api/analyze", files={"file": ("tone.wav", _wav_bytes(), "audio/wav")})
    assert r.status_code == 200
    body = r.json()
    assert body["sample_rate"] == 22_050
    assert body["is_stereo"] is False
    assert len(body["waveform"]["mins"]) > 100

    r2 = client.post("/api/process", json={"session_id": body["session_id"]})
    assert r2.status_code == 200
    p = r2.json()
    assert p["geometry"]["n_points"] > 1000
    assert len(p["cards"]) == 7

    for url in (p["vinyl_url"], p["original_url"], p["geometry_url"]):
        rb = client.get(url)
        assert rb.status_code == 200
        assert len(rb.content) > 1000

    # Geometry blob: five float32 arrays of n_points each.
    geo = client.get(p["geometry_url"]).content
    assert len(geo) == p["geometry"]["n_points"] * 5 * 4


def test_rejects_garbage_upload() -> None:
    r = client.post("/api/analyze", files={"file": ("x.wav", b"not audio at all", "audio/wav")})
    assert r.status_code == 400


def test_demo_endpoint() -> None:
    r = client.post("/api/demo")
    assert r.status_code == 200
    assert r.json()["is_stereo"] is True


def test_unknown_session_404() -> None:
    r = client.post("/api/process", json={"session_id": "nope"})
    assert r.status_code == 404
