import { describe, it, expect } from 'vitest';
import { marches } from '../e2e/_firstNightMarch.js';

/**
 * WHAT BEAT (b) COUNTS AS A MARCH (tests/e2e/first-night.spec.js (b) through tests/e2e/_firstNightMarch.js; DECISIONS
 * 2026-11-01 (W3-A PR C) item 487). Phase 1 counted any hostile 10 m closer to the Hearth in 20 s, with the player at the
 * Hearth, so a mob hunting the player passed as a marcher (finding 12), and today's wanderers drift that far toward it
 * now and then. Driven here on tracks a marcher, a hunter and a wanderer leave, read every 5 s from a player 32 m off the
 * line: only the march passes.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, 2 tests, each observed RED:
 *   M1 the step check dropped (the 20 s total alone) -> "a wanderer that drifts 10 m but pauses is not a march"
 *   M2 plausible-wrong: the end compared with the start's distance to the player, not the end's -> "a hunter is not a march"
 *   M3 the arrival allowance dropped, so a marcher standing at the Hearth fails its last steps -> "a march that arrives"
 *   I0 identity (a comment edit in _firstNightMarch.js) SURVIVED.
 *
 * NOT CHECKED HERE: whether the game's wave marches (N5 builds it; the beat reads its mobs in the game).
 */
const r = (dH, dP) => ({ dH, dP });

describe('a march on the Hearth', () => {
  it('a march passes, and a march that arrives early and stands at the Hearth too', () => {
    expect(marches([r(50, 59), r(42, 52), r(34, 46), r(26, 41), r(18, 37)])).toBe(true);
    expect(marches([r(30, 44), r(20, 38), r(10, 34), r(3, 32), r(3, 32)]), 'a march that arrives').toBe(true);
  });

  it('a hunter is not a march, nor a wanderer that drifts 10 m but pauses, nor a track that loses its mob', () => {
    // A hunter: it closes on the Hearth on the way, and ends beside the player, 32 m from the Hearth.
    expect(marches([r(50, 59), r(44, 46), r(38, 33), r(34, 20), r(32, 6)]), 'a hunter is not a march').toBe(false);
    // A wanderer: 10.5 m closer over 20 s, standing still for one step.
    expect(marches([r(28, 41), r(24, 39), r(24, 39), r(20, 37), r(17.5, 36)]), 'a wanderer that drifts 10 m but pauses is not a march').toBe(false);
    expect(marches([r(50, 59), r(42, 52), null, r(26, 41), r(18, 37)]), 'a mob gone mid-track').toBe(false);
    expect(marches([r(50, 59), r(45, 55), r(44, 54), r(43, 53), r(42, 52)]), 'too slow').toBe(false);
  });
});
