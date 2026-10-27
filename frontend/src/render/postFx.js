// postFx — the post-processing chain's lifetime helpers (plan docs/superpowers/plans/2026-10-27-crafty-steady-cool.md,
// items b and c). The chain itself is still declared in GameScene.jsx (PostFX), because the effect-chain gates read it
// there; this file holds what that declaration cannot express.
import { useContext, useEffect, useMemo } from 'react';
import { Vector2 } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposerContext } from '@react-three/postprocessing';
import { registerTestHook } from '../devtest/testBridge.js';

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
