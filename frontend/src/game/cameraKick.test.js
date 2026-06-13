import { describe, it, expect } from 'vitest';
import { makeKick, addKick, stepKick, KICK_PROFILES, KICK_DECAY } from './cameraKick.js';

describe('cameraKick', () => {
  it('a fresh kick is zero offset', () => {
    expect(stepKick(makeKick(), 0.016)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('addKick injects an impulse the next step returns (decayed by < one full frame)', () => {
    const k = makeKick();
    addKick(k, [0, -0.2, 0]);
    const o = stepKick(k, 0.016);
    expect(o.y).toBeLessThan(0);           // kicked down
    expect(o.y).toBeGreaterThan(-0.2);     // already decaying
  });

  it('decays toward zero over ~0.3s (recovers, never lingers)', () => {
    const k = makeKick();
    addKick(k, [0.3, -0.3, 0.3]);
    let o;
    for (let i = 0; i < 20; i++) o = stepKick(k, 0.016); // ~0.32s
    expect(Math.hypot(o.x, o.y, o.z)).toBeLessThan(0.01);
  });

  it('accumulates concurrent kicks (no overwrite) + never NaNs', () => {
    const k = makeKick();
    addKick(k, [0.1, 0, 0]); addKick(k, [0.1, 0, 0]);
    const o = stepKick(k, 0.016);
    expect(o.x).toBeGreaterThan(0.1);
    expect(Number.isNaN(o.x)).toBe(false);
  });

  it('exposes per-verb profiles (melee/cast/slam/land) + a sane decay', () => {
    for (const v of ['melee', 'cast', 'slam', 'land']) {
      expect(Array.isArray(KICK_PROFILES[v]) && KICK_PROFILES[v].length === 3).toBe(true);
    }
    expect(KICK_DECAY).toBeGreaterThan(4);   // recovers in well under a second
  });
});
