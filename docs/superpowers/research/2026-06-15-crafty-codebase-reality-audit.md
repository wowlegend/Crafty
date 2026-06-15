# Crafty — Codebase Reality + SOTA-Debt Audit (2026-06-15)

> Source: background workflow `crafty-sota-reality-audit` (wf_7f85b01c-590, 10 agents over every `src` subsystem). Kevin's mandate: "treat every line of code prior to the masterplan as suspicious until reviewed for SOTA-contribution." Read-only audit; all findings cite file:line.

## Headline

Crafty's post-masterplan core is genuinely strong (ocean/mood shaders, GPU spark/mote systems, bold-flat token/primitive UI, pure input subsystem, gate-protected data registries). But it does **not** currently look or sound stunning — and the gap is overwhelmingly **tuning/wiring, not missing capability**. A verified 3-bug postprocessing chain flattens the entire frame; block-break debris is invisible; a debug overlay ships to production; the worldgen height field silently diverges between worker and main thread; 8 audio chains clip with no master limiter. **The cheapest fixes are the highest player-visible leverage.**

## P0 debt (verified, cite file:line)

1. **Postprocessing chain — THE "dim/flat" root cause (GameScene.jsx).** (a) Bloom `luminanceThreshold={1.0}` (:903) → no diffuse surface ever blooms (only the untonemapped sun + additive VFX); (b) ToneMapping `NEUTRAL` (:908) with NO `toneMappingExposure` → highlights compressed to muted midtones; (c) WRONG ORDER — `HueSaturation`(:899)+`BrightnessContrast`(:900) grade runs BEFORE Bloom+ToneMapping (linear pre-tonemap → muted). Fix: threshold ~0.65 + intensity up; exposure ~1.1-1.3; grade AFTER tone-map. **Highest visual-impact-per-effort in the whole codebase.**
2. **Invisible block-break debris (BlockParticleSystem.jsx:17,75-85).** `scales=[0,0,0]` init; the useFrame loop only ages+teleports, NEVER writes scale/matrix — every mined block emits 8 zero-scale invisible cubes. Mining has sound but **no visible shatter**. (Contradicts the earlier "breaking already shatters" claim — verify-before-assert catch.)
3. **DebugOverlay ships to PRODUCTION (App.jsx:809).** Gated on `!hudHidden`, NOT `import.meta.env.DEV` (contrast :811/:813 which are DEV-gated). Glassmorphism panel + green bug button + `window.alert` reach every web/iPad user.
4. **Lockstep broken — worldgen height drift (climate.js:20 vs terrain.worker.js:394).** `30+n*40` (stale) vs `40+n*18+highland²*120` (authoritative). The "characterization test pins it" claim is FALSE (test only checks biome category at 3 points, never height). Landmark baseY, footstep audio, biome ambience all read the wrong surface. Root-cause fix: extract ONE shared height/biome fn imported by both threads.
5. **No master bus / no limiter (8 chains → AudioContext.destination directly).** Per-voice guards normalize in isolation; concurrent siege voices sum > 0 dBFS → hard-clip. Route through master Gain → DynamicsCompressor + per-category sub-buses (music/sfx/ambience/ui).
6. **AudioContext never resumed on start gesture.** `enterPlay()` (MenuSystem.jsx:98) doesn't call `audioContext.resume()` → cold-load UI/heartbeat/transition/level-up SFX silently dropped until something else resumes the ctx.
7. **Palette fork** — worker `BLOCK_COLORS` ≠ `Blocks.js BLOCK_TYPES` (sand/leaves/wood hexes disagree) → placed block ≠ generated terrain color. Unify into one palette SoT + numeric-id↔string-key bridge.
8. **Build-verb texture mis-map (Terrain.jsx:696-715)** — `blockIdMap` collapses water→4 (paints SAND), lava/diamond/gold/iron/coal/glass/cobblestone→3 (paint STONE). Placing those paints the wrong material.
9. **Token-SoT violations** — Aspect/element hexes hardcoded (ElementZoneRenderSystem:13-19, Snare/Phantom/Hurl systems, HUD raw Tailwind); cssVars.js omits the 4 Aspect colors from `--ui-*`.
10. **bossSystem.js:74-77** — `addToInventory(name,1,'Legendary')` but store sig is `(item,qty)` → rarity silently dropped; also uses `GameMethods.grantXP` (a no-op `{}`) instead of `store.grantXP`.

## SOTA visual opportunities (ranked by player-visible impact)
Postproc chain (above) · world surface fidelity (proceduralTextures.js: 32px NearestFilter no-mipmaps no normal/rough/AO/emissive maps) · lighting/mood (mood.js fillIntensity=0, even ambient 0.90, cool ambient, near-white sun; verify ground-Y vs FOG_SEA_LEVEL=56) · invisible-debris→GPU shatter · soft-ember spark fix (GPUSparkSystem.jsx:73 gl_PointCoord on a quad is undefined → square sparks; use uv varying + radial alpha) · off-brand first-3-screens (App.jsx:653-764 raw Tailwind blue + green terminal spinner + "CRAFTY RPG") · thin signature-verb VFX (hurl/snare/phantom/zones; element annihilation silent) · boss cinematic (dangerLevel bridge exists but flips instantly) · music ducking (MusicPlayer uses HTMLAudio OUTSIDE the Web Audio graph → can't duck) · hero HUD/loot juice · the Hearth + landmarks are featureless grey boxes · sky+godrays (flat skydome, godRays disabled on low = the iPad default tier) · DSP upgrade (synthVoices 8-bit-toy, mono, no ADSR/reverb) · **biome variety (biomeTable.js: only 3 biomes via coarse cut, hard borders, `continent` param ignored — the data-driven table built for M4 expansion was never used).**

## Dead/cut (verified, mechanical)
Components.jsx dead imports (lines 44-58: 9 lucide icons + MagicWand + OptimizedGrassSystem) + truncated tail comment (:1272) · GameScene.jsx:775 console.log · audio dead wrappers (SoundManager 558-585) · orphan voices (playTone/playMagic/playMagicCharge + makeMagicSound/makeMagicChargeSound — VOICES advertises 37, several never fire) · SoundManager 442-471 empty comment block · TradingInterface dead costColor/getColor · HUD dead showStats props · Terrain.jsx:597 dead `hit.toi` branch (always undefined this Rapier build).

## Decisions needing Kevin
- **Procedural music engine fate** — synthPad+arpeggiator (~300 LOC) are muted (`PROC_MUSIC_GAIN=0`) but still execute every frame (25ms scheduler allocating/GCing nodes = mobile waste). DELETE or revive? The biome `windBed` ambience is entangled + silent — if deleting, re-home windBed onto a live node (don't lose the only biome-reactive ambience).
- **spellUpgrades.js** — wire `spellLevels` into `solveSpellDamage` (make upgrades real) OR delete the table + SpellUpgradePanel? Currently premium UI over a no-op damage table (player-facing lie).
- **Brand name** — "CRAFTY RPG" (App.jsx blue card) vs "Crafty" (MenuSystem purple bold-flat). Which is canonical?
- **iPad default quality tier** (quality.js:31) — ALL coarse-pointer devices start `low` (godRays+AO off) → iPad (a premium target) gets the FLATTEST render. Detect iPad/high-end mobile → start `med`?
- **i18n scope** — zh-CN covers ~49 chrome keys only; entire gameplay corpus (items/quests/NPC/achievements/tooltips) is hardcoded English. Also verify LocaleToggle is reachable from real Settings (currently only in dev showcase).
- **Resonance Aspect gap** — accrualHooks has Ferocity/Soul/Kinetic kill-accrual but NO `useResonanceAccrual`, yet survivalSystem bleeds resonanceBanked at dawn. Confirm the accrual source or it's a design gap.

## Prioritized remediation plan (rank · item · effort)
1. (S) Postproc chain fix — bloom threshold↓ + exposure + grade-after-tonemap. **THE dim/flat root cause.**
2. (S) DEV-gate DebugOverlay (App.jsx:809) + remove GameScene console.log.
3. (M) Fix invisible block-break debris + shrink/spin/fade (then GPU-shard rewrite).
4. (M) Fix lockstep height divergence — shared height/biome module + a HEIGHT characterization test.
5. (M) Master audio bus → limiter + per-category sub-buses + `audioContext.resume()` in enterPlay.
6. (S) Re-skin first-3-screens to S1-C tokens; resolve brand name.
7. (S) Lighting/mood taste pass (needs #1 first to judge).
8. (S) Soft-ember spark fix + build-verb blockIdMap mis-map fix.
9. (S) Mechanical dead-code sweep (one pass).
10. (M) Unify block palette SoT + route Aspect hexes to tokens + emit Aspect `--ui-*` vars.
11. (S) Decide spellUpgrades (wire or delete); confirm Resonance accrual.
12. (M) Boss + signature-verb cinematic pass + fix bossSystem dropped loot rarity.
13. (L) World surface fidelity (proceduralTextures: 64-128px + mipmaps + normal/rough/emissive arrays + variants).
14. (L) Biome variety + worldgen content (4-6 biomes + blending + ground cover + richer canopies + Hearth/landmark sculpt). **Answers "world feels pointless".**
15. (L) God-file de-monolith (next safe extractions) + route ElevenLabs music through Web Audio graph for ducking.

> NOTE: ranks 1, 7, 13, 14 overlap the `crafty-world-purpose-sota` workflow's visual plan — sequence them together once that lands (don't double-tune the pipeline).
