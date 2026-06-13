import { describe, it, expect } from 'vitest';
import { stepXPOrb } from './xpOrbStepper.js';

const orb = (o = {}) => ({ position: { x: 0, y: 10, z: 0 }, velocity: { x: 0, y: 5, z: 0 }, age: 0, ...o });
const ctx = (over = {}) => ({ playerPos: { x: 0, y: 1, z: 0 }, groundYAt: () => null, ...over });

describe('stepXPOrb', () => {
  it('explosion phase (age<0.8): gravity pulls velocity.y down + integrates position', () => {
    const o = orb();
    stepXPOrb(o, 0.1, ctx());
    expect(o.age).toBeCloseTo(0.1, 6);
    expect(o.velocity.y).toBeCloseTo(5 - 12 * 0.1, 6);            // gravity -12*dt
    expect(o.position.y).toBeCloseTo(10 + (5 - 12 * 0.1) * 0.1, 6); // integrate AFTER gravity
  });

  it('explosion phase: bounces off ground (damp + friction) when below groundY+0.1', () => {
    const o = orb({ position: { x: 0, y: 0.0, z: 0 }, velocity: { x: 2, y: -3, z: 2 } });
    stepXPOrb(o, 0.016, ctx({ groundYAt: () => 0 })); // ground at y=0 -> floor y=0.1
    expect(o.position.y).toBeCloseTo(0.1, 6);
    expect(o.velocity.y).toBeGreaterThan(0);            // bounced (sign flipped, damped)
    expect(Math.abs(o.velocity.x)).toBeLessThan(2);     // friction *0.7
  });

  it('pull phase (age>=0.8): magnetic pull toward player when dist<12, not collected yet', () => {
    const o = orb({ position: { x: 5, y: 1, z: 0 }, age: 1.0 });
    const r = stepXPOrb(o, 0.016, ctx({ playerPos: { x: 0, y: 1.5, z: 0 } }));
    expect(o.position.x).toBeLessThan(5);               // pulled toward player (-x)
    expect(r.collected).toBe(false);
  });

  it('pull phase: collects when dist<1.2 (returns collected:true)', () => {
    const o = orb({ position: { x: 0.5, y: 1, z: 0 }, age: 1.0 });
    const r = stepXPOrb(o, 0.016, ctx({ playerPos: { x: 0, y: 1.5, z: 0 } }));
    expect(r.collected).toBe(true);
  });

  it('pull phase: far orb (dist>=12) is NOT pulled or collected (just ground-snapped if groundY)', () => {
    const o = orb({ position: { x: 50, y: 9, z: 0 }, age: 1.0 });
    const r = stepXPOrb(o, 0.016, ctx({ groundYAt: () => 4 }));
    expect(o.position.x).toBe(50);                      // no pull
    expect(o.position.y).toBeCloseTo(4.1, 6);           // snapped to groundY+0.1
    expect(r.collected).toBe(false);
  });
});
