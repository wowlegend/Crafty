// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { SAVE_VERSION, buildSaveData } from '../../src/game/saveSchema.js';
import { solveMeleeDamage, mitigateDamage } from '../../src/utils/combat.js';
import { getWeaponBaseDamage } from '../../src/game/equipment.js';
import { MOB_TYPES } from '../../src/game/mobTypes.js';

// HUNGER LEAVES THE GAME, AND SO DOES THE FOOD (W2-F step 6; plan row 8; DECISIONS 2026-10-29 items 70-74).
//
// W1-B deleted the drain and step 2 the HUD bar; this is the rest: the store field and every action that wrote or read
// it, and the five items whose only use was to fill it. THE RULE FOR AN OLD SAVE, stated here and in DECISIONS item 72:
//   - `hunger` was never written into a save by any build, so a save holding one under `progression` or `game_state`
//     holds an unknown key: the store never reads it, and the tombstone writes it back for one SAVE_VERSION.
//   - Meat (MEAT below) leaves every live bag and every chest on load and rides the tombstone back into the same
//     container for one SAVE_VERSION. Dropped, not credited: raw meat and rotten flesh only fed a meter that drained
//     nothing since W1-B, and cooked meat's one source left with the grid (step 5).
//
// WHAT THIS DOES NOT CHECK: the long session in the running game (tests/e2e/the-cut.spec.js), the loot tables and the
// registries (tests/gates/retired-items-no-source-gates.test.js), or the timers (tests/gates/pause-holds-timers-gates).

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(readFileSync(resolve(HERE, '../fixtures/pre-cut-save.json'), 'utf8'));
const POS = { position: { x: 0, y: 18, z: 0 } };
const S = () => useGameStore.getState();
const onDisk = () => JSON.parse(JSON.stringify(buildSaveData(S(), POS)));
const MEAT = ['Raw Porkchop', 'Raw Beef', 'Cooked Porkchop', 'Cooked Beef', 'Rotten Flesh'];
const HUNGER_ACTIONS = ['hunger', 'setHunger', 'consumeHunger', 'feedPlayer'];

/** The pre-cut fixture with hunger planted in both tombstone slices and all five meats in two bags and a chest. */
const fed = (version = FIXTURE.version) => {
  const f = structuredClone(FIXTURE);
  f.version = version;
  f.progression.hunger = 0;
  f.game_state.hunger = 7;
  f.player_data.inventory.blocks = { ...f.player_data.inventory.blocks, 'Raw Porkchop': 3, 'Cooked Beef': 2, 'Rotten Flesh': 5 };
  f.player_data.inventory.magic = { 'Raw Beef': 1, 'Cooked Porkchop': 4 };
  f.chests = [['4_17_2', { inventory: { 'Raw Beef': 6, stone: 3 } }], ['9_17_9', { inventory: { dirt: 2 } }]];
  return f;
};
const liveMeat = () => {
  const found = [];
  for (const [bag, items] of Object.entries(S().inventory)) for (const k of MEAT) if (items && k in items) found.push(`${bag}:${k}`);
  for (const [coords, chest] of S().chests) for (const k of MEAT) if (chest?.inventory && k in chest.inventory) found.push(`chest ${coords}:${k}`);
  return found;
};

let random;
beforeEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  useGameStore.setState({ isCaptureMode: false, _sessionWorldId: null });
  random = Math.random;
});
afterEach(() => { Math.random = random; });

describe('the store keeps no hunger', () => {
  it('a fresh store has no hunger field and no action that writes or reads one', () => {
    expect(typeof S().playerHealth, 'SETUP: the store did not initialise').toBe('number');
    expect(HUNGER_ACTIONS.filter((k) => k in S()), 'the store still carries hunger').toEqual([]);
  });

  it('a respawn refills health and mana and writes no hunger', () => {
    useGameStore.setState({ playerHealth: 0, mana: 0, isAlive: false });
    S().respawn();
    expect([S().playerHealth, S().mana, S().isAlive], 'SETUP: respawn no longer refills the player').toEqual([S().maxHealth, S().maxMana, true]);
    expect('hunger' in S(), 'respawn wrote a hunger field').toBe(false);
  });
});

describe('an old save holding hunger or food', () => {
  it('loads with no hunger in the store, health untouched, and no meat in any bag or chest', () => {
    S().loadWorldData(fed());
    expect(S().level, 'SETUP: the fixture did not load').toBe(5);
    expect(S().inventory.blocks.stone, 'SETUP: the fixture\'s blocks did not load').toBe(16);
    expect('hunger' in S(), 'the store adopted the save\'s hunger').toBe(false);
    expect(S().playerHealth, 'loading an empty stomach cost health').toBe(S().maxHealth);
    expect(liveMeat(), 'meat stayed in a live bag or chest').toEqual([]);
    expect(S().chests.get('4_17_2')?.inventory, 'a live item left the chest with the meat').toEqual({ stone: 3 });
  });

  it('writes the hunger keys and every meat back where the save held them (the tombstone, one SAVE_VERSION)', () => {
    S().loadWorldData(fed());
    const saved = onDisk();
    expect([saved.progression.hunger, saved.game_state.hunger], 'the held hunger keys did not reach the save').toEqual([0, 7]);
    const bags = saved.player_data.inventory;
    expect(MEAT.map((k) => bags.blocks[k] ?? bags.magic[k] ?? null), 'a held meat did not reach the save').toEqual([3, 1, 4, 2, 5]);
    expect(bags.blocks.stone, 'a live block was lost beside the held meat').toBe(16);
    expect(Object.fromEntries(saved.chests), 'a chest\'s held meat did not reach the save, or a live item was lost')
      .toEqual({ '4_17_2': { inventory: { 'Raw Beef': 6, stone: 3 } }, '9_17_9': { inventory: { dirt: 2 } } });
  });

  it('a save stamped older than SAVE_VERSION carries neither forward', () => {
    S().loadWorldData(fed(SAVE_VERSION - 1));
    expect(S().level, 'SETUP: the older save did not load').toBe(5);
    expect(liveMeat(), 'an older save put meat in a live bag or chest').toEqual([]);
    const saved = onDisk();
    expect('hunger' in saved.progression || 'hunger' in saved.game_state, 'an older save carried its hunger forward').toBe(false);
    expect(MEAT.filter((k) => k in saved.player_data.inventory.blocks), 'an older save carried its meat forward').toEqual([]);
  });

  it('the pre-cut fixture with food planted keeps its level and deals finite damage to a zombie', () => {
    S().loadWorldData(fed());
    const eff = S().getEffectiveAttributes();
    for (const roll of [0, 0.999]) {
      Math.random = () => roll;
      const hit = mitigateDamage({ armor: MOB_TYPES.zombie.armor || 0 }, solveMeleeDamage(eff, getWeaponBaseDamage(S().equipment?.weapon)).damage);
      expect(Number.isFinite(hit) && hit > 0, `the hit dealt ${hit}`).toBe(true);
    }
    expect(S().level).toBe(5);
  });
});
