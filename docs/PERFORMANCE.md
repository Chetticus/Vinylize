# Listening-room performance pass

## Changes

- App, sidebar, story, and room select only the store fields they use. The
  100 ms playback clock updates the transport, not the full 3D component tree.
- The room canvas stays mounted across pages/songs. It renders on demand
  while idle, continuously during playback/record changes/camera easing,
  and not at all while the story is active or the document is hidden.
- Opaque static furniture is merged by shared material, shadow flags, and
  render order. Transparency, instanced leaves, and meshes with children
  remain separate. Batching yields between groups during initial loading.
- Sunlight shadow maps update at room preparation and completed record swaps,
  rather than repeatedly drawing all furniture. High quality alone enables
  the secondary deck shadow, at up to four refreshes per second.
- Desktop quality is restored to high: full-resolution textures, all props,
  2048 sunlight shadows, the secondary deck shadow, and DPR 1.5–2, including
  supersampling on 1× displays. Texture anisotropy is restored to 8.
  After 240 continuous-playback frames, sustained performance below 30 fps
  can lower DPR by 0.15 but never below 1.5 in high mode or 1 in other modes.
  Sustained fast frames restore resolution. Touch retains medium defaults,
  and explicit quality query options remain available for diagnosis.
- Audio buffers are reused in a two-entry, 256 MiB-budget decoded cache.
  Full-buffer waveform scans and unused microscope-detail resampling are
  skipped. Fetch/decode contexts and stopped playback source graphs release
  resources, including on decoding failure and natural playback completion.
- Digital bypasses the vinyl acoustic/limiter graph entirely. The vinyl room
  tail fades out during a switch to Digital. Digital WAVs use float32 to
  preserve decoded source samples; the vinyl WAV remains compact PCM16. This
  doubles Digital transfer size, but not its decoded browser memory footprint.
- The story and 3D page load in separate chunks. The entry JavaScript is
  approximately 167 kB (55 kB gzipped); the 3D chunk is still approximately
  1.16 MB (357 kB gzipped), mostly the rendering stack. This pass does not
  claim to remove the cost of downloading or initially compiling that stack.

## Record stability

The old closed record cylinder placed its top face only 0.04 mm below the
groove annulus. Open cylinder sides plus a separate underside remove that
overlap. The label has a clear height separation, the camera depth range is
tightened, and the record no longer wobbles visually. Groove normal/clearcoat
strength is gentler to reduce specular shimmer. Maps upload before incoming
records become visible, and shared geometry is not disposed on material
changes. Rapid switches back to the outgoing record cannot strand the
animation waiting for a mount that never happens.

## Validation and limits

The earlier local embedded-browser baseline was approximately 22–24 fps,
132 peak draw calls, and DPR 1.5. These are observations from that specific
preview, not a cross-device benchmark. Browser access was blocked by the
tool's security policy during the final verification pass, so no verified
after-FPS number or final visual sign-off is claimed.

The production TypeScript/Vite build, 33 backend regression tests, and 12
frontend audio/quality tests pass. All three actual local song files also pass
the full analyze/process/WAV/geometry smoke test (about 11–16 seconds per
initial render on this machine; this measures audio preparation, not FPS).
Frontend mocked Web Audio tests verify the preserved Room gain/response,
sample-synchronized starts, scheduling headroom, and graph cleanup on seek
and completion. Backend tests verify catalogue order, sampled-noise gain
and loop boundaries, physical-noise fallback, and identical warmth/geometry
when the surface texture is disabled.

For a comparable manual check, open the dev site with `?profile=1`, select
a song, play it, and read `[vinylize performance]` in the browser console.
Compare continuous playback at the same canvas dimensions; demand-rendered
idle readings are not an FPS benchmark. Check each song exchange, cursor-only
camera movement, headshell dragging/cancellation, and returning from the story.
