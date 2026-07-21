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
    const back = localToWorldKick(0, 1, [0, -0.07, -0.09]); // back = -z (component-wise: ±0 is meaningless here)
    expect(back[0]).toBeCloseTo(0, 6);
    expect(back[1]).toBeCloseTo(-0.07, 6);
    expect(back[2]).toBeCloseTo(-0.09, 6);
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

  it('a RIGHT-local kick maps onto screen-right = flatForward x worldUp (not its negation)', () => {
    // right = flatForward x worldUp = (-fz, 0, fx). For a unit forward (0.6, 0.8) a pure +right kick
    // must land at (-0.8, 0, 0.6). The pre-fix code computed (fz, -fx) = the NEGATION (screen-LEFT) —
    // dormant only because every KICK_PROFILE has a zero right component. MUTATION-PROOF: flip L34 back
    // to `rx = fz, rz = -fx` and this goes RED.
    const w = localToWorldKick(0.6, 0.8, [1, 0, 0]);
    expect(w[0]).toBeCloseTo(-0.8, 6);
    expect(w[1]).toBeCloseTo(0, 6);
    expect(w[2]).toBeCloseTo(0.6, 6);
    // and right stays perpendicular to forward (dot == 0)
    expect(w[0] * 0.6 + w[2] * 0.8).toBeCloseTo(0, 6);
  });
});
