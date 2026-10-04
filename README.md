# Vinylize

**Upload any song and watch it become a vinyl record.**

An interactive physics simulation of vinyl playback: upload an MP3/WAV, and the app cuts it
into a virtual groove, plays it back through an imperfect turntable, lets you A/B the result
against the original, renders the groove as an explorable 3D object — and explains every
audible difference with measurements taken from *your* audio, not generic vinyl folklore.

## The one idea everything is built on

A phono cartridge is a **velocity transducer riding a spiral of shrinking radius**. The
simulation remaps your audio from the time domain into *arc length along the groove spiral*,
applies fixed-physical-size effects there (a stylus tip is the same 8 µm everywhere on the
disc), and maps back to time through a wobbling turntable clock. Because of that one
geometric idea:

- **Inner-groove distortion, treble loss, and tracing distortion emerge from a single
  spatial convolution** — there is no radius-conditional code anywhere; the physics falls
  out of the map (verified by test: the same audio measurably loses more treble cut at
  62 mm than at 146 mm).
- **Wow & flutter is actual speed variation**, not a pitch-LFO painted on afterward: the
  simulated stylus literally reads the groove at a wobbling rate.
- **In the preserved physical-noise model, clicks are scattered per meter of groove**, so click rate in time scales with groove
  speed — slightly *fewer* clicks per second near the label, contrary to popular belief
  (the app explains why the folklore is wrong).
- **The 3D groove is the same data the audio pipeline produced** — what you see engraved is
  exactly what the simulated stylus reads.

## Features

- **3D Groove opens first**, with a house pressing already on the deck; no
  audio selection or backend render is needed to see the room.
- **One listening room, one vinyl acoustic treatment**: the warm stereo Room
  convolution stays on Vinyl. Digital bypasses all added effects. Studio, Dry/Hall, Inspect, Debug, and the
  Listen & Compare page are no longer in the interface.
- **Cursor-driven camera**: move your mouse to look around without holding
  a button; scroll to zoom. Touch uses a one-finger gesture. Focus the canvas
  to use arrow keys, or Home to reset the view.
- **Smooth record exchanges**: the previous pressing remains visible while
  the next song is prepared, then slides out and the replacement slides in.
  Textures upload before the incoming record appears. The room stays mounted
  across song changes and visits to The Vinyl Story.
- **Three local example songs**, in shelf order: Stand By Me — Ben E. King;
  Nothing Can Change This Love — Sam Cooke; Come a Little Bit Closer —
  Jay & The Americans. Their recordings remain git-ignored.
- **Bring your own MP3/WAV/FLAC/OGG**, or play the synthesized house demo.
  Up to three minutes are cut, with stage-level progress.
- **Warm vinyl processing**: RIAA, stylus tracing, compliance saturation,
  wow/flutter, and crosstalk retain the previous preset. The current trial
  replaces synthetic dust/noise with the exact Codrops recorded vinyl texture
  at gain 0.27: 40% quieter in linear amplitude than our previous 0.45 preset.
  Source credits and the one-line revert are in
  [the asset notes](backend/app/audio/assets/README.md). The original physical
  noise modules and full `CLASSIC_CONFIG` sound preset are preserved.
- **Playback controls**: play/pause, seek, volume, and a sample-synchronized
  Digital/Vinyl crossfade remain in the bottom transport. Digital preserves
  decoded source samples with no reverb, vinyl processing, or limiter; the
  shared silent lead-in keeps switching aligned. Drag the headshell
  to lift the tonearm and cue by groove radius.
- **The Vinyl Story** explains the physics and measured effects from your
  audio, without a separate comparison page.
- **Rendering budget**: static furniture is batched by material; sunlight
  shadows are cached; the idle/hidden room stops drawing; playback ticks no
  longer rebuild the scene. Desktop uses full-detail textures, restored
  shadows and 1.5–2× rendering, with a sharp minimum resolution rather than
  a blurry fallback. Decoded audio has a bounded cache.
  See [performance notes](docs/PERFORMANCE.md) for details and validation limits.

## Architecture

```
backend/   Python: FastAPI + NumPy/SciPy — owns the physics
frontend/  React + TypeScript + three.js (react-three-fiber) — owns the interaction
docs/      DESIGN.md — full engineering design document (written before the code)
```

The full rationale for every model and library choice — and a critical self-evaluation —
is in [docs/DESIGN.md](docs/DESIGN.md).

## Running locally

Vinylize is two halves: a Vite web app and a Python audio engine behind it.
One command starts both.

First-time setup of the engine (Python >= 3.11):

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate        # Windows; source .venv/bin/activate elsewhere
pip install -e ".[dev]"
```

Then, from the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. `npm run dev` runs the web app and the engine
together and shuts both down on Ctrl-C; use `npm run dev:web` if you want the
web half alone (the app still boots and The Vinyl Story is readable, but no
audio can be cut).

If the engine is not running, the app says so on load and tells you how to
start it, rather than failing at the first click.

## Tests

```bash
cd backend && python -m pytest
```

Backend regression tests cover: RIAA curve accuracy vs the analog standard and exact pre×de invertibility,
spiral map invertibility, near-transparency of the full chain with physical stages disabled
(the numeric floor under every audible effect), the emergent inner-groove treble loss,
mono → flat-vertical groove geometry, deterministic click seeding, API contracts, and a
pipeline wall-clock budget.

Frontend audio-graph tests (no browser or audio device needed):

```bash
cd frontend
npm test
```

## Deploying

The repo ships a `Dockerfile` that builds the web app and serves it from the
engine on port 7860 — one container, one origin. `deploy/huggingface.py`
publishes it to a free Hugging Face Space (Docker SDK):

```bash
pip install huggingface_hub
hf auth login              # a token with write access
python deploy/huggingface.py
```

Example records: put audio files named as in `backend/app/audio/examples.py`
into `backend/examples/` (git-ignored) and they appear under the upload slot;
the deploy script ships them to the Space unless `--no-examples` is given.
