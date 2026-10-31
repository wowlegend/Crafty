// Multi-block build footprints — the cell set a single place/mine action expands to.
//
// WHY THIS EXISTS. The Building Tools panel shipped reachable four ways (KeyB, the HUD grid button, the
// touch tray, the panel registry) and localized into two languages, writing `buildingMode` / `buildSize`
// into the store — and NOTHING read them. Terrain's placement executor was never taught they existed, so
// every mode placed exactly one block. An advertised pillar of a voxel game that did nothing.
//
// WIRED RATHER THAN DELETED, but deliberately NOT as specced, and the reason is the economy rather than
// the code. `place` debits inventory per block through `consumeForPlacement`, so the panel's advertised
// size-10 cube is 1000 blocks debited in a single click — a quantity no survival player will ever hold —
// and 1000 per-block worker messages would stall the greedy mesher. The feature is right for the genre;
// that spec is incoherent with the game's own survival debit.
//
// So the footprint is CELL-CAPPED, and each mode's usable size is derived from the cap rather than from
// the slider. The panel's slider ends at the picked mode's size and each label says the size its mode
// builds at (ui/GamePanels.jsx BuildingTools; DECISIONS 2026-10-31 item 273), so no label promises more
// than the cap builds.

/**
 * Hard ceiling on cells per action. Chosen from the economy, not from taste: 64 stone is a plausible
 * stack for a player who has been mining. Raising this is a balance decision, not a tuning knob; it also
 * bounds the stand-in colliders one click makes (world/placedCellColliders.js).
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
 * Every footprint starts at the aimed cell and is oriented by the face the ray hit (DECISIONS 2026-10-31 item 232). A
 * build grows away from that face: a wall is a column rising from the cell (hanging down under a ceiling), and a floor
 * or a cube off a side face grows out along the normal, centred across it, so none of it lies inside the block it is
 * placed against; their height rises from the cell (falls under a ceiling). `delete` is the Delete Tool's removal
 * (world/mineAtHit.js): its cell is the block hit, so its cube grows INTO the face, down under a top face and up over a
 * ceiling, centred across a side face. It takes back only the player's own blocks, each paid as itself, so a removal
 * returns what placements spent and needs no separate cap (DECISIONS 2026-10-31 item 271). No normal reads as a top face.
 *
 * @param {string} mode  single | wall | floor | cube | delete
 * @param {number} size  the slider value, clamped per mode against MAX_SIZE
 * @param {{x:number,y:number,z:number}} cell  the block-space cell the ray resolved to
 * @param {{x:number,y:number,z:number}} [normal]  the hit face's normal
 * @returns {{x:number,y:number,z:number}[]} distinct cells, always including `cell`
 */
export function buildFootprint(mode, size, cell, normal) {
  if (!cell || !Number.isFinite(cell.x) || !Number.isFinite(cell.y) || !Number.isFinite(cell.z)) return [];
  const m = MAX_SIZE[mode] === undefined ? 'single' : mode;
  const n = Math.max(1, Math.min(Math.floor(Number(size) || 1), MAX_SIZE[m]));
  const out = [];
  const push = (x, y, z) => { out.push({ x, y, z }); };
  const nx = normal ? normal.x : 0, ny = normal ? normal.y : 1, nz = normal ? normal.z : 0;
  const removal = m === 'delete';
  // The axis the face points along, and which way along it the footprint grows: out of the face for a build, into it
  // for a removal. Its sign is +1 or -1; an axis the face does not point along is spanned centred on the cell.
  const sideways = Math.abs(ny) < 0.5;
  const alongX = sideways && Math.abs(nx) >= Math.abs(nz);
  const grow = (v) => (removal ? -Math.sign(v) : Math.sign(v)) || 1;
  const h = Math.floor(n / 2);
  const centred = Array.from({ length: n }, (_, i) => i - h);
  const outward = (sign) => Array.from({ length: n }, (_, i) => i * sign);
  // Height: a build rises unless it hangs under a ceiling; a removal digs down from a top face, up from a ceiling, and is
  // centred on a side face.
  const ys = sideways ? (removal ? centred : outward(1)) : outward(grow(ny));
  const xs = sideways && alongX ? outward(grow(nx)) : centred;
  const zs = sideways && !alongX ? outward(grow(nz)) : centred;

  if (m === 'single' || n === 1) {
    push(cell.x, cell.y, cell.z);
  } else if (m === 'wall') {
    for (const dy of ny < -0.5 ? outward(-1) : outward(1)) push(cell.x, cell.y + dy, cell.z);
  } else if (m === 'floor') {
    for (const dx of xs) for (const dz of zs) push(cell.x + dx, cell.y, cell.z + dz);
  } else {
    for (const dx of xs) for (const dy of ys) for (const dz of zs) push(cell.x + dx, cell.y + dy, cell.z + dz);
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
