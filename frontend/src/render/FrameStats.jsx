// FrameStats — the Settings "Show Stats" readout: frames DRAWN per second, and the frame time between them.
//
// It replaced drei's <Stats> (stats.js) under the frame cap (render/FrameCap.jsx; review #2). stats.js counts R3F's
// global before/after effects, which run on EVERY iteration of R3F's loop — and under the cap the loop runs an empty
// iteration after most drawn frames (@react-three/rapier invalidates from inside the step that advance() runs, which
// restarts the loop, and the next skipped tick leaves it nothing to draw). So a capped M3 Max read ~120 "FPS" while it
// drew 60: the one readout a player would use to check the cap said the cap had failed. This counts useFrame calls —
// one per frame actually drawn, whichever loop drew it.
//
// DIAGNOSTICS (plan 2026-10-27-crafty-instruments, part b): three more lines under the frame count — the quality tier,
// the pixel ratio IN FORCE (the governor and AdaptiveDpr move it at runtime), the frame cap, the GL renderer, and the
// session's WebGL context losses. It is the one surface the PRODUCTION build offers for these, and Settings > Show
// Stats reaches it by touch on an iPad. All transient reads at the existing 4 Hz text refresh; the renderer string
// is read once it is known (render/glDiagnostics.js trackedRenderer). The lines and their labels are built in
// render/glDiagnostics.js (pure, i18n'd, gated). The frame count is also published as the element's `data-fps`, which
// is what tests/e2e/frame-cap.spec.js reads: the text is localised, so no test parses it for the number.
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGameStore } from '../store/useGameStore';
import { t } from '../i18n/i18n.js';
import { trackedRenderer, contextLossCount, diagnosticsLines } from './glDiagnostics.js';

/** PURE: the readout for frames drawn at `times` (ms, ascending) inside a window ending at `now`. */
export function frameReadout(times, now, windowMs = 1000) {
  const recent = times.filter((t) => now - t < windowMs); // strict: an inclusive edge counts a frame twice
  const fps = Math.round((recent.length * 1000) / windowMs);
  if (recent.length < 2) return { fps, ms: null };
  const ms = (recent[recent.length - 1] - recent[0]) / (recent.length - 1);
  return { fps, ms: Math.round(ms * 10) / 10 };
}

/** @param {{ capActive: boolean }} props  whether the frame cap is in force (GameScene's own `capActive`). */
export function FrameStats({ capActive }) {
  const gl = useThree((s) => s.gl);
  const state = useMemo(() => ({ times: [], el: null, shown: 0 }), []);
  useEffect(() => {
    const el = document.createElement('div');
    el.dataset.testid = 'frame-stats';
    Object.assign(el.style, {
      position: 'fixed', top: '0', left: '0', zIndex: '10000', pointerEvents: 'none',
      font: '11px/1.3 ui-monospace, monospace', color: '#ECECEF', background: 'rgba(8, 10, 14, 0.78)', padding: '4px 7px',
      // Four lines; the renderer string is long (ANGLE names the driver), so it wraps rather than leaves the screen.
      whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxWidth: 'calc(100vw - 16px)',
    });
    document.body.appendChild(el);
    state.el = el;
    return () => { el.remove(); state.el = null; };
  }, [state]);
  useFrame(() => {
    const now = performance.now();
    state.times.push(now);
    while (state.times.length && now - state.times[0] > 1000) state.times.shift();
    if (state.el && now - state.shown >= 250) {
      state.shown = now;
      const r = frameReadout(state.times, now);
      const s = useGameStore.getState();
      state.el.dataset.fps = String(r.fps);
      state.el.textContent = diagnosticsLines({
        fps: r.fps, ms: r.ms, tier: s.qualityTier, dpr: gl.getPixelRatio(), renderer: trackedRenderer(),
        losses: contextLossCount(), capActive: !!capActive, capFps: s.frameCap,
      }, t).join('\n');
    }
  });
  return null;
}
