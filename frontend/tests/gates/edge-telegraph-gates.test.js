import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { mobLook, DANGER } from '../../src/render/feedbackGrammar.js';
import { OUTLINE, RIM } from '../../src/render/characterStyle.js';
import { WINDUP_MS } from '../../src/game/attackTelegraph.js';
import { neutralToneMap, toneMappedSrgb } from './_toneMap.js';

// DANGER READS AT THE EDGE (feedback-grammar plan M1; W3-A PR A F1). A windup used to flood the whole body's emissive
// toward red-orange (MobModel's traverse), so the toon bands vanished exactly when the player most needed to read the
// mob. Now the windup heats the ink outline and the rim's COLOUR toward DANGER over the ramp squared (the coil's own
// ease), and the body keeps its two bands. mobLook is the pure per-frame decision MobModel writes into its materials;
// that the component writes it, and writes no emissive, is the e2e's (tests/e2e/feedback-grammar.spec.js reads the live
// materials and the pixels), because a flood put back in the component is invisible here.
//
// Mutation-Proof: via scripts/dev/mutate.sh against these 8 tests, each observed RED, an identity mutant SURVIVED:
//   K1a the outline not lerped (held at ink) -> "a windup raises the edge"
//   K1b plausible-wrong: the ramp not squared -> "a windup raises the edge" (0.8, not 0.64)
//   K1c the entity's own windup length ignored (WINDUP_MS) -> "uses the entity windup length"
//   K1d a staggered mob keeps its telegraph -> "stagger clears the telegraph"
//   K1e the hit flash does not win -> "flash beats telegraph"
//   K1f plausible-wrong: DANGER a salmon '#ff8a60' -> "the danger edge renders danger red"
//   K1g the rim colour not lerped -> "a windup raises the edge"
//   K1h the twin's desaturation mix dropped -> "the tone-map twin mirrors three r172"

const fresh = () => ({ telegraph: -1, flash: 0, squash: 0, outline: new THREE.Color(), rim: new THREE.Color() });
const at = (entity, wnow, now = 0) => mobLook(entity, now, wnow, 1, {}, fresh());

describe('mobLook: the windup heats the edge, never the body', () => {
  it('a windup raises the edge toward DANGER over the ramp squared; rest is ink and the mood rim', () => {
    const e = { windupUntil: 1000, lastHit: 0 };
    const o = at(e, 1000 - 0.2 * WINDUP_MS); // 0.8 of the ramp
    expect(o.telegraph).toBeCloseTo(0.64, 5);
    const ink = new THREE.Color(OUTLINE.color), hot = new THREE.Color(DANGER);
    expect(o.outline.r).toBeCloseTo(ink.r + (hot.r - ink.r) * 0.64, 5);
    expect(o.outline.g).toBeCloseTo(ink.g + (hot.g - ink.g) * 0.64, 5);
    expect(o.outline.r, 'toward danger red').toBeGreaterThan(o.outline.g * 3);
    const rim = new THREE.Color(RIM.color);
    expect(o.rim.b).toBeCloseTo(rim.b + (hot.b - rim.b) * 0.64, 5);
    expect(o.rim.r).toBeGreaterThan(o.rim.b);
    const rest = at({ windupUntil: 0 }, 1000);
    expect(rest.telegraph).toBe(0);
    expect(rest.outline.getHexString()).toBe(ink.getHexString());
    expect(rest.rim.getHexString()).toBe(rim.getHexString());
  });

  it('the strike itself: a windup that has come due holds no telegraph (the worker owns what follows)', () => {
    expect(at({ windupUntil: 1000 }, 1000).telegraph).toBe(0);
    expect(at({ windupUntil: 1000 }, 999.9).telegraph).toBeGreaterThan(0.99);
  });

  it('uses the entity windup length when the archetype provides one', () => {
    expect(at({ windupUntil: 1000, windupMs: 620 }, 1000 - 310).telegraph).toBeCloseTo(0.25, 5); // half of 620 ms
  });

  it('stagger clears the telegraph the same frame', () => {
    expect(at({ windupUntil: 1000, staggerUntil: 2000 }, 1000 - 0.2 * WINDUP_MS).telegraph).toBe(0);
    expect(at({ windupUntil: 1000, staggerUntil: 500 }, 1000 - 0.2 * WINDUP_MS).telegraph, 'a stagger that ended').toBeGreaterThan(0);
  });

  it('flash beats telegraph: a mob just hit shows no danger edge', () => {
    expect(at({ windupUntil: 1000, lastHit: 5000 }, 1000 - 0.2 * WINDUP_MS, 5010).telegraph).toBe(0);
    expect(at({ windupUntil: 1000, lastHit: 5000 }, 1000 - 0.2 * WINDUP_MS, 9000).telegraph, 'a hit long past').toBeGreaterThan(0);
  });
});

describe('DANGER through the display chain', () => {
  it('the tone-map twin mirrors three r172: identity under the knee, compressed and desaturated above it', () => {
    neutralToneMap([0.5, 0.3, 0.2]).forEach((v, i) => expect(v).toBeCloseTo([0.46, 0.26, 0.16][i], 5)); // offset 0.04 only
    const [r, g] = neutralToneMap([3.35, 0.142, 0]); // #ff3a00 lifted 3.35x
    expect(g / r, 'pulled toward white: the desaturation mix ran').toBeGreaterThan(0.2);
  });

  it('the danger edge renders danger red, not salmon (the outline is unlit, so this is its pixel)', () => {
    const c = new THREE.Color(DANGER);
    const [r, g, b] = toneMappedSrgb([c.r, c.g, c.b]);
    expect(r).toBeGreaterThan(0.6);
    expect(g).toBeLessThan(0.35);
    expect(b).toBeLessThan(0.3);
  });

  it('the rest outline stays ink: dark through the same chain', () => {
    const c = new THREE.Color(OUTLINE.color);
    expect(Math.max(...toneMappedSrgb([c.r, c.g, c.b]))).toBeLessThan(0.1);
  });
});
