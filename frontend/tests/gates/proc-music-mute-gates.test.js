import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC, strip } from './_srcWalk.js';

/**
 * PROC-MUSIC MUTE LOCK — every proc-music gain ramp carries the factor, not just the one that broke.
 *
 * The regression (2026-06-28 audit): the combat-scaling arpeggiator ramp bypassed Kevin's
 * `PROC_MUSIC_GAIN = 0` mute by ramping `masterGain` to `0.75 * volume` — audible — without the factor
 * the other ramps use. The mute is Kevin's, and a proc-music bed that comes back on its own is the kind
 * of defect an operator notices before any gate does.
 *
 * REWRITTEN 2026-09-22, selected by `gate-census.mjs` at 0/5. The old gate pinned the ONE ramp that
 * broke — `/0\\.75 \\* volume \\* PROC_MUSIC_GAIN/` — and asserted the absence of that one bad literal.
 * That is fixing the instance and calling it the class. There are FOUR proc-music ramps in
 * SoundManager; the gate watched one, so the next ramp added without the factor, or either of the two
 * `0.22` pad ramps losing it, was invisible. A fifth ramp added tomorrow would be invisible too.
 *
 * So the assertion is now over the POPULATION: enumerate every ramp on a proc-music master gain and
 * require each to carry the factor. The count is asserted, because a regex that silently matches
 * nothing would report a clean mute over an empty set — and "no ramps found" must never read as "no
 * ramps are audible".
 *
 * BLIND SPOT, stated (R7): this reads source text. It cannot see a ramp assembled from a variable, nor
 * one on a gain node reached by a different name, nor whether any of this is audible in a running game —
 * the Web Audio graph is unreachable by every harness in this repo. What it proves is that every ramp
 * written in the form the codebase uses is multiplied by the lock.
 *
 * Mutation-Proof: 4 mutations, recorded on the commit.
 */
describe('proc-music mute lock (PROC_MUSIC_GAIN)', () => {
  const src = strip(readFileSync(resolve(SRC, 'SoundManager.jsx'), 'utf8'));

  it('PROC_MUSIC_GAIN is declared, and it is the MUTE value', () => {
    // If this is ever non-zero the whole gate below still passes while the bed is audible, so the value
    // itself is the first assertion, not an assumption the others rest on.
    expect(src, 'the mute lock constant is gone').toMatch(/const PROC_MUSIC_GAIN = 0\b/);
  });

  it('EVERY proc-music master-gain ramp carries the factor — the population, not one literal', () => {
    // Enumerate the ramps first, then assert about all of them. The old gate inverted this: it knew one
    // ramp by heart and never counted.
    const ramps = src.match(/masterGain\.gain\.linearRampToValueAtTime\([^;]*?\)/g) || [];
    expect(ramps.length, 'no proc-music ramps matched — a clean mute over an empty set is not a pass')
      .toBe(5);

    // A ramp whose TARGET is literally 0 is a fade-OUT: it cannot make anything audible, so the lock is
    // irrelevant to it. That is a structural property of the target value, not an exemption by name or
    // by line — the distinction the rule actually cares about is "can this ramp raise the gain", and a
    // constant 0 provably cannot. Found by asserting the population: the old gate knew one ramp and
    // never counted, so it had no occasion to meet the fade-out at all.
    const audible = ramps.filter((r) => !/linearRampToValueAtTime\(\s*0(\.0+)?\s*,/.test(r));
    expect(audible.length, 'every ramp is a fade-out — the bed can never start').toBe(4);

    const unlocked = audible.filter((r) => !/PROC_MUSIC_GAIN/.test(r));
    expect(unlocked, 'a proc-music ramp bypasses the mute lock — the bed will be audible').toEqual([]);
  });

  it('no ramp targets a bare `volume` product, which is the exact shape that broke', () => {
    // A second, independent way to catch the same defect: the regression was literally
    // `linearRampToValueAtTime(0.75 * volume, ...)`. Anchored to the SHAPE (any coefficient), not to
    // 0.75, so the next one at a different level is caught too.
    expect(src, 'a ramp goes straight to a volume product with no mute factor')
      .not.toMatch(/linearRampToValueAtTime\(\s*[\d.]+\s*\*\s*volume\s*,/);
  });

  it('the factor is a MULTIPLIER on the target, not applied somewhere it cannot mute', () => {
    // `x * volume * PROC_MUSIC_GAIN` with the lock at 0 is exactly 0. Pinning the arithmetic shape
    // means a future edit that references the constant without multiplying by it does not pass.
    const withFactor = src.match(/masterGain\.gain\.linearRampToValueAtTime\([^;]*PROC_MUSIC_GAIN[^;]*?\)/g) || [];
    expect(withFactor).toHaveLength(4);
    for (const r of withFactor) {
      expect(r, `the lock is referenced but not multiplied in: ${r}`).toMatch(/\*\s*PROC_MUSIC_GAIN/);
    }
  });
});
