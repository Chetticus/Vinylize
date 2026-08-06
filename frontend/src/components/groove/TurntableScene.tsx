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

import type { GrooveGeometry } from "../../types/api";
import CafeEnvironment from "./CafeEnvironment";
import GrooveInspectionMesh, { MicroStylus } from "./GrooveInspectionMesh";
import RecordSurface from "./RecordSurface";
import Tonearm from "./Tonearm";
import { type ChannelView } from "./grooveMath";
import {
  MICRO_ENTER_MM,
  MICRO_EXIT_MM,
  OVERVIEW_POSE,
  poseFor,
  type LodMode,
} from "./grooveLod";
import { makeLabelTexture } from "./labelTexture";
import { clipTime, contact, discAngle } from "./recordMotion";

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
  children,
}: {
  geometry: GrooveGeometry;
  filename: string;
  onScrub: (t: number) => void;
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
      <RecordSurface geometry={geometry} onScrub={onScrub} />
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

function Deck() {
  return (
    <group>
      {/* Plinth: satin charcoal (not pure black) so the deck separates from
          both the walnut table below and the vinyl above. */}
      <mesh receiveShadow position={[35, -31.4, -10]}>
        <boxGeometry args={[560, 30, 420]} />
        <meshStandardMaterial color="#232329" roughness={0.55} metalness={0.35} envMapIntensity={0.6} />
      </mesh>
      {/* Brushed top edge strip for a machined feel. */}
      <mesh position={[35, -16.2, -10]}>
        <boxGeometry args={[562, 1.2, 422]} />
        <meshStandardMaterial color="#3a3b42" roughness={0.3} metalness={0.85} envMapIntensity={0.8} />
      </mesh>
      {[
        [-215, -190],
        [285, -190],
        [-215, 170],
        [285, 170],
      ].map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, -50.4, z]}>
          <cylinderGeometry args={[9, 10, 8, 20]} />
          <meshStandardMaterial color="#101013" roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
      {/* Platter assembly SPINS: dark charcoal metal — deliberately NOT the
          record's black, so the disc reads as an object sitting on it. The
          platter turns dead-centered; the record wobbles around it. */}
      <SpinningPlatter>
        <mesh castShadow receiveShadow position={[0, -10.4, 0]}>
          <cylinderGeometry args={[158, 158, 12, 96]} />
          <meshStandardMaterial color="#33343a" metalness={0.8} roughness={0.32} envMapIntensity={0.9} />
        </mesh>
        {/* Polished rim ring. */}
        <mesh position={[0, -4.6, 0]}>
          <cylinderGeometry args={[158.2, 158.2, 1.4, 96]} />
          <meshStandardMaterial color="#8b8d94" metalness={0.95} roughness={0.18} envMapIntensity={1.1} />
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
}: {
  environment: EnvironmentKind;
  resetSignal: number;
  fly: FlyRequest;
  follow: boolean;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const anim = useRef<{
    t: number;
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toPos: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null>(null);

  useEffect(() => {
    controls.current?.saveState();
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
    const pose = poseFor(fly.mode, { x: contact.x, z: contact.z });
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
  });

  const cafe = environment === "cafe";
  return (
    <OrbitControls
      ref={controls}
      target={OVERVIEW_POSE.target}
      minDistance={0.6}
      maxDistance={cafe ? 750 : 900}
      maxPolarAngle={Math.PI * 0.47}
      minAzimuthAngle={cafe ? -0.9 : -Infinity}
      maxAzimuthAngle={cafe ? 1.75 : Infinity}
      enableDamping
    />
  );
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

function CafeLights() {
  return (
    <group>
      {/* Late-afternoon sun through the window (left wall): the warm key. */}
      <directionalLight
        castShadow
        position={[-620, 460, 60]}
        intensity={2.1}
        color="#ffd9a8"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-560}
        shadow-camera-right={560}
        shadow-camera-top={560}
        shadow-camera-bottom={-560}
        shadow-camera-far={2200}
        shadow-bias={-0.0004}
      />
      {/* Skylight fill: cool sky from above, warm wood bounce from below —
          shadows fill naturally instead of dropping to black. */}
      <hemisphereLight args={["#b9c8dd", "#4a3826", 0.6]} />
      {/* Desk-lamp practical over the tonearm area (geometry in
          CafeEnvironment) — keeps arm, headshell and stylus clearly lit. */}
      <pointLight position={[330, 120, -60]} intensity={1.1} color="#ffc98a" distance={620} decay={1.7} />
      {/* Near-pendant glow keeps moving specular life on the spinning vinyl. */}
      <pointLight position={[-180, 150, 90]} intensity={0.6} color="#ffce96" distance={800} decay={1.7} />
      {/* Cool rim from behind: separates the record from the room. */}
      <directionalLight position={[60, 200, -460]} intensity={0.75} color="#d8e2f2" />
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
}: Props) {
  const cafe = environment === "cafe";
  const [microActive, setMicroActive] = useState(false);
  const handleMicro = (active: boolean) => {
    setMicroActive(active);
    onMicroActive(active);
  };

  return (
    <Canvas
      shadows
      camera={{ position: OVERVIEW_POSE.position, fov: 34, near: 0.05, far: 6000 }}
      dpr={[1, 2]}
      gl={{ antialias: true, localClippingEnabled: true, logarithmicDepthBuffer: true }}
    >
      {/* Warm dusk backdrop; fog carries the depth-of-field feel (distant
          set dressing melts into it) without a postprocessing pass. */}
      <color attach="background" args={[cafe ? "#1a140d" : "#0c0c10"]} />
      {cafe && <fog attach="fog" args={["#1c150e", 1000, 3200]} />}

      <EnvironmentReflections intensity={cafe ? 0.55 : 0.4} />
      {cafe ? <CafeLights /> : <StudioLights />}
      {cafe && <CafeEnvironment />}

      <Deck />
      <Record geometry={geometry} filename={filename} onScrub={onScrub}>
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
      <CameraRig environment={environment} resetSignal={resetSignal} fly={fly} follow={follow} />
    </Canvas>
  );
}
