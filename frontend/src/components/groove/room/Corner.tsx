/**
 * The reading corner: a worn leather club chair turned toward the speakers,
 * a wool throw over its arm, a small oak side table with a lamp, an open
 * notebook and pencil, a dish with a guitar pick, books on the floor, and
 * the rug that anchors it all.
 */

import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";

import { Blob, mergeIndexed } from "./Console";
import { cushion, drapedSheet, lathe, projectUV, roundedBox, taperedLeg } from "./geom";
import * as kit from "./kit";
import { FLOOR_Y } from "./layout";
import { rng } from "./noise";
import type { Quality } from "./quality";
import { useGeo, useGeoSet } from "./useGeo";

export const CHAIR = { x: -1330, z: 560, rotY: 2.05 };
export const SIDE_TABLE = { x: -1730, z: -40, top: FLOOR_Y + 540 };
/** Where the lamp's bulb sits (for RoomLights). */
export const LAMP_BULB: [number, number, number] = [SIDE_TABLE.x + 70, SIDE_TABLE.top + 400, SIDE_TABLE.z - 60];

const LEATHER_TEX: [number, number] = [760, 760];

function Chair() {
  const g = useGeoSet(() => {
    const base = roundedBox(820, 190, 800, 28, "x", LEATHER_TEX, 1, 4);
    base.translate(0, 95 + 90, 0);
    const seat = cushion(610, 120, 600, 34, 16, [0.15, 0.25], 2);
    seat.translate(0, 280 + 55, 70);
    const back = cushion(620, 170, 560, 60, 20, [0, -0.1], 3);
    back.rotateX(Math.PI / 2 - 0.2);
    back.translate(0, 590, -290);
    // Arms: an upholstered panel finished with a rolled, slightly oversized
    // scroll along the top — the club-chair silhouette.
    const arms = mergeIndexed(
      [-1, 1].flatMap((s, i) => {
        const a = roundedBox(104, 290, 800, 40, "z", LEATHER_TEX, 4 + i, 5);
        a.translate(s * 352, 250 + 145, 0);
        const roll = new THREE.CapsuleGeometry(60, 700, 8, 24).rotateX(Math.PI / 2);
        projectUV(roll, "z", LEATHER_TEX, [i * 0.3, 0.1]);
        roll.translate(s * 362, 548, 10);
        return [a, roll];
      }),
    );
    // Deep buttoning across the back cushion.
    const tilt = Math.PI / 2 - 0.2;
    const buttons = mergeIndexed(
      [-160, 0, 160].flatMap((x) =>
        [-110, 70].map((zc) =>
          new THREE.SphereGeometry(8, 10, 8)
            .scale(1, 1, 0.55)
            .rotateX(-0.2)
            .translate(
              x + (zc > 0 ? 0 : x === 0 ? 0 : Math.sign(x) * 10),
              590 + 96 * Math.cos(tilt) - zc * Math.sin(tilt),
              -290 + 96 * Math.sin(tilt) + zc * Math.cos(tilt),
            ),
        ),
      ),
    );
    const outerBack = roundedBox(820, 520, 150, 50, "x", LEATHER_TEX, 6, 5);
    outerBack.rotateX(-0.12);
    outerBack.translate(0, 520, -345);
    const legs = mergeIndexed(
      [-1, 1].flatMap((sx) =>
        [-1, 1].map((sz, i) => {
          const l = taperedLeg(92, 22, 15, i + sx);
          l.rotateZ(sx * -0.08);
          l.rotateX(sz * 0.08);
          l.translate(sx * 350, 46, sz * 330);
          return l;
        }),
      ),
    );
    return { base, seat, back, arms, outerBack, legs, buttons };
  });

  // The throw: over the right arm, with a loose fold spilling onto the seat
  // and a hem hanging almost to the floor.
  const throwGeo = useGeo(() => {
    const path = new THREE.CatmullRomCurve3(
      [
        [-110, 402, 0],
        [-240, 412, 0],
        [-300, 560, 0],
        [-352, 614, 0],
        [-412, 596, 0],
        [-432, 520, 0],
        [-436, 340, 0],
        [-440, 170, 0],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    );
    const tangent = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const r = rng(77);
    const phases = [r() * 6, r() * 6, r() * 6];
    return drapedSheet(640, 1, 24, 60, (u, v, out) => {
      const t = 1 - v;
      path.getPoint(t, out);
      path.getTangent(t, tangent);
      normal.set(-tangent.y, tangent.x, 0);
      const across = (u - 0.5) * 640;
      // Folds deepen where the cloth hangs free.
      const hang = THREE.MathUtils.smoothstep(t, 0.55, 1);
      const fold =
        Math.sin(u * 9 + phases[0] + t * 2) * (6 + 22 * hang) +
        Math.sin(u * 23 + phases[1]) * 3 +
        Math.sin(u * 4 + phases[2] + t * 5) * 10 * hang;
      out.addScaledVector(normal, fold);
      out.z = across * (1 + hang * 0.12) + 40 + Math.sin(t * 3 + u) * 12;
      // The corner nearest the seat is turned back on itself a little.
      if (t < 0.18 && u > 0.7) out.y += (0.18 - t) * (u - 0.7) * 160;
    });
  });

  return (
    <group position={[CHAIR.x, FLOOR_Y, CHAIR.z]} rotation={[0, CHAIR.rotY, 0]}>
      <mesh geometry={g.base} material={kit.leather()} castShadow receiveShadow />
      <mesh geometry={g.seat} material={kit.leather()} castShadow receiveShadow />
      <mesh geometry={g.back} material={kit.leather()} castShadow receiveShadow />
      <mesh geometry={g.arms} material={kit.leather()} castShadow receiveShadow />
      <mesh geometry={g.outerBack} material={kit.leather()} castShadow receiveShadow />
      <mesh geometry={g.buttons} material={kit.leather()} />
      <mesh geometry={g.legs} material={kit.oak()} castShadow />
      <mesh geometry={throwGeo} material={kit.throwWool()} castShadow receiveShadow />
      <Blob x={0} y={0} z={0} w={1050} d={1050} strength={0.6} />
    </group>
  );
}

function SideTable({ quality }: { quality: Quality }) {
  const T = SIDE_TABLE.top;
  const g = useGeoSet(() => {
    const top = lathe(
      [
        [0, -26],
        [226, -26],
        [232, -20],
        [233, -6],
        [229, 0],
        [0, 0],
      ],
      64,
    );
    projectUV(top, "x", [600, 150]);
    const legs = mergeIndexed(
      [0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        const len = T - FLOOR_Y - 26;
        const l = taperedLeg(len + 8, 19, 12, i);
        l.translate(0, -len / 2, 0);
        l.rotateZ(0.09);
        l.rotateY(-a);
        l.translate(Math.cos(a) * 150, -26, Math.sin(a) * 150);
        return l;
      }),
    );
    const shelf = lathe(
      [
        [0, -14],
        [150, -14],
        [152, 0],
        [0, 0],
      ],
      48,
    );
    projectUV(shelf, "x", [600, 150]);
    shelf.translate(0, -300, 0);

    // Lamp: speckled ceramic body, brass neck, linen drum shade.
    const lampBody = lathe(
      [
        [0, 0],
        [62, 0],
        [66, 6],
        [84, 90],
        [80, 170],
        [48, 230],
        [20, 250],
        [0, 252],
      ],
      48,
    );
    const neck = new THREE.CylinderGeometry(7, 9, 150, 16).translate(0, 250 + 75, 0);
    const shade = lathe(
      [
        [168, 0],
        [118, 200],
      ],
      64,
    ).translate(0, 300, 0);
    const shadeRims = mergeIndexed([
      new THREE.TorusGeometry(168, 2, 6, 64).rotateX(Math.PI / 2).translate(0, 300, 0),
      new THREE.TorusGeometry(118, 2, 6, 64).rotateX(Math.PI / 2).translate(0, 500, 0),
    ]);

    // Open notebook with a slight belly toward the spine; pencil beside it.
    const pages = new THREE.PlaneGeometry(300, 212, 30, 1);
    const pp = pages.attributes.position;
    for (let i = 0; i < pp.count; i++) {
      const x = pp.getX(i);
      const lift = 7 * Math.sqrt(Math.min(1, Math.abs(x) / 150)) - 2.5 * Math.abs(x) / 150;
      pp.setZ(i, lift);
    }
    pages.computeVertexNormals();
    pages.rotateX(-Math.PI / 2);
    const cover = roundedBox(312, 4, 222, 1.5, "x", [320, 320]);
    const pencil = mergeIndexed([
      new THREE.CylinderGeometry(3.8, 3.8, 150, 6).rotateZ(Math.PI / 2),
      new THREE.CylinderGeometry(0.8, 3.6, 18, 6).rotateZ(-Math.PI / 2).translate(84, 0, 0),
    ]);
    const dish = lathe(
      [
        [0, 0],
        [30, 0],
        [44, 10],
        [52, 18],
        [49, 19],
        [40, 12],
        [0, 6],
      ],
      40,
    );
    const pickShape = new THREE.Shape();
    pickShape.moveTo(0, -14);
    pickShape.quadraticCurveTo(15, -4, 13, 8);
    pickShape.quadraticCurveTo(0, 16, -13, 8);
    pickShape.quadraticCurveTo(-15, -4, 0, -14);
    const pick = new THREE.ExtrudeGeometry(pickShape, { depth: 0.8, bevelEnabled: false, curveSegments: 8 });
    pick.rotateX(-Math.PI / 2);
    return { top, legs, shelf, lampBody, neck, shade, shadeRims, pages, cover, pencil, dish, pick };
  });

  return (
    <group position={[SIDE_TABLE.x, T, SIDE_TABLE.z]}>
      <mesh geometry={g.top} material={kit.oak()} castShadow receiveShadow />
      <mesh geometry={g.legs} material={kit.oak()} castShadow receiveShadow />
      <mesh geometry={g.shelf} material={kit.oak()} castShadow receiveShadow />
      <Blob x={0} y={FLOOR_Y - T} z={0} w={520} d={520} strength={0.5} />

      <group position={[70, 0, -60]}>
        <mesh geometry={g.lampBody} material={kit.potGlaze()} castShadow receiveShadow />
        <mesh geometry={g.neck} material={kit.brass()} castShadow />
        <mesh geometry={g.shade} material={kit.linen()} castShadow />
        <mesh geometry={g.shadeRims} material={kit.brass()} />
        <Blob x={0} y={0} z={0} w={220} d={220} strength={0.6} />
      </group>

      <group position={[-40, 2, 95]} rotation={[0, 0.42, 0]}>
        <mesh geometry={g.cover} material={kit.leather()} castShadow receiveShadow />
        <mesh geometry={g.pages} material={kit.notebook()} position={[0, 2.6, 0]} receiveShadow />
        <mesh geometry={g.pencil} material={kit.oak()} position={[30, 12, -40]} rotation={[0, -0.7, 0]} castShadow />
        <Blob x={0} y={-2} z={0} w={380} d={290} strength={0.45} />
      </group>

      {quality !== "low" && (
        <group position={[118, 0, 110]}>
          <mesh geometry={g.dish} material={kit.cupGlaze()} castShadow receiveShadow />
          <mesh geometry={g.pick} material={kit.leather()} position={[4, 8.5, 2]} rotation={[0, 0.8, 0]} />
        </group>
      )}
      {/* Books on the lower shelf. */}
      {quality !== "low" && <BookPile position={[0, -300, 0]} seed={5} count={3} flat />}
    </group>
  );
}

/** A small pile of books, instanced, each a little out of line. */
function BookPile({
  position,
  seed,
  count,
  flat = true,
  rotY = 0,
}: {
  position: [number, number, number];
  seed: number;
  count: number;
  flat?: boolean;
  rotY?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useGeo(() => roundedBox(1, 1, 1, 0.08, "x", [1, 1]));
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const r = rng(seed);
    const tones = ["#6e2f24", "#2f3e4f", "#c2b394", "#43513c", "#8a6a3a", "#2a2624", "#7c7468"];
    const c = new THREE.Color();
    const mtx = new THREE.Matrix4();
    let y = 0;
    for (let i = 0; i < count; i++) {
      const w = 150 + r() * 90;
      const d = 220 + r() * 70;
      const t = 18 + r() * 30;
      mtx.compose(
        new THREE.Vector3((r() - 0.5) * 24, y + t / 2, (r() - 0.5) * 20),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY + (r() - 0.5) * 0.35, 0)),
        new THREE.Vector3(flat ? w : t, flat ? t : w, d),
      );
      y += t;
      m.setMatrixAt(i, mtx);
      c.set(tones[Math.floor(r() * tones.length)]).multiplyScalar(0.85 + r() * 0.25);
      m.setColorAt(i, c);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [seed, count, flat, rotY]);
  return (
    <group position={position}>
      <instancedMesh ref={ref} args={[geo, kit.card(), count]} castShadow receiveShadow />
    </group>
  );
}

function Rug() {
  const g = useGeo(() => {
    const W = 2300;
    const D = 1600;
    const geo = new THREE.BoxGeometry(W, 5, D, 1, 1, 1);
    projectUV(geo, "x", [W, D], [0.5, 0.5]);
    return geo;
  });
  return (
    <mesh
      geometry={g}
      material={kit.rug()}
      position={[-1000, FLOOR_Y + 2.5, 560]}
      rotation={[0, 0.045, 0]}
      receiveShadow
    />
  );
}

export default function Corner({ quality }: { quality: Quality }) {
  return (
    <group>
      <Rug />
      <Chair />
      <SideTable quality={quality} />
      <BookPile position={[-1110, FLOOR_Y + 8, 900]} seed={17} count={quality === "low" ? 2 : 4} rotY={0.3} />
    </group>
  );
}
