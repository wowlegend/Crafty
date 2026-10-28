// meleeString.test.js — the light attack's three-step string (combat-stance Task 8).
// Plan: docs/superpowers/plans/2026-10-27-crafty-combat-stance.md, Task 8.
//
// Mutation-Proof: scripts/dev/mutate.sh on src/game/meleeString.js, 15 tests, 2026-10-27. RED: S8a the window check
//   dropped; S8b cancelIntoDodge resets the step; S8c BUFFER_MS 0; S8d the finisher keeps `last`; S8e the open-window
//   guard dropped; S8f endString(now) ignores now; S8g peekStep fires; S8h the buffer edge strict; S8i a second buffer
//   allowed; S8j the buffered fire 1 ms early; S8k a buffer taken twice; S8l no finisher recovery; S8m one walk mult;
//   S8n the dodge keeps the walk slow; S8o endString keeps the buffer; S8p step 2 sweeps the same way; S8q step 2 a
//   finisher; S8r the window edge strict; S8u a 110 degree finisher arc. S80 (a comment edit, the identity mutant)
//   SURVIVED. S8s / S8t (a buffered press's step read at the press, not at readyAt) SURVIVED and are EQUIVALENT: a fire
//   sets the window 650 ms past a cooldown of at most 500, and only endString pushes readyAt past the window, which
//   zeroes `last`, so the two reads give the same step in every reachable state.
//   Round-1 review pins (2026-10-28, 17 tests): W3 a dodge inside an open window sets it to never expire -> RED; W5 a
//   dropped press extends the window -> RED; W0 identity (a comment edit) -> survived. W3 was REPRODUCED against the
//   lane's code first: a press 700 ms after the dodge fires step 1, so the game does not do it; the case pins that.
//   Round-1 review g, gateSwing (19 tests): G1 a form's swing does not end the string (the shipped behaviour) -> RED;
//   G2 it ends the string without a cooldown -> RED; G3 a refusal ignored -> RED; G4 a charging heavy ignored -> RED; G5
//   a buffered step pressed through the string again -> RED; G6 a buffered press fires at once -> RED; G0 identity ->
//   survived. The controller's call site (Components.jsx) is one call with named fields; it is not driven here.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  pressSwing, takeBufferedSwing, cancelIntoDodge, endString, peekStep, stringWalkMult, swingShape, slashSweep, gateSwing,
  readString, handSwing, _resetStringForTest,
  STRING_STEPS, SWING_COOLDOWN_MS, STRING_WINDOW_MS, BUFFER_MS, FINISHER_RECOVERY_MS, FINISHER_MULT, FINISHER_ARC_RAD,
  FINISHER_SHOVE_MULT, SWING_WALK_MULT, SWING_WALK_MS, FINISHER_WALK_MULT, FINISHER_WALK_MS,
} from './meleeString.js';

beforeEach(() => { _resetStringForTest(); });

const fires = (...times) => times.map((t) => pressSwing(t));

describe('the light string', () => {
  it('three presses 350 ms apart are steps 1, 2, 3, and the fourth starts again at 1', () => {
    const r = fires(1000, 1350, 1700);
    expect(r).toEqual([{ action: 'fire', step: 1 }, { action: 'fire', step: 2 }, { action: 'fire', step: 3 }]);
    expect(readString().last).toBe(0);
    expect(readString().lastSwingStep).toBe(3);
    // the finisher's recovery is 500 ms: 2200 is the first press that fires, and it is step 1
    expect(pressSwing(2200)).toEqual({ action: 'fire', step: 1 });
  });

  it('a press after STRING_WINDOW_MS restarts at step 1', () => {
    expect(fires(1000, 1700).map((x) => x.step)).toEqual([1, 1]);
    // and the edge: 650 ms after is still inside the window
    _resetStringForTest();
    expect(fires(1000, 1650).map((x) => x.step)).toEqual([1, 2]);
    _resetStringForTest();
    expect(fires(1000, 1651).map((x) => x.step)).toEqual([1, 1]);
  });

  it('a press inside the cooldown with more than BUFFER_MS left is dropped', () => {
    pressSwing(1000);
    expect(pressSwing(1050)).toEqual({ action: 'drop', step: 0 });
    expect(pressSwing(1099)).toEqual({ action: 'drop', step: 0 }); // 201 ms left
    expect(readString().buffered).toBe(false);
  });

  it('a press with <= BUFFER_MS left is buffered and fires at readyAt as the next step', () => {
    pressSwing(1000);
    expect(pressSwing(1150)).toEqual({ action: 'buffer', step: 2 });
    expect(readString().buffered).toBe(true);
    expect(takeBufferedSwing(1299)).toBe(0);
    expect(readString().buffered).toBe(true);
    expect(takeBufferedSwing(1300)).toBe(2);
    expect(readString().buffered).toBe(false);
    expect(readString().lastSwingAt).toBe(1300);
    expect(readString().lastSwingStep).toBe(2);
    expect(takeBufferedSwing(1400)).toBe(0); // taken once
    // the buffer's edge: exactly BUFFER_MS left buffers
    _resetStringForTest();
    pressSwing(1000);
    expect(pressSwing(1100).action).toBe('buffer');
  });

  it('a buffered press a late frame takes fires as the step it was promised, its times from that frame', () => {
    pressSwing(1000); // ready at 1300, window to 1650
    expect(pressSwing(1150)).toEqual({ action: 'buffer', step: 2 });
    expect(takeBufferedSwing(1700)).toBe(2); // the first frame past readyAt is 400 ms late, past step 1's window
    expect(readString().lastSwingStep).toBe(2);
    expect(readString().lastSwingAt).toBe(1700);
    expect(readString().readyAt).toBe(1700 + SWING_COOLDOWN_MS);
    expect(pressSwing(2050)).toEqual({ action: 'fire', step: 3 }); // the string runs on from the swing that fired
  });

  it('a second press while one is buffered is dropped', () => {
    pressSwing(1000);
    expect(pressSwing(1150).action).toBe('buffer');
    expect(pressSwing(1200)).toEqual({ action: 'drop', step: 0 });
    expect(takeBufferedSwing(1300)).toBe(2);
    expect(takeBufferedSwing(1300)).toBe(0);
  });

  it('after a finisher the next swing waits FINISHER_RECOVERY_MS and is step 1', () => {
    fires(1000, 1350, 1700); // the finisher at 1700: ready at 2200
    expect(pressSwing(1900)).toEqual({ action: 'drop', step: 0 }); // 300 ms left
    expect(pressSwing(2050)).toEqual({ action: 'buffer', step: 1 }); // 150 left: buffered, as step 1
    expect(takeBufferedSwing(2199)).toBe(0);
    expect(takeBufferedSwing(2200)).toBe(1);
  });

  it('cancelIntoDodge keeps the step, restarts the window, drops the buffer', () => {
    fires(1000, 1350); // window to 2000
    cancelIntoDodge(1800); // window to 2450
    expect(readString().cancelAt).toBe(1800);
    expect(pressSwing(2200)).toEqual({ action: 'fire', step: 3 });
    // without the dodge the window would have ended at 2000
    _resetStringForTest();
    fires(1000, 1350);
    expect(pressSwing(2200)).toEqual({ action: 'fire', step: 1 });
    // the buffer is dropped
    _resetStringForTest();
    pressSwing(1000);
    expect(pressSwing(1150).action).toBe('buffer');
    cancelIntoDodge(1200);
    expect(readString().buffered).toBe(false);
    expect(takeBufferedSwing(1300)).toBe(0);
  });

  // Round-1 review (dynamic, W3): the case above presses INSIDE the restarted window, so a dodge that made an open
  // window never expire passed it. The restart is one window long, from the dodge.
  it('a dodge inside an open window restarts it once: past its own STRING_WINDOW_MS the string lapses', () => {
    fires(1000, 1350); // window to 2000
    cancelIntoDodge(1800); // window to 2450
    expect(readString().windowEndsAt).toBe(1800 + STRING_WINDOW_MS);
    expect(pressSwing(2500)).toEqual({ action: 'fire', step: 1 });
  });

  // Round-1 review (dynamic, W5): a press that drops changes nothing, the window included.
  it('a dropped press leaves the window where it was', () => {
    expect(pressSwing(1000)).toEqual({ action: 'fire', step: 1 }); // window to 1650
    expect(pressSwing(1050)).toEqual({ action: 'drop', step: 0 }); // 250 ms of cooldown left: more than BUFFER_MS
    expect(readString().windowEndsAt).toBe(1000 + STRING_WINDOW_MS);
    expect(pressSwing(1660)).toEqual({ action: 'fire', step: 1 });
  });

  it('cancelIntoDodge after the window has lapsed revives nothing', () => {
    fires(1000, 1350); // window to 2000
    cancelIntoDodge(4000);
    expect(pressSwing(4100)).toEqual({ action: 'fire', step: 1 });
  });

  it('endString drops a buffered press (Review Focus 5)', () => {
    pressSwing(1000);
    expect(pressSwing(1150).action).toBe('buffer');
    endString();
    expect(readString().buffered).toBe(false);
    expect(takeBufferedSwing(1300)).toBe(0);
    expect(takeBufferedSwing(5000)).toBe(0);
    // and the next swing is step 1, even inside the old window
    expect(pressSwing(1400)).toEqual({ action: 'fire', step: 1 });
  });

  it('a press buffered into a held heavy cannot finish on the heavy\'s heels', () => {
    expect(pressSwing(1000)).toEqual({ action: 'fire', step: 1 });
    expect(pressSwing(1150).action).toBe('buffer'); // its swing fires as step 2, and the heavy's hold starts
    expect(takeBufferedSwing(1300)).toBe(2); // window to 1950
    endString(1850); // the heavy is thrown: the light swing waits until 2150
    expect(pressSwing(1860)).toEqual({ action: 'drop', step: 0 });
    expect(pressSwing(2060)).toEqual({ action: 'buffer', step: 1 });
    expect(takeBufferedSwing(2149)).toBe(0);
    expect(takeBufferedSwing(2150)).toBe(1);
  });

  it('peekStep reports the step a press would make, and changes nothing', () => {
    fires(1000, 1350);
    const before = { ...readString() };
    expect(peekStep(1700)).toBe(3);
    expect(peekStep(2100)).toBe(1);
    expect(peekStep(1400)).toBe(0); // 250 ms left: it would drop
    expect(peekStep(1500)).toBe(3); // 150 ms left: it would buffer, as step 3
    expect({ ...readString() }).toEqual(before);
    expect(pressSwing(1700)).toEqual({ action: 'fire', step: 3 });
    // with a press buffered, another would drop
    _resetStringForTest();
    pressSwing(1000);
    pressSwing(1150);
    expect(peekStep(1200)).toBe(0);
  });

  it('walk mult: 0.6 for 120 ms after a light swing, 0.4 for 220 ms after a finisher, 1 after cancelIntoDodge', () => {
    expect(stringWalkMult(1000)).toBe(1);
    pressSwing(1000);
    expect(stringWalkMult(1000)).toBe(0.6);
    expect(stringWalkMult(1119)).toBe(0.6);
    expect(stringWalkMult(1120)).toBe(1);
    pressSwing(1350);
    pressSwing(1700); // the finisher
    expect(stringWalkMult(1700)).toBe(0.4);
    expect(stringWalkMult(1919)).toBe(0.4);
    expect(stringWalkMult(1920)).toBe(1);
    _resetStringForTest();
    pressSwing(1000);
    cancelIntoDodge(1050);
    expect(stringWalkMult(1050)).toBe(1);
    // a buffered swing slows the walk when it fires
    _resetStringForTest();
    pressSwing(1000);
    pressSwing(1150);
    takeBufferedSwing(1300);
    expect(stringWalkMult(1350)).toBe(0.6);
    expect([SWING_WALK_MULT, SWING_WALK_MS, FINISHER_WALK_MULT, FINISHER_WALK_MS]).toEqual([0.6, 120, 0.4, 220]);
  });

  it('swingShape and slashSweep return the table values; the finisher\'s arc is wider than 120 degrees', () => {
    for (const s of [1, 2]) expect(swingShape(s)).toEqual({ arcRad: Math.PI / 2, damageMult: 1, shoveMult: 1, finisher: false });
    expect(swingShape(3)).toEqual({ arcRad: (140 * Math.PI) / 180, damageMult: 1.5, shoveMult: 2, finisher: true });
    // a mob 60 degrees off-axis is outside a 90 degree cone and inside the finisher's: the full arc must exceed 120
    expect(FINISHER_ARC_RAD).toBeGreaterThan((120 * Math.PI) / 180);
    expect(slashSweep(1)).toEqual({ dir: 1, durationS: 0.2, widthMult: 1 });
    expect(slashSweep(2)).toEqual({ dir: -1, durationS: 0.2, widthMult: 1 });
    expect(slashSweep(3)).toEqual({ dir: 1, durationS: 0.28, widthMult: 1.5 });
    expect(slashSweep(0)).toEqual(slashSweep(1)); // no string swing: today's sweep
    expect([STRING_STEPS, FINISHER_MULT, FINISHER_SHOVE_MULT, STRING_WINDOW_MS, BUFFER_MS, FINISHER_RECOVERY_MS]).toEqual([3, 1.5, 2, 650, 200, 500]);
  });

  it('slashSweep alternates dir for steps 1 and 2 and widens the finisher', () => {
    expect(slashSweep(1).dir).toBe(-slashSweep(2).dir);
    expect(slashSweep(3).widthMult).toBeGreaterThan(slashSweep(1).widthMult);
    expect(slashSweep(3).durationS).toBeGreaterThan(slashSweep(1).durationS);
  });

  it('SWING_COOLDOWN_MS equals the 300 ms the controller used', () => {
    expect(SWING_COOLDOWN_MS).toBe(300);
    pressSwing(1000);
    expect(readString().readyAt).toBe(1300);
  });
});

// Round-1 review g: the controller's press gate (Components.jsx triggerMeleeAttack), as gateSwing. A beast form's swing
// stamped only the controller's lastAttackTime and never the string, so the first human light swing after a form ended
// fired at once, inside the old 300 ms cooldown.
describe('gateSwing — the press gate of triggerMeleeAttack', () => {
  it('after a beast form\'s swing the next human light swing waits SWING_COOLDOWN_MS, as after a heavy', () => {
    expect(gateSwing(1000, { form: true })).toBe(0);
    expect(gateSwing(1050, {}), 'a human light swing 50 ms after a form\'s swing fired').toBe(-1); // 250 ms left: dropped
    expect(gateSwing(1120, {}), 'a human light swing 120 ms after a form\'s swing fired').toBe(-1); // 180 ms left: buffered
    expect(readString().buffered).toBe(true);
    expect(takeBufferedSwing(1000 + SWING_COOLDOWN_MS - 1)).toBe(0);
    expect(takeBufferedSwing(1000 + SWING_COOLDOWN_MS)).toBe(1);
    // the heavy, for comparison: the same hold
    _resetStringForTest();
    expect(gateSwing(1000, { heavy: true })).toBe(0);
    expect(gateSwing(1120, {})).toBe(-1);
    expect(takeBufferedSwing(1300)).toBe(1);
  });

  it('a light press fires through the string; a buffered step skips it; a charging heavy and a refusal stop a swing', () => {
    expect([gateSwing(1000, {}), gateSwing(1350, {}), gateSwing(1700, {})], 'the string steps').toEqual([1, 2, 3]);
    _resetStringForTest();
    expect(gateSwing(1000, { bufferedStep: 2, heavyHeld: true }), 'a buffered press went through the string again').toBe(2);
    expect(readString().lastSwingAt, 'a buffered press fired the string a second time').toBe(0);
    expect(gateSwing(1000, { heavyHeld: true }), 'a light swing fired while a heavy was charging').toBe(-1);
    expect(readString().lastSwingAt).toBe(0);
    expect(gateSwing(1000, { form: true, refused: 'cooldown' }), 'a refused form swing fired').toBe(-1);
    expect(gateSwing(1000, { heavy: true, refused: 'charging' }), 'a refused heavy fired').toBe(-1);
    expect(readString().readyAt, 'a refused swing still held the string').toBe(0);
  });
});

describe('a live press and a buffered one', () => {
  it('a live press after the cooldown consumes the buffered press a slow frame never took', () => {
    expect(pressSwing(0)).toEqual({ action: 'fire', step: 1 });
    expect(pressSwing(150).action, 'SETUP: the early press was not buffered').toBe('buffer');
    // A 30 fps frame at 290 runs before the cooldown ends; the next press lands at 310, before the next frame.
    expect(takeBufferedSwing(290)).toBe(0);
    expect(pressSwing(310)).toEqual({ action: 'fire', step: 2 });
    expect(readString().buffered, 'the buffered press survived the live swing that answered it').toBe(false);
    // A press in the next buffer window is buffered, not dropped behind a stale one, and nothing fires on its own.
    expect(pressSwing(450).action, 'a press in the buffer window was dropped behind the stale buffered press').toBe('buffer');
    expect(takeBufferedSwing(609)).toBe(0);
    expect(takeBufferedSwing(610), 'the press at 450 did not fire when the cooldown ended').toBe(3);
    expect(takeBufferedSwing(1500), 'a second buffered swing fired from one press').toBe(0);
  });
});

describe('handSwing — the FPV hand plays the sweep its swing started with, on its own clock', () => {
  // The press stamps the string at once; the hand's clock stamps the swing's start when the controller's frame first
  // sees it, one or two frames later. Frames every 1/60 s, the hand's start two frames after the press.
  const FRAME_MS = 1000 / 60;
  const play = (step, pressMs, timerMs) => {
    const latch = { startS: -1, sweep: null, melee: false };
    const startS = 7.0, startPerfMs = pressMs + 2 * FRAME_MS;
    const frames = [];
    for (let k = 0; k < 30; k++) {
      const nowMs = startPerfMs + k * FRAME_MS, elapsedS = (k * FRAME_MS) / 1000;
      // the controller clears the attack type on a timer on the press's clock, which the hand sees once React commits
      // it, here two frames later
      const sw = handSwing(latch, startS, nowMs < pressMs + timerMs + 2 * FRAME_MS, nowMs, elapsedS);
      frames.push({ elapsedS, dir: sw?.dir ?? 0, widthMult: sw?.widthMult ?? 0 });
    }
    return frames;
  };

  it('a step-2 swing sweeps back (dir -1) for its whole 0.2 s and never flips to step 1\'s sweep', () => {
    fires(1000);
    expect(pressSwing(1350)).toEqual({ action: 'fire', step: 2 });
    const f = play(2, 1350, 200);
    const during = f.filter((x) => x.elapsedS < slashSweep(2).durationS);
    expect(during.length, 'SETUP: no frame inside the swing').toBeGreaterThan(10);
    expect(during.map((x) => x.dir), 'the step-2 sweep flipped mid-swing').toEqual(during.map(() => -1));
    expect(f.filter((x) => x.elapsedS >= slashSweep(2).durationS).every((x) => x.dir === 0), 'the hand swung past its sweep').toBe(true);
  });

  it('a finisher plays its full 0.28 s wide sweep', () => {
    fires(1000, 1350);
    expect(pressSwing(1700)).toEqual({ action: 'fire', step: 3 });
    const f = play(3, 1700, 280);
    const during = f.filter((x) => x.elapsedS < slashSweep(3).durationS);
    expect(during.map((x) => x.widthMult), 'the finisher was cut short or narrowed').toEqual(during.map(() => slashSweep(3).widthMult));
  });

  it('a swing with no light swing behind it (a heavy, a form) plays step 1\'s sweep, and a new swing is chosen anew', () => {
    const latch = { startS: -1, sweep: null, melee: false };
    fires(1000, 1350); // a step-2 swing, long before
    expect(handSwing(latch, 3.0, true, 5000, 0.05)?.dir, 'a heavy long after a step-2 swing played the string\'s sweep').toBe(1);
    fires(9000, 9350);
    expect(handSwing(latch, 9.4, true, 9380, 0.0)?.dir, 'the next swing kept the last one\'s sweep').toBe(-1);
    expect(handSwing(latch, 9.4, false, 9420, 0.04)?.dir, 'the attack type cleared mid-sweep stopped the hand').toBe(-1);
    expect(handSwing(latch, 9.5, false, 9500, 0.0), 'a spell cast (its own start) swung the hand').toBe(null);
  });
});
