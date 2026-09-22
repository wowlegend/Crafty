import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC } from './_srcWalk.js';
import {
  joystickToMove, applyLook, makeTouchRouter,
  LOOK_BASE_SENSITIVITY, MAX_PITCH, DEFAULT_DEADZONE,
} from '../../src/input/touchMath.js';

/**
 * `touchMath.js` — the pure touch units, DRIVEN. Until 2026-09-22 nothing executed them.
 *
 * Selected by `gate-census.mjs` at 0/5, and the score was telling the truth: the file's whole M0
 * contract is "these are pure, so they are node-testable", and the only gate on it asserted that the
 * word `export function joystickToMove` appears in the source. That checks the CONTRACT IS DECLARED
 * while never once taking the benefit it exists for. `grep -rl touchMath` across the test corpus
 * returned nothing else — the deadzone, the eight-sector routing, the pitch clamp and the multi-touch
 * identity rules had never been run by anything.
 *
 * The purity assertion is kept, because purity IS a source property and cannot be driven: a module that
 * imports React is impure whatever it computes. Everything else is now executed.
 *
 * THE CASES ARE THE DOCUMENTED GUARANTEES, not a sample of inputs. Each one names an invariant the
 * source comments promise — opposing pairs never co-fire, a second left-half touch must not become a
 * move touch — because those are the properties whose failure has a gameplay consequence (the second
 * one freezes the player mid-run, per the comment that introduced 'ignore').
 *
 * BLIND SPOT, stated (R7): this proves the MATH. It proves nothing about whether `TouchControls.jsx`
 * feeds it real Touch events, whether listeners are registered, or whether a finger on a real iPad
 * moves the player — `touch-wiring-gates` covers the wiring by source assertion, and the device feel is
 * Kevin-gated with no harness at all.
 *
 * Mutation-Proof: 5 mutations, recorded on the commit.
 */
describe('touchMath.js — purity is a SOURCE property; everything else is driven', () => {
  it('has ZERO react / three / R3F / inputState imports and no DOM globals', () => {
    const code = readFileSync(resolve(SRC, 'input/touchMath.js'), 'utf8');
    const banned = [/from\s+['"]react['"]/, /from\s+['"]three['"]/, /@react-three/, /from\s+['"].*inputState/];
    for (const re of banned) expect(re.test(code), `must not import ${re}`).toBe(false);
    expect(/\bdocument\.|\bwindow\.|\bnavigator\./.test(code), 'no DOM globals').toBe(false);
  });

  it('the deadzone SWALLOWS small vectors and releases just past it', () => {
    const none = { moveF: false, moveB: false, moveL: false, moveR: false };
    expect(joystickToMove(0, 0)).toEqual(none);
    expect(joystickToMove(DEFAULT_DEADZONE - 0.01, 0), 'just inside the deadzone must be inert').toEqual(none);
    expect(joystickToMove(DEFAULT_DEADZONE + 1, 0), 'just outside it must move').toEqual({ ...none, moveR: true });
  });

  it('all eight sectors route correctly, and NO sector ever sets an opposing pair', () => {
    // The guarantee the source states in capitals. Swept over the full circle rather than spot-checked:
    // an off-by-one in the sector rounding shows up at a boundary, not at a cardinal.
    let checked = 0;
    for (let deg = 0; deg < 360; deg += 1) {
      const r = 50;
      const m = joystickToMove(Math.cos((deg * Math.PI) / 180) * r, -Math.sin((deg * Math.PI) / 180) * r);
      expect(m.moveF && m.moveB, `opposing F/B pair at ${deg}deg`).toBe(false);
      expect(m.moveL && m.moveR, `opposing L/R pair at ${deg}deg`).toBe(false);
      expect(m.moveF || m.moveB || m.moveL || m.moveR, `dead direction at ${deg}deg`).toBe(true);
      checked++;
    }
    expect(checked, 'the sweep must run, or every assertion above passed over nothing').toBe(360);
    // Screen space is +y DOWN, so forward is -y. Getting this backwards inverts the joystick.
    expect(joystickToMove(0, -50), 'up on the screen must be FORWARD').toEqual({ moveF: true, moveB: false, moveL: false, moveR: false });
    expect(joystickToMove(0, 50)).toEqual({ moveF: false, moveB: true, moveL: false, moveR: false });
  });

  it('applyLook clamps PITCH and leaves YAW free', () => {
    expect(applyLook(0, 0, 100, 0).yaw).toBeCloseTo(-100 * LOOK_BASE_SENSITIVITY, 10);
    // Yaw must wrap around the world freely; a clamp here would stop the player turning round.
    expect(Math.abs(applyLook(0, 0, 1e6, 0).yaw)).toBeGreaterThan(Math.PI * 2);
    // Pitch must not pass vertical, in either direction, at any magnitude.
    expect(applyLook(0, 0, 0, -1e6).pitch).toBeCloseTo(MAX_PITCH, 10);
    expect(applyLook(0, 0, 0, 1e6).pitch).toBeCloseTo(-MAX_PITCH, 10);
    expect(MAX_PITCH, 'the clamp must stop SHORT of straight up, or the camera flips').toBeLessThan(Math.PI / 2);
  });

  it('a touch is bound to its zone by WHERE IT STARTED, for its whole life', () => {
    const r = makeTouchRouter();
    const W = 1000;
    expect(r.onStart({ identifier: 1, clientX: 100, clientY: 400 }, W).zone).toBe('move');
    expect(r.onStart({ identifier: 2, clientX: 900, clientY: 400 }, W).zone).toBe('look');
  });

  it('a SECOND left-half touch is inert — it must not freeze the player on release', () => {
    // The documented trap: a stray tap while the joystick is held would otherwise become a second move
    // touch, and ITS release runs the move-zone cleanup, clearing all four intents mid-run.
    const r = makeTouchRouter();
    const W = 1000;
    expect(r.onStart({ identifier: 1, clientX: 100, clientY: 400 }, W).zone).toBe('move');
    expect(r.onStart({ identifier: 2, clientX: 120, clientY: 600 }, W).zone,
      'a stray second left-half tap became a move touch — its release will freeze the player').toBe('ignore');
    // And once the joystick is released the next left-half touch IS a move touch again, or the player
    // can never steer after a stray tap. An inertness that never lifts is its own bug.
    r.onEnd({ identifier: 1 });
    expect(r.onStart({ identifier: 3, clientX: 100, clientY: 400 }, W).zone,
      'the move zone never recovered after the joystick was released').toBe('move');
  });
});
