/**
 * Mob death dissolve. A kill used to be an instant `ecs.remove` + a spark -- now the corpse lingers for
 * DEATH_DISSOLVE_MS, shrinking + spinning out so the kill has WEIGHT, before it's removed. `t` in [0,1]
 * is the dissolve progress (0 at death, 1 at removal) -- compute it with the shared
 * windupRamp(now, dyingUntil, DEATH_DISSOLVE_MS). Pure + RNG-free. Feel/timing -> Kevin #50.
 */
export const DEATH_DISSOLVE_MS = 320;

export function dissolvePose(t) {
  const e = t < 0 ? 0 : t > 1 ? 1 : t;
  return { scale: 1 - e, spin: e * 2.0 };
}
