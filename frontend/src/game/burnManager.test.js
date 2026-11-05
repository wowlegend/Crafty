import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeBurnManager } from './burnManager.js';
import { useGameStore } from '../store/useGameStore';
import { setActive } from '../input/inputState';
import { tickWorldClock } from './worldClock.js';

// The game as the frame loop runs it: the world clock ticks first (systems/WorldClockTicker.jsx), then the spell system's
// frame pumps the burns (EnhancedMagicSystem). Play has begun and input is live, so nothing holds the world unless a case
// pauses it or the store's triggerHitstop freezes it. Each case's fake clock starts afresh, so the world clock is ticked
// once before the case begins, as the frame before a cast would have ticked it.
beforeEach(() => {
  vi.useFakeTimers();
  useGameStore.setState({ gameStarted: true, isAlive: true, hitstopUntil: 0, hitstopStart: 0, hitstopFrozenTotal: 0 });
  setActive(true);
  tickWorldClock(performance.now());
});
afterEach(() => {
  setActive(false);
  useGameStore.setState({ gameStarted: false, hitstopUntil: 0, hitstopStart: 0, hitstopFrozenTotal: 0 });
  vi.useRealTimers();
});

const FRAME_MS = 16;
function frame(mgr, ms = FRAME_MS) {
  vi.advanceTimersByTime(ms);
  tickWorldClock(performance.now());
  mgr.pump();
}
function frames(mgr, ms, step = FRAME_MS) {
  for (let t = 0; t < ms; t += step) frame(mgr, step);
}

describe('makeBurnManager: fire damage over time, a tick per second of world time', () => {
  it('ticks damage once per second for `duration` ticks, then clears', () => {
    const hits = [];
    const mgr = makeBurnManager();
    const t0 = performance.now();
    mgr.start('m1', 3, 5, () => (id, dps) => { hits.push([id, dps, performance.now() - t0]); return { id, health: 10 }; });
    expect(mgr.size).toBe(1);
    frames(mgr, 4000); // well past the 3 s burn
    expect(hits.map(([id, dps]) => [id, dps])).toEqual([['m1', 5], ['m1', 5], ['m1', 5]]); // exactly 3 ticks
    expect(hits.map(([, , t]) => Math.round(t / 1000)), 'the ticks did not come a second apart').toEqual([1, 2, 3]);
    expect(mgr.size).toBe(0); // cleared at expiry
  });

  it('stops the instant the mob is gone (damageMob returns null)', () => {
    const mgr = makeBurnManager();
    let calls = 0;
    mgr.start('m1', 10, 5, () => () => { calls++; return calls < 2 ? { id: 'm1' } : null; });
    frames(mgr, 10000);
    expect(calls).toBe(2); // tick 1 hits, tick 2 sees the mob dead and clears
    expect(mgr.size).toBe(0);
  });

  it('stops when the global damage method disappears', () => {
    let damageMob = () => ({ id: 'm1' });
    const mgr = makeBurnManager();
    mgr.start('m1', 10, 5, () => damageMob);
    frames(mgr, 2000);
    damageMob = null; // the magic system tore down its GameMethods
    frames(mgr, 5000);
    expect(mgr.size).toBe(0);
  });

  // The unmount cleanup: a burn still active when EnhancedMagicSystem unmounts must deal nothing more.
  // MUTATION-PROOF: make stopAll a no-op and damage keeps landing after it.
  it('stopAll() halts an in-flight burn so no further damage lands (the unmount cleanup)', () => {
    const hits = [];
    const mgr = makeBurnManager();
    mgr.start('m1', 100, 5, () => (id) => { hits.push(id); return { id }; }); // a long burn, still active
    frames(mgr, 2000);
    const before = hits.length;
    expect(before).toBe(2);
    expect(mgr.size).toBe(1);
    mgr.stopAll(); // <- component unmount
    expect(mgr.size).toBe(0);
    frames(mgr, 10000);
    expect(hits.length).toBe(before); // no further ticks after stopAll
  });

  it('tracks multiple concurrent burns and stopAll clears them all', () => {
    const mgr = makeBurnManager();
    const dm = () => ({ id: 'x' });
    mgr.start('a', 100, 1, () => dm);
    mgr.start('b', 100, 1, () => dm);
    expect(mgr.size).toBe(2);
    mgr.stopAll();
    expect(mgr.size).toBe(0);
  });

  describe('a held world holds the burn: no damage lands and no tick is spent', () => {
    it('through a pause, keeping the part of the second it had run, then every remaining tick lands after the resume', () => {
      const hits = [];
      const mgr = makeBurnManager();
      mgr.start('m1', 3, 5, () => (id) => { hits.push(performance.now()); return { id }; });
      frames(mgr, 1504);
      expect(hits.length, 'the burn never ticked in play').toBe(1);
      setActive(false);
      frames(mgr, 5008);
      expect(hits.length, 'the burn ticked while the game was paused').toBe(1);
      expect(mgr.size, 'the pause ended the burn instead of holding it').toBe(1);
      setActive(true);
      const resumed = performance.now();
      frames(mgr, 4000);
      expect(hits.length, 'the burn lost ticks to the pause').toBe(3);
      // Half a second of world time had run toward the second tick when the pause began, so it lands half a second after
      // the resume, not a whole second.
      expect(hits[1] - resumed, `the second tick came ${hits[1] - resumed} ms after the resume`).toBeGreaterThanOrEqual(496 - FRAME_MS);
      expect(hits[1] - resumed, `the second tick came ${hits[1] - resumed} ms after the resume`).toBeLessThanOrEqual(496 + FRAME_MS);
      expect(mgr.size).toBe(0);
    });

    it('through a hitstop, then every tick lands after it', () => {
      const hits = [];
      const mgr = makeBurnManager();
      useGameStore.getState().triggerHitstop(3000);
      mgr.start('m1', 2, 5, () => (id) => { hits.push(id); return { id }; });
      frames(mgr, 2992);
      expect(hits.length, 'the burn ticked through a hitstop').toBe(0);
      frames(mgr, 3008);
      expect(hits.length, 'the burn lost ticks to the hitstop').toBe(2);
      expect(mgr.size).toBe(0);
    });
  });

  // THE BURN FOLLOWS WORLD TIME THROUGH ANY PATTERN OF HITSTOPS. Every direct hit the player lands freezes the world
  // (trauma.js HITSTOP: 45 ms light, 130 ms crit), and so does each hit the player takes (hurtFeel.js hurtStopMs), so in a
  // fight the freezes come many times a second: a fireball cast on every 333 ms cooldown (Components.jsx CAST_COOLDOWN),
  // or a skitterling biting every 700 ms. Each tick must land on its second of WORLD time, the clock the freezes hold.
  // The world time is counted here from the case's own freezes, not read from the game.
  describe('through repeated hitstops, each tick lands on its second of world time', () => {
    function underFreezes(everyMs, freezeMs, wallMs) {
      const hits = [];
      const freezes = [];
      const mgr = makeBurnManager();
      const t0 = performance.now();
      const worldAt = (t) => (t - t0) - freezes.reduce((s, [a, b]) => s + Math.max(0, Math.min(t, b) - a), 0);
      mgr.start('m1', 4, 5, () => (id) => { hits.push(worldAt(performance.now())); return { id }; });
      for (let t = 0; t < wallMs; t += FRAME_MS) {
        frame(mgr);
        const now = performance.now();
        if (Math.floor((now - t0) / everyMs) > Math.floor((now - t0 - FRAME_MS) / everyMs)) {
          useGameStore.getState().triggerHitstop(freezeMs);
          freezes.push([now, now + freezeMs]);
        }
      }
      return { hits, world: worldAt(performance.now()), freezes: freezes.length };
    }
    const onTheSecond = (r) => r.hits.map((w, i) => w >= (i + 1) * 1000 && w < (i + 1) * 1000 + FRAME_MS);

    it('a 45 ms freeze every 700 ms for 4.8 s, at 16 ms frames: four ticks, each within a frame of its second', () => {
      const r = underFreezes(700, 45, 4800);
      expect(r.freezes, `SETUP: the case froze the world ${r.freezes} times`).toBe(6);
      expect(r.world, `SETUP: ${r.world} ms of world time ran`).toBeGreaterThan(4000);
      expect(r.hits.length, `the burn dealt ${r.hits.length} of its 4 ticks in ${Math.round(r.world)} ms of world time: ${JSON.stringify(r.hits)}`).toBe(4);
      expect(onTheSecond(r), `the ticks, in ms of world time: ${JSON.stringify(r.hits)}`).toEqual([true, true, true, true]);
    });

    it('a 130 ms crit freeze on every 333 ms cast for 8 s: four ticks, each within a frame of its second', () => {
      const r = underFreezes(333, 130, 8000);
      expect(r.freezes, `SETUP: the case froze the world ${r.freezes} times`).toBe(24);
      expect(r.world, `SETUP: ${r.world} ms of world time ran`).toBeGreaterThan(4000);
      expect(r.hits.length, `the burn dealt ${r.hits.length} of its 4 ticks in ${Math.round(r.world)} ms of world time: ${JSON.stringify(r.hits)}`).toBe(4);
      expect(onTheSecond(r), `the ticks, in ms of world time: ${JSON.stringify(r.hits)}`).toEqual([true, true, true, true]);
    });
  });

  // A busy main thread runs timers behind frame work while frames keep coming (a 600 ms timer fired after ~5 s under a
  // 10x CPU throttle, tests/e2e/music-bus.spec.js), and the fireball's burn on the dragon then dealt no tick in its
  // window (registry REVIEW:e2e-flakes:dragon-fight-burning-zone-never-reached). Every timer here runs 5 s late.
  describe('with every timer held 5 s back, as a busy main thread holds them', () => {
    let onTime;
    beforeEach(() => {
      onTime = globalThis.setInterval;
      globalThis.setInterval = (fn, ms, ...a) => onTime(fn, ms + 5000, ...a);
    });
    afterEach(() => { globalThis.setInterval = onTime; });

    it('ticks on time from the frame loop', () => {
      const hits = [];
      const mgr = makeBurnManager();
      mgr.start('m1', 3, 5, () => (id) => { hits.push([id, Math.round(performance.now())]); return { id }; });
      const t0 = performance.now();
      for (let i = 0; i < 32; i++) frame(mgr, 100);
      expect(hits.length, `3.2 s into a 3-tick burn, the frame loop dealt ${hits.length} ticks: ${JSON.stringify(hits.map(([, t]) => t - t0))}`).toBe(3);
      expect(hits.map(([, t]) => Math.round((t - t0) / 1000)), 'the ticks did not come a second apart').toEqual([1, 2, 3]);
      expect(mgr.size, 'the burn did not clear after its last tick').toBe(0);
    });

    // A tick dealt late, on the first frame past its second, does not push the ticks after it: each is due on its own
    // second of world time, so a burn of four ticks ends on the frame after its fourth second, whatever the frame rate.
    it('at 270 ms frames, each tick lands on the first frame past its second, and the lateness does not add up', () => {
      const hits = [];
      const mgr = makeBurnManager();
      const t0 = performance.now();
      mgr.start('m1', 4, 5, () => (id) => { hits.push(Math.round(performance.now() - t0)); return { id }; });
      for (let i = 0; i < 20; i++) frame(mgr, 270);
      expect(hits, 'the ticks, ms after the burn began').toEqual([1080, 2160, 3240, 4050]);
    });
  });

  // A stalled frame (CI's slowest, or a tab brought back) passes seconds of world time at once: the burn deals the ticks
  // it owes, one a frame, so it ends on its own seconds of world time and never lands them all in one frame.
  it('after a 3.5 s stalled frame, the three ticks it owes land a frame apart', () => {
    const hits = [];
    const mgr = makeBurnManager();
    const t0 = performance.now();
    mgr.start('m1', 4, 5, () => (id) => { hits.push(Math.round(performance.now() - t0)); return { id }; });
    frame(mgr, 3500);
    frames(mgr, 1000);
    expect(hits, 'the ticks, ms after the burn began').toEqual([3500, 3516, 3532, 4012]); // the fourth: the first frame past 4 s
  });

  // A hidden tab runs no frames, and the world they move stops with them: a burn deals nothing on timers alone. A touch
  // page that is hidden is not paused, so when its frames come back the world clock has run on, and the ticks it owes
  // land a frame apart.
  it('with timers running and no frame drawn, as in a hidden tab, a burn deals nothing until frames come back', () => {
    const hits = [];
    const mgr = makeBurnManager();
    mgr.start('m1', 3, 5, () => (id) => { hits.push(id); return { id }; });
    vi.advanceTimersByTime(5000);
    expect(hits.length, 'the burn ticked in 5 s with no frame drawn').toBe(0);
    frames(mgr, 3 * FRAME_MS);
    expect(hits.length, 'the frames came back and the burn did not deal the ticks it owed').toBe(3);
  });

  // However often the frame loop asks, a tick is dealt once: every 10 ms, and twice in each frame.
  it('each tick lands once, with the frame loop asking every 10 ms and twice a frame', () => {
    const hits = [];
    const mgr = makeBurnManager();
    mgr.start('m1', 3, 5, () => (id) => { hits.push(Math.round(performance.now())); return { id }; });
    const t0 = performance.now();
    for (let i = 0; i < 500; i++) { frame(mgr, 10); mgr.pump(); }
    expect(hits.map((t) => t - t0), 'a 3-tick burn, its frame loop asking every 10 ms').toEqual([1000, 2000, 3000]);
  });
});
