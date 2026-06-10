# Crafty S2-B3 — SOULBIND (capture + squad + fuse) — design of record

> **Status (2026-06-10): DESIGN COMMITTED (loop self-gate per charter §5).** Produced by a 4-lens design
> workflow vs LIVE code (ai-faction · capture-snare · squad-fusion · adversarial-scope; 424k tokens,
> 108 file reads — full lens reports in the loop transcript) + orchestrator synthesis. Parent: the S2
> master spec §4 B3. NEXT: Kevin decision batch (§8, async via KRB) → per-milestone plan docs → build,
> hardest-first.

## 0. The fantasy (one sentence) + the v1 stance

Snare a weakened creature with a soul-ribbon, bind its LIVING body to your squad, and fuse two bound
creatures into a hybrid that fights the siege beside you. **v1 stance (loop-decided): allies are
DPS-assists and the PLAYER stays the tank** — enemies remain player-locked (the worker's only target
today, verified ai.worker.js:123-168); the worker faction protocol (hostiles targeting allies,
mob-vs-mob) is the NAMED v2 seam, deliberately deferred: it was every lens's schedule risk, and
"the siege still hunts YOU while your bound creatures harry it" is a real design position, not a cut.

## 1. Verified ground truth (the load-bearing code facts)

- **Targeting is player-only, hardcoded** (worker receives only playerPos; melee applies to the player
  unconditionally; no target-selection code exists anywhere). No faction concept in the codebase.
- **The 15Hz bridge stomps any `mobsQuery` entity** (serialize :823 / apply :759-782) — and the query
  ALSO drives the >100u despawn cull, the siege spawn cap, the minimap hostile count, and the player's
  melee cone. **Leaving the query exits all five surfaces by construction.** Two-ended trap: the
  postMessage build AND the id-keyed apply loop must exclude allies in the SAME commit.
- **The kill bus has no killer attribution** (`emitMobKill(type, position)`), and ferocity + kinetic +
  quests + XP orbs all key off any `damageMob` kill → ally kills would AFK-farm every economy, and
  killing your own ally would refund the meters. **Attribution is the FIRST milestone, before any ally
  exists.**
- **`damageMob` bleeds player feedback**: hitstop (:908) + camera shake (:917) fire on EVERY hit — an
  ally attacking off-screen judders the player's camera. A `source` param is load-bearing.
- **Pets are cosmetic** (React-state, zero damage dealt/taken, T-key DOUBLE-BOUND with tame). The pet
  chassis is the command-surface precedent but the wrong foundation. v1 sidesteps: passive mobs stay
  legacy-tame; squad = hostile captures only. Pets-vs-squad merge = a Kevin decision (§8).
- **MobModel is fully parametric** (bodySize/headSize/legMode/entity.color) → hybrids are DATA, and an
  ally re-tint is a per-entity color write. The boss is NOT a mobsQuery entity → structurally
  unsnareable (no special-case needed). MOB_TYPES = pig/cow/zombie/skeleton/spider/villager; villager
  is the quest NPC → blocklisted.

## 2. The kit (v1)

- **SNARE (KeyX — the Aspect-verb identity row: R=roar, V=grab, X=snare; a new `snare` intent, never a
  raw listener; KeyT is double-bound, avoided):** aim at a hostile at ≤30% HP within a 12m cone → a
  1.1s CHANNEL with per-frame validity (target stays in cone+range+alive — the mob keeps moving; held
  aim IS the skill) → BIND: the entity converts IN PLACE (leaves `isMob`, gains `isAlly`; healed; color
  lerped toward the soulbind identity; teal ribbon + spark + the bind SFX). Broken channel costs
  nothing; 1.5s cooldown. Snareable tell: the mob's health bar tints + body pulses (capture-frozen).
- **THE SQUAD:** cap 2 (+1 via a talent node). Auto-assist AI (v1: no command UI — follow at a 3-5m
  ring; engage the nearest hostile within ~18m of the PLAYER; leash-teleport at >40m): a pure
  `game/squadAI.js` brain stepped by a 15Hz-accumulator bridge (main-thread; the worker is never
  touched in v1 core); attacks via `damageMob(id, dmg, 'physical', 'ally')` (no hitstop/shake/XP);
  ally hits set the victim's `isAggro` (persists through the worker — draws the siege toward the
  fight). Allies persist day/night while bound; the squad ROSTER (types/hybrid ids) persists in the
  save progression slice (positions don't — respawn at the player on load).
- **SOUL economy (`game/soul.js`, the ferocity/kinetic stencil):** SOUL_MAX 100, day-kill accrual
  (8/16/60 tier gradient), SNARE_COST 35, FUSE_COST 50, dawn-bled, persisted+clamped. The tension is
  the design: kills BANK soul, but binding requires SPARING one at low HP — bank on the many, bind
  the one.
- **FUSE (hold-X with 2 allies near):** consumes two bound allies → ONE curated hybrid (lookup keyed
  `[a,b].sort().join('+')`; miss = refuse-toast, nothing consumed). v1 roster (3, role-spread, all
  parametric MobModel data): **Dreadweaver** (spider+zombie — 8-leg skirmisher), **Bonehide Bulwark**
  (cow+skeleton — massive bruiser), **Marrowspinner** (skeleton+spider — fast harasser). Fusion is
  the PRE-AGREED FIRST CUT to v1.5 if any milestone slips (it's content, not infrastructure).
- **Identity color: spectral jade `#3DFFB0`** (distinct from vermilion/violet/iceball-cyan) — token
  chain + HUD bar + ribbon/sparks + ally tint. Talent: effect-less `soulbind_snare` unlock (the
  voidhand_grasp pattern) + a `soulbind_pack` +1-cap node. SFX: all-synth (bind chime + fuse swell).

## 3. Milestones (7 — the Aspect-meta scaffold, hardest-first after the exploit-closers)

| M | What | The gate |
|---|---|---|
| M1 ✅ | **Kill-bus attribution** (`emitMobKill(type, pos, source='player')`; subscribers filter; ally deaths never emit) + `damageMob` source param (skip hitstop/shake/XP for 'ally') | exploit tests: ally kill banks NOTHING; the bus change is additive (all existing subscribers green) |
| M2 | `game/soulbind.js` SM + `game/soul.js` meter + persistence + the talent nodes (TDD twins) | unit suites mirror voidhand/kinetic |
| M3 | **The allegiance seam**: `isAlly` archetype conversion + the FIVE-surface exclusion (serializer + apply loop SAME commit, cull→leash, spawn cap, minimap, melee cone + verb-router ctx) + a static gate (an isAlly entity never appears in worker messages) | the gate + conversion unit tests |
| M4 | SNARE end-to-end: intent + channel + tell + ribbon (reuse `buildRibbonIndices`) + bind conversion + SFX | real-mob smoke (snare a live low-HP mob → it converts, no XP/kill emitted) |
| M5 | Squad AI: `game/squadAI.js` pure brain + the 15Hz bridge + AllyModel render (re-tint + jade rim) + capture-self-null | pure-brain TDD (the §5 edge table) + visual 13/13 |
| M6 | FUSE + the hybrid roster + HUD (soul bar unlock-gated, jade) + the in-world look judge | roster data tests + judge frames |
| M7 | Balance vs siegeParams + the playtest/KRB close + Aspect close-out | the budget table + doc-currency |

## 4. Edge contracts (each becomes a test)

Player death → squad disengages atomically at the death edge (the voidhandHeld precedent). Ally
"death": v1 allies take no damage (enemies are player-locked) → no death path; the spirit-retreat
design activates WITH the v2 faction milestone. Capture in capture-mode: SM frozen; allies self-null
from baselines (squad empty in capture saves — the kinetic-bar precedent). Snare the boss: impossible
by construction (not in mobsQuery) — assert with a test anyway. Villager: blocklisted (static gate).
Ally entities must never re-enter `mobsQuery` (the conversion swaps components atomically). Squad
slots full → snare refuses with the soft tell. Save-scum: the roster persists, soul-spend persists —
no dupe path (captures are conversions, not copies).

## 5. What v1 explicitly CUTS (recorded, with re-entry points)

The worker faction protocol (hostiles-target-allies, mob-vs-mob, ally HP/retreat) → **the named v2
milestone** (the seam: targets[] array + faction field + targetId attacks — designed, not built).
Squad command UI (follow/stay/attack cycling) → v2 (auto-assist v1; the pet-order precedent exists).
Procedural mesh splicing → spec-locked OUT (curated roster only). Passive-mob soulbind → stays
legacy-tame (sidesteps the T-key conflict). Pets-vs-squad merge → Kevin (§8).

## 8. KEVIN DECISION BATCH (async via KRB; recs in bold, the loop proceeds on them)

1. **Player-stays-the-tank v1 stance** (enemies never target allies until v2) — **rec: YES** (ships
   the Aspect in 7 milestones; the alternative was every lens's schedule risk).
2. **Pets vs squad**: two companion systems now coexist — **rec: deprecate pet COMBAT framing, keep
   pets as cosmetic companions, fold tame into a SOULBIND-lite at v2; no code change in B3 v1.**
3. Hybrid roster taste (3 names/silhouettes above) + the jade `#3DFFB0` — **rec: as-specced**, judged
   in-world at M6 with frames.
4. Cap 2+1 and the 35/50 costs — **rec: as-specced**, all Kevin-tunable consts.
