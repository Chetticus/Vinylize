/**
 * Procedural textures for the listening room — every one painted in code from
 * a seed. No image files, no downloads, no generated artwork.
 *
 * Two kinds live here:
 *  - `wrap()` turns a PixelSet from pixels.ts (wood, plaster, weave, leather,
 *    metal, glaze, rain… painted in a Web Worker) into canvas textures;
 *  - small canvas-2D compositions that are cheap enough for the main thread:
 *    plain geometric sleeve fronts, a notebook page, the dusk sky, rooftops,
 *    street-light bokeh, the framed RIAA plot and a contact-shadow blob.
 *
 * Maps: map (sRGB colour), normal (tangent space), orm (R = ambient
 * occlusion, G = roughness, B = metalness — one texture serves all three).
 */

import * as THREE from "three";

import { TileNoise, rng } from "./noise";
import type { PixelSet } from "./pixels";

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

/** Put raw RGBA pixels into a canvas texture. */
function fromPixels(w: number, h: number, data: Uint8ClampedArray, color: boolean): THREE.CanvasTexture {
  const s = surface(w, h);
  s.img.data.set(data);
  return toTexture(s, color);
}

/** Wrap a worker-painted PixelSet as textures (main thread, a few ms). */
export function wrap(p: PixelSet): Painted {
  return {
    map: fromPixels(p.w, p.h, p.map, true),
    normal: p.normal ? fromPixels(p.w, p.h, p.normal, false) : undefined,
    orm: p.orm ? fromPixels(p.w, p.h, p.orm, false) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Paper and sleeves
// ---------------------------------------------------------------------------

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

