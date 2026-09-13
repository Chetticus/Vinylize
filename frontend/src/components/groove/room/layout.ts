/**
 * Floor plan of the listening room, in scene millimetres.
 *
 * The turntable is fixed by the physics (spindle at the origin, record face
 * at y = 0, plinth feet standing on y = -54.4), so the room is laid out
 * around it: the walnut console's top sits exactly under the feet, the
 * window wall is behind it, the reading corner is to the left.
 *
 *            back wall (window)            z = BACK
 *   ┌──────────────────────────────────────────────┐
 *   │ shelf      [spk]  turntable  [spk]     plant │
 *   │            ═══════ console ═══════     print │
 *   │  chair  side                                 │
 *   │  + rug  table                                │
 *   └ LEFT                                  RIGHT ┘
 *            (open side, where the camera stands)
 */

export const FLOOR_Y = -700;
export const CEIL_Y = 1750;
export const BACK_Z = -420;
export const LEFT_X = -2250;
export const RIGHT_X = 1650;
export const FRONT_Z = 1800;
export const WALL_T = 150;

/** Window opening in the back wall. */
export const WIN = { x0: -860, x1: 420, y0: 60, y1: 1380 };

/** Console: top surface is where the plinth feet stand. */
export const CONSOLE = {
  x0: -900,
  x1: 900,
  z0: -370,
  z1: 235,
  top: -54.4,
  slab: 34,
  legH: 170,
};

/** Room bounds the camera may occupy (with a margin from every surface). */
export const CAMERA_BOUNDS = {
  min: [LEFT_X + 120, FLOOR_Y + 180, BACK_Z + 60] as const,
  max: [RIGHT_X - 120, CEIL_Y - 120, FRONT_Z] as const,
};
