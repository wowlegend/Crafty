// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';

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
 * e2e (tests/e2e/lookbook-seam.spec.js, on the DEV server). That the shipped BUNDLE keeps this call (it is not
 * DEV-gated) is scripts/ci/prod-smoke.mjs's seamVerdict, which loads the production build with and without
 * `?lookbook=1`.
 */

vi.mock('../../src/App', () => ({ default: () => null }));

const mobsInWorld = (ecs) => [...ecs.with('isMob', 'position', 'type').entities];

/** A fresh copy of the entry module and every module it imports, loaded on a page at `search`. */
async function bootAt(search) {
  vi.resetModules();
  delete window.__craftyLookbook;
  window.history.replaceState(null, '', `/${search}`);
  document.body.innerHTML = '<div id="root"></div>';
  // index.jsx renders into a React 19 root at import. Flushed inside act() so no scheduled render outlives the test:
  // left to the scheduler it ran after jsdom's teardown and threw 'window is not defined' five times, which fails the
  // push tier's vitest run even with every assertion green (instruments push of 2026-10-28).
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  await act(async () => { await import('../../src/index.jsx'); });
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
    expect(Object.keys(seam).sort()).toEqual(['clear', 'clearHostiles', 'form', 'handPose', 'info', 'look', 'mobs', 'passTimes', 'passesOff', 'play', 'pose', 'setCycle', 'stand']);
  });

  it('hands the seam the REAL mob query: a hostile added to the ECS world is measured from the eye', async () => {
    const { seam, store } = await bootAt('?lookbook=1');
    const { ecs } = await import('../../src/ecs/world.js');
    const { PerspectiveCamera } = await import('three');
    store.setState({ gameCamera: new PerspectiveCamera() });
    expect(seam.info().hostiles, 'presence: an empty world reads as no hostile').toEqual({ nearestM: null, within8m: 0 });
    const husk = ecs.add({ isMob: true, type: 'zombie', health: 100, passive: false, position: { x: 0, y: 0, z: 4 } });
    try {
      expect(seam.info().hostiles, 'the entry module gave the seam no mob query, or the wrong one').toEqual({ nearestM: 4, within8m: 1 });
      expect(seam.clearHostiles(), 'clearHostiles() did not find the hostile').toBe(1);
      expect(mobsInWorld(ecs), 'clearHostiles() did not remove it from the REAL world').not.toContain(husk);
    } finally {
      ecs.remove(husk);
      store.setState({ gameCamera: null });
    }
  });

  it('hands the seam the REAL mob query for mobs(): a named NPC added to the ECS world is listed with its name', async () => {
    const { seam } = await bootAt('?lookbook=1');
    const { ecs } = await import('../../src/ecs/world.js');
    expect(seam.mobs(), 'presence: an empty world lists no mob').toEqual([]);
    const npc = ecs.add({ isMob: true, isNPC: true, npcName: 'Sister Wren', type: 'villager', health: 200, passive: true, position: { x: 3, y: 50, z: -2 } });
    try {
      expect(seam.mobs(), 'the entry module gave mobs() no mob query, or the wrong one')
        .toEqual([{ type: 'villager', hostile: false, npc: 'Sister Wren', position: [3, 50, -2] }]);
    } finally {
      ecs.remove(npc);
    }
  });

  it('hands the seam the real pass timer, loaded on the first passTimes() and never before', async () => {
    const { seam } = await bootAt('?lookbook=1');
    const { EffectComposer } = await import('postprocessing');
    const unpatched = EffectComposer.prototype.render;
    const report = await seam.passTimes();
    try {
      expect(report, 'the entry module gave the seam no pass-timer loader').toEqual({ installed: true, mode: 'segments', contexts: [] });
      expect(EffectComposer.prototype.render, 'the loaded timer did not patch the composer the game renders with').not.toBe(unpatched);
    } finally {
      (await import('../../src/render/passTimer.js')).installPassTimer().uninstall();
    }
  });

  it('hands the seam the sky frame\'s sun: info().sun follows the direction the sky publishes', async () => {
    const { seam } = await bootAt('?lookbook=1');
    const { skyFrameRef } = await import('../../src/render/mood.js');
    const dir = skyFrameRef.current.sunDir;
    const was = [...dir];
    try {
      for (const [d, heading, elevation] of [[[-Math.SQRT1_2, Math.SQRT1_2, 0], 270, 45], [[0.6, 0, 0.8], 143, 0]]) {
        for (let j = 0; j < 3; j++) dir[j] = d[j];
        const sun = seam.info().sun;
        expect(sun, 'the entry module gave the seam no sun reader').not.toBeNull();
        expect([Math.round(sun.heading), Math.round(sun.elevationDeg)], 'info().sun does not follow the sky frame').toEqual([heading, elevation]);
      }
    } finally {
      for (let j = 0; j < 3; j++) dir[j] = was[j];
    }
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
