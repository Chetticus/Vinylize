/**
 * The vinyl playing surface: a STANDARD MeshPhysicalMaterial (no custom GLSL,
 * no onBeforeCompile) whose groove relief lives in a generated NORMAL +
 * roughness texture strip.
 *
 * Why textures over the previous patched shader: the shader's analytic
 * anti-aliasing re-evaluated per frame, so ring visibility subtly shifted as
 * the camera moved — the "unnatural lighting" this replaces. A texture is
 * filtered by ordinary trilinear mipmapping instead, which is temporally
 * rock-stable: minification is resolved once in the mip chain, not per frame.
 * The material itself is bone-stock three.js, so it picks up the environment
 * map, clearcoat and every scene light with zero custom code to maintain.
 *
 * Why a NORMAL map rather than a bump map: three's bumpMap shader measures
 * the height difference per SCREEN pixel (perturbNormalArb normalizes the
 * position derivatives away), so bump strength varies with camera distance
 * and viewport resolution — measured here as an 11x swing between close-up
 * and mid-distance, i.e. exactly the unstable-lighting artifact this rewrite
 * is meant to kill. A normal map encodes the surface tilt directly, so the
 * groove walls have the same slope from every distance, and mip averaging
 * fades them smoothly into the roughness-carried sheen. The same texture
 * also drives clearcoatNormalMap, so the gloss layer's highlights follow the
 * rings — the vinyl shimmer.
 *
 * The mapping trick that makes one small strip cover the disc: the ring
 * geometry's UVs are rewritten to POLAR coordinates (u = angle, v = radius),
 * so a 16 x 4096 strip describes radius alone and wraps seamlessly around
 * the disc. 4096 rows across the 101 mm surface = ~40 texels/mm — a full 10
 * texels per 0.25 mm groove pitch, plenty for smooth bump derivatives, and
 * ~0.5 MB of texture memory.
 *
 * Groove layout (all radii in true mm, per the user's clip metadata):
 *   151.5..147.5  bare rim margin (records keep a narrow ungrooved edge)
 *   147.5..57     groove field at true 0.25 mm pitch, covering the whole
 *                 playable surface; the clip's actual program band inside it
 *                 gets loudness-modulated depth/roughness (louder turns cut
 *                 wider, scatter more light), the rest reads as silent turns
 *   57..53.5      run-out spiral at ~1.6 mm pitch + locked groove
 *   53.5..50.5    dead wax to the label edge
 */

import * as THREE from "three";

import type { GrooveGeometry } from "../../types/api";
import { runInWorker } from "./room/paintPool";
import {
  NORMAL_W,
  ROUGH_H,
  ROUGH_W,
  STRIP_H,
  buildStripPixels,
  type StripInput,
  type StripPixels,
} from "./vinylStrips";

export { SURFACE_R_IN, SURFACE_R_OUT } from "./vinylStrips";

/** Per-turn RMS of the uploaded audio, 256 bins across the program band. */
function loudnessBins(geometry: GrooveGeometry): Float32Array {
  const bins = 256;
  const sum = new Float32Array(bins);
  const count = new Float32Array(bins);
  const turns = Math.max(geometry.meta.revolutions, 1e-3);
  const twoPi = 2 * Math.PI;
  for (let i = 0; i < geometry.theta.length; i++) {
    const b = Math.min(bins - 1, Math.floor((geometry.theta[i] / (turns * twoPi)) * bins));
    const v = geometry.lateral[i];
    sum[b] += v * v;
    count[b] += 1;
  }
  let peak = 1e-12;
  const rms = new Float32Array(bins);
  for (let b = 0; b < bins; b++) {
    rms[b] = count[b] > 0 ? Math.sqrt(sum[b] / count[b]) : 0;
    peak = Math.max(peak, rms[b]);
  }
  for (let b = 0; b < bins; b++) rms[b] = Math.sqrt(rms[b] / peak); // perceptual-ish
  return rms;
}

function stripInput(geometry: GrooveGeometry): StripInput {
  return {
    startRadiusMm: geometry.meta.start_radius_mm,
    groovePitchUm: geometry.meta.groove_pitch_um,
    revolutions: geometry.meta.revolutions,
    loud: loudnessBins(geometry),
  };
}

/** Strips computed ahead of time (in a worker), keyed by clip geometry. */
const prepared = new WeakMap<GrooveGeometry, StripPixels>();

/**
 * Compute this clip's strips off the main thread, so mounting the record
 * later only has to upload them. Safe to call repeatedly.
 */
export async function prepareVinylSurface(geometry: GrooveGeometry): Promise<void> {
  if (prepared.has(geometry)) return;
  const pixels = await runInWorker<StripPixels>("buildStripPixels", [stripInput(geometry)]);
  prepared.set(geometry, pixels);
}

interface StripResult {
  normal: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
}

function buildStrips(geometry: GrooveGeometry): StripResult {
  const pixels = prepared.get(geometry) ?? buildStripPixels(stripInput(geometry));
  const canvasOf = (w: number, h: number, data: Uint8ClampedArray) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    const img = g.createImageData(w, h);
    img.data.set(data);
    g.putImageData(img, 0, 0);
    return c;
  };
  const normalC = canvasOf(NORMAL_W, STRIP_H, pixels.normal);
  const roughC = canvasOf(ROUGH_W, ROUGH_H, pixels.rough);

  const mk = (canvas: HTMLCanvasElement) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping; // seamless around the disc (u = angle)
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = 8;
    tex.colorSpace = THREE.NoColorSpace; // data maps, not colors
    return tex;
  };
  return { normal: mk(normalC), rough: mk(roughC) };
}

export interface VinylSurface {
  material: THREE.MeshPhysicalMaterial;
  dispose: () => void;
}

/** Build the record-surface material for one clip's geometry. */
export function makeVinylSurfaceMaterial(geometry: GrooveGeometry): VinylSurface {
  const { normal, rough } = buildStrips(geometry);

  const material = new THREE.MeshPhysicalMaterial({
    // Polished black PVC: a dielectric, never a metal. Form comes from the
    // clearcoat's environment reflection, not from lifting the albedo.
    color: new THREE.Color("#0a0a0c"),
    metalness: 0.0,
    roughness: 1.0, // absolute values live in the roughness map
    roughnessMap: rough,
    // The groove relief, view-stable (see module docstring). The base layer
    // keeps the rings visible under ordinary diffuse/spec light…
    normalMap: normal,
    normalScale: new THREE.Vector2(1, 1),
    // …and the clearcoat following the same relief is what produces the
    // pronounced circular shimmer when a light source rakes the surface.
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    clearcoatNormalMap: normal,
    clearcoatNormalScale: new THREE.Vector2(1, 1),
    envMapIntensity: 1.45,
    side: THREE.FrontSide,
  });

  return {
    material,
    dispose: () => {
      material.dispose();
      normal.dispose();
      rough.dispose();
    },
  };
}
