/**
 * hurtFeel.js — being HIT has to land, not just tint the screen (STATUS §E-ter).
 *
 * THE GAP. `damagePlayer` set `damageFlash`, `screenShake` and `lastHitDir`, and stopped there. Hitstop —
 * the brief freeze-frame that makes a blow read as an impact — existed ONLY for outgoing hits (the boss
 * kill sets `hitstopUntil`, and `trauma.js` ships a whole weight-tiered HITSTOP table for it). Incoming
 * damage got none of it, and `cameraKick.js` had profiles for melee/cast/slam/land but none for being hurt.
 * So the player's own swings had weight and the enemies' did not: *enemies don't feel dangerous.*
 *
 * That mattered more after B4 and E3 landed. Mobs can now actually reach you (they could previously hit
 * through 200 blocks of rock, which is a different problem), and a moss brute now behaves like a siege
 * engine — but a brute's 25-damage blow still landed with exactly the same feedback as a skitterling's 5.
 *
 * TIERED BY WHAT THE HIT COST YOU, not by a flat constant. The outgoing table already grades light / heavy /
 * crit, and reusing it keeps one vocabulary for impact across both directions — a player learns "long freeze
 * = big hit" once. The thresholds are fractions of MAX health rather than absolute damage, so the same blow
 * reads as devastating at level 1 and survivable at level 20, which is what the numbers actually mean.
 *
 * Pure: no store, no React, no Three. Every value is a function of its arguments.
 */
import { HITSTOP } from './trauma.js';

/** Fractions of max health at which an incoming hit escalates a tier. Taste calls, veto-able. */
export const HURT_TIERS = Object.freeze({ heavy: 0.12, crit: 0.25 });

/**
 * Freeze duration in ms for an incoming hit, from the damage actually taken (post-mitigation) and the
 * player's max health.
 *
 * Returns 0 for a hit that took nothing: a fully-mitigated or zero blow must not freeze the game, or armour
 * would paradoxically make the screen stutter more as it absorbed more. Non-finite or negative input reads
 * as no hit rather than throwing inside the damage path.
 */
export function hurtStopMs(damage, maxHealth) {
  const d = Number(damage);
  const max = Number(maxHealth);
  if (!Number.isFinite(d) || d <= 0) return 0;
  if (!Number.isFinite(max) || max <= 0) return HITSTOP.light; // unknown scale: still register the hit
  const frac = d / max;
  if (frac >= HURT_TIERS.crit) return HITSTOP.crit;
  if (frac >= HURT_TIERS.heavy) return HITSTOP.heavy;
  return HITSTOP.light;
}

/**
 * Did a NEW hit arrive since we last looked?
 *
 * The store stamps `lastHitDir = { angle, t }` on every hit it accepts, so the timestamp is the hit signal.
 * The camera lives in the per-frame Player controller, which cannot subscribe reactively without breaking
 * Game-Loop-Isolation — it polls. This is the edge detector that turns "the current value" into "something
 * happened", so one hit produces exactly one camera kick rather than one per frame for as long as the
 * stamp keeps its value.
 */
export function isNewHit(seenT, hit) {
  const t = hit && Number(hit.t);
  return Number.isFinite(t) && t > 0 && t !== seenT;
}
