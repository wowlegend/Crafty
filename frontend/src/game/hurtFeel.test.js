import { describe, it, expect } from 'vitest';
import { hurtStopMs, isNewHit, HURT_TIERS } from './hurtFeel.js';
import { HITSTOP } from './trauma.js';

// E-ter — hitstop existed only for OUTGOING hits, so the player's swings had weight and the enemies' did
// not. A moss brute's 25-damage blow landed with exactly the same feedback as a skitterling's 5.

const MAX = 100;

describe('hurtStopMs — the freeze grades with what the hit cost you', () => {
  it('escalates through the same light/heavy/crit vocabulary as outgoing hits', () => {
    // One vocabulary across both directions: a player learns "long freeze = big hit" once.
    expect(hurtStopMs(5, MAX)).toBe(HITSTOP.light);
    expect(hurtStopMs(15, MAX)).toBe(HITSTOP.heavy);
    expect(hurtStopMs(30, MAX)).toBe(HITSTOP.crit);
  });

  it('is monotonic — a bigger hit never freezes for less', () => {
    let prev = 0;
    for (const d of [1, 5, 11, 12, 20, 25, 40, 99]) {
      const ms = hurtStopMs(d, MAX);
      expect(ms, `damage ${d}`).toBeGreaterThanOrEqual(prev);
      prev = ms;
    }
  });

  it('grades on a FRACTION of max health, not absolute damage', () => {
    // The same blow should read as devastating at level 1 and survivable at level 20, which is what the
    // numbers mean. A flat threshold would make every late-game hit a light tap.
    expect(hurtStopMs(25, 100)).toBe(HITSTOP.crit);
    expect(hurtStopMs(25, 400)).toBe(HITSTOP.light);
  });

  it('lands exactly on the tier boundaries', () => {
    expect(hurtStopMs(MAX * HURT_TIERS.crit, MAX)).toBe(HITSTOP.crit);
    expect(hurtStopMs(MAX * HURT_TIERS.heavy, MAX)).toBe(HITSTOP.heavy);
    expect(hurtStopMs(MAX * HURT_TIERS.heavy - 0.01, MAX)).toBe(HITSTOP.light);
  });

  it('does NOT freeze on a hit that took nothing', () => {
    // Otherwise armour would paradoxically make the screen stutter MORE as it absorbed more, which is the
    // opposite of what the player earned.
    expect(hurtStopMs(0, MAX)).toBe(0);
    expect(hurtStopMs(-5, MAX)).toBe(0);
  });

  it('never throws or returns garbage inside the damage path', () => {
    for (const [d, m] of [[NaN, MAX], [undefined, MAX], ['ten', MAX], [null, MAX]]) {
      expect(hurtStopMs(d, m)).toBe(0);
    }
    // An unknown max still registers the hit rather than silently swallowing it.
    for (const m of [0, -1, NaN, undefined]) {
      expect(hurtStopMs(10, m)).toBe(HITSTOP.light);
    }
  });
});

describe('isNewHit — one kick per hit, not one per frame', () => {
  // The camera lives in the per-frame controller, which polls the store rather than subscribing (GLI).
  // Without an edge detector a single hit would kick the camera every frame until the next one.
  it('fires once for a new stamp and not again for the same one', () => {
    const hit = { angle: 1, t: 5000 };
    expect(isNewHit(0, hit)).toBe(true);
    expect(isNewHit(5000, hit)).toBe(false);
  });

  it('fires again when a later hit arrives', () => {
    expect(isNewHit(5000, { angle: 1, t: 5200 })).toBe(true);
  });

  it('fires for an EARLIER stamp too — a reload can move the clock backwards', () => {
    // Deliberately `!==` rather than `>`: after a reset the stamp can be lower, and a `>` comparison would
    // silently stop kicking for the rest of the session.
    expect(isNewHit(9000, { angle: 1, t: 100 })).toBe(true);
  });

  it('does not fire on absent or malformed hit state', () => {
    for (const h of [null, undefined, {}, { t: 0 }, { t: NaN }, { t: 'soon' }]) {
      expect(isNewHit(0, h), JSON.stringify(h)).toBe(false);
    }
  });
});
