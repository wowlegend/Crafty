import { describe, it, expect } from 'vitest';
import { BASE_CAPSULE, BEAST_FORMS, getBeastForm, setColliderToForm, restoreBaseCollider, elementForSpell } from './beasts.js';

// Mocks for the Rapier surface the helpers touch (no live Rapier world needed).
function mockRapier() {
  return { Capsule: class { constructor(halfHeight, radius) { this.halfHeight = halfHeight; this.radius = radius; } } };
}
function mockCollider() {
  const shapes = [];
  return { shapes, setShape: (s) => shapes.push(s) };
}
function mockController() {
  const impulses = [];
  return { impulses, setApplyImpulsesToDynamicBodies: (v) => impulses.push(v) };
}

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

  it('maps each element to its beast id (fire->comet, ice->bull, lightning->hawk, arcane->golem)', () => {
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

describe('elementForSpell (the loaded spell picks the form)', () => {
  it('maps the 4 spells to their elements -> the 4 beasts', () => {
    expect(elementForSpell('fireball')).toBe('fire');     // -> comet
    expect(elementForSpell('iceball')).toBe('ice');       // -> bull
    expect(elementForSpell('lightning')).toBe('lightning'); // -> hawk
    expect(elementForSpell('arcane')).toBe('arcane');     // -> golem
  });
  it('every mapped element is a real BEAST_FORMS key', () => {
    for (const el of Object.values({ fireball: 'fire', iceball: 'ice', lightning: 'lightning', arcane: 'arcane' })) {
      expect(BEAST_FORMS[el]).toBeTruthy();
    }
  });
  it('falls back to fire for an unknown/missing spell', () => {
    expect(elementForSpell('mysteryball')).toBe('fire');
    expect(elementForSpell(undefined)).toBe('fire');
  });
});

describe('setColliderToForm (the swap logic)', () => {
  it('setShapes a Capsule with the form dims (in-place)', () => {
    const c = mockCollider();
    const ok = setColliderToForm(c, mockRapier(), BEAST_FORMS.ice);
    expect(ok).toBe(true);
    expect(c.shapes).toHaveLength(1);
    expect(c.shapes[0].halfHeight).toBe(BEAST_FORMS.ice.halfHeight);
    expect(c.shapes[0].radius).toBe(BEAST_FORMS.ice.radius);
  });
  it('is a no-op (false) when any arg is missing — never throws', () => {
    expect(setColliderToForm(null, mockRapier(), BEAST_FORMS.fire)).toBe(false);
    expect(setColliderToForm(mockCollider(), null, BEAST_FORMS.fire)).toBe(false);
    expect(setColliderToForm(mockCollider(), mockRapier(), null)).toBe(false);
  });
});

describe('restoreBaseCollider (the no-permanent-beast restore op)', () => {
  it('setShapes back to BASE_CAPSULE + resets impulse-shoving OFF', () => {
    const c = mockCollider();
    const ctrl = mockController();
    const ok = restoreBaseCollider(c, mockRapier(), ctrl);
    expect(ok).toBe(true);
    expect(c.shapes[0].halfHeight).toBe(BASE_CAPSULE.halfHeight);
    expect(c.shapes[0].radius).toBe(BASE_CAPSULE.radius);
    expect(ctrl.impulses).toEqual([false]); // base controller config (M5 bull turns it on)
  });
  it('tolerates a missing controller (restores shape, no throw)', () => {
    const c = mockCollider();
    expect(() => restoreBaseCollider(c, mockRapier(), null)).not.toThrow();
    expect(c.shapes[0].halfHeight).toBe(BASE_CAPSULE.halfHeight);
  });
  it('is a no-op when the collider is absent', () => {
    expect(restoreBaseCollider(null, mockRapier(), mockController())).toBe(false);
  });
});
