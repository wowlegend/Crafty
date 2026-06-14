import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { makeRepeatableQuest } from '../../src/QuestSystem.jsx';

// Endless/repeatable quests (2026-06-14, next-levers #9). The authored QUEST_LIST is finite (15 quests);
// once all are claimed, claimQuest's refill returns undefined and the quest tracker dries up -> no goal feed
// for the late game (a retention gap the holistic review flagged). This adds a repeatable end-game BOUNTY
// generator that kicks in when the authored list is exhausted, with a gently-scaling target + reward.
const __dir = dirname(fileURLToPath(import.meta.url));
const quest = readFileSync(resolve(__dir, '../../src/QuestSystem.jsx'), 'utf8');

describe('makeRepeatableQuest (pure end-game bounty)', () => {
  it('produces a valid kill-quest with a unique id per sequence', () => {
    const a = makeRepeatableQuest(0);
    expect(a.type).toBe('kill');
    expect(a.id).toBe('bounty_0');
    expect(a.target).toBeGreaterThan(0);
    expect(a.xpReward).toBeGreaterThan(0);
    expect(makeRepeatableQuest(3).id).toBe('bounty_3');
  });
  it('target + reward scale monotonically with the sequence', () => {
    expect(makeRepeatableQuest(2).target).toBeGreaterThan(makeRepeatableQuest(0).target);
    expect(makeRepeatableQuest(5).xpReward).toBeGreaterThan(makeRepeatableQuest(1).xpReward);
  });
  it('clamps a nullish / negative sequence to bounty 0', () => {
    expect(makeRepeatableQuest(undefined).id).toBe('bounty_0');
    expect(makeRepeatableQuest(-4).id).toBe('bounty_0');
  });
});

describe('claimQuest falls back to a bounty when the authored list is exhausted', () => {
  it('claimQuest uses makeRepeatableQuest as the refill fallback', () => {
    expect(quest).toMatch(/makeRepeatableQuest\(/);
    // the fallback is an OR after the authored-list find (so authored quests are preferred)
    expect(quest).toMatch(/QUEST_LIST\.find\([\s\S]{0,200}\|\|\s*makeRepeatableQuest/);
  });
});
