import { describe, it, expect } from 'vitest';
import { stepXPOrb, stepLootDrop, cutXPOrbs, cutLootDrops, PICKUP_LIFETIME_S, PICKUP_CULL_RANGE, MAX_XP_ORBS, MAX_LOOT_DROPS } from './xpOrbStepper.js';

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

// The magnet and the collect read the player's distance from a point half a metre below the camera (the chest of the body,
// not the eye). A pickup straight below at 11.8 m from that point is 12.3 m from the eye: only the true point pulls it.
describe('where the player is for a pickup: half a metre below the camera', () => {
  const below = (gap) => orb({ position: { x: 0, y: 1.0 - gap, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, age: 1.0 });
  it('the orb magnet pulls a pickup 11.8 m below that point and not one 12.2 m below it', () => {
    const inside = below(11.8);
    stepXPOrb(inside, 0.016, ctx({ playerPos: { x: 0, y: 1.5, z: 0 } }));
    expect(inside.position.y, 'a pickup inside the magnet, measured from the body, was not pulled').toBeGreaterThan(1.0 - 11.8);
    const outside = below(12.2);
    stepXPOrb(outside, 0.016, ctx({ playerPos: { x: 0, y: 1.5, z: 0 } }));
    expect(outside.position.y, 'a pickup outside the magnet was pulled').toBe(1.0 - 12.2);
  });
  it('the cut reads the same point: the one 11.8 m below is within reach, so a pickup at the feet is cut before it', () => {
    const player = { x: 0, y: 1.5, z: 0 };
    const feet = (id, age) => ({ id, age, position: { x: 0, y: 1.0, z: 0 } });
    const pool = [...Array.from({ length: MAX_XP_ORBS }, (_, i) => feet(i, 50)), { id: 'below', age: 1, position: { x: 0, y: 1.0 - 11.8, z: 0 } }];
    expect([...cutXPOrbs(pool, player).keys()].map((e) => e.id), 'the cut read the player at the eye, so a pickup within the magnet counted as out of reach').not.toContain('below');
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
// lifetime and a cull range; past either, and out of reach (outside its own magnet), the step reports it collected AND
// expired, so the system banks what the player is owed without the pop and the sound of a pickup in their hands. A pickup
// inside its magnet is the player's to collect in hand, whatever its age: the magnet finishes it within the second.
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
      it('a pickup inside its own magnet at its expiry is pulled in, not banked: only a pickup out of reach is', () => {
        const magnet = name === 'XP orb' ? 12 : 7;
        const inside = far({ position: { x: magnet - 2, y: 1, z: 0 }, age: LIFE + 5 });
        const r = step(inside, 0.016, ctx({ playerPos: { x: 0, y: 1.5, z: 0 } }));
        expect(r.expired, 'a pickup inside its magnet was banked mid-flight, with no sound, at its expiry').toBeFalsy();
        expect(inside.position.x, 'a pickup inside its magnet was not pulled toward the player').toBeLessThan(magnet - 2);
        const outside = far({ position: { x: magnet + 2, y: 1, z: 0 }, age: LIFE + 5 });
        expect(step(outside, 0.016, ctx({ playerPos: { x: 0, y: 1.5, z: 0 } })), 'a pickup outside its magnet was not banked at its expiry').toEqual({ collected: true, expired: true });
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

// The pool's size bound: past it the systems cut the pickups the player is least likely to be about to collect. What they cut,
// and what the cut does to each, is chosen here.
describe('the cut: the pickups to take out so that at most `max` stay', () => {
  const at = (x, age, id) => ({ id, age, position: { x, y: 1, z: 0 } });
  const player = { x: 0, y: 1.5, z: 0 };
  // `n` pickups, the i-th at x[i], aged age[i]
  const pool = (xs, ages) => xs.map((x, i) => at(x, ages[i], i));
  const fill = (n, x, age) => Array.from({ length: n }, (_, i) => at(x, age, i));

  it('the bounds are the contract numbers', () => {
    expect(MAX_XP_ORBS).toBe(64);
    expect(MAX_LOOT_DROPS).toBe(32);
  });
  for (const [name, cut, bound, magnet] of [['XP orbs', cutXPOrbs, 64, 12], ['loot drops', cutLootDrops, 32, 7]]) {
    describe(name, () => {
      it('is null while the pool is within its bound, the bound included', () => {
        expect(cut(fill(bound - 1, 30, 5), player)).toBeNull();
        expect(cut(fill(bound, 30, 5), player)).toBeNull();
        expect(cut([], player)).toBeNull();
      });
      it('takes out exactly the overflow', () => {
        const entities = fill(bound + 5, 30, 5);
        const c = cut(entities, player);
        expect(c.size).toBe(5);
        for (const e of c.keys()) expect(entities).toContain(e);
      });
      it('takes the pickups out of reach first, the oldest of them first, whatever the array order and however young', () => {
        // two out of reach (the older one listed last), the rest within the magnet and OLDER than both
        const entities = [...fill(bound - 1, magnet - 3, 80), at(40, 2, 'far-young'), at(60, 9, 'far-older')];
        const c = cut(entities, player);
        expect(c.size).toBe(1);
        expect([...c.keys()].map((e) => e.id), 'an older pickup within reach was cut before one the player is not near').toEqual(['far-older']);
        const two = cut([...fill(bound, magnet - 3, 80), at(40, 2, 'far-young'), at(60, 9, 'far-older')], player);
        expect([...two.keys()].map((e) => e.id).sort()).toEqual(['far-older', 'far-young']);
      });
      it('banks what it cuts out of reach: collected, flagged expired, nothing to play', () => {
        const entities = [...fill(bound, magnet - 3, 5), at(50, 6, 'far')];
        const step = cut(entities, player).get(entities[entities.length - 1]);
        expect(step).toEqual({ collected: true, expired: true });
      });
      it('collects in hand what it must cut within reach: the pickup the player is standing at is not banked in silence', () => {
        const entities = fill(bound + 3, magnet - 3, 5);
        const c = cut(entities, player);
        expect(c.size).toBe(3);
        for (const step of c.values()) {
          expect(step.collected).toBe(true);
          expect(step.expired, 'a pickup within reach was banked silently by the cut').toBeFalsy();
        }
      });
      it('within reach is the kind\'s own magnet: the one just inside is collected in hand, the one just outside is banked', () => {
        // everything else stands at the player's feet; the oldest sits just inside the magnet, and is the one cut
        const inside = cut([...fill(bound, 1, 5), at(magnet - 0.5, 99, 'inside')], player);
        expect([...inside.keys()].map((e) => e.id)).toEqual(['inside']);
        expect([...inside.values()][0].expired, 'a pickup inside the magnet range was banked').toBeFalsy();
        // the youngest sits just outside it, and is the one cut because it is out of reach, not because it is old
        const outside = cut([...fill(bound, 1, 50), at(magnet + 0.5, 1, 'outside')], player);
        expect([...outside.keys()].map((e) => e.id)).toEqual(['outside']);
        expect([...outside.values()][0], 'a pickup outside the magnet range was not banked').toEqual({ collected: true, expired: true });
      });
      it('leaves the pool as it found it', () => {
        const entities = fill(bound + 2, 30, 5);
        const snapshot = entities.map((e) => ({ ...e, position: { ...e.position } }));
        cut(entities, player);
        expect(entities).toEqual(snapshot);
      });
    });
  }
  it('the two kinds keep their own magnet: a pickup 9 m out is within reach for an orb and out of it for a drop', () => {
    const orbs = [...fill(MAX_XP_ORBS, 1, 5), at(9, 99, 'nine')];     // the rest at the player's feet: the one cut is 'nine'
    const drops = [...fill(MAX_LOOT_DROPS, 1, 5), at(9, 1, 'nine')];
    expect([...cutXPOrbs(orbs, player).values()][0].expired, 'an orb 9 m out is inside its 12 m magnet').toBeFalsy();
    expect([...cutLootDrops(drops, player).values()][0], 'a drop 9 m out is outside its 7 m magnet').toEqual({ collected: true, expired: true });
  });
  it('is the oldest first among pickups of the same reach', () => {
    const entities = pool([30, 30, 30, 30], [3, 50, 7, 20]);
    // padded to the real bound plus two, so exactly two are cut
    const padded = [...entities, ...fill(MAX_LOOT_DROPS - 2, 30, 1)];
    const c = cutLootDrops(padded, player);
    expect([...c.keys()].map((e) => e.age).sort((a, b) => a - b), 'the cut did not take the two oldest').toEqual([20, 50]);
  });
});
