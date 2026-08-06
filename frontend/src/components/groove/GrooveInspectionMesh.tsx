/**
 * LOD 2 — the microscope: local high-resolution groove geometry around the
 * stylus, built from the user's REAL engraved groove (backend groove-window
 * endpoint; never noise or sine decoration).
 *
 * Two exports with different frames of reference:
 *
 *   <GrooveInspectionMesh/>  RECORD-LOCAL (mount inside the spinning record
 *                            group): three trench strips — the turn under
 *                            the stylus plus its radial neighbors, which are
 *                            the same song one revolution (~1.8 s) earlier
 *                            and later, fetched as separate windows: exactly
 *                            what sits 0.25 mm away on a real record — plus
 *                            optional centerline pitch guides.
 *
 *   <MicroStylus/>           WORLD SPACE (mount at scene level): the
 *                            true-scale tip resting in the V. The record
 *                            spins beneath it, as in reality.
 *
 * Each strip is a slab of radial width = one true pitch with a V-notch whose
 * centerline swings with the L+R (lateral) signal and whose depth/opening
 * breathes with the L−R (vertical) signal — the stereo view modes change the
 * geometry itself, not a color.
 *
 * Scale policy (grooveScale.ts): pitch, spacing, groove width and depth are
 * TRUE millimeters; only audio modulation is multiplied by the labeled
 * "audio zoom", clamped so a groove can never swing into its neighbor.
 *
 * Micro-stylus contact approximation (documented per spec): the tip is a
 * sphere of the true (DSP-scaled) radius resting statically in the 90° V —
 * center height = V bottom + R*sqrt(2) — following the groove's lateral
 * swing and depth. Dynamic wall-contact mechanics (pinch effect, corner
 * riding) are intentionally not simulated; the rest pose is stable and
 * reads correctly at every zoom.
 *
 * Rebuild triggers (never per frame): window refetch (seek / playback drift
 * past a quarter-window / new upload / DSP re-process via dataVersion),
 * view mode, audio zoom. Per-frame work: micro-stylus transform only.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { fetchGrooveWindow } from "../../api/client";
import type { GrooveGeometry, GrooveWindow } from "../../types/api";
import { OMEGA, radiusOfThetaMm, thetaOfSMm, type ChannelView } from "./grooveMath";
import { MIN_TIP_RADIUS_MM, TRUE_TIP_RADIUS_MM } from "./grooveScale";
import { clipTime, contact } from "./recordMotion";

const SPAN_MM = 80;
const MAX_POINTS = 1600;
const SURFACE_Y = -0.36; // trench slab top == record surface plane
const V_HALF_FRACTION = 0.12; // unmodulated V half-width/depth as pitch fraction (~30 um)

/** V depth at a sample, shared by the trench builder and the stylus rest pose. */
function grooveDepth(pitchMm: number, vertMm: number, boost: number, view: ChannelView): number {
  const hw0 = pitchMm * V_HALF_FRACTION;
  const vert = view === "lateral" ? 0 : vertMm * boost;
  return Math.min(Math.max(hw0 + vert * 0.5, hw0 * 0.25), pitchMm * 0.42);
}

/** One trench strip (slab + V-notch) from a groove window. */
function buildStrip(
  win: GrooveWindow,
  startRadiusMm: number,
  view: ChannelView,
  boost: number,
): THREE.BufferGeometry {
  const n = win.n;
  const pitch = win.pitchMm;
  const positions = new Float32Array(n * 5 * 3);

  for (let i = 0; i < n; i++) {
    const sMm = win.s0Mm + i * win.dsMm;
    const theta = thetaOfSMm(sMm, startRadiusMm, pitch);
    const r = radiusOfThetaMm(theta, startRadiusMm, pitch);
    const cos = Math.cos(theta);
    const sin = -Math.sin(theta); // record-local convention (grooveMath)

    const lat = view === "vertical" ? 0 : win.latMm[i] * boost;
    const rc = r + lat;
    const depth = grooveDepth(pitch, win.vertMm[i], boost, view);

    // 5-point cross-section: shoulder, V-edge, bottom, V-edge, shoulder.
    const pts: Array<[number, number]> = [
      [r + pitch * 0.49, 0],
      [rc + depth, 0],
      [rc, -depth],
      [rc - depth, 0],
      [r - pitch * 0.49, 0],
    ];
    for (let p = 0; p < 5; p++) {
      const o = (i * 5 + p) * 3;
      positions[o] = pts[p][0] * cos;
      positions[o + 1] = SURFACE_Y + pts[p][1];
      positions[o + 2] = pts[p][0] * sin;
    }
  }

  const indices = new Uint32Array((n - 1) * 4 * 6);
  let k = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let q = 0; q < 4; q++) {
      const a = i * 5 + q;
      const b = a + 5;
      indices[k++] = a; indices[k++] = a + 1; indices[k++] = b;
      indices[k++] = a + 1; indices[k++] = b + 1; indices[k++] = b;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

/** Centerline arc (pitch guide) for one window. */
function buildGuideLine(
  win: GrooveWindow,
  startRadiusMm: number,
  isCenter: boolean,
): THREE.Line {
  const steps = 128;
  const pts = new Float32Array(steps * 3);
  for (let i = 0; i < steps; i++) {
    const sMm = win.s0Mm + (i / (steps - 1)) * win.n * win.dsMm;
    const theta = thetaOfSMm(sMm, startRadiusMm, win.pitchMm);
    const r = radiusOfThetaMm(theta, startRadiusMm, win.pitchMm);
    pts[i * 3] = r * Math.cos(theta);
    pts[i * 3 + 1] = SURFACE_Y + 0.06;
    pts[i * 3 + 2] = -r * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
  const mat = new THREE.LineBasicMaterial({
    color: "#f2a33c",
    transparent: true,
    opacity: isCenter ? 0.85 : 0.35,
  });
  return new THREE.Line(geo, mat);
}

export interface InspectionProps {
  sessionId: string;
  geometry: GrooveGeometry;
  /** Changes identity on every re-process — the DSP-edit refetch trigger. */
  dataVersion: unknown;
  view: ChannelView;
  /** Effective audio zoom (caller clamps via grooveScale.safeAudioBoost). */
  audioBoost: number;
  cutaway: boolean;
  guides: boolean;
}

export default function GrooveInspectionMesh({
  sessionId,
  geometry,
  dataVersion,
  view,
  audioBoost,
  cutaway,
  guides,
}: InspectionProps) {
  // [previous turn, current turn, next turn] — null while unavailable
  // (clip edges have no neighbor: an honest absence, not an error).
  const [windows, setWindows] = useState<Array<GrooveWindow | null>>([null, null, null]);
  const fetchedT = useRef<number>(NaN);
  const inFlight = useRef(false);

  useEffect(() => {
    fetchedT.current = NaN;
    const tick = async () => {
      if (inFlight.current) return;
      const t = clipTime();
      if (!Number.isNaN(fetchedT.current)) {
        // Refetch only once the stylus drifts a quarter-window from the last
        // fetch center (window time coverage = span / groove speed).
        const speedMmS = OMEGA * Math.max(contact.radiusMm, 50);
        if (Math.abs(t - fetchedT.current) < SPAN_MM / speedMmS / 4) return;
      }
      inFlight.current = true;
      try {
        const turn = (2 * Math.PI) / OMEGA;
        const duration = geometry.timeS[geometry.timeS.length - 1];
        const [prev, cur, next] = await Promise.all([
          t - turn >= 0 ? fetchGrooveWindow(sessionId, t - turn, SPAN_MM, MAX_POINTS) : null,
          fetchGrooveWindow(sessionId, t, SPAN_MM, MAX_POINTS),
          t + turn <= duration ? fetchGrooveWindow(sessionId, t + turn, SPAN_MM, MAX_POINTS) : null,
        ]);
        fetchedT.current = t;
        setWindows([prev, cur, next]);
      } catch {
        // Session evicted or transient failure: keep showing the last mesh.
      } finally {
        inFlight.current = false;
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 200);
    return () => window.clearInterval(id);
  }, [sessionId, geometry, dataVersion]);

  const startR = geometry.meta.start_radius_mm;

  const strips = useMemo(
    () => windows.map((w) => (w ? buildStrip(w, startR, view, audioBoost) : null)),
    [windows, startR, view, audioBoost],
  );
  const guideLines = useMemo(
    () =>
      guides
        ? windows.map((w, i) => (w ? buildGuideLine(w, startR, i === 1) : null))
        : [],
    [guides, windows, startR],
  );
  useEffect(
    () => () => {
      strips.forEach((g) => g?.dispose());
      guideLines.forEach((l) => {
        l?.geometry.dispose();
        (l?.material as THREE.Material | undefined)?.dispose();
      });
    },
    [strips, guideLines],
  );

  // Cutaway: a world-space clipping plane fixed just ahead of the stylus
  // (the contact stays pinned near the +X axis, so the plane is constant).
  // The trench spins through it — like slicing the vinyl as it passes —
  // exposing the V walls and the tip. Only the trench material is clipped.
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#3c3c44",
        roughness: 0.42,
        metalness: 0.18,
        side: THREE.DoubleSide,
      }),
    [],
  );
  useEffect(() => {
    material.clippingPlanes = cutaway
      ? [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.35)]
      : [];
    material.needsUpdate = true;
  }, [material, cutaway]);
  useEffect(() => () => material.dispose(), [material]);

  return (
    <group>
      {strips.map((geo, i) => geo && <mesh key={i} geometry={geo} material={material} />)}
      {guideLines.map((l, i) => l && <primitive key={`g${i}`} object={l} />)}
    </group>
  );
}

/**
 * The true-scale stylus tip resting in the V. World space — mount at scene
 * level, NOT inside the record group. Rest-pose math mirrors buildStrip.
 */
export function MicroStylus({
  geometry,
  view,
  audioBoost,
  stylusSizeScale,
}: {
  geometry: GrooveGeometry;
  view: ChannelView;
  audioBoost: number;
  stylusSizeScale: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const tipR = Math.max(TRUE_TIP_RADIUS_MM * stylusSizeScale, MIN_TIP_RADIUS_MM);
  const pitchMm = geometry.meta.groove_pitch_um / 1000;

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const lat = view === "vertical" ? 0 : contact.latMm * audioBoost;
    const depth = grooveDepth(pitchMm, contact.depthMm, audioBoost, view);
    // Sphere resting in a 90° V: center sits R*sqrt(2) above the V bottom
    // (capped so oversized "worn" tips ride the groove opening instead of
    // impossibly sinking through the walls).
    const restY = SURFACE_Y - depth + Math.min(tipR * Math.SQRT2, depth + tipR * 0.4);
    const r = contact.radiusMm + lat;
    const ang = Math.atan2(-contact.z, contact.x);
    g.position.set(r * Math.cos(ang), restY, -r * Math.sin(ang));
  });

  return (
    <group ref={ref}>
      {/* Diamond tip, at the group origin (the solved contact point). */}
      <mesh>
        <sphereGeometry args={[tipR, 16, 16]} />
        <meshStandardMaterial color="#e8e2d4" roughness={0.15} metalness={0.4} />
      </mesh>
      {/* Cantilever stub rising toward the (hidden) macro cartridge. Its
          lower end lands inside the tip sphere so the two are joined, and it
          tapers THICK->thin upward->downward (radiusTop 0.09 at the cartridge
          end, 0.02 at the diamond): a real cantilever is far heavier than the
          chip glued to its end. The taper was previously inverted, which left
          the stub flaring out around a needle it never met. */}
      <mesh position={[0.3, 0.95, 0]} rotation={[0, 0, -0.3]}>
        <cylinderGeometry args={[0.09, 0.02, 2.0, 8]} />
        <meshStandardMaterial color="#c9cad0" metalness={0.85} roughness={0.25} />
      </mesh>
    </group>
  );
}
