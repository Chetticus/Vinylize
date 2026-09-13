/**
 * The record label (canvas 2D -> CanvasTexture), carrying the uploaded
 * filename — no external assets. The listening room's textures live in
 * room/textures.ts.
 */

import * as THREE from "three";

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
