// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';

/**
 * GAMESCENE'S DIAGNOSTICS WIRING (src/GameScene.jsx; review of PR #23, item 5). diagnostics-readout-gates drives
 * watchContextLoss and trackRenderer on a canvas the TEST builds, and frame-stats-readout-gates mounts FrameStats with
 * a capActive the TEST passes. Neither sees the call sites: that GameScene's onCreated attaches the loss listener to
 * the canvas R3F hands it and records that renderer, and that it hands FrameStats its OWN capActive (frameCap > 0, and
 * neither capture mode nor the perf probe). Deleting any of those lines left every unit test green.
 *
 * This mounts the real GameScene with R3F's Canvas stubbed: the stub calls onCreated with a fake renderer whose
 * domElement is a real <canvas> (a real EventTarget), and renders only the FrameStats child, so the scene's other
 * children (terrain, physics, post-processing) never mount. useFrame/useThree are stubbed as in
 * frame-stats-readout-gates; the real store, glDiagnostics and FrameStats are used.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/GameScene.jsx, 4 tests each, every RED confirmed against a green baseline:
 *   G1 watchContextLoss(...) deleted from onCreated -> "attaches the context-loss listener"
 *   G2 plausible-wrong: the listener put on document.body, not the game canvas -> the same test
 *   G3 trackRenderer(gl) deleted -> "records the renderer R3F created"
 *   G4 FrameStats mounted with capActive always true -> "hands FrameStats its own capActive"
 *   G5 plausible-wrong: capActive={frameCap > 0} (capture mode ignored) -> the same test
 *   G6 the capActive prop dropped -> the same test
 *   G7 showStats ignored (FrameStats always mounted) -> "mounts the readout only with Show Stats on"
 *   I0 identity (a comment edit in GameScene.jsx) SURVIVED.
 *
 * THE MERGE SEAM (merge of main into feat/combat-stance, 2026-10-28). main moved the listeners into glDiagnostics and
 * steady-cool gave them a recovery (game/contextRecovery.js): a loss releases a locked pointer, and a restore clears
 * the loss only once three has drawn. The two met in onCreated; the first test pins that both still act. Receipts, via
 * scripts/dev/mutate.sh, 4 tests each, every RED against a green baseline:
 *   S1 GameScene passes no handlers (main's plain flag writes) -> "attaches the context-loss listener" (cleared at once)
 *   S2 plausible-wrong: glDiagnostics ignores handlers.restored -> the same test
 *   S3 glDiagnostics ignores handlers.lost -> the same test (the pointer is never released)
 *   S4 plausible-wrong: GameScene's restored handler clears the flag itself -> the same test
 *   S5 identity (a comment edit in glDiagnostics.js) SURVIVED.
 *
 * BLIND SPOT: the Canvas is a stub, so that R3F really calls onCreated once with the live WebGLRenderer, and that a real
 * GPU context loss reaches the canvas, is the e2e's (tests/e2e/lookbook-seam.spec.js: WEBGL_lose_context on the live
 * canvas, read back from the readout and the seam). The perf-probe leg of capActive is not driven (isPerfProbe reads
 * the URL at module load); capture mode is.
 */

const h = vi.hoisted(() => ({ frame: null, gl: null, FrameStats: null, created: 0 }));
vi.mock('@react-three/fiber', async (importOriginal) => {
  const R = await import('react');
  return {
    ...(await importOriginal()),
    useFrame: (cb) => { h.frame = cb; },
    useThree: (sel) => (sel ? sel({ gl: h.gl }) : { gl: h.gl }),
    // The real Canvas needs WebGL. This one does the two things GameScene relies on it for: call onCreated once with a
    // renderer, and render its children — the FrameStats child only (by identity), so nothing else in the scene mounts.
    Canvas: ({ onCreated, children }) => {
      R.useEffect(() => {
        h.created += 1;
        onCreated({ gl: h.gl, camera: { rotation: { order: '', set() {} }, lookAt() {} }, scene: {} });
      }, []);
      return R.createElement(R.Fragment, null, R.Children.toArray(children).filter((c) => c && c.type === h.FrameStats));
    },
  };
});
// GameScene's other imports load at module scope; two of them cannot in jsdom (Terrain spawns a Worker at import).
vi.mock('../../src/world/Terrain', () => ({ MinecraftWorld: () => null }));
vi.mock('../../src/Components', () => ({ Player: () => null }));

h.FrameStats = (await import('../../src/render/FrameStats.jsx')).FrameStats;
const { GameScene } = await import('../../src/GameScene.jsx');
const { useGameStore } = await import('../../src/store/useGameStore.jsx');
const gl = await import('../../src/render/glDiagnostics.js');

const GPU = 'ANGLE (Test, Fake Renderer)';
let clock = 0;
const readout = () => document.querySelector('[data-testid="frame-stats"]');
const capLine = () => {
  clock += 300;
  act(() => { h.frame(); });
  return readout().textContent.split('\n')[1];
};

beforeEach(() => {
  clock = 1000;
  h.created = 0;
  h.frame = null;
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 800;
  h.gl = {
    domElement: canvas,
    getPixelRatio: () => 2,
    getContext: () => ({ RENDERER: 0x1f01, getExtension: () => null, getParameter: () => GPU }),
    info: { render: { frame: 7 } }, // three's frame counter: game/contextRecovery.js whenDrawnAgain reads it
  };
  gl._resetGlDiagnosticsForTest();
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  useGameStore.setState({ locale: 'en', qualityTier: 'high', frameCap: 60, isCaptureMode: false, isWebGLContextLost: false });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  gl._resetGlDiagnosticsForTest();
  useGameStore.setState({ frameCap: 60, isCaptureMode: false, isWebGLContextLost: false });
});

describe('GameScene wires the diagnostics', () => {
  it('attaches the context-loss listener to the canvas R3F created, and the recovery acts on it', async () => {
    // A locked pointer, so the loss handler's release is observable (jsdom has no pointer lock of its own).
    const exitPointerLock = vi.fn();
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => h.gl.domElement });
    document.exitPointerLock = exitPointerLock;
    try {
      render(<GameScene isWorldBuilt showStats={false} />);
      expect(h.created, 'the Canvas stub never called onCreated — nothing below is measured').toBe(1);
      expect(gl.contextLossCount(), 'presence: no loss yet').toBe(0);
      const lost = new Event('webglcontextlost', { cancelable: true });
      h.gl.domElement.dispatchEvent(lost);
      expect(gl.contextLossCount(), 'a loss on the game canvas was not counted — no listener on it').toBe(1);
      expect(lost.defaultPrevented, 'the loss was not preventDefault()ed: the browser will not restore the context').toBe(true);
      expect(useGameStore.getState().isWebGLContextLost).toBe(true);
      expect(exitPointerLock, 'a loss left the pointer locked: a desktop player cannot click the way back')
        .toHaveBeenCalledTimes(1);
      h.gl.domElement.dispatchEvent(new Event('webglcontextrestored'));
      expect(useGameStore.getState().isWebGLContextLost,
        'the restore cleared the loss before three drew a frame: the panel went away over a black canvas').toBe(true);
      h.gl.info.render.frame += 1; // three draws
      await vi.waitFor(() => {
        expect(useGameStore.getState().isWebGLContextLost, 'a drawn frame after the restore did not clear the flag').toBe(false);
      });
    } finally {
      delete document.pointerLockElement;
      delete document.exitPointerLock;
    }
  });

  it('records the renderer R3F created, for the readout and the seam', () => {
    expect(gl.glInfo(), 'presence: nothing tracked before the scene mounts').toBeNull();
    render(<GameScene isWorldBuilt showStats={false} />);
    expect(gl.glInfo()).toEqual({ renderer: GPU, dpr: 2, canvas: [1280, 800] });
  });

  it('mounts the readout only with Show Stats on', () => {
    render(<GameScene isWorldBuilt showStats={false} />);
    expect(readout(), 'Show Stats off, and the readout is on screen').toBeNull();
    cleanup();
    render(<GameScene isWorldBuilt showStats />);
    expect(readout(), 'Show Stats on, and no readout').not.toBeNull();
  });

  it("hands FrameStats its own capActive: on at a cap, off at Unlimited, off in capture mode with a cap set", () => {
    render(<GameScene isWorldBuilt showStats />);
    expect(capLine(), 'frameCap 60 in play: the cap is in force').toBe('Tier High · DPR 2.00 · Frame cap 60 FPS');
    act(() => { useGameStore.setState({ frameCap: 0 }); });
    expect(capLine(), 'frameCap 0 is the Unlimited setting').toBe('Tier High · DPR 2.00 · Frame cap Unlimited');
    act(() => { useGameStore.setState({ frameCap: 60, isCaptureMode: true }); });
    expect(capLine(), 'capture mode steps its own frames: a cap set in the store is not in force')
      .toBe('Tier High · DPR 2.00 · Frame cap Unlimited');
  });
});
