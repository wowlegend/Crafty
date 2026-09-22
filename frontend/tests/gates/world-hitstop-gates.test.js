import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { worldTimeScale, stackHitstop, HITSTOP_BURST_CAP_MS } from '../../src/game/hitstop.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { carriersOf } from './_srcWalk.js';

/**
 * THE WORLD FREEZES ON A HEAVY HIT, NOT ONLY THE PLAYER (EXTERNAL-BASELINE #3; plan Task 2).
 *
 * `hitstopUntil` had one reader — the player's movement — so the mob you hit, and everything else, kept
 * moving through the freeze. Now there is one writer (the store's `triggerHitstop`, which caps a burst) and
 * the world's frame-rate consumers read one scale (`worldTimeScale`).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   M1 hitstop.js: the scale is always 1                                     -> scale RED
 *   M2 hitstop.js: plausible-wrong — the cap ignored on stacking             -> burst-cap RED
 *   M3 hitstop.js: a new burst keeps the old start                           -> new-burst RED
 *   M4 hitstop.js: plausible-wrong — `<=` at the boundary (stuck for a frame) -> boundary RED
 *   M5 hitstop.js: plausible-wrong — a single beat cut to the cap            -> long-beat RED
 *   M6 hitstop.js: plausible-wrong — a hit may SHORTEN the freeze in force   -> long-beat RED
 *   M7 MobModel: the damp ignores the scale                                  -> wiring RED (structural)
 *   M8 AIWorkerSystem: knockback drained on a frozen frame (the lost shove)  -> hold RED (structural)
 *   M9 AIWorkerSystem: the AI clock ignores the scale                        -> hold RED (structural)
 *   M10 CombatSystem: writes hitstopUntil directly again                     -> one-writer RED
 *   M11 store: triggerHitstop writes now + ms, skipping the stacking rule    -> store-cap RED
 *
 * BLIND SPOT (the integration seam): MobModel / AIWorkerSystem / Components are R3F frame loops, not
 * rendered here, so their use of the scale is asserted structurally — the weak kind — and nothing here
 * proves a frozen frame actually happens in the running game, or that the held shove lands afterwards.
 * Whether a 90 ms world freeze FEELS right is a person-playing question.
 */
describe('worldTimeScale', () => {
  it('is 0 inside the freeze and exactly 1 from the instant it ends', () => {
    expect(worldTimeScale(100, 150)).toBe(0);
    expect(worldTimeScale(150, 150)).toBe(1);
    expect(worldTimeScale(200, 0)).toBe(1);
    expect(worldTimeScale(200, undefined)).toBe(1);
  });
});

describe('stackHitstop — a burst extends the freeze, but never past the cap', () => {
  it('five quick 90 ms hits freeze for the cap, not for 250 ms', () => {
    let s = { until: 0, start: 0 };
    const untils = [];
    for (const now of [0, 40, 80, 120, 160]) { s = stackHitstop(s, now, 90); untils.push(s.until); }
    expect(untils).toEqual([90, 130, 170, 180, 180]);
    expect(s.until - s.start).toBe(HITSTOP_BURST_CAP_MS);
  });

  it('a hit after the freeze ended starts a NEW burst at that instant', () => {
    const s = stackHitstop({ until: 180, start: 0 }, 500, 90);
    expect(s).toEqual({ until: 590, start: 500 });
  });

  it('ONE deliberate long freeze is honoured, and a later hit never SHORTENS a freeze', () => {
    // The boss entrance holds 220 ms on purpose ("a held breath", game/bossEntrance.js) — longer than the
    // burst cap. The cap bounds STACKING, not a single authored beat. And a light hit landing inside that
    // held breath must not cut it to start + cap: extending is the only direction a hit may move `until`.
    const s = stackHitstop({ until: 0, start: 0 }, 1000, 220);
    expect(s).toEqual({ until: 1220, start: 1000 });
    expect(stackHitstop(s, 1100, 45)).toEqual({ until: 1220, start: 1000 });
  });

  it('a zero or negative hit changes nothing', () => {
    expect(stackHitstop({ until: 90, start: 0 }, 10, 0)).toEqual({ until: 90, start: 0 });
  });
});

describe('the store is the ONE writer, and it caps', () => {
  beforeEach(() => useGameStore.setState({ hitstopUntil: 0, hitstopStart: 0 }));
  afterEach(() => vi.restoreAllMocks());

  it('triggerHitstop stacks and caps like the pure rule, on the clock it reads', () => {
    // The clock is PINNED: two hits in the same instant can never exceed the cap, so an unpinned version of
    // this test passed a store that ignored the stacking rule entirely.
    const clock = vi.spyOn(performance, 'now');
    clock.mockReturnValue(1000);
    useGameStore.getState().triggerHitstop(160);
    clock.mockReturnValue(1100);
    useGameStore.getState().triggerHitstop(160); // uncapped this would end at 1260
    expect(useGameStore.getState()).toMatchObject({ hitstopStart: 1000, hitstopUntil: 1000 + HITSTOP_BURST_CAP_MS });
  });

  it('no other source file assigns hitstopUntil — every producer goes through triggerHitstop', () => {
    const writers = carriersOf(/hitstopUntil\s*:/);
    expect(writers).toEqual(['store/useGameStore.jsx']);
  });

  it('the world consumers read the scale (weak, structural)', () => {
    expect(carriersOf(/worldTimeScale\(/).sort()).toEqual(
      ['Components.jsx', 'game/hitstop.js', 'render/MobModel.jsx', 'systems/AIWorkerSystem.jsx'].sort(),
    );
  });

  it('the AI clock stops with the world, and the knockback shove WAITS rather than being spent (weak, structural)', () => {
    // drainKnockback spends the whole one-frame impulse in whichever frame calls it (captureRest.js), so a
    // frozen-frame drain would consume the shove at zero length and the hit would never push. The frame
    // must HOLD it. Each pattern is the one line that does it; each has exactly one carrier.
    expect(carriersOf(/if \(ws > 0\) drainKnockback\(mobsQuery\.entities, delta, false\)/)).toEqual(['systems/AIWorkerSystem.jsx']);
    expect(carriersOf(/tickAccumRef\.current \+= delta \* ws;/)).toEqual(['systems/AIWorkerSystem.jsx']);
    expect(carriersOf(/const t = Math\.min\(1, delta \* 10 \* ws\);/)).toEqual(['render/MobModel.jsx']);
  });
});
