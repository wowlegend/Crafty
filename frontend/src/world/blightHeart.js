import { TIER_RING, MAX_TIER } from './zoneTier.js';

// S9: the Blight Heart -- a FIXED, foreshadowed far-frontier lair (NOT a random ambush). The same coord
// every game (the world seed is fixed), so it is a learnable destination you see on the horizon + journey
// toward. Pure (no state) -> unit-testable + capture-safe (far from the spawn-pinned capture camera, so it
// never appears in a baseline). Sits deep in the top zone tier (the most dangerous ring) at a fixed bearing,
// so it reads as "the dark thing at the edge of the world" that the whole run builds toward.
// The compass marker (S9b) + the boss spawn (S9b) both consume this one source.
export const BLIGHT_RADIUS = TIER_RING * (MAX_TIER + 1); // 256 * 5 = 1280 blocks -> deep tier 4

export function blightHeartSite() {
  // Fixed NE-ish bearing at BLIGHT_RADIUS; integer coords for clean chunk alignment. ceil (not round) so the
  // rounded diagonal coord's radius stays >= BLIGHT_RADIUS (round-down would pull it just inside the ring).
  const d = Math.ceil(BLIGHT_RADIUS / Math.SQRT2);
  return { x: d, z: d };
}
