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

const MAX_PHASE = BOSS_CONFIG.phases.length - 1;

/** A finite number or the fallback — junk from a hand-edited or truncated save must never become HP. */
const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

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
export function serializeBossState({ bossActive, bossHealth, bossDefeated } = {}) {
  return {
    health: num(bossHealth, BOSS_CONFIG.health),
    active: !!bossActive,
    defeated: !!bossDefeated,
  };
}

/**
 * Rebuild the encounter from a save. Ordered by precedence — each rule below can only tighten the one above
 * it, so the dangerous states are unreachable rather than merely unlikely.
 */
export function hydrateBossState(saved, { maxHealth = BOSS_CONFIG.health, gameWon = false } = {}) {
  const max = num(maxHealth, BOSS_CONFIG.health);
  const untouched = { active: false, health: max, defeated: false, phase: phaseForHealth(max, max) };

  // A won game outranks everything the save says about the boss. Without this, a payload carrying
  // active:true resurrects the dragon into a beaten game on every single load.
  if (gameWon) return { active: false, health: 0, defeated: true, phase: phaseForHealth(0, max) };

  // No boss block at all — a save written before this existed. "Not started", never a half-dead dragon.
  if (!saved || typeof saved !== 'object') return untouched;

  if (saved.defeated) return { active: false, health: 0, defeated: true, phase: phaseForHealth(0, max) };

  const health = Math.min(Math.max(num(saved.health, max), 0), max);

  // Dead by HP, yet no defeat and no win recorded. Reachable from the pre-B2h bug where a throwing reward
  // stranded the win. Restoring it as-is is a soft-lock — an enemy that cannot be killed because it is
  // already at zero. Marking it defeated is worse: it deletes the only remaining path to gameWon. So the
  // encounter resets and the player fights it again at the lair. A repeated fight beats an unwinnable save.
  if (health <= 0) return untouched;

  return { active: !!saved.active, health, defeated: false, phase: phaseForHealth(health, max) };
}
