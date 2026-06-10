# S2-A-M3c — Loot juice (rarity drop-beams + pickup feedback)

> ✅ SHIPPED — this milestone is merged to `main`; historical plan-of-record (see CHANGELOG/ROADMAP for the build record).

> **Status:** PLAN (2026-06-03). Branch `s2a-m3c-loot-juice` off `main`.
> **Method:** subagent-driven (Opus implementer, TDD red-first where logic exists; spec/quality/determinism review); NO Claude footer; fix-ups = NEW commits; verify test state MYSELF; **visual 12/12 must hold, NO re-baseline.**

## Goal

Close the M3 loot loop's FEEL: make drops read as exciting + rarity-legible, and give pickup tactile feedback. Today loot drops exist + render (a plain entity) and a `playPickup` sound EXISTS but is **never called on pickup**; there is **no rarity-legible drop VFX** (grep confirms no beam/pickup-pop). This is the "content-variety / signature-fires-in-prod" QA classes applied to loot.

## Reality grounding (verified — do NOT rebuild)

- **Loot drops are real ECS entities:** `spawnLootDrop(item, xp, pos)` (SimplifiedNPCSystem.jsx:25) adds an `isLootDrop` entity; `lootDropsQuery`; rendered by **`LootDropRender` (SimplifiedNPCSystem.jsx:1198)**, mapped at :1302. Drops magnetize to the player (dist<7 pull) and are collected at **dist<1.2 (~:1174)** → `addToInventory` + `grantXP` + `spawnXPText`. **The pickup does NOT call `playPickup`** (the sound exists: SoundManager.jsx:409 generates it, :797 exposes `playPickup`).
- **Rarity → color source EXISTS:** `getItemRarity(itemName)` (src/data/items.js) → `common|rare|epic|legendary`; `RARITY_FILL` (src/theme/tokens.js:131) maps each rarity → `{from,to,ring,icon}` colors (e.g. legendary ring `#FFC23D`). Reuse these (locked palette — coherence).
- **Reusable VFX:** `GPUSparkSystem.jsx` (pooled sparks), `EnhancedMagicSystem.jsx` (pooled shockwave ring, stretch-billboards) — the S1-D pooled-VFX pattern. Prefer a cheap shader/instanced beam over per-drop React spheres (the S1-D anti-slop lesson).
- **Capture-determinism:** loot drops come from mob kills (mob spawns are `!isCaptureMode()`-suppressed) / chests / dawn — **none occur in the 12 capture states**, so no drops → no beams in baselines. M3c MUST keep it that way: any always-mounted element gets a capture check; **verify `npm run test:visual` 12/12 with NO re-baseline** (if a frame drifts, a beam is leaking into capture — STOP).

## Tasks

### T1 — Rarity drop-beam (juice the drop)
- A pure helper `rarityBeam(rarity)` (small module, e.g. `src/game/lootJuice.js`, OR extend an existing render helper) → `{ color, height, intensity }` keyed off `RARITY_FILL`/rarity tier: common = subtle/short/dim, legendary = tall/bright/saturated. **Pure + unit-tested** (each tier maps; unknown → common fallback).
- In `LootDropRender`: add a vertical **emissive beam/glow** (a thin cylinder or a vertical stretch-billboard with additive blending) at the drop, colored by `rarityBeam(getItemRarity(entity.item))`, plus a gentle bob/spin already-or-added on the item. Keep it ONE lightweight mesh per drop (no slop). Tier the *look* by rarity so a legendary beam reads across the map.
- Capture-safety: LootDropRender only mounts for live `isLootDrop` entities; confirm none exist in capture (they don't — drops need kills). No extra guard needed IF that holds; verify via the gate.

### T2 — Pickup feedback (tactile collect)
- At the collection point (`dist<1.2`, ~SimplifiedNPCSystem.jsx:1174): call the existing pickup sound (`GameMethods.playPickup?.()` or `store.playPickup?.()` — wire whichever is reachable; it's currently UNcalled) + a small **pickup pop** VFX (reuse the spark pool / a quick scale-pop ring at the pickup point). Rarity-tint the pop via the same `rarityBeam` color for consistency.
- Guard the sound/VFX behind the same collection branch (only on actual pickup), capture-safe (no pickups happen in capture).

### Tests
- `lootJuice.test.js` — `rarityBeam` pure mapping (4 tiers + unknown fallback; monotonic height/intensity).
- A static gate (extend an existing gates file) — pickup path references `playPickup` (locks "pickup fires sound" so it can't silently regress to the current no-sound state); LootDropRender references the rarity color source.

## Definition of done
- Drops show a rarity-legible beam; pickup plays a sound + a pop. Look tiers by rarity.
- `npm run test:unit` green (507 + new) · `npm run build` clean · `npm run test:visual` **12/12 NO re-baseline**.
- Review (spec/quality/determinism) → no BLOCKING unaddressed; merged to `main`.
- **Eyeball gap:** the actual beam/pop LOOK is not in a capture state (drops need kills). Add a NOTE to KEVIN-REVIEW-BATCH that the loot-juice look is unverified-by-gate + offer a dev capture state or a short clip for Kevin (player-experience lens: build looks at the real frame).

## Batched to Kevin (KEVIN-REVIEW-BATCH — taste)
- Beam style/intensity per rarity (subtle vs flashy); pickup pop strength. Reversible constants in `lootJuice.js`.

## Post-review (2026-06-03)

**My reality-grounding was STALE (false-absence on my part — lesson noted).** This plan claimed "`playPickup` is never called on pickup" and "no rarity-legible drop VFX (no beam)". Both were FALSE at HEAD: commit `679f2cd` ("physical ground loot", already on `main`) had already wired `playPickup()` at the collect branch AND a (fixed-look) beam mesh. My scoping greps were too narrow (`lootBeam|rarityBeam|pickupFlash` — didn't match a generic beam mesh; and `playPickup` was wired via the `useGameSounds` hook, not the `GameMethods`/`store` path I grepped). The implementer correctly applied Goal-Frame discipline — the GOAL (rarity-legible drops + tactile pickup) was still valid, so it built the REAL deltas: **T1** replaced the hardcoded color switch + fixed-look beam (const height/opacity for ALL tiers) with the pure `rarityBeam` helper so the beam **tiers by rarity** (legendary now reads taller/brighter); **T2** the sound was already wired, so the net-new was the **rarity-tinted pickup-pop VFX** (genuinely absent) + the static gate.

Review = spec/quality MINOR, determinism APPROVE. Fixed in a follow-up commit: **(MINOR, a regression I introduced)** `rarityBeam` fed `RARITY_FILL.common.ring` (an `rgba()` string with alpha) into `THREE.Color`, which logs "Alpha component ignored" on every common drop/pop — added a `toThreeColor` alpha-strip (rgb passthrough) + a unit assertion the color is THREE.Color-safe. **(doc honesty)** corrected the gate comment's false "previously uncalled" claim. NITs skipped (the unfrozen-clock-but-safe-by-non-existence mirrors the existing ImpactShockwave precedent; one-frame-beam-at-origin pre-exists). `test:unit` **519** · build clean · `test:visual` **12/12 no re-baseline**.

**EYEBALL GAP (player-experience lens):** the beam/pop LOOK is NOT gate-covered — the 12 baselines contain no loot drops (drops need mob kills, which are capture-suppressed). Unit tests cover only the pure `rarityBeam` math; the gates cover only wiring. Whether the beam reads well per rarity + the pop feels good is UNVERIFIED — needs a live-session eyeball (or a dev loot-showcase capture state / a short clip). Logged to KEVIN-REVIEW-BATCH.
