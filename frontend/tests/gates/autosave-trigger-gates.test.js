import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildSaveData, PERSISTED_KEYS } from '../../src/game/saveSchema.js';
import { installAutosave } from '../../src/game/autosave.js';
import { useGameStore } from '../../src/store/useGameStore';

// EVERY FIELD A SAVE RECORDS CAN SCHEDULE A SAVE (reset plan row 41, arch A20).
//
// The autosave used to trigger on a hand-kept list of 26 comparisons in App.jsx, and the list fell behind the save more
// than once: coins, XP, the night count and the win were each persisted and could never schedule a save, so a session
// that changed only them died with the tab. Now the save declares its keys (PERSISTED_KEYS, beside buildSaveData) and
// the autosave triggers on exactly those. Two questions, asked separately:
//   1. does PERSISTED_KEYS name every store key buildSaveData reads? Traced through a recording Proxy over the initial
//      state, so a new persisted field and a stale entry both show; a field read only on a branch the initial state
//      does not take (say, only once the game is won) is not traced.
//   2. does a change to each one, written through the real store, make the installed autosave save?
// Not checked here: that App.jsx installs it (save-consolidation-gates reads that call), or what the save writes
// (saveSchema.test.js).

const DELAY = 5000;

function readsOf(state) {
  const reads = new Set();
  buildSaveData(new Proxy(state, { get(t, k) { if (typeof k === 'string') reads.add(k); return t[k]; } }), { position: { x: 0, y: 0, z: 0 } });
  return reads;
}

/** A value for `key` that is not identical to `v`, of the same kind. */
function changed(v) {
  if (v instanceof Map) return new Map(v);
  if (Array.isArray(v)) return [...v];
  if (v && typeof v === 'object') return { ...v };
  if (typeof v === 'number') return v + 1;
  if (typeof v === 'boolean') return !v;
  if (typeof v === 'string') return `${v}x`;
  return {};
}

describe('PERSISTED_KEYS is what a save records', () => {
  it('names exactly the store keys buildSaveData reads, on an empty and on a real state', () => {
    const reads = new Set([...readsOf({}), ...readsOf(useGameStore.getInitialState())]);
    expect(reads.size, 'the trace saw nothing: the Proxy is not reaching buildSaveData').toBeGreaterThan(20);
    expect([...reads].sort(), 'PERSISTED_KEYS and the save disagree').toEqual([...PERSISTED_KEYS].sort());
  });

  it('every key exists in the store, so a write to it is a write the autosave can see', () => {
    const initial = useGameStore.getInitialState();
    const missing = PERSISTED_KEYS.filter((k) => !(k in initial));
    expect(missing, 'persisted keys the store never holds').toEqual([]);
  });
});

describe('the installed autosave', () => {
  let save;
  let doc;
  let win;
  let uninstall;
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.setState(useGameStore.getInitialState(), true);
    save = vi.fn();
    doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    win = new EventTarget();
    uninstall = installAutosave(useGameStore, { save, delayMs: DELAY, doc, win });
  });
  afterEach(() => {
    uninstall();
    vi.useRealTimers();
  });

  it('a change to each persisted key, through the store, saves once within the delay', () => {
    let checked = 0;
    const silent = [];
    for (const key of PERSISTED_KEYS) {
      save.mockClear();
      useGameStore.setState({ [key]: changed(useGameStore.getState()[key]) });
      vi.advanceTimersByTime(DELAY);
      if (save.mock.calls.length !== 1) silent.push(`${key} (${save.mock.calls.length} saves)`);
      checked++;
    }
    expect(checked, 'the loop checked no key').toBe(PERSISTED_KEYS.length);
    expect(silent, 'persisted keys whose change never saved').toEqual([]);
  });

  it('control: a change to a key no save records schedules nothing', () => {
    // Health and mana are saved since lane L8 (DECISIONS 2026-10-31 item 330); the hit flash and the shake are not.
    useGameStore.setState({ playerPosition: [5, 60, 5], damageFlash: true, screenShake: 3 });
    vi.advanceTimersByTime(DELAY * 2);
    expect(save, 'the autosave saved for a field the save does not hold').not.toHaveBeenCalled();
  });

  it('a field that changes every second, as the clock does, still saves within the delay of its first change', () => {
    for (let s = 1; s <= 12; s++) {
      useGameStore.setState({ gameTime: s });
      vi.advanceTimersByTime(1000);
    }
    expect(save.mock.calls.length, 'a steady stream of changes held the save off for 12 s').toBeGreaterThanOrEqual(2);
  });

  it('hiding the tab or unloading saves a pending change at once, and nothing when none is pending', () => {
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('beforeunload'));
    expect(save, 'a flush with nothing pending saved').not.toHaveBeenCalled();
    // The change is made while the page is shown: one made while it is hidden is held until it is shown (item 331,
    // tests/gates/hidden-tab-gates.test.jsx).
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    useGameStore.setState({ coins: 40 });
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(save, 'hiding the tab did not save the pending change').toHaveBeenCalledTimes(1);
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    useGameStore.setState({ coins: 41 });
    win.dispatchEvent(new Event('beforeunload'));
    expect(save, 'unloading did not save the pending change').toHaveBeenCalledTimes(2);
  });

  it('uninstalling stops it: no subscription, no listeners, no pending save', () => {
    useGameStore.setState({ coins: 9 });
    uninstall();
    uninstall = () => {};
    vi.advanceTimersByTime(DELAY);
    useGameStore.setState({ coins: 10 });
    win.dispatchEvent(new Event('beforeunload'));
    vi.advanceTimersByTime(DELAY);
    expect(save).not.toHaveBeenCalled();
  });
});
