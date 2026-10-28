// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';

/**
 * BOTH CANVASES HAND R3F THE E2E SUITE'S CAPPED PIXEL RATIO (src/devtest/e2eDpr.js, written on the page by
 * tests/e2e/_fixtures.js). src/devtest/e2eDpr.test.js drives the arithmetic; it cannot see the call sites. This mounts
 * the real GameScene and TitleDiorama with R3F's Canvas stubbed to record the `dpr` prop it receives, so a canvas that
 * stops wrapping its dpr — the likeliest way being a merge conflict on that one line (PR #24 rewrites GameScene's) — goes
 * red here instead of showing only as a slower e2e suite. The control case pins that nothing changes without the cap.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh (2026-10-28, one batch, 4 tests), each RED, with an identity mutant in each
 * subject (a comment edit) that SURVIVED in the same batch:
 *   S1 GameScene's e2eDpr wrapper removed                                       -> RED
 *   S2 plausible-wrong: GameScene wraps only the perf-probe leg                  -> RED
 *   S3 TitleDiorama's e2eDpr wrapper removed                                    -> RED
 *   S4 plausible-wrong: TitleDiorama wraps only the capture leg                  -> RED
 *
 * BLIND SPOT: the Canvas is a stub, so that R3F resolves the capped range into the renderer's pixel ratio and the drawing
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

/** The dpr each canvas hands R3F on its first render. */
const mountedDprs = () => {
  h.dprs.length = 0;
  render(<GameScene isWorldBuilt showStats={false} />);
  const game = h.dprs[0];
  cleanup();
  h.dprs.length = 0;
  render(<TitleDiorama />);
  const title = h.dprs[0];
  return { game, title };
};

beforeEach(() => {
  useGameStore.setState({ qualityTier: 'high', isCaptureMode: false });
});
afterEach(() => {
  cleanup();
  delete globalThis.__craftyE2eDprCap;
  useGameStore.setState({ qualityTier: 'low', isCaptureMode: false });
});

describe('the e2e pixel-ratio cap reaches both R3F canvases', () => {
  it('CONTROL: without the cap each canvas hands R3F its own range (high tier [1, 2]; the title [1, 2])', () => {
    const d = mountedDprs();
    expect(d.game, 'the GameScene Canvas stub never rendered — nothing below is measured').toEqual([1, 2]);
    expect(d.title, 'the TitleDiorama Canvas stub never rendered — nothing below is measured').toEqual([1, 2]);
  });

  it('under the suite cap 0.5 both canvases hand R3F [0.5, 0.5]', () => {
    globalThis.__craftyE2eDprCap = 0.5;
    const d = mountedDprs();
    expect(d.game, 'GameScene ignored the e2e cap').toEqual([0.5, 0.5]);
    expect(d.title, 'TitleDiorama ignored the e2e cap').toEqual([0.5, 0.5]);
  });

  it('a cap inside the range caps only its top (1.25 at high: [1, 1.25])', () => {
    globalThis.__craftyE2eDprCap = 1.25;
    const d = mountedDprs();
    expect(d.game).toEqual([1, 1.25]);
    expect(d.title).toEqual([1, 1.25]);
  });

  it('GameScene caps the tier it is at, not a fixed range (low tier [1, 1.5] under 0.5 is [0.5, 0.5]; under 1.2, [1, 1.2])', () => {
    useGameStore.setState({ qualityTier: 'low' });
    globalThis.__craftyE2eDprCap = 1.2;
    expect(mountedDprs().game).toEqual([1, 1.2]);
    globalThis.__craftyE2eDprCap = 0.5;
    expect(mountedDprs().game).toEqual([0.5, 0.5]);
  });
});
