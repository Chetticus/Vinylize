/**
 * The record surface's groove strips as raw pixels — pure and DOM-free, so
 * the ~12 MB of normal and roughness data can be computed in a Web Worker
 * (see GrooveOverviewMaterial.ts for what the strips encode and why).
 */

/** Radial extent of the surface annulus — RecordSurface's geometry and this
 * texture strip must agree on these. */
export const SURFACE_R_IN = 50.5;
export const SURFACE_R_OUT = 151.5;

export const STRIP_H = 4096;

// The roughness map is genuinely 2D (u = angle, v = radius): angular finish
// variation is what makes the rotation VISIBLE — see pass 3 in buildStripPixels.
// 512 x 2048 RGBA = 4 MB, generated once per clip.
export const ROUGH_W = 512;
export const ROUGH_H = 2048;

// The normal map is 2D as well: its red channel carries the groove walls'
// tangential micro-waviness (the music's own wiggle), which is what makes
// glints slide around the disc as it spins. 512 x 4096 RGBA = 8 MB.
export const NORMAL_W = 512;

const RIM_MARGIN_R = 147.5;   // grooves start just inside the edge
const RUNOUT_HI = 57;         // music field ends, run-out spiral begins
const RUNOUT_LO = 53.5;       // dead wax from here to the label
const MUSIC_PITCH = 0.25;     // mm
const RUNOUT_PITCH = 1.6;     // mm
const VALLEY_HW = 0.075;      // mm — display half-width (>= 3 texels for smooth slopes)

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Distance (mm) to the nearest groove centre for rings at `pitch` anchored
 * at `rRef`, plus which turn index that centre is. */
function nearestGroove(r: number, rRef: number, pitch: number): { dist: number; turn: number } {
  const phase = (rRef - r) / pitch;
  const turn = Math.round(phase);
  return { dist: Math.abs(phase - turn) * pitch, turn };
}

/** Everything the strips depend on — small, so it can be posted to a worker. */
export interface StripInput {
  startRadiusMm: number;
  groovePitchUm: number;
  revolutions: number;
  /** Per-turn loudness, 256 bins (see loudnessBins). */
  loud: Float32Array;
}

export interface StripPixels {
  /** NORMAL_W x STRIP_H RGBA */
  normal: Uint8ClampedArray;
  /** ROUGH_W x ROUGH_H RGBA */
  rough: Uint8ClampedArray;
}

/** Pure: builds the normal and roughness strips as raw RGBA pixels. */
export function buildStripPixels(input: StripInput): StripPixels {
  const progStart = Math.min(input.startRadiusMm, RIM_MARGIN_R);
  const pitchMm = input.groovePitchUm / 1000;
  const progEnd = progStart - input.revolutions * pitchMm;
  const loud = input.loud;
  const turnsTotal = Math.max(input.revolutions, 1e-3);
  const drMm = (SURFACE_R_OUT - SURFACE_R_IN) / STRIP_H; // radial mm per row

  // Pass 1: physical height per row, in millimeters (0 = land level).
  // Micro-scale on purpose: a ~28-50 um valley over a 75 um half-width gives
  // groove-wall slopes of ~20-30 degrees — fine rings that catch light, never
  // engraved channels.
  const heightMm = new Float32Array(STRIP_H);
  const roughArr = new Float32Array(STRIP_H);
  for (let j = 0; j < STRIP_H; j++) {
    const r = SURFACE_R_IN + ((j + 0.5) / STRIP_H) * (SURFACE_R_OUT - SURFACE_R_IN);

    let valleyMm = 0;
    let extraRough = 0;

    if (r <= RIM_MARGIN_R && r > RUNOUT_HI) {
      // Music-pitch groove field across the whole playable surface.
      const { dist, turn } = nearestGroove(r, RIM_MARGIN_R, MUSIC_PITCH);
      // Silent turns are shallow-but-visible; the clip's program band
      // modulates with its own per-turn loudness (louder = cut wider/deeper).
      let depth = 0.028;
      if (r <= progStart && r >= progEnd) {
        const progTurn = (progStart - r) / pitchMm;
        const li = Math.min(255, Math.max(0, Math.floor((progTurn / turnsTotal) * 256)));
        depth = 0.024 + 0.024 * loud[li];
        extraRough = 0.1 * loud[li];
      }
      // Pressing variation: slow drift + per-turn jitter, never uniform.
      depth *= 0.9 + 0.2 * hash(Math.floor(r * 0.35)) + 0.06 * (hash(turn) - 0.5);
      valleyMm = depth * Math.exp(-(dist * dist) / (VALLEY_HW * VALLEY_HW));
    } else if (r <= RUNOUT_HI && r > RUNOUT_LO) {
      // Run-out spiral: same groove, far wider land between turns.
      const { dist } = nearestGroove(r, RUNOUT_HI, RUNOUT_PITCH);
      valleyMm = 0.032 * Math.exp(-(dist * dist) / (VALLEY_HW * VALLEY_HW));
    } else if (r <= RUNOUT_LO && r > RUNOUT_LO - 0.6) {
      // Locked groove hugging the dead wax.
      const { dist } = nearestGroove(r, RUNOUT_LO, 0.3);
      valleyMm = 0.028 * Math.exp(-(dist * dist) / (VALLEY_HW * VALLEY_HW));
    }

    // A whisper of radial manufacturing texture keeps the land from reading
    // as mathematically flat.
    heightMm[j] = 0.0015 * hash(j * 1.7) - valleyMm;
    // Roughness baseline: polished land, scuffed groove walls, loud turns
    // slightly coarser. Absolute values (material.roughness = 1, map
    // multiplies); the angular detail is layered on top in pass 3.
    roughArr[j] = Math.max(
      0.04,
      Math.min(1, 0.3 + (valleyMm / 0.05) * 0.28 + extraRough + 0.02 * hash(j * 3.1 + 7)),
    );
  }

  // Pass 2: encode slope as a tangent-space normal map. With polar UVs the
  // texture's +v axis is the outward radial, so the radial groove-wall slope
  // dH/dr lands in the GREEN channel: n = normalize((jx, -dH/dv, 1)) in
  // (T, B, N).
  //
  // The RED channel carries TANGENTIAL micro-waviness inside the groove
  // valleys, keyed to the clip's per-turn loudness. This is the honest
  // source of vinyl's rotating sparkle: a cut groove wall is not a smooth
  // ring — it carries the music's wiggle — so each patch of wall throws its
  // glint in a slightly different direction, and the glints visibly slide
  // as the disc turns. Without it, perfect rings are rotationally symmetric
  // and the spinning record looks frozen.
  const normalImg = { data: new Uint8ClampedArray(NORMAL_W * STRIP_H * 4) };

  // Hairline scratches, shared by the normal and roughness passes. Defined
  // in normalized (u, v) so both texture resolutions can rasterize them.
  // Mostly radial (narrow in angle, long in radius): as the disc turns, each
  // one sweeps through the key light and FLASHES once per revolution — on a
  // real record this is the single strongest "it's spinning" cue. Their
  // normal tilt is single-signed (a drag scratch has one dominant wall), so
  // the flash survives mip averaging instead of cancelling.
  interface Scuff { u0: number; uHw: number; v0: number; v1: number; s: number }
  const scuffs: Scuff[] = [];
  for (let k = 0; k < 12; k++) {
    const v0 = hash(k * 3.7 + 1) * 0.85;
    scuffs.push({
      u0: hash(k * 1.3),
      uHw: (0.6 + hash(k * 2.1) * 1.2) / ROUGH_W,
      v0,
      v1: Math.min(1, v0 + 0.1 + hash(k * 5.3) * 0.3),
      s: 0.55 + hash(k * 7.9) * 0.45, // wall tilt at the scratch (steep!)
    });
  }
  const scratchTiltAt = (u: number, v: number): number => {
    let jx = 0;
    for (const sc of scuffs) {
      if (v >= sc.v0 && v <= sc.v1) {
        let du = Math.abs(u - sc.u0);
        du = Math.min(du, 1 - du); // wrap around the disc
        if (du < sc.uHw) jx += sc.s * (1 - du / sc.uHw);
      }
    }
    return jx;
  };

  // Low-frequency "polish domain" waviness: mm-scale patches of coherent
  // tangential tilt (the faint orange-peel swim a real pressing shows under
  // a lamp). Deliberately LOW frequency so it survives mip minification at
  // turntable distance — the per-texel jitter below carries the close-range
  // sparkle but averages away in the mips; this layer is what keeps the
  // rotation readable from across the room.
  const DOM_U = 32;
  const DOM_V = 64;
  const domain = new Float32Array(DOM_U * DOM_V);
  for (let i = 0; i < domain.length; i++) domain[i] = hash(i * 17.31 + 3) - 0.5;
  const domainAt = (u: number, v: number): number => {
    const x = u * DOM_U, y = v * DOM_V;
    const x0 = Math.floor(x) % DOM_U, y0 = Math.min(DOM_V - 1, Math.floor(y));
    const x1 = (x0 + 1) % DOM_U, y1 = Math.min(DOM_V - 1, y0 + 1);
    const fx = x - Math.floor(x), fy = y - Math.floor(y);
    const a = domain[y0 * DOM_U + x0] * (1 - fx) + domain[y0 * DOM_U + x1] * fx;
    const b = domain[y1 * DOM_U + x0] * (1 - fx) + domain[y1 * DOM_U + x1] * fx;
    return a * (1 - fy) + b * fy;
  };

  for (let j = 0; j < STRIP_H; j++) {
    const jm = Math.max(j - 1, 0);
    const jp = Math.min(j + 1, STRIP_H - 1);
    const slope = (heightMm[jp] - heightMm[jm]) / ((jp - jm) * drMm); // dH/dr
    const valleyNorm = Math.min(1, -Math.min(heightMm[j], 0) / 0.03);

    const r = SURFACE_R_IN + ((j + 0.5) / STRIP_H) * (SURFACE_R_OUT - SURFACE_R_IN);
    const turn = Math.round((RIM_MARGIN_R - r) / MUSIC_PITCH);
    let loudHere = 0.25; // silent/blank turns still have lead-in-level texture
    if (r <= progStart && r >= progEnd) {
      const progTurn = (progStart - r) / pitchMm;
      const li = Math.min(255, Math.max(0, Math.floor((progTurn / turnsTotal) * 256)));
      loudHere = 0.3 + 0.7 * loud[li];
    }
    // Peak tangential slope ~0.16 (~9 deg) on loud walls — micro-waviness,
    // far shallower than the ~30 deg radial walls it decorates.
    const jAmp = valleyNorm * 0.16 * loudHere;

    // Domains only exist where there is groove texture to deform (the bare
    // rim margin and dead wax stay optically flat).
    const grooved = r <= RIM_MARGIN_R && r > RUNOUT_LO - 0.6 ? 1 : 0;
    const vFrac = j / STRIP_H;

    const rowOff = j * NORMAL_W * 4;
    for (let x = 0; x < NORMAL_W; x++) {
      const uFrac = x / NORMAL_W;
      const jx =
        jAmp * 2 * (hash(x * 7919 + turn * 104729) - 0.5) +
        grooved * (0.22 * domainAt(uFrac, vFrac) + scratchTiltAt(uFrac, vFrac));
      const inv = 1 / Math.hypot(jx, slope, 1);
      const o = rowOff + x * 4;
      normalImg.data[o] = Math.round((jx * inv * 0.5 + 0.5) * 255);
      normalImg.data[o + 1] = Math.round((-slope * inv * 0.5 + 0.5) * 255);
      normalImg.data[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      normalImg.data[o + 3] = 255;
    }
  }

  // Pass 3: the 2D roughness map — where the SPIN becomes visible.
  //
  // Perfect concentric rings are rotationally symmetric: a spinning disc of
  // them renders identically every frame, so the record looks frozen even
  // though it turns. Real records read as spinning because their FINISH
  // varies with angle. Four honest layers provide that, all in roughness
  // (they modulate how each patch scatters the highlights, so glints slide
  // around the disc as it rotates):
  //   1. groove sparkle — per-(turn, angle) glint noise, stronger on the
  //      clip's loud turns (wider cut = more light scatter);
  //   2. pressing haze — low-frequency blotches from uneven stamper polish;
  //   3. a few hairline scuffs crossing the grooves radially (these sweep
  //      through the highlight once per revolution — the strongest cue);
  //   4. sparse dust specks.
  const roughImg = { data: new Uint8ClampedArray(ROUGH_W * ROUGH_H * 4) };

  // Precompute per-row (radius) values at roughness resolution.
  const rowBase = new Float32Array(ROUGH_H);
  const rowValley = new Float32Array(ROUGH_H);
  const rowLoud = new Float32Array(ROUGH_H);
  const rowTurn = new Int32Array(ROUGH_H);
  for (let j = 0; j < ROUGH_H; j++) {
    const src = Math.min(STRIP_H - 1, Math.floor((j / ROUGH_H) * STRIP_H));
    rowBase[j] = roughArr[src];
    rowValley[j] = Math.min(1, -Math.min(heightMm[src], 0) / 0.04);
    const r = SURFACE_R_IN + ((j + 0.5) / ROUGH_H) * (SURFACE_R_OUT - SURFACE_R_IN);
    rowTurn[j] = Math.round((RIM_MARGIN_R - r) / MUSIC_PITCH);
    if (r <= progStart && r >= progEnd) {
      const progTurn = (progStart - r) / pitchMm;
      const li = Math.min(255, Math.max(0, Math.floor((progTurn / turnsTotal) * 256)));
      rowLoud[j] = loud[li];
    }
  }

  // Pressing-haze grid, bilinearly sampled.
  const HAZE = 16;
  const haze = new Float32Array(HAZE * HAZE);
  for (let i = 0; i < haze.length; i++) haze[i] = hash(i * 13.7 + 5) - 0.5;
  const hazeAt = (u: number, v: number): number => {
    const x = u * HAZE, y = v * HAZE;
    const x0 = Math.floor(x) % HAZE, y0 = Math.min(HAZE - 1, Math.floor(y));
    const x1 = (x0 + 1) % HAZE, y1 = Math.min(HAZE - 1, y0 + 1);
    const fx = x - Math.floor(x), fy = y - Math.floor(y);
    const a = haze[y0 * HAZE + x0] * (1 - fx) + haze[y0 * HAZE + x1] * fx;
    const b = haze[y1 * HAZE + x0] * (1 - fx) + haze[y1 * HAZE + x1] * fx;
    return a * (1 - fy) + b * fy;
  };

  for (let j = 0; j < ROUGH_H; j++) {
    const rowOff = j * ROUGH_W * 4;
    for (let i = 0; i < ROUGH_W; i++) {
      let rough = rowBase[j];
      // 1. groove sparkle (only where there is groove to sparkle)
      rough +=
        rowValley[j] *
        (hash(i * 7919 + rowTurn[j] * 104729) - 0.5) *
        0.26 *
        (0.45 + 0.55 * rowLoud[j]);
      // 2. pressing haze
      rough += 0.07 * hazeAt(i / ROUGH_W, j / ROUGH_H);
      // 3. scuffs (shared geometry with the normal map's scratch tilt, so
      //    the flash and the matte line coincide)
      rough += 0.22 * Math.min(1, scratchTiltAt(i / ROUGH_W, j / ROUGH_H));
      // 4. dust
      if (hash(i * 31.7 + j * 517.3) > 0.9994) rough += 0.3;

      const rb = Math.round(Math.max(0.04, Math.min(1, rough)) * 255);
      const o = rowOff + i * 4;
      roughImg.data[o] = roughImg.data[o + 1] = roughImg.data[o + 2] = rb;
      roughImg.data[o + 3] = 255;
    }
  }
  return { normal: normalImg.data, rough: roughImg.data };
}
