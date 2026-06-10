// S2-B2-pre-M2 perf (STATE-REVIEW-2026-06-10 #2, weather term): gate for the weather particles'
// per-frame ground raycast. A particle falling from +25 mostly needs terrain testing near the
// ground band, and neighbors share temporal resolution — so probe at the fast stride below
// PROBE_NEAR_Y local height (in-band staleness ≤ PROBE_STRIDE frames ≈ 67ms@60fps), and at the
// SLOW stride above it (≤ PROBE_STRIDE*PROBE_ABOVE_BAND_MULT frames ≈ 267ms) so terrain HIGHER
// than the player (hills/overhangs) still catches drops with a BOUNDED clip — the review-caught
// hole in the original pure-band cutoff (above-band clipping was unbounded). The caller's
// unconditional `y < -15` floor reset stays the correctness backstop. Net cut ~4-6× worst-case.
export const PROBE_NEAR_Y = 12;
export const PROBE_STRIDE = 4;
export const PROBE_ABOVE_BAND_MULT = 4;

export function shouldProbeGround(localY, index, frame, nearY = PROBE_NEAR_Y, stride = PROBE_STRIDE) {
  const effStride = localY < nearY ? stride : stride * PROBE_ABOVE_BAND_MULT;
  return ((index + frame) % effStride) === 0;
}
