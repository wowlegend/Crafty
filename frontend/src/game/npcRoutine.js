// Pure ambient-routine math for hub NPCs + the occasional wandering traveler. NO state/Three. A small
// looping patrol around a home anchor by day; retreat-to-home at night (ties to the siege day/night
// loop). Deterministic from (home, time) so it is unit-testable + the render layer just reads it in a
// throttled tick (Game-Loop-Isolation). PATROL_R stays small so NPCs hover near their post (the ambient
// tick re-raycasts ground Y each frame so they remain flush even at the patrol extremes). Cheap "max"-tier life.
const PATROL_R = 2.0;
const EMOTES = ['…', '*hums*', '*sweeps*', '*nods*', '*stretches*'];

export function shouldRetreatAtNight(isDay) { return !isDay; }

export function routinePosition(home, t, isDay) {
  if (!isDay) return { x: home.x, z: home.z }; // retreat home at night
  const a = (t * 0.25) % (Math.PI * 2);        // slow loop
  return { x: home.x + Math.cos(a) * PATROL_R, z: home.z + Math.sin(a) * PATROL_R };
}

export function nextEmote(seq) { return EMOTES[Math.floor(Math.abs(seq)) % EMOTES.length]; }
