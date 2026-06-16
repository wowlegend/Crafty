import { describe, it, expect } from 'vitest';
import { sparkFor, hitKnockback, deathBurst, flinchTilt, biasAlong } from './mobHitFx.js';

describe('sparkFor (the element -> spark table)', () => {
  it('count is 60 on crit, 25 otherwise', () => {
    expect(sparkFor('fireball', true).count).toBe(60);
    expect(sparkFor('fireball', false).count).toBe(25);
  });
  it('maps each spell element to its color', () => {
    expect(sparkFor('fireball', false).color).toBe('#ff5500');
    expect(sparkFor('iceball', false).color).toBe('#00d2ff');
    expect(sparkFor('lightning', false).color).toBe('#ffff00');
    expect(sparkFor('arcane', false).color).toBe('#d900ff');
  });
  it('physical = glowing gold on crit, crimson otherwise', () => {
    expect(sparkFor('physical', true).color).toBe('#ffcc00');
    expect(sparkFor('physical', false).color).toBe('#ff2200');
  });
  it('unknown type falls back to the physical case', () => {
    expect(sparkFor('weirdtype', true).color).toBe('#ffcc00');
    expect(sparkFor('weirdtype', false).color).toBe('#ff2200');
  });
});

describe('hitKnockback', () => {
  it('knocks the mob AWAY from the player (unit dir * 2), y=0', () => {
    // mob east of player -> knockback +x
    const r = hitKnockback({ x: 5, y: 1, z: 0 }, { x: 0, y: 1, z: 0 });
    expect(r.knockback[0]).toBeCloseTo(2, 6);   // +x * 2
    expect(r.knockback[1]).toBe(0);
    expect(r.knockback[2]).toBeCloseTo(0, 6);
    expect(r.hitDir[0]).toBeCloseTo(1, 6);      // unit +x
  });
  it('normalizes a diagonal (magnitude 2 knockback regardless of distance)', () => {
    const r = hitKnockback({ x: 30, y: 0, z: 40 }, { x: 0, y: 0, z: 0 }); // dist 50
    expect(Math.hypot(r.knockback[0], r.knockback[2])).toBeCloseTo(2, 6);
    expect(Math.hypot(r.hitDir[0], r.hitDir[2])).toBeCloseTo(1, 6);
  });
  it('no camera -> knockback null (untouched), hitDir defaults forward [0,0,-1]', () => {
    const r = hitKnockback({ x: 5, y: 1, z: 0 }, null);
    expect(r.knockback).toBe(null);
    expect(r.hitDir).toEqual([0, 0, -1]);
  });
});

describe('deathBurst (the kill finisher)', () => {
  it("uses the mob's body color", () => {
    expect(deathBurst('zombie').color).toBe('#228B22');
    expect(deathBurst('skeleton').color).toBe('#F5F5DC');
  });
  it('count scales with xp (40 + xp), tougher mobs burst harder', () => {
    expect(deathBurst('zombie').count).toBe(65);      // 40 + 25
    expect(deathBurst('moss_brute').count).toBe(100);  // 40 + 60
  });
  it('count is clamped to a 50..110 floor/ceiling', () => {
    expect(deathBurst('pig').count).toBe(50);          // 40 + 10 -> floored to 50
  });
  it('unknown mob -> white, minimum burst', () => {
    expect(deathBurst('nope')).toEqual({ color: '#ffffff', count: 50 });
  });
});

describe('flinchTilt (the directional reel)', () => {
  it('zero hit direction -> no tilt', () => {
    const t = flinchTilt(0, 0, 0, 1);
    expect(t.pitch).toBeCloseTo(0); expect(t.roll).toBeCloseTo(0);
  });
  it('facing 0: a hit along world +Z pitches, no roll', () => {
    const t = flinchTilt(0, 1, 0, 1);
    expect(t.pitch).toBeCloseTo(0.22); expect(t.roll).toBeCloseTo(0);
  });
  it('facing 0: a hit along world +X rolls, no pitch', () => {
    const t = flinchTilt(1, 0, 0, 1);
    expect(t.pitch).toBeCloseTo(0); expect(t.roll).toBeCloseTo(-0.22);
  });
  it('scales with the wave envelope', () => {
    expect(flinchTilt(0, 1, 0, 0.5).pitch).toBeCloseTo(0.11);
  });
  it('is facing-relative: a side hit while turned 90deg rolls, not pitches', () => {
    const t = flinchTilt(0, 1, Math.PI / 2, 1); // world +Z hit, facing +90deg = local side
    expect(t.pitch).toBeCloseTo(0); expect(Math.abs(t.roll)).toBeCloseTo(0.22);
  });
});

describe('biasAlong (spark velocity cone)', () => {
  it('no direction -> velocity unchanged', () => {
    expect(biasAlong(3, 4, 0, 0, 0.6)).toEqual({ vx: 3, vz: 4 });
  });
  it('strength 1 aligns the full horizontal speed along the dir', () => {
    const r = biasAlong(3, 4, 1, 0, 1); // speed 5
    expect(r.vx).toBeCloseTo(5); expect(r.vz).toBeCloseTo(0);
  });
  it('strength 0 leaves it radial', () => {
    expect(biasAlong(3, 4, 1, 0, 0)).toEqual({ vx: 3, vz: 4 });
  });
});
