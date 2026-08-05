/**
 * touchOwnership.js — decides whether a touch belongs to a UI control or to the move/look router (X3).
 *
 * THE BUG THIS CLOSES. `ui/TouchControls.jsx` renders a full-screen layer at z-40, above the HUD at z-20.
 * Its `touchstart` handler routed every touch that was not a `button[data-touch-btn]` into a move/look zone
 * AND called `preventDefault()`, which suppresses the synthesized click. A hotbar slot is a
 * `<button data-hotbar-block>` inside a `[data-hud-interactive]` container — neither of which that selector
 * matched — so on a touch device the tap never reached its `onClick`. A voxel BUILDING game was locked to a
 * single block on its own stated iPad target.
 *
 * WHY THIS FILE EXISTS RATHER THAN A WIDER SELECTOR INLINE. The `data-hud-interactive` seam was added to
 * `GameHud.jsx` for exactly this fix, and a comment there asserted the routing had landed. It had not —
 * `grep hud-interactive src/ui/TouchControls.jsx` returned nothing for weeks, and the false comment is why
 * nobody looked again. Putting the ownership rule in one named, tested module means the claim "the router
 * skips HUD surfaces" is checkable by running something rather than by reading a comment.
 *
 * VERIFICATION HONESTY. The unit tests below drive `ownsTouch` against fake nodes, which proves the
 * predicate and NOT the wiring: jsdom's `document.elementFromPoint` always returns null (it has no layout),
 * so a jsdom test of the real routing would pass while asserting nothing — the vacuity trap this repo has
 * paid for repeatedly. The lived check is `scripts/visual/touch-probe.mjs`, which taps the real hotbar in a
 * real browser and reads the resulting `selectedBlock` from the store.
 *
 * Pure: no React, no store, no Three. Takes a node, returns a boolean.
 */

/**
 * Surfaces that own their own touches.
 *
 * - `button[data-touch-btn]` — the transparent hit-areas the touch layer itself renders (pause, action,
 *   cast, jump, dodge, the Aspect ring and the spell picker). They handle `onPointerUp` themselves.
 * - `[data-hud-interactive]` — real HUD control surfaces underneath the layer: the hotbar, and anything
 *   else that marks itself as a control rather than as scenery.
 *
 * Anything else is scenery, and a touch on scenery is a move or a look.
 */
export const UI_OWNED_SELECTOR = 'button[data-touch-btn], [data-hud-interactive]';

/**
 * True when `node` is, or sits inside, a surface that owns its own touches.
 *
 * Defensive about the node: `document.elementFromPoint` returns null outside the viewport, and a bare
 * `#text` node has no `closest`. Either must read as "not owned" (route it) rather than throw inside a
 * `touchstart` handler, where an exception would strand the whole move/look system for the session.
 */
export function ownsTouch(node) {
  return !!(node && typeof node.closest === 'function' && node.closest(UI_OWNED_SELECTOR));
}
