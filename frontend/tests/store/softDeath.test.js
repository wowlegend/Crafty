// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { foldVerbMods } from '../../src/game/verbMods.js';

// M3b-T4: LOCK soft death (Kevin's decision = the EXISTING behavior, no penalty).
// This is a CHARACTERIZATION test: damage the player to death via damagePlayer, then
// respawn(), and assert that level / currentXP / totalXP / talents / equipment (the relic too) /
// inventory / coins are UNCHANGED -- only playerHealth / mana are restored and
// isAlive flips back true. It locks the soft-death CONTRACT so a future change can't
// silently add a death penalty (the test would go red). No production change expected.

const KNOWN = {
  level: 7,
  currentXP: 42,
  totalXP: 1337,
  equipment: { head: 'Iron Helmet', chest: null, boots: null, weapon: 'Diamond Sword', offhand: 'Iron Shield', relic: 'Ember Fang' },
  talentPoints: 3,
  unlockedTalents: { wildheart_roar: 1, wildheart_endurance: 2, voidhand_grasp: 1 },
  coins: 250,
  inventory: { blocks: { grass: 64, 'Iron Sword': 1, Emerald: 5, Lodestone: 1 }, tools: { pickaxe: 1 }, magic: {} },
};

describe('soft death: respawn keeps ALL progression + inventory + coins (LOCKED)', () => {
  beforeEach(() => {
    useGameStore.setState({
      ...structuredClone(KNOWN),
      // Vitals BEFORE death: depleted, so respawn restoring them is observable.
      maxHealth: 200, playerHealth: 30,
      maxMana: 150, mana: 12,
      isAlive: true,
      // Defeat the damagePlayer guards so the death path is reached deterministically:
      // no spawn-immunity window, no recent-hit cooldown.
      _spawnTime: 0,
      // per-ATTACKER lockout stamps, the slot that rate-limits a hit. Without clearing it, a lockout
      // left by an earlier test in this file blocks the lethal hit and the death path is never reached.
      damageLockouts: {},
      isPlayerInvincible: () => false,
    });
  });

  it('damagePlayer to 0 HP sets isAlive=false (death path reached)', () => {
    useGameStore.getState().damagePlayer(9999, 'test-lethal');
    const s = useGameStore.getState();
    expect(s.playerHealth).toBe(0);
    expect(s.isAlive).toBe(false);
  });

  it('respawn restores vitals + isAlive WITHOUT touching progression / inventory / coins', () => {
    const store = useGameStore.getState();
    const modsBefore = store.getVerbMods();
    expect(modsBefore.roarSec, 'SETUP: the talents and the relic do not lengthen the roar').toBeGreaterThan(foldVerbMods({}, null).roarSec);
    // Kill, then respawn.
    store.damagePlayer(9999, 'test-lethal');
    expect(useGameStore.getState().isAlive).toBe(false); // dead
    useGameStore.getState().respawn();

    const s = useGameStore.getState();

    // --- VITALS restored ---
    expect(s.isAlive).toBe(true);
    expect(s.playerHealth).toBe(s.maxHealth); // full health
    expect(s.mana).toBe(s.maxMana);           // full mana

    // --- PROGRESSION unchanged (no penalty) ---
    expect(s.level).toBe(KNOWN.level);
    expect(s.currentXP).toBe(KNOWN.currentXP);
    expect(s.totalXP).toBe(KNOWN.totalXP);
    expect(s.talentPoints).toBe(KNOWN.talentPoints);
    expect(s.unlockedTalents).toEqual(KNOWN.unlockedTalents);
    expect(s.getVerbMods(), 'a death changed what the talents and the relic do').toEqual(modsBefore);

    // --- EQUIPMENT unchanged ---
    expect(s.equipment).toEqual(KNOWN.equipment);

    // --- INVENTORY unchanged (nothing dropped on death) ---
    expect(s.inventory).toEqual(KNOWN.inventory);

    // --- CURRENCY unchanged (no coin loss on death) ---
    expect(s.coins).toBe(KNOWN.coins);
  });
});
