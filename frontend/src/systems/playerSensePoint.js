// Where the mob systems measure the player from this frame: the body's steady eye (game/mobSenses.js mobSensePoint),
// read from the store's rigid body (Game-Loop Isolation: a transient getState read). Before the Player has mounted its
// body there is no body to read, so the camera stands in.
import { useGameStore } from '../store/useGameStore';
import { mobSensePoint } from '../game/mobSenses.js';

/** The point, written into `out` ({x, y, z}), which is returned. */
export function playerSensePoint(camera, out) {
  const rb = useGameStore.getState().playerRigidBodyRef?.current;
  if (rb) return mobSensePoint(rb.translation(), out);
  out.x = camera.position.x;
  out.y = camera.position.y;
  out.z = camera.position.z;
  return out;
}
