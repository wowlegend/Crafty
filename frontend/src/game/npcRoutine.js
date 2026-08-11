// Pure ambient-routine math for hub NPCs + the occasional wandering traveler. NO state/Three. A small
// looping patrol around a home anchor by day; retreat-to-home at night (ties to the siege day/night
// loop). Deterministic from (home, time) so it is unit-testable + the render layer just reads it in a
// throttled tick (Game-Loop-Isolation). PATROL_R stays small so NPCs hover near their post (the ambient
// tick re-raycasts ground Y each frame so they remain flush even at the patrol extremes). Cheap "max"-tier life.
const PATROL_R = 2.0;
const EMOTES = ['…', '*hums*', '*sweeps*', '*nods*', '*stretches*'];

// `shouldRetreatAtNight(isDay) => !isDay` used to live here. Deleted 2026-08-11: it restated the branch
// the line below already owns, and nothing outside its own test ever called it. Two expressions of one
// rule is one that can drift.
export function routinePosition(home, t, isDay) {
  if (!isDay) return { x: home.x, z: home.z }; // retreat home at night
  const a = (t * 0.25) % (Math.PI * 2);        // slow loop
  return { x: home.x + Math.cos(a) * PATROL_R, z: home.z + Math.sin(a) * PATROL_R };
}

/**
 * ALLOCATION-FREE variant, for the per-frame ambient loop.
 *
 * routinePosition returns a fresh object and takes a fresh one for `home`, and the hub-NPC routine called
 * it once per NPC per RENDER frame -- two literals per NPC per frame for a value that never outlives the
 * lerp two lines later. The object-returning form stays for the callers that run once.
 *
 * @param {{x:number,z:number}} out
 */
export function routinePositionInto(out, homeX, homeZ, t, isDay) {
  if (!isDay) { out.x = homeX; out.z = homeZ; return out; }
  const a = (t * 0.25) % (Math.PI * 2);
  out.x = homeX + Math.cos(a) * PATROL_R;
  out.z = homeZ + Math.sin(a) * PATROL_R;
  return out;
}

export function nextEmote(seq) { return EMOTES[Math.floor(Math.abs(seq)) % EMOTES.length]; }
