/**
 * Procedural textures (canvas 2D -> CanvasTexture) — no external assets.
 *
 *  - record label: carries the uploaded filename;
 *  - vinyl sheen: faint radial streaks so the disc's rotation is visible;
 *  - wood grain: the café tabletop;
 *  - night window: city-light bokeh + faint rain for the café backdrop.
 *
 * All are generated once, deterministic where randomness is involved.
 */

import * as THREE from "three";

/** Deterministic Park–Miller PRNG so re-mounts render the same café. */
function makeRand(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 48271) % 2147483647) / 2147483647);
}

export function makeLabelTexture(filename: string): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const c = size / 2;

  // Paper base with a subtle radial shade.
  const bg = g.createRadialGradient(c, c, 20, c, c, c);
  bg.addColorStop(0, "#c8892f");
  bg.addColorStop(0.75, "#b97a24");
  bg.addColorStop(1, "#9a641d");
  g.fillStyle = bg;
  g.fillRect(0, 0, size, size);

  // Fine print rings.
  g.strokeStyle = "rgba(40, 24, 6, 0.5)";
  for (const r of [0.94, 0.62, 0.28]) {
    g.lineWidth = r > 0.9 ? 5 : 2;
    g.beginPath();
    g.arc(c, c, c * r, 0, Math.PI * 2);
    g.stroke();
  }

  g.fillStyle = "#2a1a06";
  g.textAlign = "center";

  g.font = "bold 64px Georgia, serif";
  g.fillText("VINYLIZE", c, c - 70);
  g.font = "26px Georgia, serif";
  g.fillText("PHYSICS-CUT RECORD · SIDE A", c, c - 28);

  // The uploaded track, truncated to fit the label.
  let name = filename.replace(/\.[a-z0-9]+$/i, "");
  if (name.length > 26) name = name.slice(0, 25) + "…";
  g.font = "italic 34px Georgia, serif";
  g.fillText(name || "untitled", c, c + 78);

  g.font = "24px Georgia, serif";
  g.fillText("33⅓ RPM", c, c + 122);

  // Spindle hole.
  g.fillStyle = "#0c0c0e";
  g.beginPath();
  g.arc(c, c, 13, 0, Math.PI * 2);
  g.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeSheenTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d")!;
  const c = size / 2;
  g.clearRect(0, 0, size, size);

  // Faint irregular radial streaks — the micro-scratches and pressing marks
  // that catch light on a real record. Deterministic so re-mounts look alike.
  const rand = makeRand(1109);
  g.lineWidth = 1;
  for (let i = 0; i < 900; i++) {
    const angle = rand() * Math.PI * 2;
    const r0 = c * (0.36 + rand() * 0.6);
    const len = 6 + rand() * 30;
    g.strokeStyle = `rgba(255, 250, 240, ${0.015 + rand() * 0.05})`;
    g.beginPath();
    g.moveTo(c + Math.cos(angle) * r0, c + Math.sin(angle) * r0);
    g.lineTo(c + Math.cos(angle) * (r0 + len), c + Math.sin(angle) * (r0 + len));
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Framed wall poster: a minimalist RIAA-curve print — education as décor. */
export function makePosterTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 672;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;

  g.fillStyle = "#e8e0d0";
  g.fillRect(0, 0, w, h);
  g.strokeStyle = "#2a251d";
  g.lineWidth = 3;
  g.strokeRect(34, 34, w - 68, h - 68);

  // The RIAA playback curve, drawn from its actual shape: +20 dB at 20 Hz
  // falling through 0 at 1 kHz to -20 dB at 20 kHz (log-frequency axis).
  g.strokeStyle = "#8a4f1d";
  g.lineWidth = 5;
  g.beginPath();
  const plot = { x0: 70, x1: w - 70, y0: 150, y1: 430 };
  for (let px = 0; px <= 1; px += 0.02) {
    const fHz = 20 * Math.pow(1000, px); // 20 Hz .. 20 kHz, log scale
    const wRad = 2 * Math.PI * fHz;
    const t1 = 3180e-6, t2 = 318e-6, t3 = 75e-6;
    const mag =
      Math.sqrt(1 + (wRad * t2) ** 2) /
      (Math.sqrt(1 + (wRad * t1) ** 2) * Math.sqrt(1 + (wRad * t3) ** 2));
    const db = 20 * Math.log10(mag * Math.sqrt(1 + (2 * Math.PI * 1000 * t1) ** 2) *
      Math.sqrt(1 + (2 * Math.PI * 1000 * t3) ** 2) / Math.sqrt(1 + (2 * Math.PI * 1000 * t2) ** 2));
    const x = plot.x0 + px * (plot.x1 - plot.x0);
    const y = plot.y0 + ((20 - db) / 40) * (plot.y1 - plot.y0);
    if (px === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  // Axis baseline.
  g.strokeStyle = "rgba(42, 37, 29, 0.35)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(plot.x0, (plot.y0 + plot.y1) / 2);
  g.lineTo(plot.x1, (plot.y0 + plot.y1) / 2);
  g.stroke();

  g.fillStyle = "#2a251d";
  g.textAlign = "center";
  g.font = "bold 44px Georgia, serif";
  g.fillText("R I A A", w / 2, 520);
  g.font = "22px Georgia, serif";
  g.fillText("playback equalization · 1954", w / 2, 558);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeWoodTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  const rand = makeRand(7331);

  // Warm walnut base with a soft top-lit gradient.
  const base = g.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, "#57402c");
  base.addColorStop(0.5, "#4c3626");
  base.addColorStop(1, "#412d1f");
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);

  // Long wavering grain streaks — richer contrast than v0.5, still a
  // suggestion rather than a simulation.
  for (let i = 0; i < 220; i++) {
    const y0 = rand() * h;
    const amp = 2 + rand() * 7;
    const dark = rand() > 0.4;
    g.strokeStyle = dark
      ? `rgba(24, 14, 7, ${0.07 + rand() * 0.13})`
      : `rgba(158, 118, 76, ${0.05 + rand() * 0.09})`;
    g.lineWidth = 0.6 + rand() * 2.4;
    g.beginPath();
    g.moveTo(0, y0);
    for (let x = 0; x <= w; x += 32) {
      g.lineTo(x, y0 + Math.sin(x * 0.008 + i) * amp + (rand() - 0.5) * 2);
    }
    g.stroke();
  }
  // Knots + the slight imperfections of a used desk: faint ring stain, a
  // couple of tiny scratches catching light.
  for (let i = 0; i < 5; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const grad = g.createRadialGradient(x, y, 1, x, y, 14 + rand() * 14);
    grad.addColorStop(0, "rgba(22, 13, 7, 0.55)");
    grad.addColorStop(1, "rgba(22, 13, 7, 0)");
    g.fillStyle = grad;
    g.fillRect(x - 32, y - 32, 64, 64);
  }
  g.strokeStyle = "rgba(20, 12, 6, 0.18)";
  g.lineWidth = 5;
  g.beginPath();
  g.arc(w * 0.78, h * 0.3, 46, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 8; i++) {
    g.strokeStyle = `rgba(190, 150, 105, ${0.06 + rand() * 0.08})`;
    g.lineWidth = 0.7;
    const x = rand() * w;
    const y = rand() * h;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 20 + rand() * 60, y + (rand() - 0.5) * 10);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeWindowTexture(): THREE.CanvasTexture {
  const w = 512;
  const h = 768;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  const rand = makeRand(2024);

  // Golden-hour sky through glass: warm amber horizon rising into dusk blue
  // — this is the scene's motivated key light ("afternoon sun from the
  // window"), so the glass must read bright and warm.
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#33415c");
  sky.addColorStop(0.45, "#7a6a58");
  sky.addColorStop(0.7, "#c98d4a");
  sky.addColorStop(0.88, "#e8a952");
  sky.addColorStop(1, "#8a5a33");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  // Low sun glow.
  {
    const gx = w * 0.62;
    const gy = h * 0.8;
    const grad = g.createRadialGradient(gx, gy, 4, gx, gy, 190);
    grad.addColorStop(0, "rgba(255, 236, 190, 0.9)");
    grad.addColorStop(0.3, "rgba(255, 205, 130, 0.4)");
    grad.addColorStop(1, "rgba(255, 205, 130, 0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }

  // Distant skyline silhouette.
  g.fillStyle = "rgba(38, 30, 26, 0.85)";
  let x = 0;
  while (x < w) {
    const bw = 26 + rand() * 54;
    const bh = 40 + rand() * 130;
    g.fillRect(x, h - bh, bw, bh);
    x += bw + 4 + rand() * 12;
  }
  // A few lit windows in the skyline.
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255, 214, 150, ${0.25 + rand() * 0.45})`;
    g.fillRect(rand() * w, h - 20 - rand() * 120, 2.4, 3.2);
  }
  // Soft warm bokeh floating over the glass (street lights out of focus).
  for (let i = 0; i < 22; i++) {
    const bx = rand() * w;
    const by = h * (0.55 + rand() * 0.42);
    const r = 5 + rand() * 18;
    const a = 0.05 + rand() * 0.12;
    const grad = g.createRadialGradient(bx, by, 0, bx, by, r);
    grad.addColorStop(0, `rgba(255, 200, 130, ${a})`);
    grad.addColorStop(1, "rgba(255, 200, 130, 0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(bx, by, r, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
