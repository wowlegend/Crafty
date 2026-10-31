// formRefusal.js — what a refused beast form costs: nothing. The roar's commit asks whether the form has room before the
// bar is spent (game/formFit.js formHasRoom), but the swap itself runs on a later frame, after React's activeBeastForm
// effect, and a block placed in between can take the room (enterFormFitted then refuses). That refusal spent the bar and
// left the transform camera pulled back for its whole 1.2 s window (round-2 static review F4).

import { TRANSFORM_CAM_SEC } from './transformCam.js';

/** Cut a running transform camera to its return phase (the roar released early, or its form refused). */
export function cutTransformCam(tc) {
  if (tc && tc.active) tc.t = Math.max(tc.t, 0.78 * TRANSFORM_CAM_SEC);
}

/**
 * The frame's form swap refused: end the form, give back the roar's price when the roar paid for this form, cut the
 * reveal, and tell the player.
 * @param {{exitBeastForm: () => void, gainEmber: (n: number) => void}} st the store's state
 * @param {{paid: number, transformCam: ?{active: boolean, t: number}, notify: (reason: string) => void}} io `paid` is
 *   what the roar spent for this form (0 for a form nothing paid for)
 */
export function refuseFormSwap(st, { paid, transformCam, notify }) {
  st.exitBeastForm();
  if (paid > 0) st.gainEmber(paid);
  cutTransformCam(transformCam);
  notify('no-room');
}
