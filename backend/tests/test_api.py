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


def test_lead_in_prepended_and_synced() -> None:
    """Both renditions carry the 6 s silent lead-in: equal length, original
    silent at the start, vinyl carrying only surface noise there."""
    import numpy as np

    from app.dsp.constants import LEAD_IN_SECONDS

    r = client.post("/api/analyze", files={"file": ("tone.wav", _wav_bytes(2.0), "audio/wav")})
    body = r.json()
    p = client.post("/api/process", json={"session_id": body["session_id"]}).json()

    def decode(url: str) -> tuple[np.ndarray, int]:
        data, sr = sf.read(io.BytesIO(client.get(url).content), always_2d=True)
        return data, sr

    orig, sr = decode(p["original_url"])
    vinyl, _ = decode(p["vinyl_url"])
    n_lead = int(LEAD_IN_SECONDS * sr)

    assert orig.shape[0] == vinyl.shape[0]  # sample-locked A/B
    assert orig.shape[0] >= n_lead + int(1.9 * sr)  # clip + lead-in
    # Digital lead-in is dead silence…
    assert float(np.abs(orig[: n_lead - 100]).max()) == 0.0
    # …while the vinyl lead-in carries audible surface noise/clicks, but no
    # music-level signal.
    lead_rms = float(np.sqrt(np.mean(vinyl[sr : n_lead - sr] ** 2)))
    assert 1e-5 < lead_rms < 0.1
    # The music region is much louder than the lead-in on the vinyl side.
    music_rms = float(np.sqrt(np.mean(vinyl[n_lead + sr // 2 : n_lead + sr] ** 2)))
    assert music_rms > lead_rms * 3


def test_digital_preserves_decoded_source_samples() -> None:
    from app.audio.ingestion import decode_upload
    from app.dsp.constants import LEAD_IN_SECONDS

    rate = 22050
    t = np.arange(rate) / rate
    source = np.stack([0.217891 * np.sin(2 * np.pi * 330 * t),
                       0.197123 * np.sin(2 * np.pi * 550 * t)], axis=1).astype(np.float32)
    upload = io.BytesIO()
    sf.write(upload, source, rate, format="WAV", subtype="FLOAT")
    data = upload.getvalue()
    analyzed = client.post("/api/analyze", files={"file": ("source.wav", data, "audio/wav")}).json()
    result = client.post("/api/process", json={"session_id": analyzed["session_id"],
                                              "surface_sound": "codrops", "retain_detail": False}).json()
    digital, sample_rate = sf.read(io.BytesIO(client.get(result["original_url"]).content),
                                   dtype="float32", always_2d=True)
    assert sample_rate == rate
    n_lead = int(LEAD_IN_SECONDS * rate)
    np.testing.assert_array_equal(digital[n_lead:], decode_upload(data).samples)


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
