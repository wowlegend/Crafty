import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { densityVerdict, frozenFor, mergeObserved, DENSITY_FLOOR } from '../../scripts/ci/_density-ratchet.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEDGER = resolve(HERE, '../visual/.density-ledger.json');

// THE INSTRUMENT THAT MEASURED AND NEVER JUDGED.
//
// `src/devtest/diffDensity.js` has computed a windowed local density on every frame of every visual run
// since 2026-08-09. `diff.test.js` printed it under the words "REPORT ONLY, asserts nothing". Measured
// over a real pair: 18 of 31 frames reproduce with NO changed pixel anywhere, while the global gate lets
// 6% of the frame move. So a 248x248 block of any of those 18 could change completely and pass — which
// is the false-negative class the density instrument was written for, sitting unused beside it.
//
// The recorded objection to fixing it was that a single TAU of 0.10 reds eight frames, seven of which
// currently pass. That is an objection to ONE NUMBER, not to asserting: this corpus has no single
// tolerance, because `explore-day` carries 5.13% local terrain-streaming noise and eighteen frames carry
// zero. A per-frame ratchet needs no adjudication and invents no tolerance — each frame is frozen at
// what it does, and only a RISE fails.
describe('local-density ratchet — a measurement that reaches a verdict', () => {
  it('fails a frame whose local concentration RISES, even when the global ratio is tiny', () => {
    // The whole point, in one case: 0.02% of the frame moved, all of it in one window.
    const { risen } = densityVerdict({ menu: 0.02 }, [{ state: 'menu', density: 0.31, x: 640, y: 200 }]);
    expect(risen).toHaveLength(1);
    expect(risen[0].state).toBe('menu');
    expect(risen[0].allowed).toBe(0.02);
  });

  it('passes a frame that stays at or under what it was frozen at', () => {
    const { risen } = densityVerdict({ menu: 0.05 }, [
      { state: 'menu', density: 0.05 },
      { state: 'hearth', density: 0.0 },
    ]);
    expect(risen).toEqual([]);
  });

  it('refuses to silently admit a frame the ledger does not know', () => {
    // Otherwise adding a capture state quietly adds an unguarded one, and the ledger stops being a
    // denominator the moment the corpus grows — the exact defect this repo keeps shipping.
    const { unfrozen } = densityVerdict({ menu: 0.02 }, [
      { state: 'menu', density: 0.01 },
      { state: 'brand-new-state', density: 0.9 },
    ]);
    expect(unfrozen).toEqual(['brand-new-state']);
  });

  it('notices a frozen frame that was not measured at all', () => {
    // A frame vanishing from the corpus is how a gate quietly stops covering something.
    const { missing } = densityVerdict({ menu: 0.02, hearth: 0.03 }, [{ state: 'menu', density: 0.01 }]);
    expect(missing).toEqual(['hearth']);
  });

  it('freezes a byte-identical frame at the FLOOR, not at zero', () => {
    // Frozen at exactly 0, one stray pixel reds the push. A gate that cries wolf gets ignored, which is
    // a slower way of asserting nothing.
    expect(frozenFor(0)).toBe(DENSITY_FLOOR);
    expect(frozenFor(0.0001)).toBe(DENSITY_FLOOR);
  });

  it('gives a noisy frame headroom over what it actually did', () => {
    expect(frozenFor(0.0513)).toBeGreaterThan(0.0513);
    expect(frozenFor(0.0513), 'the headroom is so wide the frame is unguarded').toBeLessThan(0.12);
  });

  // MERGING RUNS — the arithmetic that made "freeze from TWO captures" executable.
  //
  // freeze-density.mjs demanded two captures in its docblock from the day it was written and read
  // exactly one directory, so every ledger it has produced was single-sample: the requirement was a
  // comment. These pin the one thing that is easy to get backwards.
  it('freezes at the WORST run, not the best and not the average', () => {
    // The gate fires on `observed > frozen`, so the frozen value is a CEILING. Real numbers from the
    // 2026-08-13 pair: taking the min freezes explore-day at 0.093 and reds any run that behaves like
    // the other one; taking the mean freezes it at 0.100, which reds it too.
    const merged = mergeObserved({ 'explore-day': [0.093, 0.107] });
    expect(merged['explore-day'].observed, 'merged toward the quieter run — the next capture reds').toBe(0.107);
    expect(merged['explore-day'].observed, 'averaged the runs, which is still below what one run did').not.toBe(0.1);
  });

  it('reports how many runs each frame rests on, so a thin entry is visible', () => {
    // title-mascot fails its canvas wait under a long GL session, so it is routinely captured by one run
    // of a pair. That entry is weaker evidence and the ledger has to be able to say so rather than
    // presenting it as equally well measured.
    const merged = mergeObserved({ menu: [0.01, 0.02], 'title-mascot': [0.0] });
    expect(merged.menu.samples).toBe(2);
    expect(merged['title-mascot'].samples).toBe(1);
  });

  it('refuses to invent a value for a frame no run captured', () => {
    // Admitting it at the floor would be the ledger's own defect, committed by the tool meant to cure it.
    expect(mergeObserved({ menu: [0.01], ghost: [] })).not.toHaveProperty('ghost');
  });

  it('the freezer actually CALLS the merge, rather than only importing it', () => {
    // Same check as the diff.test.js one below, for the same reason: this file's subject is instruments
    // that were wired up and never invoked. Reading the source is the right tool — executing the freezer
    // means running pixelmatch over the whole corpus.
    const freezer = readFileSync(resolve(HERE, '../../scripts/visual/freeze-density.mjs'), 'utf8');
    expect(freezer, 'freeze-density does not import the merge').toContain('mergeObserved');
    expect(freezer, 'freeze-density imports the merge and never calls it — it is back to single-run')
      .toMatch(/mergeObserved\(/);
    // WHAT IS DELIBERATELY *NOT* ASSERTED HERE: that it reads every run directory. The obvious source
    // check — that the file contains `for (const dir of sources)` — was written, passed, and then STAYED
    // GREEN under a mutation making the read loop use `[sources[0]]`, because a second loop over
    // `sources` (the existence check) satisfied the regex. Tightening the pattern would not have fixed
    // the category. That claim is now proven by running the tool: tests/scripts/freeze-density.test.js.
  });

  it('the freezer writes the fields the ledger gate demands', () => {
    // It did not, and the gate that demanded them named THIS script in its failure message. Following a
    // red gate's own instruction produced a differently red gate with the cause in a third file. Matched
    // as object KEYS (`_unmeasured:`), not as bare words, for the reason above.
    const freezer = readFileSync(resolve(HERE, '../../scripts/visual/freeze-density.mjs'), 'utf8');
    for (const field of ['_count', '_sources', '_samples', '_unmeasured', '_unmeasured_note']) {
      expect(freezer, `the freezer never writes ${field}, so regenerating the ledger reds density-ledger-measured`)
        .toMatch(new RegExp(`${field}:`));
    }
  });

  // AND THE CALLER. Twice today I have shipped a seam nothing called (stepCaptureFrames sat unused by
  // the harness for two days; the stale-ledger direction was computed and never branched on). The
  // density instrument itself is the third instance in this very file's subject matter — measured for
  // days, asserted never. Reading diff.test.js's source is the right tool: the claim is that one file
  // calls one function, and executing it means running the whole visual corpus.
  it('the visual gate actually CALLS the ratchet, rather than only importing it', () => {
    const gate = readFileSync(resolve(HERE, '../visual/diff.test.js'), 'utf8');
    expect(gate, 'diff.test.js does not import the ratchet').toContain('_density-ratchet.mjs');
    expect(gate, 'diff.test.js imports the ratchet and never calls it — the instrument is back to report-only')
      .toMatch(/densityVerdict\(/);
    const at = gate.indexOf('densityVerdict(');
    expect(gate.slice(at, at + 900), 'the verdict is computed and never asserted').toMatch(/expect\(\s*risen/);
  });

  // THE DENOMINATOR, against the real ledger and the real corpus.
  it('the committed ledger covers every gated state, and none of it is frozen open', () => {
    expect(existsSync(LEDGER), 'no density ledger — run the visual gate with --freeze-density').toBe(true);
    const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
    const frames = Object.keys(ledger.frames);
    expect(frames.length, 'the ledger enumerates almost nothing — it is measuring the wrong thing').toBeGreaterThan(25);
    for (const [state, allowed] of Object.entries(ledger.frames)) {
      // NOT compared against the global 6% — those are different units and confusing them is how a
      // tolerance gets "reasoned about" into meaninglessness. 9% of a 128x128 window is 1,474 pixels,
      // i.e. 0.14% of the frame: far TIGHTER than the global gate, not looser. The real question is
      // whether a window is so free to change that nothing in it is guarded.
      expect(allowed, `${state} may change 15% of a window, which guards nothing`).toBeLessThan(0.15);
      expect(allowed, `${state} is frozen below the floor and will red on noise`).toBeGreaterThanOrEqual(DENSITY_FLOOR);
    }
  });
});
