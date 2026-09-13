/**
 * The pixel painters: pure functions from a seed to raw RGBA buffers.
 *
 * No DOM, no three.js — so they run unchanged inside a Web Worker
 * (paint.worker.ts), which is where the room's heavy textures are painted:
 * several megapixels of grain, weave and plaster would otherwise freeze the
 * page for seconds. `textures.ts` wraps a PixelSet into canvas textures on
 * the main thread.
 *
 * Buffers: map (sRGB colour), normal (tangent-space, from a height field),
 * orm (R = ambient occlusion, G = roughness, B = metalness), all w × h RGBA.
 */

import { Fbm, TileNoise, clamp01, hex, mix, normalFromHeight, rng, smooth } from "./noise";

export interface PixelSet {
  w: number;
  h: number;
  map: Uint8ClampedArray;
  normal?: Uint8ClampedArray;
  orm?: Uint8ClampedArray;
}

interface Raw {
  d: Uint8ClampedArray;
}

function raw(w: number, h: number): Raw {
  return { d: new Uint8ClampedArray(w * h * 4) };
}

function normalArr(height: Float32Array, w: number, h: number, strength: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  normalFromHeight(height, w, h, strength, out);
  return out;
}

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
export function paintWood(o: WoodOptions): PixelSet {
  const { w, h } = o;
  const col = raw(w, h);
  const orm = raw(w, h);
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

  return {
    w,
    h,
    map: col.d,
    orm: orm.d,
    normal: normalArr(height, w, h, o.relief ?? 2.2),
  };
}

export function paintPlaster(seed: number, tint: string, size: number): PixelSet {
  const w = size;
  const h = size;
  const col = raw(w, h);
  const orm = raw(w, h);
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
  return { w, h, map: col.d, orm: orm.d, normal: normalArr(height, w, h, 1.1) };
}

/** Boards run along canvas X. Each board has its own tint, grain phase and
 * end joints; seams are dark and slightly sunken. */
export function paintFloor(seed: number, w: number, h: number, boards: number): PixelSet {
  const col = raw(w, h);
  const orm = raw(w, h);
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
  return { w, h, map: col.d, orm: orm.d, normal: normalArr(height, w, h, 2.4) };
}

/** A flat-weave rug: over-under weave cells, two border bands and a quiet
 * stepped-diamond field, faded and softened where feet have worn it. */
export function paintRug(seed: number, w: number, h: number): PixelSet {
  const col = raw(w, h);
  const orm = raw(w, h);
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
  return { w, h, map: col.d, orm: orm.d, normal: normalArr(height, w, h, 1.6) };
}

/** Aged cognac leather: pebble grain, a lighter patina where it is sat on,
 * and a few soft creases. The seat centre is at canvas centre. */
export function paintLeather(seed: number, size: number): PixelSet {
  const w = size;
  const h = size;
  const col = raw(w, h);
  const orm = raw(w, h);
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
  return { w, h, map: col.d, orm: orm.d, normal: normalArr(height, w, h, 2.8) };
}

export function paintBrushed(seed: number, size: number, tone: string): PixelSet {
  const w = size;
  const h = size;
  const col = raw(w, h);
  const orm = raw(w, h);
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
  return { w, h, map: col.d, orm: orm.d, normal: normalArr(height, w, h, 0.6) };
}

export function paintCeramic(seed: number, size: number, glaze: string, speck: string): PixelSet {
  const w = size;
  const h = size >> 1;
  const col = raw(w, h);
  const orm = raw(w, h);
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
  return { w, h, map: col.d, orm: orm.d };
}

/** Fine plain weave; `cell` is the thread pitch in pixels. Tileable. */
export function paintWeave(
  seed: number,
  size: number,
  base: string,
  cell: number,
  rough: number,
  slub = 0.12,
): PixelSet {
  const w = size;
  const h = size;
  const col = raw(w, h);
  const orm = raw(w, h);
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
  return { w, h, map: col.d, orm: orm.d, normal: normalArr(height, w, h, 1.4) };
}

/** A soft wool throw: a quiet two-colour herringbone with a darker stripe. */
export function paintThrow(seed: number, size: number): PixelSet {
  const w = size;
  const h = size;
  const col = raw(w, h);
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
  return { w, h, map: col.d, normal: normalArr(height, w, h, 1.2) };
}

/** Near-white card with fibres and softened edges. Tinted per instance by
 * instanceColor, so one texture serves a whole shelf of spines. */
export function paintCard(seed: number, w: number, h: number): PixelSet {
  const col = raw(w, h);
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
  return { w, h, map: col.d };
}

/** Droplets and a few running trails as relief, plus condensation that makes
 * the lower glass rougher. Returns normal + orm for a glass material. */
export function paintRain(seed: number, size: number): PixelSet {
  const w = size;
  const h = size;
  const height = new Float32Array(w * h);
  const orm = raw(w, h);
  const col = raw(w, h);
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
  return { w, h, map: col.d, orm: orm.d, normal: normalArr(height, w, h, 2.2) };
}

/** Concentric machining marks for the platter rim: radial roughness rings. */
export function paintLathe(seed: number, size: number): PixelSet {
  const w = size;
  const h = size;
  const col = raw(size, size);
  const orm = raw(size, size);
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
  return { w, h, map: col.d, orm: orm.d };
}
