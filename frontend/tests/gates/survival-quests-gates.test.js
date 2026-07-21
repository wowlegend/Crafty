import { describe, it, expect } from 'vitest';
import { QUEST_LIST } from '../../src/QuestSystem.jsx';
import { MOB_TYPES } from '../../src/game/mobTypes.js';

// Survival-progression quests (2026-06-14). The siege loop (onboarding promise -> siege audio) lacked a
// matching GOAL: no quest rewarded surviving nights, and the distinctive new hostiles (moss_brute elite,
// emberhusk siege-themed) had no targeted quest. This gate locks the new survive-nights quest TYPE + the
// two new-mob targeted quests + the capture-safety invariant (every new quest sits at tier >= 2 so the
// initial active set stays tier-1 first-3 -> baseline frames stable). These are genuine DATA-DRIVEN
// contract tests over the real QUEST_LIST / MOB_TYPES. The former "dawn->survive_nights wiring" case was a
// source-grep (readFileSync + regex of survivalSystem.js / QuestSystem.jsx) and is now a behavioral seam
// test -- src/world/dawnSurvival.test.js: resolveDawn credits the survive_nights quest EXACTLY ONCE per
// genuinely-survived night (gated on the grant descriptor, so a re-fired dawn can't double-count).
const byId = Object.fromEntries(QUEST_LIST.map((q) => [q.id, q]));

describe('survival-progression quests', () => {
  it('the survive-nights quest TYPE exists (a new progression dimension)', () => {
    const sn = QUEST_LIST.filter((q) => q.type === 'survive_nights');
    expect(sn.length).toBeGreaterThanOrEqual(2);
    for (const q of sn) {
      expect(q.target).toBeGreaterThan(0);
      expect(q.xpReward).toBeGreaterThan(0);
    }
  });

  it('targeted quests exist for the distinctive new hostiles (moss_brute, emberhusk)', () => {
    const brute = QUEST_LIST.find((q) => q.type === 'kill_type' && q.mobType === 'moss_brute');
    const ember = QUEST_LIST.find((q) => q.type === 'kill_type' && q.mobType === 'emberhusk');
    expect(brute, 'no moss_brute kill_type quest').toBeDefined();
    expect(ember, 'no emberhusk kill_type quest').toBeDefined();
    // the targeted mobTypes must be real registry hostiles
    expect(MOB_TYPES.moss_brute?.passive).not.toBe(true);
    expect(MOB_TYPES.emberhusk?.passive).not.toBe(true);
  });

  it('every quest referencing a mobType targets a real MOB_TYPES key', () => {
    for (const q of QUEST_LIST) {
      if (q.mobType) expect(MOB_TYPES[q.mobType], `quest ${q.id} targets unknown mob ${q.mobType}`).toBeDefined();
    }
  });

  it('capture-safety: every NEW quest is tier >= 2 (initial tier-1 first-3 active set unchanged)', () => {
    for (const id of ['nightwatch', 'siege_veteran', 'brute_breaker', 'ember_hunter']) {
      expect(byId[id], `quest ${id} missing`).toBeDefined();
      expect(byId[id].tier).toBeGreaterThanOrEqual(2);
    }
  });

  // (the former "dawn->survive_nights wiring" source-grep is now behavioral: src/world/dawnSurvival.test.js)
});
