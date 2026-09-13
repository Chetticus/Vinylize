/**
 * A rubber-fig-like floor plant in a speckled pot: a few woody stems, each
 * carrying broad leaves that droop and turn toward the window. Leaves are one
 * instanced mesh with per-leaf size, curl and colour (one yellowing, a few
 * young and pale), so no two read as copies.
 */

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { cable, lathe, leafGeometry } from "./geom";
import * as kit from "./kit";
import { Blob, mergeIndexed } from "./Console";
import { FLOOR_Y } from "./layout";
import { rng } from "./noise";
import type { Quality } from "./quality";
import { useGeoSet } from "./useGeo";

export const PLANT = { x: 1190, z: -150 };

export default function Plant({ quality }: { quality: Quality }) {
  const POT_H = 330;
  const stems = useMemo(() => {
    const r = rng(733);
    const list: THREE.CatmullRomCurve3[] = [];
    const n = quality === "low" ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.6;
      const lean = 60 + r() * 160;
      const h = 520 + r() * 520;
      // Stems lean toward the window light (-z) a little more.
      const dx = Math.cos(a) * lean - 40;
      const dz = Math.sin(a) * lean - 90;
      list.push(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(Math.cos(a) * 20, POT_H - 20, Math.sin(a) * 20),
          new THREE.Vector3(dx * 0.25, POT_H + h * 0.35, dz * 0.25),
          new THREE.Vector3(dx * 0.7, POT_H + h * 0.75, dz * 0.7),
          new THREE.Vector3(dx, POT_H + h, dz),
        ]),
      );
    }
    return list;
  }, [quality]);

  const g = useGeoSet(() => {
    const pot = lathe(
      [
        [0, 0],
        [118, 0],
        [124, 10],
        [150, 280],
        [162, 312],
        [164, 330],
        [154, 332],
        [140, 300],
        [0, 300],
      ],
      56,
    );
    const soil = new THREE.CircleGeometry(141, 40).rotateX(-Math.PI / 2).translate(0, 296, 0);
    const stemGeo = mergeIndexed(
      stems.map((c) => cable(c.getPoints(8).map((p) => p.toArray() as [number, number, number]), 5.5, 6)),
    );
    const leaf = leafGeometry(1, 1, 0.5, 0.18);
    return { pot, soil, stemGeo, leaf };
  });

  const leafRef = useRef<THREE.InstancedMesh>(null);
  const leaves = useMemo(() => {
    const r = rng(811);
    const out: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const p = new THREE.Vector3();
    const tan = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    stems.forEach((curve, si) => {
      const count = 7 + Math.floor(r() * 4);
      for (let k = 0; k < count; k++) {
        const t = 0.25 + (k / count) * 0.75 + r() * 0.03;
        curve.getPoint(Math.min(t, 1), p);
        curve.getTangent(Math.min(t, 1), tan);
        const young = t > 0.92;
        const len = young ? 110 + r() * 40 : 190 + r() * 90;
        const wid = len * (0.48 + r() * 0.12);
        // Alternate sides around the stem, pointing out and drooping.
        const around = k * 2.4 + si;
        const out3 = new THREE.Vector3(Math.cos(around), 0, Math.sin(around));
        const droop = young ? 0.35 : 0.9 + r() * 0.5;
        const dir = out3.clone().multiplyScalar(Math.sin(droop)).addScaledVector(up, Math.cos(droop)).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
        // Roll the blade so its face turns upward toward the light.
        const roll = new THREE.Quaternion().setFromAxisAngle(dir, around + Math.PI / 2 + (r() - 0.5) * 0.6);
        q.premultiply(roll);
        const m = new THREE.Matrix4().compose(p.clone(), q, new THREE.Vector3(wid, len, wid));
        let c = new THREE.Color("#3d5a2c").multiplyScalar(0.75 + r() * 0.4);
        if (young) c = new THREE.Color("#7a9a45");
        if (si === 1 && k === 0) c = new THREE.Color("#a39148"); // the one leaf on its way out
        out.push({ m, c });
      }
    });
    return out;
  }, [stems]);

  useLayoutEffect(() => {
    const m = leafRef.current;
    if (!m) return;
    leaves.forEach((l, i) => {
      m.setMatrixAt(i, l.m);
      m.setColorAt(i, l.c);
    });
    m.count = leaves.length;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [leaves]);

  const soilMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#2a2018", roughness: 1 }), []);
  const stemMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#5b4a33", roughness: 0.8 }), []);
  useLayoutEffect(
    () => () => {
      soilMat.dispose();
      stemMat.dispose();
    },
    [soilMat, stemMat],
  );

  return (
    <group position={[PLANT.x, FLOOR_Y, PLANT.z]}>
      <mesh geometry={g.pot} material={kit.potGlaze()} castShadow receiveShadow />
      <mesh geometry={g.soil} material={soilMat} receiveShadow />
      <mesh geometry={g.stemGeo} material={stemMat} castShadow />
      <instancedMesh ref={leafRef} args={[g.leaf, kit.leafMat(), leaves.length]} castShadow receiveShadow />
      <Blob x={0} y={0} z={0} w={460} d={460} strength={0.6} />
    </group>
  );
}
