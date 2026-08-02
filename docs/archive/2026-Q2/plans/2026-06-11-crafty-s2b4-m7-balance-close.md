# ELEMANCER M7 — Balance + The Aspect Close Implementation Plan

> **✅ SHIPPED (2026-06-11, loop iter 82):** T1 the budget table (ship as-specced) · T2 the 🏆 spine-complete banners across spec/SOTA/CHANGELOG/KRB · T3 the interleave decision in ACTIVE_PLAN. 831 unit · build · visual 13/13.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-10-crafty-s2b4-elemancer-design.md` §3 M7.
> **THE PLAN-TIME DECISION (the pre-agreed first-cut clause exercises):** the reagent blocks
> (oil-wood/ice-crystal hotbar placeables) FOLD TO v1.5 with the frost plates. A new block TYPE is not
> a placement — it needs an atlas texture + worker-side id handling: the exact re-mesh/worker risk-class
> this whole Aspect was architected to avoid, taken on at the LAST milestone for a flavor payoff the
> zones don't need to stand. The design's own clause: "the reagent blocks (M7) → v1.5 if anything
> slips; the zones stand alone." The honest reagent TODAY: player-placed wood is already
> worldBlocks-known — the fire-spread seam (M6+ deferred) picks it up in v1.5 with the blocks.

**Goal:** The zone-DPS budget table + verdict in the spec; the 🏆 ELEMANCER close across every surface — completing the four-Aspect spine.

### T1 — the balance table (pure math, the B3-M7 precedent)
- [x] Compute + record in the spec M7 row: burning ≈ BURN_TICK 4 × ~3.3Hz ≈ 13 dps per in-zone mob · conductive ≈ 20 dps (the strongest, bounded by ttl 8 + the price) · frozen = 0.4× speed (the tactical star — CC, not DPS) · vs hostile HP 60-100 with CROSSING dwell ~1-2s (no hazard-bias: mobs path blind — thematically dumb mobs, recorded) ≈ 15-25 damage per crossing. The economy bound: 30/zone on a 100 bank fed by build verbs (mine 1/place 2) ≈ 3-9 zones per day cycle — chemistry is priced area-denial + CC, not a turret. The four dampers: dwell-bounded DoT · the 8-zone cap · the dawn-bled bank · 'hazard' banks nothing (M1).
- [x] Verdict: SHIP AS-SPECCED unless the math says a zone out-DPSes the player's own sustained output (it doesn't — player melee+spells ≈ 30-60 dps focused). All consts Kevin-tunable.
- [x] Commit `balance(elemancer-m7): the zone budget table (verdict recorded)`

### T2 — 🏆 the Aspect close-out (doc-currency is part of done)
- [x] Spec header → 🏆 ASPECT COMPLETE (the kit paragraph + evidence counts + the parked list: reagents+frost-plates v1.5 · the v2 voxel-mutation seam · hazard-bias-if-needed · the night-siege emissive eyeball). All §3 rows ✅.
- [x] SOTA-INITIATIVE banner: **B4 ✅ → THE ASPECT SPINE COMPLETE (all four live)** + the live scale counts.
- [x] CHANGELOG: the M1-M7 + Aspect entry (the review-before-build pattern note: 4 pre-build catches, zero shipped render-bug families this Aspect).
- [x] KRB: the ELEMANCER playtest protocol (build by day → watch the bar → Z → cast at ground → the zone + voice → fire-onto-ice steam → the rune amplifies → the char scorch after burnout).
- [x] Commit `docs(elemancer): 🏆 THE SPINE COMPLETE — all four Aspects live`

### T3 — the interleave decision (charter §2.5, DUE at the boundary: feel @61, six milestones since)
- [x] ACTIVE_PLAN records the next unit via a quick value/cost rank: (a) music-motif v2 — per-Aspect stingers (the #74 deferred half; the four Aspects NOW EXIST to score); (b) content variety — new mob types (the 6-type roster is the visible ceiling; also enriches snare/fuse); (c) a night-siege juice pass. THEN the S2-completion `challenge-memory` (postponed twice — now due) and the B4-v1.5/S3 spine decision follow.

## Self-review: T1 covers the spec's "balance vs siegeParams"; T2 the close; the reagent cut is recorded at the top with its reasoning (not silently dropped); the §8 Kevin batch already carried the tunables.
