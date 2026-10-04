/**
 * Render quality tiers for the listening room.
 *
 * Screen width alone is a poor proxy for GPU power (a 4K laptop with
 * integrated graphics, a small but fast tablet), so the tier combines what
 * the browser will tell us: CPU cores, device memory, coarse pointer, and the
 * unmasked renderer string when available. `?quality=high|medium|low`
 * overrides the guess.
 *
 *   high   — full room, 2048 shadow map, all props, texture size ×1
 *   medium — full room, 1024 shadow maps, fewer small props, textures ×½
 *   low    — no pendant shadow, sparse dressing, textures ×½, DPR 1
 */

export type Quality = "high" | "medium" | "low";

/** Supersample desktop edges, even on a 1x display. Never blur the room to
 * sub-native resolution as a response to slow frames. */
export function resolutionFor(quality: Quality, deviceRatio: number): number {
  if (quality === "high") return Math.min(2, Math.max(1.5, deviceRatio));
  if (quality === "medium") return Math.min(1.5, Math.max(1, deviceRatio));
  return 1;
}

export function adjustResolution(quality: Quality, current: number, target: number, meanFrameS: number): number {
  const floor = quality === "high" ? 1.5 : 1;
  if (meanFrameS > 1 / 30) return Math.max(floor, current - 0.15);
  if (meanFrameS < 1 / 55) return Math.min(target, Math.max(floor, current + 0.1));
  return Math.max(floor, current);
}

let cached: Quality | null = null;

export function detectQuality(): Quality {
  if (cached) return cached;
  const param = new URLSearchParams(window.location.search).get("quality");
  if (param === "high" || param === "medium" || param === "low") return (cached = param);

  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 8;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;

  let renderer = "";
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    if (gl && ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    /* renderer string is a hint only */
  }
  const software = /swiftshader|llvmpipe|software|basic render/i.test(renderer);
  const mobileGpu = /mali|adreno|powervr|apple gpu/i.test(renderer) && coarse;

  if (software || cores <= 2 || memory <= 2) cached = "low";
  else if (mobileGpu || coarse) cached = "medium";
  // Restore full-resolution materials and all room dressing on desktop.
  // Keep cost-saving batching/cached shadows, not a lower-detail room.
  else cached = "high";
  return cached;
}
