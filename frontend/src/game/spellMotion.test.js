import { describe, it, expect } from 'vitest';
import { computeSpellMotion } from './spellMotion.js';

// v7-S3.1: per-element MOTION GRAMMAR (pure). Replaces the single shared 1+sin(phase)*flicker pulse +
// hardcoded uniform spin that made all 4 spells "breathe"/tumble identically. Deterministic given
// (motion, phase, flicker) so capture (phase=capturePhase frozen) stays byte-stable.

describe('computeSpellMotion — per-element motion grammar', () => {
  it('roil (fire): non-uniform scale (rises -> y taller than x/z) + a gentle spin', () => {
    const m = computeSpellMotion('roil', 0.65, 0.18);
    expect(m.shapeScale).toHaveLength(3);
    // turbulent => x and z are not equal to y (non-uniform); y carries the upward bias.
    expect(m.shapeScale[1]).toBeGreaterThan(m.shapeScale[0]);
    expect(m.shapeScale[1]).toBeGreaterThan(m.shapeScale[2]);
    expect(m.shapeSpin).not.toBeNull();
    expect(m.coreIntensity).toBe(1);
  });

  it('static (ice): ~uniform near-1 scale and NO tumble (shapeSpin null)', () => {
    const m = computeSpellMotion('static', 0.30, 0.07);
    expect(m.shapeSpin).toBeNull(); // ice must not spin like a fireball
    // uniform (all three axes equal) + within a tight band of 1 (near-still / slow twinkle)
    expect(m.shapeScale[0]).toBe(m.shapeScale[1]);
    expect(m.shapeScale[1]).toBe(m.shapeScale[2]);
    expect(Math.abs(m.shapeScale[0] - 1)).toBeLessThan(0.05);
    expect(m.coreIntensity).toBe(1);
  });

  it('strobe (lightning): coreIntensity is QUANTIZED on/off across phases, no smooth pulse, no spin', () => {
    const samples = Array.from({ length: 40 }, (_, i) => computeSpellMotion('strobe', i * 0.137, 0.34).coreIntensity);
    const uniq = [...new Set(samples.map((v) => v.toFixed(3)))];
    // a square on/off strobe collapses to a SMALL set of discrete values (not a smooth continuum)
    expect(uniq.length).toBeLessThanOrEqual(3);
    // and it actually toggles (both a bright and a dim state occur)
    expect(Math.max(...samples)).toBeGreaterThan(0.8);
    expect(Math.min(...samples)).toBeLessThan(0.5);
    expect(computeSpellMotion('strobe', 0.0, 0.34).shapeSpin).toBeNull();
  });

  it('orbit (arcane): smooth Y-axis spin only, NO scale-breathing', () => {
    const m = computeSpellMotion('orbit', 1.0, 0.14);
    expect(m.shapeScale).toEqual([1, 1, 1]); // no breathing
    expect(m.shapeSpin[0]).toBe(0);
    expect(m.shapeSpin[1]).toBeGreaterThan(0); // rotates about Y
    expect(m.shapeSpin[2]).toBe(0);
  });

  it("default/unknown AND the canonical 'pulse' tag (back-compat): legacy uniform pulse + uniform spin", () => {
    // _defaultEnergy.motion === 'pulse' (the fallback contract); both it and any unknown tag route to legacy.
    for (const tag of [undefined, 'pulse']) {
      const m = computeSpellMotion(tag, 0.5, 0.12);
      expect(m.shapeScale[0]).toBe(m.shapeScale[1]);
      expect(m.shapeScale[1]).toBe(m.shapeScale[2]); // uniform (legacy setScalar)
      expect(m.shapeSpin).toEqual([0.06, 0.05, 0.04]); // the legacy hardcoded spin
    }
  });

  it('is DETERMINISTIC (same args -> deep-equal) so capture stays byte-stable', () => {
    for (const motion of ['roil', 'static', 'strobe', 'orbit', undefined]) {
      expect(computeSpellMotion(motion, 0.77, 0.2)).toEqual(computeSpellMotion(motion, 0.77, 0.2));
    }
  });
});
