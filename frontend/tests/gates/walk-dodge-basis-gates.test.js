import { describe, it, expect } from 'vitest';
import { moveVector, BASE_MOVE_SPEED } from '../../src/game/locomotion.js';
import { dodgeDirection } from '../../src/game/dodge.js';

/**
 * ONE FACT, ONE BASIS: WHICH WAY IS "FORWARD"? (AUDIT:ultra:ultra-game-logic-7)
 *
 * A walk and a dodge both turn the camera's direction and the move keys into a world direction. Each had its own copy
 * of the planar basis (forward from the camera's XZ, side its perpendicular, a (0, -1) fallback below a length-squared
 * of 0.001), and locomotion.js carried the comment "same as dodge.planarBasis, unify later". Two copies of a threshold
 * drift: a fix to the degenerate case in one would leave a dodge going where a walk would not.
 *
 * This drives BOTH producers over the same cameras and keys, down to either side of the 0.001 line and the looking-
 * straight-up camera, and holds that the direction a walk goes is the direction a dodge goes. It passes while the two
 * agree, whichever way they are built, and goes red the moment either moves alone; the copy is gone, so one edit moves both.
 *
 * NOT CHECKED: speed (a walk scales to its speed, a dodge is a unit vector; the gate divides it out), and the Player
 * loop's use of either.
 *
 * Mutation-Proof: see the commit trailer.
 */

// Lengths straddle the degenerate line (length-squared 0.001, length 0.03162): below it the camera counts as straight up.
const LENGTHS = [0, 1e-9, 0.03, 0.0315, 0.0317, 0.04, 0.5, 1, 40];
const ANGLES = Array.from({ length: 16 }, (_, i) => (i * Math.PI * 2) / 16 + 0.1);
// Keys whose intents do not cancel: the eight directions.
const KEYS = [
  { moveF: true }, { moveB: true }, { moveL: true }, { moveR: true },
  { moveF: true, moveR: true }, { moveF: true, moveL: true }, { moveB: true, moveR: true }, { moveB: true, moveL: true },
];

describe('a walk and a dodge go the same way for the same camera and keys', () => {
  it('over every camera length and angle and every direction of keys', () => {
    const disagree = [];
    let checked = 0;
    for (const len of LENGTHS) {
      for (const a of ANGLES) {
        const cx = Math.cos(a) * len, cz = Math.sin(a) * len;
        for (const keys of KEYS) {
          const walk = moveVector(cx, cz, keys, BASE_MOVE_SPEED);
          const dodge = dodgeDirection(cx, cz, keys);
          checked++;
          if (!walk.moving) { disagree.push(`camera (${cx}, ${cz}) keys ${JSON.stringify(keys)}: the walk does not move`); continue; }
          const wx = walk.x / BASE_MOVE_SPEED, wz = walk.z / BASE_MOVE_SPEED;
          if (Math.abs(wx - dodge.x) > 1e-9 || Math.abs(wz - dodge.z) > 1e-9) {
            disagree.push(`camera (${cx.toFixed(4)}, ${cz.toFixed(4)}) keys ${JSON.stringify(keys)}: walk (${wx.toFixed(4)}, ${wz.toFixed(4)}), dodge (${dodge.x.toFixed(4)}, ${dodge.z.toFixed(4)})`);
          }
        }
      }
    }
    expect(checked, 'camera and key combinations compared').toBe(LENGTHS.length * ANGLES.length * KEYS.length);
    expect(disagree.slice(0, 5), `${disagree.length} of ${checked} disagree`).toEqual([]);
  });

  it('SETUP: the sweep reaches both regimes of the basis, wherever its degenerate line sits', () => {
    // Below the line the camera counts as straight up and forward is (0, -1); above it forward is the camera's own
    // direction. The gate names no line: it asks that some camera in the sweep falls each side of wherever it is.
    let fallback = 0, directional = 0;
    for (const len of LENGTHS) {
      for (const a of ANGLES) {
        const v = moveVector(Math.cos(a) * len, Math.sin(a) * len, { moveF: true }, 1);
        if (Math.abs(v.x) < 1e-9 && Math.abs(v.z + 1) < 1e-9) fallback++; else directional++;
      }
    }
    expect(fallback, 'cameras that read as straight up').toBeGreaterThanOrEqual(ANGLES.length);
    expect(directional, 'cameras that read as a direction').toBeGreaterThanOrEqual(ANGLES.length * 3);
  });
});
