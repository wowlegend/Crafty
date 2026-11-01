import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { hdrGain, linearLuminance, BLOOM_THRESHOLD } from '../../src/render/hdrGain.js';
import { mobTones, HOSTILE_EYE } from '../../src/render/mobTones.js';
import { MOB_TYPES } from '../../src/game/mobTypes.js';
import { featureColor, mobFeatures } from '../../src/game/mobFeatures.js';
import { toneMappedSrgb } from './_toneMap.js';

// IDENTITY AND THREAT (feedback-grammar plan M4; W3-A PR A F3). A mob's eyes are the only part of it that glows: the
// hostile eyes are lifted past the composer's bloom threshold (a material's toneMapped flag does nothing inside the
// composer's half-float buffer, so the GAIN is what makes them bloom), and a settler's do not. And each archetype wears
// two more tones on parts it already has, a lighter head and darker legs, so no part, draw or program is added (the
// plan's flush plate and strap boxes would each add a mesh and a hull; the draw counter bounds this unit at +0).
//
// Mutation-Proof: via scripts/dev/mutate.sh against these 6 tests, each observed RED, an identity mutant SURVIVED:
//   K5a the eye without its gain -> "hostile eyes cross the bloom threshold"
//   K5b plausible-wrong: luminance as a plain channel average -> "linearLuminance is Rec. 709"
//   K5d the legs not darkened -> "every hostile archetype wears two more tones"
//   K5e plausible-wrong: the eye's margin under 1 -> "hostile eyes cross the bloom threshold"

const HOSTILES = Object.keys(MOB_TYPES).filter((k) => !MOB_TYPES[k].passive);

describe('hdrGain: a colour lifted to a luminance, by the bloom pass\'s own weights', () => {
  it('linearLuminance is Rec. 709 (the coefficients three hands the bloom pass\'s luminance())', () => {
    // Pure primaries pin each coefficient on its own (an average would read 1/3 for each).
    expect(linearLuminance(new THREE.Color(1, 0, 0))).toBeCloseTo(0.2126, 4);
    expect(linearLuminance(new THREE.Color(0, 1, 0))).toBeCloseTo(0.7152, 4);
    expect(linearLuminance(new THREE.Color(0, 0, 1))).toBeCloseTo(0.0722, 4);
  });

  it('hdrGain lifts each primary exactly to threshold x margin', () => {
    for (const [hex, t] of [['#ff0000', 0.65], ['#00ff00', 0.65], ['#0000ff', 1.05], ['#ff3a00', 1.05]]) {
      const c = new THREE.Color(hex).multiplyScalar(hdrGain(hex, t, 1.25));
      expect(linearLuminance(c), hex).toBeCloseTo(t * 1.25, 5);
    }
  });
});

describe('the eyes: a hostile\'s bloom and a settler\'s do not', () => {
  it('hostile eyes cross the bloom threshold and still read red; a settler\'s green stays under it', () => {
    expect(BLOOM_THRESHOLD).toBe(0.65);
    expect(linearLuminance(HOSTILE_EYE)).toBeGreaterThan(BLOOM_THRESHOLD);
    const [r, g, b] = toneMappedSrgb([HOSTILE_EYE.r, HOSTILE_EYE.g, HOSTILE_EYE.b]);
    expect(r, 'the core is hot').toBeGreaterThan(0.95);
    expect(g, 'and red, not white').toBeLessThan(0.75);
    expect(b).toBeLessThan(0.75);
    expect(linearLuminance(new THREE.Color('#00aa44'))).toBeLessThan(BLOOM_THRESHOLD);
  });
});

describe('part tones: two more tones on parts every mob already has', () => {
  it('every hostile archetype wears two more tones: a lighter head and darker legs, beyond its body and feature tones', () => {
    expect(HOSTILES, 'the denominator: the hostile archetypes').toHaveLength(7);
    for (const type of HOSTILES) {
      const body = MOB_TYPES[type].color;
      const t = mobTones(body);
      const dims = { bodyW: 1, bodyH: 1, bodyD: 1, headW: 1, headH: 1, headD: 1 };
      const own = new Set([body, ...mobFeatures(type, dims).map((f) => featureColor(f.tone, body))].map((h) => h.toLowerCase()));
      const added = new Set([t.head, t.leg].filter((h) => !own.has(h.toLowerCase())));
      expect(added.size, `${type}: ${JSON.stringify(t)} over ${[...own]}`).toBe(2);
      const L = (h) => linearLuminance(new THREE.Color(h));
      expect(L(t.head), `${type}: the head is lighter`).toBeGreaterThan(L(body));
      expect(L(t.leg), `${type}: the legs are darker`).toBeLessThan(L(body));
    }
  });

  it('the tones keep the body\'s hue: a green mob\'s head and legs stay green', () => {
    const t = mobTones(MOB_TYPES.zombie.color);
    for (const h of [t.head, t.leg]) {
      const c = new THREE.Color(h);
      expect(c.g, h).toBeGreaterThan(c.r);
      expect(c.g, h).toBeGreaterThan(c.b);
    }
  });
});
