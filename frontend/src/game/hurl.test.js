import { describe, it, expect } from 'vitest';
import {
  makeHurl, stepHurl, resolveSlam,
  HURL_SPEED, HURL_TTL_SEC, HURL_HIT_RADIUS, HURL_KNOCK, SLAM_RADIUS, SLAM_DAMAGE_MULT, HURL_DAMAGE,
} from './hurl';

const mob = (id, x, y, z) => ({ id, position: { x, y, z } });

describe('hurl core (S2-B2-M3)', () => {
  it('makeHurl launches along dir at HURL_SPEED with a small lift', () => {
    const h = makeHurl({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(h.velocity.x).toBeCloseTo(HURL_SPEED, 5);
    expect(h.velocity.y).toBeGreaterThan(0);
    expect(h.age).toBe(0);
  });

  it('stepHurl advances ballistically (gravity bends the arc)', () => {
    const h = makeHurl({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 });
    const vy0 = h.velocity.y;
    stepHurl(h, 0.1, []);
    expect(h.position.x).toBeCloseTo(HURL_SPEED * 0.1, 3);
    expect(h.velocity.y).toBeLessThan(vy0);
  });

  it('hits the nearest mob inside HURL_HIT_RADIUS and reports pos+dir (the M4 anvil seam)', () => {
    const h = makeHurl({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 });
    const m = mob('a', HURL_SPEED * 0.1 + 0.5, 10, 0); // just past the first step, inside radius
    const r = stepHurl(h, 0.1, [m]);
    expect(r.done).toBe(true);
    expect(r.hit.id).toBe('a');
    expect(r.hit.pos.x).toBeCloseTo(h.position.x, 5);
    const mag = Math.hypot(r.hit.dir.x, r.hit.dir.y, r.hit.dir.z);
    expect(mag).toBeCloseTo(1, 3); // normalized flight dir for knockback + the M4 wall ray
  });

  it('misses mobs outside the radius and expires at TTL', () => {
    const h = makeHurl({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 });
    const far = mob('b', 0, 10, 9);
    let r = stepHurl(h, 0.1, [far]);
    expect(r.done).toBe(false);
    r = stepHurl(h, HURL_TTL_SEC, [far]);
    expect(r.done).toBe(true);
    expect(r.hit).toBeNull();
  });

  it('resolveSlam returns radial knock events for mobs inside SLAM_RADIUS only', () => {
    const center = { x: 0, y: 10, z: 0 };
    const events = resolveSlam(center, [mob('in', 1.5, 10, 0), mob('edge', 0, 10, SLAM_RADIUS + 0.1), mob('in2', 0, 10.5, -2)]);
    expect(events.map((e) => e.id).sort()).toEqual(['in', 'in2']);
    const e = events.find((x) => x.id === 'in');
    expect(e.dir.x).toBeCloseTo(1, 3); // radial, horizontal, normalized
    expect(e.dir.y).toBe(0);
  });

  it('resolveSlam at a mob directly under the center still yields a finite dir', () => {
    const events = resolveSlam({ x: 0, y: 10, z: 0 }, [mob('under', 0, 9.5, 0)]);
    expect(events).toHaveLength(1);
    expect(Number.isFinite(events[0].dir.x)).toBe(true);
    expect(Math.hypot(events[0].dir.x, events[0].dir.z)).toBeCloseTo(1, 3);
  });

  it('exports the tuning table', () => {
    expect(HURL_SPEED).toBe(22);
    expect(HURL_HIT_RADIUS).toBeCloseTo(1.4, 5);
    expect(HURL_KNOCK).toBe(12);
    expect(SLAM_RADIUS).toBe(3);
    expect(SLAM_DAMAGE_MULT).toBeCloseTo(1.3, 5);
    expect(HURL_DAMAGE).toBe(30);
  });
});
