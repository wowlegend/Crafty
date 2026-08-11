// Multi-block build footprints — the cell set a single place/mine action expands to.
//
// WHY THIS EXISTS. The Building Tools panel shipped reachable four ways (KeyB, the HUD grid button, the
// touch tray, the panel registry) and localized into two languages, writing `buildingMode` / `buildSize` /
// `selectedBuildBlock` into the store — and NOTHING read them. Terrain's placement executor was never
// taught they existed, so every mode placed exactly one block. An advertised pillar of a voxel game that
// did nothing.
//
// WIRED RATHER THAN DELETED, but deliberately NOT as specced, and the reason is the economy rather than
// the code. `place` debits inventory per block through `consumeForPlacement`, so the panel's advertised
// size-10 cube is 1000 blocks debited in a single click — a quantity no survival player will ever hold —
// and 1000 per-block worker messages would stall the greedy mesher. The feature is right for the genre;
// that spec is incoherent with the game's own survival debit.
//
// So the footprint is CELL-CAPPED, and each mode's usable size is derived from the cap rather than from
// the slider. The slider's range stays 1-10 because clamping is friendlier than a range that changes
// under you, but the cap is what actually governs.

/**
 * Hard ceiling on cells per action. Chosen from the economy, not from taste: 64 stone is a plausible
 * stack for a player who has been mining, and 64 worker messages is a burst the mesher absorbs. Raising
 * this is a balance decision, not a tuning knob — a bigger number needs a batched worker message first.
 */
export const MAX_CELLS = 64;

/** Largest size that keeps each mode within MAX_CELLS. Derived, so the cap cannot be bypassed by a mode. */
export const MAX_SIZE = {
  single: 1,
  wall: MAX_CELLS,                                  // size cells (a column) — the cap is generous here
  floor: Math.floor(Math.sqrt(MAX_CELLS)),          // size^2
  cube: Math.floor(Math.cbrt(MAX_CELLS)),           // size^3
  delete: Math.floor(Math.cbrt(MAX_CELLS)),         // same shape as cube; see the note below
};

/**
 * PURE. Expand one placement into the cells it should affect.
 *
 * `delete` returns the same footprint as `cube` — the caller routes it to mine rather than place. Mining
 * GRANTS blocks, so a multi-cell delete is economically symmetrical with a multi-cell place and needs no
 * separate cap.
 *
 * @param {string} mode  single | wall | floor | cube | delete
 * @param {number} size  the slider value, clamped per mode against MAX_SIZE
 * @param {{x:number,y:number,z:number}} cell  the block-space cell the ray resolved to
 * @param {{x:number,y:number,z:number}} [normal]  face normal, used to orient a wall
 * @returns {{x:number,y:number,z:number}[]} distinct cells, always including `cell`
 */
export function buildFootprint(mode, size, cell, normal) {
  if (!cell || !Number.isFinite(cell.x) || !Number.isFinite(cell.y) || !Number.isFinite(cell.z)) return [];
  const m = MAX_SIZE[mode] === undefined ? 'single' : mode;
  const n = Math.max(1, Math.min(Math.floor(Number(size) || 1), MAX_SIZE[m]));
  const out = [];
  const push = (x, y, z) => { out.push({ x, y, z }); };

  if (m === 'single' || n === 1) {
    push(cell.x, cell.y, cell.z);
  } else if (m === 'wall') {
    // A column rising from the hit cell. Oriented up unless the face normal is vertical, in which case a
    // wall growing into the floor is meaningless and it grows along x instead.
    const vertical = !normal || Math.abs(normal.y) < 0.5;
    for (let i = 0; i < n; i++) {
      if (vertical) push(cell.x, cell.y + i, cell.z);
      else push(cell.x + i, cell.y, cell.z);
    }
  } else if (m === 'floor') {
    const h = Math.floor(n / 2);
    for (let dx = -h; dx < n - h; dx++) for (let dz = -h; dz < n - h; dz++) push(cell.x + dx, cell.y, cell.z + dz);
  } else {
    const h = Math.floor(n / 2);
    for (let dx = -h; dx < n - h; dx++)
      for (let dy = 0; dy < n; dy++)
        for (let dz = -h; dz < n - h; dz++) push(cell.x + dx, cell.y + dy, cell.z + dz);
  }

  // Distinct, and capped again as a belt: a mode added later without a MAX_SIZE entry falls back to
  // 'single', but an arithmetic slip inside one of the branches would otherwise escape the ceiling.
  const seen = new Set();
  const distinct = out.filter((c) => {
    const k = `${c.x},${c.y},${c.z}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return distinct.slice(0, MAX_CELLS);
}
