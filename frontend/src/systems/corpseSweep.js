/**
 * corpseSweep.js — retiring a mob whose death dissolve has finished.
 *
 * WHY IT IS ITS OWN MODULE. The sweep used to sit INSIDE SpawnerSystem's `now - lastSpawnCheck >= 1000`
 * throttle, together with the distance cull and the spawn placement. So DEATH_DISSOLVE_MS -- 320ms, the
 * length of the dissolve animation -- became a corpse lifetime of 320 to 1320ms depending on where in the
 * spawn cycle the mob happened to die. For most of that window MobModel has the body scaled to 0.001,
 * i.e. an invisible entity sitting in mobsQuery: it occupied one of grass-bending's 8 bend slots, and it
 * was a candidate for every targeter that walks that query.
 *
 * The sweep is cheap and time-critical; the spawn check is expensive and periodic. They had no business
 * sharing a throttle. Splitting the sweep out is what lets the frame loop call it every frame.
 */

// Module-scope scratch. Removal during iteration is unsafe in miniplex, and the call site is a useFrame,
// so allocating a fresh array per frame to hold a list that is almost always EMPTY is exactly the
// per-frame garbage this codebase keeps finding in hot paths.
const _expired = [];

/**
 * Remove every entity whose dissolve has finished. Returns how many were removed, so a caller (or a
 * test) can assert on a number rather than on the absence of an effect.
 *
 * @param {Iterable} entities  the live query
 * @param {number} now         performance.now()
 * @param {(e:any)=>void} remove  ecs.remove
 */
export function sweepExpiredCorpses(entities, now, remove) {
  for (const e of entities || []) {
    if (e && e.dyingUntil && now >= e.dyingUntil) _expired.push(e);
  }
  const n = _expired.length;
  for (let i = 0; i < n; i++) remove(_expired[i]);
  _expired.length = 0;
  return n;
}
