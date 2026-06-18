// weatherGate.js — PURE weather-biome gate (W4). No THREE / store / refs. Maps the player's surface
// block (from world/climate.surfaceBlockAt -> same codes FOOTSTEP_TYPE/biomeTable use) to the precip the
// active weather is ALLOWED to render, so snow never falls on the desert and rain never falls in the snow
// biome. Also resolves the storm sky-darkening mood boost. Consumed by the WeatherSystem in GameScene.

export const SNOW_SURFACE = 5;   // snow biome surface block
export const SAND_SURFACE = 4;   // desert/beach (dry — no precip)

// Partial mood darkening during a storm: explore(0) -> ~dusk feel. Less than obsidian(2) so a daytime
// storm reads as overcast/moody, not full night. The Atmosphere driver MAXes this with the day/night mood.
export const STORM_MOOD_BOOST = 0.85;

// The precip the current biome permits: 'snow' (cold), 'rain' (temperate), 'none' (dry desert).
export function allowedPrecip(surfaceBlock) {
  if (surfaceBlock === SNOW_SURFACE) return 'snow';
  if (surfaceBlock === SAND_SURFACE) return 'none';
  return 'rain';
}

// Sky-darkening boost for the active weather state ('rain'|'snow' -> boost; else 0).
export function stormMoodBoost(activeWeather) {
  return (activeWeather === 'rain' || activeWeather === 'snow') ? STORM_MOOD_BOOST : 0;
}
