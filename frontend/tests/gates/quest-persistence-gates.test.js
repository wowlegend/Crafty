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
  // The "buildSaveData serializes questState" case that used to sit here regexed saveSchema.js for the
  // bare token `questState` — which that file's own explanatory comments contain twice, so it would have
  // passed with the field removed from the payload entirely. The claim moved to
  // src/game/saveSchema.test.js, which now builds a save from a fixture carrying real quest progress and
  // asserts it comes back out. A serialization claim belongs to something that serializes.
  it('App autosave also triggers on questState (quest/achievement progress persists on tab-close)', () => {
    // Kept as a source assertion: this is a cross-file wiring invariant inside a subscribe callback that
    // cannot be reached without booting the app. Anchored to the comparison FORM, and asserted unique so
    // a second copy of the trigger cannot mask a deleted one.
    const app = read('src/App.jsx');
    const hits = app.match(/s\.questState\s*!==\s*prevS\.questState/g) || [];
    expect(hits.length, 'the autosave no longer triggers on questState — progress dies on tab-close').toBe(1);
  });
});
