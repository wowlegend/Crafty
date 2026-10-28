// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';

/**
 * The motes are fireflies: present by the colour script's hour, never by day or under the boss, and faded out near the
 * camera so none sits on the lens.
 *
 *   pure     motePresence over the sky frame sampleMood resolves (the boss overlay included), moteNearFade, and the
 *            GLSL fade generated from the same constants.
 *   wiring   <LightMotes> mounted through R3F's own reconciler (tests/gates/_r3f.jsx): the live mesh hides at noon and
 *            shows at midnight, its opacity follows the presence, its colour is the firefly's, and its compiled vertex
 *            source carries the fade.
 *
 * Not checked here: pixels. Whether the fade looks right, and whether fireflies read on the night key, is the eye-level
 * lookbook's (scripts/visual/lookbook.mjs); the e2e reads the same mesh in the running game (tests/e2e/light-script.spec.js).
 */
vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
const { mountR3F } = await import('./_r3f.jsx');
const { LightMotes } = await import('../../src/render/LightMotes.jsx');
const { sampleMood, publishSkyFrame } = await import('../../src/render/mood.js');
const {
  FIREFLY_COLOR, FIREFLY_OPACITY, MOTE_NEAR, motePresence, moteNearFade, moteNearFadeGlsl,
} = await import('../../src/render/motePresence.js');

const NOON = 0.25, GOLDEN = 0.48, MIDNIGHT = 0.75;

let r = null;
afterEach(async () => {
  if (r) await r.unmount();
  r = null;
  publishSkyFrame(sampleMood(0));
});

describe('the presence: fireflies by night, none by day or under the boss', () => {
  it('0 at noon and at golden hour, 1 at midnight, 0 at midnight under the boss', () => {
    expect(motePresence(sampleMood(0, NOON))).toBe(0);
    expect(motePresence(sampleMood(0, GOLDEN))).toBe(0);
    expect(motePresence(sampleMood(0, MIDNIGHT))).toBe(1);
    expect(motePresence(sampleMood(2, MIDNIGHT))).toBe(0);
  });

  it('a missing or junk frame is no motes, never NaN', () => {
    for (const f of [null, undefined, {}, { motes: NaN }, { motes: 'x' }]) expect(motePresence(f), JSON.stringify(f)).toBe(0);
    expect(motePresence({ motes: 3 })).toBe(1);
    expect(motePresence({ motes: -1 })).toBe(0);
  });
});

describe('the near fade keeps motes off the lens', () => {
  it('invisible inside the first distance, full beyond the second, rising between', () => {
    expect(moteNearFade(0)).toBe(0);
    expect(moteNearFade(MOTE_NEAR[0])).toBe(0);
    expect(moteNearFade(MOTE_NEAR[1])).toBe(1);
    expect(moteNearFade(40)).toBe(1);
    let prev = -1, n = 0;
    for (let d = MOTE_NEAR[0]; d <= MOTE_NEAR[1]; d += 0.25) { const v = moteNearFade(d); expect(v).toBeGreaterThanOrEqual(prev); prev = v; n++; }
    expect(n).toBeGreaterThan(10);
    expect(moteNearFade(NaN)).toBe(0);
    expect(MOTE_NEAR[0]).toBeGreaterThanOrEqual(2); // the hands and the first block in front of the eye sit inside it
  });

  it('the GLSL fade is generated from the same constants', () => {
    expect(moteNearFadeGlsl('q')).toBe(`smoothstep(${MOTE_NEAR[0].toFixed(3)}, ${MOTE_NEAR[1].toFixed(3)}, q)`);
  });
});

describe('<LightMotes> reads the presence every frame', () => {
  it('hidden at noon, shown at midnight with the firefly colour and the presence as opacity, the fade compiled in', async () => {
    publishSkyFrame(sampleMood(0, MIDNIGHT));
    r = await mountR3F(<LightMotes count={8} />);
    await r.step(1);
    let mesh = null;
    r.three().scene.traverse((o) => { if (o.isInstancedMesh) mesh = o; });
    expect(mesh, 'SETUP: LightMotes mounted no instanced mesh').not.toBeNull();
    expect(mesh.visible, 'no fireflies at midnight').toBe(true);
    expect(mesh.material.uniforms.uOpacity.value).toBeCloseTo(FIREFLY_OPACITY, 6);
    expect(mesh.material.uniforms.uColor.value.getHexString()).toBe(new THREE.Color(FIREFLY_COLOR).getHexString());
    expect(mesh.material.vertexShader, 'the vertex shader lacks the near fade').toContain(moteNearFadeGlsl('length(mv.xyz)'));
    expect(mesh.material.fragmentShader, 'the fragment shader does not apply the near fade').toMatch(/\*\s*vNear\b/);

    publishSkyFrame(sampleMood(0, NOON));
    await r.step(1);
    expect(mesh.visible, 'motes drawn by day').toBe(false);
    expect(mesh.material.uniforms.uOpacity.value).toBe(0);

    publishSkyFrame(sampleMood(2, MIDNIGHT));
    await r.step(1);
    expect(mesh.visible, 'motes drawn under the boss').toBe(false);
  });
});
