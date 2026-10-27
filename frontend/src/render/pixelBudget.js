// pixelBudget — the game canvas spends a PIXEL BUDGET per quality tier, not a pixel ratio (plan
// docs/superpowers/plans/2026-10-27-crafty-steady-cool.md, item a; masterpiece Phase 0g).
//
// The canvas used to be `dpr={[1, q.dprCap]}` with dprCap 2 at high: a 1728x1117 CSS window on an M3 Max drew 7.72 Mpx
// through every full-resolution pass (the scene, the composer's buffers, N8AO, SMAA, bloom, tone mapping), every frame,
// and Kevin heard it as fans at full speed. A ratio says nothing about cost — the same 2 is 0.6 Mpx on a phone and
// 14.7 Mpx on a 5K display — so each tier names the pixels it can afford (TIERS[tier].budgetPx) and the dpr is
// whatever spends that budget on this window, never above the tier cap or the screen's own ratio, never below 1.
import { useEffect, useState } from 'react';
import { TIERS } from './quality.js';

/** The cap the visual baselines were shot under. Capture keeps R3F's legacy `[1, 2]` range so the oracle does not move
 *  (the mobile frame is shot at deviceScaleFactor 2); the budget is a live-play heat change, not a look change. */
export const CAPTURE_DPR_CAP = 2;

/**
 * PURE. clamp(min(cap, devicePixelRatio, sqrt(budgetPx / cssPx)), 1, cap).
 * @param {{ tier: string, devicePixelRatio?: number, cssWidth: number, cssHeight: number }} s
 * @returns {number} the canvas pixel ratio
 */
export function pixelBudgetDpr({ tier, devicePixelRatio, cssWidth, cssHeight }) {
  const t = TIERS[tier] || TIERS.low;
  const cap = t.dprCap;
  const native = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const cssPx = cssWidth * cssHeight;
  const budget = cssPx > 0 ? Math.sqrt(t.budgetPx / cssPx) : cap;
  return Math.min(cap, Math.max(1, Math.min(cap, native, budget)));
}

const readViewport = () => ({
  devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
  cssWidth: typeof window !== 'undefined' ? window.innerWidth : 0,
  cssHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
});

/** The budget dpr for `tier` on the current window, recomputed on every resize (a window moved to another display
 *  fires one too) and on a tier change. A resize is a rare user action, so a React render per event is acceptable. */
export function usePixelBudgetDpr(tier) {
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    const onResize = () => setViewport(readViewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return pixelBudgetDpr({ tier, ...viewport });
}
