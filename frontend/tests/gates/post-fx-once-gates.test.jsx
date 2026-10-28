// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { BloomEffect, GodRaysEffect, EffectPass } from 'postprocessing';
import { renderHook, render } from '@testing-library/react';

/**
 * POST EFFECTS BUILT ONCE, TOGGLED IN PLACE, DISPOSED (plan 2026-10-27-crafty-steady-cool, item c; refute F8).
 *
 * Read in the installed packages: @react-three/postprocessing's GodRays wrapper builds `new GodRaysEffect(...)` in a
 * memo keyed on its props OBJECT and renders it as a `primitive` with `dispose: null`; R3F never disposes primitives,
 * and the composer's removePass disposes nothing. So every sunrise (the horizon gate mounted it), every tier step and
 * every PostFX re-render in daylight left a GodRaysEffect's render targets allocated. N8AO was a primitive too (the same
 * on every low<->med step), `mipmapBlur` differing low/med rebuilt Bloom, and BloomSpikeDriver kept driving the first
 * Bloom it found.
 *
 * Now each effect is built once per mount and disposed on unmount, GameScene keeps them mounted, and a per-frame driver
 * toggles the LIVE instances in place. This drives the REAL postprocessing classes; nothing here models them.
 * BLIND SPOT: that GameScene's PostFX no longer re-renders on a tier step (its props) is the e2e's
 * (tests/e2e/post-fx-once.spec.js, construction counts across 20 tier steps).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/render/postFx.jsx and src/render/BloomSpikeDriver.jsx, receipts in
 * the commit:
 *   F1 plausible-wrong: Bloom built in a memo keyed on its props object (the upstream GodRays shape) -> RED expected
 *   F2 plausible-wrong: GodRays gated through its blend FUNCTION (SKIP): a recompile                  -> RED expected
 *   F3 the gated GodRays update() not skipped                                                       -> RED expected
 *   F4 plausible-wrong: Bloom's mipmap toggled without re-pointing its map                           -> RED expected
 *   F5 the unmount dispose dropped (Bloom)                                                          -> RED expected
 *   F6 BloomSpikeDriver latches the first Bloom it finds (the old driver)                            -> RED expected
 *   F7 applyPostTier ignores the horizon                                                            -> RED expected
 *   F8 the driver caches the first instances it finds instead of following the live ones             -> RED expected
 *   F0 identity (a comment edit)                                                                    -> must SURVIVE
 */

let threeState;
const frameCallbacks = [];
vi.mock('@react-three/fiber', async (orig) => ({
  ...(await orig()),
  useThree: (sel) => sel(threeState),
  useFrame: (cb) => { frameCallbacks.push(cb); },
}));

const {
  postFxBuilds, useBloomOnce, useGodRaysOnce, applyPostTier, setGodRaysOn, setBloomMipmap, liveEffects, PostTierDriver,
} = await import('../../src/render/postFx.jsx');
const { BloomSpikeDriver, liveBloom } = await import('../../src/render/BloomSpikeDriver.jsx');
const { TIERS } = await import('../../src/render/quality.js');
const { EffectComposerContext } = await import('@react-three/postprocessing');
const { useGameStore } = await import('../../src/store/useGameStore');

const BLOOM = { intensity: 0.95, luminanceThreshold: 0.65, luminanceSmoothing: 0.25 };
const RAYS = { density: 0.97, decay: 0.95, weight: 1.1, exposure: 0.88, clampMax: 1, blur: true };
const sunMesh = () => new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial());
const built = () => {
  const sun = sunMesh();
  return {
    bloom: renderHook(() => useBloomOnce({ ...BLOOM })).result.current,
    godRays: renderHook(() => useGodRaysOnce({ sun, ...RAYS })).result.current,
  };
};

beforeEach(() => {
  threeState = { camera: new THREE.PerspectiveCamera(), scene: new THREE.Scene(), invalidate: () => {} };
  frameCallbacks.length = 0;
});

describe('each effect is built once per mount, with the look it had, and disposed on unmount', () => {
  it('re-renders with fresh props objects construct nothing — the upstream GodRays rebuilt on every render', () => {
    const sun = sunMesh();
    const c0 = { ...postFxBuilds };
    const b = renderHook(() => useBloomOnce({ ...BLOOM }));
    const g = renderHook(() => useGodRaysOnce({ sun, ...RAYS }));
    const first = [b.result.current, g.result.current];
    for (let i = 0; i < 10; i++) { b.rerender(); g.rerender(); }
    expect([b.result.current, g.result.current], 'a re-render built a new effect').toEqual(first);
    expect(first.map((x) => x === undefined || x === null), 'SETUP: an effect was not built').toEqual([false, false]);
    const c1 = { ...postFxBuilds };
    expect([c1.bloom - c0.bloom, c1.godRays - c0.godRays], '[bloom, godRays] constructions').toEqual([1, 1]);
  });

  it('the built effects carry the chain look (the props the package wrappers applied)', () => {
    const fx = built();
    expect(fx.bloom.luminanceMaterial.threshold).toBeCloseTo(0.65, 6);
    expect(fx.bloom.intensity).toBeCloseTo(0.95, 6);
    expect(fx.godRays.godRaysMaterial.density).toBeCloseTo(0.97, 6);
    expect(fx.godRays).toBeInstanceOf(GodRaysEffect);
  });

  it('unmount disposes every effect it built', () => {
    const sun = sunMesh();
    const hooks = [
      renderHook(() => useBloomOnce({ ...BLOOM })),
      renderHook(() => useGodRaysOnce({ sun, ...RAYS })),
    ];
    const spies = hooks.map((h) => vi.spyOn(h.result.current, 'dispose'));
    hooks.forEach((h) => h.unmount());
    expect(spies.map((s) => s.mock.calls.length), '[bloom, godRays] dispose calls').toEqual([1, 1]);
  });
});

describe('applyPostTier — a tier step or a horizon flip toggles in place', () => {
  it('GodRays follows the tier AND the horizon; Bloom follows the tier mipmap', () => {
    const fx = built();
    applyPostTier(fx, TIERS.low, true);
    expect([fx.godRays.gated, fx.bloom.mipmapBlurPass.enabled]).toEqual([true, false]);
    applyPostTier(fx, TIERS.med, true);
    expect([fx.godRays.gated, fx.bloom.mipmapBlurPass.enabled]).toEqual([false, true]);
    applyPostTier(fx, TIERS.high, false);
    expect(fx.godRays.gated, 'night must gate the god rays (three.js#18446, and shafts at night are wrong)').toBe(true);
    expect(fx.godRays.blendMode.opacity.value, 'a gated GodRays still blends').toBe(0);
    applyPostTier(fx, TIERS.high, true);
    expect(fx.godRays.blendMode.opacity.value).toBe(1);
    expect(fx.godRays.samples).toBe(TIERS.high.godRaySamples);
  });

  it('writes on change only: re-applying the same state reports no change', () => {
    const fx = built();
    applyPostTier(fx, TIERS.low, true);
    expect(applyPostTier(fx, TIERS.med, true), 'a low -> med step changed nothing').toBe(true);
    expect(applyPostTier(fx, TIERS.med, true), 'an unchanged tier re-wrote the chain').toBe(false);
  });

  it('gating GodRays never recompiles the merged pass, and its own render work is skipped while gated', () => {
    const fx = built();
    const pass = new EffectPass(threeState.camera, fx.godRays, fx.bloom);
    const recompile = vi.spyOn(pass, 'recompile');
    const inner = vi.spyOn(GodRaysEffect.prototype, 'update').mockImplementation(() => {});
    setGodRaysOn(fx.godRays, false);
    setGodRaysOn(fx.godRays, true);
    setGodRaysOn(fx.godRays, false);
    expect(recompile, 'a horizon flip recompiled the merged shader').not.toHaveBeenCalled();
    fx.godRays.update({}, {}, 0.016);
    expect(inner, 'a gated GodRays still rendered its light pass and blur').not.toHaveBeenCalled();
    setGodRaysOn(fx.godRays, true);
    fx.godRays.update({}, {}, 0.016);
    expect(inner, 'an ungated GodRays did not render').toHaveBeenCalledTimes(1);
    inner.mockRestore();
  });

  it("Bloom's composite samples the blur that is actually running", () => {
    const fx = built();
    setBloomMipmap(fx.bloom, false);
    expect(fx.bloom.uniforms.get('map').value, 'kawase: the map is not the kawase target').toBe(fx.bloom.renderTarget.texture);
    setBloomMipmap(fx.bloom, true);
    expect(fx.bloom.uniforms.get('map').value, 'mipmap: the map is not the mipmap texture').toBe(fx.bloom.mipmapBlurPass.texture);
    expect(fx.bloom.renderTarget.texture).not.toBe(fx.bloom.mipmapBlurPass.texture); // the two cases are distinguishable
  });
});

describe('the drivers follow the LIVE effects in the composer', () => {
  const composerOf = (fx) => ({ passes: [{ name: 'RenderPass' }, { effects: [fx.godRays, new THREE.Object3D(), fx.bloom] }] });

  it('liveEffects finds each instance among the passes', () => {
    const fx = built();
    expect(liveEffects(composerOf(fx))).toEqual(fx);
    expect(liveEffects(null)).toEqual({ godRays: null, bloom: null });
    expect(liveBloom(composerOf(fx))).toBe(fx.bloom);
  });

  it('PostTierDriver applies the store tier and horizon each frame, to whatever is live NOW', () => {
    const fx = built();
    const composer = composerOf(fx);
    useGameStore.setState({ qualityTier: 'low', sunAboveHorizon: true });
    render(<EffectComposerContext.Provider value={{ composer }}><PostTierDriver /></EffectComposerContext.Provider>);
    expect(frameCallbacks.length, 'SETUP: the driver registered no frame callback').toBe(1);
    frameCallbacks[0]();
    expect([fx.godRays.gated, fx.bloom.mipmapBlurPass.enabled]).toEqual([true, false]);
    useGameStore.setState({ qualityTier: 'high', sunAboveHorizon: false });
    const fresh = built(); // a rebuilt chain: new instances, default (ungated) state
    composer.passes = composerOf(fresh).passes;
    frameCallbacks[0]();
    expect(fresh.godRays.gated, 'the driver kept toggling the old instances').toBe(true);
    expect(fresh.bloom.mipmapBlurPass.enabled).toBe(true);
  });

  it('a spike after the chain is rebuilt drives the NEW Bloom — the old driver latched the first one it found', () => {
    const a = new BloomEffect({ intensity: 0.95 });
    const composer = { passes: [{ effects: [a] }] };
    render(<EffectComposerContext.Provider value={{ composer }}><BloomSpikeDriver /></EffectComposerContext.Provider>);
    expect(frameCallbacks.length, 'SETUP: the driver registered no frame callback').toBe(1);
    frameCallbacks[0]();
    const b = new BloomEffect({ intensity: 0.95 });
    composer.passes = [{ effects: [b] }]; // a tier step rebuilt the chain
    useGameStore.setState({ bloomSpikeUntil: performance.now() + 60 });
    frameCallbacks[0]();
    expect(b.intensity, 'the spike went to the disposed Bloom').toBeGreaterThan(1.5);
    expect(a.intensity, 'the dead Bloom was driven').toBe(0.95);
  });
});
