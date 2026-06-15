# Gameplay POINT — S7 Distance Zone-Tier Scalar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans.
> Steps use checkbox (`- [ ]`). First slice of the "give the game a POINT" half (Ember Frontier).

**Goal:** Make the OUTWARD JOURNEY mean something — distance from spawn (origin 0,0) defines a `zoneTier`
(Valheim-style concentric rings) that ramps DANGER and REWARD, so walking far is a deliberate risk/reward
choice instead of aimless wandering. (The world already LOOKS good post visual-milestones; this gives the
wandering a point.)

**Architecture:** a pure `zoneTier(worldX, worldZ)` kernel (distance -> integer tier 0..MAX, capped) that
existing systems CONSUME. No new AI, no new persistence, no re-mesh. Consumers wired one slice at a time.

**Tech Stack:** pure JS kernel + unit test; zustand store reads (transient `.getState()` in the game loop).

---

## Naming (collision check — done)
`tier` is ALREADY used in the codebase for QUEST tiers (`QuestSystem.jsx` quests have `tier: 1/2/3` = unlock
gating). So the world-zone scalar is named **`zoneTier`** to avoid confusion. Do NOT call it `tier`.

## Live-code grounding (read-before-architect — done)
- **Distance:** there is no ready `distanceFromOrigin`; compute `Math.hypot(playerX, playerZ)` from the player
  rigid-body position on demand. (`distanceTraveled` in the store is a cumulative ODOMETER, NOT radial distance.)
- **Siege/danger:** `game/dayNight.js` `siegeParams(nightCount)` -> `{maxMobs, hostileChance}` (DAY_MAX_MOBS 16,
  +4/night cap 40; DAY_HOSTILE_CHANCE 0.7). Consumed in `SimplifiedNPCSystem.jsx` (~L105/188) at spawn time.
- **Loot:** `data/lootTables.js` `LOOT_TABLES[mobType]` -> rows `{item, chance, xp}`; dropped via
  `GameMethods.spawnLootDrop(item, xp, position)` (QuestSystem.jsx ~L253/697). Per-item rarity = `getItemRarity`.
- **Biome:** `world/biomeTable.js` `pickBiome(temperature, moisture, continent)` (pure) — BUT the terrain WORKER
  (`terrain.worker.js`) selects biome independently for generation; changing biome-by-distance is INVASIVE
  (worker + climate.js mirror + changes the generated world) -> DEFERRED to a later optional slice.

---

## Slice 1 — Pure `zoneTier` kernel + red-first test

- [ ] **Step 1.1 — Write the failing test** `frontend/tests/world/zoneTier.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { zoneTier, TIER_RING, MAX_TIER } from '../../src/world/zoneTier.js';
describe('zoneTier — concentric distance rings from origin', () => {
  it('spawn (origin) is tier 0', () => { expect(zoneTier(0, 0)).toBe(0); });
  it('rings step at multiples of TIER_RING (radial, not per-axis)', () => {
    expect(zoneTier(TIER_RING - 1, 0)).toBe(0);
    expect(zoneTier(TIER_RING + 1, 0)).toBe(1);
    expect(zoneTier(0, TIER_RING * 2 + 5)).toBe(2);
  });
  it('uses radial distance (hypot), not axis sum', () => {
    // a point at (TIER_RING*0.8, TIER_RING*0.8) has radius ~1.13*TIER_RING -> tier 1
    expect(zoneTier(TIER_RING * 0.8, TIER_RING * 0.8)).toBe(1);
  });
  it('is monotonic non-decreasing with distance', () => {
    let prev = -1;
    for (let d = 0; d < TIER_RING * (MAX_TIER + 3); d += 37) {
      const t = zoneTier(d, 0);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });
  it('caps at MAX_TIER far out (danger/reward plateaus)', () => {
    expect(zoneTier(99999, 99999)).toBe(MAX_TIER);
  });
});
```
- [ ] **Step 1.2 — Run -> RED** (`zoneTier.js` missing).
- [ ] **Step 1.3 — Implement** `frontend/src/world/zoneTier.js`:
```js
// Distance zone-tier (Ember Frontier): the outward journey gains stakes. Radial distance from spawn
// (origin 0,0) -> an integer tier 0..MAX_TIER in concentric rings. Pure (no state) -> unit-testable +
// capture-deterministic (capture is at origin = tier 0, so it never shifts the visual baselines).
// Named zoneTier (NOT `tier`) because the codebase already uses `tier` for QUEST unlock tiers.
export const TIER_RING = 256; // blocks of radius per tier (tunable; explorer quest's 500 ~= tier 1-2)
export const MAX_TIER = 4;    // tiers 0..4; far-out danger/reward plateaus here
export function zoneTier(worldX, worldZ) {
  const dist = Math.hypot(worldX, worldZ);
  return Math.min(MAX_TIER, Math.floor(dist / TIER_RING));
}
```
- [ ] **Step 1.4 — Run -> GREEN.** build clean; `npx vitest run` grows. NO render change (kernel unused yet) -> gate 20/20, NO capture. Commit slice 1.

## Slice 2 — Wire `zoneTier` into the SIEGE / danger ramp (the RISK side)

The payoff: far from spawn = more + more-hostile mobs (even by day), so the frontier feels dangerous.
- [ ] In `game/dayNight.js`, extend `siegeParams` to accept an optional `zoneTier` (default 0) that ADDS to
  the mob ramp + hostile bias (e.g. `maxMobs += SIEGE_MOBS_PER_NIGHT/2 * zoneTier` capped; `hostileChance`
  nudged up per tier, clamped <= 0.98). Keep `siegeParams(n)` (1-arg) BYTE-behaviour at zoneTier 0 (no
  regression). Red-first a test pinning: `siegeParams(0,0)` === current; higher tier raises maxMobs/hostile, capped.
- [ ] In `SimplifiedNPCSystem.jsx` spawn path (~L105/188), compute `zoneTier(playerX, playerZ)` from the
  player position (transient `.getState()` read — Game-Loop-Isolation) and pass it to `siegeParams`.
- [ ] VERIFY: build clean; unit grows; the spawn logic is capture-gated already (`isCaptureMode()` early-returns
  in the spawn loop) so NO visual change -> gate 20/20. Commit slice 2.

## Slice 3 — Wire `zoneTier` into LOOT rarity (the REWARD side)

The payoff: far from spawn = better drops, so the risk pays off.
- [ ] Add a pure helper (in `data/lootTables.js` or a new `game/lootTier.js`) `tierRarityBonus(zoneTier)` ->
  a small additive drop-rarity-upgrade probability (e.g. each tier adds ~12% chance to bump a drop one rarity
  step), unit-tested (0 at tier 0; rising; clamped). Apply it where `spawnLootDrop` is called (QuestSystem.jsx
  ~L253) using the kill position's `zoneTier`. Keep tier-0 behaviour identical.
- [ ] VERIFY: build clean; unit grows; no capture-frame change (drops are runtime, not in baselines) -> gate 20/20. Commit slice 3.

## Slice 4 — (DEFERRED / optional) biome roster by distance
INVASIVE (terrain worker + climate.js mirror + changes generated world). NOT needed for the risk/reward loop;
the world already has noise biome variety. Revisit only if the journey still reads same-y after S8 shrines.

## Notes / Self-Review
- **No new AI / persistence / re-mesh** — zoneTier is a pure read; consumers are existing spawn/loot paths.
- **Capture-deterministic:** capture is pinned at origin (tier 0) so zoneTier changes nothing in the baselines;
  consumers are already capture-gated (spawn loop early-returns; loot is runtime). Expect gate 20/20 throughout.
- **Game-Loop-Isolation:** read player position via transient `.getState()` in the spawn path, never via reactive state.
- **DRY:** one `zoneTier` kernel; consumers import it. **Naming:** zoneTier, never `tier` (quest-tier collision).
- **STUCK:** if a consumer wiring regresses behaviour at tier 0 (a test catches it) -> revert that slice, keep the kernel.
