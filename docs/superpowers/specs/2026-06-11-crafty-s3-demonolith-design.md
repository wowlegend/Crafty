# Crafty S3 — De-monolith / Engine Hardening — design of record

> **Status (2026-06-11): DESIGN COMMITTED (loop self-gate per charter §5).** Produced by a 3-lens scoping
> workflow vs LIVE code (the NPC god-file deep-map · the Components/player-controller map · the
> other-three + cross-file ranking; 415k tokens, 67 reads) + orchestrator synthesis. Parent: charter
> §2.4-as-amended (S3 = the post-spine structural spine). **THE STREAM'S PRIME DIRECTIVE: extraction-only
> milestones — NO behavior change.** The behavior locks: the 13-frame visual gate, 837+ unit tests,
> 23 static-gate files. The proven template: the Aspect era's 35+ `game/*.js` pure pulls.

## 0. Why and how

The 5 god-files (7,029 LOC: Components 1757 · SimplifiedNPCSystem 1736 · AdvancedGameFeatures 1397 ·
EnhancedMagicSystem 1103 · SoundManager 1036) tax every milestone. The de-monolith proceeds
**lowest-blast-radius-first to prove the split mechanics 3× before touching the dangerous cores**, with
charter-required characterization named per milestone (authored red-first INSIDE its milestone).
Target-module convention (established): pure logic → `game/*.js` (+sibling test) · R3F system shells →
`world/*.jsx` · render components → `render/` · UI → `ui/` · NEW: audio factories → `audio/`.

## 1. THE TRAP CATALOG (every milestone checks all five)

1. **Gate path-lists don't follow moves**: ~15 gate files grep god-files BY LITERAL PATH (the NPC file
   alone is pinned by 8 gates + 1 live import + the mobVariety textual characterization). Every move
   repoints its gates IN THE SAME COMMIT.
2. **The inverse GATED-list trap**: the voidhand/elemancer no-re-mesh gates enforce a FORBIDDEN regex
   over an EXPLICIT file list — code moved OUT of a gated file into a new file is silently UN-GATED
   unless the new file is appended to the list (and a new file containing `postMessage` must never join
   the elemancer list).
3. **The stale-anchor fact**: character-render-gates assumes ONE brace-less `if (isCaptureMode()) return;`
   in the NPC file — there are TWO (AIWorkerSystem :824, LootSystem :1248); indexOf finds the first.
   Extracting AIWorkerSystem without repointing makes the gate match the WRONG guard (loud fail —
   but plan for it); extracting LootSystem first is anchor-safe.
4. **SM-blocks-as-sibling-components is a BEHAVIOR CHANGE, not an extraction**: useFrame order across
   components differs from in-loop sequence, and blocks would escape Player's capture early-return
   (all baselines break). The Aspect SM blocks extract as plain FUNCTIONS invoked from Player's loop
   (an env object carries the refs), never as new `<System/>` siblings.
5. **The Vite worker-URL seam**: `new Worker(new URL('./workers/ai.worker.js', import.meta.url))` is
   file-relative and must stay statically analyzable — moving its host updates the literal; verify
   `npm run build` bundles the worker.

## 2. The program ladder (cross-file, value × safety)

| # | Milestone | Scope | Why here |
|---|---|---|---|
| S3-M1 ✅ | **SoundManager: the synth voices** | ~19 `generate*` closures → `audio/synthVoices.js` as pure `(ctx)=>AudioBuffer` factories + a VOICES registry (SoundProvider loops it); `audio/musicTheory.js` (chords + a parameterized getArpeggiatorBpm); fake-ctx buffer-shape characterization IN the same commit (the closures are untestable UNTIL extracted); aspect-sfx-gates repointed | Highest safety (zero R3F/visual exposure, 1 gate), the largest characterization delta (0%→covered DSP); proves the pattern |
| S3-M2 ✅ | **EnhancedMagicSystem: the data pulls** | SPELL_TYPES → `game/spells.js`; ENERGY/SPARK/WAND profiles → `game/spellVisualProfiles.js`; `applyChainLightning` → pure `solveChainTargets` in `game/chainLightning.js`; PLUS the test-only pre-unit: `utils/combat.test.js` for solveSpellDamage/solveMeleeDamage (the missing damage-path characterization) | Verbatim data moves pixel-locked by the spell-cast frame; the projectile LOOP does NOT move yet |
| S3-M3 ✅ | **NPC: the safe shell strips** | TradingInterface + CombatInstructions → `ui/` (zero gates); MOB_TYPES → `game/mobTypes.js` (mobVariety.test upgrades textual→live imports); the leaf VFX renderers (DamageNumber/ImpactShockwave/XPOrb/Loot renders) → `render/` with the loot-juice gate repoint | The NPC lens's M1-M3; proves multi-gate repointing on low-risk cuts |
| S3-M4 (multi-part) | **AdvancedGameFeatures dissolve** | ✅ **Part 1** (2026-06-13): 2 panels → `ui/` + 3 accrual hooks → `world/accrualHooks.js`. ✅ **Part 2** (2026-06-13): survival domain (useSurvivalMode → `world/survivalSystem.js`, SurvivalWarning → `ui/`) + useSpellUpgrades → `world/spellUpgrades.js`. ✅ **Part 3** (2026-06-13): the pet domain (usePetSystem→`world/petSystem.js`, PetIndicator→`ui/`, PetEntities→`render/`). **AGF 1397 → 689 LOC (boss-only)**; 3 trap-1 gate repoints (parts 1-2); parts 1-3 all capture-clean (no re-baseline). ✅ **Part 4** (2026-06-13): the boss domain (BOSS_CONFIG→`game/bossConfig.js`, useBossSystem+dangerLevel-bridge→`world/bossSystem.js`, BossHealthBar→`ui/`, BossEntity+destroyVoxelsInRadius→`render/BossEntity.jsx`) + **DELETED AdvancedGameFeatures.jsx**. 5 gate repoints; trap-3 order preserved. **✅✅ S3-M4 COMPLETE — AGF 1397 → 0, the god-file ELIMINATED.** The boss-finale adversarial review caught + fixed a BLOCKING latent mount-crash (orphaned SPELL_UPGRADES from part 2 had been crashing the app + vacuous-ing the visual gate since iter 101) + a vacuous boss-gate; now LIVE-verified 13/13 against fresh captures. | Lowest-risk-first held: parts 1-3 capture-clean, the boss finale reviewed — and the review earned its keep by catching the latent crash. |
| S3-M5 (multi-part) | **Components: leaves + kernels** | ✅ **Part 1** (2026-06-13, iter 124): HUD chrome (MinecraftHotbar + GameUI) → `ui/GameHud.jsx` + the FPV render cluster (ProceduralWeapon + RibbonTrail + StableMagicHands + spell hand FX) → `render/playerRender.jsx`. Byte-exact; 10 dead imports pruned; ZERO gate churn (as predicted); the off-frame FPV hands verified by capture-completes (mount-guard). **Components 1812 → 1300 LOC (−512).** 936 unit · build · visual 17/17. ✅ **Part 2** (2026-06-13, iter 126): pure kernels `game/spawnPlacement.js` (resolveSpawnGround/isVoidFall/spawnTargetY — the spawn-probe decision, with a probeAvailable param for the getMobGroundLevel-missing edge) + `game/locomotion.js` (moveSpeed/jumpVelocity/applyGravity). Characterization-FIRST (11 tests — the loop's first-ever spawn/locomotion characterization, named in the §3 ledger); Player calls them, the imperative stays. Components 1300 → 1286 LOC. ⏳ Part 3 = the verb-ctx seam; the SM-wiring move (controllers/aspectVerbs.js, trap-4-aware) only after its jsdom/wiring characterization lands | The dangerous core shrinks AROUND, never THROUGH; Player's loop is LAST here |
| S3-M6+ | **NPC: the deep cuts** | MobModel+HealthBar → `render/MobModel.jsx`; XPOrb/Loot pure steppers → `game/`; SpawnerSystem pure pulls; AIWorkerSystem (the worker-URL seam + the allegiance.test upgrade from MIRROR to real applyWorkerUpdates); damageMob's pure pulls (spark/orb/knockback tables) with its FIRST-EVER unit tests | The most by-path-pinned + worker-seamed file — extracted LAST, the lens's M0-M9 ladder governs |

**Standing rule:** every milestone gets its own plan doc (the CLAUDE.md mandate); the full battery runs
per commit; a milestone that can't reach green reverts (extraction-only means reverts are always clean).

## 3. The characterization ledger (charter §2.6 — named up front, authored in-milestone)

damageMob (zero direct tests — the gates pin source-shape only) · spawnMob's entity contract (producer
side) · XPOrb + Loot physics tables (two near-duplicate steppers, DIFFERENT params — unify only AFTER
both are characterized) · buildMobAIData/applyWorkerUpdates (allegiance.test simulates a MIRROR today)
· MobModel's render-side behaviors (visual-gate-only today) · the five Components SM-wiring blocks ·
the listener layer (jsdom) · solveSpellDamage/Melee crit branches · the synth buffer shapes ·
TradingInterface economics.

## 8. KEVIN BATCH (async)
S3 is invisible-to-players by design — the batch carries only: the milestone cadence (one god-file
stream at a time, experience interleaves continue every 2-3 milestones per the charter), and the one
soft call: `controllers/` as a new src dir name (rec: yes).
