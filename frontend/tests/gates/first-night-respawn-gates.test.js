import { describe, it, expect } from 'vitest';
import { HEARTH_XZ, respawnCases, caseHolds, roseRight } from '../e2e/_firstNightRespawn.js';

/**
 * BEAT (f) PASSES ONLY THE RIGHT RESPAWN (tests/e2e/first-night.spec.js (f) through tests/e2e/_firstNightRespawn.js;
 * DECISIONS 2026-11-01 (W3-A PR C) item 486). The brief's rule is "rise at the lit light nearest the fall", and on the
 * returning profile the Hearth is lit. Phase 1's death stood 40 m from the lantern and 20 m from the Hearth, so the right
 * rule failed it and a rule preferring any lantern passed. Here the beat's own three cases are played under the right
 * rule and under each wrong one a respawn could be built with: only the right one answers all three.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, 2 tests, each observed RED:
 *   G1 the phase-1 death (40 m west of the lantern, 20 m from the Hearth) for the first case -> both tests
 *   G2 plausible-wrong: the second case moved beside the lantern (x + 12) -> both tests
 *   G3 the Hearth's tolerance read as the lantern's (3 m) SURVIVED, as it must here: the rules rise on a light itself or
 *      12 m or more off, so a tolerance between 3 and 4 m changes no answer (the tolerances are the task script's, and
 *      the beat reads them in the game, where a rise lands near a light rather than on it)
 *   I0 identity (a comment edit in _firstNightRespawn.js) SURVIVED.
 *
 * NOT CHECKED HERE: the game's respawn (N8 builds it; the beat, run in the game, reads where the body rises).
 */
const LANTERNS = Object.freeze([{ x: 20, z: 2.5 }, { x: 18, z: -1 }, { x: 22, z: 5 }]);
const flat = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const at = (p) => [p.x, p.z];

/** A respawn rule: where the body rises for a death at `death`, the lantern `lantern` standing or not. */
const RULES = Object.freeze({
  nearestLit: (death, lantern, standing) => {
    const lights = [HEARTH_XZ, ...(standing ? [at(lantern)] : [])];
    return lights.reduce((best, l) => (flat(at(death), l) < flat(at(death), best) ? l : best));
  },
  anyLantern: (death, lantern, standing) => (standing ? at(lantern) : HEARTH_XZ),
  origin: () => HEARTH_XZ,
  whereYouFell: (death) => at(death),
  staleIndex: (death, lantern) => RULES.nearestLit(death, lantern, true),
  farthestLit: (death, lantern, standing) => {
    const lights = [HEARTH_XZ, ...(standing ? [at(lantern)] : [])];
    return lights.reduce((best, l) => (flat(at(death), l) > flat(at(death), best) ? l : best));
  },
});
const answers = (rule, lantern) => respawnCases(lantern).map((c) => roseRight(c, RULES[rule](c.death, lantern, c.lantern === 'standing'), lantern));

describe('beat (f)\'s cases', () => {
  it('every case\'s geometry holds, and the right rule answers every case', () => {
    for (const lantern of LANTERNS) {
      expect(respawnCases(lantern).map((c) => caseHolds(c, lantern)), `every case's geometry holds for ${JSON.stringify(lantern)}`).toEqual([true, true, true]);
      expect(answers('nearestLit', lantern), `the right rule answers every case for ${JSON.stringify(lantern)}`).toEqual([true, true, true]);
    }
  });

  it('a rule that prefers any lantern fails, and so does every other wrong rule', () => {
    for (const lantern of LANTERNS) {
      expect(answers('anyLantern', lantern), 'a rule that prefers any lantern fails the death nearer the Hearth').toEqual([true, false, true]);
      expect(answers('origin', lantern), 'today\'s rise at the origin fails beside the lantern').toEqual([false, true, true]);
      expect(answers('whereYouFell', lantern), 'rising where you fell fails every case').toEqual([false, false, false]);
      expect(answers('staleIndex', lantern), 'a stale index fails beside the mined lantern').toEqual([true, true, false]);
      expect(answers('farthestLit', lantern), 'the farthest light fails both standing cases').toEqual([false, false, true]);
    }
  });
});
