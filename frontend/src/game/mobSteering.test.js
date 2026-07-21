import { describe, it, expect } from 'vitest';
import { steerGoalCell } from './mobSteering.js';

// Guards the ai.worker.js:302 archer-kite bug: the A* steer goal must be resolved from the mob's TACTICAL
// target, so a retreating archer (target set AWAY from the player) steers AWAY, not back into melee.
// The mob-centered 9x9 grid puts the mob at cell (4,4); gx<4 is "toward the retreat side", gx>4 is "toward
// the player" in these fixtures (player to the +X of the mob).
describe('steerGoalCell — mob A* steer goal resolves from the TACTICAL target (kite-preserving)', () => {
  it('retreating archer: a target set AWAY from the player yields a goal cell on the away side', () => {
    // mob at (10,10); player 2 east at (12,10) -> dist 2 (<8) -> archer retreats: target = (x-dx, z-dz) = (8,10).
    const { gx, gz } = steerGoalCell(8, 10, 10, 10);
    expect(gx).toBe(2); // west of centre (4,4) -> AWAY from the east player (was 6/toward, the bug)
    expect(gz).toBe(4);
    expect(gx).toBeLessThan(4); // the kite invariant: steer away from the player, not into melee
  });

  it('chaser: a target AT the player yields a goal cell toward the player', () => {
    // mob (10,10), player east at (14,10); a chaser's tactical target IS the player.
    const { gx, gz } = steerGoalCell(14, 10, 10, 10);
    expect(gx).toBe(8); // east of centre -> toward the player (round(14-6)=8, clamped)
    expect(gz).toBe(4);
    expect(gx).toBeGreaterThan(4);
  });

  it('clamps a far target to the 9x9 grid bounds', () => {
    expect(steerGoalCell(100, -100, 10, 10)).toEqual({ gx: 8, gz: 0 });
  });

  it('a target at the mob resolves to the centre cell', () => {
    expect(steerGoalCell(10, 10, 10, 10)).toEqual({ gx: 4, gz: 4 });
  });
});
