/**
 * Deterministic noise primitives for the listening room's textures.
 *
 * Everything the room is dressed with is generated here from integer seeds —
 * no image files, no network. The same seed always paints the same plank,
 * so the room looks identical on every load, and a surface that repeats
 * (two speakers, a run of shelves) can be given a different seed instead of
 * visibly reusing one tile.
 *
 * Noise is *tileable*: lattice indices wrap on the period, so a texture with
 * RepeatWrapping has no seam.
 */

/** mulberry32 — small, fast, good-enough PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** Tileable 2D value noise over a px × py lattice; sample with u, v in [0,1). */
export class TileNoise {
  private readonly v: Float32Array;
  constructor(seed: number, readonly px: number, readonly py: number) {
    const r = rng(seed);
    this.v = new Float32Array(px * py);
    for (let i = 0; i < this.v.length; i++) this.v[i] = r();
  }
  at(u: number, v: number): number {
    const px = this.px;
    const py = this.py;
    const x = u * px;
    const y = v * py;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = fade(x - xi);
    const fy = fade(y - yi);
    const x0 = ((xi % px) + px) % px;
    const y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px;
    const y1 = (y0 + 1) % py;
    const g = this.v;
    const a = g[y0 * px + x0] + (g[y0 * px + x1] - g[y0 * px + x0]) * fx;
    const b = g[y1 * px + x0] + (g[y1 * px + x1] - g[y1 * px + x0]) * fx;
    return a + (b - a) * fy;
  }
}

/** Fractal sum of tileable octaves, normalised to roughly [0,1]. */
export class Fbm {
  private readonly octaves: TileNoise[];
  private readonly norm: number;
  constructor(seed: number, basePx: number, basePy: number, octaves = 4, private gain = 0.5) {
    this.octaves = [];
    let amp = 1;
    let total = 0;
    for (let o = 0; o < octaves; o++) {
      this.octaves.push(new TileNoise(seed + o * 1013, basePx << o, basePy << o));
      total += amp;
      amp *= gain;
    }
    this.norm = 1 / total;
  }
  at(u: number, v: number): number {
    let amp = 1;
    let sum = 0;
    for (const n of this.octaves) {
      sum += n.at(u, v) * amp;
      amp *= this.gain;
    }
    return sum * this.norm;
  }
}

/**
 * Convert a height field into a tangent-space normal map (OpenGL convention,
 * +Y up). Canvas rows run top-down while texture v runs bottom-up after the
 * default flipY, hence the sign on the vertical gradient.
 */
export function normalFromHeight(
  h: Float32Array,
  w: number,
  hh: number,
  strength: number,
  out: Uint8ClampedArray,
): void {
  for (let y = 0; y < hh; y++) {
    const ym = ((y - 1 + hh) % hh) * w;
    const yp = ((y + 1) % hh) * w;
    const yr = y * w;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w;
      const xp = (x + 1) % w;
      const dx = (h[yr + xp] - h[yr + xm]) * strength;
      const dy = (h[yp + x] - h[ym + x]) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const o = (yr + x) * 4;
      out[o] = (-dx * inv * 0.5 + 0.5) * 255;
      out[o + 1] = (dy * inv * 0.5 + 0.5) * 255;
      out[o + 2] = (inv * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Parse "#rrggbb" into 0..255 components. */
export function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
