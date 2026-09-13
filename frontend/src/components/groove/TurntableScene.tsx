/**
 * TurntableScene — the complete deck, now with a multiscale groove.
 *
 * Coordinate convention (see recordMotion.ts): record in the XZ plane, +Y
 * up, spindle at the world origin, disc rotates about Y, TRUE millimeters
 * everywhere. The RECORD GROUP (vinyl, groove surface, label, spindle,
 * microscope trench) spins as one unit at 33 1/3 RPM against the audio
 * clock; the tonearm and micro-stylus stay in world space.
 *
 * LOD wiring (strategy in grooveLod.ts):
 *   - RecordSurface carries the procedural groove shader (overview/close-up);
 *   - GrooveInspectionMesh + MicroStylus mount only while the camera is
 *     within MICRO_ENTER_MM of the stylus (hysteresis on exit);
 *   - mode buttons fly the camera; renderers switch purely by distance.
 *
 * Per-frame work: record rotation, tonearm yaw + cantilever offset,
 * micro-stylus transform, camera animation/follow. Everything else updates
 * only on data or control changes.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

import type { GrooveGeometry } from "../../types/api";
import DevCapture, { EagerResizeObserver } from "./DevCapture";
import GrooveInspectionMesh, { MicroStylus } from "./GrooveInspectionMesh";
import RecordSurface from "./RecordSurface";
import Tonearm from "./Tonearm";
import { type ChannelView } from "./grooveMath";
import {
  MICRO_ENTER_MM,
  MICRO_EXIT_MM,
  OVERVIEW_POSE,
  ROOM_OVERVIEW_POSE,
  poseFor,
  type LodMode,
} from "./grooveLod";
import { makeLabelTexture } from "./labelTexture";
import { clipTime, contact, discAngle } from "./recordMotion";
import ListeningRoom from "./room/ListeningRoom";
import { projectUV } from "./room/geom";
import * as kit from "./room/kit";
import { CAMERA_BOUNDS, CONSOLE } from "./room/layout";
import { detectQuality } from "./room/quality";

export type EnvironmentKind = "cafe" | "studio";

export interface FlyRequest {
  mode: LodMode;
  seq: number; // increment to trigger the flight
}

interface Props {
  geometry: GrooveGeometry;
  filename: string;
  sessionId: string;
  dataVersion: unknown;
  environment: EnvironmentKind;
  view: ChannelView;
  audioBoost: number;
  cutaway: boolean;
  guides: boolean;
  follow: boolean;
  stylusSizeScale: number;
  debug: boolean;
  fly: FlyRequest;
  resetSignal: number;
  onScrub: (t: number) => void;
  onMicroActive: (active: boolean) => void;
  /** Called once shaders are compiled and the first frame can be shown. */
  onReady?: () => void;
  /** Width (px) of UI overlaying the canvas's right edge; the camera's
   * frame is shifted so the subject centres in the unobstructed part. */
  insetRight?: number;
}

/**
 * Image-based lighting from three's built-in RoomEnvironment (a procedural
 * lit studio box, PMREM-filtered once at mount — no HDR downloads, no CSP
 * concerns). This is what makes the glossy black vinyl, clearcoat and
 * brushed aluminum read as SHAPE: their form comes from reflections, not
 * from brightening the materials.
 */
function EnvironmentReflections({ intensity }: { intensity: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envMap;
    return () => {
      scene.environment = null;
      envMap.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  useEffect(() => {
    scene.environmentIntensity = intensity;
  }, [scene, intensity]);
  return null;
}

/** Pressing eccentricity shown visually (mm). The DSP already models the
 * off-center spindle hole as wow; this is the same defect made visible: the
 * record's groove pattern orbits the spindle by a fraction of a millimeter,
 * so the rim and rings visibly breathe once per revolution — the strongest
 * "it is actually spinning" cue a real deck gives you. */
const ECCENTRICITY_MM = 0.45; // IEC allows up to ~0.9 mm; this is a mid case

/** Spins its children as the platter: rotation.y = discAngle(clipTime()).
 * An inner group carries the eccentric offset IN THE ROTATING FRAME (that is
 * what makes it wobble rather than sit still), fading to zero as the camera
 * closes in so the microscope trench stays exactly under the stylus. */
function SpinningRecord({ children }: { children: React.ReactNode }) {
  const rot = useRef<THREE.Group>(null);
  const off = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    if (rot.current) rot.current.rotation.y = discAngle(clipTime());
    if (off.current) {
      const d = camera.position.length();
      off.current.position.x = ECCENTRICITY_MM * THREE.MathUtils.smoothstep(d, 120, 320);
    }
  });
  return (
    <group ref={rot}>
      <group ref={off}>{children}</group>
    </group>
  );
}

/** Distance-gated microscope visibility with hysteresis (no flicker). */
function MicroGate({ onChange }: { onChange: (active: boolean) => void }) {
  const camera = useThree((s) => s.camera);
  const active = useRef(false);
  useFrame(() => {
    const d = Math.hypot(
      camera.position.x - contact.x,
      camera.position.y,
      camera.position.z - contact.z,
    );
    if (!active.current && d < MICRO_ENTER_MM) {
      active.current = true;
      onChange(true);
    } else if (active.current && d > MICRO_EXIT_MM) {
      active.current = false;
      onChange(false);
    }
  });
  return null;
}

function Record({
  geometry,
  filename,
  onScrub,
  microscope,
  children,
}: {
  geometry: GrooveGeometry;
  filename: string;
  onScrub: (t: number) => void;
  microscope: boolean;
  children?: React.ReactNode;
}) {
  const labelTex = useMemo(() => makeLabelTexture(filename), [filename]);
  useEffect(() => () => labelTex.dispose(), [labelTex]);

  return (
    <SpinningRecord>
      {/* Vinyl body (sides + thickness); the top face is RecordSurface.
          Polished black PVC: near-black base, hard clearcoat — its shape is
          drawn entirely by environment + light reflections. */}
      <mesh castShadow receiveShadow position={[0, -2.4, 0]}>
        <cylinderGeometry args={[152, 152, 4, 128]} />
        <meshPhysicalMaterial
          color="#0d0d10"
          roughness={0.34}
          metalness={0.05}
          clearcoat={1.0}
          clearcoatRoughness={0.14}
          envMapIntensity={1.25}
        />
      </mesh>
      <RecordSurface geometry={geometry} onScrub={onScrub} receiveShadow={!microscope} />
      {/* Label (wobbles with the record — it is printed on it; the spindle
          lives in Deck, centered, since the record wobbles AROUND it). */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[50, 50, 1.2, 64]} />
        <meshStandardMaterial color="#a06a1f" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.82, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[49.5, 64]} />
        <meshStandardMaterial map={labelTex} roughness={0.75} />
      </mesh>
      {children}
    </SpinningRecord>
  );
}

/** Rotation-only spin group (no wobble) — the platter turns dead-centered. */
function SpinningPlatter({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.rotation.y = discAngle(clipTime());
  });
  return <group ref={ref}>{children}</group>;
}

/** Plinth, feet, platter and controls. Dimensions are unchanged from the
 * physics layout (plinth top y = -16.4, feet on y = -54.4, platter top
 * y = -4.4); only construction and materials carry the detail: a walnut
 * body under a satin metal deck plate, machined aluminium platter with a
 * rubber mat, and a start button whose surround is worn glossy by use. */
function Deck() {
  const g = useMemo(() => {
    const body = new RoundedBoxGeometry(560, 26, 420, 3, 4);
    const plate = new RoundedBoxGeometry(552, 5.4, 412, 2, 1.6);
    // Brushing at true scale: one texture repeat per ~180 mm.
    projectUV(plate, "x", [180, 180]);
    return { body, plate };
  }, []);
  useEffect(
    () => () => {
      g.body.dispose();
      g.plate.dispose();
    },
    [g],
  );
  return (
    <group>
      {/* Walnut body with a satin, faintly brushed deck plate on top: three
          distinct materials (wood / painted metal / vinyl) stack upward. */}
      <mesh geometry={g.body} material={kit.walnut()} castShadow receiveShadow position={[35, -35.4, -10]} />
      <mesh geometry={g.plate} material={kit.deckPlate()} castShadow receiveShadow position={[35, -19.1, -10]} />
      {[
        [-215, -190],
        [285, -190],
        [-215, 170],
        [285, 170],
      ].map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, -50.4, z]}>
          <mesh castShadow>
            <cylinderGeometry args={[12, 14, 5, 24]} />
            <meshStandardMaterial color="#8c8a86" metalness={0.9} roughness={0.35} />
          </mesh>
          <mesh position={[0, -3, 0]}>
            <cylinderGeometry args={[13, 13, 2.2, 24]} />
            <meshStandardMaterial color="#141313" roughness={0.9} />
          </mesh>
        </group>
      ))}
      {/* Start/stop and speed buttons, front left of the plate. */}
      {[
        [-196, 168, 13, "#bdb8ae"],
        [-160, 172, 8, "#8e8a82"],
        [-136, 173, 8, "#8e8a82"],
      ].map(([x, z, r, c], i) => (
        <mesh key={i} position={[x as number, -14.9, z as number]} castShadow>
          <cylinderGeometry args={[r as number, (r as number) + 0.6, 3.2, 32]} />
          <meshStandardMaterial color={c as string} metalness={0.9} roughness={i === 0 ? 0.22 : 0.34} />
        </mesh>
      ))}
      <mesh position={[-196, -16.33, 168]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[13.5, 24, 40]} />
        {/* Handling wear: the plate around the button is rubbed smoother. */}
        <meshStandardMaterial color="#5a5852" metalness={0.8} roughness={0.2} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      {/* Dust-cover hinges at the back edge. */}
      {[-150, 220].map((x) => (
        <mesh key={x} position={[x, -24, -222]} castShadow>
          <boxGeometry args={[44, 18, 10]} />
          <meshStandardMaterial color="#1c1b1a" metalness={0.4} roughness={0.45} />
        </mesh>
      ))}
      {/* Platter assembly SPINS: machined aluminium rim (the circumferential
          brushing reads as rotation), a rubber mat under the record. The
          platter turns dead-centered; the record wobbles around it. */}
      <SpinningPlatter>
        <mesh castShadow receiveShadow position={[0, -11.4, 0]} material={kit.brushedAlu()}>
          <cylinderGeometry args={[158, 157, 10, 128]} />
        </mesh>
        <mesh position={[0, -5.4, 0]} receiveShadow>
          <cylinderGeometry args={[149, 149, 2, 96]} />
          <meshStandardMaterial color="#1a1918" roughness={0.92} />
        </mesh>
        {/* Polished chamfer ring on the rim's top edge. */}
        <mesh position={[0, -6.6, 0]}>
          <cylinderGeometry args={[157.2, 158.4, 1.2, 128]} />
          <meshStandardMaterial color="#d8d6d0" metalness={1} roughness={0.12} envMapIntensity={1.2} />
        </mesh>
        {/* Spindle: centered on the platter axis; the eccentric record
            wobbles around it, exactly like a mis-punched pressing (the
            visual twin of the DSP's wow model). */}
        <mesh castShadow position={[0, 2.5, 0]}>
          <cylinderGeometry args={[3.4, 3.4, 7, 24]} />
          <meshStandardMaterial color="#9a9aa2" metalness={0.9} roughness={0.2} />
        </mesh>
      </SpinningPlatter>
    </group>
  );
}

/** Orbit + preset flights + optional stylus-follow. */
function CameraRig({
  environment,
  resetSignal,
  fly,
  follow,
  insetRight,
}: {
  environment: EnvironmentKind;
  resetSignal: number;
  fly: FlyRequest;
  follow: boolean;
  insetRight: number;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const room = environment === "cafe";

  // Shift the frame (not the camera) so the subject centres in the part of
  // the canvas the inspection panel leaves visible. filmOffset skews the
  // projection, so orbiting, raycasts and scrubbing stay exact.
  useEffect(() => {
    camera.fov = room ? 38 : 34;
    const inset = Math.min(insetRight, size.width * 0.45);
    const aspect = size.width / Math.max(size.height, 1);
    camera.filmOffset =
      size.width > 0 ? (camera.getFilmWidth() * aspect * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * inset) / size.width : 0;
    camera.updateProjectionMatrix();
  }, [camera, room, insetRight, size.width, size.height]);

  // Switching environment re-frames to that environment's overview.
  const firstEnv = useRef(true);
  useEffect(() => {
    if (firstEnv.current) {
      firstEnv.current = false;
      return;
    }
    const c = controls.current;
    if (!c) return;
    const pose = poseFor("overview", contact, room, size.width / Math.max(size.height, 1));
    anim.current = {
      t: 0,
      fromPos: camera.position.clone(),
      fromTarget: c.target.clone(),
      toPos: new THREE.Vector3(...pose.position),
      toTarget: new THREE.Vector3(...pose.target),
    };
    c.target0.set(...pose.target);
    c.position0.set(...pose.position);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);
  const anim = useRef<{
    t: number;
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toPos: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null>(null);

  useEffect(() => {
    // Start from the overview fitted to this canvas's shape, and make that
    // the pose "Reset camera" returns to.
    const c = controls.current;
    if (!c) return;
    const pose = poseFor("overview", contact, room, size.width / Math.max(size.height, 1));
    camera.position.set(...pose.position);
    c.target.set(...pose.target);
    c.update();
    c.saveState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (resetSignal > 0) {
      anim.current = null;
      controls.current?.reset();
    }
  }, [resetSignal]);

  // A new fly request captures start/end poses; user interaction cancels it.
  useEffect(() => {
    if (fly.seq === 0 || !controls.current) return;
    const pose = poseFor(fly.mode, { x: contact.x, z: contact.z }, room, size.width / Math.max(size.height, 1));
    anim.current = {
      t: 0,
      fromPos: camera.position.clone(),
      fromTarget: controls.current.target.clone(),
      toPos: new THREE.Vector3(...pose.position),
      toTarget: new THREE.Vector3(...pose.target),
    };
    const cancel = () => {
      anim.current = null;
    };
    const c = controls.current;
    c.addEventListener("start", cancel);
    return () => c.removeEventListener("start", cancel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fly.seq, fly.mode, camera]);

  useFrame((_, delta) => {
    const c = controls.current;
    if (!c) return;
    if (anim.current) {
      const a = anim.current;
      a.t = Math.min(a.t + delta / 0.9, 1);
      const e = a.t * a.t * (3 - 2 * a.t); // smoothstep ease
      camera.position.lerpVectors(a.fromPos, a.toPos, e);
      c.target.lerpVectors(a.fromTarget, a.toTarget, e);
      if (a.t >= 1) anim.current = null;
    } else if (follow) {
      // Gentle re-aim at the (slowly drifting) contact point.
      c.target.lerp(new THREE.Vector3(contact.x, -0.1, contact.z), 0.06);
    }
    c.update();

    if (room) {
      // Keep the camera inside the room and out of the furniture: clamp to
      // the room box, and never inside the console's body.
      const p = camera.position;
      p.x = THREE.MathUtils.clamp(p.x, CAMERA_BOUNDS.min[0], CAMERA_BOUNDS.max[0]);
      p.y = THREE.MathUtils.clamp(p.y, CAMERA_BOUNDS.min[1], CAMERA_BOUNDS.max[1]);
      p.z = THREE.MathUtils.clamp(p.z, CAMERA_BOUNDS.min[2], CAMERA_BOUNDS.max[2]);
      const overConsole = p.x > CONSOLE.x0 - 30 && p.x < CONSOLE.x1 + 30 && p.z > CONSOLE.z0 && p.z < CONSOLE.z1 + 30;
      if (overConsole && p.y < CONSOLE.top + 12) p.y = CONSOLE.top + 12;
    }
  });

  // Stable across environment switches (the switch animates instead).
  const initial = useRef(room ? ROOM_OVERVIEW_POSE : OVERVIEW_POSE).current;
  return (
    <OrbitControls
      ref={controls}
      target={initial.target}
      minDistance={0.6}
      maxDistance={room ? 2300 : 900}
      minPolarAngle={room ? Math.PI * 0.18 : 0}
      maxPolarAngle={Math.PI * (room ? 0.49 : 0.47)}
      minAzimuthAngle={room ? -0.8 : -Infinity}
      maxAzimuthAngle={room ? 1.05 : Infinity}
      enableDamping
      makeDefault
    />
  );
}

/**
 * Compiles every material in the scene before the canvas is revealed.
 * Uses KHR_parallel_shader_compile where the browser offers it, so the
 * compile happens off the main thread and the loading screen keeps moving;
 * without it this degrades to an ordinary (blocking) compile.
 */
function WarmUp({ armed, onReady }: { armed: boolean; onReady?: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const fired = useRef(false);
  useEffect(() => {
    if (!armed || fired.current) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      fired.current = true;
      onReady?.();
    };
    const id = window.setTimeout(async () => {
      try {
        await gl.compileAsync(scene, camera);
      } catch {
        /* a failed pre-compile just means compiling on first draw */
      }
      // Let one real frame draw (shadow-map programs compile there) before
      // lifting the curtain; the timeout covers throttled background tabs.
      requestAnimationFrame(() => requestAnimationFrame(finish));
      window.setTimeout(finish, 500);
    }, 0);
    return () => {
      done = true;
      window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);
  return null;
}

/** Releases the room's shared textures and materials with the canvas. */
function KitLifetime() {
  useEffect(() => () => kit.disposeKit(), []);
  return null;
}

function StudioLights() {
  return (
    <group>
      {/* Hemisphere skylight: soft top-down fill with a warm floor bounce —
          shadows stay open without a flat ambient wash. */}
      <hemisphereLight args={["#cdd6e4", "#3a2e22", 0.55]} />
      <directionalLight
        castShadow
        position={[250, 320, 160]}
        intensity={1.7}
        color="#ffe8c8"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-420}
        shadow-camera-right={420}
        shadow-camera-top={420}
        shadow-camera-bottom={-420}
        shadow-camera-far={1200}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-260, 180, -220]} intensity={0.6} color="#b8c8ff" />
      {/* Rim from behind: lifts the record edge off the dark background. */}
      <directionalLight position={[-40, 190, -420]} intensity={0.7} color="#dfe8f5" />
    </group>
  );
}

export default function TurntableScene({
  geometry,
  filename,
  sessionId,
  dataVersion,
  environment,
  view,
  audioBoost,
  cutaway,
  guides,
  follow,
  stylusSizeScale,
  debug,
  fly,
  resetSignal,
  onScrub,
  onMicroActive,
  onReady,
  insetRight = 0,
}: Props) {
  const cafe = environment === "cafe";
  const quality = useMemo(() => {
    const q = detectQuality();
    kit.setKitQuality(q);
    return q;
  }, []);
  const [microActive, setMicroActive] = useState(false);
  const [roomBuilt, setRoomBuilt] = useState(false);
  const handleMicro = (active: boolean) => {
    setMicroActive(active);
    onMicroActive(active);
  };

  return (
    <Canvas
      shadows
      camera={{
        position: cafe ? ROOM_OVERVIEW_POSE.position : OVERVIEW_POSE.position,
        fov: cafe ? 38 : 34,
        near: 0.05,
        far: 14000,
      }}
      dpr={quality === "low" ? 1 : [1, quality === "high" ? 2 : 1.5]}
      gl={{ antialias: true, localClippingEnabled: true, logarithmicDepthBuffer: true }}
      resize={import.meta.env.DEV ? { polyfill: EagerResizeObserver } : undefined}
    >
      <color attach="background" args={[cafe ? "#120d09" : "#0c0c10"]} />
      <KitLifetime />
      {cafe ? (
        <ListeningRoom quality={quality} onBuilt={() => setRoomBuilt(true)} />
      ) : (
        <>
          <EnvironmentReflections intensity={0.4} />
          <StudioLights />
        </>
      )}

      <Deck />
      <Record geometry={geometry} filename={filename} onScrub={onScrub} microscope={microActive}>
        {microActive && (
          <GrooveInspectionMesh
            sessionId={sessionId}
            geometry={geometry}
            dataVersion={dataVersion}
            view={view}
            audioBoost={audioBoost}
            cutaway={cutaway}
            guides={guides}
          />
        )}
      </Record>
      {microActive && (
        <MicroStylus
          geometry={geometry}
          view={view}
          audioBoost={audioBoost}
          stylusSizeScale={stylusSizeScale}
        />
      )}
      <Tonearm geometry={geometry} view={view} microscope={microActive} debug={debug} />

      <MicroGate onChange={handleMicro} />
      <CameraRig
        environment={environment}
        resetSignal={resetSignal}
        fly={fly}
        follow={follow}
        insetRight={insetRight}
      />
      <WarmUp armed={!cafe || roomBuilt} onReady={onReady} />
      {import.meta.env.DEV && <DevCapture />}
    </Canvas>
  );
}
