// postFx — the post-processing chain's lifetime helpers (plan docs/superpowers/plans/2026-10-27-crafty-steady-cool.md,
// items b and c). The chain itself is still declared in GameScene.jsx (PostFX), because the effect-chain gates read it
// there; this file holds what that declaration cannot express.
import { useContext, useEffect, useMemo, useState } from 'react';
import { Vector2 } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposerContext } from '@react-three/postprocessing';
import { BloomEffect, GodRaysEffect } from 'postprocessing';
import { registerTestHook } from '../devtest/testBridge.js';
import { useGameStore } from '../store/useGameStore';
import { TIERS } from './quality.js';
import { lookbookPassesOff } from './lookbookState.js';
import { applyPassesOff } from './passesOff.js';
import { getViewmodel, oneDepthCopy } from './viewmodel.js';

/**
 * ITEM c — EACH EFFECT BUILT ONCE, TOGGLED IN PLACE, DISPOSED ON UNMOUNT.
 *
 * What the package did (read in the installed dist): its GodRays wrapper builds `new GodRaysEffect(...)` in a memo
 * keyed on the props OBJECT — a new effect on every render of the element — and renders it as a `primitive` with
 * `dispose: null`; R3F never disposes primitives and the composer's removePass disposes nothing. So every sunrise (the
 * horizon gate mounted it), every tier step and every PostFX re-render in daylight left a GodRaysEffect's render
 * targets and depth texture allocated: GPU memory that grows over a long session, which on an iPad ends in a lost
 * context. And `mipmapBlur` differing low/med rebuilt Bloom. Every one of those mounts also changed the composer's
 * children, which rebuilds every EffectPass and deletes and re-creates the composer's depth texture.
 *
 * Now the two components below carry the package's names and build their effect ONCE PER MOUNT from their first
 * props, render it as a primitive, and dispose it on unmount. GameScene mounts GodRays the first time a tier needs it
 * (a sticky flag: on an iPad that never leaves low, never) and keeps it mounted. PostTierDriver toggles the live
 * instances in place — GodRays through a gate that skips its render work and zeroes its blend opacity (a uniform: no
 * recompile), Bloom through its mipmap pass plus the map uniform its composite samples. PostFX no longer receives the tier or the horizon flag, so a tier step or a
 * horizon flip re-renders no composer child.
 */

/** Construction counts, for the DEV read path (the post-fx e2e asserts they stay flat across tier steps). */
export const postFxBuilds = { bloom: 0, godRays: 0 };

/**
 * GodRays with a gate. postprocessing calls an effect's update() "even if the blend function is set to SKIP"
 * (Effect.update's own doc), and GodRays' update renders the light scene, the radial blur and a Kawase blur — so SKIP
 * would hide the shafts and keep paying for them, and changing the blend FUNCTION recompiles the merged pass. Gated,
 * update() returns at once and the blend OPACITY is 0, a uniform the merged shader already reads.
 */
export class GatedGodRaysEffect extends GodRaysEffect {
  constructor(camera, lightSource, options) {
    super(camera, lightSource, options);
    this.gated = false;
    postFxBuilds.godRays += 1;
  }
  update(renderer, inputBuffer, deltaTime) {
    if (this.gated) return;
    super.update(renderer, inputBuffer, deltaTime);
  }
}

/** Bloom, built once per mount from its first props. Its mipmap blur is the driver's (setBloomMipmap), not a prop. */
export function useBloomOnce(props) {
  const [bloom] = useState(() => {
    postFxBuilds.bloom += 1;
    return new BloomEffect({ ...props, mipmapBlur: true });
  });
  useEffect(() => () => bloom.dispose(), [bloom]);
  return bloom;
}

/** GodRays, built once per mount (the sun mesh arrives once, at boot, before this mounts). */
export function useGodRaysOnce({ sun, ...options }) {
  const camera = useThree((s) => s.camera);
  const [fx] = useState(() => new GatedGodRaysEffect(camera, sun, options));
  useEffect(() => () => fx.dispose(), [fx]);
  return fx;
}

export function Bloom(props) {
  return <primitive object={useBloomOnce(props)} dispose={null} />;
}
export function GodRays(props) {
  return <primitive object={useGodRaysOnce(props)} dispose={null} />;
}

/** Gate or ungate GodRays. Write-on-change. @returns {boolean} true when it changed */
export function setGodRaysOn(fx, on) {
  if (!fx || fx.gated === !on) return false;
  fx.gated = !on;
  fx.blendMode.opacity.value = on ? 1 : 0;
  return true;
}

/** Switch Bloom between its mipmap blur and its Kawase blur, and point the composite at the one that runs (the
 *  constructor is the only place postprocessing sets that uniform). Write-on-change. */
export function setBloomMipmap(bloom, on) {
  if (!bloom || bloom.mipmapBlurPass.enabled === on) return false;
  bloom.mipmapBlurPass.enabled = on;
  bloom.uniforms.get('map').value = bloom.texture;
  return true;
}

/** Apply a tier's post settings and the horizon to the live effects. @returns {boolean} true when anything changed */
export function applyPostTier(fx, q, sunAboveHorizon) {
  let changed = false;
  if (fx.godRays) {
    if (setGodRaysOn(fx.godRays, !!q.godRays && !!sunAboveHorizon)) changed = true;
    if (q.godRaySamples > 0 && fx.godRays.samples !== q.godRaySamples) {
      fx.godRays.samples = q.godRaySamples;
      changed = true;
    }
  }
  if (setBloomMipmap(fx.bloom, !!q.bloomMipmap)) changed = true;
  return changed;
}

/** PURE. The live instances in the composer's passes — found, never cached, so a rebuilt chain is always followed. */
export function liveEffects(composer, out = { godRays: null, bloom: null }) {
  out.godRays = null;
  out.bloom = null;
  if (!composer) return out;
  for (const pass of composer.passes || []) {
    const effects = pass && pass.effects;
    if (!Array.isArray(effects)) continue;
    for (const e of effects) {
      if (e instanceof GatedGodRaysEffect) out.godRays = e;
      else if (e instanceof BloomEffect) out.bloom = e;
    }
  }
  return out;
}

/**
 * Mount inside <EffectComposer>. Each frame: find the live effects and apply the tier and the horizon, and keep the
 * composer to one depth copy a frame (render/viewmodel.js oneDepthCopy) — transient
 * getState() reads (Game-Loop Isolation), and write-on-change, so an unchanged frame costs a few comparisons. Per frame
 * rather than in an effect because the composer builds its passes in ITS layout effect, after its children's, and a
 * sticky first mount (GodRays) arrives with defaults that must be corrected before it draws.
 */
export function PostTierDriver() {
  const ctx = useContext(EffectComposerContext);
  const gl = useThree((s) => s.gl);
  const fx = useMemo(() => ({ godRays: null, bloom: null }), []);
  const offHeld = useMemo(() => new Map(), []);
  useFrame(() => {
    const st = useGameStore.getState();
    liveEffects(ctx && ctx.composer, fx);
    applyPostTier(fx, TIERS[st.qualityTier] || TIERS.low, st.sunAboveHorizon);
    applyPassesOff(ctx && ctx.composer, lookbookPassesOff(), offHeld);
    oneDepthCopy(ctx && ctx.composer, getViewmodel().pass);
  });
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // DEV-only: the post-fx e2e reads the construction counts and the live toggles.
    registerTestHook('readPostFx', () => {
      const live = liveEffects(ctx && ctx.composer);
      return {
        builds: { ...postFxBuilds },
        godRays: live.godRays ? !live.godRays.gated : null,
        bloomMipmap: live.bloom ? live.bloom.mipmapBlurPass.enabled : null,
        // The LIVE threshold (BloomEffect keeps it on its luminance material; the prop is only the first value), for the
        // light-colour plan's bloom grammar (read through Atmosphere's readSkyLight).
        bloomThreshold: live.bloom ? live.bloom.luminanceMaterial.threshold : null,
        // The live composer's passes in the order it runs them (tests/e2e/viewmodel.spec.js: the hands right after the world).
        passes: ctx && ctx.composer ? ctx.composer.passes.map((p) => p.name) : null,
        // three's live counters: textures/geometries resident on the GPU, programs linked.
        textures: gl ? gl.info.memory.textures : null,
        programs: gl && gl.info.programs ? gl.info.programs.length : null,
      };
    });
  }, [ctx, gl]);
  return null;
}

/**
 * ITEM b — THE COMPOSER FOLLOWS THE PIXEL RATIO. @react-three/postprocessing 3.0.4 resizes its composer in an effect
 * keyed on R3F's CSS `size` only (dist/index.js, the composer component's `setSize(x.width, x.height)` effect on
 * `[c, x]`), so a pixel-ratio change at the same CSS size — every pixel-budget tier step, and a window moved to another
 * display — left every composer buffer at the old resolution. postprocessing's EffectComposer.setSize sizes its buffers
 * and passes from `renderer.getDrawingBufferSize`, so calling it with no arguments is the whole fix.
 *
 * PURE apart from the resize it performs. Compares the composer's buffer with the renderer's drawing buffer — the
 * invariant itself, not a remembered ratio — so any path that changes either (R3F's setDpr, a CSS resize the package
 * has not handled yet) is caught.
 * @returns {boolean} true when it resized
 */
export function syncComposerToPixelRatio(composer, gl, v) {
  if (!composer || !composer.inputBuffer || !gl) return false;
  gl.getDrawingBufferSize(v);
  const b = composer.inputBuffer;
  if (b.width === v.x && b.height === v.y) return false;
  composer.setSize();
  return true;
}

/** Mount inside <EffectComposer>: one size comparison per frame, a resize only when the buffers are stale. Runs at the
 *  default priority, so it precedes the composer's own render (priority 1) in the same frame. */
export function ComposerPixelRatioSync() {
  const ctx = useContext(EffectComposerContext);
  const gl = useThree((s) => s.gl);
  const v = useMemo(() => new Vector2(), []);
  useFrame(() => {
    syncComposerToPixelRatio(ctx && ctx.composer, gl, v);
  });
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // DEV-only (the bridge is tree-shaken in prod): the composer-dpr e2e reads the composer's buffer against the canvas.
    registerTestHook('readComposerSize', () => {
      const c = ctx && ctx.composer;
      return {
        input: c ? [c.inputBuffer.width, c.inputBuffer.height] : null,
        canvas: [gl.domElement.width, gl.domElement.height],
        pixelRatio: gl.getPixelRatio(),
        css: [window.innerWidth, window.innerHeight],
        devicePixelRatio: window.devicePixelRatio,
      };
    });
  }, [ctx, gl]);
  return null;
}
