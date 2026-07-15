# Vinylize — backend

Physics engine: FastAPI + NumPy/SciPy. See [docs/DESIGN.md](../docs/DESIGN.md) for the
full model derivations.

```bash
python -m venv .venv
.venv/Scripts/activate          # Windows; source .venv/bin/activate elsewhere
pip install -e ".[dev]"
uvicorn app.main:app --port 8000   # API + OpenAPI docs at /docs
python -m pytest                   # 22 tests
```

## Layout

```
app/
  api/            HTTP layer: schemas (Pydantic), routes, in-memory session store
  audio/          upload decoding (soundfile), display peaks, demo-clip synthesizer
  dsp/
    constants.py  every physical constant, with units and provenance
    filters.py    matched integrator/differentiator pair, pink noise, shared filters
    pipeline.py   the 10-stage orchestrator (cutting -> groove medium -> playback)
    cutting/      RIAA (matched-Z), 45/45 mid/side, time<->arc-length spiral map
    groove_medium/ stylus contact patch, compliance saturation (spatial domain)
    playback/     wow & flutter, clicks & pops, crosstalk, surface noise
  groove/         band-limited geometry decimation for the 3D visualizer
  explain/        Explorer cards: physics copy + per-upload measurements
tests/
```
