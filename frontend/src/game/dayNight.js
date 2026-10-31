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
 * THE day-length knob: real seconds per full day+night cycle. 480 s puts a fresh profile's first dusk at 4:00 of play
 * and its first dawn at 8:00, so the First Night (one dusk, one siege, one golden dawn) fits ten minutes with the first
 * minute in front of it; 300 s brought night at 2:30, before a new player could light a Hearth. DECISIONS 2026-10-28
 * item 21 holds the measurements.
 */
export const DAY_LENGTH_SECONDS = 480;

/**
 * `gameTime` units the real-time ticker advances per second, derived from the day length. What reads game units (the
 * day and night halves, the dusk warning, the sky, the sun's shadow steps) moves with the day length; what runs on real
 * time does not. The spawner checks once a real second (systems/SpawnerSystem.jsx), so a longer night holds the siege at
 * its mob cap for longer in real time: 240 s a night at 480 s a day, against 150 s at 300 s. Rebalancing the siege for
 * that is W3-A's. HALF_CYCLE_UNITS divides by it (240 ticks a half), so a tick lands exactly on each dusk and dawn.
 */
export const GAME_UNITS_PER_SECOND = CYCLE_UNITS / DAY_LENGTH_SECONDS;

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
 * True iff advancing `gameTime` from `prevTime` to `nextTime` crosses a half-cycle boundary INTO a night
 * half. This is the single canonical "a real nightfall occurred" signal — a genuine clock ADVANCE, as
 * distinct from a load or dev time-jump that sets the phase DIRECTLY (loadWorldData via isDayAtUnit,
 * setTimeOfDay). The siege night-count (nightCount) bumps on THIS, never on a raw `isDay` edge — a reactive
 * isDay-edge watcher cannot tell a genuine crossing from a load, which is how resuming a night save silently
 * ratcheted the siege one extra night per reload (B2f).
 * @param {number} prevTime
 * @param {number} nextTime
 * @returns {boolean}
 */
export function crossedIntoNight(prevTime, nextTime) {
  return crossedHalfCycle(prevTime, nextTime) && !isDayAtUnit(nextTime);
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
 * the player is not dead, the page is not hidden, and we are not in visual-capture mode. Extracted pure so the
 * load-bearing determinism + Game-Loop-Isolation contract is exhaustively unit-testable
 * (a guard inversion is caught by a behavioral test, not just a static source gate).
 * The page's visibility is its own guard because on touch nothing drops the input gate when a page is switched away
 * from: a hidden tab's clock ran on, and each tick scheduled a save that refused the visible tab's (DECISIONS
 * 2026-10-31 item 331).
 * @param {{ isWorldBuilt?: boolean, active?: boolean, isAlive?: boolean, captureMode?: boolean, hidden?: boolean }} g
 * @returns {boolean}
 */
export function shouldAdvanceClock({ isWorldBuilt, active, isAlive, captureMode, hidden } = {}) {
  return !!isWorldBuilt && !!active && isAlive !== false && !captureMode && !hidden;
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

/** Per-night maxMobs ramp + its additive cap. The night ramp alone caps maxMobs at 16 + 24 = 40; the
 *  S7 zone-tier term below is ADDITIVE on top (up to +8), so the TRUE ceiling is 48. */
// Module-internal constants (consumed by siegeParams below; not imported elsewhere — un-exported 2026-06-20 knip pass).
const SIEGE_MOBS_PER_NIGHT = 4;
const SIEGE_MOBS_RAMP_CAP = 24;

/** Per-night hostileChance ramp + its absolute ceiling. */
const SIEGE_HOSTILE_PER_NIGHT = 0.05;
const SIEGE_HOSTILE_CAP = 0.95;

/** S7 distance zone-tier ramp: the Ember-Frontier far-from-spawn zone ADDS mobs + hostility even by DAY,
 * so walking outward is a deliberate risk. ADDITIVE on top of the night ramp; capped so totals stay bounded.
 * Numbers are a Kevin-tunable feel/balance knob (KEVIN-REVIEW-BATCH). */
const SIEGE_MOBS_PER_TIER = 2;        // additive mobs per zone tier
const SIEGE_MOBS_TIER_CAP = 8;        // tier-bonus cap (= MAX_TIER 4 * SIEGE_MOBS_PER_TIER)
const SIEGE_HOSTILE_PER_TIER = 0.04;  // additive hostile bias per zone tier
const SIEGE_HOSTILE_TIER_CAP = 0.98;  // absolute ceiling incl. tier (above the night-only 0.95 cap)

/**
 * Night-siege intensity as a PURE function of nightCount (nights survived) AND the player's distance
 * zone-tier (S7 Ember Frontier). Ramps monotonically and plateaus at caps. nightCount 0 + zoneTier 0
 * (and any nullish / negative / NaN value) returns the calm day baseline, so a caller that hasn't
 * survived a night yet -- or reads a not-yet-initialized store field -- gets the gentle defaults.
 * The zoneTier term is ADDITIVE on top of the night term: far-from-spawn is dangerous even by day.
 * `siegeParams(n, 0)` is byte-identical to the legacy 1-arg form (no regression near spawn).
 * Numbers are a Kevin-tunable feel/balance knob (KEVIN-REVIEW-BATCH).
 * @param {number} nightCount
 * @param {number} [zoneTier=0] distance zone-tier 0..MAX_TIER (see world/zoneTier.js)
 * @returns {{ hostileChance: number, maxMobs: number }}
 */
export function siegeParams(nightCount, zoneTier = 0) {
  const n = Math.max(0, Math.floor(Number(nightCount) || 0));
  const z = Math.max(0, Math.floor(Number(zoneTier) || 0));
  const tierMobs = Math.min(z * SIEGE_MOBS_PER_TIER, SIEGE_MOBS_TIER_CAP);
  const maxMobs = DAY_MAX_MOBS + Math.min(n * SIEGE_MOBS_PER_NIGHT, SIEGE_MOBS_RAMP_CAP) + tierMobs;
  const baseHostile = Math.min(DAY_HOSTILE_CHANCE + n * SIEGE_HOSTILE_PER_NIGHT, SIEGE_HOSTILE_CAP);
  const hostileChance = Math.min(baseHostile + z * SIEGE_HOSTILE_PER_TIER, SIEGE_HOSTILE_TIER_CAP);
  return { hostileChance, maxMobs };
}

/**
 * The nightfall notice, NUMBERED + tiered by nightCount, so the siege has a readable ladder (which night am I on? how bad
 * is it now?) + a survival score. The intensity actually ramps via siegeParams; this surfaces it. A nullish / <=0 / NaN
 * night clamps to night 1 (never "Night 0"). A dictionary key and its vars, for the notification channel
 * (ui/notifications.js), so it reads in the player's language when it shows.
 * @param {number} nightCount
 * @returns {{ key: string, vars: { n: number } }}
 */
const SIEGE_TIERS = Object.freeze([
  [1, 'notice.siege.first'], [2, 'notice.siege.harder'], [4, 'notice.siege.intensifies'], [6, 'notice.siege.ferocious'],
  [Infinity, 'notice.siege.relentless'],
]);

export function siegeWarning(nightCount) {
  const n = Math.max(1, Math.floor(Number(nightCount) || 0) || 1);
  return { key: SIEGE_TIERS.find(([upTo]) => n <= upTo)[1], vars: { n } };
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

/**
 * A 24h TIME OF DAY fraction (0 = midnight, 0.25 = dawn, 0.5 = noon, 0.75 = dusk) -> a `gameTime` on the
 * clock's own DAWN-origin scale, where [0, 600) is day.
 *
 * The two origins are the whole reason this exists. setTimeOfDay carried its own day window of
 * [0.25, 0.75) -- correct for a midnight origin -- while isDayAtUnit says [0, 0.5) on a dawn origin. Both
 * were internally coherent and they disagreed by a quarter cycle, so setTimeOfDay(0.5) wrote gameTime 600
 * with isDay TRUE while every other reader of 600 says night. Converting once here leaves exactly one
 * opinion about which half is day: isDayAtUnit's.
 */
export function gameTimeForTimeOfDay(t) {
  const n = Number(t);
  const frac = Number.isFinite(n) ? ((n % 1) + 1) % 1 : 0;
  const fromDawn = ((frac - 0.25) + 1) % 1; // midnight-origin -> dawn-origin
  return Math.round(fromDawn * CYCLE_UNITS) % CYCLE_UNITS;
}
