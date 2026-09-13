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

/** Studio framing: a three-quarter product shot — the whole deck fits the
 * frame left of the inspection card at fov 34. */
export const OVERVIEW_POSE: CameraPose = {
  position: [430, 340, 600],
  target: [25, -22, -18],
};

/** Listening-room framing: an interior photograph from standing height
 * near the room's open side — deck dominant, window and collection behind,
 * the reading chair at the left edge. */
export const ROOM_OVERVIEW_POSE: CameraPose = {
  position: [820, 340, 760],
  target: [-190, -40, -100],
};

/** Pull an overview back along its line of sight for narrow or portrait
 * canvases, so the deck still fits the frame's width (tablets, phones). */
function fitToAspect(pose: CameraPose, aspect: number): CameraPose {
  const k = Math.min(1.6, Math.max(1, Math.pow(1.5 / Math.max(aspect, 0.3), 0.7)));
  if (k === 1) return pose;
  // Narrow frames also re-centre on the deck itself (plinth centre).
  const s = 1 - Math.min(1, aspect / 1.5);
  const [tx, ty, tz] = pose.target.map((v, i) => v + ([35, -20, -10][i] - v) * s);
  const [px, py, pz] = pose.position.map((v, i) => v + ([35, -20, -10][i] - pose.target[i]) * s);
  return {
    position: [tx + (px - tx) * k, ty + (py - ty) * k, tz + (pz - tz) * k],
    target: [tx, ty, tz],
  };
}

/** Preset camera pose for a mode, aimed at the current stylus contact. */
export function poseFor(
  mode: LodMode,
  contact: { x: number; z: number },
  room = false,
  aspect = 16 / 9,
): CameraPose {
  switch (mode) {
    case "overview":
      return fitToAspect(room ? ROOM_OVERVIEW_POSE : OVERVIEW_POSE, aspect);
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
