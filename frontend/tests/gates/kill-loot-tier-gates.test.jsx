// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuestSystem } from '../../src/QuestSystem';
import { useGameStore } from '../../src/store/useGameStore';
import { emitMobKill } from '../../src/game/mobKillBus';
import { GameMethods } from '../../src/GameMethods';
import { tierLootChance } from '../../src/game/lootTier';
import { LOOT_TABLES } from '../../src/QuestSystem';
import { getItemRarity } from '../../src/data/items';

/**
 * ONE FACT, ONE PREDICATE: WHERE DID THE MOB DIE? (AUDIT:numeric:kill-loot-tier-always-zero)
 *
 * The kill bus carries the position as an array [x, y, z] (game/mobKillBus.js; CombatSystem emits
 * `[entity.position.x, entity.position.y, entity.position.z]`). The loot roll read `position?.x` and `position?.z`, which
 * an array does not have, so every kill rolled at zone tier 0: "far from spawn drops rarer loot" (S7) never applied to a
 * mob kill, silently.
 *
 * This emits real kills on the real bus into the real useQuestSystem hook and reads what the roll pays. A zombie's Iron
 * Nugget (epic) drops with chance 0.3 x (1 + 0.25 x tier); with Math.random pinned just under and just over the
 * chance of the kill's own tier, the nugget drops exactly when the roll reads that tier. The positions put a large or
 * small y beside x and z, so reading the wrong array slot lands in another tier.
 *
 * NOT CHECKED: the emitter (CombatSystem's death path is closure-scoped; kill-attribution-gates pins its array shape),
 * and the ally and hazard sources (they bank no loot).
 *
 * Mutation-Proof: see the commit trailer.
 */

const NUGGET = LOOT_TABLES.zombie.find((r) => r.item === 'Iron Nugget');
const chanceAt = (tier) => tierLootChance(NUGGET.chance, getItemRarity('Iron Nugget'), tier);

// [x, y, z] and the tier its (x, z) ring is: 256 blocks a tier, capped at 4.
const KILLS = [
  { at: [10, 900, 10], tier: 0 },
  { at: [0, 800, 300], tier: 1 },
  { at: [-400, 900, -400], tier: 2 },
  { at: [-500, 3, 700], tier: 3 },
  { at: [900, 70, -1200], tier: 4 },
];

let drops;
let random;
beforeEach(() => {
  useGameStore.setState({ questState: { quests: [], completedQuestIds: [] } });
  drops = [];
  GameMethods.spawnLootDrop = (item) => { drops.push(item); };
  random = vi.spyOn(Math, 'random');
});
afterEach(() => { random.mockRestore(); delete GameMethods.spawnLootDrop; });

/** Does a zombie killed at `at` drop its Iron Nugget when the roll comes up `roll`? */
function nuggetDrops(at, roll) {
  random.mockReturnValue(roll);
  const { unmount } = renderHook(() => useQuestSystem());
  drops.length = 0;
  act(() => emitMobKill('zombie', at, 'player'));
  unmount();
  return drops.includes('Iron Nugget');
}

describe('a mob kill rolls its loot at the zone tier of where it died', () => {
  it('SETUP: the rolls straddle distinct chances, and the nugget is a row that the tier moves', () => {
    const chances = [0, 1, 2, 3, 4].map(chanceAt);
    for (let t = 1; t < chances.length; t++) expect(chances[t], `tier ${t} must beat tier ${t - 1}`).toBeGreaterThan(chances[t - 1]);
    expect(getItemRarity('Iron Nugget'), 'a common row does not move with the tier').not.toBe('common');
  });

  it.each(KILLS)('a kill at $at (tier $tier) drops just under its tier\'s chance and not just over it', ({ at, tier }) => {
    const c = chanceAt(tier);
    expect(nuggetDrops(at, c - 0.004), `tier ${tier}: a roll just under ${c} should pay the nugget`).toBe(true);
    expect(nuggetDrops(at, c + 0.004), `tier ${tier}: a roll just over ${c} should not`).toBe(false);
  });

  it('far out pays what near spawn does not: the same roll, one kill at spawn and one 1500 blocks away', () => {
    const roll = (chanceAt(0) + chanceAt(4)) / 2;
    expect(nuggetDrops([0, 70, 0], roll), 'at spawn').toBe(false);
    expect(nuggetDrops([900, 70, -1200], roll), 'far out').toBe(true);
  });
});
