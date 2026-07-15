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

import type { GrooveGeometry } from "../../types/api";
import CafeEnvironment from "./CafeEnvironment";
import GrooveInspectionMesh, { MicroStylus } from "./GrooveInspectionMesh";
import type { OverviewLightRig } from "./GrooveOverviewMaterial";
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
import { makeLabelTexture, makeSheenTexture } from "./labelTexture";
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

/** Spins its children as the platter: rotation.y = discAngle(clipTime()). */
function SpinningRecord({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.rotation.y = discAngle(clipTime());
  });
  return <group ref={ref}>{children}</group>;
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
  lightRig,
  onScrub,
  children,
}: {
  geometry: GrooveGeometry;
  filename: string;
  lightRig: OverviewLightRig;
  onScrub: (t: number) => void;
  children?: React.ReactNode;
}) {
  const labelTex = useMemo(() => makeLabelTexture(filename), [filename]);
  const sheenTex = useMemo(() => makeSheenTexture(), []);
  useEffect(() => () => labelTex.dispose(), [labelTex]);

  return (
    <SpinningRecord>
      {/* Vinyl body (sides + thickness); the top face is RecordSurface. */}
      <mesh castShadow receiveShadow position={[0, -2.4, 0]}>
        <cylinderGeometry args={[152, 152, 4, 128]} />
        <meshPhysicalMaterial
          color="#0b0b0d"
          roughness={0.42}
          metalness={0.05}
          clearcoat={0.7}
          clearcoatRoughness={0.35}
        />
      </mesh>
      <RecordSurface geometry={geometry} lightRig={lightRig} onScrub={onScrub} />
      {/* Faint rotating micro-scratch sheen so the spin reads everywhere. */}
      <mesh position={[0, -0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[150, 96]} />
        <meshBasicMaterial map={sheenTex} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      {/* Label + spindle. */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[50, 50, 1.2, 64]} />
        <meshStandardMaterial color="#a06a1f" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.82, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[49.5, 64]} />
        <meshStandardMaterial map={labelTex} roughness={0.75} />
      </mesh>
      <mesh castShadow position={[0, 2.5, 0]}>
        <cylinderGeometry args={[3.4, 3.4, 7, 24]} />
        <meshStandardMaterial color="#9a9aa2" metalness={0.9} roughness={0.2} />
      </mesh>
      {children}
    </SpinningRecord>
  );
}

function Deck() {
  return (
    <group>
      <mesh receiveShadow position={[35, -31.4, -10]}>
        <boxGeometry args={[560, 30, 420]} />
        <meshStandardMaterial color="#17171b" roughness={0.85} metalness={0.1} />
      </mesh>
      {[
        [-215, -190],
        [285, -190],
        [-215, 170],
        [285, 170],
      ].map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, -50.4, z]}>
          <cylinderGeometry args={[9, 10, 8, 20]} />
          <meshStandardMaterial color="#0e0e11" roughness={0.6} />
        </mesh>
      ))}
      <mesh castShadow receiveShadow position={[0, -10.4, 0]}>
        <cylinderGeometry args={[158, 158, 12, 96]} />
        <meshStandardMaterial color="#8f9096" metalness={0.85} roughness={0.28} />
      </mesh>
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
      <ambientLight intensity={0.35} />
      <directionalLight
        castShadow
        position={[250, 320, 160]}
        intensity={1.5}
        color="#ffe8c8"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-420}
        shadow-camera-right={420}
        shadow-camera-top={420}
        shadow-camera-bottom={-420}
        shadow-camera-far={1200}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-260, 180, -220]} intensity={0.55} color="#b8c8ff" />
      <pointLight position={[0, 60, 0]} intensity={0.35} distance={400} />
    </group>
  );
}

function CafeLights() {
  return (
    <group>
      <ambientLight intensity={0.22} color="#ffe6cc" />
      <directionalLight
        castShadow
        position={[-190, 420, 250]}
        intensity={1.35}
        color="#ffdcb0"
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-520}
        shadow-camera-right={520}
        shadow-camera-top={520}
        shadow-camera-bottom={-520}
        shadow-camera-far={1400}
        shadow-bias={-0.0004}
      />
      <pointLight position={[-180, 150, 90]} intensity={0.7} color="#ffc98a" distance={900} decay={1.6} />
      <directionalLight position={[-900, 260, -420]} intensity={0.4} color="#9db8e8" />
      <directionalLight position={[420, 240, -320]} intensity={0.35} color="#cdd8ea" />
    </group>
  );
}

/** Light directions/colors fed to the groove shader per environment. */
const LIGHT_RIGS: Record<EnvironmentKind, OverviewLightRig> = {
  cafe: {
    keyDir: new THREE.Vector3(-190, 420, 250).normalize(),
    keyColor: new THREE.Color("#ffdcb0").multiplyScalar(1.35),
    fillDir: new THREE.Vector3(-900, 260, -420).normalize(),
    fillColor: new THREE.Color("#9db8e8").multiplyScalar(1.3),
    ambient: 0.3,
  },
  studio: {
    keyDir: new THREE.Vector3(250, 320, 160).normalize(),
    keyColor: new THREE.Color("#ffe8c8").multiplyScalar(1.5),
    fillDir: new THREE.Vector3(-260, 180, -220).normalize(),
    fillColor: new THREE.Color("#b8c8ff").multiplyScalar(1.8),
    ambient: 0.35,
  },
};

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
      camera={{ position: OVERVIEW_POSE.position, fov: 40, near: 0.05, far: 6000 }}
      dpr={[1, 2]}
      gl={{ antialias: true, localClippingEnabled: true, logarithmicDepthBuffer: true }}
    >
      <color attach="background" args={[cafe ? "#131009" : "#0a0a0d"]} />
      {cafe && <fog attach="fog" args={["#15120e", 850, 2900]} />}

      {cafe ? <CafeLights /> : <StudioLights />}
      {cafe && <CafeEnvironment />}

      <Deck />
      <Record
        geometry={geometry}
        filename={filename}
        lightRig={LIGHT_RIGS[environment]}
        onScrub={onScrub}
      >
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
