// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore';
import { STRINGS } from '../../src/i18n/strings.js';
import { writeWorld } from '../../src/game/worldSaves.js';
import { ContextLossPanel } from '../../src/ui/ContextLossPanel.jsx';
import { recoverFromContextLoss, consumeResumeWorld, whenDrawnAgain, onContextLost, onContextRestored, RESUME_WORLD_KEY } from '../../src/game/contextRecovery.js';
import { shadowWorldEpoch } from '../../src/render/shadowSchedule.js';
import { resolveResumeSpawn, RESUME_PROBE_MAX_FAILS, SPAWN_PROBE_MAX_SEC } from '../../src/game/spawnPlacement.js';
import { voxelIndex } from '../../src/world/chunkLayout.js';
import { DEEP_FLOOR } from '../../src/world/oceanProfile.js';

/**
 * A LOST WEBGL CONTEXT HAS A WAY BACK (plan 2026-10-27-crafty-steady-cool, item e; masterpiece 0f).
 *
 * GameScene marked the store's isWebGLContextLost on `webglcontextlost`, and nothing read it (grep: one writer, zero
 * readers). On an iPad that drops the context under memory pressure, the player got a black canvas under a live HUD.
 * Now a panel derived from that flag offers one tap: save, leave a session breadcrumb, reload — and at boot the
 * breadcrumb loads the same world. This renders the real panel against the real store and drives the real recovery.
 * BLIND SPOT: that GameScene's listeners set the flag on a real context loss, and that the reload lands in the world,
 * are the e2e's (tests/e2e/context-loss.spec.js, WEBGL_lose_context).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/ui/ContextLossPanel.jsx and src/game/contextRecovery.js, receipts in
 * the commit:
 *   L1 the panel ignores the flag (never shows)                     -> RED expected
 *   L2 plausible-wrong: reload BEFORE the save                      -> RED expected (save precedes reload)
 *   L3 the breadcrumb is not written                                -> RED expected
 *   L4 plausible-wrong: the breadcrumb is read but never removed     -> RED expected (a second boot loads again)
 *   L5 the boot resume effect removed                               -> RED expected
 *   L0 identity (a comment edit)                                    -> must SURVIVE
 */
const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  useGameStore.setState({ isWebGLContextLost: false });
});
afterEach(cleanup);

describe('the panel is derived from the store flag', () => {
  it('hidden while the context is fine; shown, with the localised copy, once it is lost', () => {
    render(<ContextLossPanel reload={() => {}} />);
    expect(screen.queryByTestId('context-loss-panel'), 'the panel showed with a healthy context').toBeNull();
    useGameStore.setState({ isWebGLContextLost: true });
    cleanup();
    render(<ContextLossPanel reload={() => {}} />);
    const panel = screen.getByTestId('context-loss-panel');
    expect(panel.textContent).toContain(STRINGS.en['ui.contextLost']);
    expect(STRINGS.en['ui.contextLost']).toBe('Graphics were reset by the system — tap to resume');
    expect(STRINGS['zh-CN']['ui.contextLost'], 'no zh-CN copy').toBeTruthy();
    expect(STRINGS['zh-CN']['ui.contextLost']).not.toBe(STRINGS.en['ui.contextLost']);
  });

  it('a tap saves the world where the player stands, leaves the breadcrumb, then reloads', () => {
    const order = [];
    const save = vi.fn(() => { order.push('save'); useGameStore.setState({ _sessionWorldId: 'local_abc' }); });
    useGameStore.setState({
      isWebGLContextLost: true,
      gameStarted: true,
      _sessionWorldId: null,
      saveActiveWorld: save,
      playerRigidBodyRef: { current: { translation: () => ({ x: 4, y: 52, z: -7 }) } },
    });
    const reload = vi.fn(() => order.push(`reload:${window.sessionStorage.getItem(RESUME_WORLD_KEY)}`));
    render(<ContextLossPanel reload={reload} />);
    fireEvent.click(screen.getByTestId('context-loss-resume'));
    expect(save).toHaveBeenCalledWith({ x: 4, y: 52, z: -7 });
    expect(order, 'the reload must come after the save, with the breadcrumb already written').toEqual(['save', 'reload:local_abc']);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('the breadcrumb resumes the world at boot, once', () => {
  it('a reload after a recovery loads the world the tab was playing, and only once', () => {
    const data = { id: 'local_resume', player_data: { level: 7 } };
    writeWorld('local_resume', { name: 'Skyhold', created_at: 'x', is_owner: true }, data);
    window.sessionStorage.setItem(RESUME_WORLD_KEY, 'local_resume');
    const load = vi.fn();
    useGameStore.setState({ loadWorldData: load });
    render(<ContextLossPanel reload={() => {}} />);
    expect(load, 'the boot did not resume the world').toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0].id).toBe('local_resume');
    expect(window.sessionStorage.getItem(RESUME_WORLD_KEY), 'the breadcrumb survived its use').toBeNull();
    cleanup();
    render(<ContextLossPanel reload={() => {}} />);
    expect(load, 'a second boot resumed again').toHaveBeenCalledTimes(1);
  });

  it('a breadcrumb naming a world that no longer exists loads nothing and is still cleared', () => {
    const s = memoryStorage();
    s.setItem(RESUME_WORLD_KEY, 'gone');
    expect(consumeResumeWorld({ storage: s, readWorld: () => null })).toBeNull();
    expect(s.getItem(RESUME_WORLD_KEY)).toBeNull();
  });

  it('storage that throws (private mode) does not stop the recovery reload', () => {
    const reload = vi.fn();
    const throwing = { setItem: () => { throw new Error('denied'); } };
    const st = { saveActiveWorld: vi.fn(), playerPosition: { x: 1, y: 2, z: 3 }, _sessionWorldId: 'w', gameStarted: true };
    recoverFromContextLoss({ getState: () => st, storage: throwing, reload });
    expect(st.saveActiveWorld).toHaveBeenCalledWith({ x: 1, y: 2, z: 3 });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

/**
 * THE PANEL IS CLICKABLE, AND A LOSS ON THE TITLE SAVES NOTHING (review 2026-10-27, steady-cool LOW 5). A desktop player
 * whose pointer is locked cannot click anything: the loss now releases the lock. And before Start there is no world in
 * play — a save there minted a slot from the title's untouched state, and the breadcrumb resumed it.
 * BLIND SPOT: that GameScene's listener calls onContextLost; a headless page refuses pointer lock, so no e2e can see it.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/game/contextRecovery.js, one batch, receipts in the commit:
 *   P1 the loss never releases the lock                                -> RED expected
 *   P2 plausible-wrong: a loss before Start still saves                -> RED expected
 *   P3 plausible-wrong: a loss before Start neither saves nor reloads  -> RED expected
 *   P0 identity (a comment edit)                                       -> must SURVIVE
 */
describe('the loss releases the pointer; a loss before Start only reloads', () => {
  it('a locked pointer is released, an unlocked one (touch, or the title) is left alone; the loss is marked either way', () => {
    for (const locked of [true, false]) {
      const doc = { pointerLockElement: locked ? {} : null, exitPointerLock: vi.fn() };
      const setLost = vi.fn();
      onContextLost({ setLost, doc });
      expect(setLost).toHaveBeenCalledWith(true);
      expect(doc.exitPointerLock, `locked ${locked}`).toHaveBeenCalledTimes(locked ? 1 : 0);
    }
  });
  it('before Start: the reload alone — no save, no breadcrumb', () => {
    const s = memoryStorage();
    const st = { saveActiveWorld: vi.fn(), playerPosition: { x: 1, y: 2, z: 3 }, _sessionWorldId: null, gameStarted: false };
    const reload = vi.fn();
    expect(recoverFromContextLoss({ getState: () => st, storage: s, reload })).toBeNull();
    expect(st.saveActiveWorld, 'a loss on the title saved a world nobody played').not.toHaveBeenCalled();
    expect(s.getItem(RESUME_WORLD_KEY), 'a loss on the title left a breadcrumb').toBeNull();
    expect(reload, 'the graphics were never recovered').toHaveBeenCalledTimes(1);
    // Presence: the same call in play does save (the instrument sees the save it is asserting absent above).
    const played = { ...st, gameStarted: true, _sessionWorldId: 'w' };
    recoverFromContextLoss({ getState: () => played, storage: s, reload });
    expect(played.saveActiveWorld).toHaveBeenCalledTimes(1);
  });
});

/**
 * THE RESUMED WORLD IS THE ONE THAT WAS PLAYED: ITS BLOCKS AND WHERE THE PLAYER STOOD (review 2026-10-27, steady-cool
 * HIGH 2). The resume loads the save at App mount, before the Canvas's children exist: loadWorldData sent the block
 * edits to the terrain worker only `if (state.terrainWorker)` — null then — so they were dropped, and the boot spawn
 * always landed on the origin column. The e2e checked coins only, and passed. Now the edits wait for the worker's
 * publication (store setTerrainWorker) and the spawn reads a one-shot resumeSpawn (game/spawnPlacement.js).
 * BLIND SPOT: that Terrain publishes THROUGH setTerrainWorker and that the Player's spawn reads resumeSpawn are the e2e's
 * (tests/e2e/context-loss.spec.js: a placed block's collider and the player's column after the reload).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, one batch, receipts in the commit:
 *   R1 setTerrainWorker never delivers pending edits                         -> RED expected
 *   R2 loadWorldData never marks its edits pending                           -> RED expected
 *   R3 plausible-wrong: the delivery leaves the edits pending (sent twice)   -> RED expected
 *   R4 plausible-wrong: the resume spawn places before its column loaded     -> RED expected
 *   R5 plausible-wrong: the resume spawn places at the probe height          -> RED expected
 *   R6 the boot resume never sets resumeSpawn                                -> RED expected
 *   R0 identity (a comment edit in spawnPlacement.js)                        -> must SURVIVE
 */
/**
 * A RESTORE CLEARS THE PANEL ONLY ONCE THE WORLD HAS BEEN DRAWN AGAIN (review 2026-10-27, steady-cool MED 3). The e2e's
 * old "draws again" check counted frame-loop callbacks, which keep running while the context is lost, so it could not
 * fail; it now reads pixels. Here: the gate GameScene's restore handler passes the flag through, on a hand-cranked rAF.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/game/contextRecovery.js, one batch, receipts in the commit:
 *   D1 onDrawn at once (no wait for a frame)                                       -> RED expected
 *   D2 plausible-wrong: compares the frame number only (three re-creates gl.info)  -> RED expected (never clears)
 *   D3 plausible-wrong: a re-created gl.info counts as drawn by itself             -> RED expected
 *   D0 identity (a comment edit)                                                   -> must SURVIVE
 */
describe('whenDrawnAgain: the restore is believed once three has rendered since', () => {
  const crank = () => {
    let q = [];
    return { raf: (fn) => q.push(fn), flush: () => { const run = q; q = []; run.forEach((fn) => fn()); } };
  };
  it('three\'s handler ran first (gl.info already fresh at 0): not before its first render, then once', () => {
    const gl = { info: { render: { frame: 0 } } };
    const onDrawn = vi.fn();
    const r = crank();
    whenDrawnAgain(gl, onDrawn, r.raf);
    r.flush(); r.flush();
    expect(onDrawn, 'cleared with nothing drawn since the restore').not.toHaveBeenCalled();
    gl.info.render.frame = 1;
    r.flush(); r.flush();
    expect(onDrawn).toHaveBeenCalledTimes(1);
  });
  it('ours ran first (the old gl.info, mid-count): the fresh one three installs counts from 0', () => {
    const gl = { info: { render: { frame: 512 } } };
    const onDrawn = vi.fn();
    const r = crank();
    whenDrawnAgain(gl, onDrawn, r.raf);
    gl.info = { render: { frame: 0 } }; // three's initGLContext on the same event
    r.flush();
    expect(onDrawn, 'a re-created counter at 0 was read as a frame drawn').not.toHaveBeenCalled();
    gl.info.render.frame = 1;
    r.flush();
    expect(onDrawn, 'the first frame on the fresh counter was not seen').toHaveBeenCalledTimes(1);
  });
});

/**
 * A RESTORE ASKS FOR THE SUN'S SHADOW AGAIN (review 2026-10-27, steady-cool LOW 6). The shadow map renders on demand
 * (render/shadowSchedule.js) and comes back EMPTY after a restore; with a still camera and nothing moving, nothing asked
 * for one. GameScene's restore handler is onContextRestored: it bumps the world epoch the schedule renders on, then waits
 * for a drawn frame to clear the loss.
 * BLIND SPOT: that the bumped epoch reaches a shadow render is Atmosphere's schedule (tests/gates/shadow-schedule-gates).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/game/contextRecovery.js, one batch, receipts in the commit:
 *   S1 the restore never asks for a shadow render              -> RED expected
 *   S2 plausible-wrong: the loss cleared before a frame is drawn -> RED expected
 *   S0 identity (a comment edit)                               -> must SURVIVE
 */
describe('onContextRestored: a shadow render is asked for, and the loss clears on a drawn frame', () => {
  it('bumps the shadow world epoch once, at the restore; clears the loss only after three renders', () => {
    const gl = { info: { render: { frame: 0 } } };
    const setLost = vi.fn();
    const q = [];
    const e0 = shadowWorldEpoch();
    onContextRestored(gl, { setLost, raf: (fn) => q.push(fn) });
    expect(shadowWorldEpoch() - e0, 'the restore did not ask for a shadow render').toBe(1);
    q.shift()();
    expect(setLost, 'the loss cleared before anything was drawn').not.toHaveBeenCalled();
    gl.info.render.frame = 3;
    q.shift()();
    expect(setLost).toHaveBeenCalledWith(false);
  });
});

const realLoadWorldData = useGameStore.getState().loadWorldData;
const editedSave = () => ({
  id: 'local_edits',
  player_data: { position: { x: 24.5, y: 61.2, z: -20.5 } },
  world_data: { blocks: [['26_70_-18', 3]] },
});
// x 26 -> chunk 1, local 10; z -18 -> chunk -2, local 14 (CHUNK_SIZE 16, floor division): every axis non-zero and distinct.
const EDIT = [1, -2, voxelIndex(10, 70, 14), 3];

describe('block edits loaded before the world mounted reach the terrain worker when it is published', () => {
  beforeEach(() => {
    useGameStore.setState({ loadWorldData: realLoadWorldData, terrainWorker: null, _worldEditsPending: false, playerRigidBodyRef: null, worldBlocks: new Map() });
  });

  it('no worker at load: nothing is sent then; the publish sends the save\'s edits, once', () => {
    useGameStore.getState().loadWorldData(editedSave());
    expect(useGameStore.getState().worldBlocks.get('26_70_-18'), 'SETUP: the save\'s edit is not in the store').toBe(3);
    const worker = { postMessage: vi.fn() };
    useGameStore.getState().setTerrainWorker(worker);
    expect(useGameStore.getState().terrainWorker).toBe(worker);
    expect(worker.postMessage, 'the published worker was never sent the edits loaded before it existed').toHaveBeenCalledTimes(1);
    // The save holds no seed, so the world it loads is seed 12345 (world/worldSeed.js).
    expect(worker.postMessage.mock.calls[0][0]).toEqual({ type: 'load_modifications', payload: { modifications: [EDIT], seed: 12345 } });
    // A remount publishes again: the worker already holds these edits, so nothing is resent.
    const again = { postMessage: vi.fn() };
    useGameStore.getState().setTerrainWorker(null);
    useGameStore.getState().setTerrainWorker(again);
    expect(again.postMessage, 'the edits were delivered twice').not.toHaveBeenCalled();
  });

  it('a live worker at load gets the edits at once, and a later publish does not resend them', () => {
    const worker = { postMessage: vi.fn() };
    useGameStore.getState().setTerrainWorker(worker);
    expect(worker.postMessage, 'a publish with nothing pending sent something').not.toHaveBeenCalled();
    useGameStore.getState().loadWorldData(editedSave());
    expect(worker.postMessage.mock.calls.map((c) => c[0])).toEqual([{ type: 'load_modifications', payload: { modifications: [EDIT], seed: 12345 } }]);
    const next = { postMessage: vi.fn() };
    useGameStore.getState().setTerrainWorker(next);
    expect(next.postMessage).not.toHaveBeenCalled();
  });
});

describe('the resumed save spawns the player where they stood', () => {
  const saved = { x: 24.5, y: 61.2, z: -20.5 };
  it('holds there while the column has no collider, counting toward a bounded wait', () => {
    for (const probe of [null, undefined, NaN]) {
      expect(resolveResumeSpawn(saved, probe, 0), `probe ${probe}`).toEqual({ place: null, hold: true });
    }
  });
  it('once the column loads, places the body at the SAVED position — the probe is proof of colliders, not a height', () => {
    // 75: the probe hits a roof above where the player stood. The saved y is where they were.
    expect(resolveResumeSpawn(saved, 75, 12)).toEqual({ place: saved, hold: false });
    expect(resolveResumeSpawn(saved, 58.5, 0)).toEqual({ place: saved, hold: false });
    // The deep ocean's seabed (world/oceanProfile.js, 6 to 10) lies under the origin spawn's probe floor of 15: a column
    // answered there is loaded all the same (a save made swimming was held 600 frames, then reset to the origin).
    const swimming = { x: 300.5, y: 20, z: 0.5 };
    for (const seabed of [DEEP_FLOOR, DEEP_FLOOR + 4, 15]) {
      expect(resolveResumeSpawn(swimming, seabed, 0), `seabed ${seabed}`).toEqual({ place: swimming, hold: false });
    }
  });
  it('gives up for the origin spawn when the column never loads, or the save is unusable', () => {
    expect(resolveResumeSpawn(saved, null, RESUME_PROBE_MAX_FAILS - 1)).toEqual({ place: null, hold: false });
    // the resume's wait is counted in frames, the origin spawn's in seconds: at 60 Hz the resume waits the longer
    expect(RESUME_PROBE_MAX_FAILS / 60).toBeGreaterThan(SPAWN_PROBE_MAX_SEC);
    for (const bad of [null, { x: NaN, y: 60, z: 1 }, { x: 1, y: 0.5, z: 3 } /* under the world's floor (game/spawnPlacement.js isVoidFall) */, { x: 1, y: 60 }]) {
      expect(resolveResumeSpawn(bad, 70, 0), JSON.stringify(bad)).toEqual({ place: null, hold: false });
    }
  });
  it('the boot resume hands the save\'s position to the spawn; a boot with no breadcrumb leaves none', () => {
    writeWorld('local_edits', { name: 'Edits', created_at: 'x', is_owner: true }, editedSave());
    useGameStore.setState({ resumeSpawn: null, loadWorldData: vi.fn() });
    render(<ContextLossPanel reload={() => {}} />);
    expect(useGameStore.getState().resumeSpawn, 'SETUP: no breadcrumb, yet a resume position').toBeNull();
    cleanup();
    window.sessionStorage.setItem(RESUME_WORLD_KEY, 'local_edits');
    render(<ContextLossPanel reload={() => {}} />);
    expect(useGameStore.getState().loadWorldData, 'SETUP: the boot did not resume the world').toHaveBeenCalledTimes(1);
    expect(useGameStore.getState().resumeSpawn, 'the resumed save will spawn on the origin column').toEqual(saved);
    useGameStore.setState({ resumeSpawn: null, loadWorldData: realLoadWorldData });
  });
});
