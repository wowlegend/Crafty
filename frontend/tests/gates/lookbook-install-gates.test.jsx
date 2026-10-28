// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * THE LOOKBOOK SEAM'S PRODUCTION INSTALL (src/index.jsx; review of PR #23, item 5). tests/gates/lookbook-seam-gates
 * drives installLookbookSeam with collaborators the TEST hands it, so it says nothing about what the entry module
 * hands it: a swapped getActive, a raw gameTime for cycleOf, or a glInfo / contextLosses that is not the one the
 * readout counts would all leave that gate green (gates-and-probes 4c, the producer behind a consumer). This imports
 * the real entry module, with App stubbed out (the module renders it into #root), on a page whose URL is or is not
 * `?lookbook=1`, and drives the installed seam against the REAL input gate, store, day clock and diagnostics.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/index.jsx, 4 tests each, every RED confirmed against a green baseline:
 *   X1 the install call skipped (`false && installLookbookSeam(...)`) -> "installs the seam", "input gate", "day clock", "diagnostics"
 *   X2 plausible-wrong: getActive reads a constant true -> "drives the REAL input gate"
 *   X3 plausible-wrong: setActive a no-op -> the same test
 *   X4 plausible-wrong: cycleOf hands back the raw gameTime -> "lands the REAL store on the asked cycle"
 *   X5 glInfo replaced by () => null -> "reports the diagnostics the readout reads"
 *   X6 plausible-wrong: contextLosses a constant 0 -> the same test
 *   X7 the URL test dropped (src/render/lookbookSeam.js: `if (!win) return false;`, the seam on every page) ->
 *      "installs nothing without ?lookbook=1"
 *   I0 identity (a comment edit in index.jsx) SURVIVED.
 *
 * BLIND SPOT: App is a stub, so whether the GAME reads what the seam writes (the Player's pose, PositionTracker, the
 * readout) is tests/gates/player-lookbook-pose-gates.test.jsx, gamescene-diagnostics-wiring-gates.test.jsx and the
 * e2e (tests/e2e/lookbook-seam.spec.js, on the production build). That the shipped BUNDLE keeps this call (it is not
 * DEV-gated) is the e2e's: it opens `vite preview` with `?lookbook=1`.
 */

vi.mock('../../src/App', () => ({ default: () => null }));

/** A fresh copy of the entry module and every module it imports, loaded on a page at `search`. */
async function bootAt(search) {
  vi.resetModules();
  delete window.__craftyLookbook;
  window.history.replaceState(null, '', `/${search}`);
  document.body.innerHTML = '<div id="root"></div>';
  await import('../../src/index.jsx');
  return {
    seam: window.__craftyLookbook,
    input: await import('../../src/input/inputState.js'),
    store: (await import('../../src/store/useGameStore.jsx')).useGameStore,
    dayPhase: await import('../../src/game/dayPhase.js'),
    gl: await import('../../src/render/glDiagnostics.js'),
  };
}

beforeEach(() => {
  delete window.__craftyLookbook;
});

describe('src/index.jsx installs the lookbook seam with the real collaborators', () => {
  it('installs nothing without ?lookbook=1, and installs the seam with it', async () => {
    const plain = await bootAt('');
    expect(plain.seam, 'a page without ?lookbook=1 got the seam — every player would carry it').toBeUndefined();
    const { seam } = await bootAt('?lookbook=1');
    expect(seam, 'the entry module did not install the seam on ?lookbook=1 — the probe has no door').toBeDefined();
    expect(Object.keys(seam).sort()).toEqual(['clear', 'info', 'play', 'pose', 'setCycle']);
  });

  it('drives the REAL input gate: play() makes it live, and info() reads it back', async () => {
    const { seam, input } = await bootAt('?lookbook=1');
    input.setActive(false);
    expect(seam.info().active, 'presence: with the gate down, info() must say so').toBe(false);
    expect(seam.play(), 'play() returns what the gate now reads').toBe(true);
    expect(input.getInput().active, 'play() did not reach the input gate the Player reads').toBe(true);
    input.setActive(false);
    expect(seam.info().active, 'info() did not follow the real gate back down').toBe(false);
  });

  it('lands the REAL store on the asked cycle, read back through the day clock', async () => {
    const { seam, store, dayPhase } = await bootAt('?lookbook=1');
    for (const cycle of [0.3, 0.48, 0.75]) {
      const landed = seam.setCycle(cycle);
      const actual = dayPhase.cycleFraction(store.getState().gameTime);
      expect(actual, `the store's clock did not land on cycle ${cycle}`).toBeCloseTo(cycle, 6);
      expect(landed, `setCycle(${cycle}) reported a cycle the clock is not on`).toBeCloseTo(actual, 9);
      expect(seam.info().cycle).toBeCloseTo(cycle, 6);
    }
  });

  it('reports the diagnostics the readout reads: the tracked renderer and the session context-loss count', async () => {
    const { seam, store, gl } = await bootAt('?lookbook=1');
    gl._resetGlDiagnosticsForTest();
    expect(seam.info().gl, 'before the Canvas exists there is no renderer to report').toBeNull();
    const canvas = document.createElement('canvas');
    canvas.width = 2560;
    canvas.height = 1600;
    gl.trackRenderer({
      domElement: canvas,
      getPixelRatio: () => 2,
      getContext: () => ({ RENDERER: 0x1f01, getExtension: () => null, getParameter: () => 'Test GPU' }),
    });
    expect(seam.info().gl).toEqual({ renderer: 'Test GPU', dpr: 2, canvas: [2560, 1600] });
    expect(seam.info().contextLosses, 'presence: no loss yet').toBe(0);
    gl.watchContextLoss(canvas, store);
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(gl.contextLossCount()).toBe(2);
    expect(seam.info().contextLosses, 'the seam must report the count the readout shows').toBe(2);
  });
});
