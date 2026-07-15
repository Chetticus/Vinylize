/**
 * Honest-scale policy for the multiscale groove inspector.
 *
 * The record is rendered in TRUE millimeters: disc size, groove pitch, turn
 * count and spacing are all physical. Real audio modulation is micrometers —
 * invisible even at microscope camera distances — so exactly THREE things
 * may be exaggerated, each clamped and each disclosed in the scale label:
 *
 *   1. audio wiggle in the microscope trench (user "audio zoom", clamped so
 *      a groove can never swing into its neighbor);
 *   2. the cantilever's visible vibration on the macro tonearm (fixed x50,
 *      cosmetic, sub-millimeter);
 *   3. the micro-stylus tip size, which already carries the DSP "stylus
 *      size" parameter and is floored at a visible minimum.
 *
 * Pitch and spacing are NEVER exaggerated.
 */

import type { GrooveGeometry } from "../../types/api";

/** Cosmetic vibration multiplier for the macro tonearm's cantilever. */
export const ARM_WIGGLE_EXAG = 50;

/** Fraction of the pitch a groove centerline may swing before it would read
 * as colliding with its neighbor. */
const MAX_SWING_FRACTION = 0.38;

/** Smallest micro-stylus tip radius we render (mm) — below this it would be
 * sub-pixel even at full microscope zoom. */
export const MIN_TIP_RADIUS_MM = 0.006;

/** True stylus tip radius (mm) before the DSP stylus-size scale. */
export const TRUE_TIP_RADIUS_MM = 0.008;

/** Clamp a requested audio zoom so wiggle stays inside the groove's lane. */
export function safeAudioBoost(geometry: GrooveGeometry, requested: number): number {
  const pitchMm = geometry.meta.groove_pitch_um / 1000;
  const peakMm = Math.max(geometry.meta.peak_excursion_um / 1000, 1e-5);
  const maxSafe = (pitchMm * MAX_SWING_FRACTION) / peakMm;
  return Math.max(1, Math.min(requested, maxSafe));
}

/** The persistent disclosure line shown while microscope detail is active. */
export function scaleLabel(effectiveBoost: number, tipScale: number): string {
  const tip = tipScale !== 1 ? ` · stylus tip ×${tipScale.toFixed(2)} (DSP setting)` : "";
  return (
    `Microscope — audio modulation enlarged ×${Math.round(effectiveBoost)} for inspection. ` +
    `Groove pitch, spacing and turn count remain true scale.${tip}`
  );
}
