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
 *   low    — no pendant shadow, sparse dressing, textures ×½, DPR capped at 1
 */

export type Quality = "high" | "medium" | "low";

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
  else if (mobileGpu || coarse || cores <= 4 || memory <= 4) cached = "medium";
  else cached = "high";
  return cached;
}
