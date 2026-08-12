import { describe, it, expect } from 'vitest';
import { SAVE_VERSION, buildSaveData, migrateSaveData } from './saveSchema.js';

const stateLike = {
  worldBlocks: new Map([['1_2_3', 'stone']]),
  chests: new Map([['10_0_10', { inventory: { 'Iron Sword': 1 } }]]),
  inventory: { blocks: { grass: 64 }, tools: { pickaxe: 1 }, magic: {} },
  attributes: { strength: 12, agility: 10, intellect: 10, armor: 0, attributePoints: 2 },
  equipment: { head: null, chest: null, boots: null, weapon: 'Diamond Sword', offhand: null },
  talentPoints: 1, unlockedTalents: { frost_shield: 2 }, spellLevels: { fireball: 3 },
  level: 4, currentXP: 25, totalXP: 400,
  gameMode: 'creative', selectedBlock: 'grass', activeSpell: 'fireball', isDay: true, gameTime: 12, achievements: ['first_block'],
  questState: { quests: { first_blood: { progress: 3, claimed: false } }, achievements: ['first_kill'] },
};

describe('buildSaveData', () => {
  it('serializes the full progression slice + version', () => {
    const s = buildSaveData(stateLike, { position: { x: 5, y: 18, z: -3 } });
    expect(s.version).toBe(SAVE_VERSION);
    // questState ROUND-TRIPS, not merely appears. The gate that used to cover this regexed saveSchema.js
    // for the token `questState`, which the file's own explanatory comments contain twice — so it would
    // have passed with the field removed from the payload entirely. Quest and achievement progress is
    // the thing a player loses if this breaks.
    expect(s.questState, 'questState is absent from the save payload').toBeTruthy();
    expect(s.questState.quests.first_blood.progress, 'quest progress did not survive serialization').toBe(3);
    expect(s.questState.achievements, 'achievements did not survive serialization').toEqual(['first_kill']);
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

// A FIELD THAT NOTHING WROTE, SERIALIZED INTO EVERY SAVE.
//
// `player_data.stats` came from `state.playerStats`, whose setter had ZERO callers anywhere in src, tests
// or scripts. So all four counters were permanently zero, every save carried those zeros, and
// loadWorldData faithfully restored them. The counters the game actually keeps -- blocks_placed,
// blocks_broken, distance -- live in the quest system and persist through questState. A serialized field
// nothing writes and nothing reads is worse than absent, because the next reader cannot tell it is fiction.
describe('buildSaveData — no fiction fields', () => {
  const built = () => buildSaveData({ ...stateLike, playerStats: { blocksPlaced: 99 } }, { position: { x: 0, y: 0, z: 0 } });

  it('does not serialize player stats, even when the state object still carries them', () => {
    // Passing a NON-ZERO playerStats is the point: a builder that merely happened to write zeros would
    // satisfy an assertion about zeros. This asserts the field is GONE, not that it is empty.
    expect('stats' in built().player_data, 'player_data.stats is back — four counters nothing increments').toBe(false);
  });

  it('still serializes the fields around it — the control', () => {
    const s = built();
    expect(s.player_data.inventory).toBeTruthy();
    expect(s.player_data.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('an OLD save carrying the key still loads — migration must not choke on an extra field', () => {
    const legacy = { ...built(), player_data: { ...built().player_data, stats: { blocksPlaced: 7 } } };
    expect(() => migrateSaveData(legacy)).not.toThrow();
    const m = migrateSaveData(legacy);
    expect(m.player_data.inventory, 'migration dropped the fields that matter').toBeTruthy();
  });

  it('the counters that DO exist ride in questState, which is what makes the deletion safe', () => {
    const s = buildSaveData({ ...stateLike, questState: { stats: { blocks_placed: 12, blocks_broken: 4 } } }, { position: { x: 0, y: 0, z: 0 } });
    expect(s.questState.stats.blocks_placed).toBe(12);
    expect(s.questState.stats.blocks_broken).toBe(4);
  });
});
