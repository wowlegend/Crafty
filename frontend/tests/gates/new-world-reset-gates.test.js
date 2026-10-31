import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// STARTING A NEW WORLD KEPT THE PREVIOUS WORLD'S QUEST PROGRESS.
//
// `startNewWorld` is deliberately built as "load a save constructed from the store's INITIAL state", so
// that adding a persisted field resets for free rather than through a hand-maintained list. That design is
// right, and it collided with one line in `loadWorldData`:
//
//     questState: saveData.questState ?? state.questState
//
// `buildSaveData` writes `questState: state.questState || null`, so a fresh reset save carries the key PRESENT with
// value `null`, and `null ?? state.questState` yielded state.questState: the old world's quest and achievement mirror
// survived into the new one. The fix that followed kept the session's log for a save with NO key, as forward
// compatibility; but the session's log belongs to the world loaded before, so that save inherited it the same way
// (deep audit lane L3 round 2, DECISIONS 2026-10-31 item 292). A save with no log, null or absent, is a fresh log.
describe('startNewWorld resets quest progress, and so does any save with no log', () => {
  const PROGRESS = { completed: ['first_blood'], claimed: ['first_blood'], counters: { kills: 12 } };

  beforeEach(() => {
    useGameStore.setState({ questState: null });
  });

  it('CONTROL — the store can hold quest progress at all', () => {
    // Every assertion below is "progress is gone". If the store silently refused the write, they would
    // all pass against a store that never held anything.
    useGameStore.getState().setQuestState(PROGRESS);
    expect(useGameStore.getState().questState, 'the store never accepted the progress').toEqual(PROGRESS);
  });

  it('a NEW WORLD does not inherit the previous world\'s quest progress', () => {
    useGameStore.getState().setQuestState(PROGRESS);
    useGameStore.getState().startNewWorld('world-2');
    expect(
      useGameStore.getState().questState,
      'the new world kept the old world\'s completed quests and achievements'
    ).toBeNull();
  });

  it('loading a PRE-questState save is a fresh log too: the progress in memory is the world loaded before', () => {
    useGameStore.getState().setQuestState(PROGRESS);
    const legacy = { blocks: {}, inventory: {}, playerLevel: 3 }; // no questState key
    useGameStore.getState().loadWorldData(legacy);
    expect(useGameStore.getState().questState, 'an old save with no log inherited the session\'s quest progress').toBeNull();
  });

  it('loading a save that EXPLICITLY carries null clears progress', () => {
    // The distinction `??` could not make: key present, value null, means "this world has none".
    useGameStore.getState().setQuestState(PROGRESS);
    useGameStore.getState().loadWorldData({ questState: null });
    expect(useGameStore.getState().questState).toBeNull();
  });

  it('loading a save that carries real progress applies it', () => {
    useGameStore.setState({ questState: null });
    useGameStore.getState().loadWorldData({ questState: PROGRESS });
    expect(useGameStore.getState().questState).toEqual(PROGRESS);
  });

  it('a new world also resets the other progression the reset is built to clear', () => {
    // Guards the reset path more broadly, so a future change to loadWorldData's merge cannot quietly
    // reintroduce the same class on a different field.
    useGameStore.setState({ level: 9, ember: 80 });
    useGameStore.getState().startNewWorld('world-3');
    const s = useGameStore.getState();
    expect(s.level, 'level survived a new world').toBe(useGameStore.getInitialState().level);
    expect(s.ember, 'banked ember survived a new world').toBe(useGameStore.getInitialState().ember);
  });
});
