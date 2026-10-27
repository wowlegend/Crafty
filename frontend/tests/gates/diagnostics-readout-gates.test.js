import { describe, it, expect, afterEach } from 'vitest';
import {
  rendererString,
  watchContextLoss,
  contextLossCount,
  trackRenderer,
  glInfo,
  trackedRenderer,
  diagnosticsLines,
  _resetGlDiagnosticsForTest,
} from '../../src/render/glDiagnostics.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { t } from '../../src/i18n/i18n.js';

/**
 * THE DIAGNOSTICS READOUT (plan docs/superpowers/plans/2026-10-27-crafty-instruments.md, part b). The Show Stats (F3)
 * overlay is the one surface a player — or Kevin, on his iPad — can open in the PRODUCTION build, so it is where the
 * facts the heat and iPad work argue about have to be readable: the quality tier, the pixel ratio actually in force,
 * the GL renderer, how many times the browser took the WebGL context away, and whether the frame cap is on.
 *
 * Driven here: the renderer read against fake contexts of both shapes (the debug extension present and absent, and a
 * context that throws), the context-loss listener on a real EventTarget with the REAL store (the count, the
 * preventDefault that lets the browser restore the context, the flag), and the pure line builder in BOTH locales —
 * through the real t(), so a missing translation shows as the raw key.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, 10 tests, one batch, each observed RED unless stated:
 *   D1 the debug extension ignored (RENDERER only) -> "reads the UNMASKED renderer", "glInfo reports the tracked renderer"
 *   D2 plausible-wrong: the loss not preventDefault()ed -> "a loss on the real canvas listener ..."
 *   D3 plausible-wrong: the count is a flag (`_losses = 1`) -> "a second loss must read 2"
 *   D4 plausible-wrong: dpr to one place -> all three readout-line tests
 *   D5 the cap label inverted -> all three readout-line tests
 *   D6 plausible-wrong: med shows as High -> "each field follows its input"
 *   D7 detach leaves the loss listener on -> "a detached listener still counted"
 *   D8 a restore re-sets the flag -> the listener test
 *   D9 plausible-wrong: an empty renderer string passes through -> "never returns an empty answer"
 *   D10 the zh-CN 'diag.tierHigh' translation deleted (strings.js) -> "Chinese: every label is translated"
 *   F6a the cap line back to the fixed panel.frameRateCapped ("60 FPS") -> "the cap line shows the cap IN FORCE"
 *   F6b plausible-wrong: the cap number fixed at 60 in the diag.capFps label -> the same test
 *   F4a an 'unknown' renderer name kept for the session (the pre-fix cache) -> "a name read while the context was lost ... is NOT kept"
 *   F4b a context restore does not forget the name -> "a context restore forgets the name"
 *   I0 identity (a comment edit in glDiagnostics.js) SURVIVED.
 *
 * BLIND SPOT: nothing here mounts GameScene, so that `onCreated` really calls watchContextLoss and trackRenderer, and
 * that FrameStats really shows these lines, is the e2e's job (tests/e2e/lookbook-seam.spec.js: F3, then
 * WEBGL_lose_context.loseContext() on the live canvas, read back from the readout and from the seam).
 */

const UNMASKED = 0x9246; // WEBGL_debug_renderer_info.UNMASKED_RENDERER_WEBGL
const RENDERER = 0x1f01; // gl.RENDERER

/** A WebGL context stand-in: `unmasked` is what the debug extension reports, `basic` what RENDERER reports. */
function fakeCtx({ unmasked = null, basic = 'WebKit WebGL', extension = true, throws = false } = {}) {
  const calls = [];
  return {
    calls,
    RENDERER,
    getExtension: (name) => (extension && name === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: UNMASKED } : null),
    getParameter: (p) => {
      calls.push(p);
      if (throws) throw new Error('context lost');
      if (p === UNMASKED) return unmasked;
      if (p === RENDERER) return basic;
      return null;
    },
  };
}

const ANGLE_METAL = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)';

afterEach(() => {
  _resetGlDiagnosticsForTest();
  useGameStore.setState({ locale: 'en', isWebGLContextLost: false });
});

describe('the GL renderer string', () => {
  it('reads the UNMASKED renderer when the debug extension exists, and RENDERER when it does not', () => {
    expect(rendererString(fakeCtx({ unmasked: ANGLE_METAL }))).toBe(ANGLE_METAL);
    // Firefox-style or privacy-hardened: no extension, so the plain RENDERER is the best available answer.
    expect(rendererString(fakeCtx({ extension: false, basic: 'Mali-G78' }))).toBe('Mali-G78');
  });
  it('never throws and never returns an empty answer — a lost context or a missing one reads "unknown"', () => {
    expect(rendererString(fakeCtx({ throws: true }))).toBe('unknown');
    expect(rendererString(null)).toBe('unknown');
    expect(rendererString(fakeCtx({ unmasked: '' }))).toBe('unknown');
  });
  it('a name read while the context was lost ("unknown") is NOT kept: the next read asks again (F4)', () => {
    expect(trackedRenderer(), 'before any renderer is tracked').toBe('unknown');
    let lost = true;
    const ctx = {
      ...fakeCtx({ unmasked: ANGLE_METAL }),
      getParameter: (p) => {
        if (lost) throw new Error('context lost');
        return p === UNMASKED ? ANGLE_METAL : 'WebKit WebGL';
      },
    };
    trackRenderer({ getContext: () => ctx, getPixelRatio: () => 1, domElement: { width: 10, height: 10 } });
    expect(trackedRenderer(), 'a read on a lost context').toBe('unknown');
    expect(glInfo().renderer).toBe('unknown');
    lost = false;
    expect(trackedRenderer(), 'the context came back: the stuck "unknown" must be re-read').toBe(ANGLE_METAL);
    // A good name IS kept: no GL call per refresh once it is known.
    lost = true;
    expect(trackedRenderer(), 'a known name must not be re-read on every call').toBe(ANGLE_METAL);
  });
  it('a context restore forgets the name, so a restore onto another GPU reads the new one (F4)', () => {
    let name = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)';
    const ctx = { ...fakeCtx(), getExtension: () => null, RENDERER, getParameter: () => name };
    trackRenderer({ getContext: () => ctx, getPixelRatio: () => 1, domElement: { width: 10, height: 10 } });
    const canvas = new EventTarget();
    watchContextLoss(canvas, useGameStore);
    expect(trackedRenderer()).toBe(name);
    name = 'ANGLE (AMD, Radeon Pro 5500M)';
    expect(trackedRenderer(), 'between loss events the name is cached').toBe('ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)');
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(trackedRenderer(), 'a restore must re-read the GPU name').toBe('ANGLE (AMD, Radeon Pro 5500M)');
  });
  it('glInfo reports the tracked renderer, the pixel ratio IN FORCE and the canvas size; null before a renderer exists', () => {
    expect(glInfo()).toBeNull();
    const ctx = fakeCtx({ unmasked: ANGLE_METAL });
    let dpr = 1.5;
    trackRenderer({ getContext: () => ctx, getPixelRatio: () => dpr, domElement: { width: 1920, height: 1200 } });
    expect(glInfo()).toEqual({ renderer: ANGLE_METAL, dpr: 1.5, canvas: [1920, 1200] });
    dpr = 1.25; // the governor stepped the pixel ratio: the readout must follow it, not the value at creation
    expect(glInfo().dpr).toBe(1.25);
  });
});

describe('the context-loss listener counts every loss, keeps the context restorable, and sets the flag', () => {
  it('a loss on the real canvas listener moves the count, prevents the default and flags the store; a restore clears the flag', () => {
    const canvas = new EventTarget();
    const detach = watchContextLoss(canvas, useGameStore);
    expect(contextLossCount()).toBe(0);

    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    // preventDefault is what tells the browser the page will handle a restore; without it the context is gone for good.
    expect(lost.defaultPrevented, 'the loss was not preventDefault()ed — the browser will never restore the context').toBe(true);
    expect(contextLossCount()).toBe(1);
    expect(useGameStore.getState().isWebGLContextLost).toBe(true);

    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(useGameStore.getState().isWebGLContextLost).toBe(false);
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(contextLossCount(), 'the count is per session, not a flag: a second loss must read 2').toBe(2);

    detach();
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(contextLossCount(), 'a detached listener still counted').toBe(2);
  });
});

describe('the readout lines', () => {
  const base = { fps: 60, ms: 16.7, tier: 'high', dpr: 1.5, renderer: ANGLE_METAL, losses: 2, capActive: true, capFps: 60 };

  it('English: the frame count, then tier, dpr to two places, the cap, the GPU, the losses', () => {
    expect(diagnosticsLines(base, t)).toEqual([
      '60 FPS drawn · 16.7 ms',
      'Tier High · DPR 1.50 · Frame cap 60 FPS',
      `GPU ${ANGLE_METAL}`,
      'GL context losses 2',
    ]);
  });

  it('each field follows its input: no ms yet, another tier, the cap off, a fractional dpr', () => {
    const lines = diagnosticsLines({ ...base, ms: null, tier: 'med', dpr: 1.25, capActive: false, losses: 0 }, t);
    expect(lines[0]).toBe('60 FPS drawn');
    expect(lines[1]).toBe('Tier Medium · DPR 1.25 · Frame cap Unlimited');
    expect(lines[3]).toBe('GL context losses 0');
    expect(diagnosticsLines({ ...base, tier: 'low' }, t)[1]).toBe('Tier Low · DPR 1.50 · Frame cap 60 FPS');
    // An unknown tier is shown as itself rather than as nothing.
    expect(diagnosticsLines({ ...base, tier: 'ultra' }, t)[1]).toBe('Tier ultra · DPR 1.50 · Frame cap 60 FPS');
  });

  it('the cap line shows the cap IN FORCE, not a fixed 60 (F6): a test can hold a 1 fps cap the setting never admits', () => {
    expect(diagnosticsLines({ ...base, capFps: 1 }, t)[1]).toBe('Tier High · DPR 1.50 · Frame cap 1 FPS');
    expect(diagnosticsLines({ ...base, capFps: 90 }, t)[1]).toBe('Tier High · DPR 1.50 · Frame cap 90 FPS');
    useGameStore.setState({ locale: 'zh-CN' });
    expect(diagnosticsLines({ ...base, capFps: 1 }, t)[1]).toBe('画质 高 · 像素比 1.50 · 帧率上限 1 帧');
    // Presence beside the absence: with the cap not in force the number is not shown at all.
    expect(diagnosticsLines({ ...base, capFps: 1, capActive: false }, t)[1]).toBe('画质 高 · 像素比 1.50 · 帧率上限 不限');
  });

  it('Chinese: every label is translated (the number leads, but nothing parses the text for it: data-fps carries the count)', () => {
    useGameStore.setState({ locale: 'zh-CN' });
    expect(diagnosticsLines(base, t)).toEqual([
      '60 帧/秒（实际绘制） · 16.7 ms',
      '画质 高 · 像素比 1.50 · 帧率上限 60 帧',
      `显卡 ${ANGLE_METAL}`,
      'WebGL 上下文丢失次数 2',
    ]);
    expect(diagnosticsLines({ ...base, tier: 'low', capActive: false }, t)[1]).toBe('画质 低 · 像素比 1.50 · 帧率上限 不限');
  });
});
