// Whether the first-person follow placed the game camera this frame (the Player's loop, Components.jsx).
//
// The follow puts the camera at the body's steady eye plus the walk bob, the shake and the verb kicks, and a crit's
// shake alone carries it about 1.4 m off the eye (game/trauma.js shakeOffset at trauma 0.8), so where the drawn camera
// stands cannot say whether the player is looking out of their own eyes; which branch placed it can. The loop clears
// this at the top of every frame and sets it in the follow branch, so the roar's reveal, capture, a lookbook pose and
// the death branch leave it clear. Read as the frame draws (render/BeastAvatar.jsx), after every frame callback has
// run. A module flag on purpose: written and read per frame, never rendered (Game-Loop Isolation).

let _follow = false;

/** The Player's loop: whether its follow branch placed the camera this frame. */
export function markFollowView(on) {
  _follow = on;
}

/** Whether the first-person follow placed the camera this frame. */
export function followHoldsView() {
  return _follow;
}
