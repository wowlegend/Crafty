// mobLineOfSight.js — line-of-sight test over a mob's local 9x9 voxel height window. This is the pure
// reference for ai.worker.js's inline mirror of the same function (the worker is a CLASSIC Worker and
// cannot import; mob-los-sync-gates.test.js pins the two copies together, same as mobSteering).
//
// The grid is 9 columns wide (indices 0..8 on each axis). Endpoints come from a mob-relative frame:
// (x1,z1) is a candidate cover cell (always on-grid) and (x2,z2) is the player/target cell, which CAN
// fall outside the window when the player is far away. An off-grid index reads undefined (or a wrapped
// wrong cell), so the height comparisons go NaN and LOS silently reports "clear" — backwards, since it
// makes cover unfindable at range. clampCell projects each endpoint onto the nearest edge cell so the
// trace runs toward the player's direction instead of reading off the grid.
const COLS = 9;
const clampCell = (v) => (v < 0 ? 0 : v > 8 ? 8 : v);

export function hasLineOfSight(heightGrid, x1, z1, x2, z2) {
  const ax = clampCell(x1), az = clampCell(z1), bx = clampCell(x2), bz = clampCell(z2);
  const startH = heightGrid[ax + az * COLS];
  const endH = heightGrid[bx + bz * COLS];

  // Trace cells from (ax, az) to (bx, bz).
  const steps = Math.max(Math.abs(bx - ax), Math.abs(bz - az));
  if (steps === 0) return true;

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const px = Math.round(ax + (bx - ax) * t);
    const pz = Math.round(az + (bz - az) * t);
    const cellH = heightGrid[px + pz * COLS];

    // An intermediate column is blocking if it rises significantly higher than both ends.
    if (cellH > Math.max(startH, endH) + 1.2) {
      return false; // Obstruction found!
    }
  }
  return true;
}
