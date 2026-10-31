// dragonMoves.js — the Shadow Dragon's rules as a pure move machine (DECISIONS 2026-10-30 item 123). Imported only by
// render/BossEntity.jsx, so it ships in the dragon's lazy chunk.
//
// One move at a time, each with a windup on the WORLD clock (a hitstop holds it; it lands late, never early, never
// twice). stepDragon mutates the shared record (game/bossCombat.js) and returns what happened this step as events the
// component applies. Cooldowns are charged when a windup STARTS, so a move a perfect dodge cancelled does not re-arm
// before its cooldown. Only parryable windups write windupUntil (the perfect dodge reads it); the rest write castUntil.
//
// A windup COMMITS ITS AIM: where the player stood when it began (aimX/aimY/aimZ on the record) and the heading to them
// (aimHeading). The dragon faces that heading through the windup, its ground decal is drawn from it
// (render/dragonTelegraphs.js), and the move resolves against it: the bite lands only inside its arc, the fireball bursts
// only on its mark. A decal that showed one place while the move landed on another would teach the player the wrong
// dodge.
import { bossTierStats } from './bossTier.js';

/** The moves and their numbers. Tuned only with a DECISIONS entry. */
export const DRAGON_MOVES = Object.freeze({
  // `arc`: the bite lands in this turn about its committed heading, within `reach` of the dragon.
  bite: Object.freeze({ windupMs: 520, reach: 5, arc: Math.PI / 2, cooldownMs: 2000, parryable: true, phases: Object.freeze([1, 2]) }),
  diveBite: Object.freeze({ windupMs: 520, reach: 5, arc: Math.PI / 2, cooldownMs: 6000, parryable: true, phases: Object.freeze([0]) }),
  // The fireball flies at `speed` m/s to its mark and bursts there: it hits a player within `radius` of the mark's
  // centre on the ground and within `reachY` of the height it was aimed at (a jump does not clear it, a pillar does).
  fireball: Object.freeze({ windupMs: 600, radius: 1.6, reachY: 2, speed: 16, cooldownMs: 2400, parryable: false, phases: Object.freeze([0]) }),
  roar: Object.freeze({ windupMs: 900, radius: 9, cooldownMs: 4200, parryable: false, phases: Object.freeze([1]) }),
  // 750 = the lava zone's own forming ring (render/BossEntity.jsx LAVA_WINDUP_MS): the zone is placed when the move
  // starts, so its ring is the one warning, and the cast only holds every other move off while it forms.
  lava: Object.freeze({ windupMs: 750, cooldownMs: 5200, parryable: false, phases: Object.freeze([2]), placeAtStart: true }),
  summon: Object.freeze({ windupMs: 700, radius: 7, cooldownMs: 8500, parryable: false, phases: Object.freeze([2]) }),
});

/** The moves every tier has; a tier's tricks (game/bossTier.js) are the rest it knows. */
export const CORE_MOVES = Object.freeze(['diveBite', 'bite', 'roar']);

/** The order a free dragon picks its next move in. */
const PRIORITY = Object.freeze(['diveBite', 'bite', 'roar', 'lava', 'summon', 'fireball']);

/** How far above or below the dragon a bite still reaches (it bites what is in front of its jaw, not under its belly in
 *  flight). */
const BITE_REACH_Y = 3.5;
/** The roar's damage over the dragon's base hit, and its shove: the horizontal and vertical velocity it adds to the
 *  player's knockback (Components.jsx), scaled by roarFalloff(d). (36, 14) is the impulse the roar gave before the dragon
 *  rework, kept so the shove did not change (plans/2026-10-27-crafty-shadow-dragon.md). */
const ROAR_DAMAGE_MULT = 1.3;
const ROAR_PUSH = 36;
const ROAR_LIFT = 14;
/** How far over the aimed-at feet the fireball bursts: the height of a standing player's chest. */
export const FIREBALL_BURST_UP = 1.1;

/** The roar's strength at `d` metres: 1 at the dragon, falling linearly to 0.4 at its radius, and 0 beyond. The roar's
 *  range is defined only here: its intent and its start both read roarFalloff(d) > 0. */
export function roarFalloff(d) {
  const r = DRAGON_MOVES.roar.radius;
  if (!(d <= r)) return 0;
  return 1 - 0.6 * (Math.max(0, d) / r);
}

const TRICKS = new Map();
/** The tricks a tier knows, read once per tier (bossTierStats builds a fresh stats object each call). */
function tricksOf(tier) {
  let t = TRICKS.get(tier);
  if (!t) { t = Object.freeze([...bossTierStats(tier).tricks]); TRICKS.set(tier, t); }
  return t;
}

/** The context a step reads, written into `out` (a frame loop hands the same object every frame). */
export function dragonCtx({ bossTier, phase, player, playerAlive, invincible, groundY, damage }, out = {}) {
  out.phase = phase;
  out.tricks = tricksOf(bossTier);
  out.player = player;
  out.playerAlive = playerAlive;
  out.invincible = invincible;
  out.groundY = groundY;
  out.damage = damage;
  return out;
}

const NO_EVENTS = Object.freeze([]);

const flat = (rec, p) => Math.hypot(p.x - rec.position.x, p.z - rec.position.z);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Whether a bite (`name`: 'bite' or 'diveBite') winding up on `rec` lands on a player standing at `p`: within its reach
 *  of the dragon on the ground, inside its arc about the heading the windup committed, and within BITE_REACH_Y of the
 *  dragon's height. */
export function biteLands(name, rec, p) {
  const m = DRAGON_MOVES[name];
  const d = flat(rec, p);
  if (!(d <= m.reach) || Math.abs(p.y - rec.position.y) > BITE_REACH_Y) return false;
  if (d < 1e-6) return true;
  return Math.abs(wrapAngle(Math.atan2(p.x - rec.position.x, p.z - rec.position.z) - rec.aimHeading)) <= m.arc / 2;
}

/** Whether a fireball aimed at `at` (the feet it aimed at) hits a player standing at `p` when it bursts. */
export function fireballLands(at, p) {
  const m = DRAGON_MOVES.fireball;
  return Math.hypot(p.x - at.x, p.z - at.z) <= m.radius && Math.abs(p.y - at.y) <= m.reachY;
}

/** Whether `name` could land on the player now: inside its arc for a bite, inside the roar's falloff, and the player
 *  alive and not rolling through i-frames. The ranged and placed moves always go. */
function intent(name, rec, ctx) {
  if (name === 'bite' || name === 'diveBite') {
    if (!ctx.playerAlive || ctx.invincible) return false;
    return biteLands(name, rec, ctx.player);
  }
  if (name === 'roar') return ctx.playerAlive && !ctx.invincible && roarFalloff(flat(rec, ctx.player)) > 0;
  return true;
}

/** Whether a free dragon may START `name` now: its phase, a move it knows, off cooldown, and (for a bite or the roar)
 *  the player in reach. The i-frames do not hold a start back; they decide the strike. */
function canStart(name, rec, ctx, now) {
  const m = DRAGON_MOVES[name];
  if (!m.phases.includes(ctx.phase)) return false;
  if (!CORE_MOVES.includes(name) && !ctx.tricks.includes(name)) return false;
  if (now < (rec.cooldowns[name] || 0)) return false;
  if (name === 'bite' || name === 'diveBite') {
    return flat(rec, ctx.player) <= m.reach && Math.abs(ctx.player.y - rec.position.y) <= BITE_REACH_Y;
  }
  if (name === 'roar') return roarFalloff(flat(rec, ctx.player)) > 0;
  return true;
}

/**
 * Wind `name` up on `rec`, due at `until`, aimed at `aim` ({ x, y, z }: the feet it aims at): the record's move, its
 * windup or cast end, and its committed aim, without charging a cooldown. Returns the windup event, which carries what
 * the decal shows: the bite and dive-bite their reach, arc and heading, the roar and the summons their radius on the
 * dragon, the fireball its mark (`at`) and the radius it hits within, the lava where it is placed. The machine's start
 * and the e2e's planted moves both wind up through here, so a planted move shows the decal a real one does.
 */
export function windUp(name, rec, aim, until) {
  const m = DRAGON_MOVES[name];
  rec.move = name;
  if (m.parryable) { rec.windupUntil = until; rec.castUntil = 0; } else { rec.castUntil = until; rec.windupUntil = 0; }
  const p = rec.position;
  rec.aimX = aim.x; rec.aimY = aim.y; rec.aimZ = aim.z;
  rec.aimHeading = Math.atan2(aim.x - p.x, aim.z - p.z);
  const ev = { type: 'windup', move: name, until, at: { x: p.x, z: p.z } };
  if (name === 'bite' || name === 'diveBite') {
    ev.radius = m.reach;
    ev.arc = m.arc;
    ev.heading = rec.aimHeading;
  } else if (name === 'roar' || name === 'summon') {
    ev.radius = m.radius;
  } else if (name === 'fireball') {
    ev.at = { x: aim.x, z: aim.z };
    ev.radius = m.radius;
  } else if (name === 'lava') {
    ev.at = { x: aim.x, z: aim.z };
  }
  return ev;
}

function start(name, rec, ctx, now) {
  const m = DRAGON_MOVES[name];
  rec.cooldowns[name] = now + m.cooldownMs;
  const ev = windUp(name, rec, ctx.player, now + m.windupMs);
  if (m.placeAtStart) return [ev, { type: 'lava', at: { x: ctx.player.x, z: ctx.player.z } }];
  return [ev];
}

/**
 * The way the dragon faces this frame, from its `toPlayer` and its flight `path` offsets ({ x, z }): through a windup the
 * heading the windup committed, so its glowing head points along its decal; pinned, the player; otherwise its path.
 * null keeps the last facing (a vector too short to read).
 */
export function dragonYaw(rec, toPlayerX, toPlayerZ, pathX, pathZ) {
  if (rec.move) return rec.aimHeading;
  const x = rec.pinned ? toPlayerX : pathX;
  const z = rec.pinned ? toPlayerZ : pathZ;
  return Math.hypot(x, z) > 0.1 ? Math.atan2(x, z) : null;
}

/** A fireball from `from` ({ x, y, z }, the dragon's mouth) to FIREBALL_BURST_UP over `at`, its mark, written into
 *  `out`: where it is, its direction, the metres left to its burst, and its mark. */
export function launchFireball(from, at, out = {}) {
  const dx = at.x - from.x, dy = at.y + FIREBALL_BURST_UP - from.y, dz = at.z - from.z;
  const len = Math.hypot(dx, dy, dz);
  out.x = from.x; out.y = from.y; out.z = from.z;
  out.dx = len > 0 ? dx / len : 0; out.dy = len > 0 ? dy / len : 0; out.dz = len > 0 ? dz / len : 0;
  out.left = len;
  out.at = at;
  return out;
}

/** Advance a launched fireball `dt` seconds toward its mark: 'flying' until it arrives, then 'hit' when the player
 *  stands at `p` on its mark (fireballLands), else 'miss'. It bursts on its mark and nowhere on the way. */
export function stepFireball(f, dt, p) {
  const step = Math.min(DRAGON_MOVES.fireball.speed * dt, f.left);
  f.x += f.dx * step; f.y += f.dy * step; f.z += f.dz * step;
  f.left -= step;
  if (f.left > 1e-9) return 'flying';
  return fireballLands(f.at, p) ? 'hit' : 'miss';
}

function resolve(name, rec, ctx) {
  if (name === 'lava') return NO_EVENTS;
  if (name === 'fireball') return [{ type: 'launch', move: 'fireball', at: { x: rec.aimX, y: rec.aimY, z: rec.aimZ } }];
  if (name === 'summon') {
    // Either side of the dragon, across its line to the player.
    const p = rec.position;
    const a = Math.atan2(ctx.player.z - p.z, ctx.player.x - p.x) + Math.PI / 2;
    const r = DRAGON_MOVES.summon.radius;
    return [{ type: 'summon', at: [{ x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r }, { x: p.x - Math.cos(a) * r, z: p.z - Math.sin(a) * r }] }];
  }
  if (!intent(name, rec, ctx)) return [{ type: 'whiff', move: name }];
  if (name === 'roar') {
    const d = flat(rec, ctx.player);
    const f = roarFalloff(d);
    const nx = d > 1e-6 ? (ctx.player.x - rec.position.x) / d : 1;
    const nz = d > 1e-6 ? (ctx.player.z - rec.position.z) / d : 0;
    return [{ type: 'strike', move: 'roar', damage: ctx.damage * ROAR_DAMAGE_MULT * f,
      knockback: { x: nx * ROAR_PUSH * f, y: ROAR_LIFT * f, z: nz * ROAR_PUSH * f } }];
  }
  return [{ type: 'strike', move: name, damage: ctx.damage, knockback: null }];
}

/**
 * One step of the dragon at world time `now`: (1) staggered or knocked down, it cancels what it wound up and starts
 * nothing; (2) a windup in progress resolves when due (a strike only if the move can still land on its committed aim,
 * else a whiff), and one whose until a perfect dodge zeroed is over; (3) a free dragon starts the first move in PRIORITY it
 * can. Throws a TypeError when ctx.tricks is not a list, so a missing list fails loudly rather than disarming the
 * fireball, the lava and the summons.
 */
export function stepDragon(rec, ctx, now) {
  if (!Array.isArray(ctx.tricks)) throw new TypeError(`stepDragon: ctx.tricks must be a list of moves, got ${JSON.stringify(ctx.tricks)}`);
  if (rec.staggerUntil > now || rec.knockdownUntil > now) {
    rec.move = null; rec.windupUntil = 0; rec.castUntil = 0;
    return NO_EVENTS;
  }
  if (rec.move) {
    const name = rec.move;
    const m = DRAGON_MOVES[name];
    const until = m.parryable ? rec.windupUntil : rec.castUntil;
    if (!(until > 0)) { rec.move = null; rec.windupUntil = 0; rec.castUntil = 0; return NO_EVENTS; }
    if (now < until) return NO_EVENTS;
    rec.move = null; rec.windupUntil = 0; rec.castUntil = 0;
    return resolve(name, rec, ctx);
  }
  for (const name of PRIORITY) if (canStart(name, rec, ctx, now)) return start(name, rec, ctx, now);
  return NO_EVENTS;
}
