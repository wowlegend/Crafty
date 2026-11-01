// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import React from 'react';

// THE MOUNTED MOB WEARS THE FEEDBACK GRAMMAR (feedback-grammar plan M2 and M4, the siege plan's Move E; W3-A PR A).
// The pure modules (render/feedbackGrammar.js, render/mobTones.js, src/night/eliteLook.js) are gated on their own; this
// gate drives the REAL MobModel through R3F's own reconciler (tests/gates/_r3f.jsx) with drei's real <Outlines>, so a
// wire cut between those modules and the mesh is seen: the contact squash on the model, the reduced-motion dial reaching
// the flash and the squash, the look reaching the materials, the head and leg tones on their meshes, and an elite's
// crest and banner drawn with no shadow and with their glow. The wall clock and the world clock are both
// performance.now() here (no WorldClockTicker), which the gate drives.
// BLIND SPOT: nothing is drawn, so this sees what a frame WRITES (scale, uniforms, colours, flags), never pixels; the
// e2e feedback-grammar spec reads the pixels.
//
// Mutation-Proof: via scripts/dev/mutate.sh against these 6 tests, each RED, an identity mutant SURVIVED:
//   K9a the contact squash not applied to the model -> "a hit squashes the model"
//   K9b the feedback dial not read (juice fixed at 1) -> "reduced motion"
//   K9c the look not written into the materials -> "a hit whitens"
//   K9d the head drawn in the body colour -> "the head and legs wear their tones"
//   K9e the elite boxes not drawn -> "an elite draws its crest"
//   K9f the elite boxes casting shadows -> "an elite draws its crest"
//   K9g the crest's glow removed -> "an elite draws its crest"
//   K9h the squash at half depth -> "a hit squashes the model"

vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
vi.mock('@react-three/drei', async () => ({
  Outlines: (await import('@react-three/drei/core/Outlines.js')).Outlines,
  Html: () => null,
}));
const { mountR3F } = await import('./_r3f.jsx');
const { MobModel } = await import('../../src/render/MobModel.jsx');
const { useGameStore } = await import('../../src/store/useGameStore');
const { mobEntity, MOB_TYPES } = await import('../../src/game/mobTypes.js');
const { mobTones } = await import('../../src/render/mobTones.js');
const { FLASH_MS, SQUASH_MS, CONTACT } = await import('../../src/render/feedbackGrammar.js');
const { OUTLINE } = await import('../../src/render/characterStyle.js');

let T = 1_000_000;
beforeEach(() => {
  T = 1_000_000;
  vi.spyOn(performance, 'now').mockImplementation(() => T);
});
afterEach(() => { vi.restoreAllMocks(); });

const hex = (c) => new THREE.Color(c).getHex();

async function mount(type, { elite = null, juice = 1 } = {}) {
  useGameStore.setState({ qualityTier: 'high', juiceIntensity: juice });
  const entity = mobEntity(type, 7, new THREE.Vector3(0, 0, 0));
  if (elite) entity.elite = elite;
  const h = await mountR3F(<MobModel entity={entity} />);
  await h.step(1);
  const root = h.three().scene.children[0];
  const model = root.children[0];
  const parts = [];
  const hulls = [];
  model.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (o.material.uniforms?.thickness) hulls.push(o);
    else if (o.material.userData?.rim) parts.push(o);
  });
  return { h, entity, model, parts, hulls };
}

const sig = (m) => {
  const p = m.geometry.parameters;
  return [m.position.x, m.position.y, m.position.z, p.width, p.height, p.depth].map((v) => v.toFixed(4)).join(',');
};

describe('the mounted MobModel wears the contact sequence', () => {
  it('a hit whitens the lit band and the edge, then the edge returns to ink', async () => {
    const { h, entity, parts, hulls } = await mount('zombie');
    expect(parts.length, 'the denominator: toon parts mounted').toBeGreaterThanOrEqual(8);
    expect(hulls.length, 'the denominator: ink hulls mounted').toBe(parts.length);
    entity.lastHit = T;
    await h.step(1);
    for (const p of parts) expect(p.material.userData.rim.uFlash.value, 'a part\'s lit-band flash on contact').toBe(1);
    for (const o of hulls) expect(o.material.uniforms.color.value.getHex(), 'an ink hull on contact').toBe(hex(CONTACT));
    T += FLASH_MS + SQUASH_MS + 100;
    await h.step(3);
    for (const p of parts) expect(p.material.userData.rim.uFlash.value, 'the flash after its window').toBe(0);
    for (const o of hulls) expect(o.material.uniforms.color.value.getHex(), 'the hull after the flash').toBe(hex(OUTLINE.color));
    await h.unmount();
  });

  it('a hit squashes the model for about 50 ms after the flash, and it then stands at full height', async () => {
    const { h, entity, model } = await mount('zombie');
    expect(model.scale.y, 'at rest').toBe(1);
    entity.lastHit = T;
    await h.step(1);
    T += FLASH_MS + 1;
    await h.step(1);
    expect(model.scale.y, 'the squash at its start: Y to 0.85').toBeCloseTo(0.85, 5);
    expect(model.scale.x, 'the squash at its start: X to 1.10').toBeCloseTo(1.1, 5);
    T += SQUASH_MS + 10;
    await h.step(3);
    expect(model.scale.y, 'after the squash').toBe(1);
    await h.unmount();
  });

  it('reduced motion (the feedback dial at 0) keeps the white edge and drops the lit-band flash and the squash', async () => {
    const { h, entity, parts, hulls, model } = await mount('zombie', { juice: 0 });
    entity.lastHit = T;
    await h.step(1);
    for (const o of hulls) expect(o.material.uniforms.color.value.getHex(), 'the edge still goes white').toBe(hex(CONTACT));
    for (const p of parts) expect(p.material.userData.rim.uFlash.value, 'no lit-band flash at dial 0').toBe(0);
    T += FLASH_MS + 1;
    await h.step(1);
    expect(model.scale.y, 'no squash at dial 0').toBe(1);
    await h.unmount();
  });
});

describe('the mounted MobModel wears its tones', () => {
  it('the head and legs wear their tones, the body its own colour', async () => {
    const { h, entity, parts } = await mount('zombie');
    const [bodyW, bodyH, bodyD] = MOB_TYPES.zombie.bodySize;
    const [headW, headH, headD] = MOB_TYPES.zombie.headSize;
    const at = (w, ht, d, y) => parts.filter((m) => {
      const p = m.geometry.parameters;
      return p.width === w && p.height === ht && p.depth === d && (y === undefined || Math.abs(m.position.y - y) < 1e-6);
    });
    const tones = mobTones(entity.color);
    const head = at(headW, headH, headD, bodyH + headH / 2);
    const body = at(bodyW, bodyH, bodyD, bodyH / 2);
    const legs = at(0.25, 0.6, 0.25);
    expect([head.length, body.length, legs.length], 'the denominator: one head, one body, four legs').toEqual([1, 1, 4]);
    expect(body[0].material.color.getHex(), 'the body').toBe(hex(entity.color));
    expect(head[0].material.color.getHex(), 'the head wears the lighter tone').toBe(hex(tones.head));
    expect(hex(tones.head), 'the head tone differs from the body').not.toBe(hex(entity.color));
    for (const l of legs) expect(l.material.color.getHex(), 'a leg wears the darker tone').toBe(hex(tones.leg));
    await h.unmount();
  });
});

describe('the mounted MobModel draws an elite', () => {
  // Move E: an ember elite wears a three-box crest, the captain adds a two-box banner (a pole and a flag). Each box is
  // drawn with no shadow; the ember boxes carry a warm glow.
  for (const [rank, extra, ember] of [['ember', 3, 3], ['captain', 5, 4]]) {
    it(`an elite draws its crest${rank === 'captain' ? ' and banner' : ''} (${rank}), with no shadow and with its glow`, async () => {
      const plain = await mount('zombie');
      const plainSigs = new Set(plain.parts.map(sig));
      const plainCast = plain.parts.filter((m) => m.castShadow).length;
      await plain.h.unmount();
      const elite = await mount('zombie', { elite: rank });
      const added = elite.parts.filter((m) => !plainSigs.has(sig(m)));
      expect(plainCast, 'the presence twin: the plain zombie\'s parts cast shadows').toBe(plain.parts.length);
      expect(added.length, `the ${rank}'s boxes drawn`).toBe(extra);
      for (const m of added) expect(m.castShadow, `an elite box casts a shadow: ${sig(m)}`).toBe(false);
      const glowing = added.filter((m) => m.material.emissive.getHex() !== 0 && m.material.emissiveIntensity > 0);
      expect(glowing.length, `the ${rank}'s ember boxes glow`).toBe(ember);
      for (const m of glowing) expect(m.material.color.getHex(), 'a glowing box is ember').toBe(hex('#FF7A2A'));
      const plainGlow = elite.parts.filter((m) => plainSigs.has(sig(m)) && m.material.emissive.getHex() !== 0);
      expect(plainGlow.length, 'no plain part glows').toBe(0);
      await elite.h.unmount();
    });
  }
});
