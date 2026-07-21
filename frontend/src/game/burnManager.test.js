import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeBurnManager } from './burnManager.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('makeBurnManager — fire DoT interval registry', () => {
  it('ticks damage once per second for `duration` ticks, then self-clears', () => {
    const hits = [];
    const dm = (id, dps) => { hits.push([id, dps]); return { id, health: 10 }; };
    const mgr = makeBurnManager();
    mgr.start('m1', 3, 5, () => dm);
    expect(mgr.size).toBe(1);

    vi.advanceTimersByTime(4000); // well past the 3s burn
    expect(hits).toEqual([['m1', 5], ['m1', 5], ['m1', 5]]); // exactly 3 ticks
    expect(mgr.size).toBe(0);                                 // self-cleared at expiry
  });

  it('stops the instant the mob is gone (damageMob returns null)', () => {
    let alive = true;
    const dm = () => (alive ? { id: 'm1' } : null);
    const mgr = makeBurnManager();
    let calls = 0;
    mgr.start('m1', 10, 5, () => (...a) => { calls++; alive = calls < 2; return dm(...a); });
    vi.advanceTimersByTime(10000);
    expect(calls).toBe(2);      // tick 1 hits, tick 2 sees the mob dead and clears
    expect(mgr.size).toBe(0);
  });

  it('stops when the global damage method disappears', () => {
    let damageMob = () => ({ id: 'm1' });
    const mgr = makeBurnManager();
    mgr.start('m1', 10, 5, () => damageMob);
    vi.advanceTimersByTime(2000);
    damageMob = null; // the magic system tore down its GameMethods
    vi.advanceTimersByTime(5000);
    expect(mgr.size).toBe(0);
  });

  // THE LEAK FIX: an unmount mid-burn must not leave a ticker hammering damage forever. stopAll() clears
  // every live handle. MUTATION-PROOF: stop registering handles in `active` (or make stopAll a no-op) and
  // damage keeps landing after stopAll().
  it('stopAll() halts an in-flight burn so no further damage lands (the unmount cleanup)', () => {
    const hits = [];
    const dm = (id) => { hits.push(id); return { id }; };
    const mgr = makeBurnManager();
    mgr.start('m1', 100, 5, () => dm); // a long burn, still active
    vi.advanceTimersByTime(2000);
    const before = hits.length;
    expect(before).toBe(2);
    expect(mgr.size).toBe(1);

    mgr.stopAll(); // <- component unmount
    expect(mgr.size).toBe(0);
    vi.advanceTimersByTime(10000);
    expect(hits.length).toBe(before); // no further ticks after stopAll
  });

  it('tracks multiple concurrent burns and stopAll clears them all', () => {
    const mgr = makeBurnManager();
    const dm = () => ({ id: 'x' });
    mgr.start('a', 100, 1, () => dm);
    mgr.start('b', 100, 1, () => dm);
    expect(mgr.size).toBe(2);
    mgr.stopAll();
    expect(mgr.size).toBe(0);
  });
});
