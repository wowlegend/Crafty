import { useContext } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposerContext } from '@react-three/postprocessing';
import { BloomEffect } from 'postprocessing';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';

// BloomSpikeDriver -- S1-D-M1 transient bloom-spike on spell impact, driven off the store's
// bloomSpikeUntil; eases the LIVE BloomEffect intensity peak->base, and CLAMPS it back to BLOOM_BASE
// every frame (so the <Bloom intensity> JSX prop alone is a no-op — the rendered base is set HERE).
// Capture-safe: never spikes in capture (deterministic baseline). Extracted VERBATIM from GameScene.jsx
// (v6 de-monolith A2.3); behavior unchanged. The live BloomEffect is reached via the composer context
// (ref-on-<Bloom> crashes the tree in @react-three/postprocessing@3.0.4 — circular-JSON on reconcile).
const BLOOM_BASE = 0.95;
const BLOOM_PEAK = 2.4;

/**
 * PURE. The BloomEffect the composer is rendering NOW. Resolved every frame (a handful of passes and effects), never
 * cached: this driver used to resolve it ONCE, and a low<->med tier step rebuilt Bloom (its mipmapBlur differs), so the
 * spike drove a disposed effect for the rest of the session (refute F8). render/postFx.jsx now builds Bloom once, and
 * this still follows whatever is live, so a future rebuild cannot strand it again.
 */
export function liveBloom(composer) {
  if (!composer) return null;
  for (const pass of composer.passes || []) {
    const effects = pass && pass.effects;
    if (!Array.isArray(effects)) continue;
    for (const e of effects) if (e instanceof BloomEffect) return e;
  }
  return null;
}

export const BloomSpikeDriver = () => {
  const ctx = useContext(EffectComposerContext);
  useFrame(() => {
    const fx = liveBloom(ctx && ctx.composer);
    if (!fx) return;
    if (isCaptureMode()) {
      // Deterministic baseline in capture — never spike (no spells in capture states).
      if (fx.intensity !== BLOOM_BASE) fx.intensity = BLOOM_BASE;
      return;
    }
    const until = useGameStore.getState().bloomSpikeUntil || 0;
    const remaining = until - performance.now();
    if (remaining > 0) {
      // Ease from peak -> base across the window (window seeded by triggerBloomSpike, ~80ms).
      const t = Math.min(1, remaining / 80);
      fx.intensity = BLOOM_BASE + (BLOOM_PEAK - BLOOM_BASE) * t;
    } else if (fx.intensity !== BLOOM_BASE) {
      // Settle smoothly back to baseline once the window has elapsed.
      fx.intensity = THREE.MathUtils.lerp(fx.intensity, BLOOM_BASE, 0.25);
      if (Math.abs(fx.intensity - BLOOM_BASE) < 0.01) fx.intensity = BLOOM_BASE;
    }
  });
  return null;
};
