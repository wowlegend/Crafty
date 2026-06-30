// weatherGate.js — PURE weather-biome gate (W4). No THREE / store / refs. Maps the player's surface
// block (from world/climate.surfaceBlockAt -> same codes FOOTSTEP_TYPE/biomeTable use) to the precip the
// active weather is ALLOWED to render, so snow never falls on the desert and rain never falls in the snow
// biome. Also resolves the storm sky-darkening mood boost. Consumed by the WeatherSystem in GameScene.

export const SNOW_SURFACE = 5;   // snow biome surface block
const SAND_SURFACE = 4;   // desert/beach (dry — no precip) (module-internal)

// Partial mood darkening during a storm: explore(0) -> ~dusk feel. Less than obsidian(2) so a daytime
// storm reads as overcast/moody, not full night. The Atmosphere driver MAXes this with the day/night mood.
export const STORM_MOOD_BOOST = 0.85;

// The precip the current biome permits: 'snow' (cold), 'rain' (temperate), 'none' (dry desert).
export function allowedPrecip(surfaceBlock) {
  if (surfaceBlock === SNOW_SURFACE) return 'snow';
  if (surfaceBlock === SAND_SURFACE) return 'none';
  return 'rain';
}

// v7 snow-model: what ACTUALLY falls, given the unified weather state + the player's current biome.
// The state machine now cycles clear<->'storm' (decoupled from the precip TYPE); when a storm is
// active the player's biome decides the form via allowedPrecip. This fixes "snow never shows": the
// OLD model cycled a GLOBAL clear->rain->snow type that almost never lined the 'snow' phase up with
// actually standing in a cold biome (and a snow biome during the 'rain' phase rendered nothing). Now
// any storm in a cold biome snows, any storm in a temperate biome rains, the desert stays dry.
// Pure: 'none' when not storming, else allowedPrecip(surfaceBlock).
export function precipFor(activeWeather, surfaceBlock) {
  if (activeWeather !== 'storm') return 'none';
  return allowedPrecip(surfaceBlock);
}

// Sky-darkening boost for the active weather state. The v7 unified 'storm' state darkens the sky;
// the legacy 'rain'/'snow' values are still honored for back-compat. Clear/none -> 0.
export function stormMoodBoost(activeWeather) {
  return (activeWeather === 'rain' || activeWeather === 'snow' || activeWeather === 'storm')
    ? STORM_MOOD_BOOST
    : 0;
}
