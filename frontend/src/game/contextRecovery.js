// contextRecovery — the way back from a lost WebGL context (plan docs/superpowers/plans/2026-10-27-crafty-steady-cool.md,
// item e; masterpiece 0f).
//
// iOS Safari drops a WebGL context under memory pressure, and browsers drop one after a GPU reset. GameScene marked the
// store's isWebGLContextLost and nothing read it: the player was left with a black canvas under a live HUD, mobs still
// swinging, and no way back but a reload they had to think of themselves — losing whatever the debounced autosave had
// not written yet. A restored context is not reliable either (every GPU resource is gone, and three re-creates them
// lazily, if the context comes back at all), so the recovery is a reload: save first, then reload INTO THE SAME WORLD.
//
// Why a session-scoped breadcrumb: nothing resumes a save at boot (a reload lands on the title, and the session's world
// id is deliberately in-memory only — useGameStore saveActiveWorld's B2a note). sessionStorage survives a reload of the
// same tab and dies with it, which is exactly "resume what this tab was playing" and nothing more.
import { markShadowWorldChanged } from '../render/shadowSchedule.js';

/** The sessionStorage key holding the world this tab was playing when its context was lost. */
export const RESUME_WORLD_KEY = 'crafty.resumeWorldId';

/**
 * GameScene's `webglcontextlost` handler, after preventDefault: mark the loss, and release a locked pointer. The panel is
 * the only way back, and a desktop player whose pointer is locked cannot click it (review 2026-10-27, steady-cool LOW 5).
 * Touch has no lock. The unlock opens the pause panel underneath (App); the context-loss panel sits above it (z-modal).
 * @param {{ setLost: (lost: boolean) => void, doc?: Document }} deps
 */
export function onContextLost({ setLost, doc = document }) {
  setLost(true);
  if (doc.pointerLockElement && typeof doc.exitPointerLock === 'function') doc.exitPointerLock();
}

/**
 * GameScene's `webglcontextrestored` handler. three re-creates its GPU state on the same event, and the sun's shadow map
 * comes back EMPTY: it renders on demand (render/shadowSchedule.js), so with a still camera and nothing moving nothing
 * asked for one and the world stood unshadowed (review 2026-10-27, steady-cool LOW 6). Ask for one, then clear the loss
 * once three has drawn (whenDrawnAgain).
 * @param {{ info: { render: { frame: number } } }} gl the WebGLRenderer
 * @param {{ setLost: (lost: boolean) => void, raf?: (fn: () => void) => void }} deps
 * @returns {() => void} cancel the wait for a frame
 */
export function onContextRestored(gl, { setLost, raf }) {
  markShadowWorldChanged();
  return whenDrawnAgain(gl, () => setLost(false), raf);
}

/**
 * Save the live world, leave a breadcrumb naming it, then reload. Order matters: the save must land before the reload.
 * Before Start there is no world in play: a save would mint a slot from the title's untouched state and the breadcrumb
 * would resume it, so the recovery is the reload alone (review 2026-10-27, steady-cool LOW 5).
 * @param {{ getState: () => object, storage: Storage, reload: () => void }} deps
 * @returns {string|null} the world id the breadcrumb names
 */
export function recoverFromContextLoss({ getState, storage, reload }) {
  const st = getState();
  if (!st.gameStarted) {
    reload();
    return null;
  }
  const rb = st.playerRigidBodyRef && st.playerRigidBodyRef.current;
  const t = rb && rb.translation ? rb.translation() : null;
  st.saveActiveWorld(t ? { x: t.x, y: t.y, z: t.z } : st.playerPosition);
  const id = getState()._sessionWorldId || null; // saveActiveWorld mints one if the session owned none
  try {
    if (id) storage.setItem(RESUME_WORLD_KEY, id);
  } catch { /* storage refused (private mode): the reload still recovers the graphics; the world is in the list */ }
  reload();
  return id;
}

/**
 * After a context RESTORE: call `onDrawn` once three has rendered since (review 2026-10-27, steady-cool MED 3). Until then
 * the restore is the browser's word, not a frame on screen, and the panel should stay up as the way back. three's own
 * restore handler re-creates `gl.info` (a fresh frame counter at 0), so the test holds whichever listener ran first: a new
 * info object counts from 0, the same one from the frame it was at.
 * @param {{ info: { render: { frame: number } } }} gl the WebGLRenderer
 * @param {() => void} onDrawn
 * @param {(fn: () => void) => void} [raf] a seam for the gate
 * @returns {() => void} cancel
 */
export function whenDrawnAgain(gl, onDrawn, raf = (fn) => requestAnimationFrame(fn)) {
  const info0 = gl.info;
  const f0 = info0.render.frame;
  let live = true;
  const check = () => {
    if (!live) return;
    const drawn = gl.info !== info0 ? gl.info.render.frame > 0 : gl.info.render.frame > f0;
    if (drawn) {
      live = false;
      onDrawn();
    } else {
      raf(check);
    }
  };
  raf(check);
  return () => { live = false; };
}

/**
 * At boot: take the breadcrumb (once — it is removed whether or not the world still exists) and return that world's
 * save, or null. The caller loads it; the player still presses Start, a gesture the browser needs anyway.
 * @param {{ storage: Storage, readWorld: (id: string) => object|null }} deps
 */
export function consumeResumeWorld({ storage, readWorld }) {
  let id = null;
  try {
    id = storage.getItem(RESUME_WORLD_KEY);
    if (id) storage.removeItem(RESUME_WORLD_KEY);
  } catch {
    return null;
  }
  if (!id) return null;
  return readWorld(id) || null;
}
