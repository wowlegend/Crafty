// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { renderHook, act, cleanup } from '@testing-library/react';
import { SAVE_VERSION, RETIRED_QUEST_IDS, buildSaveData, splitTombstone, migrateRetired, attributePointsHeld } from '../../src/game/saveSchema.js';
import { useQuestSystem, QUEST_LIST } from '../../src/QuestSystem.jsx';
import { MAX_ACTIVE_QUESTS } from '../../src/game/questClaim.js';
import { solveMeleeDamage, solveSpellDamage, mitigateDamage } from '../../src/utils/combat.js';
import { xpForLevel } from '../../src/game/progression.js';
import { getWeaponBaseDamage } from '../../src/game/equipment.js';
import { STRINGS } from '../../src/i18n/strings.js';
import { tIn } from '../../src/i18n/i18n.js';

// A notice as the toast stack shows it in English: a dictionary key with its vars, or plain text as written.
const noteText = (msg, o) => (Object.prototype.hasOwnProperty.call(STRINGS.en, msg) ? tIn('en', msg, o?.vars) : msg);
import { MOB_TYPES } from '../../src/game/mobTypes.js';

// THE PRE-CUT SAVE (W2-F brief, Task 0 and Task 1; DECISIONS 2026-10-28 W1-H items 4-7 and 10).
//
// tests/fixtures/pre-cut-save.json is a localStorage world blob written at main c03186fe, before the Cut, by the real
// save path (`saveActiveWorld` -> buildSaveData -> writeWorld) after the store's own actions, run in jsdom, brought a
// profile to level 5: six attribute points allocated, fireball and iceball upgraded through useSpellUpgrades, one talent
// rank, all four banks non-zero, 12 crystals and the wand, the Stone Sword equipped, gameMode 'survival'. Its quest
// state counts four placements (Builder 4/20) made through the quest hook's onBlockPlace, not through Terrain's place():
// world_data holds two stone blocks and the stone stack was never debited, so the fixture is a faithful SHAPE of a
// pre-cut save, not a played one. It is FROZEN: regenerating it after the Cut would write a post-Cut save and test
// nothing. Every later Cut step must keep this file green.
//
// WHAT THIS DOES NOT CHECK: the World Manager's Load button and localStorage in a real browser (tests/e2e/the-cut.spec.js),
// a save produced by real play, or anything about a save older than SAVE_VERSION beyond its unknown keys being dropped
// and its retired quests still being paid.

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
    const spellBase = s.getSpellStats('fireball').damage;
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
    // The whole slice, not the planted keys alone: a field this build stops writing (gameMode, the four Aspect banks,
    // attributes, spellLevels) must come back exactly as the pre-cut save had it. The keys added are the ember the banks
    // were summed into and the Forge's relic tiers (none tempered); the keys changed are the talents the refund paid (the
    // describe at the end of this file).
    expect(saved.progression, 'the pre-cut progression slice did not round-trip unchanged')
      .toEqual({ ...f.progression, ember: 75, emberBuildDay: { night: 0, built: 0 }, relicTiers: {}, talentPoints: 8, unlockedTalents: {} });
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
    // attributes and spellLevels (W1-H item 6) and the four Aspect banks (item 5) are keys this build stopped writing, so
    // they are held like the planted one.
    expect(Object.keys(bag.progression), 'the bag took keys this build writes').toEqual(['attributes', 'spellLevels', 'ferocityBanked', 'kineticBanked', 'soulBanked', 'resonanceBanked', 'futureField']);
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

// EMBER (DECISIONS 2026-10-28 W1-H item 5). The pre-cut save banked 30 Ferocity, 20 Kinetic, 15 Soul and 10 Resonance;
// this build has one bar, and the save's banks are added into it once.
describe('the pre-cut save after Ember', () => {
  it('loads with its four banks summed into one bar, its level kept, and damage finite', () => {
    const f = fixture();
    expect([f.progression.ferocityBanked, f.progression.kineticBanked, f.progression.soulBanked, f.progression.resonanceBanked],
      'SETUP: the fixture changed').toEqual([30, 20, 15, 10]);
    useGameStore.getState().loadWorldData(f);
    const s = useGameStore.getState();
    expect(s.ember, 'the four banks were not summed into the bar').toBe(75);
    expect(Number.isFinite(s.ember)).toBe(true);
    expect(s.level, 'the pre-cut save lost its level').toBe(5);
    for (const gone of ['ferocityBanked', 'kineticBanked', 'soulBanked', 'resonanceBanked']) {
      expect(gone in s, `loading a pre-cut save put ${gone} back into the store`).toBe(false);
    }
    const dmg = solveMeleeDamage(s.getEffectiveAttributes(), getWeaponBaseDamage(s.equipment?.weapon)).damage;
    expect(Number.isFinite(dmg) && dmg >= 1, `melee damage ${dmg}`).toBe(true);
  });

  it('writes the four banks back unchanged beside the bar, and a reload does not refill a spent bar from them', () => {
    useGameStore.getState().loadWorldData(fixture());
    const first = onDisk();
    expect(first.progression.ember).toBe(75);
    expect([first.progression.ferocityBanked, first.progression.kineticBanked, first.progression.soulBanked, first.progression.resonanceBanked],
      'a retired bank was not written back as it was').toEqual([30, 20, 15, 10]);
    expect(useGameStore.getState().spendEmber(50), 'SETUP: a spend of 50 from 75 was refused').toBe(true);
    const spent = onDisk();
    useGameStore.setState(useGameStore.getInitialState(), true);
    useGameStore.getState().loadWorldData(spent);
    expect(useGameStore.getState().ember, 'the reload summed the held banks again').toBe(25);
  });
});

// A RETIRED QUEST THE SAVE COMPLETED AND NEVER CLAIMED is paid on load, as the claim the player can no longer make
// would have paid it, and becomes claimed. Builder's authored reward was 50 XP, 24 wood and 20 coins (questRewards: 0.4
// of the XP); Architect's 150 XP and 60 coins; World Builder's 400 XP and 160 coins.
describe('a completed, unclaimed retired quest', () => {
  const ids = (quests) => (quests || []).map((q) => q && q.id);
  const done = (f, id, target) => {
    const q = f.questState.quests.find((e) => e.id === id) || f.questState.quests[f.questState.quests.push({ id, type: 'block_place', target }) - 1];
    Object.assign(q, { progress: target, completed: true, claimed: false });
    return f;
  };
  const read = () => {
    const s = useGameStore.getState();
    return { totalXP: s.totalXP, level: s.level, coins: s.coins, wood: s.inventory.blocks.wood, quests: ids(s.questState.quests), claimed: s.questState.completedQuestIds };
  };
  let notes;
  const questNotes = () => notes.filter((n) => n.startsWith('Quest reward'));
  beforeEach(() => {
    notes = [];
    useGameStore.setState({ addNotification: (msg, _type, o) => notes.push(noteText(msg, o)) });
  });

  it('pays its reward once on load, and the quest comes back claimed, out of the feed and out of the held set', () => {
    const before = { totalXP: FIXTURE.progression.totalXP, coins: FIXTURE.progression.coins, wood: FIXTURE.player_data.inventory.blocks.wood };
    useGameStore.getState().loadWorldData(done(fixture(), 'builder', 20));
    const s = read();
    expect(s.totalXP - before.totalXP, 'the Builder XP was not paid, or paid twice').toBe(50);
    expect(s.coins - before.coins, 'the Builder coins were not paid, or paid twice').toBe(20);
    expect(s.wood - before.wood, 'the Builder wood was not paid, or paid twice').toBe(24);
    expect(s.quests, 'the paid quest reached the live feed').toEqual(['first_blood', 'hunter']);
    expect(s.claimed, 'the paid quest is not recorded as claimed').toEqual(['builder']);
    expect(questNotes(), 'the player was not told what the load paid').toEqual(['Quest reward (Builder): +50 XP, +20 coins, +24 wood!']);
    const saved = onDisk();
    expect(ids(saved.questState.quests), 'the paid quest is still held for a rollback to claim again').toEqual(['first_blood', 'hunter']);
    expect(saved.questState.completedQuestIds, 'the save lost the claim').toEqual(['builder']);
    // talents.cut is the talent refund every pre-cut save is owed (the describe at the end of this file).
    expect(saved.migrated, 'the save does not record the migration').toEqual(['quests.builder', 'talents.cut']);
  });

  it('a second load of the save it wrote changes nothing', () => {
    useGameStore.getState().loadWorldData(done(fixture(), 'builder', 20));
    const first = read();
    const once = onDisk();
    useGameStore.setState(useGameStore.getInitialState(), true);
    useGameStore.setState({ addNotification: (msg, _type, o) => notes.push(noteText(msg, o)) });
    const announced = notes.length;
    useGameStore.getState().loadWorldData(structuredClone(once));
    expect(read(), 'the second load paid, or lost, something').toEqual(first);
    expect(notes, 'the second load announced a payment').toHaveLength(announced);
    const twice = onDisk();
    expect({ ...twice, save_name: null }, 'the second save differs from the first').toEqual({ ...once, save_name: null });
  });

  it('pays every retired quest, at each one\'s authored reward', () => {
    const f = done(done(done(fixture(), 'builder', 20), 'architect', 100), 'world_builder', 500);
    const xp0 = f.progression.totalXP;
    const coins0 = f.progression.coins;
    useGameStore.getState().loadWorldData(f);
    expect(useGameStore.getState().totalXP - xp0, 'the three retired rewards were not paid in full').toBe(50 + 150 + 400);
    expect(useGameStore.getState().coins - coins0).toBe(20 + 60 + 160);
    expect(onDisk().migrated).toEqual(['quests.builder', 'quests.architect', 'quests.world_builder', 'talents.cut']);
  });

  it('pays nothing for one in progress or already claimed, and records nothing for it', () => {
    const f = fixture();
    f.questState.quests.push({ id: 'architect', type: 'block_place', target: 100, progress: 100, completed: true, claimed: true });
    useGameStore.getState().loadWorldData(f);
    expect(useGameStore.getState().totalXP, 'an incomplete or claimed retired quest was paid').toBe(FIXTURE.progression.totalXP);
    expect(useGameStore.getState().coins).toBe(FIXTURE.progression.coins);
    expect(questNotes(), 'a load that paid nothing announced a payment').toEqual([]);
    expect(onDisk().migrated, 'a migration that ran nothing was recorded').toEqual(['talents.cut']);
  });

  it('a save older than SAVE_VERSION is still paid, and its record is still read', () => {
    const old = { ...done(fixture(), 'builder', 20), version: SAVE_VERSION - 1 };
    useGameStore.getState().loadWorldData(structuredClone(old));
    expect(useGameStore.getState().totalXP - FIXTURE.progression.totalXP, 'a pre-bump save lost what it was owed').toBe(50);
    useGameStore.setState(useGameStore.getInitialState(), true);
    useGameStore.getState().loadWorldData({ ...structuredClone(old), migrated: ['quests.builder'] });
    expect(useGameStore.getState().totalXP, 'a pre-bump save that records the payment was paid again').toBe(FIXTURE.progression.totalXP);
  });
});

// THE RECORD, for a migration whose source the tombstone keeps writing back (the shape the later Cut steps take: a held
// key summed into a live one). Without the record each load would pay again.
describe('the migration record', () => {
  const oldBank = [{ name: 'progression.oldBank', run: (s) => (s.progression?.oldBank ? { reward: { xp: 0, coins: s.progression.oldBank, item: null } } : null) }];

  it('runs a migration once though its source key is still held and written back', () => {
    const save = fixture();
    save.progression.oldBank = 7;
    const first = migrateRetired(save, oldBank);
    expect(first.coins, 'SETUP: the migration did not run on the first load').toBe(7);
    expect(first.migrated).toEqual(['progression.oldBank']);
    const next = JSON.parse(JSON.stringify(buildSaveData({ _tombstone: { ...splitTombstone(save), migrated: first.migrated } }, POS)));
    expect(next.progression.oldBank, 'SETUP: the tombstone stopped holding the source key').toBe(7);
    expect(next.migrated, 'the save did not write the record').toEqual(['progression.oldBank']);
    expect(migrateRetired(next, oldBank).coins, 'the migration ran again on the next load').toBe(0);
  });

  it('a load keeps the names it does not run, and a new world starts with none', () => {
    useGameStore.getState().loadWorldData({ ...fixture(), migrated: ['progression.oldBank', 7, 'progression.oldBank'] });
    expect(onDisk().migrated, 'a load dropped a recorded name, or kept a junk one').toEqual(['progression.oldBank', 'talents.cut']);
    useGameStore.getState().startNewWorld('local_fresh');
    expect(onDisk().migrated, 'a new world inherited the last world\'s record').toEqual(['talents.cut']);
  });
});

// TALENTS AND RELICS (DECISIONS 2026-10-28 W1-H item 6; saveSchema talents.cut). The pre-cut save holds attributes
// { strength 13, agility 11, intellect 12, armor 0, attributePoints 14 }: 6 points allocated and 14 unspent. THE RULE:
// every 5 attribute points, spent or unspent, come back as 1 talent point (floor), and every held talent rank comes back
// as a point. So 20 / 5 = 4, plus its 3 unspent talent points and 1 rank (voidhand_force): 8 at level 5, no ranks.
describe('the pre-cut save after talents and relics', () => {
  it('keeps its level, drops its attribute points into 8 talent points by the rule, and deals finite damage', () => {
    expect(attributePointsHeld(FIXTURE.progression.attributes), 'SETUP: the fixture no longer holds 20 attribute points').toBe(20);
    useGameStore.getState().loadWorldData(fixture());
    const s = useGameStore.getState();
    expect(s.level, 'the pre-cut save lost its level').toBe(5);
    expect(s.talentPoints, 'the refund rule paid other than 20 / 5 + 3 unspent + 1 rank').toBe(8);
    expect(s.unlockedTalents, 'a pre-cut rank survived the respec').toEqual({});
    expect('attributes' in s, 'the store took the attributes back').toBe(false);
    expect(s.getEffectiveAttributes(), 'level 5 with the Stone Sword is not the level\'s own stats plus the sword\'s')
      .toEqual({ strength: 10 + 8 + 4, agility: 10 + 4 + 2, intellect: 10 + 8, armor: 0 });
    for (const roll of [0, 0.999]) {
      Math.random = () => roll;
      const melee = solveMeleeDamage(s.getEffectiveAttributes(), getWeaponBaseDamage(s.equipment?.weapon)).damage;
      const spell = solveSpellDamage(s.getEffectiveAttributes(), s.getSpellStats('fireball').damage, 'fireball').damage;
      expect(Number.isFinite(melee) && melee >= 1, `melee ${melee}`).toBe(true);
      expect(Number.isFinite(spell) && spell >= 1, `spell ${spell}`).toBe(true);
    }
  });

  it('writes attributes and spellLevels back unchanged, records talents.cut, and a second load pays nothing', () => {
    const f = fixture();
    useGameStore.getState().loadWorldData(f);
    const once = onDisk();
    expect(once.progression.attributes, 'the held attributes changed on the way through').toEqual(f.progression.attributes);
    expect(once.progression.spellLevels, 'the held spellLevels changed on the way through').toEqual(f.progression.spellLevels);
    expect(once.migrated, 'the save did not record the refund').toContain('talents.cut');
    expect(once.progression.talentPoints).toBe(8);
    useGameStore.setState(useGameStore.getInitialState(), true);
    useGameStore.getState().loadWorldData(once);
    expect(useGameStore.getState().talentPoints, 'the refund was paid a second time').toBe(8);
  });

  it('gives back a rank the new trees still allow, because the node changed meaning', () => {
    // The fixture's own rank (voidhand_force) is no node any more, so the unknown-id refund pays it whatever the rule
    // says; these two are live nodes, and only the respec half of the rule brings them back.
    const f = fixture();
    f.progression.unlockedTalents = { wildheart_roar: 1, wildheart_endurance: 2 };
    useGameStore.getState().loadWorldData(f);
    const s = useGameStore.getState();
    expect(s.unlockedTalents, 'a pre-cut rank on a live node survived the respec').toEqual({});
    expect(s.talentPoints, 'the refund paid other than 20 / 5 + 3 unspent + 3 ranks').toBe(4 + 3 + 3);
  });

  it('never respecs a save written after the Cut, whose ranks are the player\'s choices in the new trees', () => {
    useGameStore.setState({ level: 3, talentPoints: 0, unlockedTalents: { wildheart_roar: 1, wildheart_endurance: 1 } });
    const post = onDisk();
    expect('attributes' in post.progression, 'SETUP: a post-Cut save wrote attributes').toBe(false);
    useGameStore.setState(useGameStore.getInitialState(), true);
    useGameStore.getState().loadWorldData(post);
    const s = useGameStore.getState();
    expect(s.unlockedTalents, 'a post-Cut save was respecced').toEqual({ wildheart_roar: 1, wildheart_endurance: 1 });
    expect(s.talentPoints).toBe(0);
  });

  it('takes the crystals and the wand out of the live bag and writes them back into the save', () => {
    useGameStore.getState().loadWorldData(fixture());
    const bag = useGameStore.getState().inventory.blocks;
    expect(bag.stone, 'SETUP: the fixture\'s blocks did not load').toBe(16);
    expect('crystals' in bag || 'wand' in bag, 'a retired currency is in the live bag').toBe(false);
    const saved = onDisk().player_data.inventory.blocks;
    expect(saved.crystals, 'the held crystals did not reach the save').toBe(12);
    expect(saved.wand, 'the held wand did not reach the save').toBe(1);
    expect(saved.stone).toBe(16);
  });

  it('takes the retired keys out of every bag and every chest, so no chest hands one back, and the save keeps them all', () => {
    const f = fixture();
    f.chests = [['4_17_2', { inventory: { crystals: 5, stone: 3 } }], ['9_17_9', { inventory: { dirt: 2 } }]];
    f.player_data.inventory.magic = { crystals: 2 };
    useGameStore.getState().loadWorldData(f);
    const st = useGameStore.getState();
    expect(st.chests.get('4_17_2')?.inventory, 'a retired key stayed in a live chest').toEqual({ stone: 3 });
    expect(st.inventory.magic, 'a retired key stayed in the live magic bag').toEqual({});
    st.transferItem('4_17_2', 'crystals', 1, 'from_chest');
    st.transferItem('4_17_2', 'stone', 1, 'from_chest');
    const bag = useGameStore.getState().inventory.blocks;
    expect('crystals' in bag, 'a chest handed a retired crystal back to the bag').toBe(false);
    expect(bag.stone, 'SETUP: a live item no longer moves from the chest').toBe(17);
    const saved = onDisk();
    expect(saved.player_data.inventory.blocks.crystals, 'the held bag crystals did not reach the save').toBe(12);
    expect(saved.player_data.inventory.magic, 'the held magic-bag crystals did not reach the save').toEqual({ crystals: 2 });
    expect(Object.fromEntries(saved.chests), 'a chest\'s held crystals did not reach the save, or a live item was lost')
      .toEqual({ '4_17_2': { inventory: { crystals: 5, stone: 2 } }, '9_17_9': { inventory: { dirt: 2 } } });
  });

  it('counts allocated and unspent points alike, and a broken field adds nothing', () => {
    expect(attributePointsHeld({ strength: 10, agility: 10, intellect: 10, armor: 0, attributePoints: 0 })).toBe(0);
    expect(attributePointsHeld({ strength: 15, agility: 10, intellect: 10, armor: 0, attributePoints: 0 })).toBe(5);
    expect(attributePointsHeld({ strength: 10, agility: 10, intellect: 10, armor: 3, attributePoints: 2 })).toBe(5);
    expect(attributePointsHeld({ strength: NaN, agility: -4, intellect: '12', armor: null, attributePoints: Infinity })).toBe(0);
    expect(attributePointsHeld(null)).toBe(0);
  });
});

// THE CUT'S RECORD, THE HELD GRAB AND THE NOTICE. A pre-Cut build writes `attributes` into every save it touches, so a
// rollback makes a post-Cut save look pre-Cut to the next load here; only the record (talents.cut, written on every save
// this build makes or loads) tells the two apart.
describe('the Cut is recorded on every save, a load ends a held grab, and the notice counts what is spendable', () => {
  const PRE_CUT_DEFAULTS = { strength: 10, agility: 10, intellect: 10, armor: 0 };
  const postCut = () => {
    useGameStore.setState({ level: 6, talentPoints: 1, unlockedTalents: { wildheart_roar: 1, wildheart_endurance: 2 } });
    const blob = onDisk();
    useGameStore.setState(useGameStore.getInitialState(), true);
    return blob;
  };
  // What a pre-Cut build writes back when it loads and saves a world: its own attributes record, the rest as it was.
  const rolledBack = (blob, attributePoints) => {
    const back = structuredClone(blob);
    back.progression.attributes = { ...PRE_CUT_DEFAULTS, attributePoints };
    return back;
  };
  let notes;
  const cutNotes = () => notes.filter((n) => n.startsWith('Talents now change'));
  beforeEach(() => {
    notes = [];
    useGameStore.setState({ addNotification: (msg, _type, o) => notes.push(noteText(msg, o)) });
  });

  it('a session that has loaded nothing writes the record, and so does a new world', () => {
    expect(onDisk().migrated, 'a save from a session that loaded nothing lacks the record').toEqual(['talents.cut']);
    useGameStore.getState().startNewWorld('local_fresh');
    expect(onDisk().migrated).toEqual(['talents.cut']);
  });

  it('a post-Cut save loaded here is recorded, so a rollback writing attributes into it cannot respec it', () => {
    const unrecorded = { ...postCut(), migrated: [] }; // a post-Cut save written before the record was kept on every save
    expect(migrateRetired(unrecorded).migrated, 'a post-Cut save loaded here was not recorded').toEqual(['talents.cut']);
    useGameStore.getState().loadWorldData(unrecorded);
    const reloaded = onDisk();
    expect(reloaded.migrated).toEqual(['talents.cut']);
    for (const blob of [postCut(), reloaded]) {
      useGameStore.setState(useGameStore.getInitialState(), true);
      useGameStore.setState({ addNotification: (msg, _type, o) => notes.push(noteText(msg, o)) });
      useGameStore.getState().loadWorldData(rolledBack(blob, 10));
      const s = useGameStore.getState();
      expect(s.unlockedTalents, 'a post-Cut build was respecced after a rollback wrote attributes').toEqual({ wildheart_roar: 1, wildheart_endurance: 2 });
      expect(s.talentPoints, 'a post-Cut save was paid the refund after a rollback').toBe(1);
    }
    expect(cutNotes()).toEqual([]);
    // The control: the same rolled-back blob with no record is taken for a pre-Cut save and refunded.
    useGameStore.setState(useGameStore.getInitialState(), true);
    useGameStore.getState().loadWorldData({ ...rolledBack(postCut(), 10), migrated: [] });
    expect(useGameStore.getState().talentPoints, 'SETUP: an unrecorded save with attributes was not refunded').toBe(1 + 3 + 2);
  });

  it('every load ends a held grab: the refund\'s respec, and any other world', () => {
    for (const blob of [fixture(), postCut()]) {
      useGameStore.setState({ voidhandHeld: true, heldPhantom: { color: '#8A8E94' } });
      useGameStore.getState().loadWorldData(blob);
      const s = useGameStore.getState();
      expect(s.voidhandHeld, 'a grabbed block was carried through a load').toBe(false);
      expect(s.heldPhantom).toBe(null);
    }
  });

  it('the refund notice counts the points after the load paid a retired quest\'s XP', () => {
    const f = fixture();
    const q = f.questState.quests.find((e) => e.id === 'builder');
    Object.assign(q, { progress: q.target, completed: true, claimed: false });
    f.progression.currentXP = xpForLevel(f.progression.level) - 10; // the Builder's 50 XP crosses a level
    useGameStore.getState().loadWorldData(f);
    const s = useGameStore.getState();
    expect(s.level, 'SETUP: the Builder XP did not level the player').toBe(6);
    expect(s.talentPoints).toBe(8 + 1);
    expect(cutNotes()).toEqual(['Talents now change your Aspects: 9 talent points to spend in Character (Tab)']);
  });

  it('one point reads singular, and a refund with nothing to spend raises no notice', () => {
    const one = fixture();
    Object.assign(one.progression, { talentPoints: 0, unlockedTalents: {}, attributes: { ...PRE_CUT_DEFAULTS, attributePoints: 5 } });
    useGameStore.getState().loadWorldData(one);
    expect(cutNotes()).toEqual(['Talents now change your Aspects: 1 talent point to spend in Character (Tab)']);
    notes.length = 0;
    const none = fixture();
    Object.assign(none.progression, { talentPoints: 0, unlockedTalents: {}, attributes: { ...PRE_CUT_DEFAULTS, attributePoints: 4 } });
    useGameStore.setState(useGameStore.getInitialState(), true);
    useGameStore.setState({ addNotification: (msg, _type, o) => notes.push(noteText(msg, o)) });
    useGameStore.getState().loadWorldData(none);
    expect(useGameStore.getState().talentPoints, 'SETUP: a save holding 4 attribute points was paid a talent point').toBe(0);
    expect(cutNotes(), 'a refund with nothing to spend told the player to spend points').toEqual([]);
  });
});
