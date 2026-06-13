// Per-biome ambient wind character (interleave). Pure map: the player's surface block (from
// world/climate.surfaceBlockAt) -> a looping wind bed's filter cutoff + gain. SoundManager ramps a
// noise voice toward these so each biome SOUNDS distinct (rides the M3/M4a biome visuals). Underwater
// (isWater) muffles everything. Tuned conservatively — the bed is a subtle UNDER-layer, not music.
const LAND = {
  5: { cutoff: 5200, gain: 0.075, label: 'snow' },   // bright, airy howl
  4: { cutoff: 2600, gain: 0.060, label: 'desert' },  // dry mid hiss
  3: { cutoff: 1400, gain: 0.045, label: 'stone' },   // hollow draft
  1: { cutoff: 900,  gain: 0.050, label: 'plains' },  // soft low rustle
  2: { cutoff: 900,  gain: 0.050, label: 'plains' },  // dirt -> same as plains
};
const DEFAULT = LAND[1];
const UNDERWATER = { cutoff: 380, gain: 0.085, label: 'underwater' }; // muffled, enveloping

export function biomeAmbience(surfaceBlock, isWater) {
  if (isWater) return { ...UNDERWATER };
  return { ...(LAND[surfaceBlock] || DEFAULT) };
}
