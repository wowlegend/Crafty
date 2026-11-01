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
 * THE SEAM IS A LAZY CHUNK (DECISIONS 2026-10-31 item 282). The entry module loads render/lookbookSeam.js with a dynamic
 * import on a `?lookbook=1` page and on no other, so a player does not download it. This gate holds the three halves of
 * that contract: a plain page never loads the module (counted by the mock above) and boots in the same run as the
 * entry module; a `?lookbook=1` page loads it once and installs it; and window.useGameStore and the seam appear in one
 * run, because the probes, the e2e boot and prod-smoke wait on the store and then read the seam.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/index.jsx, 9 tests, every RED confirmed against a green baseline
 * (the lines below were observed again on the lazy-chunk entry module, 2026-10-31):
 *   X1 the install call skipped (`false && installLookbookSeam?.(...)`) -> all nine tests (the wait for the seam times out)
 *   X2 plausible-wrong: getActive reads a constant true -> "drives the REAL input gate"
 *   X3 plausible-wrong: setActive a no-op -> the same test
 *   X4 plausible-wrong: cycleOf hands back the raw gameTime -> "lands the REAL store on the asked cycle"
 *   X5 glInfo replaced by () => null -> "reports the diagnostics the readout reads"
 *   X6 plausible-wrong: contextLosses a constant 0 -> the same test
 *   X8 the spawnDragon collaborator left out of the install -> "hands the seam the boss system's lookbook spawn"
 *   Y1 plausible-wrong: a plain page imports the seam statically (`import './render/lookbookSeam.js'`) -> "installs nothing without ?lookbook=1"
 *   Y2 plausible-wrong: every page fetches the seam (the `?lookbook=1` test dropped from the entry module) -> the same test
 *   Y3 plausible-wrong: the store set when the module runs, the seam when its chunk arrives -> the same test
 *   X7 the URL test dropped inside the seam (src/render/lookbookSeam.js: `if (!win) return false;`) SURVIVED here, by
 *      design: the entry module never loads the seam on a plain page, so the seam's own URL test cannot be reached from
 *      this file. It is tests/gates/lookbook-seam-gates.test.js's ("installs window.__craftyLookbook only with the parameter").
 *   I0 identity (a comment edit in index.jsx) SURVIVED.
 *
 * BLIND SPOT: App is a stub, so whether the GAME reads what the seam writes (the Player's pose, PositionTracker, the
 * readout) is tests/gates/player-lookbook-pose-gates.test.jsx, gamescene-diagnostics-wiring-gates.test.jsx and the
 * e2e (tests/e2e/lookbook-seam.spec.js, on the DEV server). That the shipped BUNDLE keeps this call (it is not
 * DEV-gated) is scripts/ci/prod-smoke.mjs's seamVerdict, which loads the production build with and without
 * `?lookbook=1`; that the seam is its own chunk there is scripts/ci/bundle-budget.mjs's lookbook-seam marker check. This
 * file loads the source through vitest, which shows when the entry module imports the seam, not what a bundler emits.
 */

vi.mock('../../src/App', () => ({ default: () => null }));

// Counts how many times the seam's module is loaded, and passes it through unchanged. The seam is its own chunk in the
// shipped bundle (scripts/ci/bundle-budget.mjs), which only holds if the entry module fetches it on `?lookbook=1` and on
// no other page.
const loads = vi.hoisted(() => ({ seam: 0 }));
vi.mock('../../src/render/lookbookSeam.js', async (importOriginal) => {
  loads.seam += 1;
  return importOriginal();
});

const mobsInWorld = (ecs) => [...ecs.with('isMob', 'position', 'type').entities];

/** A fresh copy of the entry module and every module it imports, loaded on a page at `search`. A plain page boots in the
 *  same run as the import; a `?lookbook=1` page boots when the seam's module arrives (src/index.jsx boot), so it is
 *  waited for, and a plain page waits for every import it started to settle, so a late load would be counted. */
async function bootAt(search) {
  vi.resetModules();
  loads.seam = 0;
  delete window.__craftyLookbook;
  // What a script that saw window.useGameStore appear would find once the run that set it ends: the probes, the e2e boot
  // and scripts/ci/prod-smoke.mjs all wait on the store and then read the seam, so the two must land in one run.
  let seamWhenStoreSet;
  delete window.useGameStore;
  Object.defineProperty(window, 'useGameStore', {
    configurable: true,
    set(value) {
      Promise.resolve().then(() => { seamWhenStoreSet = window.__craftyLookbook; });
      Object.defineProperty(window, 'useGameStore', { configurable: true, writable: true, value });
    },
  });
  window.history.replaceState(null, '', `/${search}`);
  document.body.innerHTML = '<div id="root"></div>';
  // index.jsx renders into a React 19 root at import. Flushed inside act() so no scheduled render outlives the test:
  // left to the scheduler it ran after jsdom's teardown and threw 'window is not defined' five times, which fails the
  // push tier's vitest run even with every assertion green (instruments push of 2026-10-28).
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  await act(async () => {
    await import('../../src/index.jsx');
    if (search) {
      await vi.waitFor(() => {
        if (!window.__craftyLookbook) throw new Error('the entry module did not install the seam on ?lookbook=1 — the probe has no door');
      }, { timeout: 10000 });
    } else {
      await vi.dynamicImportSettled();
    }
  });
  return {
    seam: window.__craftyLookbook,
    seamWhenStoreSet,
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
    expect(window.useGameStore, 'presence: a plain page boots in the same run as the entry module').toBe(plain.store);
    expect(plain.seam, 'a page without ?lookbook=1 got the seam — every player would carry it').toBeUndefined();
    expect(loads.seam, 'a page without ?lookbook=1 loaded the seam\'s module — every player would download it').toBe(0);
    const { seam, seamWhenStoreSet } = await bootAt('?lookbook=1');
    expect(loads.seam, 'presence: the counter must see the one load a ?lookbook=1 page makes').toBe(1);
    expect(seamWhenStoreSet, 'window.useGameStore appeared before the seam was installed — a probe that waits on the store reads no seam').toBe(seam);
    expect(seam, 'the entry module did not install the seam on ?lookbook=1 — the probe has no door').toBeDefined();
    expect(Object.keys(seam).sort()).toEqual(['clear', 'clearHostiles', 'dragon', 'form', 'groundAt', 'handPose', 'info', 'look', 'mobs', 'passTimes', 'passesOff', 'play', 'pose', 'setCycle', 'stage', 'stand', 'unstage', 'frame'].sort());
  });

  it('hands the seam the boss system\'s lookbook spawn, read from the store at the call', async () => {
    const { seam, store } = await bootAt('?lookbook=1');
    // App is a stub here, so no boss system installed its spawn: dragon() must say so rather than pretend.
    expect(() => seam.dragon({ pose: 'rest', position: [1, 60, 2] }), 'presence: the stubbed App installed a spawn').toThrow(/not installed/);
    const calls = [];
    store.setState({ lookbookSpawnDragon: (o) => { calls.push(o); return { position: o.position }; } });
    try {
      expect(seam.dragon({ pose: 'rest', position: [1, 60, 2] })).toEqual({ position: [1, 60, 2] });
      expect(calls, 'the entry module handed the seam some other spawn').toEqual([{ position: [1, 60, 2] }]);
      expect(seam.info().dragon.hold).toBe('rest');
    } finally {
      seam.dragon({ pose: null });
      store.setState({ lookbookSpawnDragon: null });
    }
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
    const npc = ecs.add({ id: 77, isMob: true, isNPC: true, npcName: 'Sister Wren', type: 'villager', health: 200, passive: true, position: { x: 3, y: 50, z: -2 } });
    try {
      expect(seam.mobs(), 'the entry module gave mobs() no mob query, or the wrong one')
        .toEqual([{ id: 77, type: 'villager', hostile: false, npc: 'Sister Wren', position: [3, 50, -2] }]);
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
