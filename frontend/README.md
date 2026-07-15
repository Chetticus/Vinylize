# Vinylize — frontend

React + TypeScript + three.js (react-three-fiber) + zustand. Vite dev server proxies
`/api` to the backend on port 8000 — start the backend first.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle
```

## Layout

```
src/
  api/client.ts        typed fetch wrapper (WAV + raw float32 geometry payloads)
  audio/playbackEngine.ts  Web Audio: both buffers play in sync, A/B flips gains
  state/store.ts       zustand store; config-hash-cached processing
  components/
    Sidebar.tsx        upload / demo / file info / concepts
    Transport.tsx      play, sample-synced Original<->Vinyl switch, seek
    Waveform.tsx       canvas min/max peak renderer
    groove/            r3f turntable + multiscale groove inspector:
                       TurntableScene (deck, lighting, LOD wiring), RecordSurface +
                       GrooveOverviewMaterial (true-pitch procedural groove shader,
                       LOD 0-1), GrooveInspectionMesh (microscope V-trench from the
                       backend groove-window endpoint + MicroStylus + cutaway, LOD 2),
                       grooveLod (strategy + camera presets), grooveScale (honest-scale
                       policy), Tonearm (strict pivot hierarchy), tonearmKinematics
                       (analytic circle-intersection IK), recordMotion (clock/phase/
                       contact), grooveMath (true-scale spiral math), CafeEnvironment,
                       labelTexture (procedural canvas textures)
    tabs/              Waveform · 3D Groove · Compare · Explorer · DSP Controls
  types/api.ts         mirrors backend Pydantic schemas
```
