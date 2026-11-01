// lights.js — the First Night's lights, pure (W3-A task script, unit L1): the lit Hearth, the placed lanterns and the
// shrines W3-B relights. One home for the three rules that read them: no natural hostile spawns within the ward of a
// light, a fall rises at the lit light nearest it, and the siege marches on the lit light nearest the player when one is
// in reach, else on the player. Derived on every call from the store's own fields, never saved: a lantern's state is its
// block, the Hearth's is hearthLit and its flame.
import { HEARTH_BRAZIER } from '../world/homeAnchor.js';

/** The ward's radius, metres: no natural hostile spawns within it of a lit light (the lantern brief's R). */
export const WARD_RADIUS_M = 16;
/** How near the player a lit light must be for the siege to march on it rather than on the player, metres. */
export const OBJECTIVE_REACH_M = 32;

/**
 * The lit lights, [{ kind, x, z }]: the Hearth at its brazier while it is lit with flame above 0, each placed lantern at
 * its cell's centre, and each of `shrines` (W3-B fills them from litShrines, as world positions).
 * @param {{ hearthLit?: boolean, hearthFlame?: number, lanterns?: ReadonlyArray<{x: number, z: number}> }} state the store's
 * @param {ReadonlyArray<{x: number, z: number}>} [shrines]
 */
export function litLights({ hearthLit, hearthFlame, lanterns }, shrines = []) {
  const out = [];
  if (hearthLit === true && hearthFlame > 0) out.push({ kind: 'hearth', x: HEARTH_BRAZIER.x, z: HEARTH_BRAZIER.z });
  for (const c of lanterns || []) out.push({ kind: 'lantern', x: c.x + 0.5, z: c.z + 0.5 });
  for (const s of shrines) out.push({ kind: 'shrine', x: s.x, z: s.z });
  return out;
}

const d2 = (x, z, l) => (l.x - x) ** 2 + (l.z - z) ** 2;

/** Is (x, z) within `r` metres of a light? Squared distances against r squared. */
export function isWarded(x, z, lights, r = WARD_RADIUS_M) {
  return lights.some((l) => d2(x, z, l) <= r * r);
}

/** The light nearest (x, z), or null when there is none. */
export function nearestLit(x, z, lights) {
  let best = null;
  let bestD = Infinity;
  for (const l of lights) {
    const d = d2(x, z, l);
    if (d < bestD) { best = l; bestD = d; }
  }
  return best;
}

/** What the siege marches on: the lit light nearest the player when it is within `reach`, else the player. */
export function objectiveFor(player, lights, reach = OBJECTIVE_REACH_M) {
  const near = nearestLit(player.x, player.z, lights);
  return near && d2(player.x, player.z, near) <= reach * reach ? near : { kind: 'player', x: player.x, z: player.z };
}
