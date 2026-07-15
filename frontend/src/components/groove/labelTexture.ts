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

  // Long wavering grain streaks, low contrast — suggestion, not simulation.
  for (let i = 0; i < 160; i++) {
    const y0 = rand() * h;
    const amp = 2 + rand() * 6;
    const dark = rand() > 0.45;
    g.strokeStyle = dark
      ? `rgba(28, 18, 10, ${0.05 + rand() * 0.1})`
      : `rgba(140, 105, 70, ${0.04 + rand() * 0.07})`;
    g.lineWidth = 0.6 + rand() * 2.2;
    g.beginPath();
    g.moveTo(0, y0);
    for (let x = 0; x <= w; x += 32) {
      g.lineTo(x, y0 + Math.sin(x * 0.008 + i) * amp + (rand() - 0.5) * 2);
    }
    g.stroke();
  }
  // A few knots.
  for (let i = 0; i < 4; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const grad = g.createRadialGradient(x, y, 1, x, y, 14 + rand() * 12);
    grad.addColorStop(0, "rgba(26, 16, 9, 0.5)");
    grad.addColorStop(1, "rgba(26, 16, 9, 0)");
    g.fillStyle = grad;
    g.fillRect(x - 30, y - 30, 60, 60);
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

  // Night sky through glass: deep blue gradient.
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#0b1322");
  sky.addColorStop(0.6, "#101b30");
  sky.addColorStop(1, "#16233c");
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);

  // City-light bokeh: soft discs, warm below (streets), cool above.
  for (let i = 0; i < 46; i++) {
    const x = rand() * w;
    const y = h * (0.25 + rand() * 0.7);
    const r = 6 + rand() * 26;
    const warm = y > h * 0.5 || rand() > 0.6;
    const [cr, cg, cb] = warm ? [255, 178, 92] : [140, 176, 255];
    const a = 0.05 + rand() * 0.16;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${a})`);
    grad.addColorStop(0.7, `rgba(${cr}, ${cg}, ${cb}, ${a * 0.5})`);
    grad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // A handful of sharp pinpoints.
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(255, 236, 200, ${0.2 + rand() * 0.4})`;
    g.fillRect(rand() * w, h * (0.3 + rand() * 0.65), 1.6, 1.6);
  }
  // Faint rain: near-vertical translucent streaks.
  for (let i = 0; i < 70; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const len = 18 + rand() * 42;
    g.strokeStyle = `rgba(190, 210, 240, ${0.03 + rand() * 0.05})`;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 2, y + len);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
