# Vinylize — Engineering Design Document

**A portfolio project: upload a song, watch it become a vinyl record.**

*(Designed and first built as "The Groove Mechanic"; renamed Vinylize in v0.2.
Historical references to the old name below are left as written.)*

Status: design phase (no implementation yet, per project brief).

---

## 1. Product Vision

The Groove Mechanic answers one question for a curious listener: *what does a record player actually do to a song, and why?*

A user uploads an MP3/WAV. The app treats that specific audio — not a generic demo — as the
raw material for every visualization and every explanation on the page. It:

1. Analyzes the upload (waveform, sample rate, channel layout, duration).
2. Derives a **physical groove geometry** from the audio, as if it were being cut into a
   lacquer master.
3. Simulates **playback** of that groove through an imperfect, real turntable/stylus/preamp
   chain — not a "vinyl" audio filter preset, but a chain of individually-justified physical
   stages.
4. Renders the groove as an explorable 3D object.
5. Lets the user A/B the original against the simulated playback, toggle individual physical
   effects on/off, and read explanations that reference *their own audio* ("this cymbal
   loses energy near the inner groove because...").

The unifying engineering idea, used throughout DSP, visualization, and copy: **a phono
cartridge is a velocity transducer riding a spiral of shrinking radius.** Nearly every
"vinyl sound" phenomenon — high-frequency loss, inner-groove distortion, harmonic warmth,
click density, crosstalk — is a consequence of two facts: (a) cartridges respond to the
*velocity* of groove wall motion, not its displacement, and (b) linear groove velocity drops
by roughly 2.4× from outer to inner groove at constant angular velocity. Teaching the app
around that one idea, rather than as a checklist of unrelated filters, is what makes the
explanations non-generic and the pipeline architecturally coherent.

---

## 2. Educational Objectives

By the end of a session, a user should be able to answer, in their own words, using their
own song as the example:

- Why do quiet passages *and* loud passages both get modified when cut to vinyl, and why in
  opposite directions (RIAA curve, groove-excursion limits)?
- Why does the *same* frequency content sound worse near the end of a side than the
  beginning?
- Why can't engineers just "turn up" the treble to fix vinyl's high-frequency loss?
- Why is stereo separation on vinyl inherently imperfect, and where does the leakage
  actually come from mechanically?
- What is the actual difference between "warmth" (a real, measurable harmonic effect) and
  "noise" (an unrelated, undesired one) — two things pop culture conflates?

The teaching mechanism is **direct manipulation**: every stage is independently toggleable,
so the user hears (and sees, in the groove) exactly what one physical limitation contributes,
isolated from the rest.

---

## 3. System Architecture

### 3.1 High-level shape

```
┌─────────────────────────────┐        HTTPS/JSON + binary        ┌───────────────────────────────┐
│   Frontend (React + TS)     │ ─────────────────────────────────▶ │   Backend (Python / FastAPI)  │
│   - Upload UI, tabs          │ ◀───────────────────────────────── │   - Audio ingestion            │
│   - Waveform (Canvas)        │                                    │   - DSP pipeline (NumPy/SciPy) │
│   - 3D groove (Three.js/R3F) │                                    │   - Groove geometry generator  │
│   - Web Audio playback       │                                    │   - Explanation metadata       │
│   - Engineering Explorer UI  │                                    │                                │
└─────────────────────────────┘                                    └───────────────────────────────┘
```

**Why a Python backend instead of doing everything client-side (WASM/JS DSP)?**
The brief specifically asks for production-quality, modular, type-hinted Python as a
deliverable — that has to be a substantive engineering artifact, not glue code. NumPy/SciPy
also give vectorized filter design (`scipy.signal.bilinear`, `sosfilt`), resampling, and
array math "for free" — reimplementing that in JS would be reinventing well-tested tools
for no educational or product benefit. The 3D rendering and real-time audio playback,
conversely, are natural fits for the browser (WebGL, Web Audio API) and gain nothing from
living server-side. The split is: **Python owns the physics, the browser owns the
interaction.**

**Why a synchronous REST call instead of a job queue / websockets?**
The brief caps analysis to the first 5–10 seconds specifically for responsiveness. At that
duration, the full pipeline (all NumPy/SciPy operations, vectorized) runs in well under a
second on ordinary hardware. A job queue, websocket progress channel, or streaming protocol
would add real complexity (worker processes, polling/subscription state, error paths on two
more moving parts) to solve a problem that doesn't exist at this scale. This is a conscious
scope decision — flagged again in §10 as the first thing to revisit if the duration cap is
ever lifted.

### 3.2 Backend module map

```
backend/
  app/
    main.py                     # FastAPI app, router registration, CORS
    api/
      routes_audio.py           # POST /api/analyze, POST /api/process
      schemas.py                # Pydantic request/response models
    audio/
      ingestion.py              # decode upload -> mono/stereo float32 arrays + metadata
      waveform.py               # peak-decimation for display (min/max buckets)
    dsp/
      pipeline.py               # orchestrates ordered stages, stage on/off toggles
      stage_base.py             # DspStage protocol / ABC, common interfaces
      cutting/
        riaa.py                 # RIAA pre-emphasis / de-emphasis filter design
        mid_side.py             # L/R <-> lateral/vertical (mid/side) transforms
        spatial_map.py          # time <-> groove arc-length remapping
      groove_medium/
        stylus_contact.py       # spatial contact-patch convolution (tracing/IGD/HF loss)
        compliance.py           # velocity-keyed nonlinear saturation
      playback/
        wow_flutter.py          # angular-velocity modulation + time warp resampling
        clicks_pops.py          # Poisson click generator + resonance impulse response
        crosstalk.py            # frequency-dependent channel leakage matrix
        surface_noise.py        # pink noise + rumble floor
      constants.py               # physical constants (RPM, radii, stylus dims, RIAA taus)
    groove/
      geometry.py                # spiral centerline + wall displacement -> mesh arrays
      decimation.py              # band-limited LOD reduction for render payload
    explain/
      registry.py                 # per-stage explanation templates
      metrics.py                   # per-stage, audio-derived numbers to fill templates
    tests/
      test_riaa.py, test_spatial_map.py, test_pipeline_roundtrip.py, ...
  pyproject.toml
```

Each DSP stage is a small class implementing a shared `DspStage` interface
(`process(signal, context) -> signal`, plus `explain(context) -> ExplanationPayload`), so the
pipeline, the "solo this stage" UI, and the Engineering Explorer all draw from the *same*
object instead of three parallel implementations drifting out of sync.

### 3.3 Frontend module map

```
frontend/
  src/
    api/client.ts                # typed fetch wrapper for backend endpoints
    state/sessionStore.ts        # Zustand store: upload, analysis, processed results, UI state
    audio/
      playbackEngine.ts          # Web Audio graph: original vs vinyl buffer switching
    components/
      Sidebar/                   # intro, concepts, upload controls
      tabs/
        WaveformTab.tsx
        GrooveVisualizerTab.tsx
        ComparePlaybackTab.tsx
        EngineeringExplorerTab.tsx
        DspControlsTab.tsx
      groove/
        GrooveScene.tsx          # react-three-fiber canvas, camera, controls
        GrooveMesh.tsx           # builds BufferGeometry from backend arrays
        StylusMarker.tsx         # position synced to audio currentTime
      shared/
        Waveform.tsx             # canvas peak renderer
        ABToggle.tsx
    types/api.ts                 # mirrors backend Pydantic schemas
  package.json / vite.config.ts
```

---

## 4. DSP Pipeline

### 4.1 Ordering principle

The pipeline is ordered to mirror the *real physical signal chain*, split into three phases.
This isn't arbitrary bookkeeping — it determines which domain (time vs. arc-length) each
stage operates in, which is what makes several effects fall out "for free" (§4.3).

**Phase A — Cutting (prepare the groove).**
1. `RiaaPreEmphasis` — boost highs / cut lows before the signal becomes physical groove
   excursion.
2. `MidSideEncode` — split L/R into lateral (mid, L+R) and vertical (side, L−R) components,
   matching the real 45°/45° stereo cutting geometry.
3. `TimeToArcLength` — remap the signal from the time domain into the spatial domain along
   the spiral groove path (this is also where the raw geometry for the 3D visualizer comes
   from).

**Phase B — Groove medium (physical limitations, applied in the spatial domain).**
4. `StylusContact` — finite stylus tip convolved against the spatial groove signal: this one
   mechanism produces tracing distortion, inner-groove distortion, *and* HF response loss as
   one effect, not three (§4.3.1).
5. `Compliance` — velocity-keyed soft saturation, modeling cantilever/vinyl elastic
   nonlinearity (harmonic "warmth").

**Phase C — Playback (imperfect turntable, back to the time domain).**
6. `ArcLengthToTime` — remap using the turntable's *actual* (imperfect) angular velocity.
   Because the remap uses a wobbling angular velocity instead of an ideal constant one, wow
   & flutter is a direct consequence of this step, not a separately bolted-on LFO-on-pitch
   effect (§4.3.2).
7. `ClicksAndPops` — Poisson-arrival groove defects, each triggering the cartridge's
   mechanical resonance.
8. `Crosstalk` — imperfect lateral/vertical→L/R decoding, frequency-dependent leakage.
9. `SurfaceNoise` — pink-noise surface hiss + sub-audio rumble floor.
10. `RiaaDeEmphasis` — the ideal inverse of stage 1, applied by the phono preamp. Kept as an
    *exact* inverse by default rather than a slightly-mismatched one, so any remaining
    brightness loss the user hears is honestly attributable to stages 4–9, not to a strawman
    EQ error. (A "cheap phono preamp" preset with deliberate RIAA deviation is a natural
    future toggle — see §10.)

Every stage is independently toggleable in the DSP Controls tab; the Engineering Explorer
and the Compare tab both read from the same enable/disable state, so "turn off wow &
flutter and listen" is one flag, not a special code path.

### 4.2 Mathematical foundations

**Physical constants used throughout** (`constants.py`):
- Angular velocity: 33⅓ RPM ⇒ ω₀ = 2π·(100/180) rad/s ≈ 3.49 rad/s.
- Groove radius range: outer r_out ≈ 146 mm, inner r_in ≈ 60 mm (standard LP program area).
- Linear velocity: v(r) = ω₀·r ⇒ v(r_out) ≈ 509 mm/s, v(r_in) ≈ 209 mm/s — a **2.4×** drop,
  the number nearly everything else in §4.3 derives from.
- Groove pitch (radial spacing/revolution): ~250 µm representative constant (real mastering
  uses *variable* pitch keyed to loudness — noted as a future improvement, §10, since it's a
  genuinely interesting piece of engineering we chose not to model in v1).
- Stylus contact dimension: ~10–18 µm (representative spherical/elliptical tip).

**RIAA equalization (stages 1 & 10).** The RIAA curve is defined by three time constants:
τ₁ = 3180 µs, τ₂ = 318 µs, τ₃ = 75 µs, i.e. corner frequencies f₁≈50 Hz, f₂≈500 Hz,
f₃≈2122 Hz. Physically: below f₂, cutting is **constant-amplitude** (bass is cut before
cutting, or groove excursion would be enormous and adjacent grooves could collide); above
f₂, cutting is **constant-velocity** (treble is boosted before cutting to lift it above the
noise floor, since a cartridge's constant-velocity response means quiet treble content would
otherwise sit at low groove excursion, close to surface noise). Implemented by designing the
analog RIAA network transfer function and mapping it to a digital IIR filter via
`scipy.signal.bilinear` (with pre-warping), rather than hand-tuning a shelving EQ by ear —
this keeps the filter's frequency response metrologically correct, and matches real preamp
literature, which upgrades the Explorer copy from "engineers boost the treble" to a precise,
citable frequency response.

**Time ↔ arc-length remapping (stages 3 & 6) — the key design insight.**
Model the groove centerline as an Archimedean spiral r(θ) = r_out − (pitch/2π)·θ. Cutting at
constant angular velocity ω₀ means groove arc-length position is:

  s(t) = ∫₀ᵗ v(τ) dτ,  where v(τ) = ω₀·r(θ(τ))

computed via cumulative-trapezoidal integration over the sample grid (`scipy.integrate.
cumulative_trapezoid`), giving a monotonic time→arc-length map. The *signal itself* — the
audio samples — is treated as displacement of the groove wall as a function of s, i.e.
x(s), by resampling the time-domain signal onto this arc-length grid.

The reason this matters: stage 4 (`StylusContact`) then applies a **fixed-width** spatial
smoothing/nonlinear kernel — fixed in *µm*, because a stylus tip is a fixed physical size
regardless of where on the disc it sits. Converted back to the time domain via stage 6, that
same fixed spatial kernel automatically smooths (distorts) proportionally more at the inner
radius, because more temporal cycles are packed into the same physical arc-length there. No
radius-dependent filter coefficients are needed — inner-groove distortion, inner-groove HF
loss, and general tracing distortion all fall out of one spatial convolution for free. This
is the single mathematical idea the whole "groove medium" phase is built around, and it's
also literally the same geometry the 3D visualizer renders (§5), so the DSP explanation and
the picture the user is looking at are the same object, not two separate representations
that happen to agree.

**Stylus contact convolution (stage 4).** Model the contact patch as a Gaussian (or raised-
cosine) kernel of fixed spatial width w ≈ stylus tip radius, convolved against x(s). Linear
convolution alone gives the (correct, physical) low-pass characteristic; a mild nonlinearity
(kernel-weighted local curvature penalty) is layered on top to produce actual harmonic
distortion products rather than pure attenuation, since a stylus that can't trace a sharp
groove wall doesn't just get quieter there, it mistracks and generates new harmonics.

**Compliance / harmonic saturation (stage 5).** A cartridge outputs a voltage proportional
to groove wall *velocity* (dx/ds, i.e. the spatial derivative — this is the "velocity
transducer" fact the whole project is organized around), not displacement. Saturation is
therefore driven by local |dx/ds|, not by |x|: `y = tanh(g·v)/tanh(g)` applied with a small,
asymmetric bias (real mechanical systems aren't perfectly symmetric), where drive `g` is an
exposed UI parameter. This correctly makes saturation strongest during loud, high-frequency
passages (highest groove velocity) rather than uniformly across the track.

**Wow & flutter (stage 6).** Real turntable angular velocity is not perfectly constant:

  ω(t) = ω₀ · [1 + A_w·sin(2π f_w t + φ_w) + A_f·sin(2π f_f t + φ_f)]

with wow A_w ≈ 0.1–0.3% at f_w ≈ 0.5–6 Hz (platter/spindle eccentricity — once or twice per
revolution) and flutter A_f ≈ 0.05–0.15% at higher f_f (tens of Hz — belt/motor cogging).
Integrating ω(t) gives the actual (warped) playback time function; resampling x(s) at that
warped time via vectorized linear interpolation (`np.interp`, not a per-sample Python loop)
reproduces pitch wobble as a *direct consequence* of speed variation, which is what wow and
flutter physically are — not a separately-modeled pitch-LFO effect layered on afterward.

**Clicks & pops (stage 7).** A common but physically loose claim is "inner grooves have more
clicks." We derive the correct relationship instead of asserting it: if surface defects
(dust, scratches) are distributed at roughly constant density per unit **disc area**, and
groove pitch is roughly constant, then defects per unit **groove length** are also roughly
constant. Click **rate in time** = (defects per unit length) × v(r), which *decreases*
toward the inner groove, since a full revolution near the center is played back in the same
time as one near the edge but covers less physical groove length. So click rate is modeled
as scaling with local v(r) — slightly higher near the outer edge — and the Explorer copy
says so explicitly, correctly attributing the *dominant* classic "inner groove problem" to
tracing distortion and HF loss (stage 4), not to click density. Getting this right, and
explaining why the popular assumption is wrong, is exactly the kind of precise reasoning the
brief asks for. Each click event is a Poisson arrival (`numpy.random.default_rng().
poisson`), and its waveform is the impulse response of a lightly-damped 2nd-order resonance
(~3–8 kHz, a few ms decay) convolved with a unit impulse — modeling the cartridge cantilever
literally getting "kicked" by a physical defect and ringing at its own mechanical resonance.

**Crosstalk (stage 8).** The 45°/45° system decodes lateral/vertical back to L/R by a
matrix; real cartridges/preamps have imperfect channel separation, worse at high frequency
due to mechanical coupling in the cantilever suspension. Modeled as
`L' = L + k(f)·R`, `R' = R + k(f)·L`, with k(f) a mild high-shelf (~ −30 dB at 1 kHz,
degrading above a few kHz), implemented as a shelving filter applied to the leakage term
only, so the direct signal path is untouched.

**Surface noise (stage 9).** Broadband pink noise (`1/f` spectral shape, generated via
spectral shaping of white noise in the frequency domain) plus a very-low-frequency rumble
component (<20 Hz, from motor/bearing, shaped with a resonant low-pass). Deliberately **not**
modeled as strongly radius-dependent in level — per the click-rate derivation above, the
honest physical driver of "worse near the center" is HF/tracing loss, not a rising noise
floor, and overstating a radius-dependent noise floor would be exactly the kind of unearned
generic claim the brief warns against. A small, clearly-labeled radius tilt is left as an
optional/future refinement rather than a default assumption (§10).

### 4.3 Why this beats a "generic vinyl filter"

The differentiator versus a single EQ-plus-noise preset is that four ostensibly separate
phenomena (tracing distortion, inner-groove distortion, HF rolloff, and the shape of click
rate vs. radius) are **derived from one geometric model** (arc-length parameterization +
fixed-size stylus contact) rather than hand-tuned as four independent effects that happen to
correlate. That's also what makes per-stage toggling *mean something* pedagogically: turning
off `StylusContact` alone removes tracing distortion, inner-groove distortion, and the
associated HF loss together, because in reality they share one physical cause — the app
should not let the user think these are unrelated by toggling them separately when the
physics says they're one.

---

## 3D Visualization Pipeline
<a id="section-5"></a>

## 5. Interactive 3D Groove Visualizer

### 5.1 What geometry actually gets rendered

The groove centerline is the Archimedean spiral from §4.2. Two displacements are applied to
that centerline, and — critically — they are **not arbitrary visualization choices**: they
are the same lateral/vertical (mid/side) signals computed in Phase A, stage 2, of the DSP
pipeline:

- **Lateral displacement** (in-plane, perpendicular to the groove's tangent direction) ∝
  mid signal (L+R)/√2.
- **Vertical displacement** (out-of-plane, Z-axis "height") ∝ side signal (L−R)/√2.

This is exactly how real 45°/45° stereo cutting decomposes: each groove wall is cut at 45°
to vertical, so pure lateral wall motion is mono-compatible content and pure vertical motion
is the stereo difference. Visualizing it this way means a mono upload produces a groove that
only wiggles side-to-side (correct — that's literally what a mono groove is), and a
heavily-panned stereo upload visibly tilts the groove cross-section, which is a genuine,
inspectable physical fact rather than a stylistic rendering choice.

### 5.2 Mesh construction

For each arc-length sample, compute a ribbon cross-section: two rail vertices offset from
the centerline by ± (groove half-width + lateral displacement), lifted by vertical
displacement, with a normal computed from the local tangent/binormal frame (Frenet-like
frame along the spiral). Build a `THREE.BufferGeometry` directly from typed arrays
(positions, normals, uvs) rather than using `TubeGeometry`/`CatmullRomCurve3` — a custom
ribbon gives literal groove *walls* (two distinct rails users can see modulate
independently) instead of a single tube silhouette, which is more faithful to what a groove
actually is and reads better under raking light in WebGL.

Rendering: `react-three-fiber` + `drei`'s `OrbitControls` for rotate/zoom, a physically-
inspired vinyl-black material (`MeshPhysicalMaterial`, high roughness, slight clearcoat) lit
by a couple of rim lights so groove modulation is visible via specular highlights the way it
is on a real record under a lamp.

### 5.3 Scrubbing and stylus marker

A small marker (a torus/sphere "stylus tip" stand-in) sits on the groove ribbon at the
arc-length position corresponding to the current playback time (via the same time↔arc-length
map from §4.2, so the marker moves at the geometrically-correct, slowing-as-it-nears-center
rate — itself a small, free demonstration of "the record isn't playing at constant linear
speed"). Dragging the marker scrubs playback; playing audio moves the marker. Both directions
go through one `useGrooveTransport` hook so there's a single source of truth for "where are
we."

### 5.4 Decimation / LOD (performance)

At 44.1 kHz, 10 seconds is 441,000 samples — far too many ribbon cross-sections for smooth
orbit-control rendering. Naive uniform downsampling would alias: dropping samples without
filtering first can synthesize visual "wiggle" in the mesh that was never in the audio,
which would actively mislead a user inspecting the groove. So decimation is **band-limited**:
low-pass filter (`scipy.signal.decimate`, which applies an anti-aliasing filter before
downsampling) to a target vertex budget (~20–40k cross-sections, tuned to keep interaction
smooth on integrated GPUs) before generating geometry. This is called out explicitly in the
code and in the Explorer, because it's a real engineering tradeoff (visual fidelity vs.
frame rate) with a real correct-vs-wrong way to do it, which is itself worth teaching.

### 5.5 Alternatives considered

- **Height-mapped disc texture (2D image, displacement-mapped):** simpler, but reads as a
  heightmap, not a groove — loses the "walk along the spiral and inspect a specific moment"
  interaction that's central to the brief.
- **Point cloud:** cheap, but doesn't communicate "groove wall" as a continuous surface,
  and specular lighting (which is how you actually *see* groove modulation on real vinyl)
  needs surface normals a point cloud doesn't provide well.
- **Full tube (`TubeGeometry` along a `Curve3`):** simplest to implement, rejected because it
  renders a single silhouette and can't show the two groove walls (and thus can't show
  crosstalk/channel leakage) independently.

The custom ribbon-with-two-rails was chosen because it's the only option of the three that
can visually represent independent L/R wall behavior, which the brief explicitly asks for
("if stereo audio is uploaded, visualize how both channels influence groove geometry").

---

## 6. UI Design

### 6.1 Layout

```
┌───────────────┬─────────────────────────────────────────────────────────┐
│   Sidebar      │  Tabs: [Waveform] [3D Groove] [Compare] [Explorer] [DSP]│
│                │ ┌───────────────────────────────────────────────────┐  │
│ - What is this │ │                                                   │  │
│   (intro)      │ │              active tab content                  │  │
│ - Vinyl        │ │                                                   │  │
│   engineering  │ │                                                   │  │
│   concepts     │ │                                                   │  │
│   (short,      │ │                                                   │  │
│   links into   │ │                                                   │  │
│   Explorer)    │ │                                                   │  │
│ - Upload +     │ │                                                   │  │
│   file info    │ │                                                   │  │
│   (duration,   │ └───────────────────────────────────────────────────┘  │
│   sr, ch)      │  Transport bar: ▶ Original | ▶ Vinyl | position slider │
└───────────────┴─────────────────────────────────────────────────────────┘
```

### 6.2 Tabs

1. **Waveform** — original waveform (canvas, peak-decimated), duration/sample-rate/channel
   readout, mono/stereo indicator.
2. **3D Groove** — the visualizer (§5), with a channel-mode toggle (both / lateral only /
   vertical only) so a user can isolate what each component of stereo contributes to the cut
   groove shape.
3. **Compare** — instant A/B between original and vinyl-simulated audio (synced playhead,
   single button toggle, not two separate players to keep the comparison immediate).
4. **Engineering Explorer** — one card per DSP stage; clicking a stage shows what physical
   phenomenon it models, where it shows up on a real record, why it can't be eliminated, and
   *measured numbers from the user's own audio* (e.g., "at 0:07 your track hits a groove
   velocity of X mm/s, within Y% of the threshold where stage-4 tracing distortion becomes
   audible" — computed by `explain/metrics.py` from the actual processed buffers, not
   templated with placeholder text).
5. **DSP Controls** — every stage as a toggle + relevant parameter sliders (RIAA on/off,
   wow/flutter depth, saturation drive, click density, noise level, crosstalk amount);
   changes re-run the pipeline and update Compare/3D Groove live.

---

## 7. Folder Structure

```
groove-mechanic/
  backend/
    app/                    # see §3.2
    tests/
    pyproject.toml
    README.md
  frontend/
    src/                    # see §3.3
    public/
    package.json
    vite.config.ts
  docs/
    DESIGN.md                # this document
  README.md                  # portfolio-facing project overview
```

A single top-level repo (not two separate repos) so the whole project reads as one cohesive
portfolio piece with one commit history, while `backend/` and `frontend/` remain independently
runnable/testable.

---

## 8. Library Choices

| Concern | Choice | Why |
|---|---|---|
| Backend framework | FastAPI | Async-capable, Pydantic-native request/response typing (pairs directly with the brief's type-hints requirement), automatic OpenAPI docs "for free," minimal ceremony for a handful of endpoints. |
| Numeric/DSP core | NumPy + SciPy | Vectorized array math is non-negotiable for responsiveness; `scipy.signal` gives correct, tested filter design (`bilinear`, `sosfilt`, `decimate`) instead of hand-rolled IIR math. |
| Audio ingestion | `librosa.load` (falls back to `audioread`/`ffmpeg`) | Single call handles MP3 + WAV decode and resampling; avoids hand-writing a container/codec layer, which is out of scope for the project's actual learning goals. |
| Audio writing | `soundfile` | Clean WAV output for anything sent back as playable audio. |
| Validation/schemas | Pydantic v2 | Shared with FastAPI; gives runtime validation matching the static type hints, so "type hints" isn't just decoration. |
| Frontend framework | React + TypeScript | Component reuse across 5 tabs sharing state; TS catches the API-contract drift between backend Pydantic models and frontend consumption. |
| Build tool | Vite | Fast dev iteration; no meaningful downside for a project this size vs. alternatives. |
| 3D rendering | Three.js via `react-three-fiber` + `drei` | Idiomatic React bindings avoid a large imperative Three.js subsystem living awkwardly next to declarative React state; `drei` supplies `OrbitControls` etc. without reimplementing camera rigs. |
| Audio playback | Web Audio API directly (`AudioBufferSourceNode`) | The actual requirement (play/switch/scrub two decoded buffers) is simple enough that a wrapper library (Tone.js/Howler) would add more API surface than it removes. |
| State management | Zustand | The shared state (upload, analysis, processed audio, active stage toggles, playhead) is a single small store; Zustand avoids Redux's boilerplate for a store this size. |
| Styling | Tailwind CSS | Fast, consistent styling across many small components (5 tabs, stage cards) without hand-maintaining a separate CSS architecture. |

---

## 9. Performance Considerations

- **Duration cap (5–10 s)** is the primary lever — it bounds every downstream cost (sample
  count, groove vertex count, payload size) without a special case in the code; it's simply
  the array length everything else is derived from.
- **Vectorization discipline:** every DSP stage must be expressible as NumPy/SciPy array
  operations; the one stage that looks like it wants a per-sample Python loop (wow/flutter's
  time warp) is instead a single `np.interp` call over a precomputed warped-time array.
  Enforced via a note in `stage_base.py` and covered by a perf-regression-style unit test
  that flags any stage exceeding a wall-clock budget on a 10 s clip.
- **Waveform display decimation:** min/max-per-bucket reduction to ~1,500–2,500 points before
  sending to the frontend, so `WaveformTab` never draws 441k points to canvas.
- **Groove mesh decimation:** band-limited downsampling to a fixed vertex budget (§5.4);
  budget chosen empirically against target frame rate on mid-tier integrated GPUs, not just
  "as much detail as fits in a JSON payload."
- **Payload format:** groove geometry and processed audio samples are sent as raw binary
  (`Float32Array` bytes) behind a small JSON metadata envelope, not as JSON arrays of numbers
  — avoids ~3–5× serialization bloat and slow `JSON.parse` on hundreds of thousands of floats.
- **Backend concurrency:** DSP is CPU-bound synchronous NumPy code; FastAPI route handlers
  offload it via `run_in_threadpool` so a single slow request doesn't block the async event
  loop for other requests. A real multi-user deployment would eventually want a worker pool
  or process-based executor — noted as a scaling limit, not solved here, since the
  duration cap keeps single-request latency low enough that thread-pool offload is
  sufficient for a portfolio deployment.
- **Client-side caching:** processed result (audio + geometry) is cached in the Zustand store
  keyed by upload hash + current stage-toggle configuration, so switching tabs back and forth
  never triggers redundant network round-trips.

---

## 10. Future Improvements

- **Full-track processing** via chunked/streaming pipeline (would require revisiting the
  synchronous-request architecture — likely a job-status endpoint at that point).
- **Variable-pitch cutting simulation** — real mastering varies groove pitch with program
  loudness to protect against groove collision and maximize playing time; currently modeled
  as constant pitch for simplicity (§4.2).
- **Selectable stylus geometry** (spherical / elliptical / Shibata) with visibly different
  tracing-distortion behavior, since tip shape materially changes high-frequency tracing
  ability in reality.
- **"Cheap vs. audiophile turntable" presets** bundling wow/flutter depth, RIAA deviation,
  and crosstalk into a couple of one-click configurations, layered on top of (not replacing)
  the individual stage sliders.
- **WebAssembly port** of the DSP core for client-side, zero-round-trip real-time parameter
  tweaking, if server round-trip latency ever becomes the bottleneck on the interactive DSP
  controls tab.
- **45 RPM / other RPM selector**, exposing how RPM changes v(r) and therefore every
  radius-dependent effect — reinforces the core "it's all about velocity" idea with a second,
  independent variable.
- **WebGPU renderer** for higher groove vertex budgets once WebGPU support is broad enough to
  rely on without a fallback path.

---

## 11. Critical Self-Evaluation

**Strongest part of the design:** the arc-length parameterization (§4.2) genuinely unifies
tracing distortion, inner-groove distortion, and HF rolloff into one mechanism instead of
three independent hacks, and that same geometry directly drives the visualizer, so the DSP
explanation and the 3D picture are provably the same model, not two representations that
happen to agree by construction. That's the load-bearing idea of the whole project — if it
turns out not to sound convincing once real audio runs through it, everything built on top
of it needs revisiting, so it should be the first thing prototyped and validated.

**Risks and honest caveats:**

1. **Numerical stability of the time↔arc-length round trip.** Two resamplings (time→space in
   Phase A, space→time in Phase C) are two chances to introduce interpolation artifacts
   unrelated to the physical model being simulated. Mitigation: a unit test that runs the
   round trip with all Phase B stages disabled and asserts near-lossless reconstruction
   (bounded error vs. original) — this also becomes a legitimate, demonstrable piece of test
   coverage for the portfolio, not just a correctness box to check.
2. **The click-rate-vs-radius derivation (§4.2) contradicts common lore** ("inner grooves
   are noisier"). I'm confident in the derivation (constant defect density per unit length ⇒
   rate ∝ v(r), decreasing inward), but it depends on the "defects roughly uniform per unit
   groove length" assumption, which is a simplification, not a measured fact. The Explorer
   copy should state the assumption explicitly rather than presenting the conclusion as flatly
   certain — precision about what's derived vs. assumed is more defensible than false
   confidence either direction.
3. **Surface noise is intentionally *not* strongly radius-dependent** (§4.2), which is a
   deliberate corrective against the generic "vinyl gets noisier near the center" claim — but
   it means the app is taking a specific, arguable position rather than the crowd-pleasing
   default. Worth a sentence of justification directly in the UI copy so it reads as a
   considered choice, not an oversight.
4. **3D vertex decimation could still mislead** if the band-limiting filter and the audible
   DSP stages disagree about what "high frequency content" means at a given radius — i.e. the
   groove could visually show detail that was already inaudible post-stylus-contact filtering,
   or vice versa. Mitigation: geometry decimation should be applied to the *post-pipeline*
   (already stylus-filtered) signal, not the pre-pipeline original, so what's rendered and
   what's heard stay consistent.
5. **Single-server synchronous architecture doesn't scale past a few concurrent users** — an
   explicit, acceptable tradeoff for a portfolio deployment (§3.1, §9), not an oversight, but
   worth stating plainly rather than silently.
6. **Upload handling is a real (if small) security surface**: arbitrary user-supplied files
   reaching `librosa`/`ffmpeg` decoding. Mitigation to build in from the start, not bolt on
   later: sniff file headers rather than trusting the extension, cap upload size before
   decode, run decode in a way that a malformed file can't hang the request indefinitely
   (timeout on the decode call).

---

## 12. Open Questions Before Implementation

1. Deployment target for the portfolio piece (static frontend host + small backend host, or
   a single container)? Affects whether CORS/env config needs to be finalized now.
2. Any preference on the visual "material" for the groove (glossy black vinyl vs. a more
   diagrammatic/schematic look prioritizing clarity over realism)?
3. Confirm the six DSP phenomena named in the brief (harmonic saturation, inner-groove
   distortion, wow/flutter, tracking limitations, surface noise, clicks/pops, crosstalk,
   frequency response) are fully covered by the ten-stage pipeline in §4.1 — I believe they
   are (tracing/IGD/frequency response unified in stage 4, as explained in §4.3), but flagging
   for explicit sign-off since the brief calls them out individually.

Once these are resolved (or you're comfortable with the defaults stated above), the next step
is implementation, starting with the arc-length round-trip prototype (§11, risk 1) as the
foundation everything else depends on.

---

## 13. Implementation Notes — Where Reality Diverged from the Design

Recorded after the build; a design document that doesn't admit where implementation
overruled it is worth less than one that does.

1. **`soundfile` instead of `librosa` for decoding (§8).** libsndfile ≥ 1.1 (bundled with
   the `soundfile` wheel) decodes MP3 natively, so the entire librosa/numba dependency
   chain bought nothing. One dependency, all needed formats, content-sniffed uploads.

2. **Matched-Z instead of the bilinear transform for RIAA (§4.2).** The design named
   `scipy.signal.bilinear`; measurement showed it warps the curve badly at 44.1 kHz
   (+1.4 dB at 10 kHz, +7.5 dB at 20 kHz vs the analog standard) because the Neumann pole
   sits above Nyquist, where tan-prewarping is undefined. Matched-Z (`z = exp(s/fs)`)
   tracks the analog curve within ~0.6 dB through 10 kHz and undershoots gently above —
   a bounded, conservative error. The de-emphasis filter remains the exact algebraic
   inverse of the digital pre-emphasis filter, which is the property the app depends on.

3. **The time→space hop needs band-limited upsampling before linear interpolation
   (§4.2, §11.1).** As feared in risk 1, the naive round trip was not transparent: linear
   interpolation straight off audio-rate samples errs by (ω·dt)²/8 — a measured ~25%
   mid-sample error at 10 kHz. Fix: FIR-upsample 4× (`resample_poly`) before the linear
   map onto the (equally oversampled) spatial grid. Round-trip error is now < 2% RMS on a
   100 Hz–10 kHz multitone, asserted by test. The matched leaky-integrator /
   differentiator pair (exact algebraic inverses) exists for the same reason: `np.gradient`
   would have smeared −3 dB of fake HF loss over everything by 10 kHz.

4. **A user-controlled `start_radius` parameter was added (§4.1).** Designed late,
   educationally crucial: a 10 s clip travels only ~1.4 mm radially, so no user would ever
   *hear* radius-dependent physics inside one clip. Letting them place the clip anywhere
   from 146 mm to 62 mm turns the inner-groove effect from an assertion into an experiment
   (measured on the demo clip: 5–14 kHz loss goes from −1.6 dB to −6.6 dB).

5. **V-profile trough instead of a two-rail ribbon (§5.2).** The implemented cross-section
   is the actual Westrex groove: a V whose lateral position carries the mono sum and whose
   depth carries the stereo difference. It shows the same two-channel physics as the
   planned twin-rail ribbon but reads better under raking light and states the true
   geometry (a mono record's groove has constant depth — visible immediately).

6. **Plain CSS instead of Tailwind (§8).** One bespoke dark-theme layout with ~10
   components didn't earn a utility-class framework; a single stylesheet with custom
   properties is smaller and fully controlled.

7. **Performance postmortem: the one real bug was O(n·m).** The pipeline itself runs in
   ~0.7 s for a 8.6 s stereo clip, but the explanation-metrics pass initially took **80 s**
   — `np.convolve` with a 0.5 s boxcar kernel is O(n·m). Replaced with
   `scipy.ndimage.uniform_filter1d` (O(n) running mean): 0.07 s. The perf-budget test
   (§9) exists so this class of regression fails CI instead of shipping.

8. **A synthesized demo clip was added** (`backend/app/audio/demo.py`): a deterministic,
   copyright-free funk loop whose arrangement deliberately exercises every stage (bright
   hats for tracing loss, hot kick/bass for saturation, sustained detuned pad for wow,
   hard panning for crosstalk/vertical groove). Lowers the barrier to first contact with
   the app to one click.

9. **Transport clock uses `setInterval`, not `requestAnimationFrame`.** rAF freezes in
   hidden/backgrounded tabs while audio keeps playing; a 100 ms interval keeps the
   position readout honest everywhere.

10. **v0.2 ("Vinylize") changes, from user feedback.** (a) Renamed to Vinylize.
    (b) Clip cap raised 10 s → 60 s: the pipeline costs ~0.08 s of compute per
    clip-second, so worst case stays ~5 s per synchronous request — the ceiling where
    the design's no-job-queue decision (§3.1) still holds; going longer is a
    chunked/queued-processing project (§10), not a constant edit. A 60 s clip travels
    ~8.3 mm radially, so `SpiralMap` now clamps placement outward so clips physically
    fit, and the API reports the *effective* radius cut. Session LRU shrunk 32 → 6 to
    bound memory (~60 MB/session at 60 s). (c) A sidebar **library** keeps recent clips
    switchable (frontend list capacity = backend LRU capacity, evicted sessions
    self-remove on 404). (d) Default parameters now model a **well-worn, mid-disc
    record** (noise ×3, clicks ×3, wow ×2.5, drive ×2, stylus ×1.5, start 100 mm)
    because at 1×-everything the effects were too subtle for casual listening; 1× on
    every slider remains "pristine pressing, measured reality", and the UI says so
    explicitly rather than passing the exaggeration off as typical.

11. **v0.3 changes, from user feedback.** (a) Clip cap 60 s → **180 s**, paid for with
    real optimization rather than patience: the spatial domain moved to float32, the
    4x-oversample + linear-interpolation remap became 2x-oversample + cubic
    (Catmull-Rom) — cubic error falls with the 4th power of oversampling instead of the
    2nd, so it is simultaneously more accurate, half the memory, and less work — the
    SpiralMap's five stored diagnostic arrays became lazy properties, and transfer WAVs
    dropped to 16-bit PCM (quantization sits ~40 dB under the simulated noise floor).
    Measured: a 3-minute stereo render costs ~11 s and ~1.7 GB peak transient memory.
    (b) The pipeline reports **stage-level progress** through a session-scoped callback;
    the UI polls it and shows a real progress bar (weights are measured wall-clock
    shares, so the bar moves ~linearly). (c) The 3D view became a **working turntable**:
    the record group spins at true 33⅓ RPM against the audio clock while a fixed
    tonearm/needle rides the groove — the record group's rotation is phased so the
    playing groove point is always under the stylus. This exposed and fixed a latent
    bug: the fixed x40 radial exaggeration would have flung a 3-minute groove (25 mm of
    real travel) off the disc; both exaggerations are now adaptive and the modulation
    zoom is clamped so neighboring revolutions cannot visually collide. (d) A master
    **volume control** (0–4x through a limiter) because honest 1:1 gain was too quiet on
    laptop speakers.

12. **v0.4: the turntable scene rebuilt around real kinematics.** The v0.3 tonearm
    positioned its parts independently in world space and fed audio-rate wiggle into
    the whole arm — visually disconnected and jittery. Replaced wholesale: the arm is
    now a strict pivot-rooted hierarchy (pivot → assembly → tube/counterweight/
    headshell → cartridge → cantilever → stylus tip, all local coordinates) whose only
    per-frame updates are one yaw and a millimeter cantilever offset. The yaw is an
    analytic two-circle intersection solve (groove revolution about the spindle vs.
    stylus arc about the pivot, real 9" arm proportions: 212 mm pivot-to-spindle,
    229 mm effective length), with one iteration to find the groove section actually
    under the tip — reproducing genuine tracking-angle behavior — and graceful tangent
    clamping out of reach. Audio wiggle moved from the arm to the cantilever, which is
    where a real cartridge puts it. The scene grew into a full deck (plinth, platter,
    procedural canvas-texture label with the uploaded filename, arm rest, cue lever,
    soft shadows), plus an RPM/time/radius/status readout, camera reset, and a debug
    mode whose pure-math self-check (`validateKinematics`) confirms the tip lands on
    the contact groove's radius to <1 mm — measured 0.000 mm, since the solve is exact.

13. **v0.5: café listening-room environment.** The dark void became a night café: the
    deck sits on a procedurally-grained walnut table in a room with deep-green/navy
    walls, brass-framed rainy window (canvas-texture city-light bokeh), pendant lamps,
    a record shelf, and an espresso-bar silhouette — every prop simple boxes/cylinders
    plus two canvas textures, no external assets. The "depth of field" is atmospheric
    fog rather than a postprocessing pass: the background melts into warm blur at zero
    per-frame cost, keeping the 3-minute-groove performance budget intact (the
    environment is 100% static meshes; animated work remains record rotation, arm yaw,
    cantilever offset). Lighting per environment: pendant-motivated warm key with soft
    table shadows, cool window fill, and a neutral rim that keeps the tonearm's edge
    off the background. Orbit is fenced in the café (distance/polar/azimuth limits) so
    the camera can't leave the built corner of the room or dive under the table; a
    Café/Studio toggle preserves the original minimal look.
