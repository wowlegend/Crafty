// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

/**
 * THE HUD RUNS ON ONE TICKER THAT FOLLOWS THE CANVAS (plan 2026-10-27-crafty-steady-cool, item f; refute F10).
 *
 * HUD.jsx (ObjectiveTracker, Compass) and ui/AbilityBar.jsx each ran their own requestAnimationFrame loop at the DISPLAY
 * rate — 120 Hz on ProMotion — outside the 60 fps cap, re-deriving and re-writing styles every vsync. They now
 * subscribe to ui/hudTicker.js: while the game canvas is capped, FrameCap claims the ticker and ticks it once per
 * RENDERED frame; otherwise (Unlimited, capture, the perf probe) the ticker runs its own rAF. F10 is the trap this
 * guards: a HUD driven only by FrameCap's loop freezes under Unlimited, where that loop does not run.
 * This drives the real ticker, the real FrameCap pacing loop (R3F's hooks stubbed) and the real AbilityBar against the
 * real store, over a hand-cranked requestAnimationFrame.
 * BLIND SPOT: the Compass and ObjectiveTracker inside HUD.jsx need the full in-game HUD; they are the e2e's
 * (tests/e2e/hud-ticker.spec.js, under the cap and under Unlimited).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/ui/hudTicker.js, src/render/FrameCap.jsx and src/ui/AbilityBar.jsx,
 * receipts in the commit:
 *   T1 the claim does not stop the rAF fallback (ticks twice per frame)        -> RED expected
 *   T2 the release does not restart the fallback (F10: frozen under Unlimited)  -> RED expected
 *   T3 FrameCap ticks the HUD on every display tick, not on rendered ones       -> RED expected
 *   T4 FrameCap never claims the ticker                                        -> RED expected
 *   T5 AbilityBar writes its sweep on every tick (write-on-change dropped)      -> RED expected
 *   T6 plausible-wrong: an emit while unclaimed also ticks (double tick)        -> RED expected
 *   T0 identity (a comment edit)                                               -> must SURVIVE
 */

let queue = [];
let rafCalls = 0;
let nextId = 1;
const flushRaf = (t) => {
  const q = queue;
  queue = [];
  for (const { fn } of q) fn(t);
};
let threeApi;
vi.mock('@react-three/fiber', async (orig) => ({
  ...(await orig()),
  useThree: (sel) => sel(threeApi),
  useFrame: () => {},
}));

beforeEach(() => {
  vi.resetModules();
  queue = [];
  rafCalls = 0;
  vi.stubGlobal('requestAnimationFrame', (fn) => { rafCalls += 1; const id = nextId++; queue.push({ id, fn }); return id; });
  vi.stubGlobal('cancelAnimationFrame', (id) => { queue = queue.filter((e) => e.id !== id); });
  const store = { frameloop: 'demand', clock: { elapsedTime: 0 }, internal: { frames: 0 } };
  threeApi = { advance: vi.fn(), get: () => store, set: () => {} };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the ticker: rAF unless the capped canvas claims it', () => {
  it('unclaimed (Unlimited, capture) it ticks on its own rAF — the HUD never freezes (F10)', async () => {
    const { subscribeHudTick } = await import('../../src/ui/hudTicker.js');
    const fn = vi.fn();
    subscribeHudTick(fn);
    flushRaf(16); flushRaf(32); flushRaf(48);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('claimed, it stops its own loop and ticks exactly once per emitted (rendered) frame', async () => {
    const { subscribeHudTick, claimHudTick, emitHudTick } = await import('../../src/ui/hudTicker.js');
    const fn = vi.fn();
    subscribeHudTick(fn);
    claimHudTick();
    flushRaf(16); flushRaf(32);
    expect(fn, 'the rAF fallback still ran while the canvas held the ticker').not.toHaveBeenCalled();
    emitHudTick(40); emitHudTick(56);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('releasing the claim (the player picks Unlimited) restarts the fallback', async () => {
    const { subscribeHudTick, claimHudTick, emitHudTick } = await import('../../src/ui/hudTicker.js');
    const fn = vi.fn();
    subscribeHudTick(fn);
    const release = claimHudTick();
    emitHudTick(1);
    release();
    flushRaf(16); flushRaf(32);
    expect(fn, 'the HUD froze after the cap let go').toHaveBeenCalledTimes(3);
  });

  it('an emit while unclaimed does nothing — the rAF loop already ticks', async () => {
    const { subscribeHudTick, emitHudTick } = await import('../../src/ui/hudTicker.js');
    const fn = vi.fn();
    subscribeHudTick(fn);
    emitHudTick(5);
    expect(fn).not.toHaveBeenCalled();
  });

  it('with no subscriber there is no loop at all', async () => {
    const { subscribeHudTick } = await import('../../src/ui/hudTicker.js');
    const off = subscribeHudTick(() => {});
    off();
    const before = rafCalls;
    flushRaf(16); flushRaf(32);
    expect(rafCalls - before, 'a loop kept running with nothing to tick').toBe(0);
  });
});

describe('FrameCap drives the ticker on the frames it renders', () => {
  it('a 30 fps cap on a 60 Hz display ticks the HUD on every other display tick, and releases on unmount', async () => {
    const { FrameCap } = await import('../../src/render/FrameCap.jsx');
    const { subscribeHudTick } = await import('../../src/ui/hudTicker.js');
    const fn = vi.fn();
    subscribeHudTick(fn);
    const { unmount } = render(<FrameCap fps={30} active drivesHud />);
    const ticks = [0, 16.67, 33.33, 50, 66.67, 83.33, 100, 116.67];
    for (const t of ticks) flushRaf(t); // FrameCap's loop is the only rAF consumer while it holds the ticker
    expect(threeApi.advance.mock.calls.length, 'SETUP: the cap rendered nothing').toBeGreaterThan(0);
    expect(fn.mock.calls.length, 'the HUD did not tick once per RENDERED frame').toBe(threeApi.advance.mock.calls.length);
    expect(fn.mock.calls.length).toBeLessThan(ticks.length);
    unmount();
    fn.mockClear();
    flushRaf(200); flushRaf(216);
    expect(fn, 'after the cap unmounted the HUD froze').toHaveBeenCalledTimes(2);
  });

  it('a FrameCap that does not drive the HUD (the title diorama) leaves the ticker alone', async () => {
    const { FrameCap } = await import('../../src/render/FrameCap.jsx');
    const { subscribeHudTick } = await import('../../src/ui/hudTicker.js');
    const fn = vi.fn();
    subscribeHudTick(fn);
    render(<FrameCap fps={10} active />);
    for (const t of [0, 16.67, 33.33, 50]) flushRaf(t);
    expect(fn, 'the title canvas paced the HUD').toHaveBeenCalledTimes(4);
  });
});

describe('AbilityBar writes its sweep on change only', () => {
  it('renders the cooldown sweep from the store on a tick, and re-writes nothing when nothing changed', async () => {
    const { useGameStore } = await import('../../src/store/useGameStore');
    const { AbilityBar } = await import('../../src/ui/AbilityBar.jsx');
    const { claimHudTick, emitHudTick } = await import('../../src/ui/hudTicker.js');
    claimHudTick();
    useGameStore.setState({ abilityCooldowns: { grab: { remaining: 2, duration: 4, ready: false }, dodge: { ready: true } } });
    const { container } = render(<AbilityBar />);
    act(() => emitHudTick(10));
    const sweeps = [...container.querySelectorAll('div[style]')].filter((d) => d.style.background.includes('conic-gradient'));
    expect(sweeps.length, 'SETUP: no sweep was drawn for the grab cooldown').toBe(1);
    expect(sweeps[0].style.background).toContain('180deg');
    // Count the SETTER calls, not DOM mutations: a MutationObserver records nothing when a write leaves the serialised
    // style unchanged, so it was blind to exactly the waste this asserts on (the first version of this check survived
    // the write-every-tick mutant that way).
    let writes = 0;
    const spyOn = (style, prop) => {
      let proto = Object.getPrototypeOf(style), d;
      while (proto && !(d = Object.getOwnPropertyDescriptor(proto, prop))) proto = Object.getPrototypeOf(proto);
      expect(d && d.set, `SETUP: no ${prop} setter to spy on`).toBeTruthy();
      Object.defineProperty(style, prop, { configurable: true, get() { return d.get.call(this); }, set(v) { writes += 1; d.set.call(this, v); } });
    };
    spyOn(sweeps[0].style, 'background');
    spyOn(sweeps[0].style, 'opacity');
    act(() => { emitHudTick(20); emitHudTick(30); });
    expect(writes, 'an unchanged cooldown re-wrote the sweep styles').toBe(0);
    useGameStore.setState({ abilityCooldowns: { grab: { remaining: 1, duration: 4, ready: false }, dodge: { ready: true } } });
    act(() => emitHudTick(40));
    expect(sweeps[0].style.background, 'a changed cooldown was not written').toContain('90deg');
  });
});
