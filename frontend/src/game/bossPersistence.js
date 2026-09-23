/**
 * bossPersistence.js — the Shadow Dragon encounter survives a reload (A-bis B2g).
 *
 * THE BUG. `useBossSystem` held the whole encounter in React state — `useState(BOSS_CONFIG.health)`. Nothing
 * about the fight reached the save, so a reload during the boss fight handed the dragon back **every point of
 * health the player had taken off it**. 700 HP, a multi-phase encounter billed as the climax of the run, and
 * a refresh silently reset it. The only piece that already persisted was `gameWon` (S9c), which stops a SLAIN
 * dragon respawning — it says nothing about a fight in progress.
 *
 * WHAT IS PERSISTED, AND WHAT DELIBERATELY IS NOT. Health, active and defeated are irreducible. **Phase is
 * not** — `bossSystem` derives it from `hpPercent` against `BOSS_CONFIG.phases`, so writing it to disk would
 * create a second source for one fact, free to drift from the health beside it. It is re-derived here instead,
 * through `phaseForHealth`, which is the SAME function the hook now uses. One derivation, two callers.
 *
 * WHY THE PHASE IS STILL PART OF HYDRATION. The hook's phase effect ANNOUNCES a change
 * (`PHASE 3: ENRAGED!`). Restoring a fight at 17% HP with the phase left at its initial 0 makes that effect
 * fire on load and announce a transition the player passed before they quit. So hydration seeds the phase the
 * health implies, and the effect sees nothing to announce.
 *
 * Pure: no React, no store, no Three. Same contract as `saveSchema.js`, which consumes it.
 */
import { BOSS_CONFIG } from './bossConfig.js';
import { bossTierStats } from './bossTier.js';

const MAX_PHASE = BOSS_CONFIG.phases.length - 1;

/** A finite number or the fallback — junk from a hand-edited or truncated save must never become HP. */
const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
/** A non-negative integer or the fallback (tier, kill night). */
const nat = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback);

/**
 * The phase index for a given health, read off the config thresholds — the single derivation shared by the
 * hook's phase effect and the rehydrate. Total: any input lands inside [0, phases-1] rather than returning
 * undefined and rendering a boss with no phase colour.
 */
export function phaseForHealth(health, maxHealth) {
  const max = num(maxHealth, 0);
  if (max <= 0) return 0; // a zero max would make every percent Infinity or NaN
  const pct = num(health, max) / max;
  if (Number.isNaN(pct)) return 0;
  for (let i = MAX_PHASE; i >= 0; i--) {
    if (pct <= BOSS_CONFIG.phases[i].hpPercent) return i;
  }
  return 0;
}

/**
 * The save payload for the encounter. Health is coerced here rather than at load, because a NaN survives
 * `JSON.stringify` as `null` and comes back as a boss with no health at all.
 */
export function serializeBossState({ bossActive, bossHealth, bossDefeated, bossTier, bossKillNight, nightCount } = {}) {
  const tier = nat(bossTier, 0);
  return {
    health: num(bossHealth, bossTierStats(tier).health),
    active: !!bossActive,
    defeated: !!bossDefeated,
    tier, // QUEUE C3: dragons slain so far — the next fight's strength
    // The night of the last kill — the return cadence counts from it. A junk value is written as TONIGHT, the
    // rule hydrate applies too: writing 0 (a valid night) would make a slain dragon due at once (QUEUE R4.4).
    killNight: nat(bossKillNight, tier >= 1 ? nat(nightCount, 0) : 0),
  };
}

/**
 * Rebuild the encounter from a save. Ordered by precedence — each rule below can only tighten the one above
 * it, so the dangerous states are unreachable rather than merely unlikely.
 *
 * TIERS (QUEUE C3). A save written before tiers existed carries no `tier`: it hydrates exactly as it always
 * did, and a won one reads as ONE kill with its return counted from tonight (`nightCount`). A tiered save is
 * trusted — a won game can hold a live RETURN fight — and every fight is sized from its tier's max health.
 */
export function hydrateBossState(saved, { maxHealth, gameWon = false, nightCount = 0 } = {}) {
  const tiered = !!saved && typeof saved === 'object' && typeof saved.tier === 'number' && Number.isFinite(saved.tier);
  let tier = tiered ? nat(saved.tier, 0) : (gameWon || saved?.defeated ? 1 : 0);
  if (gameWon && tier < 1) tier = 1; // a won game has slain at least one dragon
  // A kill night the save cannot vouch for (pre-tier, or corrupt) counts the return from tonight.
  const tonight = tier >= 1 ? nat(nightCount, 0) : 0;
  const killNight = tiered ? nat(saved.killNight, tonight) : tonight;
  const max = num(maxHealth, bossTierStats(tier).health);
  const untouched = { active: false, health: max, defeated: false, phase: phaseForHealth(max, max), tier, killNight };
  const slain = { active: false, health: 0, defeated: true, phase: phaseForHealth(0, max), tier, killNight };

  // A won save that cannot show a slain tier — pre-tier, or a tier of 0, which no kill ever writes — outranks
  // everything it says about the boss. Without this, a payload carrying active:true resurrects the dragon
  // into a beaten game on every single load. Only a tiered save with tier >= 1 may hold a live return fight.
  if (gameWon && (!tiered || nat(saved.tier, 0) < 1)) return slain;

  // No boss block at all — a save written before this existed. "Not started", never a half-dead dragon.
  if (!saved || typeof saved !== 'object') return untouched;

  if (saved.defeated) return slain;

  const health = Math.min(Math.max(num(saved.health, max), 0), max);

  // Dead by HP, yet no defeat and no win recorded. Reachable from the pre-B2h bug where a throwing reward
  // stranded the win. Restoring it as-is is a soft-lock — an enemy that cannot be killed because it is
  // already at zero. Marking it defeated is worse: it deletes the only remaining path to gameWon. So the
  // encounter resets and the player fights it again at the lair. A repeated fight beats an unwinnable save.
  if (health <= 0) return untouched;

  return { active: !!saved.active, health, defeated: false, phase: phaseForHealth(health, max), tier, killNight };
}
