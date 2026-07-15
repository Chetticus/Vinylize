/**
 * The café listening room — static set dressing around the turntable.
 *
 * Design intent: a quiet corner table in a specialty coffee shop at night.
 * Everything here is deliberately LOW-DETAIL: simple boxes, cylinders and
 * two canvas textures, pushed far enough back that the scene's warm fog
 * (set in TurntableScene) softens them into a defocused backdrop — the
 * turntable and stylus stay the only sharp things in frame. No per-frame
 * work happens in this file: every mesh is static, background meshes
 * neither cast nor receive shadows, and the only real light sources remain
 * in TurntableScene's CafeLights (pendants here are emissive props).
 *
 * Scale/coordinates: scene units are millimeters (the turntable is built in
 * true record dimensions); the tabletop sits directly under the deck's feet
 * at y = -54.4, the floor at y = -450 (~0.4 m table-to-floor at this scale),
 * walls ~1.5-1.7 m behind and beside the table.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { makeWindowTexture, makeWoodTexture } from "./labelTexture";

const TABLE_TOP_Y = -54.4;
const FLOOR_Y = -450;

/** Muted record-spine palette (no saturated primaries — café, not arcade). */
const SPINE_COLORS = ["#7d5a44", "#4f6058", "#8a7a5c", "#5c4a56", "#3e4c5e", "#96865f", "#6b4438"];

function rand(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 48271) % 2147483647) / 2147483647);
}

function Table() {
  const wood = useMemo(() => {
    const tex = makeWoodTexture();
    tex.repeat.set(2, 1);
    return tex;
  }, []);
  useEffect(() => () => wood.dispose(), [wood]);

  return (
    <group>
      {/* Walnut top — the one environment surface that stays sharp, since
          the deck sits on it and its shadows land here. */}
      <mesh receiveShadow position={[35, TABLE_TOP_Y - 16, -10]}>
        <boxGeometry args={[980, 32, 660]} />
        <meshStandardMaterial map={wood} roughness={0.55} metalness={0.05} />
      </mesh>
      {/* Apron + legs. */}
      <mesh position={[35, TABLE_TOP_Y - 46, -10]}>
        <boxGeometry args={[900, 28, 580]} />
        <meshStandardMaterial color="#3a291b" roughness={0.7} />
      </mesh>
      {[
        [-400, -300],
        [470, -300],
        [-400, 280],
        [470, 280],
      ].map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, (TABLE_TOP_Y - 32 + FLOOR_Y) / 2, z]}>
          <cylinderGeometry args={[16, 13, FLOOR_Y * -1 + TABLE_TOP_Y - 32, 12]} />
          <meshStandardMaterial color="#33241a" roughness={0.65} />
        </mesh>
      ))}
    </group>
  );
}

function Room() {
  const windowTex = useMemo(() => makeWindowTexture(), []);
  useEffect(() => () => windowTex.dispose(), [windowTex]);

  return (
    <group>
      {/* Floor */}
      <mesh receiveShadow position={[0, FLOOR_Y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7000, 7000]} />
        <meshStandardMaterial color="#191411" roughness={0.9} />
      </mesh>
      {/* Back wall — deep desaturated green with a wood wainscot band. */}
      <mesh position={[0, 350, -1550]}>
        <planeGeometry args={[6000, 2600]} />
        <meshStandardMaterial color="#22322b" roughness={0.95} />
      </mesh>
      <mesh position={[0, -220, -1544]}>
        <planeGeometry args={[6000, 460]} />
        <meshStandardMaterial color="#33241a" roughness={0.8} />
      </mesh>
      {/* Left wall — deep navy. */}
      <mesh position={[-1650, 350, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[6000, 2600]} />
        <meshStandardMaterial color="#1d2733" roughness={0.95} />
      </mesh>
      {/* Right wall (encloses the constrained orbit range). */}
      <mesh position={[1750, 350, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[6000, 2600]} />
        <meshStandardMaterial color="#22322b" roughness={0.95} />
      </mesh>

      {/* Rainy window on the left wall: night bokeh, brass frame. The glass
          is emissive-ish (basic material, fog disabled) so it reads as the
          cool light source the CafeLights window-fill pretends to be. */}
      <group position={[-1640, 320, -520]} rotation={[0, Math.PI / 2, 0]}>
        <mesh>
          <planeGeometry args={[560, 820]} />
          <meshBasicMaterial map={windowTex} fog={false} toneMapped={false} />
        </mesh>
        {/* Frame + mullions in brass. */}
        {([
          [0, 424, 600, 26, 0],
          [0, -424, 600, 26, 0],
          [-292, 0, 26, 874, 0],
          [292, 0, 26, 874, 0],
          [0, 0, 18, 874, 0],
          [0, 0, 600, 18, 0],
        ] as const).map(([x, y, bw, bh], k) => (
          <mesh key={k} position={[x, y, 6]}>
            <boxGeometry args={[bw, bh, 14]} />
            <meshStandardMaterial color="#8a6b35" metalness={0.75} roughness={0.35} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Pendant({
  position,
  scale = 1,
}: {
  position: [number, number, number];
  scale?: number;
}) {
  return (
    <group position={position} scale={scale}>
      {/* Cord from an implied ceiling. */}
      <mesh position={[0, 330, 0]}>
        <cylinderGeometry args={[2, 2, 660, 6]} />
        <meshStandardMaterial color="#141210" roughness={0.9} />
      </mesh>
      {/* Brass shade. */}
      <mesh position={[0, 26, 0]}>
        <coneGeometry args={[52, 46, 24, 1, true]} />
        <meshStandardMaterial
          color="#8a6b35"
          metalness={0.8}
          roughness={0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Warm bulb — emissive prop; the actual light lives in CafeLights. */}
      <mesh>
        <sphereGeometry args={[16, 16, 16]} />
        <meshBasicMaterial color="#ffd9a0" fog={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function RecordShelf() {
  const spines = useMemo(() => {
    const r = rand(4242);
    const out: Array<{ x: number; y: number; h: number; w: number; color: string; tilt: number }> = [];
    for (const shelfY of [40, -200]) {
      let x = -830;
      while (x < -290) {
        const w = 26 + r() * 12;
        out.push({
          x: x + w / 2,
          y: shelfY + 105,
          h: 195 + r() * 30,
          w,
          color: SPINE_COLORS[Math.floor(r() * SPINE_COLORS.length)],
          tilt: r() > 0.85 ? (r() - 0.5) * 0.14 : 0,
        });
        x += w + 2 + r() * 6;
      }
    }
    return out;
  }, []);

  return (
    <group position={[0, 0, -1480]}>
      {/* Boards + brass brackets. */}
      {[40, -200].map((y) => (
        <group key={y}>
          <mesh position={[-560, y, 0]}>
            <boxGeometry args={[600, 16, 110]} />
            <meshStandardMaterial color="#3a291b" roughness={0.7} />
          </mesh>
          {[-820, -560, -300].map((x) => (
            <mesh key={x} position={[x, y - 30, -30]}>
              <boxGeometry args={[14, 60, 14]} />
              <meshStandardMaterial color="#8a6b35" metalness={0.7} roughness={0.4} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Record spines — the blur does the detailing. */}
      {spines.map((s, i) => (
        <mesh key={i} position={[s.x, s.y, 8]} rotation={[0, 0, s.tilt]}>
          <boxGeometry args={[s.w, s.h, 84]} />
          <meshStandardMaterial color={s.color} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function CoffeeBar() {
  return (
    <group position={[820, 0, -1250]}>
      {/* Counter. */}
      <mesh position={[0, -265, 0]}>
        <boxGeometry args={[680, 370, 270]} />
        <meshStandardMaterial color="#2c1f15" roughness={0.8} />
      </mesh>
      <mesh position={[0, -74, 0]}>
        <boxGeometry args={[710, 16, 300]} />
        <meshStandardMaterial color="#3f2d1e" roughness={0.6} />
      </mesh>
      {/* Espresso machine silhouette. */}
      <group position={[-60, -20, 0]}>
        <mesh>
          <boxGeometry args={[210, 95, 130]} />
          <meshStandardMaterial color="#23252a" metalness={0.7} roughness={0.45} />
        </mesh>
        {[-60, 10].map((x) => (
          <mesh key={x} position={[x, -58, 55]}>
            <cylinderGeometry args={[11, 11, 26, 10]} />
            <meshStandardMaterial color="#8a6b35" metalness={0.8} roughness={0.35} />
          </mesh>
        ))}
        <mesh position={[92, -50, 40]} rotation={[0.5, 0, 0]}>
          <cylinderGeometry args={[3, 3, 55, 8]} />
          <meshStandardMaterial color="#9a9aa2" metalness={0.85} roughness={0.3} />
        </mesh>
      </group>
      {/* Back-bar: warm strip light + a few bottle silhouettes. */}
      <mesh position={[0, 130, -160]}>
        <boxGeometry args={[620, 5, 5]} />
        <meshBasicMaterial color="#ffb45a" fog={false} toneMapped={false} />
      </mesh>
      {[-220, -110, 10, 120, 230].map((x, i) => (
        <mesh key={x} position={[x, 80, -150]}>
          <cylinderGeometry args={[13, 15, 90 + (i % 3) * 18, 8]} />
          <meshStandardMaterial color="#1b1713" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function CoffeeCup() {
  return (
    <group position={[-360, 0, 150]}>
      <mesh receiveShadow position={[0, TABLE_TOP_Y + 3, 0]}>
        <cylinderGeometry args={[58, 50, 6, 24]} />
        <meshStandardMaterial color="#d8d2c4" roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, TABLE_TOP_Y + 6 + 42, 0]}>
        <cylinderGeometry args={[40, 32, 84, 24]} />
        <meshStandardMaterial color="#d8d2c4" roughness={0.5} />
      </mesh>
      {/* Coffee surface. */}
      <mesh position={[0, TABLE_TOP_Y + 6 + 82, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[35, 20]} />
        <meshStandardMaterial color="#2a1a10" roughness={0.35} />
      </mesh>
      {/* Handle. */}
      <mesh position={[46, TABLE_TOP_Y + 6 + 42, 0]} rotation={[0, 0, 0]}>
        <torusGeometry args={[20, 6, 10, 18]} />
        <meshStandardMaterial color="#d8d2c4" roughness={0.5} />
      </mesh>
    </group>
  );
}

export default function CafeEnvironment() {
  return (
    <group>
      <Table />
      <Room />
      <RecordShelf />
      <CoffeeBar />
      <CoffeeCup />
      {/* Near pendant motivates the key light; the far two are set dressing. */}
      <Pendant position={[-180, 160, 90]} />
      <Pendant position={[-720, 120, -950]} scale={0.8} />
      <Pendant position={[260, 130, -1080]} scale={0.7} />
    </group>
  );
}
