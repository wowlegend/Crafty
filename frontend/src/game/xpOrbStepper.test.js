import { describe, it, expect } from 'vitest';
import { stepXPOrb, stepLootDrop, oldestOverBound, BANKED, PICKUP_LIFETIME_S, PICKUP_CULL_RANGE, MAX_XP_ORBS, MAX_LOOT_DROPS } from './xpOrbStepper.js';

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

describe('stepLootDrop (same physics, tighter magnet: range 7 / base 40 / floor 3)', () => {
  it('shares the explosion-phase gravity (age<0.8)', () => {
    const o = orb();
    stepLootDrop(o, 0.1, ctx());
    expect(o.velocity.y).toBeCloseTo(5 - 12 * 0.1, 6);
  });

  it('pulls when dist<7', () => {
    const o = orb({ position: { x: 4, y: 1, z: 0 }, age: 1.0 });
    stepLootDrop(o, 0.016, ctx({ playerPos: { x: 0, y: 1.5, z: 0 } }));
    expect(o.position.x).toBeLessThan(4);              // pulled toward player
  });

  it('does NOT pull at dist 7..12 (the key diff from the XP-orb, which WOULD pull there)', () => {
    const at9 = () => ({ position: { x: 9, y: 6, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, age: 1.0 });
    const loot = at9(), xp = at9();
    stepLootDrop(loot, 0.016, ctx({ playerPos: { x: 0, y: 1.5, z: 0 }, groundYAt: () => 5 }));
    stepXPOrb(xp, 0.016, ctx({ playerPos: { x: 0, y: 1.5, z: 0 }, groundYAt: () => 5 }));
    expect(loot.position.x).toBe(9);                   // loot: out of its 7-range -> no pull (ground-snapped)
    expect(loot.position.y).toBeCloseTo(5.1, 6);
    expect(xp.position.x).toBeLessThan(9);             // orb: within its 12-range -> pulled
  });

  it('collects at dist<1.2', () => {
    const o = orb({ position: { x: 0.5, y: 1, z: 0 }, age: 1.0 });
    expect(stepLootDrop(o, 0.016, ctx({ playerPos: { x: 0, y: 1.5, z: 0 } })).collected).toBe(true);
  });
});

// AUDIT:leaks:stranded-pickups-never-despawn. A pickup the player does not walk to used to stay all session, costing a floor
// probe and a render callback every frame, and its XP and item waited for a walk that might never come. A pickup now has a
// lifetime and a cull range; past either, and out of reach, the step reports it collected AND expired, so the system banks
// what the player is owed without the pop and the sound of a pickup in their hands.
describe('a pickup has a lifetime and a cull range', () => {
  const LIFE = 90, RANGE = 100; // the contract numbers (DECISIONS 2026-10-30 lane L9), not read back from the module
  const far = (o = {}) => orb({ position: { x: 40, y: 1, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, age: 1.0, ...o });
  const probe = () => { const calls = []; return { calls, ground: (x, z, y) => { calls.push([x, z, y]); return 0; } }; };

  it('the exports are the contract numbers', () => {
    expect(PICKUP_LIFETIME_S).toBe(LIFE);
    expect(PICKUP_CULL_RANGE).toBe(RANGE);
  });

  for (const [name, step] of [['XP orb', stepXPOrb], ['loot drop', stepLootDrop]]) {
    describe(name, () => {
      it('is still waiting for the player just before its lifetime ends', () => {
        const o = far({ age: LIFE - 1 });
        const r = step(o, 0.5, ctx({ playerPos: { x: 0, y: 1.5, z: 0 } })); // age reaches LIFE - 0.5
        expect(r.collected).toBe(false);
        expect(r.expired).toBeFalsy();
      });
      it('expires out of reach once its age reaches the lifetime: collected, flagged expired, not moved, not probed', () => {
        const o = far({ age: LIFE - 0.1 });
        const g = probe();
        const r = step(o, 0.2, ctx({ playerPos: { x: 0, y: 1.5, z: 0 }, groundYAt: g.ground }));
        expect(r).toEqual({ collected: true, expired: true });
        expect(o.position.x, 'an expiring pickup was pulled before it was banked').toBe(40);
        expect(g.calls, 'an expiring pickup paid for a floor probe it does not need').toHaveLength(0);
      });
      it('is culled beyond the range at any age, but not at it', () => {
        const young = far({ position: { x: RANGE + 20, y: 1, z: 0 }, age: 1.0 });
        expect(step(young, 0.016, ctx({ playerPos: { x: 0, y: 1.5, z: 0 } }))).toEqual({ collected: true, expired: true });
        const edge = far({ position: { x: RANGE - 5, y: 1, z: 0 }, age: 1.0 });
        const r = step(edge, 0.016, ctx({ playerPos: { x: 0, y: 1.5, z: 0 } }));
        expect(r.collected, 'a pickup inside the cull range was culled').toBe(false);
      });
      it('a pickup in the player\'s hands at its expiry is an ordinary collect, with the pop and the sound', () => {
        const o = orb({ position: { x: 0.5, y: 1, z: 0 }, age: LIFE + 1 });
        const r = step(o, 0.016, ctx({ playerPos: { x: 0, y: 1.5, z: 0 } }));
        expect(r.collected).toBe(true);
        expect(r.expired, 'an expiry swallowed an ordinary collect').toBeFalsy();
      });
      it('never expires while it is still in its first 0.8 s burst', () => {
        const o = orb({ age: 0 });
        const r = step(o, 0.1, ctx());
        expect(r.collected).toBe(false);
        expect(r.expired).toBeFalsy();
      });
    });
  }
});

// The pool's size bound: the systems bank the oldest pickups past it. What they bank is chosen here.
describe('oldestOverBound: the pickups to bank so that at most `max` stay', () => {
  const aged = (...ages) => ages.map((age, id) => ({ id, age }));
  it('the exports are the contract numbers', () => {
    expect(MAX_XP_ORBS).toBe(64);
    expect(MAX_LOOT_DROPS).toBe(32);
  });
  it('is null while the pool is within its bound, the bound included', () => {
    expect(oldestOverBound(aged(1, 2, 3), 3)).toBeNull();
    expect(oldestOverBound(aged(1, 2, 3), 4)).toBeNull();
    expect(oldestOverBound([], 0)).toBeNull();
  });
  it('picks the oldest by age, as many as the overflow, whatever the array order', () => {
    const pool = aged(5, 80, 1, 60, 30);
    const cut = oldestOverBound(pool, 3);
    expect([...cut].map((e) => e.age).sort((a, b) => a - b)).toEqual([60, 80]);
    for (const e of cut) expect(pool).toContain(e);
  });
  it('leaves the pool as it found it', () => {
    const pool = aged(5, 80, 1);
    oldestOverBound(pool, 1);
    expect(pool.map((e) => e.age)).toEqual([5, 80, 1]);
  });
  it('the banked step is a collect that is flagged expired, and cannot be edited in place', () => {
    expect(BANKED).toEqual({ collected: true, expired: true });
    expect(Object.isFrozen(BANKED)).toBe(true);
  });
});
