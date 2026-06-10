// S2-B2-pre-M2 perf (STATE-REVIEW-2026-06-10 #2, weather term): gate for the weather particles'
// per-frame ground raycast. A particle falling from +25 only needs terrain testing near the
// ground band, and neighbors share temporal resolution — probe only below PROBE_NEAR_Y local
// height, striding across frames by index (each in-band particle still probes every
// PROBE_STRIDE frames ≤ 67ms@60fps). The caller's unconditional `y < -15` floor reset keeps
// correctness whenever a probe is skipped; worst case a drop visually clips elevated terrain for
// <4 frames. Cuts the worst-case rain/snow raycast term ~6×.
export const PROBE_NEAR_Y = 12;
export const PROBE_STRIDE = 4;

export function shouldProbeGround(localY, index, frame, nearY = PROBE_NEAR_Y, stride = PROBE_STRIDE) {
  if (localY >= nearY) return false;
  return ((index + frame) % stride) === 0;
}
