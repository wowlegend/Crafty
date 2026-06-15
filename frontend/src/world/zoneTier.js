// Distance zone-tier (Ember Frontier): the outward journey gains stakes. Radial distance from spawn
// (origin 0,0) -> an integer tier 0..MAX_TIER in concentric rings. Danger + reward ramp with the tier,
// so walking far is a deliberate risk/reward choice instead of aimless wandering.
//
// Pure (no state, no GL) -> unit-testable AND capture-deterministic: the visual-capture camera is pinned
// at the spawn origin (tier 0), so consuming zoneTier never shifts the regression baselines.
//
// Named zoneTier (NOT `tier`) on purpose: the codebase already uses `tier` for QUEST unlock tiers
// (QuestSystem.jsx) -- a distinct name avoids conflating world-distance zones with quest gating.
export const TIER_RING = 256; // blocks of radius per tier (tunable; the explorer quest's 500 ~= tier 1-2)
export const MAX_TIER = 4;    // tiers 0..4; far-out danger/reward plateaus here

export function zoneTier(worldX, worldZ) {
  const dist = Math.hypot(worldX, worldZ);
  return Math.min(MAX_TIER, Math.floor(dist / TIER_RING));
}
