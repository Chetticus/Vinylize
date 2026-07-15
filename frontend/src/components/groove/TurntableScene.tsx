/**
 * TurntableScene — the complete deck.
 *
 * Coordinate convention (established in recordMotion.ts): record in the XZ
 * plane, +Y up, spindle at the world origin, disc rotates about Y. The
 * RECORD GROUP (vinyl, sheen, label, spindle, groove mesh) spins as one unit
 * at a true 33 1/3 RPM against the audio clock; the tonearm sits at a fixed
 * pivot OUTSIDE the record and never rotates with it. Pause freezes the
 * whole deck exactly where it stopped; seeking snaps disc phase and arm
 * together because both derive from the same clipTime().
 *
 * Per-frame work is transforms ONLY: one group rotation (record), one yaw
 * (tonearm assembly), one millimeter cantilever offset. All geometry is
 * memoized at mount; the groove mesh keeps its adaptive decimation.
 *
 * Lighting: warm key with soft shadows (PCFSoft via <Canvas shadows>), cool
 * rim, low ambient. No bloom, no fog, no floating UI inside the scene.
 */

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

import type { GrooveGeometry } from "../../types/api";
import CafeEnvironment from "./CafeEnvironment";
import GrooveMesh from "./GrooveMesh";
import Tonearm from "./Tonearm";
import { type SectionParams } from "./grooveMath";
import { makeLabelTexture, makeSheenTexture } from "./labelTexture";
import { clipTime, discAngle } from "./recordMotion";

// Close three-quarter framing, aimed slightly down: stylus tip -> groove ->
// label first, café glow behind.
const CAMERA_HOME: [number, number, number] = [255, 180, 310];
const CAMERA_TARGET: [number, number, number] = [40, -25, -25];

export type EnvironmentKind = "cafe" | "studio";

interface Props {
  geometry: GrooveGeometry;
  params: SectionParams;
  filename: string;
  environment: EnvironmentKind;
  debug: boolean;
  /** Increment to re-frame the camera on the whole turntable. */
  resetSignal: number;
  onScrub: (t: number) => void;
}

/** Spins its children as the platter: rotation.y = discAngle(clipTime()). */
function SpinningRecord({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.rotation.y = discAngle(clipTime());
  });
  return <group ref={ref}>{children}</group>;
}

function Record({
  geometry,
  params,
  filename,
  onScrub,
}: Omit<Props, "debug" | "resetSignal" | "environment">) {
  const labelTex = useMemo(() => makeLabelTexture(filename), [filename]);
  const sheenTex = useMemo(() => makeSheenTexture(), []);
  useEffect(() => () => {
    labelTex.dispose();
  }, [labelTex]);

  return (
    <SpinningRecord>
      {/* The vinyl disc: groove edges sit at y=0, disc surface just below,
          thick enough that the exaggerated V-troughs stay inside it. */}
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
      {/* Faint rotating sheen (procedural micro-scratches) so the spin is
          visible even where the surface is otherwise featureless. */}
      <mesh position={[0, -0.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[150, 96]} />
        <meshBasicMaterial map={sheenTex} transparent opacity={0.5} depthWrite={false} />
      </mesh>
      {/* Label (canvas texture carries the uploaded filename) + spindle. */}
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
      {/* Faint ring marking the clip's lead-in radius. */}
      <mesh position={[0, -0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry
          args={[geometry.meta.start_radius_mm - 0.5, geometry.meta.start_radius_mm + 0.5, 128]}
        />
        <meshBasicMaterial color="#f2a33c" transparent opacity={0.2} />
      </mesh>
      {/* The groove itself — same data the audio pipeline produced. */}
      <GrooveMesh geometry={geometry} params={params} onScrub={onScrub} />
    </SpinningRecord>
  );
}

function Deck() {
  return (
    <group>
      {/* Plinth (matte black) + feet. */}
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
      {/* Platter with a metallic rim showing outside the record. */}
      <mesh castShadow receiveShadow position={[0, -10.4, 0]}>
        <cylinderGeometry args={[158, 158, 12, 96]} />
        <meshStandardMaterial color="#8f9096" metalness={0.85} roughness={0.28} />
      </mesh>
    </group>
  );
}

function CameraRig({
  resetSignal,
  environment,
}: {
  resetSignal: number;
  environment: EnvironmentKind;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  useEffect(() => {
    controls.current?.saveState();
  }, []);
  useEffect(() => {
    if (resetSignal > 0) controls.current?.reset();
  }, [resetSignal]);
  const cafe = environment === "cafe";
  return (
    <OrbitControls
      ref={controls}
      target={CAMERA_TARGET}
      minDistance={40}
      // In the café, orbiting is fenced to the built corner of the room:
      // distance keeps the camera inside the walls, polar keeps it above the
      // tabletop, azimuth keeps the (unbuilt) fourth wall behind the camera.
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
      {/* Key: the pendant over the table (above/front-left), warm, soft
          shadows onto the tabletop. */}
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
      {/* Practical glow under the near pendant (specular life on the vinyl). */}
      <pointLight position={[-180, 150, 90]} intensity={0.7} color="#ffc98a" distance={900} decay={1.6} />
      {/* Cool fill from the rainy window (left/back) — contrast, not color cast. */}
      <directionalLight position={[-900, 260, -420]} intensity={0.4} color="#9db8e8" />
      {/* Neutral-cool rim from behind-right so the tonearm's edge never
          melts into the background. */}
      <directionalLight position={[420, 240, -320]} intensity={0.35} color="#cdd8ea" />
    </group>
  );
}

export default function TurntableScene({
  geometry,
  params,
  filename,
  environment,
  debug,
  resetSignal,
  onScrub,
}: Props) {
  const cafe = environment === "cafe";
  return (
    <Canvas
      shadows
      camera={{ position: CAMERA_HOME, fov: 40, near: 0.5, far: 6000 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
    >
      {/* The café's "depth of field" is atmospheric: warm fog melts the
          low-poly background into a soft blur while the close-up turntable
          stays sharp — no postprocessing pass, no extra per-frame cost. */}
      <color attach="background" args={[cafe ? "#131009" : "#0a0a0d"]} />
      {cafe && <fog attach="fog" args={["#15120e", 850, 2900]} />}

      {cafe ? <CafeLights /> : <StudioLights />}
      {cafe && <CafeEnvironment />}

      <Deck />
      <Record geometry={geometry} params={params} filename={filename} onScrub={onScrub} />
      <Tonearm geometry={geometry} params={params} debug={debug} />

      <CameraRig resetSignal={resetSignal} environment={environment} />
    </Canvas>
  );
}
