// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { renderHook, act, cleanup } from '@testing-library/react';
import { SAVE_VERSION, RETIRED_QUEST_IDS, buildSaveData, splitTombstone } from '../../src/game/saveSchema.js';
import { useQuestSystem, QUEST_LIST } from '../../src/QuestSystem.jsx';
import { MAX_ACTIVE_QUESTS } from '../../src/game/questClaim.js';
import { solveMeleeDamage, solveSpellDamage, mitigateDamage } from '../../src/utils/combat.js';
import { getWeaponBaseDamage } from '../../src/game/equipment.js';
import { SPELL_UPGRADES } from '../../src/world/spellUpgrades.js';
import { MOB_TYPES } from '../../src/game/mobTypes.js';

// THE PRE-CUT SAVE (W2-F brief, Task 0 and Task 1; DECISIONS 2026-10-28 W1-H items 4-7 and 10).
//
// tests/fixtures/pre-cut-save.json is a localStorage world blob written at main c03186fe, before the Cut, by the real
// save path (`saveActiveWorld` -> buildSaveData -> writeWorld) after the store's own actions played a profile to level
// 5: six attribute points allocated, fireball and iceball upgraded through useSpellUpgrades, one talent rank, all four
// banks non-zero, 12 crystals and the wand, the Stone Sword equipped, gameMode 'survival', four blocks placed through
// the quest hook (Builder 4/20). It was generated in jsdom, not a browser, because local browser runs were barred that
// day (load above 28); the serializer and the actions are the ones the DEV bridge drives. It is FROZEN: regenerating
// it after the Cut would write a post-Cut save and test nothing. Every later Cut step must keep this file green.
//
// WHAT THIS DOES NOT CHECK: the World Manager's Load button and localStorage in a real browser (tests/e2e/the-cut.spec.js),
// or anything about a save older than SAVE_VERSION beyond its unknown keys being dropped.

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(readFileSync(resolve(HERE, '../fixtures/pre-cut-save.json'), 'utf8'));
const fixture = () => structuredClone(FIXTURE);
const POS = { position: { x: 0, y: 18, z: 0 } };
// What a save on disk reads back as: JSON drops undefined and turns Maps into entry arrays.
const onDisk = () => JSON.parse(JSON.stringify(buildSaveData(useGameStore.getState(), POS)));

let random;
beforeEach(() => {
  useGameStore.setState(useGameStore.getInitialState(), true);
  useGameStore.setState({ isCaptureMode: false, _sessionWorldId: null });
  random = Math.random;
});
afterEach(() => { Math.random = random; cleanup(); });

describe('the pre-cut save loads and fights', () => {
  it('keeps its level and deals finite damage to a zombie, melee and spell, crit or not', () => {
    expect(FIXTURE.version, 'the fixture is not a current-version save, so the pass-through below never engages').toBe(SAVE_VERSION);
    useGameStore.getState().loadWorldData(fixture());
    const s = useGameStore.getState();
    expect(s.level, 'the pre-cut save lost its level on load').toBe(5);
    expect(Number.isFinite(s.maxHealth) && s.maxHealth > 0, `maxHealth ${s.maxHealth}`).toBe(true);
    expect(Number.isFinite(s.maxMana) && s.maxMana > 0, `maxMana ${s.maxMana}`).toBe(true);

    const zombie = MOB_TYPES.zombie;
    const eff = s.getEffectiveAttributes();
    const spellLevel = s.spellLevels?.fireball || 1;
    const spellBase = SPELL_UPGRADES.fireball.levels[spellLevel - 1].damage;
    for (const roll of [0, 0.999]) { // a crit and a plain hit: both branches of each solver
      Math.random = () => roll;
      const melee = mitigateDamage({ armor: zombie.armor || 0 }, solveMeleeDamage(eff, getWeaponBaseDamage(s.equipment?.weapon)).damage);
      const spell = mitigateDamage({ armor: zombie.armor || 0 }, solveSpellDamage(eff, spellBase, 'fireball').damage);
      for (const [verb, dmg] of [['melee', melee], ['spell', spell]]) {
        expect(Number.isFinite(dmg) && dmg >= 1, `${verb} damage from the pre-cut save is ${dmg} (roll ${roll})`).toBe(true);
        expect(Number.isFinite(zombie.health - dmg), `a zombie hit by ${verb} has ${zombie.health - dmg} HP`).toBe(true);
      }
    }
  });
});

describe('the tombstone pass-through', () => {
  const planted = () => {
    const f = fixture();
    f.progression.futureField = { nested: [1, 2], word: 'kept' };
    f.game_state.futureFlag = 'kept';
    return f;
  };

  it('writes back every progression and game_state key the pre-cut save held, unchanged, plus planted unknown keys', () => {
    const f = planted();
    useGameStore.getState().loadWorldData(f);
    const saved = onDisk();
    expect(saved.progression.futureField, 'an unknown progression key was dropped on save').toEqual({ nested: [1, 2], word: 'kept' });
    expect(saved.game_state.futureFlag, 'an unknown game_state key was dropped on save').toBe('kept');
    // The whole slice, not the planted keys alone: a field this build stops writing (gameMode, from the next step on)
    // must come back exactly as the pre-cut save had it.
    expect(saved.progression, 'the pre-cut progression slice did not round-trip unchanged').toEqual(f.progression);
    expect(saved.game_state, 'the pre-cut game_state slice did not round-trip unchanged').toEqual(f.game_state);
  });

  it('keeps carrying the keys across a second load and save (the bag is re-read, not spent)', () => {
    useGameStore.getState().loadWorldData(planted());
    const once = onDisk();
    useGameStore.setState(useGameStore.getInitialState(), true);
    useGameStore.getState().loadWorldData(once);
    expect(onDisk().progression.futureField).toEqual({ nested: [1, 2], word: 'kept' });
  });

  it('holds for one SAVE_VERSION: a save stamped older, or with no version, carries no unknown key forward', () => {
    for (const version of [SAVE_VERSION - 1, undefined]) {
      useGameStore.setState(useGameStore.getInitialState(), true);
      const f = { ...planted(), version };
      useGameStore.getState().loadWorldData(f);
      const saved = onDisk();
      expect(saved.progression.level, `SETUP: the version-${version} save did not load`).toBe(5);
      expect('futureField' in saved.progression, `a version-${version} save carried its unknown key forward`).toBe(false);
      expect('futureFlag' in saved.game_state, `a version-${version} save carried its unknown key forward`).toBe(false);
    }
  });

  it('a save from a NEWER build (a rollback) still carries its unknown keys', () => {
    useGameStore.getState().loadWorldData({ ...planted(), version: SAVE_VERSION + 1 });
    expect(onDisk().progression.futureField).toEqual({ nested: [1, 2], word: 'kept' });
  });

  it('never holds a key this build writes, and a held value never shadows a live one', () => {
    const bag = splitTombstone(planted());
    expect(Object.keys(bag.progression), 'the bag took keys this build writes').toEqual(['futureField']);
    // gameMode is a key this build stopped writing at the Cut (W1-H item 4), so it is held like the planted one.
    expect(Object.keys(bag.game_state), 'the bag took keys this build writes').toEqual(['gameMode', 'futureFlag']);
    const built = buildSaveData({ level: 7, isDay: false, _tombstone: { progression: { level: 99 }, game_state: { isDay: true } } }, POS);
    expect(built.progression.level, 'a tombstoned value overwrote the live level').toBe(7);
    expect(built.game_state.isDay, 'a tombstoned value overwrote the live isDay').toBe(false);
  });

  it('a new world does not inherit the last world\'s tombstone', () => {
    useGameStore.getState().loadWorldData(planted());
    expect(onDisk().progression.futureField, 'SETUP: the planted key never reached the save').toBeTruthy();
    useGameStore.getState().startNewWorld('local_fresh');
    const saved = onDisk();
    expect('futureField' in saved.progression, 'a new world wrote the old world\'s unknown key').toBe(false);
    expect('futureFlag' in saved.game_state, 'a new world wrote the old world\'s unknown key').toBe(false);
  });
});

// ONE COSTED MODE (DECISIONS 2026-10-28 W1-H items 4 and 10). The pre-cut save says gameMode 'survival' and holds an
// active Builder quest at 4/20; this build neither reads the mode nor offers the quest, and writes both back.
describe('the pre-cut save after one costed mode', () => {
  const ids = (quests) => (quests || []).map((q) => q && q.id);

  it('the store adopts no game mode, and the save writes the pre-cut one back where it was', () => {
    useGameStore.getState().loadWorldData(fixture());
    expect('gameMode' in useGameStore.getState(), 'loading a pre-cut save put a gameMode back into the store').toBe(false);
    expect(onDisk().game_state.gameMode, 'the pre-cut gameMode did not ride the tombstone').toBe('survival');
  });

  it('holds the retired Builder quest out of play, and writes it back with its progress', () => {
    const f = fixture();
    const builder = f.questState.quests.find((q) => q.id === 'builder');
    expect(builder?.progress, 'SETUP: the fixture holds no Builder quest in progress').toBe(4);
    useGameStore.getState().loadWorldData(f);
    expect(ids(useGameStore.getState().questState.quests), 'a retired quest reached the live quest state').toEqual(['first_blood', 'hunter']);
    const saved = onDisk();
    expect(saved.questState.quests.find((q) => q.id === 'builder'), 'the Builder quest was lost on save').toEqual(builder);
    expect(saved.questState, 'the pre-cut quest state did not round-trip unchanged').toEqual(f.questState);
  });

  it('holds every retired quest, not the Builder alone', () => {
    const f = fixture();
    const later = [{ id: 'architect', type: 'block_place', target: 100, progress: 37 }, { id: 'world_builder', type: 'block_place', target: 500, progress: 120 }];
    f.questState.quests.push(...later);
    useGameStore.getState().loadWorldData(f);
    expect(ids(useGameStore.getState().questState.quests), 'a retired quest reached the live quest state').toEqual(['first_blood', 'hunter']);
    expect(ids(onDisk().questState.quests), 'a retired quest was lost on save').toEqual(['first_blood', 'hunter', 'builder', 'architect', 'world_builder']);
  });

  it('a save older than SAVE_VERSION loses the retired quest instead of carrying it', () => {
    useGameStore.getState().loadWorldData({ ...fixture(), version: SAVE_VERSION - 1 });
    expect(ids(useGameStore.getState().questState.quests)).toEqual(['first_blood', 'hunter']);
    expect(ids(onDisk().questState.quests), 'an old save carried a retired quest forward').toEqual(['first_blood', 'hunter']);
  });

  it('the quest hook offers a full feed with no retired quest, and placing blocks completes nothing', () => {
    for (const id of RETIRED_QUEST_IDS) expect(QUEST_LIST.some((q) => q.id === id), `QUEST_LIST still offers ${id}`).toBe(false);
    expect(QUEST_LIST.some((q) => q.type === 'block_place'), 'a placement-count quest is still authored').toBe(false);
    useGameStore.getState().loadWorldData(fixture());
    const { result } = renderHook(() => useQuestSystem());
    const live = result.current.quests;
    expect(live.filter((q) => !q.claimed).length, `the feed came back short: ${ids(live)}`).toBe(MAX_ACTIVE_QUESTS);
    expect(ids(live).filter((id) => RETIRED_QUEST_IDS.has(id)), 'the hook offers a retired quest').toEqual([]);
    expect(ids(live).slice(0, 2), 'the saved quests were not kept in order').toEqual(['first_blood', 'hunter']);
    act(() => { for (let i = 0; i < 25; i++) useGameStore.getState().onBlockPlace(); });
    expect(result.current.quests.filter((q) => q.completed).map((q) => q.id), 'placing blocks completed a quest').toEqual([]);
    expect(result.current.stats.blocks_placed, 'SETUP: the placements never reached the quest hook').toBe(29);
    const saved = onDisk();
    expect(ids(saved.questState.quests), 'the save lost the live feed or the held Builder quest').toEqual([...ids(result.current.quests), 'builder']);
  });
});
