"""Verify the quieter sampled texture and the complete API render contract."""
import numpy as np
from fastapi.testclient import TestClient

from app.main import app
from app.dsp.playback.sampled_surface import mix_sampled_surface, sample_at_rate
from app.dsp.pipeline import PipelineConfig, run


def test_sample_gain_and_loop_boundary():
    rate = 22050
    texture = sample_at_rate(rate)
    n = texture.shape[0] + 37
    output = mix_sampled_surface(np.zeros((n, 2), dtype=np.float32), rate)
    np.testing.assert_allclose(output[:texture.shape[0]], texture * (0.45 * 0.60), atol=1e-7)
    np.testing.assert_allclose(output[-37:], texture[:37] * (0.45 * 0.60), atol=1e-7)
    assert np.isfinite(output).all()
    assert np.max(np.abs(texture[[0, -1]])) == 0
    # Zero level really removes the sample, without altering the music.
    music = np.full((100, 2), 0.1, dtype=np.float32)
    np.testing.assert_array_equal(mix_sampled_surface(music, rate, 0), music)


def test_sampled_render_and_physical_fallback():
    client = TestClient(app)
    sid = client.post("/api/demo").json()["session_id"]
    response = client.post("/api/process", json={
        "session_id": sid, "surface_sound": "codrops", "retain_detail": False,
    })
    assert response.status_code == 200
    body = response.json()
    assert client.get(body["vinyl_url"]).content.startswith(b"RIFF")
    assert client.get(body["geometry_url"]).status_code == 200
    # The unchanged old treatment remains available through the same API.
    old = client.post("/api/process", json={"session_id": sid, "surface_sound": "physical"})
    assert old.status_code == 200
    assert body["geometry"] == old.json()["geometry"]


def test_new_texture_does_not_change_warmth_or_geometry():
    rate = 22050
    t = np.arange(rate * 2) / rate
    music = np.stack([0.2 * np.sin(2 * np.pi * 330 * t), 0.2 * np.sin(2 * np.pi * 550 * t)], axis=1)
    settings = dict(clicks=False, noise=False, stylus_size=2.75,
                    saturation_drive=4, wow_depth=3, crosstalk_amount=2)
    classic = run(music, rate, PipelineConfig(**settings, surface_sound="physical"))
    trial = run(music, rate, PipelineConfig(**settings, surface_sound="codrops", retain_detail=False))
    np.testing.assert_array_equal(trial.vinyl, classic.vinyl)
    assert trial.geometry.as_binary() == classic.geometry.as_binary()
    assert trial.detail_lateral is None and trial.detail_vertical is None
    assert classic.detail_lateral is not None
