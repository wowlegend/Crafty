#!/usr/bin/env node
/**
 * FREEZE THE LOCAL-DENSITY RATCHET from a real capture pair.
 *
 * Usage: node scripts/visual/freeze-density.mjs                    (uses tests/visual/current)
 *        node scripts/visual/freeze-density.mjs <dirA> <dirB> ...  (one directory per capture run)
 *        node scripts/visual/freeze-density.mjs --dry ...          (prints the table, writes nothing)
 *        node scripts/visual/freeze-density.mjs --baseline=<dir> --out=<path> ...
 *
 * `--baseline` and `--out` exist so this tool can be driven END TO END by a test on synthetic frames.
 * They were added after a source-grep assertion that claimed to prove "it reads every run directory"
 * STAYED GREEN under a mutation that made it read only the first — it had anchored to the wrong loop.
 * With both paths hardcoded the only available check was that grep; with them injectable the real
 * question ("does a second run's worse frame reach the ledger") is answerable by running the thing.
 *
 * Reads `tests/visual/baseline` against each supplied run directory — so it must run on a pair you have
 * already reviewed. Freezing against an unreviewed pair records whatever noise or regression that run
 * happened to contain as permanently allowed, which is the same defect as blessing a baseline nobody
 * opened.
 *
 * Every frame is frozen at `max(FLOOR, worst_observed * HEADROOM)`; the arithmetic — including the merge
 * across runs — lives in scripts/ci/_density-ratchet.mjs so the gate and the freezer cannot drift apart.
 *
 * ============================================================================================
 * IT DEMANDED TWO CAPTURES AND COULD ONLY READ ONE. Fixed 2026-08-13.
 * ============================================================================================
 * Requirement 2 below has been in this docblock since the file was written, and until now the code
 * read exactly one hardcoded `tests/visual/current`. So the documented procedure was unexecutable and
 * every ledger this tool has ever produced was single-sample — the precise thing the requirement
 * forbids. A requirement a tool cannot satisfy is not a requirement, it is a comment.
 *
 * It also refused a partial capture OUTRIGHT: one frame missing from one run and the whole freeze
 * exited 1, so the 30 frames that did land stayed unmeasured because the 31st did not. `title-mascot`
 * fails its canvas wait in most long GL sessions, which made that the common case rather than the edge.
 *
 * ============================================================================================
 * AND REGENERATING IT REDDENED THE GATE THAT TELLS YOU TO REGENERATE. Fixed 2026-08-13.
 * ============================================================================================
 * `tests/scripts/density-ledger-measured.test.js` asserts the ledger carries `_unmeasured` and an
 * explanatory `_unmeasured_note`, and its FAILURE MESSAGE points you at this script. This script wrote
 * neither — those two fields were hand-added to the JSON once and nothing regenerated them. Following
 * the instruction printed by a red gate therefore produced a differently red gate, with the cause in a
 * third file. Both are generated now, so the count is measured rather than typed and cannot go stale.
 *
 * WHAT A GOOD FREEZE STILL REQUIRES — the tool cannot check any of these for you:
 *   1. A QUIET MACHINE. Capture crashes under load (TargetCloseError, headless Chromium killed at
 *      load 13-37 on 2026-08-12), and worse, a load-skewed capture that SUCCEEDS bakes load artifacts
 *      into the oracle permanently. A corrupted baseline is worse than a stale one.
 *   2. TWO captures on identical code, so the number frozen reflects real run-to-run variance rather
 *      than one run's noise. Freezing from a single run records that run's accidents as allowed.
 *   3. Frames REVIEWED by eye before freezing, per the header above.
 *
 * ============================================================================================
 * AND IT REFUSES TO WIDEN A GATE PAST THE POINT OF BEING ONE. Added 2026-08-13.
 * ============================================================================================
 * `explore-day` varies 5.13% to 30.35% local across two runs on identical code and an identical
 * renderer — its distant treeline streams in late. Freezing it at what it "actually does" means
 * 30.35% x 1.8 = 54.7%, i.e. over half of any window may change, which forecloses every regression
 * that frame could ever report while still printing a tick. So a frame whose merged variance would
 * freeze past DENSITY_UNGATEABLE keeps its PREVIOUS allowance and is recorded in `_ungateable`
 * instead. A frame with no previous value aborts the freeze: a gated state that cannot be gated must
 * not be admitted at all. Fix the capture, not the ledger.
 *
 * NOT EVERY FRAME MAY BE FROZEN AT ALL. `capture.mjs` emits "frame never stabilized after N polls ->
 * THIS FRAME IS NOT DETERMINISTIC" for frames that never settle; on 2026-08-13 that was ocean-coast,
 * landmark and explore-day-med, in BOTH runs independently. Freezing their DENSITY at measured variance
 * is legitimate and is what makes their failures adjudicable. Re-baselining their PIXELS is not — the
 * capture says in as many words that doing so freezes noise. Two different acts; do not conflate them
 * because they follow the same capture.
 *
 * The unmeasured count is ratcheted by tests/scripts/density-ledger-measured.test.js — it may fall and
 * may never rise. Do NOT lower it by raising DENSITY_FLOOR; that is silencing a gate that fired.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { maxWindowDensity } from '../../src/devtest/diffDensity.js';
import { frozenFor, mergeObserved, DENSITY_FLOOR, DENSITY_UNGATEABLE } from '../ci/_density-ratchet.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const VIS = resolve(HERE, '../../tests/visual');
const LEDGER = join(VIS, '.density-ledger.json');

/** The note the ledger carries about its own unmeasured entries. Generated, so it cannot go stale. */
function unmeasuredNote(unmeasured, total, sources, thin) {
  return (
    `${unmeasured} of ${total} entries sit at DENSITY_FLOOR (${DENSITY_FLOOR}) rather than at a measured ` +
    `value, because frozenFor clamps anything below the floor UP to it. For those frames the ratchet ` +
    `compares against a constant, so it cannot distinguish "this frame legitimately reproduces almost ` +
    `exactly" from "this frame regressed by less than the floor" — a frame that is byte-identical today ` +
    `and gains 1% local noise tomorrow still passes. That is the ratchet's real blind spot and it is not ` +
    `fixable by measurement alone; a byte-identical frame HAS no variance to measure. Do NOT raise ` +
    `DENSITY_FLOOR to shrink this number: that widens every floored entry's allowance at once and is ` +
    `silencing a gate rather than measuring anything. Frozen from ${sources.length} capture run(s): ` +
    `${sources.join(', ')}. ${thin} entr${thin === 1 ? 'y rests' : 'ies rest'} on a single run and ` +
    `${thin === 1 ? 'is' : 'are'} therefore weaker evidence than the rest — see _samples.`
  );
}

function main() {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry');
  const flag = (name, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    return hit ? resolve(hit.slice(name.length + 3)) : fallback;
  };
  const baselineDir = flag('baseline', join(VIS, 'baseline'));
  const out = flag('out', LEDGER);
  const dirArgs = argv.filter((a) => !a.startsWith('--'));
  const sources = dirArgs.length ? dirArgs.map((d) => resolve(d)) : [join(VIS, 'current')];

  for (const dir of [baselineDir, ...sources]) {
    if (!existsSync(dir)) {
      console.error(`freeze-density: directory does not exist: ${dir}`);
      process.exit(1);
    }
  }

  const names = readdirSync(baselineDir).filter((f) => f.endsWith('.png')).sort();
  if (!names.length) {
    console.error(`freeze-density: no baseline PNGs in ${baselineDir} — nothing to freeze`);
    process.exit(1);
  }

  // frame -> one observed density per run that captured it.
  const perFrame = {};
  const skipped = [];
  for (const f of names) {
    const a = PNG.sync.read(readFileSync(join(baselineDir, f)));
    perFrame[f] = [];
    for (const dir of sources) {
      const p = join(dir, f);
      if (!existsSync(p)) {
        skipped.push(`${f} absent from ${dir}`);
        continue;
      }
      const b = PNG.sync.read(readFileSync(p));
      if (a.width !== b.width || a.height !== b.height) {
        console.error(`freeze-density: ${f} differs in SIZE between baseline and ${dir}`);
        process.exit(1);
      }
      const mask = new PNG({ width: a.width, height: a.height });
      pixelmatch(a.data, b.data, mask.data, a.width, a.height, { threshold: 0.1, diffMask: true });
      perFrame[f].push(maxWindowDensity(mask.data, a.width, a.height, 128, 32).density);
    }
  }

  // A frame no run captured cannot be frozen from evidence, and admitting it at the floor would be the
  // ledger's own defect committed by the tool meant to cure it.
  const uncovered = names.filter((f) => perFrame[f].length === 0);
  if (uncovered.length) {
    console.error(`freeze-density: ${uncovered.length} frame(s) captured by NO run — cannot freeze from nothing:`);
    for (const f of uncovered) console.error(`  ${f}`);
    console.error('  Re-capture, or pass a run directory that contains them.');
    process.exit(1);
  }

  const merged = mergeObserved(
    Object.fromEntries(names.map((f) => [f.replace(/\.png$/, ''), perFrame[f]])),
  );

  // The ledger being REPLACED. A frame whose variance has outgrown the instrument keeps whatever it was
  // already frozen at, so a bad capture cannot widen a gate just by being run through the freezer.
  let previous = {};
  try { previous = JSON.parse(readFileSync(out, 'utf8')).frames ?? {}; } catch { previous = {}; }

  const frames = {};
  const samples = {};
  const ungateable = {};
  const rows = [];
  for (const [state, { observed, samples: n }] of Object.entries(merged)) {
    const wouldFreezeAt = frozenFor(observed);
    samples[state] = n;
    if (wouldFreezeAt >= DENSITY_UNGATEABLE) {
      if (!Object.prototype.hasOwnProperty.call(previous, state)) {
        console.error(
          `freeze-density: ${state} varies by ${(observed * 100).toFixed(2)}% locally, which would freeze at ` +
          `${(wouldFreezeAt * 100).toFixed(1)}% — past ${(DENSITY_UNGATEABLE * 100)}%, an allowance that guards nothing. ` +
          `It has no previous value to keep, so there is nothing to fall back to: a gated state that ` +
          `cannot be gated must not be admitted. Fix the capture's determinism for this frame first.`,
        );
        process.exit(1);
      }
      frames[state] = previous[state];
      ungateable[state] = { observed, wouldFreezeAt, kept: previous[state] };
      rows.push({ state, observed, frozen: frames[state], samples: n, wouldFreezeAt });
      continue;
    }
    frames[state] = wouldFreezeAt;
    rows.push({ state, observed, frozen: frames[state], samples: n });
  }

  rows.sort((x, y) => y.observed - x.observed);
  console.log(`  ${'state'.padEnd(26)}${'worst'.padStart(9)}${'frozen at'.padStart(12)}${'runs'.padStart(6)}`);
  for (const r of rows) {
    const flags = [
      r.samples < sources.length ? 'single run' : '',
      r.wouldFreezeAt ? `UNGATEABLE, would be ${(r.wouldFreezeAt * 100).toFixed(1)}% - kept` : '',
    ].filter(Boolean).join(', ');
    console.log(
      `  ${r.state.padEnd(26)}${(r.observed * 100).toFixed(2).padStart(8)}%` +
      `${(r.frozen * 100).toFixed(2).padStart(11)}%${String(r.samples).padStart(6)}${flags ? '  <- ' + flags : ''}`,
    );
  }
  for (const s of skipped) console.log(`  NOTE: ${s}`);

  const unmeasured = rows.filter((r) => r.frozen === DENSITY_FLOOR).length;
  const thin = rows.filter((r) => r.samples < sources.length).length;
  // Run directories are routinely session-scoped scratch paths that will not exist tomorrow, so record
  // the NAME rather than an absolute path that rots into false provenance the moment the tmpdir is swept.
  const label = (p) => p.replace(resolve(VIS, '../..') + '/', '').split('/').pop();
  const sourceLabels = sources.map(label);

  const beyond = Object.keys(ungateable);
  console.log(
    `  ${rows.length} frames from ${sources.length} run(s); ${unmeasured} clamped to the floor; ${thin} single-run; ` +
    `${beyond.length} beyond the instrument`,
  );
  for (const state of beyond) {
    const u = ungateable[state];
    console.log(
      `  UNGATEABLE ${state}: varies ${(u.observed * 100).toFixed(2)}% locally -> would freeze at ` +
      `${(u.wouldFreezeAt * 100).toFixed(1)}%, past ${(DENSITY_UNGATEABLE * 100)}%. KEPT at ` +
      `${(u.kept * 100).toFixed(2)}% — widen the capture's determinism, not this allowance.`,
    );
  }

  if (dry) return;
  writeFileSync(
    out,
    JSON.stringify(
      {
        _count: Object.keys(frames).length,
        _note: 'regenerate: node scripts/visual/freeze-density.mjs <runDirA> <runDirB>, on REVIEWED capture runs',
        _sources: sourceLabels,
        frames,
        _samples: samples,
        _ungateable: ungateable,
        _unmeasured: unmeasured,
        _unmeasured_note: unmeasuredNote(unmeasured, rows.length, sourceLabels, thin),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`  frozen ${Object.keys(frames).length} frames -> ${out}`);
}

// CLI only — importing this file must not read the whole corpus as a side effect (cli-guard).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
