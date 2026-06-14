import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { QUEST_LIST } from '../../src/QuestSystem.jsx';
import { MOB_TYPES } from '../../src/game/mobTypes.js';

// Survival-progression quests (2026-06-14). The siege loop (onboarding promise -> siege audio) lacked a
// matching GOAL: no quest rewarded surviving nights, and the distinctive new hostiles (moss_brute elite,
// emberhusk siege-themed) had no targeted quest. This gate locks the new survive-nights quest TYPE + its
// dawn wiring + the two new-mob targeted quests, and enforces the capture-safety invariant: every new
// quest sits at tier >= 2 so the initial active set (tier-1 first-3) is unchanged -> baseline frames stable.
const __dir = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(__dir, '../../src', p), 'utf8');
const quest = read('QuestSystem.jsx');
const survival = read('world/survivalSystem.js');

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

  it('the dawn->survive_nights wiring is in place (QuestSystem exposes onNightSurvived; survival fires it once per survived night)', () => {
    expect(quest).toMatch(/onNightSurvived/);
    expect(quest).toMatch(/updateQuestProgress\('survive_nights'\)/);
    expect(quest).toMatch(/setState\(\{\s*onNightSurvived/);
    // survival fires it only when the dawn reward actually granted (r truthy) -> exactly once per night
    expect(survival).toMatch(/if \(r\)[\s\S]*onNightSurvived/);
  });
});
