// Where the mob systems measure the player from this frame: the body's steady eye (game/mobSenses.js mobSensePoint),
// taken from the body sample the Player's loop hands the combat stance every live frame (game/combatStance.js
// stanceFrame), so the stance and the mobs read one sample of the body. Not the rigid body's translation(): in
// rapier3d-compat 0.19.2 each call builds a wasm vector and a fresh object, and this runs every frame an arrow flies.
// Before the loop has sampled the body there is no body to read, so the camera stands in.
import { stance } from '../game/stanceState.js';
import { mobSensePoint } from '../game/mobSenses.js';

const _body = { x: 0, y: 0, z: 0 };

/** The point, written into `out` ({x, y, z}), which is returned. */
export function playerSensePoint(camera, out) {
  if (stance.bodySeen) {
    _body.x = stance.bodyX;
    _body.y = stance.bodyY;
    _body.z = stance.bodyZ;
    return mobSensePoint(_body, out);
  }
  out.x = camera.position.x;
  out.y = camera.position.y;
  out.z = camera.position.z;
  return out;
}
