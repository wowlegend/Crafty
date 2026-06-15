# Crafty — World + Purpose SOTA Plan (2026-06-15)

> Source: background workflow `crafty-world-purpose-sota` (wf_c42c584e-1bb, 11 agents: 3 code-assess + 3 live-research + 3-concept gen + 3 judges + synth). The direction recommendation is a **Kevin decision** (see KEVIN-REVIEW). The visual slices are within loop authority but their re-baselines need Kevin's taste sign-off.

## Recommended direction (Kevin to confirm)

**"The Ember Frontier, gated toward a Blight Heart climax."** Ship **Ember Frontier** as the spine — outward, *see-it-go-to-it* exploration on Crafty's **already-built** landmark + compass rails — and graft Blight's one missing piece: a **single fixed, foreshadowed far-edge climax** (relocate the Shadow Dragon from its current 25-blocks-from-player ambush to a fixed "Blight Heart" lair) so the run has both **direction AND a point + a win-state**. Two of three judges pick Ember (best reuse, highest stunning ceiling, most autonomous-loop-shippable); the third ties it with Blight and only prefers Blight because Ember "self-admits a weak climax" — which the graft closes cheaply.

**Why it fits (verified against live code):** landmarks.js is a pure deterministic hash with 2 subtypes (promotable to shrines, no new placement tech); `compass.bearingToMarker` already returns inView/pct/dist and HUD renders HOME/boss/chest markers (the "go there" rail exists); the boss is a non-sited level-5 ambush (no horizon-destination, no win-state → literally aimless today); a Travel-500-blocks odometer quest already exists; **ores are defined in Blocks.js but NEVER generated** (mining has no payoff). The feared "breaks zero-save determinism" risk is overstated — a sparse-diff persistence layer already exists (worker `chunkModifications` + `saveSchema.js`), and the hero "lit/claimed region" visual can be DERIVED from already-persisted shrine-chests (effectively stateless).

**Key reconciliation vs the audit:** ToneMapping is ALREADY NEUTRAL (not ACES) and the per-mood `MOOD_GRADE` script ALREADY ships in mood.js — those "wins" are done, don't redo. The REAL remaining visual gaps: **no baked vertex AO** (#1 flat-read cause), **no aerial perspective** (the "oppressive dark wall"), and **capture-mode disables BOTH cast shadows AND the landmark emissive crowns** (so the reviewed frames are the flattest, beacon-less version). Also: vertex color r/g/b are FULLY consumed (vBlockType/vFoam/vDepthB) — AO needs a NEW geometry attribute, not a "free" color slot.

## Build plan — slices (front-load pure-visual; gate gameplay on the direction pick)

**Visual + correctness (direction-agnostic — loop authority, re-baseline + Kevin taste review):**
- **S5 (S, do FIRST — correctness, no re-baseline):** extract a shared `heightAt(x,z,seed)` module imported by BOTH `terrain.worker.js` and `climate.js` (kills the verified drift `climate.js:20` `30+n*40` vs worker `40+n*18+highland²*120`). Equality unit test vs the single source. Unblocks S4.
- **S4 (M):** tame mountains + de-island — `terrain.worker.js:393-394` highland threshold 0.45→~0.62, multiplier 120→~70 (rare hero peaks over gentle traversable plains); `oceanProfile.js:14` OCEAN_CONTINENT_THRESHOLD -0.15→~-0.40 (connected continents, not archipelago). Pure (x,z,seed). **Directly fixes Kevin's #1 complaint.** Re-baseline explore-day/ocean-coast/landmark.
- **S1 (M):** bake smooth vertex AO in the greedy mesher (3-neighbor occluder → 4 levels) via a NEW `aAO` attribute; multiply into diffuse in `Terrain.jsx` onBeforeCompile. Works in capture (no shadow-map). The #1 flat-read fix.
- **S2 (M):** aerial perspective in the existing `Terrain.jsx:184` onBeforeCompile — lerp far terrain toward mood fog/skyHorizon + slight desaturate by view-depth. Kills the "dark wall"; capture-safe (pure view-depth).
- **S3 (S, quickest beauty/effort):** un-gate the landmark emissive crowns in capture (`Terrain.jsx:449,460` — they exist at #46E0FF/#F5D76E, blocked by `!isCaptureMode()`) + a deterministic cast-shadow/occlusion pass in capture (`Atmosphere.jsx:198`). Turns the flat beacon-less diorama into the "see it, go to it" horizon.
- **S6 (S):** place ores by depth band in the stone branch (`terrain.worker.js:434`) — coal/iron/gold/diamond (defined, never emitted). Mining payoff + feeds the loot/tier gradient.
- **(Plus the audit's rank-1 postproc tune — bloom threshold 1.0→~0.65 + exposure + grade-after-tonemap — careful, frame-wide, taste-reviewed.)**

**Gameplay/purpose layer (GATED on Kevin's direction pick):**
- **S7 (M):** pure `tier(distanceFromOrigin)` scalar (Valheim concentric rings) → biome roster + loot rarity + the existing siege ramp. No new AI/persistence.
- **S8 (L):** promote landmarks → Aspect/Blight shrines (compass marker + real reward chest at base) + replace the targetless Travel-500 quest with "reach the nearest shrine"; "lit/claimed" region grade derived from opened shrine-chests.
- **S9 (L):** fixed foreshadowed Blight Heart climax (relocate the dragon to a fixed far lair, biggest horizon silhouette, compass-marked at top tier) + win-state + post-climax endless handoff.
- **S10 (M):** onboarding states a PURPOSE; guaranteed spawn-visible shrine silhouette (40-second rule); hemisphereLight + warm emissive Hearth altar (lit hero center vs cooler wilderness).

## Open decisions for Kevin (batched in KEVIN-REVIEW)
1. **Direction pick** — Synthesis (Ember + Blight-Heart climax, recommended) vs pure Ember (endless, no win-state) vs full Blight (heavy per-tier arenas). Drop S9 if you want a pure sandbox.
2. **Re-baseline cadence** — S1-S4 are intended visual changes that WILL exceed the 6% gate → deliberate re-baselines. Batch into one taste review, or slice-by-slice?
3. **"Lit/claimed region warms up" grade-flip** — strongest sense-of-place lever but mutates many frames as you play (derived from shrine-chests = determinism-safe). Want it, or static global grade?
4. **Aspect-shrine theming** — map the 2 landmark subtypes to specific Aspects (amber/violet/teal/white-gold) + gate to matching biomes, or generic reward shrines?
5. **Ordering** — front-load S1-S6 (visual beauty) before S7-S10 (gameplay), or prioritize purpose/destination?
