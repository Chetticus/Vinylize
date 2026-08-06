"""Groove inspection window: payload format, alignment, and API contract."""

from __future__ import annotations

import io
import math

import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

from app.dsp.constants import OMEGA
from app.groove.detail_window import HEADER_FLOATS, TURN_PERIOD_S, extract_window
from app.main import app

client = TestClient(app)


def _parse(payload: bytes) -> tuple[dict[str, float], np.ndarray, np.ndarray]:
    f = np.frombuffer(payload, dtype="<f4")
    h = f[:HEADER_FLOATS]
    n = int(h[0])
    header = {
        "n": n, "ds_mm": float(h[1]), "s0_mm": float(h[2]), "t0_s": float(h[3]),
        "r_center_mm": float(h[4]), "pitch_mm": float(h[5]),
        "turn_period_s": float(h[6]), "duration_s": float(h[7]),
    }
    lat = f[HEADER_FLOATS : HEADER_FLOATS + n]
    vert = f[HEADER_FLOATS + n : HEADER_FLOATS + 2 * n]
    return header, lat, vert


def test_extract_window_shape_and_alignment() -> None:
    """A sine engraved directly into the detail arrays must come back with
    the right length, spacing, and a t0 consistent with the spiral map."""
    ds = 20e-6
    n = 500_000  # 10 m of groove
    s = np.arange(n) * ds
    lat = (10e-6 * np.sin(2 * np.pi * s / 0.002)).astype(np.float32)  # 2 mm wavelength
    vert = np.zeros(n, dtype=np.float32)
    r0 = 0.14

    payload = extract_window(lat, vert, ds, r0, t_center_s=5.0, span_mm=60, max_points=1000)
    h, w_lat, w_vert = _parse(payload)

    assert h["n"] <= 1000
    assert len(w_lat) == h["n"] and len(w_vert) == h["n"]
    assert abs(h["n"] * h["ds_mm"] - 60.0) < 3.0          # covers the span
    assert abs(h["turn_period_s"] - 2 * math.pi / OMEGA) < 1e-6
    # t0 must be just under the requested center (window centered on t=5 s).
    assert 4.9 < h["t0_s"] < 5.0
    # The engraved wave survives band-limiting (2 mm wavelength >> 60 um grid).
    assert np.max(np.abs(w_lat)) > 0.005  # mm


def test_window_clamps_at_clip_edges() -> None:
    ds = 20e-6
    lat = np.zeros(200_000, dtype=np.float32)
    payload = extract_window(lat, lat, ds, 0.12, t_center_s=0.0, span_mm=50)
    h, _, _ = _parse(payload)
    assert h["s0_mm"] == 0.0  # pinned to the groove start, not centered off-disc


def test_groove_window_api() -> None:
    buf = io.BytesIO()
    t = np.arange(2 * 22_050) / 22_050
    sf.write(buf, (0.4 * np.sin(2 * np.pi * 440 * t)).astype(np.float32), 22_050, format="WAV")
    r = client.post("/api/analyze", files={"file": ("t.wav", buf.getvalue(), "audio/wav")})
    sid = r.json()["session_id"]

    # Before processing: no groove to inspect.
    assert client.get(f"/api/session/{sid}/groove-window", params={"t": 1.0}).status_code == 404

    assert client.post("/api/process", json={"session_id": sid}).status_code == 200

    from app.dsp.constants import LEAD_IN_SECONDS

    # Inside the silent lead-in the groove is honestly unmodulated…
    r_lead = client.get(f"/api/session/{sid}/groove-window", params={"t": 1.0, "span_mm": 60})
    _, lat_lead, _ = _parse(r_lead.content)
    assert float(np.max(np.abs(lat_lead))) < 1e-5

    # …and in the music region the 440 Hz tone shows visible modulation.
    r2 = client.get(
        f"/api/session/{sid}/groove-window",
        params={"t": LEAD_IN_SECONDS + 1.0, "span_mm": 60},
    )
    assert r2.status_code == 200
    h, lat, vert = _parse(r2.content)
    assert h["n"] > 100
    assert len(r2.content) == 4 * (HEADER_FLOATS + 2 * h["n"])
    assert np.all(np.isfinite(lat)) and np.all(np.isfinite(vert))
    assert h["turn_period_s"] > 1.7
    assert float(np.max(np.abs(lat))) > 1e-4
