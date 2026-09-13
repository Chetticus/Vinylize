/**
 * Procedural textures for the listening room — every one painted in code from
 * a seed. No image files, no downloads, no generated artwork: these are
 * material studies (grain, weave, glaze, plaster) computed pixel by pixel,
 * plus a handful of plain geometric sleeve designs.
 *
 * Each painter returns up to three maps:
 *   map    — base colour (sRGB)
 *   normal — tangent-space relief derived from a height field
 *   orm    — packed data: R = ambient occlusion, G = roughness, B = metalness
 *            (three reads AO from R, roughness from G, metalness from B, so a
 *            single texture serves all three slots)
 *
 * Sizes scale with the quality tier; painters are called once per session
 * through the room kit's cache, never per render.
 */

import * as THREE from "three";

import { Fbm, TileNoise, clamp01, hex, mix, normalFromHeight, rng, smooth } from "./noise";

export interface Painted {
  map: THREE.CanvasTexture;
  normal?: THREE.CanvasTexture;
  orm?: THREE.CanvasTexture;
}

interface Surface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img: ImageData;
  d: Uint8ClampedArray;
}

function surface(w: number, h: number): Surface {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: false })!;
  const img = ctx.createImageData(w, h);
  return { canvas, ctx, img, d: img.data };
}

function toTexture(
  s: Surface,
  color: boolean,
  repeat: [number, number] = [1, 1],
  put = true,
): THREE.CanvasTexture {
  if (put) s.ctx.putImageData(s.img, 0, 0);
  const t = new THREE.CanvasTexture(s.canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Build a normal map texture from a height array. */
function normalTex(h: Float32Array, w: number, hh: number, strength: number, repeat?: [number, number]) {
  const s = surface(w, hh);
  normalFromHeight(h, w, hh, strength, s.d);
  return toTexture(s, false, repeat);
}

// ---------------------------------------------------------------------------
// Wood
// ---------------------------------------------------------------------------

export interface WoodOptions {
  seed: number;
  w: number;
  h: number;
  light: string;
  dark: string;
  /** Growth rings across the board. */
  rings: number;
  /** How much the rings wander (cathedral figure). */
  figure: number;
  /** Surface finish: [min, max] roughness. */
  rough: [number, number];
  relief?: number;
  /** Console-top only: wear along the edge nearest the listener, a cup ring
   * at a UV position, and a few restrained scratches. */
  wear?: { edgeV: number; ring?: [number, number, number]; scratches?: number };
  repeat?: [number, number];
}

/**
 * Grain runs along canvas X (texture U). Rings are sine bands across V,
 * warped by low-frequency noise so they wander like real flat-sawn boards;
 * pores are anisotropic noise stretched along the grain.
 */
export function paintWood(o: WoodOptions): Painted {
  const { w, h } = o;
  const col = surface(w, h);
  const orm = surface(w, h);
  const height = new Float32Array(w * h);
  const warp = new Fbm(o.seed, 2, 3, 4);
  const pores = new TileNoise(o.seed + 7, 64, Math.max(64, h >> 1));
  const fine = new TileNoise(o.seed + 11, 180, Math.max(96, h >> 1));
  const blotch = new Fbm(o.seed + 23, 2, 2, 3);
  const L = hex(o.light);
  const D = hex(o.dark);
  const r = rng(o.seed + 99);

  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const wv = warp.at(u, v);
      const ring = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (v * o.rings + (wv - 0.5) * o.figure));
      const late = Math.pow(ring, 7);
      const p = pores.at(u, v);
      const f = fine.at(u, v);
      const b = blotch.at(u, v);
      const t = clamp01(0.5 * late + 0.22 * p + 0.18 * f + 0.28 * (b - 0.5) + 0.15);
      const i = y * w + x;
      const o4 = i * 4;
      col.d[o4] = mix(L[0], D[0], t);
      col.d[o4 + 1] = mix(L[1], D[1], t);
      col.d[o4 + 2] = mix(L[2], D[2], t);
      col.d[o4 + 3] = 255;
      const pore = p > 0.7 ? (p - 0.7) * 3 : 0;
      height[i] = -late * 0.5 - pore * 0.6 + f * 0.08;
      orm.d[o4] = 255;
      orm.d[o4 + 1] = mix(o.rough[0], o.rough[1], clamp01(0.35 * late + 0.65 * pore + 0.2 * f)) * 255;
      orm.d[o4 + 2] = 0;
      orm.d[o4 + 3] = 255;
    }
  }

  if (o.wear) {
    // Hands rest on the listener's edge: the finish there is rubbed lighter
    // and slightly glossier, fading over ~6% of the depth.
    const ev = o.wear.edgeV;
    for (let y = 0; y < h; y++) {
      const dv = Math.abs(y / h - ev);
      const k = 1 - smooth(0, 0.07, dv);
      if (k <= 0) continue;
      for (let x = 0; x < w; x++) {
        const o4 = (y * w + x) * 4;
        const lift = k * (0.1 + 0.08 * blotch.at(x / w, 0.3));
        col.d[o4] = mix(col.d[o4], 214, lift * 0.5);
        col.d[o4 + 1] = mix(col.d[o4 + 1], 176, lift * 0.5);
        col.d[o4 + 2] = mix(col.d[o4 + 2], 132, lift * 0.5);
        orm.d[o4 + 1] *= 1 - k * 0.18;
      }
    }
    if (o.wear.ring) {
      // One faint, old cup ring — a slightly darker, glossier annulus.
      const [cu, cv, rr] = o.wear.ring;
      const cx = cu * w;
      const cy = cv * h;
      const rad = rr * w;
      for (let y = Math.max(0, (cy - rad * 1.3) | 0); y < Math.min(h, cy + rad * 1.3); y++) {
        for (let x = Math.max(0, (cx - rad * 1.3) | 0); x < Math.min(w, cx + rad * 1.3); x++) {
          const dist = Math.hypot(x - cx, y - cy);
          const band = Math.exp(-Math.pow((dist - rad) / (rad * 0.045), 2));
          const broken = 0.55 + 0.45 * pores.at(x / w * 3, y / h * 3);
          const k = band * broken * 0.5;
          const o4 = (y * w + x) * 4;
          col.d[o4] *= 1 - k * 0.35;
          col.d[o4 + 1] *= 1 - k * 0.38;
          col.d[o4 + 2] *= 1 - k * 0.4;
          orm.d[o4 + 1] *= 1 - k * 0.5;
        }
      }
    }
    const n = o.wear.scratches ?? 0;
    for (let s = 0; s < n; s++) {
      // Short, shallow, mostly along the grain — the kind a sleeve edge leaves.
      let x = r() * w;
      let y = (0.25 + r() * 0.6) * h;
      const len = (0.02 + r() * 0.05) * w;
      const ang = (r() - 0.5) * 0.5;
      for (let k = 0; k < len; k++) {
        x += Math.cos(ang);
        y += Math.sin(ang) + (r() - 0.5) * 0.3;
        const xi = x | 0;
        const yi = y | 0;
        if (xi < 0 || yi < 0 || xi >= w || yi >= h) break;
        const fadeK = Math.sin((k / len) * Math.PI) * 0.35;
        const i = yi * w + xi;
        col.d[i * 4] = mix(col.d[i * 4], 196, fadeK);
        col.d[i * 4 + 1] = mix(col.d[i * 4 + 1], 162, fadeK);
        col.d[i * 4 + 2] = mix(col.d[i * 4 + 2], 124, fadeK);
        height[i] -= 0.35 * fadeK;
      }
    }
  }

  const rep = o.repeat ?? [1, 1];
  return {
    map: toTexture(col, true, rep),
    orm: toTexture(orm, false, rep),
    normal: normalTex(height, w, h, o.relief ?? 2.2, rep),
  };
}

// ---------------------------------------------------------------------------
// Painted plaster
// ---------------------------------------------------------------------------

export function paintPlaster(seed: number, tint: string, size: number): Painted {
  const w = size;
  const h = size;
  const col = surface(w, h);
  const orm = surface(w, h);
  const height = new Float32Array(w * h);
  const broad = new Fbm(seed, 2, 2, 4, 0.55);
  const trowel = new Fbm(seed + 5, 6, 3, 3);
  const grit = new TileNoise(seed + 9, size >> 2, size >> 2);
  const T = hex(tint);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const b = broad.at(u, v);
      const tr = trowel.at((u + v * 0.35) % 1, v);
      const g = grit.at(u, v);
      const shade = 1 + (b - 0.5) * 0.09 + (tr - 0.5) * 0.04 + (g - 0.5) * 0.03;
      const i = y * w + x;
      const o4 = i * 4;
      col.d[o4] = T[0] * shade;
      col.d[o4 + 1] = T[1] * shade;
      col.d[o4 + 2] = T[2] * shade;
      col.d[o4 + 3] = 255;
      height[i] = tr * 0.6 + g * 0.25 + b * 0.4;
      orm.d[o4] = 255;
      orm.d[o4 + 1] = (0.86 + (g - 0.5) * 0.08) * 255;
      orm.d[o4 + 2] = 0;
      orm.d[o4 + 3] = 255;
    }
  }
  return { map: toTexture(col, true), orm: toTexture(orm, false), normal: normalTex(height, w, h, 1.1) };
}

// ---------------------------------------------------------------------------
// Floorboards
// ---------------------------------------------------------------------------

/** Boards run along canvas X. Each board has its own tint, grain phase and
 * end joints; seams are dark and slightly sunken. */
export function paintFloor(seed: number, w: number, h: number, boards: number): Painted {
  const col = surface(w, h);
  const orm = surface(w, h);
  const height = new Float32Array(w * h);
  const r = rng(seed);
  const boardH = h / boards;
  const warp = new Fbm(seed + 3, 3, 2, 3);
  const pores = new TileNoise(seed + 4, 96, 256);
  const path = new Fbm(seed + 8, 2, 2, 3);
  const tints: number[] = [];
  const joints: number[][] = [];
  const phases: number[] = [];
  for (let b = 0; b < boards; b++) {
    tints.push(0.84 + r() * 0.3);
    phases.push(r() * 10);
    const js: number[] = [];
    let at = r() * 0.5;
    while (at < 1) {
      js.push(at);
      at += 0.35 + r() * 0.45;
    }
    joints.push(js);
  }
  const L = hex("#8a6546");
  const D = hex("#3f2a1c");
  for (let y = 0; y < h; y++) {
    const b = Math.min(boards - 1, Math.floor(y / boardH));
    const inBoard = (y - b * boardH) / boardH;
    const seam = Math.min(inBoard, 1 - inBoard) * boardH;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      // End joints: the segment index changes the grain phase and tint.
      let seg = 0;
      let jointDist = 1e9;
      for (const j of joints[b]) {
        if (u > j) seg++;
        jointDist = Math.min(jointDist, Math.abs(u - j) * w);
      }
      const ph = phases[b] + seg * 1.7;
      const tint = tints[b] * (1 + ((seg * 37) % 7) * 0.012);
      const wv = warp.at(u, v);
      const ring = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (inBoard * 5 + ph + (wv - 0.5) * 2.4));
      const late = Math.pow(ring, 6);
      const p = pores.at(u, v);
      const wear = path.at(u, v);
      let t = clamp01(0.45 * late + 0.25 * p + 0.2);
      const edge = Math.min(seam, jointDist);
      const gap = edge < 1.2 ? 1 : edge < 2.6 ? (2.6 - edge) / 1.4 : 0;
      const i = y * w + x;
      const o4 = i * 4;
      const k = tint * (1 - gap * 0.55);
      col.d[o4] = mix(L[0], D[0], t) * k;
      col.d[o4 + 1] = mix(L[1], D[1], t) * k;
      col.d[o4 + 2] = mix(L[2], D[2], t) * k;
      col.d[o4 + 3] = 255;
      height[i] = -late * 0.3 - gap * 1.2 - (p > 0.72 ? (p - 0.72) * 1.5 : 0);
      orm.d[o4] = (1 - gap * 0.5) * 255;
      orm.d[o4 + 1] = clamp01(0.48 + late * 0.12 + (wear - 0.5) * 0.18 + gap * 0.3) * 255;
      orm.d[o4 + 2] = 0;
      orm.d[o4 + 3] = 255;
      t += 0;
    }
  }
  return { map: toTexture(col, true), orm: toTexture(orm, false), normal: normalTex(height, w, h, 2.4) };
}

// ---------------------------------------------------------------------------
// Woven rug
// ---------------------------------------------------------------------------

/** A flat-weave rug: over-under weave cells, two border bands and a quiet
 * stepped-diamond field, faded and softened where feet have worn it. */
export function paintRug(seed: number, w: number, h: number): Painted {
  const col = surface(w, h);
  const orm = surface(w, h);
  const height = new Float32Array(w * h);
  const fadeN = new Fbm(seed, 3, 2, 4);
  const fibre = new TileNoise(seed + 2, w >> 1, h >> 1);
  const field = hex("#5b3a30");
  const band = hex("#2e333b");
  const cream = hex("#a49780");
  const ochre = hex("#7f6540");
  const cell = 3;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const bx = Math.min(u, 1 - u) * w;
      const by = Math.min(v, 1 - v) * h;
      const border = Math.min(bx, by);
      let c: [number, number, number];
      if (border < 0.035 * h) c = band;
      else if (border < 0.05 * h) c = cream;
      else if (border < 0.1 * h) c = ((Math.floor(bx / 7) + Math.floor(by / 7)) % 2 === 0 ? band : ochre);
      else if (border < 0.115 * h) c = cream;
      else {
        // Stepped diamonds: Manhattan distance to a lattice, quantised.
        const gx = ((u * 14) % 1) - 0.5;
        const gy = ((v * 10) % 1) - 0.5;
        const m = Math.abs(gx) + Math.abs(gy);
        const step = Math.floor(m * 9);
        c = step === 3 ? ochre : step === 6 ? band : field;
      }
      // Weave: alternate warp and weft cells.
      const wx = Math.floor(x / cell);
      const wy = Math.floor(y / cell);
      const over = (wx + wy) % 2 === 0;
      const inCell = over ? ((x % cell) + 0.5) / cell : ((y % cell) + 0.5) / cell;
      const bump = Math.sin(inCell * Math.PI);
      const f = fibre.at(u, v);
      const worn = smooth(0.45, 0.8, fadeN.at(u, v)) * 0.35;
      const shade = (0.82 + bump * 0.18 + (f - 0.5) * 0.12) * (1 + worn * 0.25);
      const i = y * w + x;
      const o4 = i * 4;
      // Wear drifts colour toward the undyed cream of the warp threads.
      col.d[o4] = mix(c[0], cream[0], worn * 0.6) * shade;
      col.d[o4 + 1] = mix(c[1], cream[1], worn * 0.6) * shade;
      col.d[o4 + 2] = mix(c[2], cream[2], worn * 0.6) * shade;
      col.d[o4 + 3] = 255;
      height[i] = bump * 0.7 + f * 0.2;
      orm.d[o4] = (0.75 + bump * 0.25) * 255;
      orm.d[o4 + 1] = 0.95 * 255;
      orm.d[o4 + 2] = 0;
      orm.d[o4 + 3] = 255;
    }
  }
  return { map: toTexture(col, true), orm: toTexture(orm, false), normal: normalTex(height, w, h, 1.6) };
}

// ---------------------------------------------------------------------------
// Leather
// ---------------------------------------------------------------------------

/** Aged cognac leather: pebble grain, a lighter patina where it is sat on,
 * and a few soft creases. The seat centre is at canvas centre. */
export function paintLeather(seed: number, size: number): Painted {
  const w = size;
  const h = size;
  const col = surface(w, h);
  const orm = surface(w, h);
  const height = new Float32Array(w * h);
  const broad = new Fbm(seed, 2, 2, 4);
  const pebble = new TileNoise(seed + 3, size >> 2, size >> 2);
  const pebble2 = new TileNoise(seed + 4, size >> 3, size >> 3);
  const base = hex("#4f2d1b");
  const worn = hex("#8c5a36");
  const r = rng(seed + 50);
  const creases: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 9; i++) creases.push([0.25 + r() * 0.5, 0.25 + r() * 0.5, (r() - 0.5) * 0.6, 0.08 + r() * 0.14]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const b = broad.at(u, v);
      const pb = pebble.at(u, v) * 0.6 + pebble2.at(u, v) * 0.4;
      const centre = 1 - smooth(0.12, 0.48, Math.hypot(u - 0.5, v - 0.52));
      let crease = 0;
      for (const [cu, cv, ang, len] of creases) {
        const dx = u - cu;
        const dy = v - cv;
        const along = dx * Math.cos(ang) + dy * Math.sin(ang);
        const across = -dx * Math.sin(ang) + dy * Math.cos(ang);
        if (Math.abs(along) < len) {
          crease += Math.exp(-Math.pow(across / 0.004, 2)) * (1 - Math.abs(along) / len);
        }
      }
      const patina = clamp01(centre * 0.6 + (b - 0.45) * 0.8);
      const i = y * w + x;
      const o4 = i * 4;
      const k = (0.9 + pb * 0.14) * (1 - crease * 0.25);
      col.d[o4] = mix(base[0], worn[0], patina) * k;
      col.d[o4 + 1] = mix(base[1], worn[1], patina) * k;
      col.d[o4 + 2] = mix(base[2], worn[2], patina) * k;
      col.d[o4 + 3] = 255;
      height[i] = pb * 0.5 - crease * 0.6;
      orm.d[o4] = (1 - crease * 0.3) * 255;
      orm.d[o4 + 1] = clamp01(0.62 - patina * 0.2 + pb * 0.12) * 255;
      orm.d[o4 + 2] = 0;
      orm.d[o4 + 3] = 255;
    }
  }
  return { map: toTexture(col, true), orm: toTexture(orm, false), normal: normalTex(height, w, h, 2.8) };
}

// ---------------------------------------------------------------------------
// Brushed metal
// ---------------------------------------------------------------------------

export function paintBrushed(seed: number, size: number, tone: string): Painted {
  const w = size;
  const h = size;
  const col = surface(w, h);
  const orm = surface(w, h);
  const height = new Float32Array(w * h);
  const streak = new TileNoise(seed, 6, size);
  const streak2 = new TileNoise(seed + 1, 3, size >> 2);
  const T = hex(tone);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const s = streak.at(u, v) * 0.7 + streak2.at(u, v) * 0.3;
      const i = y * w + x;
      const o4 = i * 4;
      const k = 0.95 + s * 0.1;
      col.d[o4] = T[0] * k;
      col.d[o4 + 1] = T[1] * k;
      col.d[o4 + 2] = T[2] * k;
      col.d[o4 + 3] = 255;
      height[i] = s;
      orm.d[o4] = 255;
      orm.d[o4 + 1] = (0.26 + s * 0.16) * 255;
      orm.d[o4 + 2] = 255;
      orm.d[o4 + 3] = 255;
    }
  }
  return { map: toTexture(col, true), orm: toTexture(orm, false), normal: normalTex(height, w, h, 0.6) };
}

// ---------------------------------------------------------------------------
// Speckled ceramic glaze
// ---------------------------------------------------------------------------

export function paintCeramic(seed: number, size: number, glaze: string, speck: string): Painted {
  const w = size;
  const h = size >> 1;
  const col = surface(w, h);
  const orm = surface(w, h);
  const pool = new Fbm(seed, 4, 2, 3);
  const G = hex(glaze);
  const S = hex(speck);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = pool.at(x / w, y / h);
      const o4 = (y * w + x) * 4;
      const k = 0.94 + p * 0.1;
      col.d[o4] = G[0] * k;
      col.d[o4 + 1] = G[1] * k;
      col.d[o4 + 2] = G[2] * k;
      col.d[o4 + 3] = 255;
      orm.d[o4] = 255;
      orm.d[o4 + 1] = (0.16 + p * 0.1) * 255;
      orm.d[o4 + 2] = 0;
      orm.d[o4 + 3] = 255;
    }
  }
  // Iron speckles: many small, a few larger, slightly glossier than glaze.
  const r = rng(seed + 17);
  const count = (w * h) / 90;
  for (let i = 0; i < count; i++) {
    const x = (r() * w) | 0;
    const y = (r() * h) | 0;
    const big = r() > 0.94;
    const rad = big ? 2 : 1;
    for (let yy = -rad + 1; yy < rad; yy++) {
      for (let xx = -rad + 1; xx < rad; xx++) {
        const px = (x + xx + w) % w;
        const py = (y + yy + h) % h;
        const o4 = (py * w + px) * 4;
        const a = big ? 0.85 : 0.55;
        col.d[o4] = mix(col.d[o4], S[0], a);
        col.d[o4 + 1] = mix(col.d[o4 + 1], S[1], a);
        col.d[o4 + 2] = mix(col.d[o4 + 2], S[2], a);
      }
    }
  }
  return { map: toTexture(col, true), orm: toTexture(orm, false) };
}

// ---------------------------------------------------------------------------
// Textiles
// ---------------------------------------------------------------------------

/** Fine plain weave; `cell` is the thread pitch in pixels. Tileable. */
export function paintWeave(
  seed: number,
  size: number,
  base: string,
  cell: number,
  rough: number,
  slub = 0.12,
): Painted {
  const w = size;
  const h = size;
  const col = surface(w, h);
  const orm = surface(w, h);
  const height = new Float32Array(w * h);
  const slubN = new TileNoise(seed, size >> 3, 8);
  const slubV = new TileNoise(seed + 1, 8, size >> 3);
  const B = hex(base);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const wx = Math.floor(x / cell);
      const wy = Math.floor(y / cell);
      const over = (wx + wy) % 2 === 0;
      const inCell = over ? ((x % cell) + 0.5) / cell : ((y % cell) + 0.5) / cell;
      const bump = Math.sin(inCell * Math.PI);
      const s = over ? slubN.at(x / w, y / h) : slubV.at(x / w, y / h);
      const k = 0.78 + bump * 0.22 + (s - 0.5) * slub * 2;
      const i = y * w + x;
      const o4 = i * 4;
      col.d[o4] = B[0] * k;
      col.d[o4 + 1] = B[1] * k;
      col.d[o4 + 2] = B[2] * k;
      col.d[o4 + 3] = 255;
      height[i] = bump;
      orm.d[o4] = (0.7 + bump * 0.3) * 255;
      orm.d[o4 + 1] = rough * 255;
      orm.d[o4 + 2] = 0;
      orm.d[o4 + 3] = 255;
    }
  }
  return { map: toTexture(col, true), orm: toTexture(orm, false), normal: normalTex(height, w, h, 1.4) };
}

/** A soft wool throw: a quiet two-colour herringbone with a darker stripe. */
export function paintThrow(seed: number, size: number): Painted {
  const w = size;
  const h = size;
  const col = surface(w, h);
  const height = new Float32Array(w * h);
  const fuzz = new TileNoise(seed, size >> 1, size >> 1);
  const A = hex("#8b8768");
  const B = hex("#5f6048");
  const S = hex("#3b3c2e");
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col8 = Math.floor(x / 12);
      const dir = col8 % 2 === 0 ? 1 : -1;
      const diag = ((x * dir + y) % 12 + 12) % 12;
      const twill = diag < 6 ? 1 : 0;
      const stripe = Math.floor(y / (h / 4)) % 4 === 1 && (y % (h / 4)) < 10;
      const f = fuzz.at(x / w, y / h);
      const c = stripe ? S : twill ? A : B;
      const k = 0.88 + f * 0.2;
      const o4 = (y * w + x) * 4;
      col.d[o4] = c[0] * k;
      col.d[o4 + 1] = c[1] * k;
      col.d[o4 + 2] = c[2] * k;
      col.d[o4 + 3] = 255;
      height[y * w + x] = twill * 0.5 + f * 0.5;
    }
  }
  return { map: toTexture(col, true), normal: normalTex(height, w, h, 1.2) };
}

// ---------------------------------------------------------------------------
// Paper, sleeves, cardboard
// ---------------------------------------------------------------------------

/** Near-white card with fibres and softened edges. Tinted per instance by
 * instanceColor, so one texture serves a whole shelf of spines. */
export function paintCard(seed: number, w: number, h: number): Painted {
  const col = surface(w, h);
  const fib = new TileNoise(seed, w >> 1, 12);
  const blot = new Fbm(seed + 3, 2, 3, 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const edge = Math.min(u, 1 - u, v * 0.2, (1 - v) * 0.2) * 40;
      const worn = edge < 1 ? (1 - edge) * 0.25 : 0;
      const k = 0.86 + fib.at(u, v) * 0.1 + (blot.at(u, v) - 0.5) * 0.1 + worn;
      const o4 = (y * w + x) * 4;
      col.d[o4] = 238 * Math.min(k, 1.08);
      col.d[o4 + 1] = 232 * Math.min(k, 1.08);
      col.d[o4 + 2] = 220 * Math.min(k, 1.08);
      col.d[o4 + 3] = 255;
    }
  }
  return { map: toTexture(col, true) };
}

const SLEEVE_PALETTES = [
  ["#c9b99a", "#2f3b45", "#b5532f"],
  ["#2b2a28", "#d8cbb0", "#7d8a6b"],
  ["#8c3b2b", "#e2d6bd", "#1f1c19"],
  ["#3d5566", "#e5dcc6", "#c48a3a"],
  ["#d9cfb8", "#6b5a78", "#2a2622"],
  ["#5a6b4e", "#efe6d0", "#9c4a2c"],
];

/**
 * An original, text-free sleeve front: plain geometric composition on card,
 * then the marks a sleeve collects — a circular ring worn by the record
 * inside, softened corners, and paper grain.
 */
export function paintSleeve(seed: number, size: number): Painted {
  const s = surface(size, size);
  const g = s.ctx;
  const r = rng(seed);
  const pal = SLEEVE_PALETTES[seed % SLEEVE_PALETTES.length];
  const style = seed % 4;
  g.fillStyle = pal[0];
  g.fillRect(0, 0, size, size);
  if (style === 0) {
    g.fillStyle = pal[1];
    g.fillRect(0, size * (0.55 + r() * 0.15), size, size);
    g.fillStyle = pal[2];
    g.beginPath();
    g.arc(size * (0.3 + r() * 0.4), size * 0.42, size * 0.18, 0, Math.PI * 2);
    g.fill();
  } else if (style === 1) {
    for (let i = 0; i < 7; i++) {
      g.fillStyle = i % 2 ? pal[1] : pal[2];
      g.globalAlpha = 0.85;
      g.fillRect(0, size * (0.12 + i * 0.1), size, size * 0.045);
    }
    g.globalAlpha = 1;
  } else if (style === 2) {
    g.fillStyle = pal[1];
    g.fillRect(size * 0.14, size * 0.14, size * 0.46, size * 0.46);
    g.strokeStyle = pal[2];
    g.lineWidth = size * 0.012;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(size * 0.14, size * (0.7 + i * 0.05));
      g.lineTo(size * 0.86, size * (0.7 + i * 0.05));
      g.stroke();
    }
  } else {
    g.fillStyle = pal[1];
    const step = size / 11;
    for (let yy = 1; yy < 11; yy++) {
      for (let xx = 1; xx < 11; xx++) {
        const rad = step * 0.36 * (0.35 + 0.65 * ((xx + yy) / 20));
        g.beginPath();
        g.arc(xx * step, yy * step, rad, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = pal[2];
    g.fillRect(size * 0.62, size * 0.62, size * 0.24, size * 0.24);
  }
  // Wear pass, pixel by pixel on top of the design.
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  const grain = new TileNoise(seed + 5, size >> 2, size >> 2);
  const c = size / 2;
  const ringR = size * 0.44;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o4 = (y * size + x) * 4;
      const dist = Math.hypot(x - c, y - c);
      const ring = Math.exp(-Math.pow((dist - ringR) / (size * 0.012), 2)) * 0.1;
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
      const corner = edge < 5 ? (5 - edge) * 0.05 : 0;
      const k = 1 + (grain.at(x / size, y / size) - 0.5) * 0.08 + ring + corner;
      d[o4] = Math.min(255, d[o4] * k + ring * 60);
      d[o4 + 1] = Math.min(255, d[o4 + 1] * k + ring * 55);
      d[o4 + 2] = Math.min(255, d[o4 + 2] * k + ring * 45);
    }
  }
  g.putImageData(img, 0, 0);
  return { map: toTexture(s, true, [1, 1], false) };
}

/** A notebook spread: cream stock, faint rules, a red margin, and a few
 * lines of illegible pencil notation — the page someone was writing on. */
export function paintNotebook(seed: number, w: number, h: number): Painted {
  const s = surface(w, h);
  const g = s.ctx;
  const r = rng(seed);
  g.fillStyle = "#e6dcc4";
  g.fillRect(0, 0, w, h);
  const shade = g.createLinearGradient(0, 0, w, 0);
  shade.addColorStop(0.44, "rgba(80,60,40,0)");
  shade.addColorStop(0.5, "rgba(80,60,40,0.22)");
  shade.addColorStop(0.56, "rgba(80,60,40,0)");
  g.fillStyle = shade;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(96,120,150,0.35)";
  g.lineWidth = 1;
  const rule = h / 22;
  for (let y = rule * 2; y < h - rule; y += rule) {
    g.beginPath();
    g.moveTo(w * 0.04, y);
    g.lineTo(w * 0.96, y);
    g.stroke();
  }
  g.strokeStyle = "rgba(170,70,60,0.35)";
  for (const mx of [w * 0.1, w * 0.6]) {
    g.beginPath();
    g.moveTo(mx, 0);
    g.lineTo(mx, h);
    g.stroke();
  }
  // Pencil notation: short random-walk strokes sitting on the rules. Written
  // on the left page, trailing off partway down — the note was interrupted.
  g.strokeStyle = "rgba(55,52,50,0.7)";
  g.lineWidth = 1.3;
  g.lineCap = "round";
  const lines = 9;
  for (let l = 0; l < lines; l++) {
    const baseY = rule * (3 + l);
    let x = w * 0.12;
    const end = w * (0.3 + r() * 0.16) - (l === lines - 1 ? w * 0.12 : 0);
    while (x < end) {
      const wordLen = 8 + r() * 26;
      g.beginPath();
      let y = baseY - 3;
      g.moveTo(x, y);
      for (let k = 0; k < wordLen; k += 2) {
        y = baseY - 2 - Math.abs(Math.sin(k * 0.9 + r() * 2)) * 6;
        g.lineTo(x + k, y);
      }
      g.stroke();
      x += wordLen + 5 + r() * 4;
    }
  }
  return { map: toTexture(s, true, [1, 1], false) };
}

// ---------------------------------------------------------------------------
// Window: rain on glass, dusk sky, far rooftops, street light
// ---------------------------------------------------------------------------

/** Droplets and a few running trails as relief, plus condensation that makes
 * the lower glass rougher. Returns normal + orm for a glass material. */
export function paintRain(seed: number, size: number): Painted {
  const w = size;
  const h = size;
  const height = new Float32Array(w * h);
  const orm = surface(w, h);
  const col = surface(w, h);
  const r = rng(seed);
  const fog = new Fbm(seed + 1, 3, 3, 4);
  const addDrop = (cx: number, cy: number, rad: number) => {
    for (let y = Math.max(0, (cy - rad) | 0); y < Math.min(h, cy + rad + 1); y++) {
      for (let x = Math.max(0, (cx - rad) | 0); x < Math.min(w, cx + rad + 1); x++) {
        const dd = Math.hypot((x - cx) / rad, (y - cy) / (rad * 1.15));
        if (dd < 1) height[y * w + x] = Math.max(height[y * w + x], Math.sqrt(1 - dd * dd));
      }
    }
  };
  for (let i = 0; i < 380; i++) addDrop(r() * w, r() * h, 0.8 + r() * r() * r() * 5);
  for (let t = 0; t < 5; t++) {
    let x = r() * w;
    let y = r() * h * 0.4;
    const len = h * (0.15 + r() * 0.35);
    for (let k = 0; k < len; k += 2) {
      x += (r() - 0.5) * 1.2;
      y += 2;
      addDrop(x, y, 1.4 + Math.sin(k * 0.05) * 0.4);
    }
    addDrop(x, y + 3, 4);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o4 = i * 4;
      const lower = smooth(0.55, 1, y / h);
      const cond = clamp01(lower * (0.55 + fog.at(x / w, y / h) * 0.6)) * (height[i] > 0.05 ? 0.2 : 1);
      orm.d[o4] = 255;
      orm.d[o4 + 1] = (0.04 + cond * 0.5) * 255;
      orm.d[o4 + 2] = 0;
      orm.d[o4 + 3] = 255;
      // Colour carries the condensation as a faint milky veil.
      col.d[o4] = 200;
      col.d[o4 + 1] = 206;
      col.d[o4 + 2] = 214;
      col.d[o4 + 3] = (0.02 + cond * 0.22 + height[i] * 0.1) * 255;
    }
  }
  return { map: toTexture(col, true), orm: toTexture(orm, false), normal: normalTex(height, w, h, 2.2) };
}

/** The last hour of daylight: a hot low band at the horizon rising through
 * apricot into dusk blue, brighter toward the side the sun is setting. */
export function paintSky(w: number, h: number): THREE.CanvasTexture {
  const s = surface(w, h);
  const g = s.ctx;
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#27324f");
  grad.addColorStop(0.35, "#52597a");
  grad.addColorStop(0.58, "#b98a86");
  grad.addColorStop(0.74, "#f0b07a");
  grad.addColorStop(0.84, "#ffd49a");
  grad.addColorStop(1, "#f4a767");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // Where the sun is going down (off to the left): a broad warm bloom.
  const sun = g.createRadialGradient(w * 0.12, h * 0.8, 0, w * 0.12, h * 0.8, w * 0.7);
  sun.addColorStop(0, "rgba(255,226,170,0.85)");
  sun.addColorStop(0.35, "rgba(255,190,120,0.35)");
  sun.addColorStop(1, "rgba(255,170,110,0)");
  g.fillStyle = sun;
  g.fillRect(0, 0, w, h);
  // Thin cloud bars catching the light from below.
  g.filter = "blur(10px)";
  for (const [x, y, rx, ry, c] of [
    [0.3, 0.66, 0.42, 0.018, "rgba(255,200,150,0.45)"],
    [0.72, 0.6, 0.3, 0.014, "rgba(130,110,130,0.35)"],
    [0.5, 0.52, 0.5, 0.012, "rgba(220,160,150,0.25)"],
  ] as const) {
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(w * x, h * y, w * rx, h * ry, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.filter = "none";
  return toTexture(s, true, [1, 1], false);
}

/**
 * The buildings across the street, backlit by the low sun: silhouetted
 * parapets, pitched roofs and chimney stacks with a warm rim along their
 * edges, rows of mostly dark windows with a few lamps already on. Slightly
 * softened, as a lens focused on the room would render them.
 */
export function paintRooftops(seed: number, w: number, h: number): THREE.CanvasTexture {
  const s = surface(w, h);
  const g = s.ctx;
  const r = rng(seed);
  g.clearRect(0, 0, w, h);
  g.filter = "blur(5px)";
  let x = -10;
  while (x < w) {
    const bw = 90 + r() * 200;
    const top = h * (0.08 + r() * 0.42);
    const tone = 92 + r() * 22;
    const body = `rgb(${tone + 8},${tone - 6},${tone - 2})`;
    g.fillStyle = body;
    g.fillRect(x, top, bw, h - top);
    const kind = r();
    g.beginPath();
    if (kind < 0) {
      // Pitched roof.
      const ridge = top - bw * (0.18 + r() * 0.12);
      g.moveTo(x - 4, top);
      g.lineTo(x + bw * 0.5, ridge);
      g.lineTo(x + bw + 4, top);
      g.closePath();
      g.fill();
      g.strokeStyle = "rgba(255,196,130,0.5)";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x - 4, top);
      g.lineTo(x + bw * 0.5, ridge);
      g.stroke();
    } else {
      // Parapet with a cornice.
      g.fillRect(x - 4, top - 8, bw + 8, 8);
      g.fillStyle = "rgba(255,196,130,0.45)";
      g.fillRect(x - 4, top - 8, bw + 8, 2);
    }
    // Chimney stacks with pots.
    const stacks = r() > 0.4 ? 1 + Math.floor(r() * 2) : 0;
    for (let c = 0; c < stacks; c++) {
      const cx = x + bw * (0.15 + r() * 0.7);
      const ch = 26 + r() * 30;
      g.fillStyle = body;
      g.fillRect(cx, top - ch - 8, 22, ch);
      for (let p = 0; p < 3; p++) g.fillRect(cx + 2 + p * 7, top - ch - 16, 5, 9);
      g.fillStyle = "rgba(255,196,130,0.4)";
      g.fillRect(cx, top - ch - 8, 2, ch);
    }
    // Window grid: floors and bays, a few lit.
    const floors = Math.floor((h - top - 20) / 46);
    const bays = Math.max(2, Math.floor(bw / 38));
    for (let f = 0; f < floors; f++) {
      for (let b = 0; b < bays; b++) {
        const wx = x + 12 + b * ((bw - 24) / bays);
        const wy = top + 22 + f * 46;
        const lit = r() > 0.84;
        g.fillStyle = lit
          ? `rgba(255,${176 + r() * 40},${104 + r() * 40},${0.7 + r() * 0.3})`
          : `rgba(${70 + r() * 30},${72 + r() * 20},${92 + r() * 20},0.55)`;
        g.fillRect(wx, wy, 14, 24);
      }
    }
    x += bw + (r() > 0.7 ? 6 : 0);
  }
  // Evening haze thickening toward the street.
  g.filter = "none";
  const haze = g.createLinearGradient(0, h * 0.3, 0, h);
  haze.addColorStop(0, "rgba(230,170,130,0.12)");
  haze.addColorStop(1, "rgba(225,165,130,0.55)");
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = haze;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "source-over";
  return toTexture(s, true, [1, 1], false);
}

/** Out-of-focus street lamps and windows: soft warm discs. */
export function paintBokeh(seed: number, w: number, h: number): THREE.CanvasTexture {
  const s = surface(w, h);
  const g = s.ctx;
  const r = rng(seed);
  g.clearRect(0, 0, w, h);
  for (let i = 0; i < 18; i++) {
    const cx = r() * w;
    const cy = h * (0.45 + r() * 0.5);
    const rad = 10 + r() * 34;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
    const warm = r() > 0.25;
    const a = 0.25 + r() * 0.35;
    grad.addColorStop(0, warm ? `rgba(255,196,130,${a})` : `rgba(170,200,255,${a * 0.7})`);
    grad.addColorStop(0.75, warm ? `rgba(255,170,100,${a * 0.6})` : `rgba(150,180,240,${a * 0.4})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, rad, 0, Math.PI * 2);
    g.fill();
  }
  return toTexture(s, true, [1, 1], false);
}

/**
 * The framed print on the wall: a lithograph-style plot of the RIAA
 * recording and playback curves (computed, not drawn by hand) on cream
 * stock — the owner's one piece of "art" is a chart. No text.
 */
export function paintPlot(w: number, h: number): THREE.CanvasTexture {
  const s = surface(w, h);
  const g = s.ctx;
  g.fillStyle = "#e4d8bf";
  g.fillRect(0, 0, w, h);
  const r = rng(181);
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const k = 1 + (r() - 0.5) * 0.05;
    img.data[i] *= k;
    img.data[i + 1] *= k;
    img.data[i + 2] *= k;
  }
  g.putImageData(img, 0, 0);
  const px0 = w * 0.12;
  const px1 = w * 0.9;
  const py0 = h * 0.2;
  const py1 = h * 0.72;
  g.strokeStyle = "rgba(60,70,90,0.22)";
  g.lineWidth = 1;
  // Log-frequency decade grid, 20 Hz – 20 kHz.
  for (let dec = 1; dec <= 4; dec++) {
    for (let m = 1; m < 10; m++) {
      const f = Math.pow(10, dec) * m;
      if (f < 20 || f > 20000) continue;
      const x = px0 + ((Math.log10(f) - Math.log10(20)) / 3) * (px1 - px0);
      g.lineWidth = m === 1 ? 1.4 : 0.7;
      g.beginPath();
      g.moveTo(x, py0);
      g.lineTo(x, py1);
      g.stroke();
    }
  }
  g.lineWidth = 0.8;
  for (let db = -20; db <= 20; db += 5) {
    const y = py0 + ((20 - db) / 40) * (py1 - py0);
    g.beginPath();
    g.moveTo(px0, y);
    g.lineTo(px1, y);
    g.stroke();
  }
  const play = (f: number) => {
    const wv = 2 * Math.PI * f;
    const mag = Math.sqrt(1 + (wv * 318e-6) ** 2) / (Math.sqrt(1 + (wv * 3180e-6) ** 2) * Math.sqrt(1 + (wv * 75e-6) ** 2));
    return 20 * Math.log10(mag);
  };
  const ref = play(1000);
  const curve = (sign: number, color: string) => {
    g.strokeStyle = color;
    g.lineWidth = w * 0.006;
    g.beginPath();
    for (let i = 0; i <= 200; i++) {
      const lf = Math.log10(20) + (i / 200) * 3;
      const db = sign * (play(Math.pow(10, lf)) - ref);
      const x = px0 + (i / 200) * (px1 - px0);
      const y = py0 + ((20 - db) / 40) * (py1 - py0);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  };
  curve(1, "rgba(38,58,92,0.9)");
  curve(-1, "rgba(170,62,40,0.9)");
  // A plate mark pressed into the paper around the image.
  g.strokeStyle = "rgba(90,70,50,0.25)";
  g.lineWidth = 2;
  g.strokeRect(w * 0.07, h * 0.13, w * 0.86, h * 0.66);
  return toTexture(s, true, [1, 1], false);
}

/** Soft radial falloff used for contact shadows under objects. */
export function paintBlob(size: number): THREE.CanvasTexture {
  const s = surface(size, size);
  const g = s.ctx;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(0,0,0,0.9)");
  grad.addColorStop(0.45, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = toTexture(s, false, [1, 1], false);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Concentric machining marks for the platter rim: radial roughness rings. */
export function paintLathe(seed: number, size: number): Painted {
  const col = surface(size, size);
  const orm = surface(size, size);
  const ringN = new TileNoise(seed, 4, size >> 1);
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const rad = Math.hypot(x - c, y - c) / c;
      const k = ringN.at(0.3, rad % 1);
      const o4 = (y * size + x) * 4;
      col.d[o4] = 150 + k * 30;
      col.d[o4 + 1] = 152 + k * 30;
      col.d[o4 + 2] = 158 + k * 30;
      col.d[o4 + 3] = 255;
      orm.d[o4] = 255;
      orm.d[o4 + 1] = (0.22 + k * 0.18) * 255;
      orm.d[o4 + 2] = 255;
      orm.d[o4 + 3] = 255;
    }
  }
  return { map: toTexture(col, true), orm: toTexture(orm, false) };
}
