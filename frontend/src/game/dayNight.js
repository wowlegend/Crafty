// dayNight.js -- PURE day/night cycle math (no React / R3F / Three imports, node-testable).
//
// The store consumes `crossedHalfCycle` to flip `isDay` on a half-cycle BOUNDARY
// CROSSING (robust to any tick step + any resumed `gameTime`), replacing the old
// brittle exact-landing `gameTime % 600 === 0` check. `isDayAtUnit` derives the
// day/night phase straight from a `gameTime` value -- `loadWorldData` uses it to
// reconcile a restored save's `isDay` against its `gameTime` (so a resumed save is
// always phase-consistent). `shouldAdvanceClock` is the pure pause-gate decision the
// real-time ticker (useDayNightClock) evaluates each tick -- pure so it is exhaustively
// unit-testable, keeping the load-bearing determinism contract off a static-text gate.

/** Units of `gameTime` per half-cycle (one day half OR one night half). */
export const HALF_CYCLE_UNITS = 600;

/** Units of `gameTime` per FULL day+night cycle. */
export const CYCLE_UNITS = 1200;

/**
 * The ONE feel/balance knob (batched to Kevin): how many `gameTime` units the
 * real-time ticker advances per second. 4 units/s => HALF_CYCLE_UNITS / 4 = 150 s
 * per half => a 5-minute full cycle (2.5 min day / 2.5 min night). 600 % 4 === 0,
 * so integer landings still align on the boundary (the crossing-fix makes exact
 * landing unnecessary, but keeping the divisor clean is tidy). Kevin-tunable:
 * 8-min cozier ~= 2.5, 3-min frantic ~= 6.7.
 */
export const GAME_UNITS_PER_SECOND = 4;

/**
 * True iff advancing `gameTime` from `prevTime` to `nextTime` crosses a half-cycle
 * boundary (i.e. the floor(t / HALF) bucket index changed). Robust to any step
 * size and any non-aligned start value -- a multi-step jump that skips the exact
 * multiple still registers, and a save resumed at e.g. 437 still flips when a step
 * first lands at or past 600.
 * @param {number} prevTime
 * @param {number} nextTime
 * @returns {boolean}
 */
export function crossedHalfCycle(prevTime, nextTime) {
  return Math.floor(nextTime / HALF_CYCLE_UNITS) !== Math.floor(prevTime / HALF_CYCLE_UNITS);
}

/**
 * The day/night phase implied by a `gameTime` value: each successive half-cycle
 * bucket alternates, starting with day at t in [0, 600).
 * @param {number} t
 * @returns {boolean} true = day, false = night
 */
export function isDayAtUnit(t) {
  return Math.floor(t / HALF_CYCLE_UNITS) % 2 === 0;
}

/**
 * Pure pause-gate decision for the real-time day/night ticker: should `gameTime`
 * advance this tick? The clock advances ONLY when the world is built, input is live,
 * the player is not dead, and we are not in visual-capture mode. Extracted pure so the
 * load-bearing determinism + Game-Loop-Isolation contract is exhaustively unit-testable
 * (a guard inversion is caught by a behavioral test, not just a static source gate).
 * @param {{ isWorldBuilt?: boolean, active?: boolean, isAlive?: boolean, captureMode?: boolean }} g
 * @returns {boolean}
 */
export function shouldAdvanceClock({ isWorldBuilt, active, isAlive, captureMode } = {}) {
  return !!isWorldBuilt && !!active && isAlive !== false && !captureMode;
}

// --- M3b NIGHT SIEGE intensity ---------------------------------------------
//
// The calm day baseline: spawning holds up to DAY_MAX_MOBS with DAY_HOSTILE_CHANCE
// hostile bias at night (the pre-M3b literals 16 + 0.7). At night the siege ramps
// with nightCount (nights SURVIVED) -- more mobs, more hostile -- then plateaus at a
// cap so a long run stays bounded. Pure so the escalation contract is exhaustively
// unit-testable (off any static-text gate); the consumer (SimplifiedNPCSystem) reads
// store.nightCount and applies these ONLY at night, inside its capture guards.

/** Calm day baseline: max concurrent mobs (the pre-M3b literal). */
export const DAY_MAX_MOBS = 16;

/** Calm baseline: hostile-spawn bias at night-0 (the pre-M3b literal). */
export const DAY_HOSTILE_CHANCE = 0.7;

/** Per-night maxMobs ramp + its additive cap (so maxMobs caps at 16 + 24 = 40). */
export const SIEGE_MOBS_PER_NIGHT = 4;
export const SIEGE_MOBS_RAMP_CAP = 24;

/** Per-night hostileChance ramp + its absolute ceiling. */
export const SIEGE_HOSTILE_PER_NIGHT = 0.05;
export const SIEGE_HOSTILE_CAP = 0.95;

/**
 * Night-siege intensity as a PURE function of nightCount (nights survived). Ramps
 * monotonically and plateaus at a cap. nightCount 0 (and any nullish / negative /
 * NaN value) returns the calm day baseline, so a caller that hasn't survived a night
 * yet -- or reads a not-yet-initialized store field -- gets the gentle defaults.
 * Numbers are a Kevin-tunable feel/balance knob (KEVIN-REVIEW-BATCH).
 * @param {number} nightCount
 * @returns {{ hostileChance: number, maxMobs: number }}
 */
export function siegeParams(nightCount) {
  const n = Math.max(0, Math.floor(Number(nightCount) || 0));
  const maxMobs = DAY_MAX_MOBS + Math.min(n * SIEGE_MOBS_PER_NIGHT, SIEGE_MOBS_RAMP_CAP);
  const hostileChance = Math.min(DAY_HOSTILE_CHANCE + n * SIEGE_HOSTILE_PER_NIGHT, SIEGE_HOSTILE_CAP);
  return { hostileChance, maxMobs };
}

/**
 * The nightfall warning message, NUMBERED + tiered by nightCount, so the siege has a readable ladder
 * (which night am I on? how bad is it now?) + a survival score. The intensity actually ramps via
 * siegeParams; this surfaces it. A nullish / <=0 / NaN night clamps to night 1 (never "Night 0").
 * @param {number} nightCount
 * @returns {string}
 */
export function siegeWarning(nightCount) {
  const n = Math.max(1, Math.floor(Number(nightCount) || 0) || 1);
  const phrase = n <= 1 ? 'the first siege begins'
    : n <= 2 ? 'the horde presses harder'
    : n <= 4 ? 'the siege intensifies'
    : n <= 6 ? 'a ferocious siege descends'
    : 'a relentless siege howls';
  return `Night ${n} — ${phrase}. Hold until dawn!`;
}

// --- M3b SURVIVE-TO-DAWN reward --------------------------------------------
//
// Survive a night -> a reward that scales with the night survived: bonus XP, coins,
// AND one guaranteed loot drop whose rarity climbs by night tier. Pure so the
// reward-math contract is exhaustively unit-testable; the store action
// grantDawnReward wires it to grantXP + addCoins + addToInventory. Magnitudes +
// tier thresholds are a Kevin-tunable feel/balance knob (KEVIN-REVIEW-BATCH).

/** Bonus XP per night survived (reward = this * nightNumber). */
export const DAWN_XP_PER_NIGHT = 50;

/** Coins per night survived (reward = this * nightNumber). */
export const DAWN_COINS_PER_NIGHT = 10;

// The guaranteed loot item per rarity tier. Picked as a fixed, registry-consistent
// representative of each tier (verified by tests/data/loot-characterization.test.js:
// Health Potion=rare, Emerald=epic, Diamond=legendary) so the drop is deterministic.
const DAWN_LOOT_BY_RARITY = {
  rare: 'Health Potion',
  epic: 'Emerald',
  legendary: 'Diamond',
};

/**
 * The rarity tier of the guaranteed dawn loot drop, climbing by night:
 * nights 1-2 -> rare, 3-4 -> epic, 5+ -> legendary (plateau at the top tier).
 * @param {number} nightNumber (>= 1)
 * @returns {'rare'|'epic'|'legendary'}
 */
function dawnLootRarity(nightNumber) {
  if (nightNumber >= 5) return 'legendary';
  if (nightNumber >= 3) return 'epic';
  return 'rare';
}

/**
 * Survive-to-dawn reward as a PURE function of the night survived. XP + coins scale
 * linearly; one guaranteed loot item is chosen from a rarity tier that climbs by
 * night. A nullish / <= 0 / NaN night clamps to night 1 (never a zero/negative
 * reward). Returns a descriptor the caller renders into a toast.
 * @param {number} nightNumber
 * @returns {{ xp: number, coins: number, lootRarity: string, lootItem: string, night: number }}
 */
export function dawnReward(nightNumber) {
  const n = Math.max(1, Math.floor(Number(nightNumber) || 0) || 1);
  const lootRarity = dawnLootRarity(n);
  return {
    night: n,
    xp: DAWN_XP_PER_NIGHT * n,
    coins: DAWN_COINS_PER_NIGHT * n,
    lootRarity,
    lootItem: DAWN_LOOT_BY_RARITY[lootRarity],
  };
}
