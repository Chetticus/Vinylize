/**
 * Motivated lighting for the listening room, at physically sensible
 * strengths for a scene measured in millimetres.
 *
 * Point and spot lights in three.js fall off as intensity / distance², with
 * distance in scene units. At mm scale a lamp 700 mm away is 700² = 490 000
 * units² away, so a "1 candela" light contributes essentially nothing — the
 * reason the previous café looked flat. Intensities here are therefore given
 * as candela × 10⁶ (i.e. converted to per-mm²).
 *
 *   sun      — low warm key through the window only (walls cast shadows),
 *              shadow map refreshed at ~12 Hz since only the arm moves
 *   window   — cool-warm rect-area fill from the glass: soft, broad, and the
 *              long reflection that shapes the vinyl and the plinth
 *   pendant  — a warm dome over the console; its spot shadow is tight on the
 *              deck so the tonearm's shadow lies across the record
 *   lamp     — the reading lamp's bulb, warming the chair and bookshelf
 *   ambient  — a very low hemisphere so shadows keep their colour
 *
 * Reflections come from a small procedural environment of this same room
 * (window, pendant, lamp glow, dark walls), PMREM-filtered once.
 */

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";

import { LAMP_BULB } from "./Corner";
import { lathe } from "./geom";
import * as kit from "./kit";
import { BACK_Z, CEIL_Y, CONSOLE, FLOOR_Y, LEFT_X, RIGHT_X, WIN } from "./layout";
import type { Quality } from "./quality";
import { useGeoSet } from "./useGeo";

const MM2 = 1e6;
/** Direction the sunlight travels (into the room, downward, slightly to +x). */
const SUN_DIR = new THREE.Vector3(0.3, -0.52, 0.8).normalize();
const SUN_TARGET = new THREE.Vector3(-150, -60, 300);
export const PENDANT = { x: -40, y: 1150, z: -110 };

let rectLibReady = false;

function RoomEnvironmentMap({ intensity }: { intensity: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    // Build a tiny stand-in of the room in metres, centred on the deck.
    const env = new THREE.Scene();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: "#241a13", side: THREE.BackSide }),
    );
    const sx = (RIGHT_X - LEFT_X) / 1000;
    const sy = (CEIL_Y - FLOOR_Y) / 1000;
    const sz = 2.4;
    box.scale.set(sx, sy, sz);
    box.position.set((RIGHT_X + LEFT_X) / 2000, (CEIL_Y + FLOOR_Y) / 2000, BACK_Z / 1000 + sz / 2);
    env.add(box);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(sx, sz),
      new THREE.MeshBasicMaterial({ color: "#3a2819" }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(box.position.x, FLOOR_Y / 1000 + 0.01, box.position.z);
    env.add(floor);
    const addGlow = (w: number, h: number, pos: [number, number, number], color: string, k: number, rotX = 0) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }),
      );
      m.position.set(...pos);
      m.rotation.x = rotX;
      env.add(m);
    };
    const wx = (WIN.x0 + WIN.x1) / 2000;
    const ww = (WIN.x1 - WIN.x0) / 1000;
    const wh = (WIN.y1 - WIN.y0) / 1000;
    // Window: warm low band, dusk-blue upper panes, split by the transom.
    addGlow(ww, wh * 0.4, [wx, WIN.y0 / 1000 + wh * 0.2, BACK_Z / 1000 + 0.02], "#f3c9a4", 0.75);
    addGlow(ww, wh * 0.6, [wx, WIN.y0 / 1000 + wh * 0.7, BACK_Z / 1000 + 0.02], "#9aa3bd", 0.7);
    addGlow(0.36, 0.36, [PENDANT.x / 1000, PENDANT.y / 1000 - 0.05, PENDANT.z / 1000], "#ffcf93", 3, Math.PI / 2);
    addGlow(0.3, 0.2, [LAMP_BULB[0] / 1000, LAMP_BULB[1] / 1000, LAMP_BULB[2] / 1000 + 0.12], "#ffc78a", 3);

    const pmrem = new THREE.PMREMGenerator(gl);
    const target = pmrem.fromScene(env, 0.03, 0.05, 20);
    scene.environment = target.texture;
    env.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    pmrem.dispose();
    return () => {
      if (scene.environment === target.texture) scene.environment = null;
      target.dispose();
    };
  }, [gl, scene]);
  useEffect(() => {
    scene.environmentIntensity = intensity;
  }, [scene, intensity]);
  return null;
}

function Pendant() {
  const g = useGeoSet(() => {
    // Enamelled dome with a rolled lip; brass gallery and a cloth cord.
    const dome = lathe(
      [
        [0, 150],
        [22, 150],
        [60, 140],
        [120, 96],
        [158, 30],
        [168, 2],
        [172, 0],
        [170, -4],
        [160, 0],
        [150, 26],
        [112, 90],
        [56, 132],
        [20, 142],
        [0, 142],
      ],
      64,
    );
    const gallery = new THREE.CylinderGeometry(24, 24, 44, 24).translate(0, 170, 0);
    const cord = new THREE.CylinderGeometry(3, 3, CEIL_Y - PENDANT.y - 190, 8).translate(0, 192 + (CEIL_Y - PENDANT.y - 190) / 2, 0);
    const rose = new THREE.CylinderGeometry(50, 56, 22, 32).translate(0, CEIL_Y - PENDANT.y - 11, 0);
    const bulb = new THREE.SphereGeometry(34, 20, 14).translate(0, 60, 0);
    return { dome, gallery, cord, rose, bulb };
  });
  const enamel = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#2f3d34", roughness: 0.32, metalness: 0.1, side: THREE.DoubleSide }),
    [],
  );
  const glow = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd9a6").multiplyScalar(2.5), toneMapped: true }),
    [],
  );
  useEffect(
    () => () => {
      enamel.dispose();
      glow.dispose();
    },
    [enamel, glow],
  );
  return (
    <group position={[PENDANT.x, PENDANT.y, PENDANT.z]}>
      {/* No castShadow: the spot sits inside this dome. */}
      <mesh geometry={g.dome} material={enamel} />
      <mesh geometry={g.gallery} material={kit.brass()} />
      <mesh geometry={g.cord} material={kit.cableMat()} />
      <mesh geometry={g.rose} material={kit.brass()} />
      <mesh geometry={g.bulb} material={glow} />
    </group>
  );
}

export default function RoomLights({ quality }: { quality: Quality }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const spot = useRef<THREE.SpotLight>(null);
  const rect = useRef<THREE.RectAreaLight>(null);
  const gl = useThree((s) => s.gl);

  if (!rectLibReady) {
    RectAreaLightUniformsLib.init();
    rectLibReady = true;
  }

  useLayoutEffect(() => {
    const s = sun.current;
    if (s) {
      s.position.copy(SUN_TARGET).addScaledVector(SUN_DIR, -4200);
      s.target.position.copy(SUN_TARGET);
      s.target.updateMatrixWorld();
      s.shadow.autoUpdate = false;
      s.shadow.needsUpdate = true;
    }
    const p = spot.current;
    if (p) {
      p.target.position.set(10, CONSOLE.top, -40);
      p.target.updateMatrixWorld();
      p.shadow.autoUpdate = false;
      p.shadow.needsUpdate = true;
    }
    rect.current?.lookAt((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2 - 300, 1000);
  }, []);

  // Only the tonearm (slowly) and the spinning platter move, so shadows are
  // refreshed at ~12 Hz rather than every frame.
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 1 / 12) return;
    acc.current = 0;
    if (sun.current) sun.current.shadow.needsUpdate = true;
    if (spot.current) spot.current.shadow.needsUpdate = true;
  });

  // Filmic response and exposure for the room (Studio restores its own).
  useEffect(() => {
    const prev = [gl.toneMapping, gl.toneMappingExposure] as const;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    return () => {
      gl.toneMapping = prev[0];
      gl.toneMappingExposure = prev[1];
    };
  }, [gl]);

  const hi = quality === "high";
  const wx = (WIN.x0 + WIN.x1) / 2;
  const wy = (WIN.y0 + WIN.y1) / 2;

  return (
    <group>
      <RoomEnvironmentMap intensity={0.28} />
      <hemisphereLight args={["#7d8098", "#3b2618", 0.3]} />
      <directionalLight
        ref={sun}
        castShadow
        intensity={2.9}
        color="#ffb574"
        shadow-mapSize={hi ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-2300}
        shadow-camera-right={2300}
        shadow-camera-top={2300}
        shadow-camera-bottom={-2300}
        shadow-camera-near={100}
        shadow-camera-far={9000}
        shadow-bias={-0.0005}
        shadow-normalBias={3}
        shadow-radius={4}
      />
      <rectAreaLight
        ref={rect}
        args={["#d9c6b6", 0.7, WIN.x1 - WIN.x0 - 60, WIN.y1 - WIN.y0 - 60]}
        position={[wx, wy, BACK_Z - 60]}
      />
      <spotLight
        ref={spot}
        position={[PENDANT.x, PENDANT.y + 40, PENDANT.z]}
        color="#ffc98f"
        intensity={1.1 * MM2}
        distance={0}
        decay={2}
        angle={0.62}
        penumbra={0.85}
        castShadow={quality !== "low"}
        shadow-mapSize={hi ? [1024, 1024] : [512, 512]}
        shadow-camera-near={200}
        shadow-camera-far={3000}
        shadow-bias={-0.00025}
        shadow-normalBias={0.6}
        shadow-radius={3}
      />
      <pointLight position={LAMP_BULB} color="#ffb163" intensity={0.55 * MM2} distance={0} decay={2} />
      <Pendant />
    </group>
  );
}
