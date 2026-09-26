import { describe, it, expect } from 'vitest';
import { Clock } from 'three';
import { stepCap, switchKeepingClock } from '../../src/render/FrameCap.jsx';
import { sanitizeSettings, SETTINGS_DEFAULTS, initSettingsPersistence } from '../../src/game/settingsPersist.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';

/**
 * THE FRAME CAP (plan 2026-09-23-crafty-perf-heat-ipad, Task 4). Kevin: an M3 Max's fans at full speed on the live
 * site. The loop rendered at the display's rate — 120 Hz on a ProMotion laptop, twice the GPU work of 60 — and the
 * governor could not see it (it samples frame rate, not cost).
 *
 * stepCap is the cap's one rAF tick, driven here over simulated displays WITH timer jitter: the rate that comes out is
 * the property, on every display — not one hand-picked tick.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   F1 the cap ignored (every tick renders) -> 120 Hz renders 120
 *   F2 plausible-wrong: the clock resets to the tick time (last = t) -> 144 Hz renders 48
 *   F3 the 1 ms slack removed -> the late-first-frame 60 Hz case drops frames (SURVIVED the seeded-jitter case alone)
 *   F4 plausible-wrong: the sanitizer clamps any number instead of accepting only 0 / 60 -> the persistence case
 *   F5 the clock not restored after a loop switch -> "the clock jumped back"
 *   F6 plausible-wrong: the time read AFTER the switch (it reads R3F's zero) -> "the clock jumped back"
 *   F7 frameCap left out of the saved settings -> "Unlimited did not survive a reload"
 *   F8 plausible-wrong: saved, but the change detector ignores it -> "Unlimited did not survive a reload"
 *   and I0, an identity mutant (a comment edit in FrameCap.jsx, same harness and batch), SURVIVED.
 *
 * BLIND SPOT: nothing here renders, and the loop switch here is a stand-in for R3F's. That the cap really draws frames
 * through the real Canvas, that capture/probe modes are left uncapped, and that R3F's own setFrameloop is the one
 * wrapped, are the e2e's job (tests/e2e/frame-cap.spec.js).
 */
const run = (hz, fps, seconds = 10) => {
  let last = -Infinity, n = 0;
  let seed = 7;
  const jitter = () => { seed = (seed * 16807) % 2147483647; return ((seed - 1) / 2147483646 - 0.5) * 0.8; }; // +-0.4 ms
  for (let i = 0; i < hz * seconds; i++) {
    const s = stepCap(i * (1000 / hz) + jitter(), last, fps);
    last = s.last;
    if (s.render) n++;
  }
  return n / seconds;
};

describe('the cap holds its rate on every display', () => {
  for (const hz of [120, 144, 165]) {
    it(`${hz} Hz display, cap 60 -> 60 frames a second (+-2)`, () => {
      expect(Math.abs(run(hz, 60) - 60), `${hz} Hz rendered ${run(hz, 60)}`).toBeLessThanOrEqual(2);
    });
  }
  it('a 60 Hz display with timer jitter renders every frame: the cap costs it nothing', () => {
    expect(run(60, 60)).toBeGreaterThanOrEqual(59.5);
  });
  it('a 60 Hz display whose FIRST frame came late still renders every later frame (the 1 ms slack)', () => {
    // The schedule anchors on the first rendered tick. The seeded jitter above happens to start at its minimum, so
    // every later tick is on or after schedule and the slack is never needed (F3 SURVIVED that case). Here the
    // first tick is late by 0.4 ms and the rest alternate early/late by 0.4 ms — vsync timestamps do exactly this.
    let last = -Infinity, n = 0;
    for (let i = 0; i < 600; i++) {
      const j = i === 0 ? 0.4 : i % 2 ? -0.4 : 0.4;
      const st = stepCap(i * (1000 / 60) + j, last, 60);
      last = st.last;
      if (st.render) n++;
    }
    expect(n, `${600 - n} of 600 frames dropped on a 60 Hz display`).toBe(600);
  });
  it('a display slower than the cap is never slowed further (30 Hz -> 30)', () => {
    expect(run(30, 60)).toBe(30);
  });
  it('cap 0 is unlimited: every tick renders', () => {
    expect(run(120, 0)).toBe(120);
  });
  it('a long stall resynchronises instead of bursting frames to catch up', () => {
    let s = stepCap(0, -Infinity, 60);
    s = stepCap(1000, s.last, 60); // a 1 s hitch
    expect(s.render).toBe(true);
    const next = stepCap(1008, s.last, 60); // the very next 120 Hz tick
    expect(next.render, 'the cap burst a catch-up frame after a stall').toBe(false);
  });
});

describe('the setting: 60 by default, a choice of two, persisted', () => {
  it('the store starts capped at 60, and setFrameCap takes only 60 or 0', () => {
    expect(useGameStore.getState().frameCap).toBe(60);
    expect(SETTINGS_DEFAULTS.frameCap).toBe(60);
    useGameStore.getState().setFrameCap(0);
    expect(useGameStore.getState().frameCap).toBe(0);
    useGameStore.getState().setFrameCap(144);
    expect(useGameStore.getState().frameCap, 'an arbitrary rate became the cap').toBe(60);
  });
  it('Unlimited survives a reload through the real persistence glue', () => {
    const mem = new Map();
    const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
    // A fake store with zustand's shape, seeded from the real defaults.
    const makeStore = () => {
      let state = { ...useGameStore.getState(), frameCap: 60 };
      const subs = new Set();
      return {
        getState: () => state,
        setState: (patch) => { state = { ...state, ...patch }; subs.forEach((fn) => fn(state)); },
        subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
      };
    };
    const first = makeStore();
    initSettingsPersistence(first, () => false, storage);
    first.setState({ frameCap: 0 }); // the player picks Unlimited, and changes nothing else
    const second = makeStore(); // next session
    initSettingsPersistence(second, () => false, storage);
    expect(second.getState().frameCap, 'Unlimited did not survive a reload').toBe(0);
  });
  it('the sanitizer keeps 0 and 60 and drops anything else', () => {
    expect(sanitizeSettings({ frameCap: 0 }).frameCap).toBe(0);
    expect(sanitizeSettings({ frameCap: 60 }).frameCap).toBe(60);
    for (const bad of [30, 144, '60', -1, null, 1e9]) {
      expect(sanitizeSettings({ frameCap: bad }).frameCap, `kept ${JSON.stringify(bad)}`).toBeUndefined();
    }
  });
});

describe('a loop switch never moves the clock', () => {
  it("the clock resumes where it stood across R3F's reset-to-zero switch", () => {
    const clock = new Clock();
    clock.start();
    clock.elapsedTime = 1200; // twenty minutes of play
    // R3F 9.5's setFrameloop, verbatim in effect: stop, zero, restart at zero.
    const r3fSetFrameloop = () => { clock.stop(); clock.elapsedTime = 0; clock.start(); clock.elapsedTime = 0; };
    switchKeepingClock(clock, r3fSetFrameloop, 'always');
    expect(clock.elapsedTime, 'the clock jumped back on a loop switch').toBeCloseTo(1200, 3);
    expect(clock.running, 'the clock was left stopped').toBe(true);
    expect(clock.getElapsedTime(), 'the clock does not run on after the switch').toBeGreaterThanOrEqual(1200);
  });
});
