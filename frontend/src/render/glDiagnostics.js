// glDiagnostics.js — the facts the Show Stats (F3) readout names, readable in the PRODUCTION build: the GL renderer,
// the pixel ratio actually in force, and how many times this session the browser took the WebGL context away.
//
// WHY IT EXISTS (plan docs/superpowers/plans/2026-10-27-crafty-instruments.md). The heat and iPad work argues about
// tiers, pixel ratios and context losses, and until this the shipped game could not say any of them: the readout drew
// frames per second and nothing else, and the context-loss handlers set one boolean that nothing read (a flag, not a
// count, inside a closure no test could reach). The handlers live here now, unchanged in effect, so a gate can drive
// them on a real EventTarget, and they count.
//
// Module state, deliberately: one game canvas per page, and the count is per SESSION (a second loss reads 2, which a
// store boolean cannot say). Nothing here runs per frame; FrameStats reads it at 4 Hz while it is shown.

let _losses = 0;
let _gl = null;
let _renderer = null;

/**
 * The GL renderer string for a WebGL context: the UNMASKED renderer when the debug extension exists (Chrome and
 * Safari name the GPU there), else the plain RENDERER, else 'unknown'. Never throws — a lost context throws or
 * returns null from getParameter, and a diagnostics readout must not take the game down with it.
 */
export function rendererString(ctx) {
  if (!ctx) return 'unknown';
  try {
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    const s = ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER);
    return typeof s === 'string' && s.length > 0 ? s : 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Listen for context loss and restore on the game canvas. A loss is preventDefault()ed — that is what tells the
 * browser the page will handle a restore; without it the context is gone for good — counted, and flagged on the
 * store (`isWebGLContextLost`). Returns a detach function.
 *
 * `handlers.lost` / `handlers.restored`, when given, replace the plain store-flag writes: GameScene passes
 * game/contextRecovery.js's onContextLost (also releases a locked pointer) and onContextRestored (asks for a shadow
 * render, and clears the flag only once three has drawn). The preventDefault, the count and the renderer reset stay
 * here either way, so the readout cannot lose a loss the recovery handles.
 */
export function watchContextLoss(canvas, store, handlers = {}) {
  const onLost = (e) => {
    e.preventDefault();
    _losses += 1;
    console.error('WebGL context lost detected in GameScene!');
    if (handlers.lost) handlers.lost();
    else store.getState().setIsWebGLContextLost(true);
  };
  const onRestored = () => {
    if (import.meta.env.DEV) console.log('WebGL context successfully restored in GameScene.');
    _renderer = null; // read the GPU name again: a restore can land on another GPU, and a read made while lost may have failed
    if (handlers.restored) handlers.restored();
    else store.getState().setIsWebGLContextLost(false);
  };
  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);
  return () => {
    canvas.removeEventListener('webglcontextlost', onLost, false);
    canvas.removeEventListener('webglcontextrestored', onRestored, false);
  };
}

/** WebGL context losses seen this session. */
export function contextLossCount() {
  return _losses;
}

/** Record the game's WebGLRenderer (GameScene's onCreated). Its renderer string is read lazily, once. */
export function trackRenderer(gl) {
  _gl = gl;
  _renderer = null;
}

/**
 * The tracked renderer's GL string, read lazily. A read that came back 'unknown' (a lost or not-yet-ready context) is
 * NOT kept, so the next call reads again and a name read while the context was lost cannot stick for the session; a
 * context restore forgets the name too (watchContextLoss). 'unknown' before the Canvas exists. Both the Show Stats
 * readout (render/FrameStats.jsx) and glInfo read it here, so they cannot disagree.
 */
export function trackedRenderer() {
  if (!_gl) return 'unknown';
  if (_renderer === null || _renderer === 'unknown') _renderer = rendererString(_gl.getContext());
  return _renderer;
}

/** The tracked renderer's string, the pixel ratio IN FORCE now, and the canvas size in device pixels; null before the
 *  Canvas exists. The lookbook seam (render/lookbookSeam.js) records this per shot. */
export function glInfo() {
  if (!_gl) return null;
  return { renderer: trackedRenderer(), dpr: _gl.getPixelRatio(), canvas: [_gl.domElement.width, _gl.domElement.height] };
}

/**
 * PURE. The readout's lines. The frame count is ALSO published as the element's `data-fps` attribute
 * (render/FrameStats.jsx), which is what tests/e2e/frame-cap.spec.js reads: the first line's wording is localised
 * ("60 帧/秒（实际绘制）" does not match an English /^(\d+) FPS/), so no test parses the text for the number. Every label goes
 * through `t` (i18n), called with a LITERAL key so src/i18n/keyReachability.js sees each key used.
 * `capFps` is the store's real frame cap (it is shown when `capActive`; a test can set one the setting never admits).
 * @param {{fps:number, ms:number|null, tier:string, dpr:number, renderer:string, losses:number, capActive:boolean, capFps:number}} d
 * @param {(key:string, vars?:object) => string} t
 * @returns {string[]}
 */
export function diagnosticsLines({ fps, ms, tier, dpr, renderer, losses, capActive, capFps }, t) {
  const tierNames = { low: t('diag.tierLow'), med: t('diag.tierMed'), high: t('diag.tierHigh') };
  const tierName = tierNames[tier] ?? String(tier);
  const cap = capActive ? t('diag.capFps', { fps: capFps }) : t('panel.frameRateUncapped');
  return [
    t('diag.fpsDrawn', { fps }) + (ms === null ? '' : ` · ${ms} ms`),
    `${t('diag.tier')} ${tierName} · ${t('diag.dpr')} ${Number(dpr).toFixed(2)} · ${t('diag.frameCap')} ${cap}`,
    `${t('diag.gpu')} ${renderer}`,
    `${t('diag.contextLosses')} ${losses}`,
  ];
}

/** Test-only: forget the session's count and renderer. */
export function _resetGlDiagnosticsForTest() {
  _losses = 0;
  _gl = null;
  _renderer = null;
}
