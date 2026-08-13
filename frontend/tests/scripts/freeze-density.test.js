import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { DENSITY_FLOOR, DENSITY_UNGATEABLE, frozenFor } from '../../scripts/ci/_density-ratchet.mjs';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FREEZER = join(APP, 'scripts/visual/freeze-density.mjs');

// DRIVING THE TOOL, BECAUSE GREPPING IT DID NOT WORK.
//
// The first attempt to prove "freeze-density reads EVERY run directory" was a source assertion that the
// file contains `for (const dir of sources)`. It passed. It also passed under a mutation that made the
// read loop use `[sources[0]]` — because the file has a SECOND loop over `sources` (the existence check)
// and the grep matched that one. A green mutation is the finding: the assertion was anchored to a line
// that was never load-bearing, and no amount of tightening the regex fixes the category.
//
// So the tool grew `--baseline` and `--out`, and this file runs it end to end on synthetic frames where
// the right answer is known by construction. That is the difference between asserting on the source and
// asserting on the behaviour, which is this repo's oldest recurring defect.
//
// Frames are 256x256 so the density window (128x128, step 32) fits with room to slide.
const W = 256;
// Sized so BOTH stay UNDER the ungateable line once headroom is applied (0.0625 -> 0.113 and
// 0.0156 -> 0.029, against a 0.15 ceiling), because a fixture that is itself ungateable tests the
// refusal path by accident and nothing else. The first draft used 64/32 and every merge assertion
// died on exit 1 -- the fixture, not the tool.
const BLOCK = { A: 32, B: 16 }; // -> best-window densities of 0.0625 and 0.015625
const DENSITY = { A: (32 * 32) / (128 * 128), B: (16 * 16) / (128 * 128) };

function png(blockSize) {
  const p = new PNG({ width: W, height: W });
  for (let i = 0; i < p.data.length; i += 4) {
    p.data[i] = 0; p.data[i + 1] = 0; p.data[i + 2] = 0; p.data[i + 3] = 255;
  }
  for (let y = 0; y < blockSize; y++) {
    for (let x = 0; x < blockSize; x++) {
      const i = (y * W + x) * 4;
      p.data[i] = 255; p.data[i + 1] = 255; p.data[i + 2] = 255;
    }
  }
  return PNG.sync.write(p);
}

let root;
const dir = (...p) => join(root, ...p);

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'freeze-density-'));
  for (const d of ['baseline', 'runA', 'runB', 'runPartial']) mkdirSync(dir(d));

  // baseline: three all-black frames.
  for (const f of ['quiet.png', 'noisy.png', 'thin.png']) writeFileSync(dir('baseline', f), png(0));

  // Two COMPLETE runs of the same corpus. runA is the worse one for `noisy`; that is the only difference.
  for (const [run, block] of [['runA', BLOCK.A], ['runB', BLOCK.B]]) {
    writeFileSync(dir(run, 'quiet.png'), png(0));
    writeFileSync(dir(run, 'noisy.png'), png(block));
    writeFileSync(dir(run, 'thin.png'), png(0));
  }

  // A run that DROPPED a frame — the title-mascot case, where one run of a pair fails its canvas wait.
  writeFileSync(dir('runPartial', 'quiet.png'), png(0));
  writeFileSync(dir('runPartial', 'noisy.png'), png(BLOCK.B));
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

function freeze(runs, extra = []) {
  const out = dir('ledger.json');
  execFileSync('node', [FREEZER, `--baseline=${dir('baseline')}`, `--out=${out}`, ...runs, ...extra], {
    cwd: APP, encoding: 'utf8',
  });
  return JSON.parse(readFileSync(out, 'utf8'));
}

describe('freeze-density, driven end to end', () => {
  it('freezes a frame at the WORSE of the two runs, not the one it read first', () => {
    // The load-bearing behaviour. runA sees 25% local density on `noisy`, runB sees 6.25%. Freezing at
    // runB's number would red the very next capture that behaves like runA — a gate crying wolf, which
    // the ratchet's own header calls a slower way of asserting nothing.
    const ledger = freeze([dir('runA'), dir('runB')]);
    expect(ledger.frames.noisy).toBe(frozenFor(DENSITY.A));
    expect(ledger.frames.noisy, 'froze at the quieter run — a good run would red').not.toBe(frozenFor(DENSITY.B));
  });

  it('reads the runs in either order — the answer cannot depend on argument position', () => {
    // Directly kills the mutation the grep missed: if only the first directory were read, swapping the
    // arguments would change the ledger.
    const forward = freeze([dir('runA'), dir('runB')]);
    const reversed = freeze([dir('runB'), dir('runA')]);
    expect(reversed.frames).toEqual(forward.frames);
    expect(reversed.frames.noisy).toBe(frozenFor(DENSITY.A));
  });

  it('a single run genuinely produces a DIFFERENT, lower ledger — so the pair is doing work', () => {
    // The presence case for the assertion above. If runB alone produced the same numbers as the pair,
    // every test here would pass against a tool that ignored its arguments entirely.
    const alone = freeze([dir('runB')]);
    expect(alone.frames.noisy).toBe(frozenFor(DENSITY.B));
    expect(alone.frames.noisy).not.toBe(frozenFor(DENSITY.A));
  });

  it('keeps every frame that landed when ONE run drops one, and says which rests on a single run', () => {
    // It used to exit 1 on the whole freeze if any single frame was missing from the run directory, so
    // one flaky canvas wait left the other thirty frames unmeasured.
    const ledger = freeze([dir('runA'), dir('runPartial')]);
    expect(Object.keys(ledger.frames).sort()).toEqual(['noisy', 'quiet', 'thin']);
    expect(ledger._samples.thin, 'the one-run frame is not marked as thinner evidence').toBe(1);
    expect(ledger._samples.noisy).toBe(2);
    expect(ledger._samples.quiet).toBe(2);
  });

  it('refuses to invent a value for a frame NO run captured', () => {
    // The absence case, and the line between tolerating a partial capture and fabricating a measurement.
    // Tolerating the first is why the previous test passes; fabricating the second would put a floor
    // constant in the ledger wearing the same clothes as a measurement.
    expect(() => freeze([dir('runPartial')])).toThrow(/captured by NO run/);
  });

  it('writes the fields the ledger gate demands, with the count MEASURED not typed', () => {
    // Regenerating used to red tests/scripts/density-ledger-measured.test.js, whose failure message
    // points at this very script: the gate wanted `_unmeasured`, and nothing generated it.
    const ledger = freeze([dir('runA'), dir('runB')]);
    expect(ledger._count).toBe(Object.keys(ledger.frames).length);
    const floored = Object.values(ledger.frames).filter((v) => v === DENSITY_FLOOR).length;
    expect(ledger._unmeasured, 'the ledger disagrees with its own frames').toBe(floored);
    expect(ledger._unmeasured, 'quiet and thin are byte-identical, so both clamp to the floor').toBe(2);
    expect(ledger._unmeasured_note.length).toBeGreaterThan(200);
    expect(ledger._sources, 'the ledger does not record which runs it was frozen from').toHaveLength(2);
  });

  // REFUSING TO WIDEN PAST THE POINT OF BEING A GATE.
  //
  // explore-day varies 5.13% to 30.35% local between two runs on identical code. Frozen at what it
  // "actually does" that is 54.7% — over half of any window free to change — which forecloses every
  // regression the frame could ever report while still printing a tick. The block is 96px of a 256px
  // frame here, which lands a window at 25% -> 45% frozen, well past the 15% line.
  const HUGE = 64;

  it('keeps a frame at its PREVIOUS allowance instead of widening past the ungateable line', () => {
    mkdirSync(dir('runWild'));
    writeFileSync(dir('runWild', 'quiet.png'), png(0));
    writeFileSync(dir('runWild', 'noisy.png'), png(HUGE));
    writeFileSync(dir('runWild', 'thin.png'), png(0));

    const before = freeze([dir('runA'), dir('runB')]);   // noisy at a gateable 11.3%
    const kept = frozenFor(DENSITY.A);
    expect(before.frames.noisy).toBe(kept);

    const after = freeze([dir('runWild')]);
    expect(frozenFor((HUGE * HUGE) / (128 * 128)), 'the fixture no longer exceeds the line')
      .toBeGreaterThanOrEqual(DENSITY_UNGATEABLE);
    expect(after.frames.noisy, 'a wild run widened the gate just by being run through the freezer').toBe(kept);
    expect(after._ungateable.noisy.kept).toBe(kept);
    expect(after._ungateable.noisy.wouldFreezeAt).toBeGreaterThan(kept);
    expect(after._ungateable, 'the well-behaved frames were dragged in too').not.toHaveProperty('quiet');
  });

  it('ABORTS rather than admit a NEW frame it cannot gate', () => {
    // The other branch, and the one that matters for a growing corpus: there is no previous value to
    // fall back on, so there is nothing honest to write. A gated state that cannot be gated must not be
    // admitted at all — admitting it is how the ledger stops being a denominator.
    const fresh = dir('fresh-ledger.json');
    expect(() => {
      execFileSync('node', [FREEZER, `--baseline=${dir('baseline')}`, `--out=${fresh}`, dir('runWild')], {
        cwd: APP, encoding: 'utf8',
      });
    }).toThrow(/an allowance that guards nothing/);
    expect(() => readFileSync(fresh, 'utf8'), 'it aborted and still wrote a ledger').toThrow();
  });

  it('--dry writes nothing', () => {
    const out = dir('never-written.json');
    execFileSync('node', [FREEZER, `--baseline=${dir('baseline')}`, `--out=${out}`, '--dry', dir('runA')], {
      cwd: APP, encoding: 'utf8',
    });
    expect(() => readFileSync(out, 'utf8')).toThrow();
  });
});
