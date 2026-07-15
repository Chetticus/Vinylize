/**
 * Tonearm inverse kinematics — pure math, no three.js.
 *
 * Model (real pivoted-arm geometry, in scene millimeters):
 *   - The arm pivots about a FIXED vertical axis at P = (pivotX, pivotZ),
 *     placed off the record like a real deck (we use the classic 9" arm
 *     numbers: pivot-to-spindle 212 mm, effective length 229 mm, i.e.
 *     17 mm of overhang).
 *   - The stylus tip sits at fixed horizontal distance L (effective length)
 *     from the pivot axis, along the arm's local +X. Yawing the assembly by
 *     alpha about Y puts the tip at
 *
 *         tip(alpha) = (px + L*cos(alpha), pz - L*sin(alpha))
 *
 *     (rotateY(alpha) maps local +X to world (cos a, 0, -sin a)).
 *
 * The IK question is: which yaw makes the tip land on the groove currently
 * playing? The groove point at clip time t sits at world radius r(t) — and,
 * by the record-phase convention (recordMotion.ts), at world angle 0. A
 * fixed-length arm generally CANNOT reach (r, angle 0): like on a real
 * turntable, the stylus arc crosses each radius at some other angle (that
 * offset is literally the "tracking error" hi-fi people argue about). So we
 * solve for |tip| = r — the intersection of two circles:
 *
 *     circle A: center origin,  radius r   (the groove revolution)
 *     circle B: center P,       radius L   (the stylus arc)
 *
 * Expanding |tip(alpha)|^2 = r^2 gives A*cos + B*sin = C with A = px,
 * B = -pz, C = (r^2 - |P|^2 - L^2) / (2L); then alpha = atan2(B,A) +/-
 * acos(C/|P|). Two intersections exist; we take the one on the record's
 * front-right (larger tip x), which is where a right-mounted arm physically
 * hangs. |C/|P|| > 1 means the radius is outside the arm's reach — we clamp
 * to the tangent position, so the arm parks at its extreme rather than
 * exploding (spec: "clamp gracefully").
 *
 * Because the stylus touches the groove at world angle beta = atan2(-z, x)
 * rather than 0, the groove SECTION under the tip is the one playing at
 * t + beta/OMEGA, not t. solveStylusPose iterates once on that correction
 * (the spiral radius changes by well under a millimeter per revolution, so
 * one pass converges far below visual tolerance) and returns that section's
 * true wiggle and depth, which the Tonearm applies as LOCAL cantilever
 * compliance — the arm itself only ever yaws about the pivot.
 */

import type { GrooveGeometry } from "../../types/api";
import {
  OMEGA,
  sectionAtTime,
  trueRadiusMm,
  viewComponentsMm,
  type ChannelView,
} from "./grooveMath";

export interface ArmConfig {
  /** Pivot axis position in world XZ (mm). */
  pivotX: number;
  pivotZ: number;
  /** Horizontal pivot-axis -> stylus-tip distance (mm). */
  effectiveLength: number;
  /** Height of the arm assembly's local origin above the record surface (mm). */
  armPlaneY: number;
}

/** Real 9-inch-arm proportions; the scene is built in true millimeters. */
export const ARM: ArmConfig = {
  pivotX: 178,
  pivotZ: -116, // |P| = sqrt(178^2 + 116^2) ~= 212.5 mm from the spindle
  effectiveLength: 229,
  armPlaneY: 14,
};

export interface ArmSolution {
  /** Assembly yaw about the pivot's Y axis (rad). */
  yaw: number;
  /** World XZ of the stylus tip at that yaw. */
  tipX: number;
  tipZ: number;
  /** True if the requested radius was outside the arm's reach. */
  clamped: boolean;
}

/** Solve the arm yaw that puts the tip at world radius `targetRadius`. */
export function solveArmYaw(cfg: ArmConfig, targetRadius: number): ArmSolution {
  const { pivotX: px, pivotZ: pz, effectiveLength: L } = cfg;
  const pivotDist = Math.hypot(px, pz);

  const a = px;
  const b = -pz;
  const c = (targetRadius * targetRadius - pivotDist * pivotDist - L * L) / (2 * L);

  let u = c / pivotDist;
  const clamped = u < -1 || u > 1;
  u = Math.max(-1, Math.min(1, u));

  const phi0 = Math.atan2(b, a);
  const spread = Math.acos(u);

  // Two intersections; keep the tip on the record's front-right quadrant
  // (larger world x) — that is where a right-mounted arm hangs.
  let best: ArmSolution | null = null;
  for (const yaw of [phi0 + spread, phi0 - spread]) {
    const tipX = px + L * Math.cos(yaw);
    const tipZ = pz - L * Math.sin(yaw);
    if (!best || tipX > best.tipX) best = { yaw, tipX, tipZ, clamped };
  }
  return best!;
}

export interface StylusPose extends ArmSolution {
  /** Groove section actually under the tip (accounts for tracking angle). */
  sectionIndex: number;
  /** TRUE audio wall components at the contact section (mm — micrometers in
   * practice; consumers apply their own labeled exaggeration). */
  latMm: number;
  vertMm: number;
}

/** Full per-frame solution: arm yaw + contact-section audio at time t. */
export function solveStylusPose(
  cfg: ArmConfig,
  geometry: GrooveGeometry,
  view: ChannelView,
  t: number,
): StylusPose {
  const duration = geometry.timeS[geometry.timeS.length - 1];
  const tc = Math.max(0, Math.min(t, duration));

  // Pass 1: aim at the smooth spiral radius of the nominally-playing section.
  let section = sectionAtTime(geometry, tc);
  let sol = solveArmYaw(cfg, trueRadiusMm(geometry, section));

  // Pass 2: the tip touches the groove at world angle beta, i.e. the section
  // playing beta/OMEGA later — re-aim at THAT section's radius.
  const beta = Math.atan2(-sol.tipZ, sol.tipX);
  const tContact = Math.max(0, Math.min(tc + beta / OMEGA, duration));
  section = sectionAtTime(geometry, tContact);
  sol = solveArmYaw(cfg, trueRadiusMm(geometry, section));

  const { latMm, vertMm } = viewComponentsMm(geometry, section, view);
  return { ...sol, sectionIndex: section, latMm, vertMm };
}

/**
 * Dev/debug self-check (invariants, no scene graph needed):
 *   1. the tip's world radius equals the contact groove's centerline radius;
 *   2. the tip stays exactly effectiveLength from the pivot axis.
 * Returns the worst radius error in mm over sampled times.
 */
export function validateKinematics(cfg: ArmConfig, geometry: GrooveGeometry): number {
  const duration = geometry.timeS[geometry.timeS.length - 1];
  let worst = 0;
  for (const frac of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    const pose = solveStylusPose(cfg, geometry, "both", frac * duration);
    const tipRadius = Math.hypot(pose.tipX, pose.tipZ);
    const grooveRadius = trueRadiusMm(geometry, pose.sectionIndex);
    worst = Math.max(worst, Math.abs(tipRadius - grooveRadius));
    const reach = Math.hypot(pose.tipX - cfg.pivotX, pose.tipZ - cfg.pivotZ);
    worst = Math.max(worst, Math.abs(reach - cfg.effectiveLength));
  }
  return worst;
}
