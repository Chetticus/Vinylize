/**
 * The room itself: plastered walls with real thickness, a deep window
 * reveal with a painted sash, rain on the glass and a dusk street beyond,
 * oak floorboards, baseboards and a picture rail.
 *
 * Walls are built in world coordinates before their UVs are projected, so
 * the plaster and floorboard patterns run continuously across the pieces
 * around the window opening instead of restarting at every seam.
 */

import * as THREE from "three";

import { mergeIndexed, projectUV, roundedBox, type Axis } from "./geom";
import * as kit from "./kit";
import { BACK_Z, CEIL_Y, FLOOR_Y, FRONT_Z, LEFT_X, RIGHT_X, WALL_T, WIN } from "./layout";
import { useGeo, useGeoSet } from "./useGeo";

/** Axis-aligned box from min/max corners, UVs projected in world mm. */
function worldBox(
  min: [number, number, number],
  max: [number, number, number],
  along: Axis,
  texSize: [number, number],
): THREE.BufferGeometry {
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  return projectUV(g, along, texSize);
}

const OUT_Z = BACK_Z - WALL_T;
const SASH_Z = BACK_Z - 92; // the sash sits most of the way into the reveal

export default function Shell() {
  const g = useGeoSet(() => {
    const T = kit.PLASTER_TEX;
    const walls = mergeIndexed([
      // Back wall, around the window opening.
      worldBox([LEFT_X, FLOOR_Y, OUT_Z], [RIGHT_X, WIN.y0, BACK_Z], "x", T),
      worldBox([LEFT_X, WIN.y1, OUT_Z], [RIGHT_X, CEIL_Y, BACK_Z], "x", T),
      worldBox([LEFT_X, WIN.y0, OUT_Z], [WIN.x0, WIN.y1, BACK_Z], "x", T),
      worldBox([WIN.x1, WIN.y0, OUT_Z], [RIGHT_X, WIN.y1, BACK_Z], "x", T),
      // Side walls.
      worldBox([LEFT_X - WALL_T, FLOOR_Y, OUT_Z], [LEFT_X, CEIL_Y, FRONT_Z], "z", T),
      worldBox([RIGHT_X, FLOOR_Y, OUT_Z], [RIGHT_X + WALL_T, CEIL_Y, FRONT_Z], "z", T),
    ]);
    const ceiling = worldBox([LEFT_X, CEIL_Y, OUT_Z], [RIGHT_X, CEIL_Y + 60, FRONT_Z], "x", [2400, 2400]);
    const floor = worldBox([LEFT_X, FLOOR_Y - 40, OUT_Z], [RIGHT_X, FLOOR_Y, FRONT_Z], "x", kit.FLOOR_TEX);

    // Baseboards and picture rail: painted trim with a softened top edge.
    const trimParts: THREE.BufferGeometry[] = [];
    const run = (
      len: number,
      h: number,
      t: number,
      pos: [number, number, number],
      rotY: number,
    ) => {
      const b = roundedBox(len, h, t, 3, "x", [800, 800]);
      b.rotateY(rotY);
      b.translate(...pos);
      trimParts.push(b);
    };
    const bbH = 140;
    run(RIGHT_X - LEFT_X, bbH, 20, [(LEFT_X + RIGHT_X) / 2, FLOOR_Y + bbH / 2, BACK_Z + 10], 0);
    run(FRONT_Z - BACK_Z, bbH, 20, [LEFT_X + 10, FLOOR_Y + bbH / 2, (FRONT_Z + BACK_Z) / 2], Math.PI / 2);
    run(FRONT_Z - BACK_Z, bbH, 20, [RIGHT_X - 10, FLOOR_Y + bbH / 2, (FRONT_Z + BACK_Z) / 2], Math.PI / 2);
    const railY = 1560;
    run(RIGHT_X - LEFT_X, 38, 22, [(LEFT_X + RIGHT_X) / 2, railY, BACK_Z + 11], 0);
    run(FRONT_Z - BACK_Z, 38, 22, [LEFT_X + 11, railY, (FRONT_Z + BACK_Z) / 2], Math.PI / 2);
    run(FRONT_Z - BACK_Z, 38, 22, [RIGHT_X - 11, railY, (FRONT_Z + BACK_Z) / 2], Math.PI / 2);

    // Window casing (architrave) on the room face, and a deep sill (stool)
    // that runs past the casing with an apron below it.
    const cw = 80;
    const wx = (WIN.x0 + WIN.x1) / 2;
    const ww = WIN.x1 - WIN.x0;
    run(ww + cw * 2, cw, 24, [wx, WIN.y1 + cw / 2, BACK_Z + 12], 0);
    const side = (x: number) => {
      const b = roundedBox(cw, WIN.y1 - WIN.y0, 24, 3, "y", [800, 800]);
      b.translate(x, (WIN.y0 + WIN.y1) / 2, BACK_Z + 12);
      trimParts.push(b);
    };
    side(WIN.x0 - cw / 2);
    side(WIN.x1 + cw / 2);
    const sill = roundedBox(ww + cw * 2 + 50, 32, WALL_T - 40 + 70, 5, "x", [800, 800]);
    sill.translate(wx, WIN.y0 - 16, BACK_Z - (WALL_T - 40) / 2 + 35);
    trimParts.push(sill);
    run(ww + cw * 2, 70, 18, [wx, WIN.y0 - 32 - 35, BACK_Z + 9], 0);
    const trim = mergeIndexed(trimParts);

    // Sash: outer frame, a central mullion and a transom, in the accent green.
    const sash: THREE.BufferGeometry[] = [];
    const bar = (w: number, h: number, x: number, y: number, d = 56) => {
      const b = roundedBox(w, h, d, 4, w > h ? "x" : "y", [600, 600]);
      b.translate(x, y, SASH_Z);
      sash.push(b);
    };
    const f = 58;
    const wy = (WIN.y0 + WIN.y1) / 2;
    const wh = WIN.y1 - WIN.y0;
    bar(ww, f, wx, WIN.y1 - f / 2);
    bar(ww, f, wx, WIN.y0 + f / 2);
    bar(f, wh, WIN.x0 + f / 2, wy);
    bar(f, wh, WIN.x1 - f / 2, wy);
    bar(40, wh - f * 2, wx, wy, 48);
    const transomY = WIN.y0 + wh * 0.68;
    bar(ww - f * 2, 40, wx, transomY, 48);
    const sashGeo = mergeIndexed(sash);

    const glass = new THREE.PlaneGeometry(ww - f, wh - f);
    glass.translate(wx, wy, SASH_Z - 6);

    return { walls, ceiling, floor, trim, sash: sashGeo, glass };
  });

  // The street beyond: planes at increasing depth so they slide against the
  // window frame as the camera orbits (real parallax, not a picture).
  const exterior = useGeoSet(() => ({
    sky: new THREE.PlaneGeometry(16000, 6000),
    roofs: new THREE.PlaneGeometry(9000, 1500),
    bokeh: new THREE.PlaneGeometry(5200, 2600),
  }));

  return (
    <group>
      <mesh geometry={g.walls} material={kit.plaster()} receiveShadow castShadow />
      <mesh geometry={g.ceiling} material={kit.plaster()} receiveShadow />
      <mesh geometry={g.floor} material={kit.floor()} receiveShadow />
      <mesh geometry={g.trim} material={kit.trim()} receiveShadow castShadow />
      <mesh geometry={g.sash} material={kit.windowPaint()} receiveShadow castShadow />
      <mesh geometry={g.glass} material={kit.rainGlass()} renderOrder={2} />

      <mesh geometry={exterior.sky} material={kit.skyMat()} position={[-600, 2200, -6000]} />
      <mesh geometry={exterior.roofs} material={kit.rooftopsMat()} position={[-400, -250, -3200]} renderOrder={1} />
      <mesh geometry={exterior.bokeh} material={kit.bokehMat()} position={[-300, -200, -2000]} renderOrder={1} />
      <FramedPrint />
    </group>
  );
}

/** The one framed thing on the wall, hung very slightly out of true. */
function FramedPrint() {
  const W = 400;
  const H = 500;
  const g = useGeo(() => {
    const parts: THREE.BufferGeometry[] = [];
    const m = 34;
    const d = 28;
    const bar = (w: number, h: number, x: number, y: number, along: Axis) => {
      const b = roundedBox(w, h, d, 4, along, kit.WALNUT_TEX, x + y);
      b.translate(x, y, d / 2);
      parts.push(b);
    };
    bar(W, m, 0, H / 2 - m / 2, "x");
    bar(W, m, 0, -H / 2 + m / 2, "x");
    bar(m, H - m * 2, -W / 2 + m / 2, 0, "y");
    bar(m, H - m * 2, W / 2 - m / 2, 0, "y");
    return mergeIndexed(parts);
  });
  const board = useGeo(() => new THREE.PlaneGeometry(W - 60, H - 60));
  return (
    <group position={[860, 790, BACK_Z + 2]} rotation={[0, 0, -0.021]}>
      <mesh geometry={g} material={kit.oak()} castShadow receiveShadow />
      <mesh geometry={board} material={kit.plotPrint()} position={[0, 0, 12]} receiveShadow />
      <mesh geometry={board} material={kit.picGlass()} position={[0, 0, 20]} />
    </group>
  );
}
