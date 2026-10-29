// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

/**
 * THE GAUNTLETS SAY WHICH FORM THE PLAYER IS IN (render/viewmodel.js stepFormTint, render/playerRender.jsx).
 *
 * In first person the player's own beast draws nothing but its shadow (DECISIONS 2026-10-29 item 80), so nothing on
 * screen said which form was on. While a form is on, the gauntlets carry the form's element glow
 * (render/beastAvatarParts.js ELEMENT_COLOR, the colour of the beast's own rim and core) as the beast does: on their ink
 * outlines and in the ember core at the core's HDR gain, easing in with the form and out after it, the fading form
 * keeping its own colour until it is gone. The plates take no colour: added to their ember gold, the cool glows read
 * salmon and pink in the lookbook frames (DECISIONS 2026-10-29 item 87). Checked as a function (each form's colour, the
 * ease both ways, no allocation per frame, measured as in hot-path-alloc-gates) and mounted: StableMagicHands through
 * R3F (tests/gates/_r3f.jsx) with drei's real Outlines and a held block, the form set in the store.
 * BLIND SPOT: nothing is drawn; how the colour reads in the world is the lookbook's self set (the evidence frames).
 */
vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
// drei's real Outlines (the rim is its material), without the rest of drei; its own fiber import takes the mock above.
vi.mock('@react-three/drei', async () => ({ Outlines: (await import('@react-three/drei/core/Outlines.js')).Outlines }));
const { mountR3F } = await import('./_r3f.jsx');
const { stepFormTint, makeGauntletMaterials, GAUNTLET, GAUNTLET_PARTS } = await import('../../src/render/viewmodel.js');
const { ELEMENT_COLOR, BEAST_AVATAR_ELEMENTS } = await import('../../src/render/beastAvatarParts.js');
const { StableMagicHands } = await import('../../src/render/playerRender.jsx');
const { useGameStore } = await import('../../src/store/useGameStore');
const { youngBytesPerCall, NO_ALLOCATION_BYTES } = await import('./_youngGrowth.js');

const EMBER_CORE = new THREE.Color(GAUNTLET.core).multiplyScalar(GAUNTLET.coreGain);
const coreOf = (el) => new THREE.Color(ELEMENT_COLOR[el].glow).multiplyScalar(GAUNTLET.coreGain);
const PLATE = new THREE.Color(GAUNTLET.plate);
const INK = new THREE.Color(GAUNTLET.ink);
const glowOf = (el) => new THREE.Color(ELEMENT_COLOR[el].glow);
/** Two outline materials, as drei's Outlines makes them: a colour uniform. */
const fakeRims = () => [0, 1].map(() => ({ uniforms: { color: { value: INK.clone() } } }));
const near = (a, b, eps = 1e-6) => Math.abs(a.r - b.r) < eps && Math.abs(a.g - b.g) < eps && Math.abs(a.b - b.b) < eps;
const hex = (c) => `${c.r.toFixed(3)},${c.g.toFixed(3)},${c.b.toFixed(3)}`;

/** Run the tint `s` seconds at 60 Hz with the form `el` (null: none). */
function run(tint, el, s, mats, rims) {
  for (let i = 0; i < Math.round(s * 60); i++) stepFormTint(tint, el, 1 / 60, mats, rims);
  return tint;
}

describe('stepFormTint', () => {
  it('eases each form\'s glow into the core and the outlines, and back to the ember and the ink after; the plates take none', () => {
    let checked = 0;
    for (const el of BEAST_AVATAR_ELEMENTS) {
      const mats = makeGauntletMaterials();
      expect(near(mats.core.color, EMBER_CORE), 'SETUP: a fresh core is not the ember').toBe(true);
      const rims = fakeRims();
      const tint = { w: 0, el: null };
      stepFormTint(tint, el, 1 / 60, mats, rims);
      expect(tint.w, `${el}: the first frame must start the ease, not finish it`).toBeGreaterThan(0.05);
      expect(tint.w, `${el}: the first frame must start the ease, not finish it`).toBeLessThan(0.5);
      run(tint, el, 0.5, mats, rims);
      expect(tint.w, `${el}: the glow is not in by the end of the form's entrance (game/beastMorph.js MORPH_SEC)`).toBeGreaterThan(0.98);
      run(tint, el, 0.7, mats, rims);
      expect(near(mats.core.color, coreOf(el), 1e-3), `${el}: the core is ${hex(mats.core.color)}, not the form's glow ${hex(coreOf(el))}`).toBe(true);
      expect(rims.every((m) => near(m.uniforms.color.value, glowOf(el), 1e-3)), `${el}: the outlines are ${hex(rims[0].uniforms.color.value)}, not the form's glow`).toBe(true);
      expect(mats.plate.emissive.getHex(), `${el}: the plates glow ${hex(mats.plate.emissive)} in the form`).toBe(0);
      expect(near(mats.plate.color, PLATE), `${el}: the plates are ${hex(mats.plate.color)}, not their ember gold`).toBe(true);
      // The form ends: a few frames in, the fading glow is still the form's own hue, dimmer; then the ember is back.
      run(tint, null, 0.1, mats, rims);
      const w = tint.w;
      expect(w, `${el}: the glow left at once`).toBeGreaterThan(0.2);
      const fading = EMBER_CORE.clone().lerp(coreOf(el), w);
      expect(near(mats.core.color, fading, 1e-6), `${el}: the fading core is ${hex(mats.core.color)}, not the form's colour going`).toBe(true);
      expect(near(rims[1].uniforms.color.value, INK.clone().lerp(glowOf(el), w), 1e-6), `${el}: the fading outline is not the form's colour going`).toBe(true);
      run(tint, null, 1.5, mats, rims);
      expect(near(mats.core.color, EMBER_CORE), `${el}: the core did not come back to the ember`).toBe(true);
      expect(rims.every((m) => near(m.uniforms.color.value, INK)), `${el}: the outlines did not come back to the ink`).toBe(true);
      for (const m of Object.values(mats)) m.dispose();
      checked += 1;
    }
    expect(checked).toBe(4);
    const hues = BEAST_AVATAR_ELEMENTS.map((el) => coreOf(el).getHSL({}).h);
    expect(new Set(hues.map((h) => h.toFixed(2))).size, 'SETUP: two forms share a hue').toBe(4);
  });

  it('allocates nothing per frame, easing or held', () => {
    const mats = makeGauntletMaterials();
    const tint = { w: 0, el: null };
    const rims = fakeRims();
    const bytes = youngBytesPerCall((i) => stepFormTint(tint, (i >> 6) & 1 ? 'ice' : null, 1 / 60, mats, rims));
    expect(tint.w, 'SETUP: the probe never lit the gauntlets').toBeGreaterThan(0);
    expect(bytes, `stepFormTint allocates ${bytes.toFixed(1)} bytes a frame`).toBeLessThan(NO_ALLOCATION_BYTES);
  });
});

let r = null;
afterEach(async () => {
  if (r) await r.unmount();
  r = null;
  useGameStore.setState({ beastFormActive: false, activeBeastForm: null });
});

describe('StableMagicHands, stepped through R3F', () => {
  it('lights both gauntlets\' cores and outlines in the form\'s colour while it is on, and leaves the held block\'s outline ink', async () => {
    r = await mountR3F(<StableMagicHands selectedBlock={1} attackType={null} attackStartTime={{ current: 0 }} />);
    const coreSize = GAUNTLET_PARTS.find((p) => p.name === 'core').size;
    const cores = [];
    const outlines = [];
    r.three().scene.traverse((o) => {
      const g = o.isMesh && o.geometry.parameters;
      if (g && g.width === coreSize[0] && g.height === coreSize[1] && g.depth === coreSize[2]) cores.push(o);
      if (o.isMesh && o.material.uniforms?.color && o.material.uniforms.thickness) outlines.push(o);
    });
    // Each gauntlet's outlined parts (render/viewmodel.js GAUNTLET_PARTS), and the held block's own outline.
    const gauntletOutlines = 2 * GAUNTLET_PARTS.filter((p) => p.outline).length;
    expect(cores.length, 'SETUP: the two gauntlets\' cores').toBe(2);
    const held = outlines.filter((o) => !GAUNTLET_PARTS.some((p) => o.parent.parent.geometry.parameters.width === p.size[0]
      && o.parent.parent.geometry.parameters.depth === p.size[2]));
    expect(held.length, 'SETUP: the held block\'s outline').toBe(1);
    expect(outlines.length, 'SETUP: the gauntlets\' outlines and the held block\'s').toBe(gauntletOutlines + 1);
    const rims = outlines.filter((o) => !held.includes(o));
    await r.step(2);
    expect(cores.every((m) => near(m.material.color, EMBER_CORE)), 'as a human the cores are not the ember').toBe(true);
    expect(outlines.every((o) => near(o.material.uniforms.color.value, INK)), 'as a human an outline is not the ink').toBe(true);
    useGameStore.setState({ beastFormActive: true, activeBeastForm: 'arcane' });
    await r.step(75);
    expect(cores.every((m) => near(m.material.color, coreOf('arcane'), 1e-3)),
      `in the golem form the cores are ${hex(cores[0].material.color)}, not arcane's ${hex(coreOf('arcane'))}`).toBe(true);
    const off = rims.filter((o) => !near(o.material.uniforms.color.value, glowOf('arcane'), 1e-3));
    expect(off.length, `in the golem form ${off.length} of the gauntlets' ${rims.length} outlines are not arcane's glow`).toBe(0);
    expect(near(held[0].material.uniforms.color.value, INK), 'the held block\'s outline took the form\'s colour').toBe(true);
    useGameStore.setState({ beastFormActive: false, activeBeastForm: null });
    await r.step(90);
    expect(cores.every((m) => near(m.material.color, EMBER_CORE)), 'after the form the cores did not return to the ember').toBe(true);
    expect(rims.every((o) => near(o.material.uniforms.color.value, INK)), 'after the form the outlines did not return to the ink').toBe(true);
  });
});
