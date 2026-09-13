/**
 * The tonearm — a STRICT parent-child hierarchy:
 *
 *   TonearmPivot (fixed world position, never rotates)
 *     └── TonearmAssembly (rotates ONLY about the pivot's Y axis)
 *           ├── bearing housing
 *           ├── arm tube
 *           ├── counterweight (+ stub)
 *           └── headshell
 *                 ├── shell plate + finger lift
 *                 └── cartridge
 *                       └── cantilever  <- tiny LOCAL compliance offsets only
 *                             ├── cantilever rod
 *                             └── stylus tip (the cone; never world-positioned)
 *
 * Every child is placed in LOCAL coordinates. The assembly's local frame has
 * its origin on the pivot axis at arm-bearing height (world y = ARM.armPlaneY)
 * with the arm extending along local +X; child positions are chosen so the
 * stylus cone's apex sits at local (effectiveLength, -armPlaneY, 0), i.e.
 * exactly on the record surface (world y = 0) at exactly the arm's effective
 * length — the same numbers the IK solves against, which is what guarantees
 * the tip lands on the groove instead of orbiting near it.
 *
 * Per frame we update exactly two transforms (see tonearmKinematics.ts for
 * the math): the assembly yaw, and a millimeter-scale cantilever offset that
 * carries the groove's audio wiggle + a subtle depth compliance — physically
 * honest, since on a real cartridge it is the cantilever suspension, not the
 * arm, that follows the modulation.
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";

import type { GrooveGeometry } from "../../types/api";
import { type ChannelView } from "./grooveMath";
import { ARM_WIGGLE_EXAG } from "./grooveScale";
import { clipTime, contact } from "./recordMotion";
import { ARM, solveStylusPose } from "./tonearmKinematics";

const L = ARM.effectiveLength;
// Home offset of the cantilever group, chosen so the stylus cone's APEX lands
// at assembly-local (229, -14.36) = world (effectiveLength, -0.36): exactly
// the arm's reach and exactly the record surface plane. Derivation:
//   apex(cantilever-local) = (6, -2.4)
//   + cantilever home      = (2, hy)
//   + cartridge  @ headshell-local (5, -4)
//   + headshell  @ assembly-local  (216, -5)
//   => apex(assembly-local) = (229, -11.4 + hy); assembly sits at world
//      y = ARM.armPlaneY (14), so hy = -2.96 puts the apex at world y -0.36.
const CANTILEVER_HOME: [number, number, number] = [2, -2.96, 0];
// Compliance may push the tip at most this far below the surface (a hair of
// visual "seating"), never deep enough to stab through the disc.
const MAX_COMPLIANCE_MM = 0.25;

interface Props {
  geometry: GrooveGeometry;
  view: ChannelView;
  /** Microscope zoom active: the macro cantilever/tip hide so the true-scale
   * micro-stylus (GrooveInspectionMesh) can take over at the same spot. */
  microscope?: boolean;
  debug?: boolean;
}

export default function Tonearm({ geometry, view, microscope = false, debug = false }: Props) {
  const assembly = useRef<THREE.Group>(null);
  const cantilever = useRef<THREE.Group>(null);
  const tipMesh = useRef<THREE.Mesh>(null);
  const debugTip = useRef<THREE.Mesh>(null);
  const debugTarget = useRef<THREE.Mesh>(null);
  const worldPos = useRef(new THREE.Vector3()).current;

  // (The pure-math kinematics self-check lives in GrooveTab, outside the
  // Canvas, so it runs even when WebGL frames are suspended.)

  useFrame(() => {
    const pose = solveStylusPose(ARM, geometry, view, clipTime());
    if (assembly.current) assembly.current.rotation.y = pose.yaw;

    // Publish the contact point (single writer — see recordMotion.contact).
    const tipR = Math.hypot(pose.tipX, pose.tipZ) || 1;
    contact.x = pose.tipX;
    contact.z = pose.tipZ;
    contact.radiusMm = tipR;
    contact.latMm = pose.latMm;
    contact.depthMm = pose.vertMm;
    contact.sectionIndex = pose.sectionIndex;

    if (cantilever.current) {
      // Cosmetic, labeled x50 vibration (true wiggle is micrometers — the
      // honest version lives in the microscope). Decompose the radial offset
      // into the assembly's local axes: local +X_world = (cos yaw, -sin yaw),
      // local +Z_world = (sin yaw, cos yaw).
      const wiggle = pose.latMm * ARM_WIGGLE_EXAG;
      const ux = pose.tipX / tipR;
      const uz = pose.tipZ / tipR;
      const dxLocal = wiggle * (ux * Math.cos(pose.yaw) - uz * Math.sin(pose.yaw));
      const dzLocal = wiggle * (ux * Math.sin(pose.yaw) + uz * Math.cos(pose.yaw));
      // Vertical compliance from the stereo-difference (depth) component,
      // clamped so the tip never visibly pierces the record surface.
      const dyLocal = -Math.min(Math.abs(pose.vertMm) * ARM_WIGGLE_EXAG * 0.5, MAX_COMPLIANCE_MM);
      cantilever.current.position.set(
        CANTILEVER_HOME[0] + dxLocal,
        CANTILEVER_HOME[1] + dyLocal,
        CANTILEVER_HOME[2] + dzLocal,
      );
    }

    if (debug && debugTarget.current && debugTip.current && tipMesh.current) {
      // Calculated groove target (radius incl. displayed wiggle)…
      const targetR = tipR + pose.latMm * ARM_WIGGLE_EXAG;
      debugTarget.current.position.set(
        (pose.tipX / tipR) * targetR,
        0.6,
        (pose.tipZ / tipR) * targetR,
      );
      // …versus where the scene graph actually put the stylus cone.
      tipMesh.current.getWorldPosition(worldPos);
      debugTip.current.position.copy(worldPos);
    }
  });

  return (
    <group>
      {/* ================= TonearmPivot (fixed) ================= */}
      <group position={[ARM.pivotX, ARM.armPlaneY, ARM.pivotZ]}>
        {/* ============ TonearmAssembly (yaw only) ============ */}
        <group ref={assembly}>
          {/* Bearing housing + gimbal */}
          <RoundedBox args={[11, 9, 11]} radius={1.6} smoothness={3} castShadow position={[0, 1.5, 0]}>
            <meshStandardMaterial color="#2b2b33" metalness={0.7} roughness={0.35} />
          </RoundedBox>
          <mesh castShadow>
            <cylinderGeometry args={[5.5, 5.5, 12, 20]} />
            <meshStandardMaterial color="#3a3a42" metalness={0.75} roughness={0.3} />
          </mesh>

          {/* Arm tube: pivot (5,0) -> headshell rear (207,-5), tapered. */}
          <mesh
            castShadow
            position={[106, -2.5, 0]}
            rotation={[0, 0, Math.atan2(-5, 202) - Math.PI / 2]}
          >
            <cylinderGeometry args={[1.7, 2.5, 202, 12]} />
            {/* Brushed aluminum: high metalness, mid roughness — the env map
                gives it the long soft reflections of a machined tube. */}
            <meshStandardMaterial color="#b8bcc4" metalness={0.92} roughness={0.3} envMapIntensity={1.1} />
          </mesh>

          {/* Counterweight behind the pivot */}
          <mesh castShadow position={[-21, 1.5, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[8.5, 8.5, 15, 24]} />
            <meshStandardMaterial color="#2c2d33" metalness={0.85} roughness={0.38} envMapIntensity={0.8} />
          </mesh>
          <mesh position={[-10, 1.5, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[1.8, 1.8, 16, 10]} />
            <meshStandardMaterial color="#55555e" metalness={0.8} roughness={0.3} />
          </mesh>

          {/* ================= headshell ================= */}
          <group position={[216, -5, 0]}>
            {/* Headshell: a softened alloy plate, satin so it catches an edge
                highlight rather than reading as a black block. */}
            <RoundedBox args={[26, 3.5, 13]} radius={1.2} smoothness={3} castShadow position={[0, 2, 0]}>
              <meshStandardMaterial color="#8d8b86" metalness={0.85} roughness={0.34} />
            </RoundedBox>
            {/* Finger lift */}
            <mesh position={[-11, 4.5, 5.5]} rotation={[0.5, 0, 0]}>
              <cylinderGeometry args={[0.8, 0.8, 9, 8]} />
              <meshStandardMaterial color="#c9cad0" metalness={0.85} roughness={0.25} />
            </mesh>

            {/* ================= cartridge ================= */}
            <group position={[5, -4, 0]}>
              {/* Cartridge body: deep oxblood lacquer with a brushed nose plate. */}
              <RoundedBox args={[11, 7, 9]} radius={1} smoothness={3} castShadow>
                <meshPhysicalMaterial color="#3a1714" roughness={0.4} clearcoat={0.8} clearcoatRoughness={0.2} />
              </RoundedBox>
              <mesh position={[5.6, -0.4, 0]}>
                <boxGeometry args={[0.6, 5.2, 7.6]} />
                <meshStandardMaterial color="#c9c4ba" metalness={0.9} roughness={0.3} />
              </mesh>

              {/* ============ cantilever (compliance) ============ */}
              {/* Hidden under the microscope: at true groove scale this
                  display-scale cantilever/tip would dwarf the trench; the
                  micro-stylus in GrooveInspectionMesh replaces it. */}
              <group ref={cantilever} position={CANTILEVER_HOME} visible={!microscope}>
                {/* Cantilever rod: runs from inside the cartridge body (A) to
                    the stylus base (B), tapering thin toward the tip.
                      A = (-1, 1.2)  -> buried in the cartridge box
                      B = ( 6, -0.8) -> the cone's base CENTRE
                    Length |B-A| = sqrt(53) = 7.2801, midpoint (2.5, 0.2), and
                    the rotation aligns local +Y (the cylinder's axis, and the
                    radiusTop end) with the A->B direction, so the thin end
                    meets the stylus. The two parts share point B, so they read
                    as one piece — previously the rod stopped short at
                    (5.6, -2.2), beside the cone's point rather than in its
                    base, which is why the needle looked detached. */}
                <mesh position={[2.5, 0.2, 0]} rotation={[0, 0, -1.8491]}>
                  <cylinderGeometry args={[0.3, 0.42, 7.2801, 10]} />
                  <meshStandardMaterial color="#d2d4da" metalness={0.9} roughness={0.22} />
                </mesh>
                {/* Stylus: base at B, apex straight down at (6, -2.4) — the
                    exact point the IK solves for. Warm-lit so the eye finds
                    the playback point, but no bloom/neon. */}
                <mesh ref={tipMesh} position={[6, -1.6, 0]} rotation={[0, 0, Math.PI]}>
                  <coneGeometry args={[0.5, 1.6, 14]} />
                  <meshStandardMaterial
                    color="#f2a33c"
                    emissive="#f2a33c"
                    emissiveIntensity={0.55}
                  />
                </mesh>
              </group>
            </group>
          </group>
        </group>
      </group>

      {/* ============ static pivot base, rest & cue lever ============ */}
      {/* Base plate + bearing column (plinth top is at y = -16.4). */}
      <mesh castShadow position={[ARM.pivotX, -14.2, ARM.pivotZ]}>
        <cylinderGeometry args={[16, 17.5, 4.5, 32]} />
        <meshStandardMaterial color="#26262e" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh castShadow position={[ARM.pivotX, -1, ARM.pivotZ]}>
        <cylinderGeometry args={[6, 7, 23, 20]} />
        <meshStandardMaterial color="#3a3a42" metalness={0.75} roughness={0.3} />
      </mesh>
      {/* Cue lever */}
      <mesh position={[ARM.pivotX + 15, 2, ARM.pivotZ + 9]} rotation={[0, 0, -0.35]}>
        <boxGeometry args={[9, 1.6, 2]} />
        <meshStandardMaterial color="#8a8a92" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[ARM.pivotX + 19.5, 3.6, ARM.pivotZ + 9]}>
        <sphereGeometry args={[1.6, 10, 10]} />
        <meshStandardMaterial color="#c9cad0" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Arm rest fork (the arm parks here between records; during a clip it
          rides the lead-in groove instead). */}
      <group position={[ARM.pivotX - 24, 0, ARM.pivotZ + 58]}>
        <mesh castShadow position={[0, -6, 0]}>
          <cylinderGeometry args={[2, 2.4, 21, 12]} />
          <meshStandardMaterial color="#2b2b33" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 5, 0]} rotation={[0, 0.6, 0]}>
          <boxGeometry args={[3, 4.5, 8]} />
          <meshStandardMaterial color="#3a3a42" metalness={0.6} roughness={0.4} />
        </mesh>
      </group>

      {/* ================= debug overlays ================= */}
      {debug && (
        <group>
          {/* Pivot point */}
          <mesh position={[ARM.pivotX, ARM.armPlaneY, ARM.pivotZ]}>
            <sphereGeometry args={[3, 12, 12]} />
            <meshBasicMaterial color="#ff5577" wireframe />
          </mesh>
          {/* Arm reach circle (radius = effective length, at record level) */}
          <mesh position={[ARM.pivotX, 0.4, ARM.pivotZ]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[L - 0.6, L + 0.6, 128]} />
            <meshBasicMaterial color="#ff5577" transparent opacity={0.5} side={THREE.DoubleSide} />
          </mesh>
          {/* Calculated groove target (green) vs actual tip position (white) —
              these must visually coincide. */}
          <mesh ref={debugTarget}>
            <sphereGeometry args={[1.6, 10, 10]} />
            <meshBasicMaterial color="#4ade80" />
          </mesh>
          <mesh ref={debugTip}>
            <sphereGeometry args={[0.9, 10, 10]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </group>
      )}
    </group>
  );
}
