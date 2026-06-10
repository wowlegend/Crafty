# The SOULBIND feel pass — bind ceremony + ally-swing legibility (design note)

> **Status (2026-06-10): DESIGN COMMITTED (the charter §2.5 experience interleave, post-B3).**

## Why these two (value/cost ranked at iter-60 close)
1. **Ally attack swings are INVISIBLE** — allies deal damage (sparks fire at the victim) with zero
   motion of their own: a legibility GAP, not polish. Fix: a ~0.2s squash-stretch lunge pulse on the
   ally at its attack tick.
2. **The bind ceremony is just a chime** — the Aspect's emotional beat (a creature JOINING you)
   deserves a visible moment. Fix: a one-shot expanding jade ring + light bloom at the bind point
   (~0.35s), fired on bind AND on fusion (the hybrid's birth).

## Mechanisms (all established recipes; capture-inert by construction)
- **The swing pulse:** MobModel's useFrame reads `entity.lastAllyAttack` (ALREADY written by the
  SquadAISystem bridge at attack time) → for 0.2s after, scale = 1 + 0.18·sin(π·t/0.2) (squash-
  stretch, no new fields, no setState). Gated OFF in capture (the exact-pose pin stays byte-stable).
- **The ceremony ring:** snareChannel gains a one-shot `fireBindCeremony(pos)` / `consumeBindCeremony()`
  (the hurl/slam consume pattern); SnareTetherSystem gains a second always-mounted mesh (a flat ring,
  additive jade #3DFFB0, toneMapped false) driven transiently: scale 0.5→2.2, opacity 0.8→0 over 0.35s
  (the impact-flash envelope recipe). Fired from the Components bind branch + the fuse branch.
- Judged via the numeric envelope (the M7-T2 precedent — CDP can't catch <400ms) + Kevin's ear/eye cue.

## Out of scope (recorded): per-Aspect arp stingers (#74 v2) and new mob types — both remain
ranked candidates for the next interleave window.
