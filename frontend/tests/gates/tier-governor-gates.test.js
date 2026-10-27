// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createGovernor, governorDecline, governorIncline, governorSamples, governorWarm, renderDistanceFor,
  REINCLINE_BLOCK_MS, SETTLE_AFTER_DECLINES, MONITOR_ITERATIONS,
} from '../../src/render/tierGovernor.js';
import { paceFor } from '../../src/render/canvasPace.js';
import { TIERS } from '../../src/render/quality.js';

/**
 * THE TIER GOVERNOR SETTLES (plan 2026-10-27-crafty-steady-cool, item d; masterpiece 0f; refute F7).
 *
 * drei's PerformanceMonitor decides every 2.5 s and GameScene stepped the tier on every decision with no memory, so a
 * device that holds med but not high could climb, fail and fall every few seconds — each step shader compiles and
 * render-target reallocations. These drive the pure governor on a FAKE CLOCK: hysteresis, its doubling, the per-tier
 * ban, and the two inputs the governor must ignore (a paced-down canvas) or not move (render distance on touch).
 * BLIND SPOT: that GameScene routes PerformanceMonitor through these functions is the e2e's
 * (tests/e2e/tier-governor.spec.js) plus the wiring assertion in perf-config-gates.
 *
 * WHY A GLOBAL SETTLE AND NOT A PER-TIER BAN: the first version of this gate drove a per-tier ban through the
 * oscillation case below and it went RED — once a block expired, the governor probed back up and failed again, two
 * changes inside one minute. The settle is what makes "0 changes after 60 s" hold (render/tierGovernor.js header).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/render/tierGovernor.js, receipts in the commit:
 *   G1 no block (re-incline allowed at once)                          -> RED expected (the 60 s case)
 *   G2 plausible-wrong: settle after 3 declines (off by one)            -> RED expected (the settle and oscillation cases)
 *   G3 the settle removed                                               -> RED expected (the settle case)
 *   G4 plausible-wrong: the block keyed on the tier stepped TO          -> RED expected (the from-tier case)
 *   G5 plausible-wrong: governorSamples true while paced down           -> RED expected (the pace case)
 *   G6 renderDistanceFor ignores the pin                               -> RED expected (the coarse-pointer case)
 *   G7 plausible-wrong: the settle also refuses DECLINES                -> RED expected (step down after settling)
 *   G0 identity (a comment edit)                                       -> must SURVIVE
 */
const S = 1000;

describe('hysteresis: a decline from T blocks re-inclining to T', () => {
  it('for 60 s after the first decline, then allows it', () => {
    const g = createGovernor();
    expect(governorDecline(g, 'high', 0)).toBe('med');
    expect(governorIncline(g, 'med', 2.5 * S), 'the governor re-inclined 2.5 s after a decline').toBeNull();
    expect(governorIncline(g, 'med', REINCLINE_BLOCK_MS - 1)).toBeNull();
    expect(governorIncline(g, 'med', REINCLINE_BLOCK_MS), 'the block never ended').toBe('high');
    expect(REINCLINE_BLOCK_MS).toBe(60 * S);
  });

  it('the block is on the tier declined FROM, not the one stepped to', () => {
    const g = createGovernor();
    governorDecline(g, 'high', 0); // high blocked; med is where it now is
    expect(g.blockedUntil.high, 'the block is not on high').toBe(REINCLINE_BLOCK_MS);
    expect(g.blockedUntil.med, 'the block landed on the tier stepped to').toBeUndefined();
  });

  it('after two declines the governor settles: it never inclines again, whatever the clock says', () => {
    expect(SETTLE_AFTER_DECLINES).toBe(2);
    const g = createGovernor();
    governorDecline(g, 'high', 0);
    expect(governorIncline(g, 'med', 61 * S), 'one dip must not cost a capable machine the session').toBe('high');
    governorDecline(g, 'high', 62 * S);
    for (const t of [63, 600, 3600, 36000]) {
      expect(governorIncline(g, 'med', t * S), `the governor re-inclined at ${t} s after settling`).toBeNull();
    }
    // settled is not frozen: a machine that heats up later can still step down
    expect(governorDecline(g, 'med', 4000 * S)).toBe('low');
    expect(governorIncline(g, 'low', 9000 * S)).toBeNull();
  });

  it('two declines in a row (high -> med -> low) settle at low', () => {
    const g = createGovernor();
    governorDecline(g, 'high', 0);
    governorDecline(g, 'med', 5 * S);
    expect(governorIncline(g, 'low', 3600 * S)).toBeNull();
  });

  it('a decline at the floor and an incline at the ceiling are no-ops and record nothing', () => {
    const g = createGovernor();
    expect(governorDecline(g, 'low', 0)).toBeNull();
    expect(governorIncline(g, 'high', 0)).toBeNull();
    expect(g.declines).toBe(0);
  });

  it('an oscillating monitor (decline, incline, every 2.5 s for 10 min) settles: at most 1 change a minute after 20 s', () => {
    const g = createGovernor();
    let tier = 'high';
    const changes = [];
    for (let t = 0, i = 0; t <= 600 * S; t += 2.5 * S, i++) {
      const next = i % 2 === 0 ? governorDecline(g, tier, t) : governorIncline(g, tier, t);
      if (next) { changes.push(t); tier = next; }
    }
    expect(changes.length, 'SETUP: the governor never moved — nothing was exercised').toBeGreaterThan(0);
    const list = changes.map((c) => c / S).join(', ');
    for (let w = 20 * S; w + 60 * S <= 600 * S; w += 2.5 * S) {
      const inWindow = changes.filter((c) => c >= w && c < w + 60 * S).length;
      expect(inWindow, `${inWindow} tier changes in the minute from ${w / S} s: ${list}`).toBeLessThanOrEqual(1);
    }
    expect(changes.filter((c) => c >= 60 * S), `tier changes after 60 s: ${list}`).toEqual([]);
  });

  it('a single transient dip comes back after the block (a healthy monitor after one bad moment)', () => {
    const g = createGovernor();
    let tier = 'high';
    tier = governorDecline(g, tier, 10 * S) || tier;                      // one dip
    for (let t = 12.5 * S; t <= 120 * S; t += 2.5 * S) tier = governorIncline(g, tier, t) || tier; // healthy since
    expect(tier, 'one dip stranded the machine below its tier').toBe('high');
  });
});

describe('the governor samples only a canvas running at its play pace', () => {
  it('in play: yes under the cap and under Unlimited', () => {
    expect(governorSamples(paceFor({ frameCap: 60, titleCovering: false, harness: false }), 60)).toBe(true);
    expect(governorSamples(paceFor({ frameCap: 0, titleCovering: false, harness: false }), 0)).toBe(true);
  });
  it('behind the title (paced to 10 fps on purpose): no — 10 fps is not a slow GPU', () => {
    for (const frameCap of [60, 0]) {
      expect(governorSamples(paceFor({ frameCap, titleCovering: true, harness: false }), frameCap), `cap ${frameCap}`).toBe(false);
    }
  });
});

/**
 * A FRESH MONITOR'S FIRST WINDOW IS WARM-UP (review 2026-10-27, steady-cool MED 4). GameScene keys PerformanceMonitor on
 * the tier, so a step mounts a fresh monitor, and the step's own cost (the light pool's shader re-links, reallocated
 * targets) lands in its first window; a decision from that window could walk a capable machine down to low on the cost of
 * its own steps. governorStep ignores it. This drives drei's REAL monitor (R3F's useFrame stubbed, a fake clock) so the
 * premise — the first window's decision arrives with api.index === MONITOR_ITERATIONS — is checked against the installed
 * drei, not assumed. The GameScene wiring (the key, the api handed through, the check before the step) is
 * perf-config-gates'.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, one batch, receipts in the commit:
 *   W1 governorWarm always true (no warm-up)                            -> RED expected
 *   W2 plausible-wrong: `>=` (the first window's decision counts)       -> RED expected
 *   W3 GameScene's monitor not keyed on the tier                        -> RED expected (perf-config-gates)
 *   W4 GameScene's callbacks drop drei's api                            -> RED expected (perf-config-gates)
 *   W5 governorStep's warm-up check removed                             -> RED expected (perf-config-gates)
 *   W0 identity (a comment edit in tierGovernor.js)                     -> must SURVIVE
 */
afterEach(() => { vi.restoreAllMocks(); });

// drei is an external dependency, so vi.mock cannot reach the useFrame it imports. Instead the REAL useFrame is given a
// root: R3F's own `context`, holding a store whose internal.subscribe records the frame callback, the one thing useFrame
// reads from it (fiber's useFrame: useStore() -> store.getState().internal.subscribe(ref, priority, store)).
const subs = [];
const fakeRoot = { getState: () => ({ internal: { subscribe: (ref) => { subs.push(ref); return () => subs.splice(subs.indexOf(ref), 1); } } }) };

describe('warm-up: a fresh monitor\'s first decision is ignored, the next one counts', () => {
  it('pure: up to the end of the first window no decision counts; after it, every one does', () => {
    expect(MONITOR_ITERATIONS).toBe(10);
    expect(governorWarm(MONITOR_ITERATIONS)).toBe(false);
    expect(governorWarm(2 * MONITOR_ITERATIONS)).toBe(true);
  });

  it('drei\'s own monitor, slow frames: first decision ignored, second counts; a re-key (a tier step) starts over', async () => {
    const React = (await import('react')).default;
    const { render, act, cleanup } = await import('@testing-library/react');
    const { PerformanceMonitor } = await import('@react-three/drei');
    const { context } = await import('@react-three/fiber');
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const seen = [];
    const monitor = (tier) => React.createElement(context.Provider, { value: fakeRoot }, React.createElement(PerformanceMonitor, {
      key: tier,
      bounds: () => [50, 60],
      onDecline: (api) => seen.push({ tier, index: api.index, counts: governorWarm(api.index) }),
    }));
    // 20 fps (a frame every 50 ms), under the lower bound: every window ends in a decline.
    const frames = (n) => act(() => {
      for (let i = 0; i < n; i++) {
        now += 50;
        expect(subs.length, 'SETUP: not exactly one monitor subscribed to frames').toBe(1);
        subs[0].current({}, 0.05);
      }
    });
    const { rerender } = render(monitor('high'));
    frames(130);
    expect(seen.length, `SETUP: the monitor did not decide twice in 130 slow frames: ${JSON.stringify(seen)}`).toBe(2);
    expect(seen[0].index, 'the first window\'s decision is not at MONITOR_ITERATIONS samples').toBe(MONITOR_ITERATIONS);
    expect(seen.map((s) => s.counts), 'the first window counted, or the second did not').toEqual([false, true]);
    rerender(monitor('med')); // the tier step: GameScene's key={qualityTier}
    frames(70);
    expect(seen.slice(2).map((s) => [s.tier, s.counts]), 'a re-keyed monitor\'s first window counted').toEqual([['med', false]]);
    cleanup();
  });
});

describe('render distance does not move with a runtime step on a coarse pointer', () => {
  it('pinned to the boot tier on touch; following the tier on a fine pointer', () => {
    for (const tier of ['low', 'med', 'high']) {
      expect(renderDistanceFor(tier, 'low'), `touch at ${tier}`).toBe(TIERS.low.renderDistance);
      expect(renderDistanceFor(tier, null), `desktop at ${tier}`).toBe(TIERS[tier].renderDistance);
    }
    expect(new Set(['low', 'med', 'high'].map((t) => TIERS[t].renderDistance)).size, 'SETUP: the tiers no longer differ in render distance').toBe(3);
  });
});
