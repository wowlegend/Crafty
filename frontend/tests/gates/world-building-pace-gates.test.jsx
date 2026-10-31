// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';

/**
 * GAMESCENE PACES THE WORLD BEING BUILT AS THE TITLE (lane start-stall, registry REVIEW:l10:music-e2e-title-hang).
 * canvas-pace-gates drives paceFor; this drives its call site. A Start clicked before the spawn chunk is built left
 * App's loading overlay up over a canvas drawn at the play pace with the tier governor sampling the build, and on CI's
 * software renderer the saturated page let the input the browser's pointer lock streams queue without bound (DECISIONS
 * 2026-10-31 item 370). This mounts the real GameScene against the real store with R3F's Canvas stubbed to report the
 * frameloop it is handed and to render two children only: FrameCap (the pace it is handed) and drei's
 * PerformanceMonitor (the governor), both stubbed to record their props. Nothing else in the scene mounts.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/GameScene.jsx, receipts in the commit.
 *
 * BLIND SPOT: the Canvas is a stub, so that R3F honours `frameloop` and that FrameCap really paces it is
 * tests/e2e/frame-cap.spec.js's; that App hands GameScene isWorldBuilt from the spawn chunk is App's, read by
 * tests/e2e/start-before-built.spec.js, which also lives the whole entry: a trusted Start on the title before the world
 * is built, under the browser's own pointer lock.
 */

const h = vi.hoisted(() => ({ loops: [], caps: [], monitors: 0, FrameCap: null, PerformanceMonitor: null }));
vi.mock('@react-three/fiber', async (importOriginal) => {
  const R = await import('react');
  return {
    ...(await importOriginal()),
    useFrame: () => {},
    useThree: (sel) => (sel ? sel({}) : {}),
    Canvas: ({ frameloop, children }) => {
      h.loops.push(frameloop);
      const keep = (c) => c && (c.type === h.FrameCap || c.type === h.PerformanceMonitor);
      return R.createElement(R.Fragment, null, R.Children.toArray(children).filter(keep));
    },
  };
});
vi.mock('@react-three/drei', async (importOriginal) => {
  const PerformanceMonitor = () => { h.monitors += 1; return null; };
  h.PerformanceMonitor = PerformanceMonitor;
  return { ...(await importOriginal()), PerformanceMonitor };
});
vi.mock('../../src/render/FrameCap.jsx', async (importOriginal) => {
  const FrameCap = ({ fps, active }) => { h.caps.push({ fps, active }); return null; };
  h.FrameCap = FrameCap;
  return { ...(await importOriginal()), FrameCap };
});
// GameScene's other imports load at module scope; two of them cannot in jsdom (Terrain spawns a Worker at import).
vi.mock('../../src/world/Terrain', () => ({ MinecraftWorld: () => null }));
vi.mock('../../src/Components', () => ({ Player: () => null }));

const { GameScene } = await import('../../src/GameScene.jsx');
const { useGameStore } = await import('../../src/store/useGameStore.jsx');
const { TITLE_FPS } = await import('../../src/render/canvasPace.js');

/** The pace GameScene hands the Canvas and FrameCap, and whether the governor's monitor mounted, for one render. */
function paceOf(props) {
  h.loops.length = 0;
  h.caps.length = 0;
  h.monitors = 0;
  render(<GameScene showStats={false} {...props} />);
  const out = { loop: h.loops.at(-1), cap: h.caps.at(-1), monitor: h.monitors > 0, renders: h.loops.length };
  cleanup();
  return out;
}

beforeEach(() => {
  // In play, focused, nothing covering: the state a Start click leaves behind it.
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  useGameStore.setState({ locale: 'en', qualityTier: 'low', frameCap: 60, isCaptureMode: false, titleCovering: false, panelCovering: false });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useGameStore.setState({ frameCap: 60, titleCovering: false, panelCovering: false });
});

describe('GameScene paces a world being built as it paces the title', () => {
  it('in play with the world built, the setting decides and the governor samples (presence)', () => {
    const built = paceOf({ isWorldBuilt: true });
    expect(built.renders, 'the Canvas stub never rendered: nothing below is measured').toBeGreaterThan(0);
    expect(built.cap, 'presence: FrameCap was not handed the play pace').toEqual({ fps: 60, active: true });
    expect(built.loop).toBe('demand');
    expect(built.monitor, 'presence: the governor did not mount in play').toBe(true);
  });

  it('in play with the world not built yet, the canvas under the loading overlay draws at the title pace, ungoverned', () => {
    // 60 and Unlimited are the settings; 1 is the frame-cap e2e's test cap, under which the title pace would draw above
    // the cap, and where governorSamples alone (a pace equal to the cap) would mount the monitor.
    let checked = 0;
    for (const frameCap of [60, 0, 1]) {
      useGameStore.setState({ frameCap });
      const building = paceOf({ isWorldBuilt: false });
      expect(building.loop, `the world being built drew on the display's every frame (cap ${frameCap})`).toBe('demand');
      expect(building.cap, `the world being built drew at the setting's rate (cap ${frameCap})`).toEqual({ fps: Math.min(TITLE_FPS, frameCap || TITLE_FPS), active: true });
      expect(building.monitor, `the governor sampled the world being built (cap ${frameCap})`).toBe(false);
      checked += 1;
    }
    expect(checked, 'the caps checked').toBe(3);
  });
});
