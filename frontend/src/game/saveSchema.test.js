import { describe, it, expect } from 'vitest';
import { SAVE_VERSION, buildSaveData, migrateSaveData } from './saveSchema.js';

const stateLike = {
  worldBlocks: new Map([['1_2_3', 'stone']]),
  chests: new Map([['10_0_10', { inventory: { 'Iron Sword': 1 } }]]),
  inventory: { blocks: { grass: 64 }, tools: { pickaxe: 1 }, magic: {} },
  playerStats: { blocksPlaced: 3, blocksDestroyed: 1, distanceTraveled: 0, timeplayed: 0 },
  attributes: { strength: 12, agility: 10, intellect: 10, armor: 0, attributePoints: 2 },
  equipment: { head: null, chest: null, boots: null, weapon: 'Diamond Sword', offhand: null },
  talentPoints: 1, unlockedTalents: { frost_shield: 2 }, spellLevels: { fireball: 3 },
  level: 4, currentXP: 25, totalXP: 400,
  gameMode: 'creative', selectedBlock: 'grass', activeSpell: 'fireball', isDay: true, gameTime: 12, achievements: ['first_block'],
};

describe('buildSaveData', () => {
  it('serializes the full progression slice + version', () => {
    const s = buildSaveData(stateLike, { position: { x: 5, y: 18, z: -3 } });
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.player_data.position).toEqual({ x: 5, y: 18, z: -3 });
    expect(s.progression).toEqual({
      level: 4, currentXP: 25, totalXP: 400,
      attributes: stateLike.attributes, equipment: stateLike.equipment,
      talentPoints: 1, unlockedTalents: { frost_shield: 2 }, spellLevels: { fireball: 3 },
    });
  });
  it('serializes Maps (worldBlocks + chests) as entry arrays', () => {
    const s = buildSaveData(stateLike, { position: { x: 0, y: 18, z: 0 } });
    expect(s.world_data.blocks).toEqual([['1_2_3', 'stone']]);
    expect(s.chests).toEqual([['10_0_10', { inventory: { 'Iron Sword': 1 } }]]);
  });
  it('is JSON-round-trippable (no Maps survive)', () => {
    const s = buildSaveData(stateLike, { position: { x: 0, y: 18, z: 0 } });
    expect(() => JSON.parse(JSON.stringify(s))).not.toThrow();
    expect(JSON.parse(JSON.stringify(s)).chests).toEqual([['10_0_10', { inventory: { 'Iron Sword': 1 } }]]);
  });
});

describe('migrateSaveData', () => {
  it('passes a current-version save through unchanged in shape', () => {
    const s = buildSaveData(stateLike, { position: { x: 0, y: 18, z: 0 } });
    const m = migrateSaveData(s);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.progression.level).toBe(4);
  });
  it('tolerates a pre-A3 (versionless, progression-less) save without throwing', () => {
    const legacy = { world_data: { blocks: [] }, player_data: { inventory: { blocks: {} }, stats: {} }, game_state: {} };
    expect(() => migrateSaveData(legacy)).not.toThrow();
    expect(migrateSaveData(legacy).progression).toBeUndefined();
  });
});
