/**
 * Core groove math — TRUE SCALE (v0.6).
 *
 * Earlier versions rendered the whole groove as an exaggerated ribbon
 * (radial spacing stretched ~x35). The multiscale inspector replaced that
 * with a physically scaled record: scene units are real millimeters, groove
 * pitch is the real ~0.25 mm, and audio modulation is only exaggerated in
 * clearly-labeled places (see grooveScale.ts). This module keeps the shared
 * primitives every consumer needs.
 *
 * Coordinate convention (see recordMotion.ts): record in the XZ plane, +Y
 * up, spindle at origin. Groove sections are laid out at local angle theta
 * with x = r*cos(theta), z = -r*sin(theta) (the mirror makes the disc spin
 * clockwise from above when the record group applies rotation.y = -OMEGA*t,
 * and pins the currently-playing point to the +X axis).
 */

import type { GrooveGeometry } from "../../types/api";

/** Platter angular velocity, rad/s — 33 1/3 RPM, same constant as the DSP. */
export const OMEGA = (2 * Math.PI * (100 / 3)) / 60;

export type ChannelView = "both" | "lateral" | "vertical";

/** Groove centerline radius at section i, in true millimeters. */
export function trueRadiusMm(geometry: GrooveGeometry, i: number): number {
  return geometry.radius[i] * 1000;
}

/** Audio wall components at section i in true millimeters, with the stereo
 * visualization mode applied: "lateral" silences the L−R (vertical/depth)
 * component, "vertical" silences the L+R (lateral swing) component — the
 * geometry genuinely changes, not just its color. */
export function viewComponentsMm(
  geometry: GrooveGeometry,
  i: number,
  view: ChannelView,
): { latMm: number; vertMm: number } {
  return {
    latMm: view === "vertical" ? 0 : geometry.lateral[i] * 1000,
    vertMm: view === "lateral" ? 0 : geometry.vertical[i] * 1000,
  };
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

// ---------------------------------------------------------------------
// Archimedean spiral in display millimeters (mirrors backend spatial_map)
// ---------------------------------------------------------------------

/** theta after arc length sMm along the spiral (smaller quadratic root). */
export function thetaOfSMm(sMm: number, startRadiusMm: number, pitchMm: number): number {
  const k = pitchMm / (2 * Math.PI);
  const disc = Math.max(startRadiusMm * startRadiusMm - 2 * k * sMm, 0);
  return (startRadiusMm - Math.sqrt(disc)) / k;
}

/** Groove radius after theta radians of cutting. */
export function radiusOfThetaMm(theta: number, startRadiusMm: number, pitchMm: number): number {
  return startRadiusMm - (pitchMm / (2 * Math.PI)) * theta;
}

/**
 * Invert a click on the record surface into a playback time.
 * (x, z) are RECORD-LOCAL coordinates (caller applies worldToLocal so the
 * disc's current rotation is accounted for). The radius pins the turn
 * number; the angle refines the position within that turn.
 */
export function timeAtLocalPoint(
  x: number,
  z: number,
  startRadiusMm: number,
  pitchMm: number,
  durationS: number,
): number | null {
  const r = Math.hypot(x, z);
  const turnsF = (startRadiusMm - r) / pitchMm; // fractional turn count at r
  const totalTheta = OMEGA * durationS;
  if (turnsF < -0.75 || turnsF * 2 * Math.PI > totalTheta + Math.PI * 1.5) return null;

  const phi = Math.atan2(-z, x); // local angle in [-pi, pi], our convention
  // Choose the whole-turn count k so that (k*2pi + phi) is nearest the
  // radius-implied angle.
  const target = turnsF * 2 * Math.PI;
  const k = Math.round((target - phi) / (2 * Math.PI));
  const theta = Math.max(0, Math.min(k * 2 * Math.PI + phi, totalTheta));
  return (theta / OMEGA) as number;
}
