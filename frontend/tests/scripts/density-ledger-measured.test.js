import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DENSITY_FLOOR } from '../../scripts/ci/_density-ratchet.mjs';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LEDGER = JSON.parse(readFileSync(resolve(APP, 'tests/visual/.density-ledger.json'), 'utf8'));

// THE RATCHET'S OWN DENOMINATOR.
//
// The local-density ratchet asserts that no frame concentrates more change into a 128px window than it
// is "frozen at", and its header says each frame is frozen at what it ACTUALLY DOES. Measured
// 2026-08-12: that is true of TWO frames. The other 29 sit at exactly DENSITY_FLOOR, because
// `frozenFor` clamps anything below the floor UP to it — so for 29 of 31 frames the ratchet compares
// against an arbitrary constant, not against the frame's behaviour.
//
// That is not a harmless default. ocean-coast failed at 2.20% against exactly such an entry, and the
// failure was un-adjudicable: with no measurement of what that frame normally does, 2.20% could be
// ordinary streaming variance or a real regression, and nothing on disk could distinguish them.
//
// THE FIX IS MEASUREMENT, NOT A HIGHER FLOOR. Raising DENSITY_FLOOR until ocean-coast passes is
// weakening a gate because it fired, which this project's charter forbids in as many words. The real
// fix is a reviewed two-capture pair and `node scripts/visual/freeze-density.mjs`, which replaces each
// floor with a measured value. That needs a quiet machine — a load-skewed capture would bake load
// artifacts into the oracle permanently, which is worse than a stale oracle.
//
// So this is a RATCHET, in the shape this repo already uses for the source-grep population: the count
// of unmeasured entries may FALL and may never RISE. It does not red the tree today (that would block
// on a machine condition nobody controls), but a new frame admitted at the floor cannot pass unnoticed,
// and the number is visible instead of buried in a JSON file nobody reads.
const FROZEN_UNMEASURED = 29;

const flooredEntries = () =>
  Object.entries(LEDGER.frames).filter(([, v]) => v === DENSITY_FLOOR).map(([k]) => k);

describe('the density ledger knows how much of itself is unmeasured', () => {
  it('enumerates a real ledger', () => {
    expect(Object.keys(LEDGER.frames).length, 'the ledger is empty — everything below is vacuous').toBeGreaterThan(20);
    expect(LEDGER._count).toBe(Object.keys(LEDGER.frames).length);
  });

  it('the unmeasured count may FALL, never rise', () => {
    const floored = flooredEntries();
    expect(
      floored.length,
      `${floored.length} ledger entries sit at DENSITY_FLOOR, up from ${FROZEN_UNMEASURED}. A frame frozen ` +
      `at the floor is not frozen at a measurement — the ratchet cannot tell "near the floor legitimately" ` +
      `from "regressed" for it. Freeze from a reviewed capture pair (scripts/visual/freeze-density.mjs) ` +
      `rather than admitting another one at the constant.`,
    ).toBeLessThanOrEqual(FROZEN_UNMEASURED);
  });

  it('the ledger states the number, so it is visible without running this test', () => {
    // A count that only exists inside an assertion is a count nobody reads. The ledger carries it, and
    // the two must agree or the file is describing a state it no longer has.
    expect(LEDGER._unmeasured, 'the ledger does not record its own unmeasured count').toBe(flooredEntries().length);
    expect(LEDGER._unmeasured_note?.length, 'the count has no explanation beside it').toBeGreaterThan(200);
  });

  it('at least some frames ARE measured — otherwise the instrument is entirely floor', () => {
    // The presence case. If every entry were the floor, the ratchet would be a constant compared against
    // itself and this whole file would be documenting a no-op.
    const measured = Object.entries(LEDGER.frames).filter(([, v]) => v !== DENSITY_FLOOR);
    expect(measured.length, 'every single entry is the floor — the ratchet measures nothing at all').toBeGreaterThan(0);
    for (const [name, v] of measured) {
      expect(v, `${name} is frozen BELOW the floor, which frozenFor cannot produce`).toBeGreaterThan(DENSITY_FLOOR);
    }
  });

  it('nothing has quietly raised the floor to make a failure go away', () => {
    // The specific weakening this file exists to prevent. If DENSITY_FLOOR moves up, every floor-clamped
    // entry silently gains headroom and ocean-coast's failure disappears without anything being measured.
    expect(DENSITY_FLOOR, 'DENSITY_FLOOR changed — raising it is how a fired gate gets silenced').toBe(0.02);
  });
});
