// hurl.js — S2-B2-M3: the PURE hurl/slam core (twin of enemyProjectiles.js — no React/Three/
// Rapier/store, node-testable, gate-clean). Mobs are COLLIDER-LESS, so impact is proximity math
// over the caller's mob snapshot, never physics contacts. The hit event carries pos + normalized
// flight dir — the seam M4's base-as-anvil wall ray consumes (this module stays wall-agnostic).
import { MAX_FRAME_STEP_SEC } from './frameStep.js';

export const HURL_SPEED = 22;        // m/s along camera-forward (M2 stand-in ballpark)
const HURL_LIFT = 2;          // small initial vy lift -> readable arc (module-internal)
const HURL_GRAVITY = 9;       // mild pull-down (full 30 reads like a brick) (module-internal)
export const HURL_TTL_SEC = 1.5;     // max flight
export const HURL_HIT_RADIUS = 1.4;  // 0.85 cube + mob body
export const HURL_DAMAGE = 30;       // base; element type re-skins via damageMob's spark switch
export const HURL_KNOCK = 12;        // entity.knockback magnitude (leap precedent = 15)
export const SLAM_RADIUS = 3;        // AoE around the phantom's orbit point
export const SLAM_DAMAGE_MULT = 1.3;

export function makeHurl(origin, dir) {
  return {
    position: { x: origin.x, y: origin.y, z: origin.z },
    velocity: { x: dir.x * HURL_SPEED, y: dir.y * HURL_SPEED + HURL_LIFT, z: dir.z * HURL_SPEED },
    age: 0,
  };
}

/** Advance one frame. Returns { done, hit: { id, pos, dir } | null }. Mutates h in place (GLI). */
export function stepHurl(h, dt, mobs) {
  h.velocity.y -= HURL_GRAVITY * dt;
  h.position.x += h.velocity.x * dt;
  h.position.y += h.velocity.y * dt;
  h.position.z += h.velocity.z * dt;
  h.age += dt;

  let nearest = null;
  let nearestD = HURL_HIT_RADIUS;
  for (const m of mobs) {
    const dx = m.position.x - h.position.x;
    const dy = m.position.y - h.position.y;
    const dz = m.position.z - h.position.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < nearestD) { nearestD = d; nearest = m; }
  }
  if (nearest) {
    const vmag = Math.hypot(h.velocity.x, h.velocity.y, h.velocity.z) || 1;
    return {
      done: true,
      hit: {
        id: nearest.id,
        pos: { x: h.position.x, y: h.position.y, z: h.position.z },
        dir: { x: h.velocity.x / vmag, y: h.velocity.y / vmag, z: h.velocity.z / vmag },
      },
    };
  }
  return { done: h.age >= HURL_TTL_SEC, hit: null };
}

const HURL_MAX_STEP_SEC = 0.05;  // 1.1m/substep at HURL_SPEED < HIT_RADIUS -> no tunneling (module-internal)
const HURL_FRAME_CAP_SEC = MAX_FRAME_STEP_SEC; // the world's one frame step (game/frameStep.js)

/**
 * Frame-spike-safe stepping: integrates in substeps of ≤ HURL_MAX_STEP_SEC so a long frame
 * (chunk re-mesh hitch, headless stall — observed dt=0.50s tunneled 11m through a 1.4m radius)
 * can never skip past a mob. The frame's dt is capped at HURL_FRAME_CAP_SEC (the flight slows
 * under a multi-second stall instead of teleporting). Returns the first terminal result.
 */
export function stepHurlChunked(h, dt, mobs) {
  let remaining = Math.min(dt, HURL_FRAME_CAP_SEC);
  let r = { done: false, hit: null };
  while (remaining > 1e-9 && !r.done) {
    const step = Math.min(remaining, HURL_MAX_STEP_SEC);
    r = stepHurl(h, step, mobs);
    remaining -= step;
  }
  return r;
}

export const ANVIL_RANGE = 3; // wall within this along the hurl line past the impact
export const ANVIL_MULT = 3;  // total damage multiplier (spec §3e — "rewards day-building directly")

/** Base-as-anvil: castRay(origin, dir, maxToi) -> {toi}|null (the caller binds the real Rapier
 *  ray, range-capped at ANVIL_RANGE). Pure decision; the gold label + wall flash are M7 look. */
export function resolveAnvil(castRay, hit) {
  const r = castRay(hit.pos, hit.dir, ANVIL_RANGE);
  return r && r.toi <= ANVIL_RANGE ? ANVIL_MULT : 1;
}

/** SLAM: radial horizontal knock events for mobs within radius of the orbit point. */
export function resolveSlam(center, mobs, radius = SLAM_RADIUS) {
  const events = [];
  for (const m of mobs) {
    const dx = m.position.x - center.x;
    const dy = m.position.y - center.y;
    const dz = m.position.z - center.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > radius) continue;
    const hmag = Math.hypot(dx, dz);
    // directly-under fallback: push +x (deterministic, finite)
    const dir = hmag > 1e-6 ? { x: dx / hmag, y: 0, z: dz / hmag } : { x: 1, y: 0, z: 0 };
    events.push({ id: m.id, dir });
  }
  return events;
}

/**
 * Turn a hurl request into a live flight, unconditionally. The channel nulls its slot on read and the producer has
 * already spent the grab's ember and let go of the block, so a request the consumer declined would be a paid throw
 * that never flew. It takes no current-flight argument, so declining is not a decision the consumer can make.
 */
export function adoptHurlRequest(req) {
  if (!req || !req.origin || !req.dir) return null;
  return { h: makeHurl(req.origin, req.dir), color: req.color || '#A9966E' };
}

/**
 * The most blocks in the air at once: the HurlSystem's mesh pool. A grab holds at most three blocks (Twin Grasp and
 * Lodestone each add one, game/verbMods.js grabThrows) and throws them as fast as the player clicks, and the next grab
 * commits GRAB_COOLDOWN_SEC + GRAB_CHARGE_SEC after the last throw, inside one HURL_TTL_SEC flight, so two grabs' blocks
 * can be up together. hurl.test.js derives that bound from the trees and the relics.
 */
export const MAX_FLIGHTS = 6;

/**
 * The pool slot a new flight takes: a free one, else the one flying longest. A flight ages on the world clock and the
 * grab's cooldown and charge on R3F's, which runs through a hitstop and a pause, so pausing between grabs can fill the
 * pool; then the oldest block leaves and the paid throw still flies.
 */
export function flightSlot(slots) {
  let oldest = 0;
  for (let i = 0; i < slots.length; i++) {
    if (!slots[i]) return i;
    if (slots[i].h.age > slots[oldest].h.age) oldest = i;
  }
  return oldest;
}
