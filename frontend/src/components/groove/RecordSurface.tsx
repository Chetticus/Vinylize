/**
 * The record's top surface: a flat annulus carrying the procedural groove
 * shader (LOD 0-1 — see GrooveOverviewMaterial.ts for the strategy).
 *
 * Rendered in RECORD-LOCAL coordinates inside the spinning record group, so
 * the pattern (and the loudness banding of the user's track) physically
 * rotates. Clicking the surface seeks playback: the click point is taken to
 * record-local space (undoing the current rotation), the radius pins which
 * turn was hit, and the local angle refines the exact moment within that
 * turn — the same spiral inversion the backend uses, run in reverse.
 */

import { useEffect, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";

import type { GrooveGeometry } from "../../types/api";
import {
  buildLoudnessTexture,
  makeGrooveOverviewMaterial,
  type OverviewLightRig,
} from "./GrooveOverviewMaterial";
import { timeAtLocalPoint } from "./grooveMath";

interface Props {
  geometry: GrooveGeometry;
  lightRig: OverviewLightRig;
  onScrub: (t: number) => void;
}

export default function RecordSurface({ geometry, lightRig, onScrub }: Props) {
  const loudness = useMemo(() => buildLoudnessTexture(geometry), [geometry]);
  const material = useMemo(
    () => makeGrooveOverviewMaterial(geometry, loudness, lightRig),
    [geometry, loudness, lightRig],
  );
  useEffect(
    () => () => {
      loudness.dispose();
      material.dispose();
    },
    [loudness, material],
  );

  const durationS = geometry.timeS[geometry.timeS.length - 1];
  const pitchMm = geometry.meta.groove_pitch_um / 1000;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const local = e.object.worldToLocal(e.point.clone());
    const t = timeAtLocalPoint(local.x, local.z, geometry.meta.start_radius_mm, pitchMm, durationS);
    if (t !== null) onScrub(t);
  };

  return (
    // Annulus from label edge to record rim, a hair above the vinyl body
    // (top at -0.4) so the shader surface wins the depth test cleanly.
    <mesh
      position={[0, -0.36, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      material={material}
      onClick={handleClick}
    >
      <ringGeometry args={[50.5, 151.5, 256, 1]} />
    </mesh>
  );
}
