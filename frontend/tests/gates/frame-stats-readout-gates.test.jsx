// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

/**
 * THE SHOW STATS ELEMENT, MOUNTED (review of the instruments branch, F4 / F5 / F6). tests/gates/diagnostics-readout-gates
 * drives the PURE line builder and the renderer helpers; what it cannot see is the PRODUCER — that FrameStats really
 * publishes the frame count as `data-fps`, hands the store's real frame cap to the line builder, and reads the GPU name
 * through the shared helper that does not keep an 'unknown'. A consumer handed a value says nothing about whether
 * anything emits it (gates-and-probes 4c), so this mounts the real component with R3F's two hooks stubbed and reads
 * the element it appends to the page.
 *
 *   F5  tests/e2e/frame-cap.spec.js used to parse /^(\d+) FPS/ from the text, which the zh-CN string
 *       ("{fps} 帧/秒（实际绘制）") does not match. It reads `data-fps` now; this pins that the attribute exists, is the
 *       frame count and does not move with the locale.
 *   F6  the cap line shows the cap in force: a 1 fps test cap reads "Frame cap 1 FPS", not a fixed 60.
 *   F4  the GPU line follows a context that fails its first read and then recovers, instead of sticking at "unknown".
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, 3 tests, each observed RED unless stated:
 *   S1 data-fps never written (the line deleted) -> "publishes the frame count as data-fps"
 *   S2 plausible-wrong: data-fps written as the ms figure -> the same test
 *   S3 plausible-wrong: the cap handed to the line builder fixed at 60 -> "shows the cap in force"
 *   S4 the line builder's cap label put back to the fixed panel.frameRateCapped (glDiagnostics.js) -> "shows the cap in force"
 *   S5 plausible-wrong: the GPU name cached by FrameStats itself, 'unknown' included -> "follows a context"
 *   S6 an 'unknown' name kept by the shared helper (the original cache test, glDiagnostics.js) -> "follows a context"
 *   I0 identity (a comment edit in FrameStats.jsx) SURVIVED.
 *
 * BLIND SPOT: useFrame and useThree are stubs here, so that R3F calls the callback once per drawn frame, and that
 * GameScene mounts FrameStats with the live gl, is the e2e's (frame-cap.spec.js: the readout under a 1 fps cap;
 * lookbook-seam.spec.js: the GPU line equals the live renderer's). jsdom has no layout, so the wrap and size of the
 * overlay are not looked at here.
 */

const h = vi.hoisted(() => ({ frame: null, gl: null }));
vi.mock('@react-three/fiber', () => ({
  useFrame: (cb) => { h.frame = cb; },
  useThree: (sel) => sel({ gl: h.gl }),
}));

const { FrameStats } = await import('../../src/render/FrameStats.jsx');
const { trackRenderer, _resetGlDiagnosticsForTest } = await import('../../src/render/glDiagnostics.js');
const { useGameStore } = await import('../../src/store/useGameStore.jsx');

const UNMASKED = 0x9246;
const GPU = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)';
let clock = 0;
let lost = false;

const readout = () => document.querySelector('[data-testid="frame-stats"]');
/** Drive the stubbed useFrame callback at the given times (ms). The readout text refreshes at most every 250 ms. */
const frames = (...times) => { for (const t of times) { clock = t; h.frame(); } };

beforeEach(() => {
  clock = 0;
  lost = false;
  h.gl = {
    getPixelRatio: () => 1.5,
    domElement: { width: 100, height: 100 },
    getContext: () => ({
      RENDERER: 0x1f01,
      getExtension: () => ({ UNMASKED_RENDERER_WEBGL: UNMASKED }),
      getParameter: () => { if (lost) throw new Error('context lost'); return GPU; },
    }),
  };
  trackRenderer(h.gl);
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  useGameStore.setState({ locale: 'en', qualityTier: 'high', frameCap: 60 });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  _resetGlDiagnosticsForTest();
  useGameStore.setState({ locale: 'en', frameCap: 60 });
});

describe('FrameStats, mounted', () => {
  it('publishes the frame count as data-fps, in every locale (F5)', () => {
    render(<FrameStats capActive />);
    expect(readout(), 'the readout element is not in the page — the instrument is dead').not.toBeNull();
    // Four frames inside one second; the refresh lands at 1000 (one frame seen) and at 1250 (all four).
    frames(1000, 1100, 1200, 1250);
    const el = readout();
    expect(el.dataset.fps, `data-fps after four frames in a second; the text is ${JSON.stringify(el.textContent)}`).toBe('4');
    expect(el.textContent.split('\n')[0], 'presence: the text carries the same count').toBe('4 FPS drawn · 83.3 ms');
    useGameStore.setState({ locale: 'zh-CN' });
    frames(1500);
    // Five frames now sit in the window ending at 1500 (1000 is exactly 500 old): the count follows, in Chinese text.
    expect(el.dataset.fps).toBe('5');
    expect(el.textContent.split('\n')[0], 'the zh-CN text must not be what a test parses').toBe('5 帧/秒（实际绘制） · 125 ms');
  });

  it('shows the cap in force, not a fixed 60 (F6)', () => {
    render(<FrameStats capActive />);
    frames(1000);
    expect(readout().textContent.split('\n')[1]).toBe('Tier High · DPR 1.50 · Frame cap 60 FPS');
    // frame-cap.spec holds a 1 fps cap through setState; the cap changes AFTER the readout mounted.
    useGameStore.setState({ frameCap: 1 });
    frames(1300);
    expect(readout().textContent.split('\n')[1], 'the readout still names the old cap').toBe('Tier High · DPR 1.50 · Frame cap 1 FPS');
  });

  it('the GPU line follows a context that fails its first read and then recovers (F4)', () => {
    lost = true;
    render(<FrameStats capActive />);
    frames(1000);
    expect(readout().textContent.split('\n')[2], 'a lost context reads "unknown"').toBe('GPU unknown');
    lost = false;
    frames(1300);
    expect(readout().textContent.split('\n')[2], 'the stuck "unknown" must be re-read once the context answers').toBe(`GPU ${GPU}`);
  });
});
