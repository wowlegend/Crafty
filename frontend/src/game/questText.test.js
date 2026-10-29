import { describe, it, expect } from 'vitest';
import { questTitle, questDescription, mobNoun, pluralForm } from './questText.js';
import { tIn } from '../i18n/i18n.js';
import { MOB_TYPES } from './mobTypes.js';
import { QUEST_LIST } from '../QuestSystem.jsx';

// QUEST TEXT FROM THE CREATURES' NAMES (W2-F step 7; reset-plan row 24; DECISIONS 2026-10-29 items 75-78). A quest
// that hunts one creature names it by the word on its nametag, MOB_TYPES[type].displayName, through the locale's
// t() keys, with the count in the plural form the locale's rules pick. The English nouns are generated from
// displayName (src/i18n/strings.js), so a creature renamed in the registry is renamed in every quest.
//
// WHAT THIS DOES NOT CHECK: the HUD tracker and the quest log rendering this text (tests/gates/quest-text-gates.test.jsx),
// or a saved quest seeding the hook (tests/store/questKeyMap.test.js).

const en = (k, v) => tIn('en', k, v);
const zh = (k, v) => tIn('zh-CN', k, v);
const quest = (id) => QUEST_LIST.find((q) => q.id === id);
const HUNTS = QUEST_LIST.filter((q) => q.mobType);
const LATIN = /[A-Za-z]/;

describe('a hunt names the creature on screen', () => {
  it('the zombie quest reads "Defeat 10 Husks" under "Husk Slayer"', () => {
    const z = quest('zombie_slayer');
    expect(z?.mobType, 'SETUP: the zombie quest is not a hunt').toBe('zombie');
    expect(questDescription(en, 'en', z)).toBe('Defeat 10 Husks');
    expect(questTitle(en, 'en', z)).toBe('Husk Slayer');
  });

  it('every hunt reads in English from its creature\'s display name and its count', () => {
    expect(HUNTS.map((q) => q.id), 'SETUP: the hunts are not the five the map in questKeyMap.test.js names')
      .toEqual(['zombie_slayer', 'spider_hunter', 'ember_hunter', 'undead_destroyer', 'brute_breaker']);
    const read = HUNTS.map((q) => [q.id, questTitle(en, 'en', q), questDescription(en, 'en', q)]);
    expect(read).toEqual([
      ['zombie_slayer', 'Husk Slayer', 'Defeat 10 Husks'],
      ['spider_hunter', 'Frontier Spider Hunter', 'Defeat 8 Frontier Spiders'],
      ['ember_hunter', 'Ember Husk Hunter', 'Defeat 10 Ember Husks'],
      ['undead_destroyer', 'Undead Destroyer', 'Defeat 25 Bonepickers'],
      ['brute_breaker', 'Moss Brute Breaker', 'Defeat 5 Moss Brutes'],
    ]);
  });

  it('a count of one takes the singular, and the count is the quest\'s own', () => {
    const one = { ...quest('zombie_slayer'), target: 1 };
    expect(questDescription(en, 'en', one)).toBe('Defeat 1 Husk');
    expect(questDescription(en, 'en', { ...quest('zombie_slayer'), target: 3 })).toBe('Defeat 3 Husks');
  });

  it('a quest that hunts no one creature keeps the text it was authored with', () => {
    const plain = quest('first_blood');
    expect(plain.mobType, 'SETUP: First Blood became a hunt').toBeUndefined();
    expect([questTitle(en, 'en', plain), questDescription(en, 'en', { ...plain, description: 'Cut down the first horror' })])
      .toEqual(['First Blood', 'Cut down the first horror']);
  });

  it('the saved English of a hunt is the rendered English, so a rollback build reads the creature\'s name too', () => {
    for (const q of HUNTS) expect([q.title, q.description], q.id).toEqual([questTitle(en, 'en', q), questDescription(en, 'en', q)]);
  });
});

describe('the nouns', () => {
  it('each creature\'s English singular is its display name, and its plural differs from it', () => {
    const types = Object.keys(MOB_TYPES);
    expect(types.length, 'SETUP: the registry is empty').toBeGreaterThan(5);
    for (const type of types) {
      expect(mobNoun(en, 'en', type, 1), type).toBe(MOB_TYPES[type].displayName);
      expect(mobNoun(en, 'en', type, 2), type).not.toBe(MOB_TYPES[type].displayName);
    }
  });

  it('English plurals add "s" except where English does not', () => {
    expect(mobNoun(en, 'en', 'zombie', 2)).toBe('Husks');
    expect(mobNoun(en, 'en', 'cow', 2)).toBe('Oxen');
  });

  it('the plural form comes from the locale\'s rules: English splits one from other, Chinese does not', () => {
    expect([pluralForm('en', 1), pluralForm('en', 0), pluralForm('en', 2)]).toEqual(['one', 'other', 'other']);
    expect([pluralForm('zh-CN', 1), pluralForm('zh-CN', 2)]).toEqual(['other', 'other']);
  });

  it('a type no registry entry has reads as itself, never as a key', () => {
    expect(mobNoun(en, 'en', 'not_a_mob', 2)).toBe('not_a_mob');
  });
});

describe('zh-CN renders the hunts in Chinese', () => {
  it('every hunt\'s title and description carry no Latin letters and keep the count', () => {
    for (const q of HUNTS) {
      const title = questTitle(zh, 'zh-CN', q);
      const desc = questDescription(zh, 'zh-CN', q);
      expect(LATIN.test(title) || LATIN.test(desc), `${q.id}: ${title} / ${desc}`).toBe(false);
      expect(desc, q.id).toContain(String(q.target));
    }
    expect(questDescription(zh, 'zh-CN', quest('zombie_slayer'))).toBe('击败 10 个尸傀');
  });

  it('every creature has a Chinese name', () => {
    for (const type of Object.keys(MOB_TYPES)) {
      const name = mobNoun(zh, 'zh-CN', type, 2);
      expect(name.length > 0 && !LATIN.test(name), `${type}: ${name}`).toBe(true);
    }
  });
});
