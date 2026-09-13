/**
 * Geometry helpers for the listening room.
 *
 * Nothing here is imported from a model file: every chair, cup and leaf is
 * built from rounded boxes, lathe profiles and swept tubes. Two things keep
 * those primitives from reading as primitives —
 *
 *   1. softened edges everywhere (a 1–6 mm bevel catches a highlight the way
 *      a sanded edge does), and
 *   2. UVs projected in world millimetres, so a texture keeps one physical
 *      scale across pieces of different size and grain runs along the long
 *      axis of each board instead of stretching per face.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { rng } from "./noise";

export type Axis = "x" | "y" | "z";

/**
 * Re-project a geometry's UVs as box mapping in millimetres.
 * `along` is the world axis the texture's U (the wood grain) follows;
 * `size` is how many mm one texture repeat covers along U and V;
 * `offset` shifts the pattern so two pieces never share the same patch.
 */
export function projectUV(
  geo: THREE.BufferGeometry,
  along: Axis,
  size: [number, number],
  offset: [number, number] = [0, 0],
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  const idx = { x: 0, y: 1, z: 2 } as const;
  const a = idx[along];
  for (let i = 0; i < pos.count; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const n = [Math.abs(nor.getX(i)), Math.abs(nor.getY(i)), Math.abs(nor.getZ(i))];
    const face = n[0] > n[1] && n[0] > n[2] ? 0 : n[1] > n[2] ? 1 : 2;
    let u: number;
    let v: number;
    if (face === a) {
      // End grain: project with the two remaining axes.
      const rest = [0, 1, 2].filter((k) => k !== a);
      u = p[rest[0]];
      v = p[rest[1]];
    } else {
      const other = [0, 1, 2].find((k) => k !== a && k !== face)!;
      u = p[a];
      v = p[other];
    }
    uv[i * 2] = u / size[0] + offset[0];
    uv[i * 2 + 1] = v / size[1] + offset[1];
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** A box with rounded edges, UVs in mm along a grain axis. */
export function roundedBox(
  w: number,
  h: number,
  d: number,
  radius: number,
  along: Axis = "x",
  texSize: [number, number] = [600, 600],
  seed = 0,
  segments = 2,
): THREE.BufferGeometry {
  const r = Math.min(radius, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01);
  const g = new RoundedBoxGeometry(w, h, d, segments, Math.max(r, 0.01));
  const rand = rng(seed + 1);
  return projectUV(g, along, texSize, [rand(), rand()]);
}

/**
 * A cushion: a rounded box whose top and bottom faces bulge, with the crown
 * slightly off-centre (someone sat there), so it reads as stuffed rather
 * than machined.
 */
export function cushion(
  w: number,
  h: number,
  d: number,
  radius: number,
  bulge: number,
  sag: [number, number] = [0, 0],
  seed = 0,
): THREE.BufferGeometry {
  const raw = new RoundedBoxGeometry(w, h, d, 5, Math.min(radius, h / 2 - 0.1));
  // Weld the (non-indexed) faces so the deformed surface shades smoothly.
  raw.deleteAttribute("normal");
  raw.deleteAttribute("uv");
  const g = mergeVertices(raw, 0.01);
  raw.dispose();
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / (w / 2);
    const y = pos.getY(i);
    const z = pos.getZ(i) / (d / 2);
    const fall = Math.max(0, 1 - x * x) * Math.max(0, 1 - z * z);
    const sign = Math.sign(y);
    // Crown on both faces; a shallow dip where the sitter's weight rests.
    const dip = Math.exp(-((x - sag[0]) ** 2 + (z - sag[1]) ** 2) * 2.2);
    pos.setY(i, y + sign * bulge * fall - (sign > 0 ? bulge * 0.9 * dip * fall : 0));
  }
  g.computeVertexNormals();
  const rand = rng(seed + 3);
  return projectUV(g, "x", [w * 1.1, d * 1.1], [rand(), rand()]);
}

/** Lathe from a (radius, height) profile in mm, with UV v along the profile. */
export function lathe(profile: Array<[number, number]>, segments = 48): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, segments);
}

/** A tapered, slightly splayed furniture leg. */
export function taperedLeg(
  length: number,
  topR: number,
  bottomR: number,
  seed = 0,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(topR, bottomR, length, 16, 4);
  const rand = rng(seed + 7);
  return projectUV(g, "y", [900, 120], [rand(), rand()]);
}

/** A cable (or pencil-thin rod) swept along a smooth curve through points. */
export function cable(
  points: Array<[number, number, number]>,
  radius: number,
  radial = 8,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(
    points.map((p) => new THREE.Vector3(...p)),
    false,
    "centripetal",
  );
  const len = curve.getLength();
  return new THREE.TubeGeometry(curve, Math.max(16, Math.round(len / 6)), radius, radial, false);
}

/**
 * A single leaf blade in its own frame: base at origin, tip along +Y, face
 * toward +Z. The blade has an ovate outline, folds slightly along its midrib
 * and curls back toward the tip, so light rakes across it.
 */
export function leafGeometry(length: number, width: number, curl: number, fold: number): THREE.BufferGeometry {
  const rows = 10;
  const cols = 4;
  const verts: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    // Ovate outline: widest a third of the way up, pointed tip.
    const half = (width / 2) * Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - 0.25 * t);
    const y = t * length;
    const back = curl * t * t * length;
    for (let i = 0; i <= cols; i++) {
      const s = i / cols - 0.5; // -0.5..0.5 across
      const x = s * 2 * half;
      const z = -back - Math.abs(s) * 2 * half * fold;
      verts.push(x, y * (1 - 0.15 * curl * t), z);
      uvs.push(i / cols, t);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i;
      const b = a + cols + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/**
 * A soft fabric sheet draped by a height function: `drape(u, v)` returns a
 * world offset for a point of the flat sheet (u across, v along, both 0..1).
 */
export function drapedSheet(
  w: number,
  l: number,
  segU: number,
  segV: number,
  drape: (u: number, v: number, out: THREE.Vector3) => void,
): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, l, segU, segV);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    drape(uv.getX(i), uv.getY(i), p);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Translate/rotate a geometry in place and return it (for merge). */
export function place(
  g: THREE.BufferGeometry,
  pos: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
  g.applyMatrix4(m);
  return g;
}

/** Merge geometries (indexed or not) that share position/normal/uv
 * attributes into one indexed geometry — one draw call. Disposes inputs. */
export function mergeIndexed(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  let vCount = 0;
  let iCount = 0;
  for (const p of parts) {
    if (!p.index) p.setIndex([...Array(p.attributes.position.count).keys()]);
    vCount += p.attributes.position.count;
    iCount += p.index!.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const index = new Uint32Array(iCount);
  let v = 0;
  let i = 0;
  for (const p of parts) {
    const n = p.attributes.position.count;
    pos.set(p.attributes.position.array as Float32Array, v * 3);
    nor.set(p.attributes.normal.array as Float32Array, v * 3);
    if (p.attributes.uv) uv.set(p.attributes.uv.array as Float32Array, v * 2);
    const I = p.index!.array;
    for (let k = 0; k < I.length; k++) index[i + k] = I[k] + v;
    v += n;
    i += I.length;
    p.dispose();
  }
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  return out;
}
