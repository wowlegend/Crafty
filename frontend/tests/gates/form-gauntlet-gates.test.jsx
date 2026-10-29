// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

/**
 * THE GAUNTLETS SAY WHICH FORM THE PLAYER IS IN (render/viewmodel.js stepFormTint, render/playerRender.jsx).
 *
 * In first person the player's own beast draws nothing but its shadow (DECISIONS 2026-10-29 item 80), so nothing on
 * screen said which form was on. While a form is on, the ember core set in each gauntlet takes the form's element glow
 * (render/beastAvatarParts.js ELEMENT_COLOR, the colour of the beast's own rim and core) at the core's HDR gain, easing
 * in with the form and out after it, the fading form keeping its own colour until it is gone. The plates take no colour:
 * added to their ember gold, the cool glows read salmon and pink in the lookbook frames (DECISIONS 2026-10-29 item 87). Checked as a function (each form's colour, the ease both ways, no allocation per frame, measured as in
 * hot-path-alloc-gates) and mounted: StableMagicHands through R3F (tests/gates/_r3f.jsx), the form set in the store.
 * BLIND SPOT: nothing is drawn; how the colour reads in the world is the lookbook's self set (the evidence frames).
 */
vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
vi.mock('@react-three/drei', () => ({ Outlines: () => null }));
const { mountR3F } = await import('./_r3f.jsx');
const { stepFormTint, makeGauntletMaterials, GAUNTLET, GAUNTLET_PARTS } = await import('../../src/render/viewmodel.js');
const { ELEMENT_COLOR, BEAST_AVATAR_ELEMENTS } = await import('../../src/render/beastAvatarParts.js');
const { StableMagicHands } = await import('../../src/render/playerRender.jsx');
const { useGameStore } = await import('../../src/store/useGameStore');
const { youngBytesPerCall, NO_ALLOCATION_BYTES } = await import('./_youngGrowth.js');

const EMBER_CORE = new THREE.Color(GAUNTLET.core).multiplyScalar(GAUNTLET.coreGain);
const coreOf = (el) => new THREE.Color(ELEMENT_COLOR[el].glow).multiplyScalar(GAUNTLET.coreGain);
const PLATE = new THREE.Color(GAUNTLET.plate);
const near = (a, b, eps = 1e-6) => Math.abs(a.r - b.r) < eps && Math.abs(a.g - b.g) < eps && Math.abs(a.b - b.b) < eps;
const hex = (c) => `${c.r.toFixed(3)},${c.g.toFixed(3)},${c.b.toFixed(3)}`;

/** Run the tint `s` seconds at 60 Hz with the form `el` (null: none). */
function run(tint, el, s, mats) {
  for (let i = 0; i < Math.round(s * 60); i++) stepFormTint(tint, el, 1 / 60, mats);
  return tint;
}

describe('stepFormTint', () => {
  it('eases each form\'s glow into the core, and back to the ember after the form; the plates take none of it', () => {
    let checked = 0;
    for (const el of BEAST_AVATAR_ELEMENTS) {
      const mats = makeGauntletMaterials();
      expect(near(mats.core.color, EMBER_CORE), 'SETUP: a fresh core is not the ember').toBe(true);
      const tint = { w: 0, el: null };
      stepFormTint(tint, el, 1 / 60, mats);
      expect(tint.w, `${el}: the first frame must start the ease, not finish it`).toBeGreaterThan(0.05);
      expect(tint.w, `${el}: the first frame must start the ease, not finish it`).toBeLessThan(0.5);
      run(tint, el, 0.5, mats);
      expect(tint.w, `${el}: the glow is not in by the end of the form's entrance (game/beastMorph.js MORPH_SEC)`).toBeGreaterThan(0.98);
      run(tint, el, 0.7, mats);
      expect(near(mats.core.color, coreOf(el), 1e-3), `${el}: the core is ${hex(mats.core.color)}, not the form's glow ${hex(coreOf(el))}`).toBe(true);
      expect(mats.plate.emissive.getHex(), `${el}: the plates glow ${hex(mats.plate.emissive)} in the form`).toBe(0);
      expect(near(mats.plate.color, PLATE), `${el}: the plates are ${hex(mats.plate.color)}, not their ember gold`).toBe(true);
      // The form ends: a few frames in, the fading glow is still the form's own hue, dimmer; then the ember is back.
      run(tint, null, 0.1, mats);
      const w = tint.w;
      expect(w, `${el}: the glow left at once`).toBeGreaterThan(0.2);
      const fading = EMBER_CORE.clone().lerp(coreOf(el), w);
      expect(near(mats.core.color, fading, 1e-6), `${el}: the fading core is ${hex(mats.core.color)}, not the form's colour going`).toBe(true);
      run(tint, null, 1.5, mats);
      expect(near(mats.core.color, EMBER_CORE), `${el}: the core did not come back to the ember`).toBe(true);
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
    const bytes = youngBytesPerCall((i) => stepFormTint(tint, (i >> 6) & 1 ? 'ice' : null, 1 / 60, mats));
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
  it('lights both gauntlets\' cores in the form\'s colour while it is on, and returns them to the ember after', async () => {
    r = await mountR3F(<StableMagicHands selectedBlock={null} attackType={null} attackStartTime={{ current: 0 }} />);
    const coreSize = GAUNTLET_PARTS.find((p) => p.name === 'core').size;
    const cores = [];
    r.three().scene.traverse((o) => {
      const g = o.isMesh && o.geometry.parameters;
      if (g && g.width === coreSize[0] && g.height === coreSize[1] && g.depth === coreSize[2]) cores.push(o);
    });
    expect(cores.length, 'SETUP: the two gauntlets\' cores').toBe(2);
    await r.step(2);
    expect(cores.every((m) => near(m.material.color, EMBER_CORE)), 'as a human the cores are not the ember').toBe(true);
    useGameStore.setState({ beastFormActive: true, activeBeastForm: 'arcane' });
    await r.step(75);
    expect(cores.every((m) => near(m.material.color, coreOf('arcane'), 1e-3)),
      `in the golem form the cores are ${hex(cores[0].material.color)}, not arcane's ${hex(coreOf('arcane'))}`).toBe(true);
    useGameStore.setState({ beastFormActive: false, activeBeastForm: null });
    await r.step(90);
    expect(cores.every((m) => near(m.material.color, EMBER_CORE)), 'after the form the cores did not return to the ember').toBe(true);
  });
});
