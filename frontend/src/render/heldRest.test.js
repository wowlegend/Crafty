import { describe, it, expect } from 'vitest';
import { HELD_REST } from './playerRender.jsx';

// THE IDLE RESET AND THE AUTHORED POSE DISAGREED, AND THE RESET WON EVERY FRAME.
//
// wandRef is attached to two mutually-exclusive groups with different authored transforms — a weapon at
// y 0.32 rotation zero, a wand at y 0.4 rotation (0.1, 0.2, 0.1). The idle branch in useFrame hardcoded
// rotation (0.1, 0, 0) and y = 0.4, which is NEITHER of them. So the wand's authored yaw and roll never
// rendered, and an equipped sword sat 0.08 high and pitched 0.1 rad. Idle is the overwhelming steady
// state — attackType is set only in 150-200ms bursts — so the authored transform showed for one frame
// after each re-render and was clobbered on the next, which reads as a subtle model offset, not a bug.
//
// The fix is ONE table: the mounted group carries its own entry in userData.rest and the frame loop resets to that.
// What this file checks is that the table is complete and immutable; that the frame loop resets the held item to the
// pose of what is mounted is driven through R3F in tests/gates/hand-pose-gates.test.jsx.

describe('HELD_REST — one authored pose per held item', () => {
  it('covers both mounted groups with complete 3-tuples', () => {
    for (const key of ['weapon', 'wand']) {
      expect(HELD_REST[key], `${key} rest pose missing`).toBeTruthy();
      expect(HELD_REST[key].position).toHaveLength(3);
      expect(HELD_REST[key].rotation).toHaveLength(3);
      for (const n of [...HELD_REST[key].position, ...HELD_REST[key].rotation]) {
        expect(Number.isFinite(n), `${key} carries a non-finite component`).toBe(true);
      }
    }
  });

  it('the two poses actually DIFFER — one shared pose is the bug wearing a table', () => {
    expect(HELD_REST.weapon.position).not.toEqual(HELD_REST.wand.position);
    expect(HELD_REST.weapon.rotation).not.toEqual(HELD_REST.wand.rotation);
  });

  it('is frozen, so the per-frame reset cannot mutate the table it resets to', () => {
    // The reset runs in useFrame. A writable table here would let one frame's write become every later
    // frame's rest pose, which is a worse version of the defect this replaced.
    expect(Object.isFrozen(HELD_REST)).toBe(true);
    expect(Object.isFrozen(HELD_REST.wand)).toBe(true);
    expect(Object.isFrozen(HELD_REST.wand.position)).toBe(true);
  });
});
