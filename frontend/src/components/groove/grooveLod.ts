/**
 * Level-of-detail strategy for the groove inspector.
 *
 * Three scales, two representations:
 *
 *   LOD 0 "overview"  \  one procedural shader on the record surface
 *   LOD 1 "close-up"  /  (GrooveOverviewMaterial) — analytically anti-
 *                        aliased rings at TRUE pitch, so the transition
 *                        from "satin band" to "individual turns" is
 *                        continuous with camera distance; no meshes, no
 *                        LOD pop, no per-frame work.
 *
 *   LOD 2 "microscope"   a local high-resolution V-trench mesh built from
 *                        the backend's groove-window endpoint, only around
 *                        the stylus (GrooveInspectionMesh). Appears/hides
 *                        by camera-to-stylus distance with hysteresis so
 *                        it never flickers at the boundary.
 *
 * The mode buttons don't switch renderers — they only FLY THE CAMERA to a
 * preset distance; what you see at each distance is decided by the same
 * hysteresis thresholds, so scroll-zooming and button-flying behave
 * identically.
 */

export type LodMode = "overview" | "closeup" | "microscope";

/** Camera-to-stylus distance (mm) below which the microscope detail mounts… */
export const MICRO_ENTER_MM = 48;
/** …and above which it unmounts (hysteresis gap prevents flicker). */
export const MICRO_EXIT_MM = 62;

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

/** Whole-turntable framing (matches the scene's home pose). */
export const OVERVIEW_POSE: CameraPose = {
  position: [255, 180, 310],
  target: [40, -25, -25],
};

/** Preset camera pose for a mode, aimed at the current stylus contact. */
export function poseFor(mode: LodMode, contact: { x: number; z: number }): CameraPose {
  switch (mode) {
    case "overview":
      return OVERVIEW_POSE;
    case "closeup":
      // Individual turns resolve; the groove band fills the frame.
      return {
        position: [contact.x + 14, 42, contact.z + 52],
        target: [contact.x, 0, contact.z],
      };
    case "microscope":
      // Millimeters from the vinyl: the trench, walls and tip.
      return {
        position: [contact.x + 2.2, 2.6, contact.z + 4.6],
        target: [contact.x, -0.1, contact.z],
      };
  }
}
