import { describe, it, expect, vi } from 'vitest';
import { bossEntranceBeat, ENTRANCE } from './bossEntrance.js';
import { runIsolatedEffects } from './isolatedEffects.js';
import { HITSTOP } from './trauma.js';

// E-ter/E4 — the dragon's ARRIVAL is the climax of the run and had a text notification and nothing else,
// while the KILL fires eight isolated effects including hitstop and a bloom spike. The end of the fight had
// weight; the start of it had a toast.

describe('the entrance beat fires everything, in order', () => {
  it('names all four effects with notify first', () => {
    const beat = bossEntranceBeat({ notify: () => {}, shake: () => {}, bloom: () => {}, hitstop: () => {} });
    expect(beat.map(([name]) => name)).toEqual(['notify', 'shake', 'bloom', 'hitstop']);
  });

  it('actually invokes each callback when run', () => {
    const calls = { notify: vi.fn(), shake: vi.fn(), bloom: vi.fn(), hitstop: vi.fn() };
    const failed = runIsolatedEffects(bossEntranceBeat(calls));
    expect(failed).toEqual([]);
    for (const [name, fn] of Object.entries(calls)) expect(fn, name).toHaveBeenCalledTimes(1);
  });

  it('a throwing cosmetic effect cannot suppress the others', () => {
    // The B2h scar generalised: a bloom spike on a lost GL context must not cost the player the freeze,
    // the shake, or — most importantly — the message telling them what just arrived.
    const notify = vi.fn();
    const hitstop = vi.fn();
    const failed = runIsolatedEffects(bossEntranceBeat({
      notify, shake: () => { throw new Error('shake exploded'); }, bloom: () => { throw new Error('no ctx'); }, hitstop,
    }));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(hitstop).toHaveBeenCalledTimes(1);
    expect(failed.map((f) => f.name)).toEqual(['shake', 'bloom']);
  });

  it('degrades quietly when a hook is missing rather than crashing the spawn path', () => {
    // The spawn path is the only route to the climax; it must never throw.
    expect(() => runIsolatedEffects(bossEntranceBeat({ notify: () => {} }))).not.toThrow();
    expect(() => runIsolatedEffects(bossEntranceBeat())).not.toThrow();
  });
});

describe('the entrance is tuned AGAINST the kill, not in isolation', () => {
  it('freezes longer than the kill — arrival is a held breath, the kill is an impact', () => {
    expect(ENTRANCE.hitstopMs).toBeGreaterThan(HITSTOP.boss);
  });

  it('swells longer than the kill flashes — dread builds, impact snaps', () => {
    // The first draft of this test asserted `bloomMs < KILL_BLOOM + bloomMs`, which is true for every
    // possible value and therefore asserted nothing — and it was hiding the fact that the comment above it
    // claimed the entrance blooms SHORTER while the constant was longer. Both are fixed; this is the real
    // relationship, so the two beats cannot silently converge into the same shape.
    const KILL_BLOOM_MS = 450; // bossSystem's kill beat
    expect(ENTRANCE.bloomMs).toBeGreaterThan(KILL_BLOOM_MS);
  });

  it('shakes less than a damage hit, which scales as damage/10', () => {
    // A 25-damage moss-brute blow shakes 2.5. The dragon arriving should be felt but not out-punch being hit.
    expect(ENTRANCE.shake).toBeLessThan(2.5);
  });

  it('every magnitude is finite and positive', () => {
    for (const [k, v] of Object.entries(ENTRANCE)) {
      expect(Number.isFinite(v), k).toBe(true);
      expect(v, k).toBeGreaterThan(0);
    }
  });
});
