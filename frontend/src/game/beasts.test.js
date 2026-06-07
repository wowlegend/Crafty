import { describe, it, expect } from 'vitest';
import { BASE_CAPSULE, BEAST_FORMS, getBeastForm, setColliderToForm, restoreBaseCollider, elementForSpell, SPELL_TO_ELEMENT, formDamageMult, formMeleeCooldownMult, formLocomotion, spellForElement, resolveFormMelee } from './beasts.js';

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

describe('M5 per-form combat + locomotion multipliers (derive-never-bake)', () => {
  const ELEMENTS = ['fire', 'ice', 'lightning', 'arcane'];

  it('human/unknown element = the IDENTITY (no-op): mults are 1 (human read path stays byte-identical)', () => {
    expect(formDamageMult(null)).toBe(1);
    expect(formMeleeCooldownMult(null)).toBe(1);
    expect(formLocomotion(null)).toEqual({ moveMult: 1, gravityMult: 1, jumpMult: 1 });
    expect(formDamageMult('mythic')).toBe(1);
    expect(formLocomotion('mythic')).toEqual({ moveMult: 1, gravityMult: 1, jumpMult: 1 });
  });

  it('every beast form has positive finite combat + locomotion mults', () => {
    for (const el of ELEMENTS) {
      expect(formDamageMult(el)).toBeGreaterThan(0);
      expect(formMeleeCooldownMult(el)).toBeGreaterThan(0);
      const loco = formLocomotion(el);
      for (const k of ['moveMult', 'gravityMult', 'jumpMult']) {
        expect(loco[k]).toBeGreaterThan(0);
        expect(Number.isFinite(loco[k])).toBe(true);
      }
    }
  });

  it('the 4 forms are PAIRWISE-DISTINCT on locomotion (the sampler-trap defense — not 4 identical capsules)', () => {
    for (const k of ['moveMult', 'gravityMult', 'jumpMult']) {
      const vals = ELEMENTS.map((el) => formLocomotion(el)[k]);
      expect(new Set(vals).size).toBe(ELEMENTS.length); // no two forms share this axis
    }
  });

  it('the 4 forms are PAIRWISE-DISTINCT on combat (damageMult+cooldownMult tuple)', () => {
    const sigs = ELEMENTS.map((el) => `${formDamageMult(el)}|${formMeleeCooldownMult(el)}`);
    expect(new Set(sigs).size).toBe(ELEMENTS.length);
  });

  it('the feel matches the design: comet fastest+snappiest, bull/golem hardest, hawk the low-gravity hopper', () => {
    expect(formLocomotion('fire').moveMult).toBe(Math.max(...ELEMENTS.map((e) => formLocomotion(e).moveMult)));
    expect(formMeleeCooldownMult('fire')).toBe(Math.min(...ELEMENTS.map((e) => formMeleeCooldownMult(e))));
    expect(formDamageMult('ice')).toBeGreaterThan(formDamageMult('fire'));
    expect(formDamageMult('arcane')).toBeGreaterThan(formDamageMult('lightning'));
    expect(formLocomotion('lightning').gravityMult).toBe(Math.min(...ELEMENTS.map((e) => formLocomotion(e).gravityMult)));
    expect(formLocomotion('lightning').jumpMult).toBe(Math.max(...ELEMENTS.map((e) => formLocomotion(e).jumpMult)));
  });

  it('the melee spark type = the form-electing spell, and that spell is a valid spark case (re-skin wiring)', () => {
    // In beast form, Components passes `activeSpell` as the damageMob `type` so the spark colors per
    // element; activeSpell == the spell that elected the form (SPELL_TO_ELEMENT round-trips), and the
    // damageMob sparkColor switch has a case for each of those spells.
    const SPARK_CASES = ['fireball', 'iceball', 'lightning', 'arcane'];
    for (const [spell, el] of Object.entries(SPELL_TO_ELEMENT)) {
      expect(elementForSpell(spell)).toBe(el);
      expect(SPARK_CASES).toContain(spell);
    }
  });
});

describe('M5 melee re-skin WIRING (resolveFormMelee + spellForElement — the review [A]/[E] fixes)', () => {
  it('spellForElement inverts SPELL_TO_ELEMENT; null/unknown -> null; round-trips with elementForSpell', () => {
    expect(spellForElement('fire')).toBe('fireball');
    expect(spellForElement('ice')).toBe('iceball');
    expect(spellForElement('lightning')).toBe('lightning');
    expect(spellForElement('arcane')).toBe('arcane');
    expect(spellForElement(null)).toBeNull();
    expect(spellForElement('mythic')).toBeNull();
    for (const el of ['fire', 'ice', 'lightning', 'arcane']) {
      expect(elementForSpell(spellForElement(el))).toBe(el); // no drift between the two maps
    }
  });

  it('resolveFormMelee: human (null) = the identity — dealt unchanged, spark physical (byte-identical to pre-M5)', () => {
    expect(resolveFormMelee(37, null)).toEqual({ dealt: 37, sparkType: 'physical' });
    expect(resolveFormMelee(0, null)).toEqual({ dealt: 0, sparkType: 'physical' });
  });

  it('resolveFormMelee applies the form damage mult AND sparks the form element (the load-bearing wiring)', () => {
    expect(resolveFormMelee(100, 'ice')).toEqual({ dealt: Math.round(100 * BEAST_FORMS.ice.damageMult), sparkType: 'iceball' });
    expect(resolveFormMelee(100, 'fire')).toEqual({ dealt: Math.round(100 * BEAST_FORMS.fire.damageMult), sparkType: 'fireball' });
    expect(resolveFormMelee(100, 'lightning').sparkType).toBe('lightning');
    expect(resolveFormMelee(100, 'arcane').sparkType).toBe('arcane');
  });

  it('REGRESSION [A]: the spark tracks the LOCKED FORM, never a live spell (desync structurally impossible)', () => {
    // The lightning-hawk-taps-Digit1-throws-fire-sparks bug is impossible: the spark derives ONLY from
    // the form element; resolveFormMelee has NO activeSpell parameter, so spell-switching can't desync it.
    expect(resolveFormMelee(50, 'lightning').sparkType).toBe('lightning');
    expect(resolveFormMelee.length).toBe(2); // (rawDamage, element) — guards against re-adding a spell arg
  });
});
