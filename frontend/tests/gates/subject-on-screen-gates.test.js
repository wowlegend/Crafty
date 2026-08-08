import { describe, it, expect } from 'vitest';
import { subjectVerdict } from '../../scripts/visual/_probe.mjs';
import { ELEMENT_COLOR } from '../../src/render/beastAvatarParts.js';

/**
 * THE DEFECT THIS GUARDS. Four `beast-*.png` states shipped for weeks as pictures of a distant mountain
 * with no beast in them, and the byte-comparison gate compared one empty mountain against another and
 * passed every time. TWO independent causes, and the verdict below has to separate them because they need
 * different fixes:
 *   - subject NOT MOUNTED  -> nothing rendered at all
 *   - subject OUT OF FRAME -> mounted correctly, camera framed elsewhere (the ~20-unit divergence)
 * A capture that screenshots whatever is on screen cannot tell either from a correct frame.
 */

const L = { label: 'beast-fire' };

describe('subjectVerdict — a capture may not write a picture of the wrong thing', () => {
  it('PASSES when the subject is mounted and on screen', () => {
    expect(subjectVerdict({ inScene: 16, onScreen: 16 }, L).ok).toBe(true);
  });

  it('FAILS when nothing mounted, and says so specifically', () => {
    const v = subjectVerdict({ inScene: 0, onScreen: 0 }, L);
    expect(v.ok).toBe(false);
    expect(v.why).toMatch(/never mounted/i);
  });

  it('FAILS when mounted but OUT OF FRAME — the exact defect that shipped', () => {
    // 16 meshes present, none projecting on screen: this is the measured pre-fix state (ndc.y ~ -3).
    const v = subjectVerdict({ inScene: 16, onScreen: 0 }, L);
    expect(v.ok).toBe(false);
    expect(v.why).toMatch(/out of frame/i);
    // and it must NOT be misreported as a mount failure — the two need different fixes
    expect(v.why).not.toMatch(/never mounted/i);
  });

  it('enforces minOnScreen, so a single stray mesh cannot pass for the whole subject', () => {
    expect(subjectVerdict({ inScene: 16, onScreen: 1 }, { ...L, minOnScreen: 4 }).ok).toBe(false);
    expect(subjectVerdict({ inScene: 16, onScreen: 4 }, { ...L, minOnScreen: 4 }).ok).toBe(true);
  });

  it('names the subject in every failure, so a red capture says WHICH state broke', () => {
    for (const counts of [{ inScene: 0, onScreen: 0 }, { inScene: 9, onScreen: 0 }]) {
      expect(subjectVerdict(counts, L).why).toContain('beast-fire');
    }
  });
});

describe('the beast palette is derived from its source of truth, not re-typed', () => {
  it('every roster element exposes body/glow/core as hex', () => {
    const els = Object.keys(ELEMENT_COLOR);
    expect(els.sort()).toEqual(['arcane', 'fire', 'ice', 'lightning']);
    for (const el of els) {
      for (const k of ['body', 'glow', 'core']) {
        expect(ELEMENT_COLOR[el][k]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it('the four elements have DISTINCT body inks, so a palette match identifies which beast', () => {
    const bodies = Object.values(ELEMENT_COLOR).map((c) => c.body.toLowerCase());
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  it('matches the fire ink the capture probe searches for', () => {
    // If this drifts, the capture silently stops finding the subject and every beast frame would fail
    // loudly — which is the correct direction, but this pins the coupling so the cause is obvious.
    expect(ELEMENT_COLOR.fire.body.slice(1).toLowerCase()).toBe('3a1206');
  });
});
