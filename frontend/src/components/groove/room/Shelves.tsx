/**
 * The collection: an oak bookshelf against the back wall with records
 * filed on edge, leaning groups, index dividers, one sleeve pulled halfway
 * out, one displayed face-out, and books of every height; plus a pine crate
 * of records on the floor with one lifted out.
 *
 * Every spine and book is an instance of one box — two draw calls for the
 * whole collection — tinted per instance in muted, sun-faded card colours.
 * Sleeve fronts are original geometric designs (textures.paintSleeve).
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { Blob, mergeIndexed } from "./Console";
import { roundedBox, projectUV } from "./geom";
import * as kit from "./kit";
import { BACK_Z, CONSOLE, FLOOR_Y } from "./layout";
import { rng } from "./noise";
import type { Quality } from "./quality";
import { useGeo } from "./useGeo";

export const SHELF = { x0: -2150, x1: -1270, z0: BACK_Z + 6, depth: 330, top: FLOOR_Y + 1700 };
const BOARD = 26;
const SIDE = 24;
/** Shelf board top surfaces, bottom to top. */
const LEVELS = [FLOOR_Y + 80, FLOOR_Y + 80 + 350, FLOOR_Y + 80 + 700, FLOOR_Y + 80 + 700 + 290, FLOOR_Y + 80 + 700 + 580];

const SPINE_TONES = ["#2d2a26", "#5a4633", "#7b6d58", "#9b8b6e", "#3a4148", "#6a3b2e", "#b3a58a", "#23211f", "#56604d", "#8c5a3a", "#44403b", "#c7b995"];
const BOOK_TONES = ["#6e2f24", "#2f3e4f", "#c2b394", "#43513c", "#8a6a3a", "#2a2624", "#7c7468", "#a0512f", "#384238", "#d6c9ad"];

interface Item {
  pos: THREE.Vector3;
  rot: THREE.Euler;
  scale: THREE.Vector3;
  color: THREE.Color;
}

/** Fill a shelf span with records (or books), left to right, ending in a
 * group that leans against the last upright one. */
function fillRow(
  items: Item[],
  r: () => number,
  x0: number,
  x1: number,
  y: number,
  kind: "lp" | "book",
  opts: { leanAt?: number; gapAt?: number; gapW?: number; dividerEvery?: number } = {},
) {
  const back = SHELF.z0 + 10;
  let x = x0 + 2;
  let n = 0;
  const leanFrom = opts.leanAt ?? 1;
  while (x < x1 - 8) {
    const frac = (x - x0) / (x1 - x0);
    if (opts.gapAt !== undefined && frac > opts.gapAt && frac < opts.gapAt + 0.02) {
      x += opts.gapW ?? 80;
      continue;
    }
    const lp = kind === "lp";
    const t = lp ? 2.6 + r() * 3.6 : 16 + r() * 34;
    const h = lp ? 312 + r() * 5 : 170 + r() * 90 + (r() > 0.85 ? 40 : 0);
    const d = lp ? 312 + r() * 4 : 130 + r() * 90;
    const tones = lp ? SPINE_TONES : BOOK_TONES;
    const color = new THREE.Color(tones[Math.floor(r() * tones.length)]).multiplyScalar(0.78 + r() * 0.35);

    if (frac > leanFrom) {
      // Leaning group: tops rest toward -x on the previous item.
      const a = 0.22 + r() * 0.1;
      const cx = x + (h / 2) * Math.sin(a) + (t / 2) * Math.cos(a);
      const cy = y + (h / 2) * Math.cos(a) + (t / 2) * Math.sin(a);
      if (cx + (h / 2) * Math.sin(a) + t > x1) break;
      items.push({
        pos: new THREE.Vector3(cx, cy, back + d / 2 + (r() - 0.5) * 8),
        rot: new THREE.Euler(0, (r() - 0.5) * 0.02, a),
        scale: new THREE.Vector3(t, h, d),
        color,
      });
      x += t / Math.cos(a) + 0.5;
      n++;
      continue;
    }
    // Upright; the odd one is pulled forward, a few shift back.
    const pull = lp && r() > 0.93 ? 40 + r() * 70 : (r() - 0.5) * 6;
    items.push({
      pos: new THREE.Vector3(x + t / 2, y + h / 2, back + d / 2 + pull),
      rot: new THREE.Euler(0, (r() - 0.5) * 0.015, (r() - 0.5) * 0.012),
      scale: new THREE.Vector3(t, h, d),
      color,
    });
    x += t + (r() > 0.9 ? 1.5 : 0.25);
    n++;
    if (lp && opts.dividerEvery && n % opts.dividerEvery === 0 && x < x1 - 60) {
      // Index divider: a thin card taller than the records, tab to one side.
      items.push({
        pos: new THREE.Vector3(x + 1, y + 170, back + 160),
        rot: new THREE.Euler(0, 0, 0),
        scale: new THREE.Vector3(1.4, 340, 300),
        color: new THREE.Color("#cdbf9f").multiplyScalar(0.9 + r() * 0.1),
      });
      x += 2;
    }
  }
}

function useInstances(ref: React.RefObject<THREE.InstancedMesh>, items: Item[]) {
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    items.forEach((it, i) => {
      q.setFromEuler(it.rot);
      mtx.compose(it.pos, q, it.scale);
      m.setMatrixAt(i, mtx);
      m.setColorAt(i, it.color);
    });
    m.count = items.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [ref, items]);
}

function Bookshelf({ quality }: { quality: Quality }) {
  const { x0, x1, z0, depth, top } = SHELF;
  const cx = (x0 + x1) / 2;
  const cz = z0 + depth / 2;
  const frame = useGeo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const add = (w: number, h: number, d: number, x: number, y: number, z: number, along: "x" | "y", seed: number) => {
      const b = roundedBox(w, h, d, 2.5, along, kit.WALNUT_TEX, seed);
      b.translate(x, y, z);
      parts.push(b);
    };
    const H = top - FLOOR_Y;
    add(SIDE, H, depth, x0 + SIDE / 2, FLOOR_Y + H / 2, cz, "y", 1);
    add(SIDE, H, depth, x1 - SIDE / 2, FLOOR_Y + H / 2, cz, "y", 2);
    add(x1 - x0 + 16, BOARD + 6, depth + 14, cx, top - 3, cz + 4, "x", 3);
    LEVELS.forEach((ly, i) => add(x1 - x0 - SIDE * 2, BOARD, depth - 12, cx, ly - BOARD / 2, cz + 2, "x", 10 + i));
    // Kick plate, recessed, and a divider in the two record rows.
    add(x1 - x0 - SIDE * 2, LEVELS[0] - BOARD - FLOOR_Y, 18, cx, FLOOR_Y + (LEVELS[0] - BOARD - FLOOR_Y) / 2, z0 + depth - 40, "x", 20);
    add(20, LEVELS[2] - LEVELS[0] - BOARD, depth - 20, cx + 60, (LEVELS[0] + LEVELS[2] - BOARD) / 2, cz, "y", 21);
    // Thin back panel.
    add(x1 - x0 - SIDE * 2, H - 20, 8, cx, FLOOR_Y + H / 2, z0 + 4, "x", 22);
    return mergeIndexed(parts);
  });

  const { lps, books } = useMemo(() => {
    const r = rng(401);
    const lps: Item[] = [];
    const books: Item[] = [];
    const inner0 = x0 + SIDE;
    const inner1 = x1 - SIDE;
    const mid = cx + 60 - 10;
    const mid1 = cx + 60 + 10;
    fillRow(lps, r, inner0, mid, LEVELS[0], "lp", { dividerEvery: 38, leanAt: 0.86 });
    fillRow(lps, r, mid1, inner1, LEVELS[0], "lp", { leanAt: 0.62 });
    fillRow(lps, r, inner0, mid, LEVELS[1], "lp", { leanAt: 0.7, dividerEvery: 30 });
    // Right half of the second row is mostly given to the face-out sleeve.
    fillRow(lps, r, inner1 - 80, inner1, LEVELS[1], "lp", {});
    fillRow(books, r, inner0, inner1, LEVELS[2], "book", { gapAt: 0.55, gapW: 150, leanAt: 0.9 });
    if (quality !== "low") {
      fillRow(books, r, inner0, inner0 + 420, LEVELS[3], "book", { leanAt: 0.75 });
      fillRow(lps, r, inner1 - 200, inner1, LEVELS[3], "lp", { leanAt: 0.3 });
    }
    // A stack lying flat on the top.
    let y = top;
    for (let i = 0; i < 4; i++) {
      const t = 22 + r() * 26;
      books.push({
        pos: new THREE.Vector3(x0 + 260 + (r() - 0.5) * 30, y + t / 2, cz + (r() - 0.5) * 20),
        rot: new THREE.Euler(0, (r() - 0.5) * 0.3, 0),
        scale: new THREE.Vector3(230 + r() * 60, t, 170 + r() * 60),
        color: new THREE.Color(BOOK_TONES[Math.floor(r() * BOOK_TONES.length)]).multiplyScalar(0.85 + r() * 0.2),
      });
      y += t;
    }
    // Books stacked flat in the gap of the book row.
    y = LEVELS[2];
    for (let i = 0; i < 3; i++) {
      const t = 24 + r() * 20;
      books.push({
        pos: new THREE.Vector3(inner0 + (inner1 - inner0) * 0.62, y + t / 2, cz + (r() - 0.5) * 16),
        rot: new THREE.Euler(0, (r() - 0.5) * 0.25, 0),
        scale: new THREE.Vector3(200 + r() * 40, t, 150 + r() * 40),
        color: new THREE.Color(BOOK_TONES[Math.floor(r() * BOOK_TONES.length)]).multiplyScalar(0.85 + r() * 0.2),
      });
      y += t;
    }
    return { lps, books };
  }, [x0, x1, cx, cz, top, quality]);

  const lpRef = useRef<THREE.InstancedMesh>(null);
  const bookRef = useRef<THREE.InstancedMesh>(null);
  useInstances(lpRef, lps);
  useInstances(bookRef, books);
  const unit = useGeo(() => new THREE.BoxGeometry(1, 1, 1));
  const bookUnit = useGeo(() => roundedBox(1, 1, 1, 0.06, "x", [1, 1]));
  const face = useGeo(() => projectUV(new THREE.BoxGeometry(314, 314, 3), "x", [314, 314], [0.5, 0.5]));

  return (
    <group>
      <mesh geometry={frame} material={kit.oak()} castShadow receiveShadow />
      <instancedMesh ref={lpRef} args={[unit, kit.card(), lps.length]} castShadow receiveShadow />
      <instancedMesh ref={bookRef} args={[bookUnit, kit.card(), books.length]} castShadow receiveShadow />
      {/* Displayed face-out, propped against the back panel. */}
      <mesh
        geometry={face}
        material={kit.sleeve(0)}
        position={[x1 - SIDE - 270, LEVELS[1] + 155, z0 + 60]}
        rotation={[-0.16, 0.05, 0.01]}
        castShadow
        receiveShadow
      />
      {/* A second, smaller face-out on the top row. */}
      {quality !== "low" && (
        <mesh
          geometry={face}
          material={kit.sleeve(4)}
          position={[cx + 90, LEVELS[3] + 157, z0 + 56]}
          rotation={[-0.14, -0.04, -0.012]}
          castShadow
          receiveShadow
        />
      )}
      <Blob x={cx} y={FLOOR_Y} z={cz + 30} w={x1 - x0 + 200} d={depth + 200} strength={0.5} />
    </group>
  );
}

/** A pine crate of records on the floor, one lifted halfway out. */
function Crate() {
  const W = 360;
  const H = 300;
  const D = 350;
  const g = useGeo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const slat = 82;
    for (let i = 0; i < 3; i++) {
      const y = 14 + i * (slat + 12) + slat / 2;
      for (const s of [-1, 1]) {
        const a = roundedBox(W, slat, 14, 2, "x", [500, 125], i * 3 + s);
        a.translate(0, y, s * (D / 2 - 7));
        parts.push(a);
        const b = roundedBox(14, slat, D - 28, 2, "z", [500, 125], i * 5 + s);
        b.translate(s * (W / 2 - 7), y, 0);
        parts.push(b);
      }
    }
    const base = roundedBox(W - 20, 14, D - 20, 2, "x", [500, 125], 9);
    base.translate(0, 7, 0);
    parts.push(base);
    // Corner posts.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const p = roundedBox(26, H, 26, 3, "y", [500, 125], sx * 2 + sz);
        p.translate(sx * (W / 2 - 20), H / 2, sz * (D / 2 - 20));
        parts.push(p);
      }
    }
    return mergeIndexed(parts);
  });
  const items = useMemo(() => {
    const r = rng(509);
    const list: Item[] = [];
    let z = -D / 2 + 22;
    let i = 0;
    while (z < D / 2 - 80) {
      const t = 3 + r() * 3;
      // Records stand across the crate and fan backward as they fill it.
      const lean = -0.1 - (z / D) * 0.25;
      const lift = i === 9 ? 150 : 0;
      list.push({
        pos: new THREE.Vector3((r() - 0.5) * 6, 18 + 157 + lift, z),
        rot: new THREE.Euler(lean, (r() - 0.5) * 0.03, 0),
        scale: new THREE.Vector3(314, 314, t),
        color: new THREE.Color(SPINE_TONES[Math.floor(r() * SPINE_TONES.length)]).multiplyScalar(0.8 + r() * 0.3),
      });
      z += t + 1.2;
      i++;
    }
    return list;
  }, []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useInstances(ref, items);
  const unit = useGeo(() => new THREE.BoxGeometry(1, 1, 1));
  return (
    // In the 370 mm gap between the bookshelf and the console, clear of both.
    <group position={[CONSOLE.x0 - 185, FLOOR_Y + 5, -150]} rotation={[0, 0.02, 0]}>
      <mesh geometry={g} material={kit.pine()} castShadow receiveShadow />
      <instancedMesh ref={ref} args={[unit, kit.card(), items.length]} castShadow receiveShadow />
      <Blob x={0} y={0} z={0} w={520} d={500} strength={0.6} />
    </group>
  );
}

export default function Shelves({ quality }: { quality: Quality }) {
  return (
    <group>
      <Bookshelf quality={quality} />
      <Crate />
    </group>
  );
}
