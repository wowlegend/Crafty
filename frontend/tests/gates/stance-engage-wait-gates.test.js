// HOW LONG combat-stance.spec.js and combat-touch.spec.js WAIT FOR THE STANCE TO ENGAGE (tests/e2e/_stanceEngage.js),
// and what ends the wait.
//
// A frame of several seconds on a software-rendered runner advances the game by one capped step (src/game/frameStep.js),
// so a wait bounded in wall time is spent by that one frame and reports a stance that never engaged. The two CI
// timelines below are the reference, copied from the failure traces of PR #32's run 40750241581 (e2e shard 1): the stance
// engaged and blending in when one ~3.9 s frame lands (w 0.83 -> 0.41, engaged false), and a 4584 ms first frame after the
// spawn. What each page did after the last row its trace printed is continued here by construction.
//
// The rule: the budget is game seconds on the stance's clock (atS + stepS); a page that stops advancing game time inside
// `wallMs` is SETUP (`stalled`), never the verdict; with no stance record, wall seconds stand in, so an unwired stance is
// still the verdict. The page is stood in (requestAnimationFrame, performance.now, window.__craftyTest), the stance
// scripted frame by frame, its clock stepped by the real frame-step cap.
//
// WHAT THIS DOES NOT CHECK: that the specs install the helper before boot and pass their wall bound (a CI run of the
// specs does); what the real stance does across a long frame (src/game/combatStance.test.js drives one through stanceFrame).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installStanceEngage } from '../e2e/_stanceEngage.js';
import { MAX_FRAME_STEP_SEC } from '../../src/game/frameStep.js';

const WALL_MS = 120000; // the spec's HOLD_WALL_MS

let wall;
beforeEach(() => {
  wall = 1e6;
  vi.spyOn(performance, 'now').mockImplementation(() => wall);
});
afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.window;
  delete globalThis.requestAnimationFrame;
});

/**
 * A page whose i-th frame takes frameMs(i) of wall time and steps the stance's clock by that, capped (0 while `held`).
 * stance(i, gameS) is the record the stance leaves after frame i, gameS being the game time through it since the wait
 * began, or null for no readStance hook.
 */
function page({ frameMs, stance, held = false }) {
  const st = { atS: 12.5, stepS: 0.016, w: 0, engaged: false };
  const g0 = st.atS + st.stepS;
  let i = 0, wired = true;
  globalThis.requestAnimationFrame = (cb) => {
    Promise.resolve().then(() => {
      const d = frameMs(i);
      wall += d;
      st.atS += st.stepS;
      st.stepS = held ? 0 : Math.min(d / 1000, MAX_FRAME_STEP_SEC);
      const r = stance(i, st.atS + st.stepS - g0);
      if (r === null) wired = false;
      else { st.w = r.w; st.engaged = r.engaged; }
      i++;
      cb(wall);
    });
  };
  globalThis.window = {
    __craftyTest: {
      call: (n) => {
        if (n === 'readStance') return wired ? { ...st } : undefined;
        if (n === 'readMobs') return [{ id: 7, x: 4.22, z: 0 }];
        throw new Error(`unexpected hook ${n}`);
      },
    },
    __threeCamera: { position: { x: 0, y: 53.2, z: 0 } },
  };
  installStanceEngage();
  return { frames: () => i };
}

const engageFrom = (gameS) => (i, g) => (g >= gameS ? { w: 1, engaged: true } : { w: Math.min(0.99, g / gameS), engaged: g > 0.05 });
const never = () => ({ w: 0, engaged: false });

describe('the engage wait is bounded in game time, and a stalled frame is not the stance failing', () => {
  it('CI attempts 1 and 2: engaged and blending in, one 3.9 s frame, w back to 0.41 -> the wait outlasts the frame', async () => {
    const BLEND = [0.53, 0.6, 0.7, 0.76, 0.83];
    const p = page({
      frameMs: (i) => [18, 23, 15, 17, 17, 3885][i] ?? 20,
      stance: (i) => (i < 5 ? { w: BLEND[i], engaged: true } : i === 5 ? { w: 0.41, engaged: false } : i < 8 ? { w: 0.7, engaged: true } : { w: 1, engaged: true }),
    });
    const r = await window.__stanceEngage(7, 120, WALL_MS);
    expect(r.ok, `the wait ended at the stall: ${JSON.stringify(r)}`).toBe(true);
    expect(r.ms, 'SETUP: the scripted stall was not spanned').toBeGreaterThan(3000);
    expect(p.frames()).toBe(9);
  });

  it('CI attempt 3: the first frame takes 4584 ms, the stance engages 0.3 s of game time later -> engaged', async () => {
    page({ frameMs: (i) => (i === 0 ? 4584 : 27), stance: engageFrom(0.55) });
    const r = await window.__stanceEngage(7, 27, WALL_MS);
    expect(r.ok, `the wait ended on the first frame: ${JSON.stringify(r)}`).toBe(true);
    expect(r.ms).toBeGreaterThan(4584);
  });

  it('control: at 27 ms frames a stance that engages at 0.3 s of game time is engaged, in about that much wall time', async () => {
    page({ frameMs: () => 27, stance: engageFrom(0.3) });
    const r = await window.__stanceEngage(7, 27, WALL_MS);
    expect(r.ok).toBe(true);
    expect(r.ms).toBeLessThan(400);
  });
});

describe('the verdict still fails a stance that does not engage', () => {
  for (const [name, frameMs] of [['27 ms frames', () => 27], ['a 4 s stall among them', (i) => (i === 3 ? 4000 : 27)]]) {
    it(`a stance that never engages is the verdict, not SETUP (${name})`, async () => {
      page({ frameMs, stance: never });
      const r = await window.__stanceEngage(7, 27, WALL_MS);
      expect([r.ok, r.stalled], JSON.stringify(r)).toEqual([false, undefined]);
      expect(r.budgetS).toBe(3);
      const last = r.trace[r.trace.length - 1];
      expect(last[1], 'the wait ended before the game budget was spent (the row rounds to 0.01 s)').toBeGreaterThanOrEqual(3);
      expect(last[1], 'the wait ran far past the game budget').toBeLessThan(3 + MAX_FRAME_STEP_SEC + 1e-9);
      expect(last[0], 'the wait outran its game budget by wall clock').toBeLessThan(10000);
    });
  }

  it('a stance that engages only after 5 s of game time fails; one that never reaches w 1 fails', async () => {
    page({ frameMs: () => 27, stance: engageFrom(5) });
    expect((await window.__stanceEngage(7, 27, WALL_MS)).ok).toBe(false);
    page({ frameMs: () => 27, stance: () => ({ w: 0.99, engaged: true }) });
    expect((await window.__stanceEngage(7, 27, WALL_MS)).ok).toBe(false);
    page({ frameMs: () => 27, stance: () => ({ w: 1, engaged: false }) });
    expect((await window.__stanceEngage(7, 27, WALL_MS)).ok, 'full weight with the fight over is not engaged').toBe(false);
  });

  it('the budget is max(3 s, 15 median frames) of game time: 3.6 s passes at a 247 ms median, fails at 27 ms', async () => {
    page({ frameMs: () => 247, stance: engageFrom(3.6) });
    const slow = await window.__stanceEngage(7, 247, WALL_MS);
    expect(slow.ok, JSON.stringify(slow)).toBe(true);
    page({ frameMs: () => 27, stance: engageFrom(3.6) });
    const fast = await window.__stanceEngage(7, 27, WALL_MS);
    expect([fast.ok, fast.budgetS]).toEqual([false, 3]);
  });

  it('no readStance hook: the verdict, on wall seconds, with the hook named in the trace', async () => {
    page({ frameMs: () => 27, stance: () => null });
    const r = await window.__stanceEngage(7, 27, WALL_MS);
    expect([r.ok, r.stalled]).toEqual([false, undefined]);
    expect(r.trace[0][2]).toBe('no readStance');
    expect(r.trace[r.trace.length - 1][0]).toBeLessThan(3200);
  });
});

describe('a page that stops advancing the game is SETUP, and the trace keeps both ends', () => {
  it('a held world (the stance clock never moves) ends at the wall bound as stalled, with the game time it reached', async () => {
    page({ frameMs: () => 27, stance: never, held: true });
    const r = await window.__stanceEngage(7, 27, 20000);
    expect([r.ok, r.stalled, r.gameS], JSON.stringify(r)).toEqual([false, true, 0]);
    expect(r.ms).toBeGreaterThan(20000);
  });

  it('a frame that both spends the game budget and passes the wall bound is the verdict: the stance had its game time', async () => {
    page({ frameMs: (i) => (i < 111 ? 27 : 400), stance: never });
    const r = await window.__stanceEngage(7, 27, 3100);
    expect([r.ok, r.stalled], JSON.stringify(r.trace.slice(-2))).toEqual([false, undefined]);
    expect(r.trace[r.trace.length - 1][0], 'SETUP: the last frame did not pass the wall bound').toBeGreaterThan(3100);
  });

  it('a long wait keeps its first 8 rows and its last 12, each [wall ms, game s, w, engaged, gap]', async () => {
    page({ frameMs: () => 100, stance: never });
    const r = await window.__stanceEngage(7, 27, WALL_MS);
    expect(r.trace.length).toBe(21);
    expect(r.trace[8]).toBe('...');
    expect(r.trace[0]).toEqual([100, 0.1, 0, false, 4.22]);
    expect(r.trace[20][1]).toBeGreaterThan(3);
  });
});
