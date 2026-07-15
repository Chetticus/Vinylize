/**
 * Record motion: the single source of truth for "what time is the deck at,
 * which way is the disc facing, and what is the stylus doing".
 *
 * Coordinate convention for the whole turntable scene (documented once,
 * here): the record lies in the XZ plane, +Y is up, the spindle is at the
 * world origin, and the disc rotates about Y. Groove sections are laid out
 * at local angle theta with z = -r*sin(theta) (see grooveMath), so spinning
 * the record group by
 *
 *     rotation.y = -OMEGA * t
 *
 * (a) turns the disc CLOCKWISE viewed from above at a true 33 1/3 RPM, and
 * (b) places the groove point whose nominal playback time is t exactly at
 * world angle 0 (the +X axis) — because the cutting map guarantees
 * theta(section at time t) = OMEGA * t. Every consumer (spin group, tonearm
 * IK, debug markers) derives from these two functions so the record phase
 * and the stylus can never drift apart.
 */

import { engine, useStore } from "../../state/store";
import { OMEGA } from "./grooveMath";

let frozenT: number | null = null;

/** "Freeze record" inspection mode: the deck (disc, arm, readout, microscope
 * window) holds at the freeze moment while audio keeps playing. */
export function setFrozen(on: boolean): void {
  frozenT = on ? rawClipTime() : null;
}

export function isFrozen(): boolean {
  return frozenT !== null;
}

function rawClipTime(): number {
  return engine.isPlaying ? engine.position() : useStore.getState().positionS;
}

/** Current clip time in seconds: live engine clock while playing, otherwise
 * the frozen seek position — pause freezes the deck exactly where it stopped. */
export function clipTime(): number {
  return frozenT ?? rawClipTime();
}

/**
 * The stylus contact point in world coordinates, written once per frame by
 * the Tonearm (which already solves the arm pose) and read by the camera
 * rig, LOD logic, and micro-stylus. A module-level mutable avoids threading
 * a ref through five components; the single writer is documented here.
 */
export const contact = { x: 100, z: 0, radiusMm: 100, depthMm: 0.03, latMm: 0, sectionIndex: 0 };

/** Disc rotation about Y at clip time t (rad). */
export function discAngle(t: number): number {
  return -OMEGA * t;
}

export type StylusStatus = "resting" | "playing" | "paused";

/** Resting = parked on the lead-in groove (t=0, not playing). */
export function stylusStatus(t: number, playing: boolean): StylusStatus {
  if (playing) return "playing";
  return t <= 0.01 ? "resting" : "paused";
}
