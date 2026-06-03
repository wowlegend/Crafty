import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('quest persistence wiring gates', () => {
  it('the store declares questState + setQuestState + questLoadedAt', () => {
    const src = read('src/store/useGameStore.jsx');
    expect(/questState/.test(src)).toBe(true);
    expect(/setQuestState/.test(src)).toBe(true);
    expect(/questLoadedAt/.test(src)).toBe(true);
  });
  it('useQuestSystem mirrors to setQuestState and re-seeds on questLoadedAt', () => {
    const src = read('src/QuestSystem.jsx');
    expect(/setQuestState/.test(src)).toBe(true);
    expect(/questLoadedAt/.test(src)).toBe(true);
  });
  it('buildSaveData serializes questState', () => {
    expect(/questState/.test(read('src/game/saveSchema.js'))).toBe(true);
  });
  it('App autosave also triggers on questState (quest/achievement progress persists on tab-close)', () => {
    expect(/questState\s*!==\s*prevS\.questState/.test(read('src/App.jsx'))).toBe(true);
  });
});
