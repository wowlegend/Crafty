import { describe, it, expect } from 'vitest';
import { sweepExpiredCorpses } from './corpseSweep.js';
import { DEATH_DISSOLVE_MS } from '../game/deathFx.js';

// A 320ms DISSOLVE THAT LASTED UP TO 1320ms.
//
// The sweep sat inside SpawnerSystem's 1000ms spawn-check throttle, so when a corpse was retired depended
// on where in the spawn cycle the mob happened to die. For most of that window MobModel has the body
// scaled to 0.001 -- an invisible entity still in mobsQuery, holding one of grass-bending's 8 bend slots
// and answering every targeter that walks the query.
//
// The assertion below is on WALL-CLOCK LATENCY, simulated frame by frame, because that is the property
// that was wrong. Asserting only "an expired corpse is removed" passes against the throttled version too.
const mob = (dyingUntil) => ({ id: Math.random(), dyingUntil });

/** Run `ms` of frames at `hz`, calling the sweep the way the frame loop does. Returns removal times. */
function runFrames({ ms, hz = 60, entities, throttleMs = 0 }) {
  const removed = new Map();
  const live = new Set(entities);
  const step = 1000 / hz;
  let lastCheck = -Infinity;
  for (let now = 0; now <= ms; now += step) {
    if (throttleMs > 0) {
      if (now - lastCheck < throttleMs) continue;
      lastCheck = now;
    }
    sweepExpiredCorpses(live, now, (e) => { live.delete(e); removed.set(e, now); });
  }
  return removed;
}

describe('corpseSweep — a corpse is retired on the frame its dissolve ends', () => {
  it('removes an expired corpse within ONE frame of its deadline', () => {
    const m = mob(DEATH_DISSOLVE_MS);
    const removed = runFrames({ ms: 2000, entities: [m] });
    expect(removed.has(m), 'the corpse was never removed').toBe(true);
    const lateness = removed.get(m) - DEATH_DISSOLVE_MS;
    expect(lateness, 'the corpse outlived its dissolve by more than a frame').toBeLessThan(1000 / 60 + 0.001);
  });

  it('THE DEFECT: the same sweep under a 1000ms throttle is up to a second late', () => {
    // The control that makes the assertion above mean something. If this ever stops being late, the
    // simulation is not modelling the throttle and the test above proves nothing.
    const m = mob(DEATH_DISSOLVE_MS);
    const removed = runFrames({ ms: 3000, entities: [m], throttleMs: 1000 });
    expect(removed.get(m) - DEATH_DISSOLVE_MS).toBeGreaterThan(500);
  });

  it('leaves a corpse alone while it is still dissolving', () => {
    const m = mob(1000);
    const removed = runFrames({ ms: 500, entities: [m] });
    expect(removed.has(m), 'a mid-dissolve body was deleted, so the death animation is cut short').toBe(false);
  });

  it('never touches a living mob, however long it runs', () => {
    const alive = { id: 'alive', health: 20 };
    const removed = runFrames({ ms: 5000, entities: [alive] });
    expect(removed.has(alive)).toBe(false);
  });

  it('retires a whole pile at once and reports the count', () => {
    // The return value is the denominator: a sweep that silently enumerated nothing looks identical to a
    // sweep with nothing to do.
    const dead = [mob(10), mob(20), mob(30)];
    const live = new Set([...dead, { id: 'alive', health: 5 }]);
    const n = sweepExpiredCorpses(live, 100, (e) => live.delete(e));
    expect(n).toBe(3);
    expect(live.size).toBe(1);
  });

  it('survives a null entity and an empty query without throwing', () => {
    expect(() => sweepExpiredCorpses([null, undefined], 100, () => {})).not.toThrow();
    expect(sweepExpiredCorpses([], 100, () => {})).toBe(0);
    expect(sweepExpiredCorpses(null, 100, () => {})).toBe(0);
  });

  it('does not leak its scratch between calls', () => {
    // The scratch is module-scope to keep the hot path allocation-free; a missed reset would re-remove
    // entities that are already gone on every subsequent frame.
    const m = mob(1); // not 0 -- dyingUntil is a performance.now() stamp and the guard tests truthiness
    expect(sweepExpiredCorpses([m], 100, () => {})).toBe(1);
    expect(sweepExpiredCorpses([], 100, () => {}), 'the scratch carried over').toBe(0);
  });
});
