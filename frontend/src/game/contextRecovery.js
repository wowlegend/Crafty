// contextRecovery — the way back from a lost WebGL context (plan docs/superpowers/plans/2026-10-27-crafty-steady-cool.md,
// item e; masterpiece 0f).
//
// iOS Safari drops a WebGL context under memory pressure, and browsers drop one after a GPU reset. GameScene marked the
// store's isWebGLContextLost and nothing read it: the player was left with a black canvas under a live HUD, mobs still
// swinging, and no way back but a reload they had to think of themselves — losing whatever the debounced autosave had
// not written yet. A restored context is not reliable either (every GPU resource is gone, and three re-creates them
// lazily, if the context comes back at all), so the recovery is a reload: save first, then reload INTO THE SAME WORLD,
// which is a world switch to the world the tab holds (game/worldBoot.js).
import { markShadowWorldChanged } from '../render/shadowSchedule.js';
import { switchWorld, tabNote } from './worldBoot.js';

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
 * Save the world in play, leave the note naming the world this tab holds, then reload (game/worldBoot.js switchWorld). The
 * world in play is saved first, so the reload resumes it where it stood. Before Start nothing is saved (a save there
 * minted a slot from the title's untouched state, review 2026-10-27, steady-cool LOW 5), and the note still brings the
 * tab back to what its title showed: its loaded world, or a fresh one. A refused note still reloads, since the lost
 * context leaves nothing to stay in, as a plain visit: that continues the newest world earned in or named, which is the
 * world just saved unless it is an empty placeholder, and then an older world that holds something (worldBoot.js
 * latestOwnedWorld).
 * @param {{ getState: () => object, storage: Storage|null, reload: () => void }} deps
 * @returns {string|null} the world id the note names
 */
export function recoverFromContextLoss({ getState, storage, reload }) {
  return switchWorld(tabNote, { getState, storage, reload, orPlainVisit: true }).world || null;
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
