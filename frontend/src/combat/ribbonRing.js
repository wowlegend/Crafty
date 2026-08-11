/**
 * ribbonRing.js — the swing-trail point history, as plain numbers in a fixed array.
 *
 * IT USED TO BE AN ARRAY OF OBJECTS REBUILT EVERY FRAME. Each swing frame pushed `{ tip, base, time }`
 * with two freshly-allocated (and freshly cloned) THREE.Vector3s, and the expiry ran `Array.filter`,
 * which builds a NEW array every frame whether or not anything expired — including on frames with no
 * swing at all, when the list is empty and there is nothing to do.
 *
 * A ring of six numbers per point (tip xyz, base xyz) plus a time has no allocation at all after the
 * first frame, and expiry becomes a shift of a small window rather than a rebuild.
 */

/** Trail life in seconds. Short on purpose: a long trail reads as a smear rather than an arc. */
export const TRAIL_LIFE_SEC = 0.14;

/** Capacity in POINT-PAIRS. At 0.14s of life this is ~2x what 120Hz can produce, so it cannot clip. */
export const TRAIL_CAPACITY = 40;

/** A fresh history. `count` is how many of the slots are live, oldest first. */
export function makeTrailRing(capacity = TRAIL_CAPACITY) {
  return {
    capacity,
    count: 0,
    tip: new Float32Array(capacity * 3),
    base: new Float32Array(capacity * 3),
    time: new Float32Array(capacity),
  };
}

/** Append one point-pair. At capacity the oldest is dropped, which is what the expiry would do anyway. */
export function pushTrailPoint(ring, tipVec, baseVec, time) {
  if (ring.count === ring.capacity) dropOldest(ring, 1);
  const i = ring.count++;
  ring.tip[i * 3] = tipVec.x; ring.tip[i * 3 + 1] = tipVec.y; ring.tip[i * 3 + 2] = tipVec.z;
  ring.base[i * 3] = baseVec.x; ring.base[i * 3 + 1] = baseVec.y; ring.base[i * 3 + 2] = baseVec.z;
  ring.time[i] = time;
  return ring;
}

function dropOldest(ring, n) {
  const keep = ring.count - n;
  if (keep <= 0) { ring.count = 0; return; }
  ring.tip.copyWithin(0, n * 3, ring.count * 3);
  ring.base.copyWithin(0, n * 3, ring.count * 3);
  ring.time.copyWithin(0, n, ring.count);
  ring.count = keep;
}

/**
 * Drop every point older than `life`. Points are appended in time order, so the expired ones are always a
 * PREFIX — no scan of the whole array and no rebuild.
 * @returns {number} how many were dropped
 */
export function dropExpiredTrailPoints(ring, now, life = TRAIL_LIFE_SEC) {
  let n = 0;
  while (n < ring.count && now - ring.time[n] >= life) n++;
  if (n > 0) dropOldest(ring, n);
  return n;
}
