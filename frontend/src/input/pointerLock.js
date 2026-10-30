// pointerLock.js — the one way the game asks the browser for the pointer and gives it back.
//
// iOS and iPadOS WebKit define no Pointer Lock API: document.exitPointerLock, document.pointerLockElement and
// Element.requestPointerLock are undefined in every iOS browser (MDN browser-compat-data: safari_ios version_added false;
// Chrome for Android has them from 144). A bare document.exitPointerLock() there throws a TypeError, and thrown from a
// React effect it takes the whole app to the root error boundary. ESLint bans the bare calls everywhere else in src/.

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
 * @param {{ requestPointerLock?: (() => void) | null }} state the store state, or the HUD slice that carries it
 */
export function requestGameLock(state) {
  if (typeof state?.requestPointerLock === 'function') state.requestPointerLock();
}
