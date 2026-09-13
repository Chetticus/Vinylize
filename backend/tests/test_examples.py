"""Example records: listing only what exists, loading one into a session."""

from __future__ import annotations

import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

from app.main import app


def test_examples_list_and_load(tmp_path, monkeypatch):
    monkeypatch.setenv("VINYLIZE_EXAMPLES_DIR", str(tmp_path))
    client = TestClient(app)

    # No files present -> nothing offered, unknown ids 404.
    assert client.get("/api/examples").json() == []
    assert client.post("/api/examples/stand-by-me").status_code == 404

    # A file for one catalogue entry -> exactly that entry, loadable.
    tone = 0.2 * np.sin(2 * np.pi * 440 * np.arange(44100 * 2) / 44100).astype(np.float32)
    sf.write(tmp_path / "stand-by-me.mp3", np.stack([tone, tone], axis=1), 44100, format="WAV")
    listed = client.get("/api/examples").json()
    assert [e["id"] for e in listed] == ["stand-by-me"]
    assert abs(listed[0]["duration_s"] - 2.0) < 0.05

    res = client.post("/api/examples/stand-by-me")
    assert res.status_code == 200
    body = res.json()
    assert body["filename"] == "Ben E. King — Stand By Me"
    assert body["is_stereo"] is True
