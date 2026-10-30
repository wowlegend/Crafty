// dragonMoves.js — the Shadow Dragon's rules as a pure move machine (DECISIONS 2026-10-30 item 123). Imported only by
// render/BossEntity.jsx, so it ships in the dragon's lazy chunk.
//
// One move at a time, each with a windup on the WORLD clock (a hitstop holds it; it lands late, never early, never
// twice). stepDragon mutates the shared record (game/bossCombat.js) and returns what happened this step as events the
// component applies. Cooldowns are charged when a windup STARTS, so a move a perfect dodge cancelled does not re-arm
// before its cooldown. Only parryable windups write windupUntil (the perfect dodge reads it); the rest write castUntil.
import { attackPhase } from './attackTelegraph.js';
import { bossTierStats } from './bossTier.js';

/** The moves and their numbers. Tuned only with a DECISIONS entry. */
export const DRAGON_MOVES = Object.freeze({
  bite: Object.freeze({ windupMs: 520, reach: 5, cooldownMs: 2000, parryable: true, phases: Object.freeze([1, 2]) }),
  diveBite: Object.freeze({ windupMs: 520, reach: 5, cooldownMs: 6000, parryable: true, phases: Object.freeze([0]) }),
  fireball: Object.freeze({ windupMs: 600, cooldownMs: 2400, parryable: false, phases: Object.freeze([0]) }),
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
/** The roar's damage over the dragon's base hit, and its shove (today's impulse, render/BossEntity.jsx history). */
const ROAR_DAMAGE_MULT = 1.3;
const ROAR_PUSH = 36;
const ROAR_LIFT = 14;
/** The bite's arc on the ground, for its decal. */
const BITE_ARC = Math.PI / 2;

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

/** Whether `name` could land on the player now: in reach for a bite, inside the roar's falloff, and the player alive and
 *  not rolling through i-frames. The ranged and placed moves always go. */
function intent(name, rec, ctx) {
  if (name === 'bite' || name === 'diveBite') {
    if (!ctx.playerAlive || ctx.invincible) return false;
    return flat(rec, ctx.player) <= DRAGON_MOVES[name].reach && Math.abs(ctx.player.y - rec.position.y) <= BITE_REACH_Y;
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

function start(name, rec, ctx, now) {
  const m = DRAGON_MOVES[name];
  const until = now + m.windupMs;
  rec.move = name;
  if (m.parryable) { rec.windupUntil = until; rec.castUntil = 0; } else { rec.castUntil = until; rec.windupUntil = 0; }
  rec.cooldowns[name] = now + m.cooldownMs;
  const p = rec.position;
  const ev = { type: 'windup', move: name, until, at: { x: p.x, z: p.z } };
  if (name === 'bite' || name === 'diveBite') {
    ev.radius = m.reach;
    ev.arc = BITE_ARC;
    ev.heading = Math.atan2(ctx.player.x - p.x, ctx.player.z - p.z);
  } else if (name === 'roar' || name === 'summon') {
    ev.radius = m.radius;
  } else if (name === 'fireball' || name === 'lava') {
    ev.at = { x: ctx.player.x, z: ctx.player.z };
  }
  if (m.placeAtStart) return [ev, { type: 'lava', at: { x: ctx.player.x, z: ctx.player.z } }];
  return [ev];
}

function resolve(name, rec, ctx) {
  if (name === 'lava') return NO_EVENTS;
  if (name === 'fireball') return [{ type: 'launch', move: 'fireball' }];
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
 * nothing; (2) a windup in progress resolves when due (attackPhase: a strike only if the move can still land, else a
 * whiff), and one whose until a perfect dodge zeroed is over; (3) a free dragon starts the first move in PRIORITY it
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
    const phase = attackPhase(now, until, true, m.windupMs);
    if (phase.action === 'charge') return NO_EVENTS;
    rec.move = null; rec.windupUntil = 0; rec.castUntil = 0;
    return resolve(name, rec, ctx);
  }
  for (const name of PRIORITY) if (canStart(name, rec, ctx, now)) return start(name, rec, ctx, now);
  return NO_EVENTS;
}
