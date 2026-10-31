// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { EVENTS, on, emit, _resetBus } from '../../src/game/eventBus.js';
import { runIsolatedEffects } from '../../src/game/isolatedEffects.js';
import { useBossSystem } from '../../src/world/bossSystem.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { GameMethods } from '../../src/GameMethods.js';
import { blightHeartSite } from '../../src/world/blightHeart.js';
import { bossTierStats } from '../../src/game/bossTier.js';
import { ISOLATED_BINDING } from '../e2e/_isolatedFailures.js';

// A FAILURE THAT IS ISOLATED IS STILL A FAILURE, AND IT IS SEEN (deep audit 2026-10-30, lane L12;
// AUDIT:debt:isolation-swallows-errors).
//
// The event bus and the two boss callers of runIsolatedEffects exist so that one throwing reactor cannot strand the
// rest: a missing sound must not cost the player the dragon's win. They kept the first half of that and dropped the
// second: the bus caught with an empty block, and both boss callers discarded the failures runIsolatedEffects returned.
// A quest reactor that began throwing would therefore freeze kill quests while the ember bar kept filling, with no
// console line, nothing in window.__debugLogs and nothing for the e2e error watcher to find. (The audit's verifier
// measured exactly that: 'emit threw=false secondSubscriberRan=1 consoleLines=0'.)
//
// What these assert, each from the player's side of the seam:
//  - a throwing subscriber is logged with the event's name and its error, and the next subscriber still runs;
//  - a failed effect in a runIsolatedEffects list is logged with its own name, the rest still run and the failures are
//    still returned;
//  - the REAL boss hook, driven through its arrival poll and a kill with a throwing notice and a throwing grantXP, logs
//    both, and the win still lands (the presence cases first: the same path with effects that log are seen by the spy,
//    so a silent run means silence and not a blind spy);
//  - the DEV counter an e2e or a probe reads (window.__isolatedFailures) rises once per failure. The production build
//    drops console calls (vite.config.js esbuild.drop), so the counter is DEV only: there is no console to report to.
//
// Mutation-Proof: scripts/dev/mutate.sh on this file, receipts in the commit.

const INITIAL = useGameStore.getState();
const seen = () => (typeof window.__isolatedFailures === 'object' ? window.__isolatedFailures.count : 0);

let errorSpy;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  _resetBus();
});
afterEach(() => {
  errorSpy.mockRestore();
  _resetBus();
  vi.useRealTimers();
});

/** The console.error lines as one string each, errors written as their message. */
const lines = () => errorSpy.mock.calls.map((a) => a.map((x) => (x instanceof Error ? `Error(${x.message})` : String(x))).join(' '));

describe('the dev counter', () => {
  it('is published at load with a count of 0, so a page with no failure reads differently from a page without the instrument', () => {
    // seen() reads 0 for both an absent counter and a zero one; this is the case that tells them apart.
    expect(window.__isolatedFailures, 'the counter is not on window after the module loaded').toBeTypeOf('object');
    expect(window.__isolatedFailures.count).toBeTypeOf('number');
  });
});

// The e2e side collects through the binding the fixture exposes (tests/e2e/_isolatedFailures.js), by the name it exports:
// a binding survives a reload, so a failure before one is kept. These drive the producer half of that seam.
describe('the e2e binding: the module arms it at load and reports each failure through it', () => {
  afterEach(() => { delete window[ISOLATED_BINDING]; });

  it('a fresh load of the module calls the binding once with { kind: "armed" }', async () => {
    const sent = [];
    window[ISOLATED_BINDING] = (event) => { sent.push(event); return Promise.resolve(); };
    vi.resetModules();
    await import('../../src/game/isolatedEffects.js');
    expect(sent, 'the module loaded and did not arm the e2e binding').toEqual([{ kind: 'armed' }]);
  });

  it('a failed effect and a throwing bus subscriber are each sent with where and the message', () => {
    const sent = [];
    window[ISOLATED_BINDING] = (event) => { sent.push(event); return Promise.resolve(); };
    runIsolatedEffects([['the loot grant', () => { throw new Error('no chest'); }]]);
    on(EVENTS.reward, () => { throw new Error('quest reactor'); });
    emit(EVENTS.reward);
    expect(sent).toEqual([
      { kind: 'failure', where: 'the loot grant', message: 'no chest' },
      { kind: 'failure', where: 'the reward event', message: 'quest reactor' },
    ]);
  });

  it('a binding that rejects (a page torn down mid-call) does not throw into the game', async () => {
    window[ISOLATED_BINDING] = () => Promise.reject(new Error('Target closed'));
    const rejections = [];
    const onRejection = (e) => rejections.push(e);
    process.on('unhandledRejection', onRejection);
    try {
      expect(() => runIsolatedEffects([['x', () => { throw new Error('y'); }]])).not.toThrow();
      await new Promise((r) => setTimeout(r, 10));
      expect(rejections, 'the rejected binding call surfaced as an unhandled rejection').toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });
});

describe('the event bus reports a subscriber that throws, and still runs the rest', () => {
  it('presence: a subscriber that logs on its own is seen by the spy through the real bus', () => {
    on(EVENTS.reward, () => console.error('instrument-check'));
    emit(EVENTS.reward);
    expect(lines()).toEqual(['instrument-check']);
  });

  it('a throwing subscriber is logged with the event name and its error; the next subscriber runs', () => {
    let second = 0;
    on(EVENTS.mobKill, () => { throw new Error('quest reactor broke'); });
    on(EVENTS.mobKill, () => { second++; });
    const before = seen();
    emit(EVENTS.mobKill, 'zombie', [0, 0, 0], 'player');
    expect(second, 'one reactor failing silenced the others').toBe(1);
    const out = lines();
    expect(out, 'the throw was dropped with no console line').toHaveLength(1);
    expect(out[0]).toContain('mobKill');
    expect(out[0]).toContain('Error(quest reactor broke)');
    expect(seen() - before, 'the DEV counter did not rise by one').toBe(1);
  });

  it('a subscriber that throws something other than an Error is reported too', () => {
    // `throw 'x'` and `throw undefined` are legal; a report that only accepts Error objects drops exactly those.
    on(EVENTS.victory, () => { throw 'plain string'; });
    on(EVENTS.victory, () => { throw undefined; });
    const before = seen();
    emit(EVENTS.victory);
    expect(lines().filter((l) => l.includes('victory'))).toHaveLength(2);
    expect(seen() - before).toBe(2);
    expect(window.__isolatedFailures.last).toContain('undefined');
  });

  it('every failure of one emit is reported, not just the first', () => {
    on(EVENTS.levelUp, () => { throw new Error('a'); });
    on(EVENTS.levelUp, () => { throw new Error('b'); });
    const before = seen();
    emit(EVENTS.levelUp, 2);
    expect(lines().filter((l) => l.includes('levelUp'))).toHaveLength(2);
    expect(seen() - before).toBe(2);
  });
});

describe('runIsolatedEffects reports each failed effect by name and returns the failures', () => {
  it('logs the failed effect under its own name, runs the rest, returns the failure', () => {
    const ran = [];
    const failed = runIsolatedEffects([
      ['first', () => ran.push('first')],
      ['sound', () => { throw new Error('no audio'); }],
      ['last', () => ran.push('last')],
    ]);
    expect(ran, 'a failing effect stranded the ones after it').toEqual(['first', 'last']);
    expect(failed.map((f) => f.name)).toEqual(['sound']);
    const out = lines();
    expect(out, 'the failed effect was dropped with no console line').toHaveLength(1);
    expect(out[0]).toBe('isolated failure in sound: Error(no audio)');
  });

  it('logs nothing for a list that does not throw (the spy is not simply always full)', () => {
    runIsolatedEffects([['a', () => {}], ['b', undefined]]);
    expect(lines()).toEqual([]);
  });
});

// The boss hook's two callers, reached through the real arrival poll and the real store damageBoss: no DEV spawn hook, no
// stub of the helper. The notice that throws is the one the isolated list sends; the hook's other notices are not
// isolated and are left alone.
describe('the real boss hook reports its isolated effects when they throw', () => {
  function scenario({ notify, grantXP }) {
    useGameStore.setState(INITIAL, true);
    const lair = blightHeartSite();
    useGameStore.setState({
      bossActive: false, bossHealth: bossTierStats(0).health, bossDefeated: false, bossTier: 0, gameWon: false, victoryPending: false,
      playerPosition: { x: lair.x, y: 20, z: lair.z }, addNotification: notify,
    });
    const origGrant = GameMethods.grantXP;
    GameMethods.grantXP = grantXP;
    vi.useFakeTimers();
    const { result, rerender, unmount } = renderHook(({ lvl }) => useBossSystem(lvl), { initialProps: { lvl: 10 } });
    try {
      errorSpy.mockClear();
      act(() => { vi.advanceTimersByTime(1600); });
      rerender({ lvl: 10 });
      const arrival = { active: result.current.bossActive, won: useGameStore.getState().gameWon, lines: lines() };
      errorSpy.mockClear();
      act(() => useGameStore.getState().damageBoss(1e6));
      rerender({ lvl: 10 });
      return { arrival, kill: { lines: lines(), won: useGameStore.getState().gameWon } };
    } finally {
      unmount();
      GameMethods.grantXP = origGrant;
    }
  }
  const throwingNotify = (key) => { if (key === 'notice.bossAwakens' || key === 'notice.bossDefeated') throw new Error(`notify broke: ${key}`); };
  const throwingXP = () => { throw new Error('grantXP broke'); };

  it('presence: effects that log on their own are seen by the spy on both paths', () => {
    const r = scenario({ notify: () => console.error('instrument-notify'), grantXP: () => console.error('instrument-grantXP') });
    expect(r.arrival.active, 'the real arrival poll did not wake the dragon').toBe(true);
    expect(r.arrival.lines.some((l) => l.includes('instrument-notify'))).toBe(true);
    expect(r.kill.lines.some((l) => l.includes('instrument-grantXP'))).toBe(true);
  });

  it('a throwing entrance notice and a throwing grantXP are logged, and the win still lands', () => {
    const before = seen();
    const r = scenario({ notify: throwingNotify, grantXP: throwingXP });
    expect(r.arrival.active, 'presence: the arrival poll woke the dragon').toBe(true);
    expect(r.arrival.won, 'the kill had not happened during the arrival').toBe(false);
    expect(r.kill.won, 'presence: the kill ran and the win latch fired').toBe(true);
    expect(r.arrival.lines.some((l) => l.includes('Error(notify broke: notice.bossAwakens)')), `the entrance's failure was dropped: ${JSON.stringify(r.arrival.lines)}`).toBe(true);
    expect(r.kill.lines.some((l) => l.includes('Error(notify broke: notice.bossDefeated)')), `the kill's notice failure was dropped: ${JSON.stringify(r.kill.lines)}`).toBe(true);
    expect(r.kill.lines.some((l) => l.includes('Error(grantXP broke)')), `the kill's grantXP failure was dropped: ${JSON.stringify(r.kill.lines)}`).toBe(true);
    expect(seen() - before, 'the DEV counter did not rise once per failure (3)').toBe(3);
  });
});
