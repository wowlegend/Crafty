// e2eDpr.js — THE E2E SUITE'S PIXEL-RATIO CAP, applied where both R3F canvases take their `dpr` (GameScene, TitleDiorama).
//
// WHY (2026-10-28). Every e2e spec runs on SwiftShader, a software rasteriser, and on CI's 4-vCPU runners a frame of
// the game at the suite's 1280x800 viewport took 126-219 ms (lightning.spec.js measured it; 59-67 ms at 640x400). Spec
// budgets written at local speed kept running out there — five specs in one session. The cost is per DRAWN PIXEL (the
// scene, the composer's buffers, SMAA, bloom, the title's MSAA), so the suite draws fewer of them: tests/e2e/_fixtures.js
// writes a cap on the page before it loads and every canvas hands R3F `capDpr(itsOwnDpr, cap)`. The CSS layout, the HUD,
// the viewport and every DOM coordinate stay exactly as they were; only the GL drawing buffer shrinks, and the browser
// scales it up to the same CSS box. Numbers, and which specs opt out and why: the note atop frontend/playwright.config.js.
//
// A CAP ON WHAT THE CANVAS ASKS FOR, never a ratio of its own: it wraps whatever expression a canvas already computes
// (a tier range, a perf-probe pin, a pixel budget), so a later change to that expression keeps the cap without knowing
// about it. DEV-only: production never reads the page global, and a session without the fixture's cap is untouched.

/**
 * PURE. `dpr` as R3F's Canvas takes it — a number, or a [min, max] range R3F resolves as
 * min(max(min, devicePixelRatio), max) — with neither end above `cap`. A cap that is not a finite positive number is no cap.
 * @param {number | [number, number]} dpr
 * @param {unknown} cap
 * @returns {number | [number, number]}
 */
export function capDpr(dpr, cap) {
  if (typeof cap !== 'number' || !Number.isFinite(cap) || !(cap > 0)) return dpr;
  if (Array.isArray(dpr)) return [Math.min(dpr[0], cap), Math.min(dpr[1], cap)];
  return Math.min(dpr, cap);
}

/** `dpr` under the cap the e2e fixture writes on the page (`window.__craftyE2eDprCap`); unchanged everywhere else. */
export function e2eDpr(dpr) {
  if (!import.meta.env.DEV) return dpr;
  return capDpr(dpr, globalThis.__craftyE2eDprCap);
}
