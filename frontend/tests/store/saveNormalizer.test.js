import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, EQUIPMENT_STATS } from '../../src/store/useGameStore.jsx';
import { normalizeItemName } from '../../src/data/items.js';
import { buildSaveData } from '../../src/game/saveSchema.js';
import { deriveMaxStats, computeEffective } from '../../src/game/progression.js';

// M3-T3 save-normalizer guard: loadWorldData must strip the legacy leading emoji
// from every inventory key so old saves don't carry emoji-prefixed identities into
// the (now emoji-free) registry-keyed runtime. Built with \u escapes so this test
// file's source stays emoji-free where practical (the prefix bytes are DATA here).

const MEAT = '\u{1F969}'; // a meat glyph (legacy Raw Porkchop / Raw Beef prefix)
const HEART = '\u{2764}\u{FE0F}'; // a heart glyph + variation selector (legacy Health Potion prefix)

describe('M3-T3 save normalizer (loadWorldData)', () => {
  beforeEach(() => {
    // Reset only the inventory we care about; loadWorldData replaces it wholesale.
    useGameStore.setState({ terrainWorker: null });
  });

  it('strips a leading emoji from legacy inventory keys on load', () => {
    useGameStore.getState().loadWorldData({
      player_data: {
        inventory: {
          blocks: { [`${MEAT} Raw Porkchop`]: 3, 'Iron Sword': 1, grass: 64 },
          tools: { pickaxe: 1 },
          magic: { wand: 1 },
        },
      },
    });
    const inv = useGameStore.getState().inventory;
    expect(inv.blocks['Raw Porkchop']).toBe(3);
    expect(inv.blocks[`${MEAT} Raw Porkchop`]).toBeUndefined();
    // Already-clean keys pass through untouched.
    expect(inv.blocks['Iron Sword']).toBe(1);
    expect(inv.blocks.grass).toBe(64);
    expect(inv.tools.pickaxe).toBe(1);
    expect(inv.magic.wand).toBe(1);
  });

  it('MERGES quantities when two legacy keys normalize to the same clean name', () => {
    useGameStore.getState().loadWorldData({
      player_data: {
        inventory: {
          // A legacy emoji-prefixed key AND an already-clean key for the same item.
          blocks: { [`${HEART} Health Potion`]: 2, 'Health Potion': 5 },
          tools: {},
          magic: {},
        },
      },
    });
    const inv = useGameStore.getState().inventory;
    expect(inv.blocks['Health Potion']).toBe(7); // 2 + 5 merged
    expect(inv.blocks[`${HEART} Health Potion`]).toBeUndefined();
  });

  it('is safe with missing / empty inventory sections', () => {
    expect(() =>
      useGameStore.getState().loadWorldData({ player_data: { inventory: { blocks: {} } } })
    ).not.toThrow();
    const inv = useGameStore.getState().inventory;
    expect(inv.blocks).toEqual({});
  });

  it('normalizeItemName itself strips a single leading emoji + space', () => {
    expect(normalizeItemName(`${MEAT} Raw Beef`)).toBe('Raw Beef');
    expect(normalizeItemName(`${HEART} Health Potion`)).toBe('Health Potion');
    expect(normalizeItemName('Iron Sword')).toBe('Iron Sword'); // no-op when clean
  });
});

describe('A3 full progression round-trip (buildSaveData -> loadWorldData)', () => {
  beforeEach(() => useGameStore.setState({ terrainWorker: null, playerRigidBodyRef: null }));

  it('restores level/XP/attributes/equipment/talents/spellLevels/chests/position', () => {
    const snapshot = {
      worldBlocks: new Map([['0_10_0', 'dirt']]),
      chests: new Map([['5_0_5', { inventory: { 'Gold Coin': 9 } }]]),
      inventory: { blocks: { grass: 1 }, tools: {}, magic: {} },
      playerStats: { blocksPlaced: 0, blocksDestroyed: 0, distanceTraveled: 0, timeplayed: 0 },
      attributes: { strength: 14, agility: 11, intellect: 13, armor: 0, attributePoints: 3 },
      equipment: { head: null, chest: null, boots: null, weapon: 'Iron Sword', offhand: null },
      talentPoints: 2, unlockedTalents: { frost_shield: 1 }, spellLevels: { fireball: 2 },
      level: 6, currentXP: 40, totalXP: 900,
      gameMode: 'survival', selectedBlock: 'stone', activeSpell: 'iceball', isDay: false, gameTime: 4, achievements: [],
    };
    const save = JSON.parse(JSON.stringify(buildSaveData(snapshot, { position: { x: 7, y: 20, z: 8 } })));

    useGameStore.getState().loadWorldData(save);
    const s = useGameStore.getState();

    expect(s.level).toBe(6);
    expect(s.currentXP).toBe(40);
    expect(s.totalXP).toBe(900);
    expect(s.attributes).toEqual(snapshot.attributes);
    expect(s.equipment.weapon).toBe('Iron Sword');
    expect(s.talentPoints).toBe(2);
    expect(s.unlockedTalents).toEqual({ frost_shield: 1 });
    expect(s.spellLevels).toEqual({ fireball: 2 });
    expect(s.chests instanceof Map).toBe(true);
    expect(s.chests.get('5_0_5')).toEqual({ inventory: { 'Gold Coin': 9 } });
    expect(s.playerPosition).toEqual({ x: 7, y: 20, z: 8 });

    const eff = computeEffective(snapshot.attributes, snapshot.equipment, EQUIPMENT_STATS);
    expect(s.maxHealth).toBe(deriveMaxStats(6, eff).maxHealth);
  });

  it('a pre-A3 save (no progression slice) loads without crashing and keeps current progression', () => {
    useGameStore.setState({ level: 3, currentXP: 10, totalXP: 200 });
    expect(() => useGameStore.getState().loadWorldData({
      world_data: { blocks: [] }, player_data: { inventory: { blocks: {} }, stats: {} }, game_state: { gameMode: 'creative' },
    })).not.toThrow();
    expect(useGameStore.getState().level).toBe(3); // fell back, not wiped
  });
});

describe('questState persistence (quest progress + achievements)', () => {
  beforeEach(() => useGameStore.setState({ terrainWorker: null, playerRigidBodyRef: null, questState: null, questLoadedAt: 0 }));

  it('buildSaveData includes the questState mirror', () => {
    useGameStore.setState({ questState: {
      quests: [{ id: 'q1', progress: 2, completed: false, claimed: false }],
      completedQuestIds: ['q0'],
      stats: { kills: 5, spells: 1, blocks_placed: 3, blocks_broken: 0, chests: 1, deaths: 0, level: 2, kills_by_type: { goblin: 5 } },
      unlockedAchievements: ['first_step', 'first_blood'],
    }});
    const save = buildSaveData(useGameStore.getState(), { position: { x: 0, y: 18, z: 0 } });
    expect(save.questState.quests[0].progress).toBe(2);
    expect(save.questState.completedQuestIds).toEqual(['q0']);
    expect(save.questState.unlockedAchievements).toContain('first_blood');
  });

  it('loadWorldData restores questState and bumps the questLoadedAt resync tick', () => {
    const before = useGameStore.getState().questLoadedAt || 0;
    const save = JSON.parse(JSON.stringify(buildSaveData({
      ...useGameStore.getState(),
      questState: { quests: [{ id: 'qx', progress: 4 }], completedQuestIds: ['qa', 'qb'], stats: { kills: 9 }, unlockedAchievements: ['first_step', 'slayer'] },
    }, { position: { x: 0, y: 18, z: 0 } })));
    useGameStore.getState().loadWorldData(save);
    const s = useGameStore.getState();
    expect(s.questState.quests[0].progress).toBe(4);
    expect(s.questState.completedQuestIds).toEqual(['qa', 'qb']);
    expect(s.questState.unlockedAchievements).toContain('slayer');
    expect(s.questLoadedAt).toBeGreaterThan(before); // tick bumped → hook re-seeds
  });

  it('a pre-questState save (no questState) loads without crashing, keeps current', () => {
    useGameStore.setState({ questState: { stats: { kills: 1 } } });
    expect(() => useGameStore.getState().loadWorldData({
      world_data: { blocks: [] }, player_data: { inventory: { blocks: {} }, stats: {} }, game_state: {},
    })).not.toThrow();
    expect(useGameStore.getState().questState.stats.kills).toBe(1); // fell back
  });
});
