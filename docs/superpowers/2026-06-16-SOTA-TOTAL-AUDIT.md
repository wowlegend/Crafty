# Crafty — Total SOTA Audit + Enhance (Kevin mega-directive #2, 2026-06-16)

> **Directive (Kevin):** "Map/review/TEST every single line of code; make sure everything actually works AND
> that the deep SOTA plan actually enhanced EVERY element/aspect/feature (down to the tiniest control button /
> UI / effect). A lot still looks/feels PRE-master-plan. Treat it like a TOTAL FRESH GAME; you're allowed to
> re-design/enhance from a blank slate. Keep autonomously working it out. multi-search + holistic-latest-think
> + unlimited workflows/agents are at your disposal."

## Why this exists
The 2026-06-16 spawn-direction fix was a microcosm of the complaint: a SOTA *system* (the S7-S10 purpose arc)
shipped behind green gates, but its value never SURFACED to a real returning player. The hypothesis: this
"shipped ≠ works-live / feels-SOTA" gap repeats across many elements. This audit treats the game as a fresh
slate, scores EVERY element against an externally-researched SOTA-June-2026 bar, and produces a ranked
enhancement backlog the loop then builds through.

## Method (multi-phase, deep workflows)
- **Phase A — BAR + AUDIT + SYNTHESIZE** (workflow `crafty-sota-total-audit`):
  - *Bar* (web research, multi-search): the concrete SOTA-June-2026 checklist per axis — visual, game-feel/juice, UX/HUD/onboarding.
  - *Audit* (12 category agents over the live code): enumerate every element; score WORKS? · SOTA-ENHANCED vs PRE-MASTERPLAN · gap · enhancement · impact × cost · autonomous?
  - *Synthesize*: one ranked enhancement backlog grouped into milestones.
- **Phase B — adversarial verify** the high-impact "pre-masterplan/broken" verdicts before building (don't trust one agent).
- **Phase C+ — build the backlog** autonomously: plan-doc per milestone, TDD red-first, gates (unit holds-or-grows · build clean · visual 20/20 or deliberate re-baseline · live-probe + LOOK) , ship, surface taste/playtest items to Kevin.

## Status
- 2026-06-16: initiative opened. Spawn-direction `ObjectiveTracker` shipped (`5271f73`). Phase-A audit COMPLETE (16 agents, ranked backlog below).
- 2026-06-16: **M1 (game-feel core) COMPLETE** — Slice 1 quick-win bug cluster (`1a242b1`: ore-debris colors, playCraft wired, spatial pitch-jitter, npm-test repoint) + Slice 2 trauma pure core (`dffb49f`: game/trauma.js + 5 units) + Slice 3 wired (`<this commit>`: shakeOffset trauma^2 shake + weight-tiered HITSTOP + juiceIntensity dial). All Phase-B-verified vs live code. 1290 tests / 20/20 / build clean. NEXT: M2 (telegraphs #4 + directional impact #9 + death/victory beats #7).
- 2026-06-16: **M2 directional impact (#9) COMPLETE** — Slice A flinch lean (`0e12ad2`: flinchTilt, facing-local), Slice B spark cone (`d89f2cc`: biasAlong dir param), Slice C camera-shake dir (`2f0bcef`: cameraShakeDir preserved through decay). hitDirection (was zero-consumer) now drives lean+spray+lurch. 1299 tests / 20/20 / build + eslint clean. NEXT M2: telegraphs #4 (flagship readability), then death/victory beats #7.
- 2026-06-16: **M2 attack telegraphs (#4) IN PROGRESS** — Slice 1 timing core DONE (`7a74a14`): pure `game/attackTelegraph.js` dodgeable windup->strike machine + AI-worker windup gate (~380ms) + windupUntil round-trip. 1310 tests / 20/20. Slice 2 render DONE (`fa60ee6`). Slice 3 boss lava AoE telegraph DONE (`d82ed8c`: lava ring spawns as a harmless forming warning [750ms] before it arms -> dodgeable; BossEntity has its own attack loop). **#4 ATTACK TELEGRAPHS COMPLETE.** 1321 tests / 20/20. NEXT M2: Theme 3 death/victory beats #7 IN PROGRESS -- S1 death weight DONE (`f82f2a5` mob dissolve [deathFx.js, 320ms shrink+spin, deferred removal] + `5f91d47` boss-kill slow-mo+bloom). 1332 tests / 20/20. S2 Death/Victory overlays rebuilt on Panel/Button + tokens + run summary (`2a6b999`, LOOK-verified via death-probe.mjs). **#7 DEATH/VICTORY BEATS COMPLETE -> M2 COMBAT-READABILITY MILESTONE COMPLETE** (#9 + #4 + #7). 1336 tests / 20/20. NEXT = M3 (Settings/a11y #3 + touch dodge #6).
- 2026-06-16: **M3 Settings/a11y (#3) + touch dodge (#6) COMPLETE** — feedback-intensity slider + prefers-reduced-motion + audio (SFX/music vol + master mute) + touch dodge (`c5d1b7d`/`ab8d96c`/`b1bd1cf`/`e368af3`/`4eb001c`). 1358 tests / 20/20. Deferred (future): controls-remap, colorblind/text-scale, settings persistence, input-buffering/coyote. NEXT = M4 living world.
- 2026-06-16: **M4 living world IN PROGRESS** -- plan authored; S1a grass-top worker emit DONE (`bd9ab34`: pure grassField.grassTops + worker scans column tops -> sparse grassTops[] on the chunk payload; data-only). S1b mount DONE (`059777c`: Terrain mounts OptimizedGrassSystem from grassTops; blade 0.4x0.7 readable tuft; ground-probe LOOK-confirmed). **#5 WIND-GRASS REVIVED.** 1369 tests / 20/20. NEXT: S2 landmarks #8 / S3 far-LOD #18 / S4 biomes #12.

## Phase-A result (16-agent workflow `wd28y0to9`, 2.6M tokens) — 2026-06-16

**Headline:** Crafty is a deep, real, well-tested ENGINE wearing a half-finished COSTUME. The renderer / atmosphere / VFX / Aspect-architecture / audio-synthesis / test-infra are genuinely June-2026 SOTA (~55-60%); the game reads "pretty but static/floaty" because the **game-FEEL layer**, the **living-world layer**, and the **settings/accessibility/pre-&-post-game layer** are pre-masterplan (~40-45%). Almost none of it is blocked by the bold-flat / all-synth / NEUTRAL-tonemap / BLOOM≥0.85 locks — the locks bite ONLY the glowier-vs-restrained render decision (Kevin call). The backlog is therefore overwhelmingly AUTONOMOUS.

**The 4 cross-cutting themes (these explain ALL the gaps):**
1. **"Works but reads FLAT/STATIC/FLOATY"** (the dominant ~half): flat 28ms hitstop (not weight-tiered), `Math.random` non-directional screenshake (not trauma/Perlin/directional), instant-snap movement (no accel/coyote/jump-buffer), enemy/boss attacks fire with only TEXT warnings (ZERO anticipation telegraphs), instant mob/boss death (ecs.remove + spark), the GPU wind-grass shader is DEAD CODE (zero ground vegetation), landmarks/shrines/Blight-Heart are inert geometry.
2. **"Built but never WIRED / muted dead code":** `playCraft` voice defined, zero callers (crafting silent); the threat-reactive arpeggiator (~250 lines, tested) muted at `PROC_MUSIC_GAIN=0`; boss kills bank zero Aspect meter (`emitMobKill` never fires for the boss); ore debris shatters WHITE (`BLOCK_COLORS` only maps codes 1-9); audio volume/mute in state but NO UI consumer (player can't mute).
3. **"First & last impressions off-brand":** AuthModal + loading/generating/click-to-play splashes + the title menu + the two TERMINAL screens (DeathScreen "YOU DIED" / VictoryOverlay "VICTORY", the climaxes) are raw Tailwind off-token static fades with name drift ("CRAFTY RPG" vs "Crafty").
4. **"Accessibility/tunability below the 2026 floor":** no reduced-motion respect (except Button.jsx), no screenshake/feedback-intensity toggle, no colorblind/text-scale/remap/invert-Y, touch has NO dodge (Shift-only — unreachable on the iPad target), and the iPad coarse-pointer default tier is "low" (strands the premium tablet on the FLATTEST render).

### Quick wins (HIGH-impact / LOW-cost / autonomous — do first, each Phase-B-verified vs live code)
1. Ore-debris WHITE bug: add ore codes 10-13 to `BLOCK_COLORS` (terrain.worker.js ~104/539) — restores the mining reward beat.
2. Wire `playCraft()` into doCraft (CraftingTable.jsx:85) + add equip/consume/transfer voices — crafting is silent today.
3. +/-7% random `playbackRate` in `playSpatialSound` (GameScene.jsx:248, stinger opt-out) — kills machine-gun fatigue across ~25 call sites.
4. Tier the hitstop: flat 28ms (SimplifiedNPCSystem.jsx:458) -> weight table {light:45,heavy:90,crit:130}.
5. Coyote-time (~110ms) + ~120ms input buffer on jump/dodge/attack (locomotion.js/inputState — zero refs today).
6. Touch DODGE button (right cluster; consumer reads intent source-agnostically) — parity bug, dodge unreachable on iPad.
7. Minimal Audio settings panel + mute (wire existing setVolume/setMusicEnabled/setSoundEnabled — no UI today).
8. iPad/high-end-mobile tier -> start "med" not "low" (quality.js) — turns on god-rays+N8AO+mipmap-bloom on the premium tablet.
9. Repoint `npm test` from the test_swarm.js rubber-stamp to the real vitest suite (package.json:29).
10. Detect `prefers-reduced-motion` -> gate framer anims + the new shake intensity (respected only in Button.jsx today).

### Ranked enhancement backlog (impact / cost / AUTO|KEVIN)
1. **[H/M/AUTO] Unified game-feel core** — `game/trauma.js` (trauma+=event, shake=trauma^2*Perlin, directional, clamped) + weight-tiered HITSTOP {light45,heavy90,crit130,boss160} + a global `juiceIntensity` multiplier (doubles as the accessibility dial). The foundation every later juice item plugs into. (COMBAT/GAME-FEEL)
2. **[H/S/AUTO] Wire missing audio** — playCraft in doCraft + equip/consume/transfer voices + spatial pitch-jitter. (AUDIO)
3. **[DONE 2026-06-16 · M3] Player-facing Settings** — feedback-intensity (screenshake/hitstop) slider + OS reduced-motion respect + audio SFX/music volume + master mute, all in SettingsPanel. Deferred: colorblind/text-scale, controls-remap, persistence, true WebAudio sub-bus split. (UX/A11Y)
4. **[DONE 2026-06-16 · M2 #4 S1-S3] Enemy + boss attack TELEGRAPHS** — dodgeable windup->strike machine (`game/attackTelegraph.js`, 380ms) in the ai.worker + anticipation coil pose + red-orange emissive charge ramp on the mob + boss lava ring spawns as a harmless forming warning (750ms) before arming. FEEL timing -> KEVIN #50. (MOBS/BOSS/COMBAT)
5. **[DONE 2026-06-16 · M4 S1] Wind grass REVIVED** — the dead OptimizedGrassSystem is mounted per chunk from worker grass-tops; per-chunk instanced tufts (0.4x0.7) with the existing wind-sway + player/mob-bend shader; ground-LOOK-confirmed. Density/slope-fade/backlit = tunable polish -> KEVIN #50. (WORLD/VEGETATION)
6. **[PARTIAL 2026-06-16 · M3] touch dodge DONE** (touch action-cluster dodge button -> the existing dodge intent). Deferred (movement-feel, distinct effort): input buffering + coyote-time + jump buffer + anim-cancel windows. (MOVEMENT/COMBAT)
7. **[DONE 2026-06-16 · M2 #7 S1-S2] Death/victory beats** — mob kills dissolve (shrink+spin, deferred removal) + boss-kill slow-mo+bloom; DeathScreen & VictoryOverlay rebuilt on Panel/Button tokens + a run summary (level/nights). Level-up beat = future polish. (PROGRESSION/UX)
8. **[H/L/AUTO] Make landmarks/shrines/Blight-Heart REAL destinations** — visible horizon Blight-Heart obelisk that grows on approach + interactable shrines (light-up + buff/lore/loot) + tiered objective chain. (WORLD/PROGRESSION)
9. **[DONE 2026-06-16 · M2 A-C] Directional impact** — hitDirection now drives flinch lean (flinchTilt) + spark cone (biasAlong) + camera-shake bias (cameraShakeDir); ore-debris colors fixed in M1 S1. (COMBAT/MOBS)
10. **[M/M/AUTO] Persistent day-phase dial** (sun/moon arc clock) + two-layer ghost-drain/critical-pulse stat & boss bars. (HUD/PROGRESSION)
11. **[H/M/AUTO] Element-zone chemistry & zone-ambiance VFX** (fire+ice=steam reads) + per-beast-form signature verb (comet-dash/bull-charge/...). (ASPECTS)
12. **[H/L/AUTO] Biome upgrade** — Whittaker temp×moisture grid (6-9 biomes) + transition blending + climate foliage density + biome/zone-tier spawn tables. (WORLD)
13. **[M/L/AUTO] Mining/placement game-feel** — hold-to-mine + crack overlay + per-block hardness + break/place juice + block-to-inventory loot orb. (BUILDING/MINING)
14. **[H/M/AUTO] Hemisphere bounce-light + explore fill + grade-AFTER-tonemap reorder + iPad tier detection.** (LIGHTING/ATMOSPHERE)
15. **[H/M/AUTO] Inventory correctness** — render all 3 buckets (tools/magic items are INVISIBLE today) + stack caps + drag/tooltips + recipe book. (functional BUG) (CRAFTING/INVENTORY)
16. **[M/M/AUTO] Repurpose the muted arpeggiator as an audible combat-intensity layer** + equal-power music crossfade + consolidate wind beds (closes a limiter bypass). (arp keep-vs-delete = Kevin). (AUDIO)
17. **[M/M/AUTO] Migrate off-brand pre-game surfaces to tokens** — AuthModal + loading/generating/click-to-play + on-brand loading screen. (title LOOK itself = Kevin taste). (UX/BRAND)
18. **[H/L/AUTO] Far-LOD horizon ring** (so distant landmarks/mountains/Blight-Heart are visible — unblocks #8) + un-gate shadows in capture + shadow normalBias/frustum-fit. (WORLD/LIGHTING/PERF)
19. **[H/L/AUTO] Soulbind squad depth** — commands (send/hold/focus) + formations + ally hit-reactions + fusion roster expansion. (depends on #4+#1). (ASPECTS)
20. **[M/M/AUTO] Repo/perf health** — code-split the 4.3MB chunk (manualChunks rapier+three/postprocessing) + fix `npm test` rubber-stamp + declare transitive deps + SwiftShader CI perf gate. (real-device perf = Kevin). (PERF/BUILD)

### Kevin-gated decisions surfaced (do NOT decide unilaterally)
- **Render lock — glowier vs restrained:** the ONE decision the bold-flat/BLOOM≥0.85/NEUTRAL-tonemap locks bite. Keep restrained or push glow/saturation? (affects #14, lighting).
- **FEEL timing/balance:** the exact telegraph windups, hitstop ms, shake magnitudes, difficulty (#4/#1) need a human playtest to tune — I'll ship sensible defaults + an intensity dial, you tune.
- **Title-screen LOOK** (#17) + **arpeggiator keep-vs-delete** (#16) + **real-device perf** (#20) + **de-island ocean amount** (#48) + **the standing #41-#49** + **i18n #73 (blocked).**

### Build order (milestones)
M1 game-feel core (#1) [DONE] + the verified quick-win bug cluster (ore-debris, playCraft, pitch-jitter, npm-test). → M2 [DONE] telegraphs (#4) + directional impact (#9) + death/victory beats (#7). → M3 [DONE] Settings/A11y (#3) + touch-dodge (#6). → **M4 (NEXT)** living world: wind grass (#5) + real landmarks (#8) + far-LOD (#18) + biomes (#12). → M5 systems depth: inventory correctness (#15) + element-zone VFX/beast verbs (#11) + mining feel (#13) + squad depth (#19). → M6 polish: lighting bounce (#14) + HUD aliveness (#10) + audio adaptive layer (#16) + pre-game brand (#17) + repo health (#20).
