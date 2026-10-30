// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore } from '../store/useGameStore.jsx';
import { ROAR_COST, EMBER_MAX } from './ember.js';
import { TRANSFORM_CAM_SEC } from './transformCam.js';
import { refuseFormSwap, cutTransformCam } from './formRefusal.js';

// A form the frame's swap refuses (game/formFit.js enterFormFitted: a block placed since the roar's commit took the room)
// costs nothing and ends its reveal: the roar's price is given back, the transform camera jumps to its return, and the
// player is told. Round-2 static review F4: the refusal spent the bar and left the camera pulled back.
describe('a refused form swap', () => {
  beforeEach(() => {
    useGameStore.setState(useGameStore.getInitialState(), true);
    useGameStore.setState({ isAlive: true, ember: EMBER_MAX });
  });

  it('gives back the roar it paid for, ends the form, cuts the reveal to its return, and says why', () => {
    const st = useGameStore.getState();
    expect(st.enterBeastForm('arcane'), 'SETUP: the store refused the golem').toBe(true);
    expect(st.spendEmber(ROAR_COST), 'SETUP: the roar could not pay').toBe(true);
    expect(useGameStore.getState().ember, 'SETUP: the roar took nothing').toBe(EMBER_MAX - ROAR_COST);
    const cam = { active: true, t: 0.3, fwd: [0, 0, -1] };
    const notify = vi.fn();
    refuseFormSwap(useGameStore.getState(), { paid: ROAR_COST, transformCam: cam, notify });
    const after = useGameStore.getState();
    expect([after.beastFormActive, after.activeBeastForm], 'the refused form did not end').toEqual([false, null]);
    expect(after.ember, 'the refused roar kept its price').toBe(EMBER_MAX);
    expect(cam.t, 'the reveal was not cut to its return').toBeCloseTo(0.78 * TRANSFORM_CAM_SEC, 6);
    expect(notify.mock.calls, 'the player was not told').toEqual([['no-room']]);
  });

  it('gives back nothing for a form nothing paid for (a store enter), and leaves a camera already returning alone', () => {
    useGameStore.setState({ ember: 40 });
    useGameStore.getState().enterBeastForm('ice');
    const cam = { active: true, t: 1.1, fwd: [0, 0, -1] };
    refuseFormSwap(useGameStore.getState(), { paid: 0, transformCam: cam, notify: () => {} });
    expect(useGameStore.getState().ember, 'an unpaid refusal changed the bar').toBe(40);
    expect(cam.t, 'the cut moved a camera already past it back').toBe(1.1);
    const idle = { active: false, t: 0, fwd: [0, 0, -1] };
    cutTransformCam(idle);
    expect(idle.t, 'the cut moved a camera that is not running').toBe(0);
  });
});
