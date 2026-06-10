# Crafty S2-B4 — ELEMANCER (terrain chemistry) — design of record

> **Status (2026-06-10): DESIGN COMMITTED (loop self-gate per charter §5).** Produced by a 4-lens design
> workflow vs LIVE code (voxel-remesh · element-combat · experience-content · adversarial-scope; 450k
> tokens, 130 file reads) + orchestrator synthesis. Parent: the S2 master spec §4 B4. **THE CENTRAL
> DELIVERABLE IS THE v1/v2 SPLIT:** v1 ships with ZERO voxel edits / ZERO worker messages / ZERO re-mesh
> (inside the desktop-proven envelope, no iPad number needed); v2 (real terrain mutation) is a DESIGNED
> SEAM behind the parked real-iPad perf gate. NEXT: Kevin §8 batch (async) → per-milestone plans → build,
> exploit-closers first.

## 0. The fantasy + the v1 stance

Spells throw elements AT mobs; **the Elemancer paints elements INTO the world and the terrain fights
for you.** v1 = "IMBUED CAST": hold Z to imbue your next cast — the impact spawns an ELEMENT ZONE
(a stateful, visible, time-acting surface effect) instead of just damage. Identity = authored,
persistent, combinatorial surface-states — explicitly NOT spells 2.0, because every verb leaves a
state that acts over time and combos. **The honest constraint that shapes everything (pristine-voxel
blindness, voidhand.js:21-25):** the main thread knows block types only for PLAYER-EDITED voxels —
so v1 fire spreads along YOUR built wood (the day-build payoff IS the fantasy) and reagent objects,
never pristine trees; that honesty is recorded, not hidden.

## 1. Verified ground truth (load-bearing)

- **The re-mesh cost is real and double-ended:** one `update_block` = a full-chunk greedy re-mesh
  (~3.5M mask evals) in the worker PLUS a full BufferGeometry rebuild + a Rapier trimesh re-cook on
  the main thread (an observed 0.5s frame hitch class). There is no partial re-mesh and no batch
  message. **The live anti-pattern:** the explosion path posts N `update_block` per crater — N full
  re-meshes (AdvancedGameFeatures.jsx:336) — the exact death v1 must never re-enter.
- **Water already collides + raycasts** (the trimesh includes block-9 faces; getMobGroundLevel returns
  the water surface) → a frost plate is mostly visual + a walk flag; verify the player KCC on water at
  build time.
- **Impacts are surface-blind today** (spells only height-check); castBuildRay knows coords but not
  pristine types; `worldBlocks.get(coords)` is the only identity source (player edits).
- **Two incidental finds to fix en route:** Components.jsx:808 looks up worldBlocks with a COMMA key
  while every writer uses underscores (a latent always-miss); iceball's freeze secondary writes
  `mobSlowEffects`/`mobStunEffects` that NOTHING reads (shipped dead — the proven unwiring failure
  mode; v1's zoneSlowMult replaces them and deletes the dead writes, unit-locked at the consumer).
- The no-re-mesh gate FORBIDDEN regex matches the literal string `postMessage` even in comments —
  elemancer files must avoid the word entirely (the 3×-proven gate joins at the FIRST code milestone).

## 2. The kit (v1 — all zone/overlay/object, hard-capped)

- **IMBUE (hold KeyZ — a new `imbue` intent; completes the Aspect-verb row R/V/X/Z):** arms your next
  cast (element = activeSpell, the locked Digit1-4 pattern; a reticle swap reads the armed state).
  The imbued projectile's impact spawns the element's ZONE at the surface point. Spending: the
  Resonance meter.
- **THE ZONES (one pure registry, MAX_ZONES=8 oldest-evict, TTL 8-12s, dawn-extinguished,
  load-transient):**
  - **FIRE — Kindle:** a burning zone (DoT field, `damageMob(..., 'fireball', 'hazard')` ≤4Hz ticks)
    that SPREADS face-to-face ONLY along worldBlocks-known wood + reagent blocks (BFS, cap 24 faces,
    oldest burn out → permanent CHAR decals: your fortress remembers the siege, no voxel ever lost).
  - **ICE — Frost Plate:** on generated water (y≤28 oceans/moats are real terrain) grows a walkable
    plate (the ONE pooled Rapier-cuboid prop, cap 8; ~20s life, 3s crack telegraph; the player gets a
    +2s standing grace, mobs don't). Frozen moats + sortie bridges. On land: a freeze-slow field
    (`zoneSlowMult`, consumed at the single mobsData build site — replacing the dead mobSlowEffects).
  - **LIGHTNING — Conduct:** on wet surfaces (wetness DERIVED from water adjacency/frost plates at
    query time — no stored bytes) a chain detonation arcs across the contiguous wet zone (flood-fill
    cap) via the existing chain-lightning recipe.
  - **ARCANE — Resonance Rune (the 4th element's identity = the CATALYST):** doesn't react — BENDS
    the others: amplifies the next reaction touching it (wider kindle / bigger plate / longer chain)
    + a mote-lure that draws mobs (the trap-spring). Arcane authors combos; that IS chemistry mastery.
- **REAGENT OBJECTS (the spec's readable-objects mandate, anchoring the build payoff):** OIL-WOOD and
  ICE-CRYSTAL as new placeable hotbar blocks — placed via the normal calm build path so they persist
  in worldBlocks FOR FREE (and are type-known to the main thread, closing the pristine-blindness gap
  exactly where the player builds). Oil-wood burns hotter/faster (spark-burst finale); ice-crystal
  auto-sustains adjacent frost plates at night.
- **RESONANCE (`game/resonance.js`, the 4th meter — but the economy is NOVEL):** banked from DAY
  BUILD VERBS (mine ~1 / place ~2, day-only, capture-gated, burst-guarded) — building literally
  charges the chemistry (the only untaken economy; ties the Aspect to the day loop distinctively).
  MAX 100, ZONE_COST ~30 (~3 zones per bank), dawn-bled, progression-slice persisted. **The economy
  cap IS the perf cap** under the hard MAX_ZONES ceiling.
- **Identity color: white-gold `#F5D76E` family** (the catalyst tone — distinct from the 4 element
  palette colors and the 3 Aspect identities). Talent: effect-less `elemancer_imbue` (limit 1, prereq
  `elemancer_focus`). SFX: all-synth ignite/freeze-crackle/zap + the rune hum. Self-hazard OFF
  globally in v1 (no zone path calls damagePlayer; no family-tier surface exists yet to gate on).
- **Self-imposed v1 perf caps (desktop-proven, no iPad number needed):** 8 zones · one InstancedMesh
  decal pool (~24 instances, count-0 mounted) · ZERO new pointLights · DoT ≤4Hz · spark bursts ≤12 ·
  spread BFS ≤24 faces.

## 3. Milestones (7 — exploit/risk-first, the B3 scaffold)

| M | What | The gate |
|---|---|---|
| M1 ✅ | The `'hazard'` kill-bus source end-to-end (zone kills bank NOTHING anywhere; no hitstop/shake/XP) + fix the comma-key bug | subscriber tests + the gate file extended |
| M2 | `game/elemancer.js` imbue SM + `game/resonance.js` (build-verb accrual) + the talent node + persistence | TDD twins |
| M3 | `game/elementZones.js` pure registry (spawn/TTL/cap/evict/overlap rules: fire+ice annihilate; arcane amplifies) + `elemancerChannel` + the noremesh gate JOINS HERE (before any render) | registry TDD + the gate |
| M4 | The zone bridge (15Hz accumulator: DoT/slow/chain/lure; zoneSlowMult replaces the dead mobSlowEffects; hazard cells bias the AI heightGrid — sieges path around fire) | wiring tests + the mobsData consumer lock |
| M5 | IMBUE end-to-end (KeyZ intent + the armed reticle + the surfaceHint thread through the #72 cast branch + zone spawn at impact) | the verb plays |
| M6 | THE LOOK: the instanced decal pool + char decals + frost plates + the rune + SFX + the elemancerShowcase card (the sky-studio family) | the judge card + visual 13/13 |
| M7 | Reagent blocks (oil-wood/ice-crystal hotbar) + balance vs siegeParams + 🏆 the Aspect close | the budget table + doc-currency |

**The pre-agreed first cut:** the reagent blocks (M7) → v1.5 if anything slips; the zones stand alone.

## 4. The v2 seam (DESIGNED, NOT BUILT — behind the real-iPad number)

(1) a worker `update_block_batch` message — one re-mesh per chunk per batch (also retrofits the
explosion N-re-mesh anti-pattern); (2) the element byte-plane as a SECOND per-chunk Uint8Array (never
packed into block bytes — saves/mods intact); (3) the REAL gate = the main-thread trimesh re-cook:
measure it separately; the levers are cook-in-worker or a one-chunk-per-N-frames budget queue;
(4) propagation ticks in the worker with per-chunk dirty batching. Burned-through walls, frozen-solid
water voxels, melted stone — all v2.

## 8. KEVIN DECISION BATCH (async via KRB; recs in bold, the loop proceeds on them)

1. **The v1 fantasy honesty:** pristine trees don't burn in v1 (the blindness constraint) — fire
   spreads along YOUR built wood + reagents. **Rec: YES** (it makes building the fuel — the day-loop
   payoff — and v2 unlocks the rest).
2. **The Resonance economy banks from BUILD verbs** (not kills — the 4th kill-clone would be noise).
   **Rec: YES.**
3. White-gold `#F5D76E` + the four zone looks — **rec: as-specced**, judged at M6 with the showcase card.
4. ZONE_COST 30 / MAX_ZONES 8 / TTL 8-12s / spread cap 24 — **rec: as-specced**, all Kevin-tunable.
