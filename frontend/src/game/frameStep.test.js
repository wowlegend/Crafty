import { describe, it, expect, beforeEach } from 'vitest';
import { MAX_FRAME_STEP_SEC, frameStep, takeTick } from './frameStep.js';
import { realDelta, worldDelta, tickWorldClock } from './worldClock.js';
import { ENEMY_PROJECTILE_FRAME_CAP_SEC } from './enemyProjectiles.js';
import { makeHurl, stepHurlChunked } from './hurl.js';
import { useGameStore } from '../store/useGameStore';

// ONE CAPPED STEP FOR EVERY MOVER. The player controller takes realDelta, the AI bridge worldDelta and takeTick. When
// only the AI was capped, a 3.9 s stall moved the player 3.9 s and the husk 0.25 s.

const AI_TICK_SEC = 1 / 15; // AIWorkerSystem's cadence (a literal: the yardstick must not move with the subject)

beforeEach(() => {
  useGameStore.setState({ hitstopUntil: 0, hitstopStart: 0, hitstopFrozenTotal: 0 });
  tickWorldClock(1000); // no freeze: worldDelta is the frame's step
});

// The player's walk time and the AI's over a run of frames, the way each consumer takes them.
function run(frames) {
  let player = 0, ai = 0, longestTick = 0;
  const acc = { current: 0 };
  const perFrame = [];
  for (const dt of frames) {
    const p = realDelta(dt);
    player += p;
    acc.current += worldDelta(dt);
    const t = takeTick(acc, AI_TICK_SEC);
    ai += t;
    longestTick = Math.max(longestTick, t);
    perFrame.push({ dt, p, t });
  }
  return { player, ai, left: acc.current, longestTick, perFrame };
}

describe('frameStep', () => {
  it('passes a frame through up to the cap, caps a longer one, and gives 0 for a negative or non-finite delta', () => {
    expect(MAX_FRAME_STEP_SEC).toBe(0.25);
    expect(frameStep(0.016)).toBe(0.016);
    expect(frameStep(0.227)).toBe(0.227);
    expect(frameStep(0.25)).toBe(0.25);
    expect(frameStep(0.3)).toBe(0.25);
    expect(frameStep(3.9)).toBe(0.25);
    expect(frameStep(-1)).toBe(0);
    expect(frameStep(NaN)).toBe(0);
  });

  it('the player (realDelta) and the world (worldDelta) take the same step from the same frame', () => {
    for (const dt of [1 / 120, 1 / 60, 0.1, 0.227, 0.25, 0.4, 3.9]) {
      expect(realDelta(dt), `realDelta(${dt})`).toBe(frameStep(dt));
      expect(worldDelta(dt), `worldDelta(${dt})`).toBe(frameStep(dt));
    }
  });

  it('a 3.9 s frame advances the player and the husk by the same capped time', () => {
    const r = run([...Array(20).fill(1 / 60), 3.9, ...Array(6).fill(1 / 60)]);
    const stall = r.perFrame[20];
    expect(stall.p, 'the player walked more than the cap in the stalled frame').toBe(MAX_FRAME_STEP_SEC);
    // Before the stall the AI held up to a tick unspent; the stall's tick takes the cap, the rest is carried.
    expect(stall.t).toBe(MAX_FRAME_STEP_SEC);
    expect(r.longestTick).toBeLessThanOrEqual(MAX_FRAME_STEP_SEC);
    expect(Math.abs(r.player - (r.ai + r.left)), `player ${r.player} s, AI ${r.ai} s given + ${r.left} s held`).toBeLessThan(1e-9);
    expect(r.left).toBeLessThan(AI_TICK_SEC);
  });

  it('no AI time is lost across frames that cross the cap: the remainder is carried, not dropped', () => {
    // Three short frames leave 0.05 s held (under a tick); a 0.3 s frame then brings the bridge to 0.30 s, over the cap.
    const r = run([1 / 60, 1 / 60, 1 / 60, 0.3, 1 / 60, 1 / 60, 0.6, 0.227, 0.227, 1 / 60]);
    expect(Math.abs(r.player - (r.ai + r.left)), `player ${r.player} s, AI ${r.ai} s given + ${r.left} s held`).toBeLessThan(1e-9);
    expect(r.left).toBeLessThan(AI_TICK_SEC);
    expect(r.longestTick).toBeLessThanOrEqual(MAX_FRAME_STEP_SEC);
  });

  it('the arrows and the hurl cap a frame at the same step', () => {
    expect(ENEMY_PROJECTILE_FRAME_CAP_SEC).toBe(MAX_FRAME_STEP_SEC);
    const h = makeHurl({ x: 0, y: 50, z: 0 }, { x: 1, y: 0, z: 0 });
    stepHurlChunked(h, 3.9, []);
    expect(h.age).toBeCloseTo(MAX_FRAME_STEP_SEC, 9);
  });
});
