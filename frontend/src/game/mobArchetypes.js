/**
 * mobArchetypes.js — per-type combat behaviour, so ten silhouettes stop playing identically (STATUS §E3).
 *
 * THE GAP. `ai.worker.js` branches on `type === 'skeleton'` (archery) and `type === 'spider'` (leap); every
 * other hostile falls through to one beeline-and-bonk arm. Of the seven hostiles in `MOB_TYPES`, **five**
 * — zombie, skitterling, duskhound, moss_brute, emberhusk — are behaviourally the same creature wearing
 * different meshes. STATUS §D2 put it exactly right: *the moss-brute looks like a tank and plays like a
 * zombie; the art has out-run the AI.*
 *
 * (STATUS §E3 said all ten share ONE tree. Verified against live code: there are THREE arms, and D2's
 * "3 AI brains" was the accurate line. The registry entry is corrected rather than repeated.)
 *
 * WHAT THIS IS. A data table, not a new behaviour tree. Every value here is a lever `ai.worker.js` ALREADY
 * reads — aggro radius, the de-aggro leash multiplier, melee reach, attack cooldown, vertical reach — moved
 * from module-scope constants to a per-type lookup. That keeps the change small and auditable, and it makes
 * the next archetype a table entry rather than another `else if`.
 *
 * THE SAFETY PROPERTY, which is what makes this shippable: **DEFAULTS REPRODUCE TODAY'S NUMBERS EXACTLY.**
 * A type with no entry below behaves precisely as it does now, so only the three named archetypes change.
 * `mobArchetypes.test.js` asserts each default against the literal the worker used, so a future edit cannot
 * quietly re-tune every mob in the game by touching one line here.
 *
 * BALANCE IS A TASTE CALL and these are defaults with a dial, surfaced to Kevin as FYI rather than a block
 * (charter §E). The three below are argued from each mob's OWN stats, not invented:
 *   - moss_brute  (220hp, speed 1.2, dmg 25) — the slowest, toughest, hardest-hitting mob in the game. It
 *     should read as a siege engine you cannot shake: a much longer leash so it keeps coming, longer reach
 *     for the size, and a slower swing so the damage is dodgeable rather than a DPS race.
 *   - skitterling (30hp, speed 3.8, dmg 5)  — a swarm chip-damage mob. Fast, tiny reach, rapid bites, and a
 *     SHORT leash so a swarm can actually be escaped instead of following you across the map.
 *   - duskhound   (70hp, speed 3.2, quad)   — a pack hunter. Wide aggro (it finds you) and a quick bite,
 *     but ordinary reach; the threat is being found and worried at, not raw damage.
 * zombie and emberhusk are deliberately LEFT AT DEFAULT. A baseline has to exist or "distinct" means
 * nothing — if every mob is special, none of them reads as special.
 *
 * Pure: no worker globals, no store, no Three.
 */

/** Exactly the constants `ai.worker.js` used before this table existed. Changing one re-tunes every mob. */
export const DEFAULT_ARCHETYPE = Object.freeze({
  aggroRange: 20,
  leashMult: 1.5, // de-aggro past aggroRange * leashMult
  meleeRange: 2.5,
  attackCooldown: 1500,
  verticalReach: 2.5,
});

export const ARCHETYPES = Object.freeze({
  // Relentless siege engine: it will not lose you, it reaches further, and it swings slowly enough to read.
  moss_brute: Object.freeze({ leashMult: 4.0, meleeRange: 3.2, attackCooldown: 2400, verticalReach: 3.2 }),
  // Swarmer: gets in your face fast, chips, and gives up if you actually break away.
  skitterling: Object.freeze({ aggroRange: 16, leashMult: 1.15, meleeRange: 1.8, attackCooldown: 700 }),
  // Pack hunter: finds you from a long way off and worries at you.
  duskhound: Object.freeze({ aggroRange: 28, leashMult: 2.0, attackCooldown: 950 }),
});

/**
 * The behaviour profile for a mob type. Unknown or absent types fall back to the defaults, so a new entry
 * in MOB_TYPES is never left without a profile — it simply plays as the baseline until someone designs it.
 */
export function archetypeFor(type) {
  return { ...DEFAULT_ARCHETYPE, ...(ARCHETYPES[type] ?? {}) };
}
