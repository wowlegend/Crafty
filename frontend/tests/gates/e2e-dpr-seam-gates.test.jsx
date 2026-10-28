// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';

/**
 * BOTH CANVASES HAND R3F THE E2E SUITE'S CAPPED PIXEL RATIO (src/devtest/e2eDpr.js, written on the page by
 * tests/e2e/_fixtures.js). src/devtest/e2eDpr.test.js drives the arithmetic; it cannot see the call sites. This mounts
 * the real GameScene and TitleDiorama with R3F's Canvas stubbed to record the `dpr` prop it receives, so a canvas that
 * stops wrapping its dpr, or wraps only one leg of it, goes red here instead of showing only as a slower e2e suite. The
 * control case pins that nothing changes without the cap.
 *
 * GameScene's dpr is `e2eDpr(probe ? PROBE_DPR : capture ? [1, CAPTURE_DPR_CAP] : pixelBudgetDpr(...))`. The window is
 * set to one where the high-tier budget (1.475) sits strictly between 1 and the tier cap (1.75), so the budget number,
 * the tier's old [1, dprCap] range and a capped value are three different readings; jsdom's default window (dpr 1) puts
 * every tier's budget at exactly 1, where a cap above 1 cannot tell wrapped from unwrapped.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, one batch on the tree that merges PR #24 over the cap, each RED, with an
 * identity mutant (a comment edit in GameScene) that SURVIVED in the same batch — the receipt is in the merge commit:
 *   S1 GameScene's e2eDpr wrapper removed (the budget expression bare)                 -> RED
 *   S2 plausible-wrong: GameScene wraps only the perf-probe leg                         -> RED
 *   S2b plausible-wrong: GameScene wraps only the budget leg (capture leg bare)         -> RED
 *   S2c plausible-wrong: GameScene wraps only the capture leg (budget leg bare)         -> RED
 *   S2d plausible-wrong: GameScene keeps the tier range [1, q.dprCap] under the cap     -> RED
 *   S3 TitleDiorama's e2eDpr wrapper removed                                            -> RED
 *   S4 plausible-wrong: TitleDiorama wraps only the capture leg                         -> RED
 *
 * BLIND SPOT: the Canvas is a stub, so that R3F resolves the capped value into the renderer's pixel ratio and the drawing
 * buffer really shrinks is the e2e's (tests/e2e/smoke.spec.js reads the live canvas's drawing buffer against its CSS box,
 * and the fixture prints every test's canvases). The perf-probe leg is not driven (isPerfProbe reads the URL at load).
 */

const h = vi.hoisted(() => ({ dprs: [] }));
vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal()),
  useFrame: () => {},
  useThree: (sel) => (sel ? sel({}) : {}),
  // Record the prop and render nothing: no child of either scene mounts, so jsdom needs no WebGL.
  Canvas: ({ dpr }) => {
    h.dprs.push(dpr);
    return null;
  },
}));
// GameScene's other imports load at module scope; two of them cannot in jsdom (Terrain spawns a Worker at import).
vi.mock('../../src/world/Terrain', () => ({ MinecraftWorld: () => null }));
vi.mock('../../src/Components', () => ({ Player: () => null }));

const { GameScene } = await import('../../src/GameScene.jsx');
const { TitleDiorama } = await import('../../src/render/TitleDiorama.jsx');
const { useGameStore } = await import('../../src/store/useGameStore.jsx');
const { pixelBudgetDpr } = await import('../../src/render/pixelBudget.js');

/** An M3 Max window (as tests/gates/pixel-budget-gates uses): high's budget binds below its tier cap here. */
const WINDOW = { cssWidth: 1728, cssHeight: 1117, devicePixelRatio: 2 };
const setWindow = ({ cssWidth, cssHeight, devicePixelRatio }) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: cssWidth });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: cssHeight });
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: devicePixelRatio });
};
const budget = (tier) => pixelBudgetDpr({ tier, ...WINDOW });

/** The dpr each canvas hands R3F on its first render. */
const mountedDprs = () => {
  h.dprs.length = 0;
  render(<GameScene isWorldBuilt showStats={false} />);
  const game = h.dprs[0];
  cleanup();
  h.dprs.length = 0;
  render(<TitleDiorama />);
  const title = h.dprs[0];
  cleanup();
  return { game, title };
};

beforeEach(() => {
  setWindow(WINDOW);
  useGameStore.setState({ qualityTier: 'high', isCaptureMode: false });
});
afterEach(() => {
  cleanup();
  delete globalThis.__craftyE2eDprCap;
  setWindow({ cssWidth: 1024, cssHeight: 768, devicePixelRatio: 1 });
  useGameStore.setState({ qualityTier: 'low', isCaptureMode: false });
});

describe('the e2e pixel-ratio cap reaches both R3F canvases', () => {
  it('CONTROL: without the cap GameScene hands R3F the tier budget and the title its [1, 2] range', () => {
    // The scenario itself: the budget is not 1 and not the tier cap, or the cases below could not separate the readings.
    expect(budget('high'), 'SETUP: the high budget on this window').toBeCloseTo(1.475, 3);
    expect(budget('med'), 'SETUP: the med budget on this window').toBeCloseTo(1.2044, 3);
    const d = mountedDprs();
    expect(d.game, 'the GameScene Canvas stub never rendered — nothing below is measured').toBe(budget('high'));
    expect(d.title, 'the TitleDiorama Canvas stub never rendered — nothing below is measured').toEqual([1, 2]);
  });

  it('under the suite cap 0.5 GameScene hands R3F 0.5 and the title [0.5, 0.5]', () => {
    globalThis.__craftyE2eDprCap = 0.5;
    const d = mountedDprs();
    expect(d.game, 'GameScene ignored the e2e cap').toBe(0.5);
    expect(d.title, 'TitleDiorama ignored the e2e cap').toEqual([0.5, 0.5]);
  });

  it('the cap applies after the budget: below the budget it binds, above it the budget stands', () => {
    globalThis.__craftyE2eDprCap = 1.25;
    const below = mountedDprs();
    expect(below.game, 'a cap of 1.25 under a 1.475 budget').toBe(1.25);
    expect(below.title).toEqual([1, 1.25]);
    globalThis.__craftyE2eDprCap = 1.6;
    expect(mountedDprs().game, 'a cap of 1.6 above the 1.475 budget (and under the tier cap 1.75)').toBe(budget('high'));
  });

  it('GameScene caps the budget of the tier it is at (cap 1.3: high 1.475 -> 1.3, med 1.2044 stands)', () => {
    globalThis.__craftyE2eDprCap = 1.3;
    expect(mountedDprs().game).toBe(1.3);
    useGameStore.setState({ qualityTier: 'med' });
    expect(mountedDprs().game).toBe(budget('med'));
  });

  it('capture keeps its [1, CAPTURE_DPR_CAP] range, and the cap reaches that leg too', () => {
    useGameStore.setState({ isCaptureMode: true });
    expect(mountedDprs().game, 'capture without the cap').toEqual([1, 2]);
    globalThis.__craftyE2eDprCap = 0.5;
    expect(mountedDprs().game, 'GameScene ignored the e2e cap in capture').toEqual([0.5, 0.5]);
    globalThis.__craftyE2eDprCap = 1.25;
    expect(mountedDprs().game).toEqual([1, 1.25]);
  });
});
