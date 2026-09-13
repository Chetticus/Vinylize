/**
 * The walnut listening console and everything that lives on it: bookshelf
 * speakers, a small integrated amplifier, headphones on a stand, the sleeve
 * of the record that is playing, a record brush, a cup of coffee going cold,
 * and the cables that tie it together.
 *
 * All positions are in the room's millimetres; the console top is exactly
 * where the turntable's feet stand (CONSOLE.top).
 */

import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";

import { cable, lathe, mergeIndexed, projectUV, roundedBox, taperedLeg } from "./geom";

export { mergeIndexed };
import * as kit from "./kit";
import { CONSOLE, FLOOR_Y } from "./layout";
import { rng } from "./noise";
import type { Quality } from "./quality";
import { useGeo, useGeoSet } from "./useGeo";

const TOP = CONSOLE.top;
const CX = (CONSOLE.x0 + CONSOLE.x1) / 2;
const CZ = (CONSOLE.z0 + CONSOLE.z1) / 2;
const CW = CONSOLE.x1 - CONSOLE.x0;
const CD = CONSOLE.z1 - CONSOLE.z0;
const INSET = 18;
const CARC_TOP = TOP - CONSOLE.slab;
const CARC_BOT = FLOOR_Y + CONSOLE.legH;
const FRONT = CONSOLE.z1 - INSET;
const BAY_X = -300;

/** A soft shadow decal lying on a surface at height y. */
export function Blob({
  x,
  y,
  z,
  w,
  d,
  strength = 0.5,
  rot = 0,
}: {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  strength?: number;
  rot?: number;
}) {
  const g = useGeo(() => new THREE.PlaneGeometry(1, 1));
  return (
    <mesh
      geometry={g}
      material={kit.blobMat(Math.round(strength * 20) / 20)}
      position={[x, y + 0.6, z]}
      rotation={[-Math.PI / 2, 0, rot]}
      scale={[w, d, 1]}
      renderOrder={1}
    />
  );
}

function Carcass() {
  const g = useGeoSet(() => {
    const top = roundedBox(CW, CONSOLE.slab, CD, 6, "x", [CW, CD], 0, 3);
    // Fit the unique console-top texture exactly once across the slab.
    projectUV(top, "x", [CW, CD], [0.5, 0.5]);
    top.translate(CX, TOP - CONSOLE.slab / 2, CZ);

    const parts: THREE.BufferGeometry[] = [];
    const add = (w: number, h: number, d: number, x: number, y: number, z: number, along: "x" | "y" | "z", seed: number) => {
      const b = roundedBox(w, h, d, 2.5, along, kit.WALNUT_TEX, seed);
      b.translate(x, y, z);
      parts.push(b);
    };
    const x0 = CONSOLE.x0 + INSET;
    const x1 = CONSOLE.x1 - INSET;
    const z0 = CONSOLE.z0 + INSET;
    const h = CARC_TOP - CARC_BOT;
    const midY = (CARC_TOP + CARC_BOT) / 2;
    const d = FRONT - z0;
    const midZ = (FRONT + z0) / 2;
    add(22, h, d, x0 + 11, midY, midZ, "y", 1);
    add(22, h, d, x1 - 11, midY, midZ, "y", 2);
    add(x1 - x0, 22, d, (x0 + x1) / 2, CARC_BOT + 11, midZ, "x", 3);
    add(20, h - 22, d - 10, BAY_X, midY + 11, midZ - 5, "y", 4);
    add(20, h - 22, d - 10, 300, midY + 11, midZ - 5, "y", 5);
    // A thin spacer under the top leaves a shadow line between slab and box.
    add(x1 - x0 - 40, 8, d - 40, (x0 + x1) / 2, CARC_TOP - 4 + 0.01, midZ, "x", 6);
    // Top rail of the carcass just below the spacer.
    add(x1 - x0, 20, d, (x0 + x1) / 2, CARC_TOP - 18, midZ, "x", 7);
    const shell = mergeIndexed(parts);

    const back = new THREE.BoxGeometry(x1 - x0, h, 8);
    back.translate((x0 + x1) / 2, midY, z0 + 4);

    // Drawer fronts: two columns of two, 4 mm reveals, grain running across.
    const fronts: THREE.BufferGeometry[] = [];
    const handles: THREE.BufferGeometry[] = [];
    const r = rng(19);
    const rows = 2;
    const openH = CARC_TOP - 28 - (CARC_BOT + 22);
    for (const [bx0, bx1] of [
      [BAY_X + 10, 290],
      [310, x1 - 22],
    ]) {
      for (let row = 0; row < rows; row++) {
        const fh = (openH - 4 * (rows + 1)) / rows;
        const fy = CARC_BOT + 22 + 4 + fh / 2 + row * (fh + 4);
        const fw = bx1 - bx0 - 8;
        const f = roundedBox(fw, fh, 20, 3, "x", kit.WALNUT_TEX, 30 + row * 7 + bx0, 2);
        f.translate((bx0 + bx1) / 2, fy, FRONT - 6);
        fronts.push(f);
        // Bar pull on two short posts, set a touch above centre.
        const hy = fy + fh * 0.14;
        const hx = (bx0 + bx1) / 2 + (r() - 0.5) * 0.6;
        const bar = new THREE.CylinderGeometry(5, 5, 110, 14);
        bar.rotateZ(Math.PI / 2);
        bar.translate(hx, hy, FRONT + 26);
        handles.push(bar);
        for (const s of [-45, 45]) {
          const post = new THREE.CylinderGeometry(3.4, 3.8, 22, 10);
          post.rotateX(Math.PI / 2);
          post.translate(hx + s, hy, FRONT + 14);
          handles.push(post);
        }
      }
    }

    const legs: THREE.BufferGeometry[] = [];
    let seed = 50;
    for (const lx of [x0 + 60, x1 - 60]) {
      for (const lz of [z0 + 60, FRONT - 60]) {
        const leg = taperedLeg(CONSOLE.legH + 6, 20, 12, seed++);
        leg.translate(0, -(CONSOLE.legH + 6) / 2, 0);
        // Splay each leg a few degrees outward from the carcass centre.
        leg.rotateZ(Math.sign(lx) * 0.05);
        leg.rotateX(Math.sign(lz - CZ) * -0.04);
        leg.translate(lx, CARC_BOT + 3, lz);
        legs.push(leg);
      }
    }

    return {
      top,
      shell,
      back,
      fronts: mergeIndexed(fronts),
      handles: mergeIndexed(handles),
      legs: mergeIndexed(legs),
    };
  });

  return (
    <group>
      <mesh geometry={g.top} material={kit.consoleTop()} castShadow receiveShadow />
      <mesh geometry={g.shell} material={kit.walnut()} castShadow receiveShadow />
      <mesh geometry={g.back} material={kit.blackSatin()} receiveShadow />
      <mesh geometry={g.fronts} material={kit.walnut()} castShadow receiveShadow />
      <mesh geometry={g.handles} material={kit.brass()} castShadow />
      <mesh geometry={g.legs} material={kit.walnut()} castShadow receiveShadow />
      <BayRecords />
      <Blob x={CX} y={FLOOR_Y} z={CZ + 10} w={CW + 260} d={CD + 260} strength={0.55} />
    </group>
  );
}

/** Records filed on edge in the console's open bay — one instanced mesh. */
function BayRecords() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useGeo(() => new THREE.BoxGeometry(1, 1, 1));
  const COUNT = 58;
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const r = rng(211);
    const tones = ["#2c2a27", "#4a3a2c", "#6b5f4e", "#8a7a62", "#3b4148", "#5c3a2e", "#a69a82", "#262422", "#51584a"];
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const c = new THREE.Color();
    const floorY = CARC_BOT + 22;
    let x = CONSOLE.x0 + INSET + 26;
    const end = BAY_X - 16;
    let i = 0;
    while (i < COUNT && x < end - 40) {
      const t = 2.5 + r() * 3.5; // single LPs and the odd gatefold
      const lean = x > end - 120 ? -0.28 : (r() - 0.5) * 0.03;
      const hgt = 312 + r() * 6;
      e.set(0, (r() - 0.5) * 0.02, lean);
      q.setFromEuler(e);
      const leanShift = Math.sin(-lean) * hgt * 0.5;
      mtx.compose(
        new THREE.Vector3(x + leanShift, floorY + (hgt / 2) * Math.cos(lean), FRONT - 178 + (r() - 0.5) * 12),
        q,
        new THREE.Vector3(t, hgt, 312 + r() * 4),
      );
      m.setMatrixAt(i, mtx);
      c.set(tones[Math.floor(r() * tones.length)]).multiplyScalar(0.8 + r() * 0.35);
      m.setColorAt(i, c);
      x += t + (r() > 0.85 ? 6 : 0.4);
      i++;
    }
    m.count = i;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);
  return <instancedMesh ref={ref} args={[geo, kit.card(), COUNT]} castShadow receiveShadow />;
}

// ---------------------------------------------------------------------------

function Speaker({ position, rotY }: { position: [number, number, number]; rotY: number }) {
  const W = 220;
  const H = 360;
  const D = 250;
  const g = useGeoSet(() => {
    const body = roundedBox(W, H, D - 16, 7, "y", kit.WALNUT_TEX, position[0], 3);
    body.translate(0, 0, -8);
    const lip = 14;
    const frame = mergeIndexed([
      (() => {
        const b = roundedBox(W, lip, 16, 3, "x", kit.WALNUT_TEX, 1);
        b.translate(0, H / 2 - lip / 2, D / 2 - 8);
        return b;
      })(),
      (() => {
        const b = roundedBox(W, lip, 16, 3, "x", kit.WALNUT_TEX, 2);
        b.translate(0, -H / 2 + lip / 2, D / 2 - 8);
        return b;
      })(),
      (() => {
        const b = roundedBox(lip, H - lip * 2, 16, 3, "y", kit.WALNUT_TEX, 3);
        b.translate(-W / 2 + lip / 2, 0, D / 2 - 8);
        return b;
      })(),
      (() => {
        const b = roundedBox(lip, H - lip * 2, 16, 3, "y", kit.WALNUT_TEX, 4);
        b.translate(W / 2 - lip / 2, 0, D / 2 - 8);
        return b;
      })(),
    ]);
    // Grille cloth stretched over a frame, recessed behind the lip.
    const grille = roundedBox(W - lip * 2 + 2, H - lip * 2 + 2, 8, 2, "x", [120, 120]);
    grille.translate(0, 0, D / 2 - 12);
    const pads = mergeIndexed(
      [-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => {
          const p = new THREE.CylinderGeometry(11, 11, 7, 14);
          p.translate(sx * (W / 2 - 24), -H / 2 - 3.5, sz * (D / 2 - 30));
          return p;
        }),
      ),
    );
    return { body, frame, grille, pads };
  });
  return (
    <group position={position} rotation={[0, rotY, 0]}>
      <mesh geometry={g.body} material={kit.walnut()} castShadow receiveShadow />
      <mesh geometry={g.frame} material={kit.walnut()} castShadow receiveShadow />
      <mesh geometry={g.grille} material={kit.grille()} receiveShadow />
      <mesh geometry={g.pads} material={kit.corduroy()} />
    </group>
  );
}

/** A small integrated amplifier: brushed face, two big knobs, two small,
 * a toggle, a headphone socket and an amber pilot lamp. */
function Amplifier() {
  const W = 300;
  const H = 86;
  const D = 250;
  const g = useGeoSet(() => {
    const kase = roundedBox(W - 6, H, D - 8, 5, "x", [400, 400]);
    kase.translate(0, H / 2 + 6, -4);
    const face = roundedBox(W, H + 4, 8, 2.5, "x", [300, 300]);
    face.translate(0, H / 2 + 6, D / 2 - 4);
    const knobProfile = (r: number, h: number): Array<[number, number]> => [
      [0, 0],
      [r, 0],
      [r, h * 0.78],
      [r * 0.93, h],
      [0, h],
    ];
    const big = lathe(knobProfile(17, 18), 40);
    big.rotateX(Math.PI / 2);
    const small = lathe(knobProfile(9.5, 13), 28);
    small.rotateX(Math.PI / 2);
    const knobs = mergeIndexed([
      big.clone().translate(-92, H / 2 + 8, D / 2),
      big.clone().translate(62, H / 2 + 8, D / 2),
      small.clone().translate(-28, H / 2 + 20, D / 2),
      small.clone().translate(-28, H / 2 - 8, D / 2),
    ]);
    big.dispose();
    small.dispose();
    // Pointer lines on the knob faces, each left where it was last turned.
    const marks = mergeIndexed(
      [
        [-92, H / 2 + 8, 18, 2.2],
        [62, H / 2 + 8, 18, -0.6],
        [-28, H / 2 + 20, 13, 0.9],
        [-28, H / 2 - 8, 13, -1.4],
      ].map(([x, y, z, a]) => {
        const m = new THREE.BoxGeometry(1.6, 9, 1);
        m.translate(0, 6, 0);
        m.rotateZ(a);
        m.translate(x, y, D / 2 + z + 0.4);
        return m;
      }),
    );
    const toggle = mergeIndexed([
      new THREE.CylinderGeometry(5, 5, 4, 16).rotateX(Math.PI / 2).translate(112, H / 2 + 14, D / 2 + 2),
      new THREE.CylinderGeometry(1.4, 2, 14, 10).rotateX(Math.PI / 2 - 0.5).translate(112, H / 2 + 17, D / 2 + 8),
      new THREE.CylinderGeometry(5.5, 5.5, 3, 18).rotateX(Math.PI / 2).translate(112, H / 2 - 12, D / 2 + 1.5),
    ]);
    const socket = new THREE.TorusGeometry(4.2, 1.2, 8, 20).translate(112, H / 2 - 12, D / 2 + 3);
    // Ventilation slots across the lid.
    const vents = mergeIndexed(
      Array.from({ length: 14 }, (_, i) =>
        new THREE.BoxGeometry(150, 1.2, 5).translate(-30, H + 6 + 0.2, -80 + i * 11),
      ),
    );
    const feet = mergeIndexed(
      [-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) =>
          new THREE.CylinderGeometry(12, 13, 6, 16).translate(sx * (W / 2 - 30), 3, sz * (D / 2 - 30)),
        ),
      ),
    );
    return { kase, face, knobs, marks, toggle, socket, vents, feet };
  });
  return (
    <group position={[-470, TOP, -118]} rotation={[0, 0.045, 0]}>
      <mesh geometry={g.kase} material={kit.brushedDark()} castShadow receiveShadow />
      <mesh geometry={g.face} material={kit.brushedAlu()} castShadow receiveShadow />
      <mesh geometry={g.knobs} material={kit.brushedAlu()} castShadow />
      <mesh geometry={g.marks} material={kit.blackSatin()} />
      <mesh geometry={g.toggle} material={kit.brushedAlu()} />
      <mesh geometry={g.socket} material={kit.blackSatin()} />
      <mesh geometry={g.vents} material={kit.rubber()} />
      <mesh geometry={g.feet} material={kit.rubber()} />
      <mesh position={[112, 86 / 2 + 36, 250 / 2 + 1.5]}>
        <sphereGeometry args={[2.6, 12, 8]} />
        <meshStandardMaterial color="#ffb45a" emissive="#ff9a2e" emissiveIntensity={3} toneMapped={false} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------

const STAND = { x: 545, z: -205, rod: 285 };
const HANGER_Y = TOP + 16 + STAND.rod + 10;
const PHONES = { rotY: 0.62, drop: 67, shift: 6 };

function phonesToWorld(p: THREE.Vector3) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(STAND.x + PHONES.shift, HANGER_Y - PHONES.drop, STAND.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0.02, PHONES.rotY, 0.035)),
    new THREE.Vector3(1, 1, 1),
  );
  return p.applyMatrix4(m);
}

function HeadphoneStand() {
  const g = useGeoSet(() => {
    const base = lathe(
      [
        [0, 0],
        [56, 0],
        [58, 4],
        [55, 14],
        [14, 17],
        [0, 17],
      ],
      48,
    );
    projectUV(base, "x", kit.WALNUT_TEX);
    base.translate(STAND.x, TOP, STAND.z);
    const rod = new THREE.CylinderGeometry(5, 6, STAND.rod, 16).translate(STAND.x, TOP + 16 + STAND.rod / 2, STAND.z);
    const cradle = roundedBox(96, 18, 26, 8, "x", kit.WALNUT_TEX, 9);
    cradle.rotateY(PHONES.rotY);
    cradle.translate(STAND.x, HANGER_Y, STAND.z);
    return { base, rod, cradle };
  });
  return (
    <group>
      <mesh geometry={g.base} material={kit.walnut()} castShadow receiveShadow />
      <mesh geometry={g.rod} material={kit.brass()} castShadow />
      <mesh geometry={g.cradle} material={kit.walnut()} castShadow receiveShadow />
      <Blob x={STAND.x} y={TOP} z={STAND.z} w={150} d={150} strength={0.55} />
    </group>
  );
}

function Headphones() {
  const g = useGeoSet(() => {
    const R = 92;
    const band = new THREE.TorusGeometry(R, 5, 10, 48, Math.PI);
    const pad = new THREE.TorusGeometry(R - 8, 8, 10, 32, Math.PI * 0.52).rotateZ(Math.PI * 0.24);
    const sliders = mergeIndexed(
      [-1, 1].map((s) => new THREE.CylinderGeometry(2.4, 2.4, 34, 8).translate(s * R, -17, 0)),
    );
    const yokes = mergeIndexed(
      [-1, 1].map((s) =>
        new THREE.TorusGeometry(50, 3.2, 8, 24, Math.PI).rotateY(Math.PI / 2).translate(s * R, -84, 0),
      ),
    );
    const cups = mergeIndexed(
      [-1, 1].map((s) =>
        lathe(
          [
            [0, -17],
            [40, -17],
            [46, -12],
            [47, 12],
            [42, 17],
            [0, 17],
          ],
          40,
        )
          .rotateZ(Math.PI / 2)
          .translate(s * (R - 2), -84, 0),
      ),
    );
    const caps = mergeIndexed(
      [-1, 1].map((s) => {
        const c = new THREE.CylinderGeometry(33, 36, 5, 40);
        projectUV(c, "z", kit.WALNUT_TEX);
        return c.rotateZ(Math.PI / 2).translate(s * (R + 17), -84, 0);
      }),
    );
    const pads = mergeIndexed(
      [-1, 1].map((s) =>
        new THREE.TorusGeometry(34, 11, 12, 32).rotateY(Math.PI / 2).translate(s * (R - 22), -84, 0),
      ),
    );
    // Cable: from the left cup, down to the console, a relaxed loop, then
    // behind the deck to the amplifier's headphone socket.
    const w = (x: number, y: number, z: number) => phonesToWorld(new THREE.Vector3(x, y, z));
    const start = w(-R - 8, -84 - 38, 12);
    const pts: Array<[number, number, number]> = [
      start.toArray() as [number, number, number],
      [start.x - 6, start.y - 40, start.z + 10],
      [STAND.x - 60, TOP + 30, STAND.z + 60],
      [STAND.x - 110, TOP + 4, STAND.z + 40],
      [STAND.x - 150, TOP + 4, STAND.z - 40],
      [STAND.x - 240, TOP + 4, -310],
      [60, TOP + 4, -330],
      [-250, TOP + 4, -300],
      [-290, TOP + 4, -150],
      [-300, TOP + 8, 20],
      [-340, TOP + 30, 20],
      [-352, TOP + 31, 12],
    ];
    const cord = cable(pts, 2.2, 6);
    return { band, pad, sliders, yokes, cups, caps, pads, cord };
  });
  return (
    <group>
      <group
        position={[STAND.x + PHONES.shift, HANGER_Y - PHONES.drop, STAND.z]}
        rotation={[0.02, PHONES.rotY, 0.035]}
      >
        <mesh geometry={g.band} material={kit.brushedDark()} castShadow />
        <mesh geometry={g.pad} material={kit.leather()} castShadow />
        <mesh geometry={g.sliders} material={kit.brushedAlu()} castShadow />
        <mesh geometry={g.yokes} material={kit.brushedDark()} castShadow />
        <mesh geometry={g.cups} material={kit.blackSatin()} castShadow receiveShadow />
        <mesh geometry={g.caps} material={kit.walnut()} castShadow />
        <mesh geometry={g.pads} material={kit.leather()} castShadow />
      </group>
      <mesh geometry={g.cord} material={kit.cableMat()} castShadow />
    </group>
  );
}

function Cables() {
  const g = useGeo(() => {
    const y = TOP + 3;
    // Phono lead: out of the plinth's back, down, along to the amp.
    const phono = cable(
      [
        [250, -40, -222],
        [252, -46, -250],
        [240, y + 2, -290],
        [80, y, -318],
        [-180, y, -300],
        [-340, y + 2, -268],
        [-380, TOP + 30, -246],
      ],
      2.8,
    );
    // Speaker wire, a little looser, draped off the back edge to each side.
    const left = cable(
      [
        [-560, TOP + 24, -246],
        [-590, y, -290],
        [-660, y, -320],
        [-720, TOP + 30, -268],
      ],
      2.2,
    );
    const right = cable(
      [
        [-420, TOP + 22, -246],
        [-400, y, -335],
        [0, y, -352],
        [400, y, -345],
        [690, y, -318],
        [760, TOP + 40, -262],
      ],
      2.2,
    );
    return mergeIndexed([phono, left, right]);
  });
  return <mesh geometry={g} material={kit.cableMat()} castShadow />;
}

// ---------------------------------------------------------------------------

function Cup() {
  const g = useGeoSet(() => {
    // A handmade mug: slightly flared wall with real thickness and a foot.
    const wall = lathe(
      [
        [0, 1],
        [30, 0],
        [34, 2],
        [36, 30],
        [39, 78],
        [40.5, 86],
        [38, 87],
        [35.5, 80],
        [33.5, 30],
        [31, 8],
        [0, 8],
      ],
      56,
    );
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(37, 70, 0),
      new THREE.Vector3(58, 68, 0),
      new THREE.Vector3(64, 46, 0),
      new THREE.Vector3(54, 26, 0),
      new THREE.Vector3(35, 22, 0),
    ]);
    const handle = new THREE.TubeGeometry(handleCurve, 24, 5.2, 10, false);
    const coffee = new THREE.CircleGeometry(35, 40).rotateX(-Math.PI / 2).translate(0, 46, 0);
    // A faint tide line where the coffee stood higher before.
    const tide = new THREE.TorusGeometry(35.2, 0.5, 4, 48).rotateX(Math.PI / 2).translate(0, 62, 0);
    const coaster = lathe(
      [
        [0, 0],
        [52, 0],
        [54, 2],
        [54, 5],
        [52, 7],
        [0, 7],
      ],
      48,
    );
    return { wall, handle, coffee, tide, coaster };
  });
  return (
    <group position={[-338, TOP, 138]} rotation={[0, -2.2, 0]}>
      <mesh geometry={g.coaster} material={kit.corduroy()} castShadow receiveShadow />
      <group position={[0, 7, 0]}>
        <mesh geometry={g.wall} material={kit.cupGlaze()} castShadow receiveShadow />
        <mesh geometry={g.handle} material={kit.cupGlaze()} castShadow />
        <mesh geometry={g.coffee} material={kit.coffee()} />
        <mesh geometry={g.tide} material={kit.coffee()} />
      </group>
      <Blob x={0} y={0} z={0} w={140} d={140} strength={0.5} />
    </group>
  );
}

/** The jacket of the record that's playing, its inner sleeve half out, and
 * the next record waiting underneath — left where they were put down. */
function Sleeves() {
  const g = useGeoSet(() => ({
    // Sleeve art mapped once across the face.
    jacket: projectUV(roundedBox(314, 3, 314, 1.2, "x", [314, 314], 0, 1), "x", [314, 314], [0.5, 0.5]),
    inner: new THREE.BoxGeometry(296, 0.8, 296),
    brushBody: roundedBox(116, 20, 38, 4, "x", kit.WALNUT_TEX, 4, 3),
    brushPad: roundedBox(108, 7, 32, 3, "x", [120, 120]),
  }));
  return (
    <group>
      <group position={[498, TOP, 84]} rotation={[0, -0.13, 0]}>
        <mesh geometry={g.jacket} material={kit.sleeve(1)} position={[0, 1.5, 0]} castShadow receiveShadow />
        <mesh geometry={g.jacket} material={kit.sleeve(3)} position={[14, 4.6, -10]} rotation={[0, 0.09, 0]} castShadow receiveShadow />
        {/* Inner paper sleeve, pulled half out and resting on top. */}
        <mesh geometry={g.inner} material={kit.paper()} position={[-96, 3.4, 18]} rotation={[0, 0.12, 0]} castShadow receiveShadow />
        <Blob x={0} y={0} z={0} w={400} d={400} strength={0.35} />
      </group>
      {/* Record brush, set down velvet-up the way it's kept clean. */}
      <group position={[430, TOP + 6.2 + 10, 190]} rotation={[0, 0.62, 0]}>
        <mesh geometry={g.brushBody} material={kit.walnut()} castShadow receiveShadow />
        <mesh geometry={g.brushPad} material={kit.velvet()} position={[0, 11, 0]} receiveShadow />
      </group>
    </group>
  );
}

export default function Console({ quality }: { quality: Quality }) {
  return (
    <group>
      <Carcass />
      <Speaker position={[-768, TOP + 7 + 180, -148]} rotY={0.16} />
      <Speaker position={[772, TOP + 7 + 180, -142]} rotY={-0.13} />
      <Blob x={-768} y={TOP} z={-148} w={300} d={320} strength={0.6} rot={0.16} />
      <Blob x={772} y={TOP} z={-142} w={300} d={320} strength={0.6} rot={-0.13} />
      <Amplifier />
      <Blob x={-470} y={TOP} z={-118} w={360} d={300} strength={0.6} />
      <HeadphoneStand />
      <Headphones />
      {quality !== "low" && <Cables />}
      <Cup />
      <Sleeves />
      {/* The deck itself: soft occlusion under the plinth. */}
      <Blob x={35} y={TOP} z={-10} w={680} d={540} strength={0.7} />
    </group>
  );
}
