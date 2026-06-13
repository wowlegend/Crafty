import { describe, it, expect } from 'vitest';
import { makeKick, addKick, stepKick, KICK_PROFILES, KICK_DECAY, localToWorldKick } from './cameraKick.js';

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

  it('melee recoils BACK (down + away from look-dir), cast pushes forward', () => {
    expect(KICK_PROFILES.melee[1]).toBeLessThan(0);   // down
    expect(KICK_PROFILES.melee[2]).toBeLessThan(0);   // back (-forward)
    expect(KICK_PROFILES.cast[2]).toBeGreaterThan(0); // forward
  });

  it('localToWorldKick maps a camera-local profile to a world impulse along the flat look-dir', () => {
    // looking down +z (fwdX=0,fwdZ=1): forward-local maps onto +z, up stays world-up
    expect(localToWorldKick(0, 1, [0, -0.07, -0.09])).toEqual([0, -0.07, -0.09]); // back = -z
    // looking down +x: forward-local maps onto +x
    const w = localToWorldKick(1, 0, [0, 0, 0.1]);
    expect(w[0]).toBeCloseTo(0.1, 6);
    expect(w[1]).toBeCloseTo(0, 6);
    expect(w[2]).toBeCloseTo(0, 6);
  });

  it('localToWorldKick normalizes a non-unit forward (no magnitude leak)', () => {
    const w = localToWorldKick(0, 5, [0, 0, 0.1]); // fwd len 5 -> normalized
    expect(w[2]).toBeCloseTo(0.1, 6);
  });

  it('localToWorldKick tolerates a zero forward (degenerate aim -> vertical-only)', () => {
    expect(localToWorldKick(0, 0, [0, -0.12, 0.05])).toEqual([0, -0.12, 0]);
  });
});
