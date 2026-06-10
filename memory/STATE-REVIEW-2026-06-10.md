# Crafty — Full State Review vs Master Plan (2026-06-10)

> **Method:** 21-agent adversarially-verified review (7 parallel dimension finders — master-plan reconciliation · architecture · tests/gates · VOIDHAND M1+M2 · player-experience · perf · blind-spot critic — every BLOCKING/HIGH finding independently re-verified against code by a refuter; zero HIGH+ findings refuted, two severity-corrected). The three most consequential claims additionally spot-verified by the orchestrator first-hand. Live gates verified before fan-out: **657 unit (67 files) · build clean · visual 13/13** on `main @ e18019c`, synced, tree clean.
> **Companion docs:** REALITY-AUDIT-2026-05-30.md (S0 baseline) · PRE-S2B-CONTENT-AUDIT-2026-06-03.md. This review supersedes neither — it is the S2-B2-era status + risk map.

## 1. Master-plan reconciliation (SOTA-INITIATIVE.md → reality)

| Unit | Status |
|---|---|
| S0 reality audit | ✅ DONE |
| S1-A foundation · S1-B render recipe · S1-C UI system · S1-D signatures | ✅ DONE (all merged) |
| S2 game design (Kevin HARD GATE) | ✅ APPROVED |
| S2-A signature-agnostic foundation | ✅ DONE |
| S2-B1 WILDHEART (lead Aspect) | ✅ COMPLETE (merge `458bbb5`) — #63 tuning + #64 capture-baseline open |
| **S2-B2 VOIDHAND** | **IN-FLIGHT — M1 of 8 on `main`; resume = M2 iPad FPS gate (plan-doc-first per the 2026-06-10 rule)** |
| S2-B3 SOULBIND · S2-B4 ELEMANCER | NOT-STARTED (B4 perf-gated last, by design) |
| S3 engine/de-monolith/touch | NOT-STARTED — deliberately re-sequenced after S2-B (master-plan §4 "with S2" is stale); deferred backlog accruing |
| S4 multiplayer/monetization | NOT-STARTED (sequenced last) |
| Content pass: music motif per Aspect | ⚠️ **DRIFTED** — B1 shipped with zero audio; absent from the B2 spec; no task carried it (now #74) |
| Content pass: bestiary after B3 | correctly sequenced, not started |
| Content pass: world-design late-S2 | not started; window approaching (2 Aspects remain) |
| Third-person pivot | beachhead DONE; full pivot deferred ~S3 (Kevin 2026-06-07) |

**The master-plan DOC itself was the single stale orientation surface** — still framed as a 2026-05-30 brainstorm kickoff ("Do not jump to code"), stats off by ~48% LOC / 3.5× files, §5 process steps long completed, skipped by the 2026-06-10 de-stale pass. **Fixed 2026-06-10: status banner added** (same treatment the specs/plans got). All other doc surfaces (4-piece, specs, plans, tasks) were verified mutually consistent.

## 2. Verified healthy (adversarially checked, not vibes)

- **The S2 build pattern is quantifiably holding:** of ~+6.9k LOC since S0 (14.4k/31 files → 21,319/110), **~84% landed in new modules** (`src/game` 2,138 · `src/ui` 2,339 · `src/world` 2,030 · `src/render` 1,307 + input/theme/i18n); the nine S0 god-files grew only +1,068 combined.
- **Game-Loop-Isolation passes in all five spot-checked useFrame-heavy files** (Components, EnhancedMagicSystem dirty-flag pattern, PhantomBlockSystem, BeastAvatar, GPU systems) — the breaches found are in the OLDER NPC layer (§3).
- **VOIDHAND M1 verified clean on every checkpoint:** SM edges (charge/commit/re-press-drop/max-hold/cooldown/death) · Components wiring (transient reads, set() on transitions, correct tick position vs capture/dead returns) · death-edge atomic clear · save exclusion · capture-freeze · self-null · zero per-frame allocation · no-re-mesh gate green. `kinetic.js` dormant-by-design until M4.
- **Scaffold-removal claims verified true** (FIRE_SHAPE_VARIANTS / beastShapeVariant / beastGlowMul / glow-ladder: zero hits). `spawnBeastTransform` + roster loop deliberately kept for #64.
- **Store discipline:** 857 LOC; all transient fields excluded from `buildSaveData`; no bake regressions. Save-migration safe (`??` defaults, clamps, `refundUnknownTalents`) — though `SAVE_VERSION` is written-never-read (decorative).
- **Test estate:** 18 static-gate files locking ~11 invariant families + 21 pure-logic + 14 store + characterization + 1 jsdom-interaction + 1 real-Rapier WASM + the 13-state visual gate.
- **Credits CC-BY obligation RESOLVED** (CreditsScreen shipped, wired, en+zh).
- **Player loop end-to-end is real:** polished boot → dense HUD → melee/spells/dodge with juice → live mine/place → chests/trade → escalating sieges → dawn rewards → soft death → full progression (XP/attributes/talents/coins) → panels solid post-panelState-fix.

## 3. Confirmed findings (all adversarially verified; ranked)

### BLOCKING
1. **EnemyProjectileSystem: unconditional `setState` inside `useFrame`** — `SimplifiedNPCSystem.jsx:1012-1032` returns a fresh array every frame (even with zero projectiles) → permanent frame-rate React re-render + `p.velocity.clone()` per projectile/frame. Direct Game-Loop-Isolation breach (CLAUDE.md CRITICAL). One-file fix: port the EnhancedMagicSystem dirty-flag pattern. → **task #68**

### HIGH — perf (the iPad envelope; all pre-existing NPC/weather-layer, NOT S2 regressions)
2. **Per-frame Rapier raycast storm via `getMobGroundLevel`** — `Terrain.jsx:455-474` allocates a fresh `rapier.Ray` + filter closure per call and is called 81×/aggro-mob/frame (AI height grids) + 4×/mob (IK) + per-orb/drop + up to 400×/frame (rain) ≈ **~2,100 raycasts/frame worst-case siege-rainstorm** (~126K/sec), all main-thread. Fixes: cache ray+closure; throttle heightGrids to AI tick; altitude early-out for weather. → #68
3. **AI worker bridge runs at render frequency** — `SimplifiedNPCSystem.jsx:751-814` rebuilds + structured-clones a ~20-field × 40-mob array EVERY frame (120Hz ProMotion pays double); worker has no internal tick. Throttle to 10-20Hz ≈ 3-12× cut. → #68
4. **`useEntities` React bridge still re-renders the whole NPCSystem on every entity add/remove** (PRE-S2B finding confirmed live, unchanged) — every kill bursts re-renders across all mounted MobModels; `MobModel` not memoized. → #68 (the audit's DEEPEN)
5. **Shadow-casting point light per spell cast + fluctuating dynamic light count** — `Components.jsx:1438` `castShadow` on the 150ms spell-hand light = 6 cube-map shadow passes/frame at ~45% duty under held-F; every light-count change re-links all lit material programs (hitch). Remove castShadow + adopt a fixed light pool. → #68

### HIGH — player-experience
6. **Mouse verbs double-fire** — `Components.jsx:423-431` (button0→melee, button2→cast) and `Terrain.jsx:691` (same buttons→instant-mine/place) are independent listeners with no mode seam: **every melee swing near terrain deletes a block; every spell cast near a surface places one**. During night siege, combat erodes the player's own day-built wall — **directly undermines VOIDHAND's BASE-AS-ANVIL fantasy, and M3 binds HURL/SLAM onto these same buttons**. Verb-mode seam REQUIRED before M3. → **task #72 (sequenced pre-M3)**
7. **FPV fuse-into-beast oddity is unmitigated** (Kevin reported 2026-06-09) — after the 1.2s transform-cam reveal (`transformCam.js:14`), the camera returns to the FPV head pose while BeastAvatar renders at the player for the full form duration → camera sits inside the beast. Cheap interim: hide avatar body at envelope f=0 + first-person form cue (tint/claws); real fix = the deferred third-person pivot. → #71
8. **WILDHEART roar (the flagship) is unreachable/illegible to a fresh player** *(severity-corrected MEDIUM→kept high-priority as UX)* — HUD shouts "ROAR!" at full ferocity even when the 2-point talent gate silently blocks R (`HUD.jsx:42-49` vs `Components.jsx:494-496`); R is taught nowhere; pressing R while gated gives zero feedback. → #71

### HIGH — test/gate infrastructure
9. **No-re-mesh gates are module-allowlists, not seam-allowlists** — `voidhand-noremesh-gates` covers only the 3 isolated modules; `beast-noremesh-gates` only `beasts.js`. **`Components.jsx` (where the SM wiring lives and where M3 verbs land) is un-gated**, and a **third `update_block` poster already exists invisible to every gate: the boss voxel destruction at `AdvancedGameFeatures.jsx:313`** (spot-verified) — which also falsifies the VOIDHAND spec's seam-map claim ("only Terrain.jsx:647/675"). Invert: repo-wide forbidden-scan + explicit poster allowlist; add Components.jsx to GATED now (passes today). → **task #69 (pre-M3)**
10. **Panel-key interaction coverage is 1 of ~7 keys, with a confirmed asymmetry in untested paths** — Tab/KeyE/C/B never clear `showSpellUpgrades`/`showAchievements` → two modal panels can mount simultaneously (`InputManager.jsx:97-160`). Parameterized matrix test would red on it immediately. → #70

### HIGH — VOIDHAND M2 design inputs (feed the M2 plan doc)
11. **M2 as spec'd would gate a phantom with ZERO physics presence** — M1's orbit is a render-only transform (cheaper than the spec's kinematic-RigidBody model), so the spec's #1 named perf risk (broad-phase AABB + dynamic hurl body) is absent from what M2 would measure. The plan must either add a dev-probe dynamic hurl stand-in or scope M2 = render+light cost with an M3 re-gate item. Related (MEDIUM, verified): the spec's M2 scenario includes "hurl→impact-burst" which doesn't exist until M3 — the "[hurl stub]" must be explicitly defined; **no deterministic probe exists to drive grab→orbit on a touch-only iPad** (pointer-lock + KeyV unavailable) — a dev hook is plan step 1; the WILDHEART on-device protocol M2 mirrors **has no recorded execution** (logistics unproven); the budget is methodology-only (**no number pinned**); the grab-edge pointLight mount (light-count change → program re-link hitch) must be measured at the EDGE, not just steady-state.

### Notable MEDIUM/LOW (scheduled or cheap)
- **zh-CN covers ~51 UI-chrome keys only; ALL game content (quests/items/spells/boss/hints/dialogue) is hardcoded English** — violates the master plan's first-class-Chinese commitment + strings.js's own convention. → #73 (+ a `t()` gate in the per-milestone plan template)
- **Music-motif drift**: per-Aspect motif pass (master-plan commitment) skipped in B1, absent from B2 spec; flagship transform is audio-silent (no roar SFX). → #74 (Kevin decision)
- **Bundle: 4.27MB main chunk, ~49% = base64-inlined Rapier WASM** (+33% transfer inflation; parse on main thread) — relevant to the M2 iPad gate; no vendor splitting. → fold into M2/S3.
- **HELD-state V-drop ignores the input-active gate** (V while a menu is open drops the phantom — keydown intent write unconditional). LOW; fold into M3.
- Controls panel lists a dead key ("M — Magic"), omits R/V; hotbar misrepresents 4 of 9 block types (glass/diamond/cobblestone place stone); coins have zero sinks; dead auth stack fires a guaranteed-failing XHR to localhost:8001 on every load (313 LOC, untracked by the audit CUT list); `npm test` still runs the rubber-stamp `test_swarm.js`; 5 no-selector full-store subscriptions in panel UI; `KEVIN-REVIEW-BATCH.md` stale (pre-B1-completion; zero VOIDHAND entries); `html lang` never updates on locale toggle; `.superpowers/` 68MB unbacked-up (by design, noted).
- God-files remain characterization-light ahead of the S3 de-monolith; Game-Loop-Isolation has no repo-wide gate (spot gates only); PANEL_FLAGS has no completeness gate (new panel can bypass `isAnyPanelOpen`). → #69/#70 absorb the gate items.

## 4. M2 gate — what the review prescribes (inputs to the plan doc)

**Scenarios** (60s each, fixed seed, pinned tier+DPR, PerformanceMonitor+AdaptiveDpr off, real mid iPad via Safari remote inspector or drei Stats behind showStats):
(A) explore-idle baseline · (B) **night-siege baseline, held=false** (the honest control — dominated by the pre-existing NPC costs in §3) · (C) siege + grab→orbit steady-state (delta vs B) · (D) the grab/drop EDGE (light-count hitch) · (E) a dev-probe dynamic hurl stand-in OR an explicit M3 re-gate decision.
**Budget:** pin a number (recommendation: ≤1.5ms median frame-cost delta or ≤3fps median, C−B). **Levers-if-fail (ordered):** remove the phantom pointLight → drop castShadow elsewhere → spec's sphere-collider/sensor levers → tier levers.
**Sequencing recommendation:** do the cheap #68 perf fixes BEFORE or WITH M2 — otherwise the siege baseline noise (raycast storm + render-rate AI bridge) swamps the ~1ms-scale signal M2 exists to measure. Bundle the outstanding WILDHEART golem device check (#63) into the same device session.

## 5. Disposition

New tasks: **#68** perf remediation bundle (BLOCKING+raycasts+AI-tick+spell-light) · **#69** gate inversion (repo-wide no-re-mesh + poster allowlist + Components.jsx + PANEL_FLAGS completeness) · **#70** panel-key matrix · **#71** player-legibility bundle (roar legibility, controls-panel truth, FPV-form interim mitigation, hotbar honesty) · **#72** mouse verb-mode seam (REQUIRED pre-M3) · **#73** content-i18n · **#74** music-motif decision (Kevin). Master plan bannered. KEVIN-REVIEW-BATCH refresh folded into #71/#74 surfacing.
**Resume remains: VOIDHAND M2 — plan doc first** (per the 2026-06-10 rule), now with §4 as its input brief + the #68-first sequencing question as the one steering decision for Kevin.
