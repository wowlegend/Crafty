import { describe, it, expect } from 'vitest';
import { parkDeadDebris, REST } from './debrisPark.js';

// DEAD DEBRIS THAT FELL FOREVER.
//
// The old line was `setTranslation(hidePosition, true)`: teleport to y=-1000 and WAKE the body, velocity
// untouched. Every dead chunk kept free-falling, accumulating speed, and could never reach the sleep
// threshold — and Rapier steps an awake body every tick whether or not anything can see it, so a mining
// session's worth of debris cost the rest of the run.
const spyBody = () => {
  const calls = [];
  return {
    calls,
    setLinvel: (v, wake) => calls.push(['setLinvel', v, wake]),
    setAngvel: (v, wake) => calls.push(['setAngvel', v, wake]),
    setTranslation: (p, wake) => calls.push(['setTranslation', p, wake]),
    sleep: () => calls.push(['sleep']),
  };
};
const HIDE = { x: 0, y: -1000, z: 0 };

describe('parkDeadDebris', () => {
  it('never wakes the body — the whole defect was wakeUp:true', () => {
    const b = spyBody();
    parkDeadDebris(b, HIDE);
    for (const [name, , wake] of b.calls) {
      if (name === 'sleep') continue;
      expect(wake, `${name} woke the body`).toBe(false);
    }
  });

  it('zeroes BOTH velocities before it moves the body', () => {
    // Order is the reason this is a function. Waking to move and then zeroing leaves the body awake until
    // the sleep threshold elapses all over again.
    const b = spyBody();
    parkDeadDebris(b, HIDE);
    const names = b.calls.map((c) => c[0]);
    expect(names.indexOf('setLinvel')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('setAngvel')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('setTranslation'), 'the body was moved before its velocity was cleared').toBeGreaterThan(
      Math.max(names.indexOf('setLinvel'), names.indexOf('setAngvel'))
    );
  });

  it('asks it to sleep explicitly, and moves it out of sight', () => {
    const b = spyBody();
    parkDeadDebris(b, HIDE);
    expect(b.calls.map((c) => c[0])).toContain('sleep');
    expect(b.calls.find((c) => c[0] === 'setTranslation')[1]).toBe(HIDE);
  });

  it('tolerates a binding with no sleep() rather than throwing mid-loop', () => {
    const b = spyBody();
    delete b.sleep;
    expect(() => parkDeadDebris(b, HIDE)).not.toThrow();
  });

  it('reports rather than throwing when the body is missing', () => {
    expect(parkDeadDebris(null, HIDE)).toBe(false);
  });

  it('REST is frozen and zero — a shared vector a binding could write through is worse than a fresh one', () => {
    expect(Object.isFrozen(REST)).toBe(true);
    expect(REST).toEqual({ x: 0, y: 0, z: 0 });
  });
});
