/**
 * The pure functions a paint worker may run, by name. Shared by the pool
 * (for its main-thread fallback) and the worker entry.
 */

import { buildStripPixels } from "../vinylStrips";
import * as pixels from "./pixels";

export type PainterName =
  | "paintWood"
  | "paintPlaster"
  | "paintFloor"
  | "paintRug"
  | "paintLeather"
  | "paintBrushed"
  | "paintCeramic"
  | "paintWeave"
  | "paintThrow"
  | "paintCard"
  | "paintRain"
  | "paintLathe";

export type JobName = PainterName | "buildStripPixels";

export const WORKER_FUNCTIONS: Record<JobName, (...args: never[]) => unknown> = {
  paintWood: pixels.paintWood,
  paintPlaster: pixels.paintPlaster,
  paintFloor: pixels.paintFloor,
  paintRug: pixels.paintRug,
  paintLeather: pixels.paintLeather,
  paintBrushed: pixels.paintBrushed,
  paintCeramic: pixels.paintCeramic,
  paintWeave: pixels.paintWeave,
  paintThrow: pixels.paintThrow,
  paintCard: pixels.paintCard,
  paintRain: pixels.paintRain,
  paintLathe: pixels.paintLathe,
  buildStripPixels,
};
