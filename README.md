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
- **Clicks are scattered per meter of groove**, so click rate in time scales with groove
  speed — slightly *fewer* clicks per second near the label, contrary to popular belief
  (the app explains why the folklore is wrong).
- **The 3D groove is the same data the audio pipeline produced** — what you see engraved is
  exactly what the simulated stylus reads.

## Features

- **Upload MP3/WAV** (or press *Try the demo groove* — a synthesized funk loop built to
  exercise every stage). Up to the first 3 minutes are cut to disc — with a live,
  stage-by-stage render progress bar — and recent clips stay in a sidebar library for
  instant switching.
- **10-stage physics pipeline**: RIAA pre-emphasis → 45/45 mid/side encoding →
  time→arc-length engraving → stylus contact patch → compliance saturation → wow/flutter
  playback → clicks & pops → crosstalk → surface noise → RIAA de-emphasis. Every stage
  independently toggleable, every parameter scaled from measured real-world values.
- **Sample-synced A/B**: original and vinyl play simultaneously; switching flips gains, so
  the only thing that changes is the physics.
- **3D turntable in a listening room**: a complete deck — walnut plinth, satin deck
  plate, machined platter and mat, vinyl with a procedural label carrying your filename,
  and a fully articulated tonearm (pivot, tube, counterweight, headshell, cartridge,
  cantilever, stylus) — on a walnut console in a private room above a record shop, in
  the last hour of daylight: low sun through a rain-streaked window, bookshelf speakers,
  a small amplifier, headphones on a stand, a leather reading chair with a lamp, a
  shelf and crate of records, and the owner's half-finished coffee. Everything is built
  in code — geometry from rounded boxes, lathes and swept tubes, and every surface
  (walnut grain, plaster, woven rug, leather, brushed metal, speckled glaze, rain on
  glass, abstract sleeve designs) painted procedurally from seeds. No model files, no
  image assets, no generated imagery. A toggle switches to a minimal dark studio.
  Screenshots: [docs/screenshots](docs/screenshots).

- **Multiscale groove microscope**: the record is rendered at TRUE scale across three
  levels of detail. From turntable distance the recorded band reads as satin (an
  analytically anti-aliased procedural shader draws your clip's real turn count at the
  real ~0.25 mm pitch, with per-turn loudness banding measured from your audio — a
  3-minute clip really is ~100 tightly packed turns). Zoom closer and individual turns
  resolve continuously — same shader, no LOD pop. Within ~5 cm of the stylus the
  microscope wakes: the backend serves an 80 mm window of the *actual engraved groove*
  around the playback position (plus the adjacent turns — the same song ±1.8 s, which is
  what physically sits 0.25 mm away), rebuilt as a true-scale V-trench whose centerline
  swings with L+R and whose walls/depth breathe with L−R. A cutaway slices the trench at
  the stylus so you can watch the true-size (DSP-scaled) tip ride the walls; only the
  audio wiggle is magnified, clamped so grooves can never collide, and a persistent label
  discloses the exaggeration. Stereo view modes (Full / L+R / L−R) change the geometry
  itself, not its color. The groove is a real V-profile along an
  Archimedean spiral: lateral wiggle is the mono sum, depth breathing is the stereo
  difference (the actual Westrex 45/45 geometry). Press play and the record spins at a
  true 33⅓ RPM while the arm tracks the groove inward. Orbit, zoom, click the groove to
  play from that spot; a debug mode overlays the pivot, arm-reach circle, and
  stylus/target markers.

  <details><summary><b>How the tonearm tracks the groove (kinematics)</b></summary>

  The arm is a strict transform hierarchy rooted at a fixed pivot (real 9″-arm
  numbers: pivot 212 mm from the spindle, 229 mm effective length), and the only
  per-frame updates are one yaw angle and a millimeter-scale cantilever offset. The
  record group's rotation is phased so the groove point playing at time *t* sits at
  world radius *r(t)*; the arm yaw is then solved analytically as the intersection of
  two circles — the groove revolution (radius *r* about the spindle) and the stylus
  arc (radius 229 mm about the pivot) — via `A·cosα + B·sinα = C`. Like a real arm, the
  tip crosses each radius at a small tracking angle rather than a fixed point, so the
  solver iterates once to find the groove section actually under the tip and applies
  that section's audio wiggle and depth as local cantilever compliance. Out-of-reach
  radii clamp to the tangent position. `tonearmKinematics.ts` documents the derivation;
  its `validateKinematics` self-check (debug mode) confirms the tip lands on the groove
  radius to well under a millimeter across the whole clip.

  </details>
- **The inner-groove experiment**: the groove travels only ~8 mm inward per minute of music,
  so the app lets you *place* the clip anywhere between 146 mm and 62 mm and hear the same
  file degrade (long clips are auto-placed so they physically fit the program area).
- **Engineering Explorer**: for each stage — the physics, where it lives on a record, why it
  can't be eliminated, and measured numbers from your clip ("your 5–14 kHz band changed by
  −6.6 dB", "your brightest moment at 0:04.8 dulls first").

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

22 tests cover: RIAA curve accuracy vs the analog standard and exact pre×de invertibility,
spiral map invertibility, near-transparency of the full chain with physical stages disabled
(the numeric floor under every audible effect), the emergent inner-groove treble loss,
mono → flat-vertical groove geometry, deterministic click seeding, API contracts, and a
pipeline wall-clock budget.

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
