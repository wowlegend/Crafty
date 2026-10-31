// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderHook, render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { useTreasureChests } from '../../src/QuestSystem.jsx';
import { Inventory } from '../../src/ui/GamePanels.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { GameMethods } from '../../src/GameMethods';
import { CHEST_LOOT } from '../../src/data/lootTables.js';
import { consumeEffect } from '../../src/game/consumables.js';

/**
 * THE XP A CHEST ITEM PAYS OVER ITS LIFE: the pickup every chest item pays, plus its own XP once, when it is Used
 * (DECISIONS 2026-10-31, lane L7; registry AUDIT:numeric:xp-token-pays-twice).
 *
 * A chest's XP tokens (Diamond, Star Fragment, Golden Crown) dropped carrying their own XP as the pickup's, and the bag's
 * Use paid it again: a Golden Crown was worth 400 XP, and the choice its design names, wear it or cash it in, cost
 * nothing. The ledger follows each CHEST_LOOT row through the real chest (useTreasureChests openChest, every row rolled)
 * to the drop it spawns, then through the real Inventory's Use; the pickup half is the drop's XP, which
 * systems/LootSystem.jsx grants as it is collected. Each item must pay the pickup a Health Potion pays (the reference: a
 * potion carries no XP of its own) plus what game/consumables.js declares for it on Use, and nothing more.
 *
 * WHAT THIS DOES NOT CHECK: LootSystem's collection itself (tests/gates/pools-with-lifetimes-gates.test.jsx counts what
 * a pickup grants), a mob kill's drops (their XP is the kill's, in LOOT_TABLES), a shrine chest's banking (the same
 * per-item pickup, granted at once).
 *
 * Mutation-Proof: see the commit trailer.
 */

let drops, granted;
beforeEach(() => {
  vi.useFakeTimers();
  drops = [];
  granted = [];
  useGameStore.setState({
    playerPosition: { x: 0, y: 60, z: 0 }, getMobGroundLevel: () => 64, addNotification: () => {},
    isAlive: true, playerHealth: 50, maxHealth: 100, mana: 50, maxMana: 100,
  });
  GameMethods.spawnLootDrop = (item, xp) => drops.push({ item, xp });
  GameMethods.grantXP = (xp, why) => granted.push({ xp, why });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete GameMethods.spawnLootDrop;
  delete GameMethods.grantXP;
});

describe('a chest item pays the chest\'s pickup, then its own XP once when Used', () => {
  it('every CHEST_LOOT row: the pickup a potion pays, plus the XP consumables.js declares for it, and no more', () => {
    // Every row rolled: the chest's draws all come up under every chance.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { result } = renderHook(() => useTreasureChests());
    const chest = result.current.chests[0];
    expect(chest, 'SETUP: the hook spawned no chest to open').toBeDefined();
    act(() => { result.current.openChest(chest.id); });
    expect(drops.map((d) => d.item).sort(), 'SETUP: the chest did not drop every row').toEqual(CHEST_LOOT.map((r) => r.item).sort());
    const pickupOf = Object.fromEntries(drops.map((d) => [d.item, d.xp]));
    const reference = pickupOf['Health Potion'];
    expect(reference, 'SETUP: a potion\'s pickup pays no XP, so the reference is empty').toBeGreaterThan(0);

    const ledger = {};
    for (const row of CHEST_LOOT) {
      cleanup();
      granted.length = 0;
      useGameStore.setState({ inventory: { blocks: { [row.item]: 1 }, tools: {}, magic: {} } });
      render(<Inventory onClose={() => {}} />);
      const use = screen.queryAllByRole('button', { name: /^use$/i });
      expect(use.length, `SETUP: the bag shows no Use for a ${row.item}`).toBe(1);
      fireEvent.click(use[0]);
      const onUse = granted.reduce((n, g) => n + g.xp, 0);
      ledger[row.item] = { pickup: pickupOf[row.item], onUse, life: pickupOf[row.item] + onUse };
    }
    const tokens = CHEST_LOOT.filter((r) => consumeEffect(r.item)?.xp > 0);
    expect(tokens.length, 'SETUP: the chest table holds no XP token').toBe(3);
    const expected = Object.fromEntries(CHEST_LOOT.map((r) => {
      const own = consumeEffect(r.item)?.xp || 0;
      return [r.item, { pickup: reference, onUse: own, life: reference + own }];
    }));
    expect(ledger, 'a chest item pays more or less over its life than the chest\'s pickup plus its own XP once').toEqual(expected);
  });
});
