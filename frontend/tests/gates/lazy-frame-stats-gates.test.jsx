// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, waitFor } from '@testing-library/react';

/**
 * THE SHOW STATS READOUT LOADS WHEN IT IS ASKED FOR (W3-A C0, DECISIONS 2026-11-01 (W3-A PR C) item 480). The readout
 * left the boot chunk for the lazy panel chunk (ui/panels/lazyPanels.js). scripts/ci/bundle-budget.mjs proves the split
 * on the BUILT bundle; this proves that GameScene mounts the lazy readout in its own <Suspense> and that it resolves to
 * the real FrameStats through the panel chunk's own import, so F3 still shows the readout. The panel chunk is NOT loaded
 * first here: F3 pressed before the idle prefetch ran. R3F's Canvas and hooks are stubbed as in
 * gamescene-diagnostics-wiring-gates, which owns what GameScene hands the readout.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, 1 test, each observed RED:
 *   R4 GameScene.jsx imports FrameStats statically again -> "rendered in the first commit"
 *   R5 lazyPanels.js names a readout the panel chunk does not export -> "never resolved to the real readout"
 *   I0 identity (a comment edit in lazyPanels.js) SURVIVED.
 *
 * NOT CHECKED HERE: the chunk boundary (bundle-budget.mjs) and the live F3 press (tests/e2e/lookbook-seam.spec.js,
 * frame-cap.spec.js).
 */

const h = vi.hoisted(() => ({ gl: null, frame: null }));
vi.mock('@react-three/fiber', async (importOriginal) => {
  const R = await import('react');
  return {
    ...(await importOriginal()),
    useFrame: (cb) => { h.frame = cb; },
    useThree: (sel) => (sel ? sel({ gl: h.gl }) : { gl: h.gl }),
    // Renders only GameScene's own boundary around the readout (by shape: a <Suspense> whose one child is not the
    // scene's array of systems), so nothing that needs WebGL mounts.
    Canvas: ({ children }) => R.createElement(R.Fragment, null,
      R.Children.toArray(children).filter((c) => c && c.type === R.Suspense && c.props.children && !Array.isArray(c.props.children))),
  };
});
vi.mock('../../src/world/Terrain', () => ({ MinecraftWorld: () => null }));
vi.mock('../../src/Components', () => ({ Player: () => null }));

const { GameScene } = await import('../../src/GameScene.jsx');
const { useGameStore } = await import('../../src/store/useGameStore.jsx');

const readout = () => document.querySelector('[data-testid="frame-stats"]');

beforeEach(() => {
  const canvas = document.createElement('canvas');
  h.gl = { domElement: canvas, getPixelRatio: () => 1, getContext: () => ({ getExtension: () => null, getParameter: () => 'x' }) };
  useGameStore.setState({ locale: 'en', qualityTier: 'high', frameCap: 60, isCaptureMode: false });
});
afterEach(cleanup);

describe('the Show Stats readout, lazy', () => {
  it('is absent from the first commit of Show Stats, then resolves to the real readout through the panel chunk', async () => {
    render(<GameScene isWorldBuilt showStats />);
    expect(readout(), 'the readout rendered in the first commit: it is statically imported, not lazy').toBeNull();
    await waitFor(() => { if (!readout()) throw new Error('not yet'); }, { timeout: 15000 })
      .catch(() => { throw new Error('the lazy readout never resolved to the real readout through the panel chunk'); });
    expect(typeof h.frame, 'presence: the real readout subscribed its frame counter').toBe('function');
  });
});
