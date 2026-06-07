import { describe, it, expect } from 'vitest';
import { BASE_CAPSULE, BEAST_FORMS, getBeastForm } from './beasts.js';

// S2-B1-M1 T1: the BEAST_FORMS table is pure data — the per-element collider profile the
// transactional hot-swap reads. The 4 forms must be genuinely distinct mass-shapes (not one
// capsule recolored), and the base must match the live <CapsuleCollider args={[0.5,0.4]}>.

describe('BASE_CAPSULE', () => {
  it('matches the live player capsule args [halfHeight 0.5, radius 0.4]', () => {
    expect(BASE_CAPSULE).toEqual({ halfHeight: 0.5, radius: 0.4 });
  });
});

describe('BEAST_FORMS', () => {
  const ELEMENTS = ['fire', 'ice', 'lightning', 'arcane'];

  it('has a form for each of the 4 elements', () => {
    for (const el of ELEMENTS) expect(BEAST_FORMS[el]).toBeTruthy();
    expect(Object.keys(BEAST_FORMS).sort()).toEqual([...ELEMENTS].sort());
  });

  it('maps each element to its beast id (fire→comet, ice→bull, lightning→hawk, arcane→golem)', () => {
    expect(BEAST_FORMS.fire.id).toBe('comet');
    expect(BEAST_FORMS.ice.id).toBe('bull');
    expect(BEAST_FORMS.lightning.id).toBe('hawk');
    expect(BEAST_FORMS.arcane.id).toBe('golem');
  });

  it('every form has positive collider dims', () => {
    for (const el of ELEMENTS) {
      const f = BEAST_FORMS[el];
      expect(typeof f.halfHeight).toBe('number');
      expect(typeof f.radius).toBe('number');
      expect(f.halfHeight).toBeGreaterThan(0);
      expect(f.radius).toBeGreaterThan(0);
    }
  });

  it('the 4 forms are pairwise-distinct mass-shapes (content-variety, not recolors)', () => {
    const sigs = ELEMENTS.map((el) => `${BEAST_FORMS[el].halfHeight}x${BEAST_FORMS[el].radius}`);
    expect(new Set(sigs).size).toBe(4);
  });

  it('encodes the intended silhouettes: comet smallest, bull widest, hawk tallest', () => {
    const { fire: comet, ice: bull, lightning: hawk, arcane: golem } = BEAST_FORMS;
    // bull is the widest (fattest radius — the FPS-de-risk target)
    expect(bull.radius).toBeGreaterThan(comet.radius);
    expect(bull.radius).toBeGreaterThanOrEqual(golem.radius);
    // hawk is the tallest (largest halfHeight relative to comet); comet is the shortest
    expect(hawk.halfHeight).toBeGreaterThan(comet.halfHeight);
    expect(comet.halfHeight).toBeLessThanOrEqual(BASE_CAPSULE.halfHeight);
  });
});

describe('getBeastForm', () => {
  it('returns the form for a known element', () => {
    expect(getBeastForm('fire')).toBe(BEAST_FORMS.fire);
  });
  it('returns null for an unknown / missing element', () => {
    expect(getBeastForm('mythic')).toBeNull();
    expect(getBeastForm(undefined)).toBeNull();
    expect(getBeastForm(null)).toBeNull();
    expect(getBeastForm('')).toBeNull();
  });
});
