// frameStep.js — the longest slice of time the world advances in one frame, the same for every mover.
//
// The player's walk (Components.jsx, through worldClock.realDelta), the mobs (AIWorkerSystem, through worldDelta and
// takeTick below), every other world useFrame (worldDelta), the enemy arrows (enemyProjectiles.js) and the hurl
// (hurl.js) all read MAX_FRAME_STEP_SEC. A frame longer than it (a stall, a tab restored, a throttled device under
// 4 fps) runs the whole world in slow motion. When the AI alone was capped and the player took the whole frame, a
// 3.9 s stall moved the player 3.9 s and every pursuer 0.25 s, and a fight could be out-walked.
//
// WHY 0.25 s, NOT LOWER:
//   - The player cannot tunnel at any step: the KCC sweeps its capsule (Rapier 0.19.2 computeColliderMovement), and a
//     single 14 m sweep stops at a 5 cm wall (tests/integration/kinematic-move-rapier.test.js). A lower cap buys the
//     player nothing.
//   - Arrows and the hurl substep inside the frame (0.02 s and 0.05 s), so their tunnelling bound is the substep.
//   - The AI worker's tick was already capped at 0.25 s, so a mob's longest step is unchanged.
//   - A lower cap puts more frame rates into slow motion: at 0.1 s, every frame slower than 10 fps would run the game
//     below real time. CI's software-rendered runner draws a frame in about 227 ms (median), under 0.25 s.
export const MAX_FRAME_STEP_SEC = 0.25;

/** The frame's step, seconds: the frame's delta, capped. 0 for a negative or non-finite delta. */
export function frameStep(delta) {
  return delta > 0 ? Math.min(delta, MAX_FRAME_STEP_SEC) : 0;
}

/**
 * A fixed-rate bridge's tick (AIWorkerSystem posts the AI worker one every `minTickS`): once `acc.current` holds at
 * least `minTickS`, take at most one capped step from it and leave the rest for the next tick. Returns the tick's
 * seconds, or 0 when it is not yet due. The remainder is carried, not dropped: dropping it lost the AI up to a tick on
 * every frame that crossed the cap, which the player (stepped every frame) never lost.
 */
export function takeTick(acc, minTickS) {
  if (!(acc.current >= minTickS)) return 0;
  const tick = Math.min(acc.current, MAX_FRAME_STEP_SEC);
  acc.current -= tick;
  return tick;
}
