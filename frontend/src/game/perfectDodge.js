// perfectDodge.js — the PERFECT DODGE: the parry role, on the dodge verb players already have.
// Spec: docs/superpowers/specs/2026-09-23-crafty-perfect-dodge-design.md (EXTERNAL-BASELINE: "parry absent").
//
// A dodge pressed in the last PERFECT_WINDOW_MS of a nearby mob's windup is perfect: that mob's strike never lands,
// it is STAGGERED for STAGGER_MS of world time, and it takes RIPOSTE_MULT damage meanwhile. The 380 ms windup
// (game/attackTelegraph.js) was already the tell; this is what reading it well earns.
//
// Pure: the dodge start (Components.jsx) calls perfectDodgeTargets, the worker and the strike filter read
// isStaggered, CombatSystem.damageMob applies riposteDamage. All times are the WORLD clock (game/worldClock.js),
// the one the worker stamps windupUntil in — so a hitstop holds the window and the stagger alike.
import { VERTICAL_REACH } from './mobSenses.js';
import { HITSTOP } from './trauma.js';

/** The late part of the windup a dodge must land in: generous, for web input latency. */
export const PERFECT_WINDOW_MS = 220;
/** Horizontal reach of the check: covers the widest melee swing (moss_brute, 3.2). */
export const PERFECT_RANGE = 3.4;
/** How long a perfectly dodged mob stays staggered, world ms. */
export const STAGGER_MS = 1400;
/** Damage multiplier on a staggered mob — the riposte. */
export const RIPOSTE_MULT = 1.5;
/** The world freeze a perfect dodge lands with: the heavy tier, so the deflection has the weight of a hit. */
export const PERFECT_HITSTOP_MS = HITSTOP.heavy;

/** The mobs a dodge pressed at `now` perfectly answers: their strike is due within the window, and they can reach. */
export function perfectDodgeTargets(mobs, player, now) {
  const out = [];
  for (const m of mobs || []) {
    if (!m || m.passive || !(m.health > 0) || !(m.windupUntil > 0)) continue;
    const due = m.windupUntil - now;
    if (!(due > 0 && due <= PERFECT_WINDOW_MS)) continue;
    const dx = m.position.x - player.x, dz = m.position.z - player.z;
    if (Math.hypot(dx, dz) > PERFECT_RANGE) continue;
    if (Math.abs(m.position.y - player.y) > VERTICAL_REACH) continue;
    out.push(m);
  }
  return out;
}

/**
 * The dodge start's step (Components.jsx): stagger every mob this press perfectly answers and cancel the strike it
 * was winding up. Mutates their staggerUntil and windupUntil; returns them — empty is an ordinary dodge.
 */
export function applyPerfectDodge(mobs, player, now) {
  const targets = perfectDodgeTargets(mobs, player, now);
  for (const m of targets) {
    m.staggerUntil = now + STAGGER_MS;
    m.windupUntil = 0;
  }
  return targets;
}

/**
 * A staggered mob's pose at world time `now` (MobModel): knocked back, sagging, swaying side to side — so the
 * opening READS from across a fight. On the world clock, so a hitstop holds the sway too.
 */
export function staggerPose(now) {
  const sway = Math.sin(now * 0.012); // ~0.5 s a swing
  return { scaleXZ: 1.04, scaleY: 0.9, pitch: -0.28, roll: 0.25 * sway };
}

/** Is `e` staggered at world time `now`? */
export function isStaggered(e, now) {
  return !!e && e.staggerUntil > now;
}

/** Damage dealt to `e` at `now`: the riposte multiplier while it is staggered. */
export function riposteDamage(damage, e, now) {
  return isStaggered(e, now) ? damage * RIPOSTE_MULT : damage;
}

/**
 * The strikes from a worker reply that may still land. The reply was computed from a payload sent BEFORE the
 * player's dodge, so a mob the dodge just staggered can arrive with a strike already in it — drop that one.
 */
export function strikesToApply(attacks, entityById, now) {
  return (attacks || []).filter((a) => !isStaggered(entityById(a.id), now));
}
