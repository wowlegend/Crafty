// pointerLock.js — the one way the game asks the browser for the pointer and gives it back.
//
// iOS and iPadOS WebKit define no Pointer Lock API: document.exitPointerLock, document.pointerLockElement and
// Element.requestPointerLock are undefined in every iOS browser (MDN browser-compat-data: safari_ios version_added false;
// Chrome for Android has them from 144). A bare document.exitPointerLock() there throws a TypeError, and thrown from a
// React effect it takes the whole app to the root error boundary. ESLint bans the bare calls everywhere else in src/.
import { blockingSurfaceUp } from './inputLive.js';

/**
 * Give the pointer back, where the browser has a Pointer Lock API at all. It does not first ask whether the pointer is
 * locked: pointerLockElement is null while a lock request is still pending (MDN), so that check would skip the release
 * in exactly the window where a request is in flight.
 * @param {Document} [doc]
 */
export function releasePointerLock(doc = document) {
  if (typeof doc.exitPointerLock === 'function') doc.exitPointerLock();
}

/**
 * Ask for the pointer on the game canvas, through the requester GameScene installs in the store (it targets the canvas
 * and handles a refusal). With no requester GameScene is not mounted, there is no game canvas, and nothing else is
 * locked: a lock goes on the canvas (input-and-pointer-lock.md).
 *
 * Never while a surface is up (input/inputLive.js): under a lock every click goes to the canvas, so a lock taken with a
 * panel, VICTORY or the death screen still drawn leaves its control unclickable and the clicks editing the world behind
 * it. A panel key pressed over the trade panel or a chest did exactly that. So `state` must be the store's state read
 * after the caller's own writes (useGameStore.getState() at the call), not a snapshot from before them.
 * @param {object} state the store's state, read at the call
 */
export function requestGameLock(state) {
  if (blockingSurfaceUp(state)) return;
  if (typeof state?.requestPointerLock === 'function') state.requestPointerLock();
}
