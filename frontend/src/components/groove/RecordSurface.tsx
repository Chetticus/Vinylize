/**
 * The record's playing surface: a flat annulus with POLAR UVs carrying the
 * standard-material vinyl (technique + groove layout documented in
 * GrooveOverviewMaterial.ts).
 *
 * The UV rewrite is the whole trick: RingGeometry ships planar UVs, but we
 * remap them to u = angle / 2pi, v = radius fraction, so a single 16 x 4096
 * texture strip describes the disc purely by radius and wraps seamlessly
 * (the strip's wrapS is Repeat and its content is u-invariant).
 *
 * Rendered in RECORD-LOCAL coordinates inside the spinning record group, so
 * the rings and the loudness banding of the user's track physically rotate.
 * Clicking the surface seeks playback via the inverse spiral map.
 */

import { useEffect, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import type { GrooveGeometry } from "../../types/api";
import {
  SURFACE_R_IN,
  SURFACE_R_OUT,
  makeVinylSurfaceMaterial,
} from "./GrooveOverviewMaterial";
import { timeAtLocalPoint } from "./grooveMath";

interface Props {
  geometry: GrooveGeometry;
  onScrub: (t: number) => void;
  /** Off under the microscope: at millimetre range a room-sized shadow
   * map's texels would print as blocks across the grooves. */
  receiveShadow?: boolean;
}

function makePolarRing(): THREE.RingGeometry {
  // 720 angular segments keep the rim chord error at ~1.4 um — far below a
  // groove pitch, so the rings can never scallop.
  const geo = new THREE.RingGeometry(SURFACE_R_IN, SURFACE_R_OUT, 720, 1);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.hypot(x, y);
    uv.setXY(
      i,
      Math.atan2(y, x) / (2 * Math.PI) + 0.5,
      (r - SURFACE_R_IN) / (SURFACE_R_OUT - SURFACE_R_IN),
    );
  }
  uv.needsUpdate = true;
  return geo;
}

export default function RecordSurface({ geometry, onScrub, receiveShadow = true }: Props) {
  const ringGeo = useMemo(() => makePolarRing(), []);
  const surface = useMemo(() => makeVinylSurfaceMaterial(geometry), [geometry]);
  useEffect(
    () => () => {
      surface.dispose();
      ringGeo.dispose();
    },
    [surface, ringGeo],
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
    // A hair above the vinyl body (top at -0.4) so the surface wins the
    // depth test cleanly.
    <mesh
      position={[0, -0.36, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      geometry={ringGeo}
      material={surface.material}
      receiveShadow={receiveShadow}
      onClick={handleClick}
    />
  );
}
