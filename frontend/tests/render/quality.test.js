import { describe, it, expect } from 'vitest';
import { selectTier, TIERS } from '../../src/render/quality.js';

describe('selectTier', () => {
  it('coarse pointer (phone/tablet) starts at low', () => {
    expect(selectTier({ coarsePointer: true, deviceMemory: 8, cores: 8 })).toBe('low');
  });
  it('strong desktop → high', () => {
    expect(selectTier({ coarsePointer: false, deviceMemory: 16, cores: 12 })).toBe('high');
  });
  it('mid desktop/laptop → med', () => {
    expect(selectTier({ coarsePointer: false, deviceMemory: 8, cores: 6 })).toBe('med');
  });
  it('weak/unknown → low', () => {
    expect(selectTier({})).toBe('low');
  });
});

describe('TIERS config', () => {
  it('every tier defines the same switches', () => {
    const keys = Object.keys(TIERS.low).sort();
    for (const t of ['med', 'high']) expect(Object.keys(TIERS[t]).sort(), t).toEqual(keys);
  });
  it('ramps monotonically on render distance', () => {
    expect(TIERS.low.renderDistance).toBeLessThanOrEqual(TIERS.med.renderDistance);
    expect(TIERS.med.renderDistance).toBeLessThanOrEqual(TIERS.high.renderDistance);
  });

  // S1-D-M3: god-rays now ON at med (was high-only), low stays off (mobile floor).
  it('enables god-rays at med + high, off at low', () => {
    expect(TIERS.low.godRays).toBe(false);
    expect(TIERS.med.godRays).toBe(true);
    expect(TIERS.high.godRays).toBe(true);
  });
  // REWRITTEN 2026-09-22. This asserted `med < high` strictly, and blocked the commit that set high's
  // samples to med's 60 — correctly, because it caught a rung of the quality ladder being collapsed.
  //
  // The rung is deliberately gone, and there is precedent in quality.js itself: `charOutline` is
  // TIER-INDEPENDENT (true at every tier) by explicit decision, because the cheap value is the right
  // value and the knob must not be a perf-downgrade casualty. This is the same argument inverted. 60 is
  // the sample count `med` has shipped since S1-D-M3 as the value judged to HOLD the atmosphere
  // signature — so everything above 60 was surplus over an already-accepted look, on the one knob whose
  // own header says its cost scales ~linearly, on the tier a 36GB/14-core laptop actually gets.
  //
  // What replaces the rung is a CEILING plus the floor that was always here. The ladder still ramps where
  // ramping means something, and those are asserted elsewhere in this file: renderDistance, moteCount,
  // and the ao/godRays/bloomMipmap toggles.
  it('god-ray samples: none at low, a real count at med, and no tier exceeds med (cost ceiling)', () => {
    expect(TIERS.low.godRaySamples).toBe(0);
    expect(TIERS.med.godRaySamples).toBeGreaterThan(0);
    // The ceiling. `high` may match med but never exceed it: GodRays is the costliest pass in the chain
    // and 60 already reads correctly, so a higher number buys nothing visible and burns a laptop.
    expect(TIERS.high.godRaySamples).toBeLessThanOrEqual(TIERS.med.godRaySamples);
    // ...and high must still HAVE god rays — a ceiling must not be satisfiable by turning them off.
    expect(TIERS.high.godRaySamples).toBeGreaterThan(0);
    expect(TIERS.high.godRays).toBe(true);
  });
  // S1-D-M3: mote count ramps with tier (sparse on low, full cloud on high).
  it('mote count ramps monotonically with tier', () => {
    expect(TIERS.low.moteCount).toBeLessThan(TIERS.med.moteCount);
    expect(TIERS.med.moteCount).toBeLessThan(TIERS.high.moteCount);
  });
});
