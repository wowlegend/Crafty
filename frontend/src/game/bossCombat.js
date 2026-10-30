// bossCombat.js — the Shadow Dragon's one combat record, in the boot chunk (DECISIONS 2026-10-30 items 123-125).
//
// The dragon's code is a lazy chunk (render/dragonLoader.js), but the dodge start (Components.jsx), the melee cone,
// damageBoss (world/bossSystem.js) and the systems that hit mobs must read the dragon before that chunk has ever
// loaded. So the record lives here, duck-typed like a mob (id, passive, health, position, windupUntil, staggerUntil),
// and the move machine (game/dragonMoves.js) MUTATES it, as applyPerfectDodge mutates mobs: one source of truth, so a
// perfect dodge that zeroes windupUntil between frames is the cancel. Read transiently; React never subscribes to it.
import { STAGGER_MS, riposteDamage } from './perfectDodge.js';
import { isPlayerSource } from '../combat/damageSource.js';
import { isPointInCone } from '../combat/cone.js';
import { worldNow } from './worldClock.js';

/** The dragon's id wherever an entity id is expected (CombatSystem.damageMob routes it to damageBoss). */
export const BOSS_TARGET_ID = 'shadow-dragon';
/** How far the dragon's body reaches from its centre, for the hit tests that treat a mob as a point (its torso is
 *  3 x 2 x 4 m, render/BossEntity.jsx). */
export const BOSS_BODY_RADIUS = 1.6;
/** Heavies that must land inside one chained stagger to knock it down, how long it stays down, and how long it then
 *  cannot be staggered (no stunlock). */
export const KNOCKDOWN_HEAVIES = 3;
export const KNOCKDOWN_MS = 3000;
export const RECOVER_IMMUNE_MS = 4000;

const point = () => ({ x: 0, y: 0, z: 0 });

/** A clean record: no fight, no move, nothing staggered. */
export function createBossCombat() {
  return {
    id: BOSS_TARGET_ID,
    active: false,
    passive: false,
    health: 0,
    bodyRadius: BOSS_BODY_RADIUS,
    // Higher over its ground than a ground fighter reaches (render/BossEntity.jsx writes it every frame).
    airborne: false,
    position: point(),
    // Head, chest, hips: where the melee cone looks for it.
    hitPoints: [point(), point(), point()],
    move: null,
    // Parryable windups only (the perfect dodge reads it); every other windup is castUntil.
    windupUntil: 0,
    castUntil: 0,
    staggerUntil: 0,
    knockdownUntil: 0,
    immuneUntil: 0,
    heavyChain: 0,
    cooldowns: {},
    // A test seam: the flight takes no step while it is set, so a planted move resolves at a known distance.
    pinned: false,
  };
}

/** Put `rec` back to createBossCombat()'s values IN PLACE, so every reader that holds it sees the reset. */
export function resetBossCombat(rec) {
  const fresh = createBossCombat();
  for (const k of Object.keys(fresh)) {
    if (k === 'position') Object.assign(rec.position, fresh.position);
    else if (k === 'hitPoints') rec.hitPoints.forEach((p, i) => Object.assign(p, fresh.hitPoints[i] ?? point()));
    else rec[k] = fresh[k];
  }
  return rec;
}

/** The game's record: render/BossEntity.jsx writes it every frame of a fight and resets it when it unmounts. */
export const bossCombat = createBossCombat();

const fighting = (rec) => rec.active && rec.health > 0;

/** The perfect dodge's targets: `mobs`, with the dragon appended while it fights and is not immune to a stagger. A new
 *  array, built only at a dodge's start. */
export function withBossTarget(mobs, rec = bossCombat, now = worldNow()) {
  if (!fighting(rec) || now < rec.immuneUntil) return mobs;
  return [...mobs, rec];
}

const _targets = [];
/**
 * The systems that hit mobs (hurl and its slam, the element zones, the squad) read the dragon beside them: `mobs` with
 * the record appended while it fights. One module array, refilled per call, so a 15 Hz tick allocates nothing; a caller
 * uses it before the next call. `groundOnly`: zones paint the ground and allies fight on foot, so they reach the dragon
 * only when it is not airborne.
 */
export function bossTargets(mobs, rec = bossCombat, { groundOnly = false } = {}) {
  if (!fighting(rec) || (groundOnly && rec.airborne)) return mobs;
  _targets.length = 0;
  for (let i = 0; i < mobs.length; i++) _targets.push(mobs[i]);
  _targets.push(rec);
  return _targets;
}

/**
 * A heavy that lands on the dragon: on a staggered dragon it chains, refreshing the stagger to STAGGER_MS, and the
 * KNOCKDOWN_HEAVIES-th knocks it down for KNOCKDOWN_MS (the stagger held as long, so the riposte applies), then it is
 * immune to a stagger for RECOVER_IMMUNE_MS. A heavy cannot be thrown sooner than 700 ms after its press
 * (game/heavyAttack.js), so three inside one 1400 ms stagger is impossible; the refresh is what makes a rhythm of about
 * one a second reach the knockdown, and a lapsed stagger resets the chain.
 */
export function registerBossHeavy(rec, now) {
  if (rec.knockdownUntil > now) return 'ignored';
  if (!(rec.staggerUntil > now)) { rec.heavyChain = 0; return 'ignored'; }
  rec.heavyChain += 1;
  rec.staggerUntil = now + STAGGER_MS;
  if (rec.heavyChain >= KNOCKDOWN_HEAVIES) {
    rec.knockdownUntil = now + KNOCKDOWN_MS;
    rec.staggerUntil = rec.knockdownUntil;
    rec.immuneUntil = rec.knockdownUntil + RECOVER_IMMUNE_MS;
    rec.heavyChain = 0;
    return 'knockdown';
  }
  return 'chained';
}

/** Does a melee cone reach the dragon? Its head, chest or hips (the body is longer than the swing), else its centre
 *  while no hit points are written. */
export function bossHitByCone(rec, origin, dir, range, angleRad) {
  if (rec.hitPoints.length === 0) return isPointInCone(origin, dir, rec.position, range, angleRad);
  for (const p of rec.hitPoints) if (isPointInCone(origin, dir, p, range, angleRad)) return true;
  return false;
}

/** The damage the dragon takes: the riposte multiplier on the player's damage while it is staggered, as a mob's
 *  (systems/CombatSystem.jsx); an ally's or a hazard's hit is never a riposte. */
export function bossDamage(amount, source, rec, now) {
  return isPlayerSource(source) ? riposteDamage(amount, rec, now) : amount;
}
