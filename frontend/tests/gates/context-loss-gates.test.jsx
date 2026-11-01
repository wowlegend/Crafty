// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore';
import { STRINGS } from '../../src/i18n/strings.js';
import { writeWorld } from '../../src/game/worldSaves.js';
import { ContextLossPanel } from '../../src/ui/ContextLossPanel.jsx';
import { recoverFromContextLoss, whenDrawnAgain, onContextLost, onContextRestored } from '../../src/game/contextRecovery.js';
import { bootWorld, takeBootNote, BOOT_NOTE_KEY } from '../../src/game/worldBoot.js';
import { listWorlds, readWorld } from '../../src/game/worldSaves.js';
import { shadowWorldEpoch } from '../../src/render/shadowSchedule.js';
import { resolveResumeSpawn, RESUME_PROBE_MAX_SEC, SPAWN_PROBE_MAX_SEC } from '../../src/game/spawnPlacement.js';
import { voxelIndex } from '../../src/world/chunkLayout.js';
import { DEEP_FLOOR } from '../../src/world/oceanProfile.js';

/**
 * A LOST WEBGL CONTEXT HAS A WAY BACK (plan 2026-10-27-crafty-steady-cool, item e; masterpiece 0f).
 *
 * GameScene marked the store's isWebGLContextLost on `webglcontextlost`, and nothing read it (grep: one writer, zero
 * readers). On an iPad that drops the context under memory pressure, the player got a black canvas under a live HUD.
 * Now a panel derived from that flag offers one tap: save, leave the tab's note, reload, and the boot (game/worldBoot.js,
 * before the first render) loads the noted world. This renders the real panel against the real store and drives the
 * real recovery and the real boot.
 * BLIND SPOT: that GameScene's listeners set the flag on a real context loss, and that the reload lands in the world,
 * are the e2e's (tests/e2e/context-loss.spec.js, WEBGL_lose_context).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/ui/ContextLossPanel.jsx, src/game/contextRecovery.js and
 * src/game/worldBoot.js, receipts in the commit:
 *   L1 the panel ignores the flag (never shows)                     -> RED expected
 *   L2 plausible-wrong: reload BEFORE the save                      -> RED expected (save precedes reload)
 *   L3 the note is not written                                      -> RED expected
 *   L4 plausible-wrong: the note is read but never removed          -> RED expected (a second boot loads it again)
 *   L5 the boot ignores the note                                    -> RED expected
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

  it('a tap saves the world where the player stands, leaves the note naming it, then reloads', () => {
    const order = [];
    const save = vi.fn(() => { order.push('save'); useGameStore.setState({ _sessionWorldId: 'local_abc' }); });
    useGameStore.setState({
      isWebGLContextLost: true,
      gameStarted: true,
      _sessionWorldId: null,
      saveActiveWorld: save,
      playerRigidBodyRef: { current: { translation: () => ({ x: 4, y: 52, z: -7 }) } },
    });
    const reload = vi.fn(() => order.push(`reload:${window.sessionStorage.getItem(BOOT_NOTE_KEY)}`));
    render(<ContextLossPanel reload={reload} />);
    fireEvent.click(screen.getByTestId('context-loss-resume'));
    expect(save).toHaveBeenCalledWith({ x: 4, y: 52, z: -7 });
    expect(order, 'the reload must come after the save, with the note already written').toEqual(['save', 'reload:{"world":"local_abc"}']);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('the note resumes the world at boot, once', () => {
  const saves = { listWorlds, readWorld };
  it('a reload after a recovery loads the noted world, and only once: the next load of the tab is a plain visit', () => {
    writeWorld('local_resume', { name: 'Skyhold', created_at: 'x', is_owner: true }, { id: 'local_resume', player_data: { level: 7 } });
    writeWorld('local_newer', { name: 'Newer', created_at: 'x', is_owner: true }, { id: 'local_newer', player_data: { level: 2 } });
    window.sessionStorage.setItem(BOOT_NOTE_KEY, JSON.stringify({ world: 'local_resume' }));
    const load = vi.fn();
    useGameStore.setState({ loadWorldData: load });
    bootWorld({ store: useGameStore, session: window.sessionStorage, saves });
    expect(load, 'the boot did not resume the world').toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0][0].id, 'the boot loaded another world than the note names').toBe('local_resume');
    expect(window.sessionStorage.getItem(BOOT_NOTE_KEY), 'the note survived its use').toBeNull();
    bootWorld({ store: useGameStore, session: window.sessionStorage, saves });
    expect(load.mock.calls.map((c) => c[0].id), 'a second load of the tab followed the note again').toEqual(['local_resume', 'local_newer']);
    useGameStore.setState({ loadWorldData: realLoadWorldData });
  });

  it('a note naming a world that no longer exists falls back to the plain visit, and is still cleared', () => {
    const s = memoryStorage();
    s.setItem(BOOT_NOTE_KEY, JSON.stringify({ world: 'gone' }));
    writeWorld('local_kept', { name: 'Kept', created_at: 'x', is_owner: true }, { id: 'local_kept' });
    const load = vi.fn();
    useGameStore.setState({ loadWorldData: load });
    expect(bootWorld({ store: useGameStore, session: s, saves })).toEqual({ kind: 'world', id: 'local_kept' });
    expect(s.getItem(BOOT_NOTE_KEY)).toBeNull();
    expect(takeBootNote(s), 'a cleared note read back').toBeNull();
    useGameStore.setState({ loadWorldData: realLoadWorldData });
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
  it('before Start: no save, and the note brings the tab back to what its title showed', () => {
    const s = memoryStorage();
    const st = { saveActiveWorld: vi.fn(), playerPosition: { x: 1, y: 2, z: 3 }, _sessionWorldId: null, gameStarted: false };
    const reload = vi.fn();
    expect(recoverFromContextLoss({ getState: () => st, storage: s, reload })).toBeNull();
    expect(st.saveActiveWorld, 'a loss on the title saved a world nobody played').not.toHaveBeenCalled();
    expect(JSON.parse(s.getItem(BOOT_NOTE_KEY)), 'a new world\'s title came back as another world').toEqual({ fresh: true });
    expect(reload, 'the graphics were never recovered').toHaveBeenCalledTimes(1);
    const loaded = { ...st, _sessionWorldId: 'w_title' };
    expect(recoverFromContextLoss({ getState: () => loaded, storage: s, reload })).toBe('w_title');
    expect(loaded.saveActiveWorld, 'a loss on the title saved a world nobody played').not.toHaveBeenCalled();
    expect(JSON.parse(s.getItem(BOOT_NOTE_KEY)), 'the title\'s loaded world was not noted').toEqual({ world: 'w_title' });
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
    // Both waits are seconds, the step taken each frame: the hold ends on the frame whose step reaches the bound, at any
    // frame rate, and the resume waits the longer (its column may be chunks away). The Player's own hold at 60 and 120 Hz
    // is tests/gates/player-placement-gates.test.jsx's.
    expect(resolveResumeSpawn(saved, null, RESUME_PROBE_MAX_SEC - 1 / 120, 1 / 120)).toEqual({ place: null, hold: false });
    expect(resolveResumeSpawn(saved, null, RESUME_PROBE_MAX_SEC - 2 / 120, 1 / 120)).toEqual({ place: null, hold: true });
    expect(RESUME_PROBE_MAX_SEC).toBeGreaterThan(SPAWN_PROBE_MAX_SEC);
    for (const bad of [null, { x: NaN, y: 60, z: 1 }, { x: 1, y: 0.5, z: 3 } /* under the world's floor (game/spawnPlacement.js isVoidFall) */, { x: 1, y: 60 }]) {
      expect(resolveResumeSpawn(bad, 70, 0), JSON.stringify(bad)).toEqual({ place: null, hold: false });
    }
  });
  it('the boot\'s load hands the save\'s position to the spawn; a boot with nothing saved leaves none', () => {
    const saves = { listWorlds, readWorld };
    useGameStore.setState({ resumeSpawn: null, loadWorldData: realLoadWorldData, terrainWorker: null });
    expect(bootWorld({ store: useGameStore, session: window.sessionStorage, saves }).kind, 'SETUP: an empty disk loaded something').toBe('none');
    expect(useGameStore.getState().resumeSpawn, 'nothing saved, yet a resume position').toBeNull();
    writeWorld('local_edits', { name: 'Edits', created_at: 'x', is_owner: true }, editedSave());
    window.sessionStorage.setItem(BOOT_NOTE_KEY, JSON.stringify({ world: 'local_edits' }));
    expect(bootWorld({ store: useGameStore, session: window.sessionStorage, saves }).kind, 'SETUP: the boot did not resume the world').toBe('world');
    expect(useGameStore.getState().resumeSpawn, 'the resumed save will spawn on the origin column').toEqual(saved);
    useGameStore.setState({ resumeSpawn: null, worldReloading: false });
  });
});
