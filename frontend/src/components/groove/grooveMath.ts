/**
 * Shared math for placing groove cross-sections in scene space.
 *
 * Scene units are millimeters of *display* geometry. Two exaggerations are
 * applied — and disclosed in the HUD, because honest scaling is part of the
 * pedagogy — and both are now ADAPTIVE to clip length:
 *
 *  - radial: stretches the spiral's inward travel so revolutions are visibly
 *    separated, capped so the groove always stays on the disc. A 10 s clip
 *    (1.4 mm of real travel) gets ~x40; a 3-minute clip (25 mm) gets ~x1.7
 *    and simply looks like what it is — a dense band of a hundred turns.
 *  - modulation: magnifies the micrometer audio wiggle, clamped so adjacent
 *    revolutions can never visually collide at the current radial spacing.
 *
 * The coordinate system is chosen for the turntable illusion: grooves are
 * laid out with z = -r*sin(theta), so spinning the record group by
 * rotation.y = -OMEGA*t keeps the point being played fixed on the +X axis
 * (where the tonearm sits) and the disc turns clockwise viewed from above,
 * like a real deck.
 */

import type { GrooveGeometry } from "../../types/api";

/** Platter angular velocity, rad/s — 33 1/3 RPM, same constant as the DSP. */
export const OMEGA = (2 * Math.PI * (100 / 3)) / 60;

export const BASE_DEPTH_MM = 0.9; // unmodulated V-groove depth on screen
const MAX_RADIAL_EXAG = 40;
const INNER_MARGIN_MM = 58; // keep the groove band outside the label area

export type ChannelView = "both" | "lateral" | "vertical";

export interface SectionParams {
  geometry: GrooveGeometry;
  /** Effective (clamped) modulation magnification. */
  modExag: number;
  /** Effective radial travel magnification. */
  radialExag: number;
  view: ChannelView;
}

/** Radial exaggeration that keeps the whole groove band on the disc. */
export function radialExagOf(geometry: GrooveGeometry): number {
  const n = geometry.radius.length;
  const travelMm = (geometry.radius[0] - geometry.radius[n - 1]) * 1000;
  const spanMm = geometry.meta.start_radius_mm - INNER_MARGIN_MM;
  if (travelMm < 1e-3) return MAX_RADIAL_EXAG;
  return Math.min(MAX_RADIAL_EXAG, Math.max(spanMm, 1) / travelMm);
}

/** Clamp the requested modulation zoom so neighboring revolutions (spaced
 * pitch * radialExag apart on screen) cannot overlap. */
export function effectiveModExag(geometry: GrooveGeometry, requested: number): number {
  const radial = radialExagOf(geometry);
  const displayPitchMm = (geometry.meta.groove_pitch_um / 1000) * radial;
  const peakMm = Math.max(geometry.meta.peak_excursion_um / 1000, 1e-4);
  const maxSafe = (displayPitchMm * 0.45) / peakMm;
  return Math.max(1, Math.min(requested, maxSafe));
}

/** Build the params object once per render/rebuild (not per section). */
export function makeSectionParams(
  geometry: GrooveGeometry,
  requestedModExag: number,
  view: ChannelView,
): SectionParams {
  return {
    geometry,
    view,
    radialExag: radialExagOf(geometry),
    modExag: effectiveModExag(geometry, requestedModExag),
  };
}

export interface SectionPoint {
  x: number;
  z: number;
  /** Groove centerline radius on screen (mm). */
  rc: number;
  /** V depth on screen (mm), always > 0. */
  depth: number;
  cos: number;
  sin: number;
}

/** Groove centerline display radius at section i, WITHOUT audio wiggle.
 * The tonearm IK targets this: arm mass cannot follow audio-rate modulation
 * (that is the cantilever suspension's job), so the arm tracks the smooth
 * spiral and the wiggle is applied as a local cantilever offset. */
export function centerlineRadius(i: number, p: SectionParams): number {
  const startR = p.geometry.meta.start_radius_mm;
  return startR - (startR - p.geometry.radius[i] * 1000) * p.radialExag;
}

/** Compute the display-space cross-section at index i. */
export function sectionPoint(i: number, p: SectionParams): SectionPoint {
  const { geometry, modExag, radialExag, view } = p;
  const startR = geometry.meta.start_radius_mm;
  const lat = view === "vertical" ? 0 : geometry.lateral[i];
  const vert = view === "lateral" ? 0 : geometry.vertical[i];

  // Spiral centerline with exaggerated inward travel.
  const rBase = startR - (startR - geometry.radius[i] * 1000) * radialExag;
  // Lateral audio modulation swings the whole V sideways (radially).
  const rc = rBase + lat * 1000 * modExag;
  // Vertical modulation (stereo difference) breathes the V's depth.
  const depth = Math.max(BASE_DEPTH_MM + vert * 1000 * modExag * 0.5, 0.12);

  const theta = geometry.theta[i];
  const cos = Math.cos(theta);
  const sin = -Math.sin(theta); // mirrored: see module docstring (spin direction)
  return { x: rc * cos, z: rc * sin, rc, depth, cos, sin };
}

/** Locate the section index playing at time t (binary search on timeS). */
export function sectionAtTime(geometry: GrooveGeometry, t: number): number {
  const times = geometry.timeS;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
