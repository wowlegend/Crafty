// verbRouter.js — #72: the mouse VERB ROUTER. One click -> exactly ONE verb. Pure (no
// React/Three/Rapier imports; node-testable). Design-of-record:
// docs/superpowers/specs/2026-06-10-crafty-72-verb-router-design.md — target-priority ladder,
// no lanes, no modes, day/night NEVER routes. The two base-destructive mis-routes (melee->mine,
// cast->place at a live target) are impossible by construction; ties break toward combat.
//
// ctx — built once per click by the single Components listener:
//   held         voidhandHeld (M3's SM re-skins attack/cast to HURL/SLAM downstream — this
//                router is UNCHANGED at M3; held also short-circuits terrain: you AIM at your
//                own wall for the 3x anvil hurl, it must never mine)
//   meleeHit     a mob/boss is in the LIVE melee cone (the same call damage uses ->
//                router-says-attack ≡ swing-lands)
//   aimedMobDist nearest mob/boss in the narrow aim cone (mobs are COLLIDER-LESS — the Rapier
//                ray passes through them, so this pure-math distance is the through-mob guard)
//   terrainDist  toi of the single 8m build ray (Infinity if no hit)
//   chestTargeted the ray hit resolves to a placed chest

export const AIM_CONE_RANGE = 24;          // ~spell range; through-mob guard reach
export const AIM_CONE_ARC = Math.PI / 8;   // narrow crosshair cone (vs the wide PI/2 melee arc)

export function routeMouseVerb(button, ctx) {
  const { held, meleeHit, aimedMobDist, terrainDist, chestTargeted } = ctx;
  if (button === 0) {
    if (held) return 'attack';                       // -> HURL at M3; never mines the anvil wall
    if (meleeHit) return 'attack';
    if (aimedMobDist <= terrainDist) return 'attack'; // through-mob guard; tie -> combat
    if (terrainDist < Infinity) return 'mine';
    return 'attack';                                 // whiff (swing feel preserved)
  }
  if (button === 2) {
    if (held) return 'cast';                          // -> SLAM at M3; hands full, chest ignored
    if (chestTargeted && terrainDist < aimedMobDist) return 'interact';
    if (aimedMobDist <= terrainDist) return 'cast';   // tie -> combat (never place onto a mob)
    if (terrainDist < Infinity) return 'place';
    return 'cast';                                    // ranged projectile needs no surface
  }
  return 'none';
}
