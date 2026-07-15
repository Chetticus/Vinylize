/**
 * The groove itself: an indexed triangle mesh of V-shaped cross-sections
 * (two 45-degree walls meeting at the trough bottom — the actual Westrex
 * groove profile). Lateral audio modulation swings the V sideways; vertical
 * (stereo-difference) modulation breathes its depth. Built directly as a
 * BufferGeometry: TubeGeometry renders a single silhouette and cannot show
 * the two walls' independent motion, which is the whole point.
 *
 * 3 vertices per section (outer edge, bottom, inner edge), 4 triangles per
 * segment, so faceIndex >> 2 recovers the section index — that is how
 * clicking the groove seeks playback to the moment engraved there.
 */

import { useMemo } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";

import type { GrooveGeometry } from "../../types/api";
import { sectionPoint, type SectionParams } from "./grooveMath";

interface Props {
  geometry: GrooveGeometry;
  params: SectionParams;
  onScrub: (timeS: number) => void;
}

export default function GrooveMesh({ geometry, params, onScrub }: Props) {
  const bufferGeometry = useMemo(() => {
    const n = geometry.meta.n_points;
    const positions = new Float32Array(n * 3 * 3);

    for (let i = 0; i < n; i++) {
      const s = sectionPoint(i, params);
      // 45-degree walls: the opening half-width equals the depth.
      const hw = s.depth;
      const o = i * 9;
      // Outer edge (disc surface level, y = 0).
      positions[o + 0] = (s.rc + hw) * s.cos;
      positions[o + 1] = 0;
      positions[o + 2] = (s.rc + hw) * s.sin;
      // Trough bottom.
      positions[o + 3] = s.x;
      positions[o + 4] = -s.depth;
      positions[o + 5] = s.z;
      // Inner edge.
      positions[o + 6] = (s.rc - hw) * s.cos;
      positions[o + 7] = 0;
      positions[o + 8] = (s.rc - hw) * s.sin;
    }

    const indices = new Uint32Array((n - 1) * 4 * 3);
    let k = 0;
    for (let i = 0; i < n - 1; i++) {
      const [oA, bA, iA] = [i * 3, i * 3 + 1, i * 3 + 2];
      const [oB, bB, iB] = [oA + 3, bA + 3, iA + 3];
      // Outer wall quad, then inner wall quad (consistent winding).
      indices[k++] = oA; indices[k++] = bA; indices[k++] = oB;
      indices[k++] = bA; indices[k++] = bB; indices[k++] = oB;
      indices[k++] = bA; indices[k++] = iA; indices[k++] = bB;
      indices[k++] = iA; indices[k++] = iB; indices[k++] = bB;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    return geo;
  }, [geometry, params]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.faceIndex === undefined || e.faceIndex === null) return;
    const section = Math.min(e.faceIndex >> 2, geometry.meta.n_points - 1);
    onScrub(geometry.timeS[section]);
  };

  return (
    // receiveShadow: the tonearm's soft shadow falls across the groove band;
    // castShadow deliberately off — 120k triangles into the shadow map buys
    // nothing visible and costs a full extra depth pass.
    <mesh geometry={bufferGeometry} onClick={handleClick} receiveShadow>
      {/* Vinyl-black with a clearcoat: groove modulation reads through the
          specular highlights, the way a real record reveals loud passages
          under a lamp. */}
      <meshPhysicalMaterial
        color="#8a8a92"
        roughness={0.32}
        metalness={0.15}
        clearcoat={0.55}
        clearcoatRoughness={0.3}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
