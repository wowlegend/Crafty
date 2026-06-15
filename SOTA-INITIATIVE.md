# Crafty → SOTA Initiative — Master Plan v2 (LIVING — read this FIRST in a fresh session)

> **v2 rewrite 2026-06-10** (authority: Kevin's 2026-06-10 grant — the loop/agent may enhance/delete/fix this
> plan as judged best). v1 (the 2026-05-30 brainstorm-kickoff brief) is HISTORICAL — in git history at tag-time
> `ddfdf96` and superseded in full; its S0 audit / S1 brainstorm process sections completed weeks ago.
> **This is a LIVING document:** the autonomous build loop refreshes the §3 status line at every milestone
> (doc-currency is a persist-step obligation — see `docs/superpowers/LOOP-CHARTER.md` §1.6).
> **Ground-truth precedence:** git `main` → `memory/ACTIVE_PLAN.md` (resume pointer) → specs/plans in
> `docs/superpowers/` → `memory/STATE-REVIEW-2026-06-10.md` (risk map) →
> `docs/superpowers/LOOP-CHARTER.md` (operating constitution — outranks this plan on process conflicts) →
> this plan (direction-canonical).

## 0. TL;DR

Crafty is a **feature-dense 3D voxel action-RPG** (React 19 / Three 0.172 / R3F 9.5 / Rapier 2.2 WASM KCC /
zustand 5 / miniplex-narrow / Vite 6) being driven to **SOTA in every aspect — look, feel, sound, play —
within a web + iPad + mobile envelope**, then to multiplayer + monetization. The original codebase was
fast-built with a real slop trail; the rebuild discipline (S0 reality-audit → S1 art-direction → S2 game
design → Aspect-by-Aspect signature build, all spec-gated + test-gated + adversarially reviewed) has been
holding since 2026-05-30. The signature thesis: **four elemental "Aspects"** — playable power-fantasies
layered on a day-build / night-siege survival loop. All four Aspects SHIPPED (2026-06-10/11): Wildheart (beast-transform), Voidhand (kinetic grab/hurl), Soulbind (capture/squad/fuse), Elemancer (element-zone chemistry).

## 1. The goal (canonical vision — supersedes ALL older framings)

- **SOTA in every aspect:** graphics/aesthetics, gameplay, performance, audio, UX, architecture.
- **Visual/aesthetic taste is the HIGHEST bar.** Kevin (ex-IB, very high design taste): distinctive,
  premium, *tasteful* — never generic-voxel, never AI-slop. This axis anchors everything.
- **The game must look, FEEL and SOUND state-of-the-art and amazing to play** (Kevin 2026-06-10) — audio and
  game-feel are first-class SOTA axes (§5), not polish afterthoughts.
- **Audience is BROAD (Kevin 2026-06-04, coherence-pillars P5):** kids → young adults → adults, "blur the
  lines", to maximise appeal + later monetisation. Marcus (8) is A user, NOT a depth-lowering floor —
  intensity / real-stakes / hard modes allowed; age-8 legibility stays a virtue, never a ceiling.
- **Language:** English default; **zh-CN as a locale toggle** (full content translation owed — task #73).
- **Platform envelope:** great on web + iPad + mobile (touch). NOT AAA GPU budgets — clever > brute-force.
- **Multiplayer + monetization in scope LAST (S4):** cosmetic-led recommended; hard legal lines = no
  randomized gacha/lootboxes (esp. to minors) + COPPA + odds-disclosure-if-random. Model = Kevin's S4 call.
- **Beyond-SOTA welcome:** novel mechanics / never-before-seen features encouraged on the solid base —
  but **depth/coherence over feature-count**: the historic failure mode here was feature-rich SLOP, not
  feature-poverty (pillars P0–P5 bound every addition).

## 2. Hard guardrails (every iteration, non-negotiable)

1. **Verify code-reality before trusting any doc claim** — the founding rule of this initiative.
2. **Spec before build; plan-doc per milestone** (`superpowers:writing-plans`); TDD red-first; the **test
   ratchet** (never delete/weaken a test or gate to pass — justified changes only, in the commit body).
3. **Quality gates green every unit:** unit suite holds-or-grows · build clean · the 20-state visual gate
   (deliberate re-baselines only, with rationale + eyeball + KEVIN-REVIEW-BATCH entry).
4. **Engine invariants:** Game-Loop-Isolation (transient reads in hot loops; render JSX never reads
   worker/loop-mutated fields) · NO-RE-MESH from combat systems · capture-determinism · derive-don't-bake.
5. **Perf envelope discipline:** every render/physics feature states its frame-cost story; measure
   delta-from-baseline when in doubt (the M2 FPS-gate pattern).
6. **Taste discipline:** reference-lock before building any look; judge IN-WORLD on the real grade;
   coherence pillars P0–P5 bound every addition; player-experience lens (builder plays before "done").
7. **Adversarial verification on big deltas** (multi-agent review; fix confirmed findings before "done") —
   the proven anti-slop mechanism (it has caught real bugs the builds missed, repeatedly).
8. **No AI footers in commits; no `git add -A`; absolute paths (TWO-LEVEL repo).** Own repo + own
   initiative — **separate from moneymaker** (its rules/ledgers/AUP frame do not apply here).

## 3. Status (LIVING — refresh at every milestone; last: 2026-06-15)

**S0 ✅ · S1-A/B/C/D ✅ (foundation, render recipe, bold-flat UI system, signatures) · S2 design ✅ ·
S2-A foundation ✅ · 🏆 THE FOUR-ASPECT SPINE COMPLETE (2026-06-10/11): S2-B1 WILDHEART ✅ ·
S2-B2 VOIDHAND ✅ · S2-B3 SOULBIND ✅ · S2-B4 ELEMANCER ✅** — grab/orbit/hurl/slam/anvil, the
kinetic+soul+resonance economies, capture/squad/fuse, and the combinatorial element-zone chemistry all
live; zero re-baselines across the entire spine · **Kevin's live-playtest fix arc ✅** (the respawn
deadlock + the ONE coherent pointer-lock/menu state machine) · **the Aspect-UX guide-card pass ✅** ·
**experience interleaves shipped** (audio @34, feel @61, content @83, motifs @93, UX-legibility @98, locomotion+biome-audio @116/122, camera-kick @139, enemy-aggro-audio @145, damage-direction @149/150, slam/land-kick @153, look-sensitivity @154, ui-foley @155, mob-death-finisher @156, aspect-unlock-hint @157, loot-rarity-aura @163, twilight-night-sky @165). **S3 de-monolith +
engine hardening IN-FLIGHT** — the recorded entry gate ("AFTER S2-B complete, all 4 Aspects") is now MET,
so S3 is legitimately active (no relaxation invoked): **S3-M1 ✅** (SoundManager → audio/synthVoices +
musicTheory; the DSP's first characterization) · **S3-M2 ✅** (EnhancedMagicSystem data pulls →
game/spells + spellVisualProfiles + chainLightning) · **S3-M3 ✅** (the NPC safe-shell strips) · **S3-M4 ✅✅
COMPLETE** (the AdvancedGameFeatures dissolve, 4 parts → game/world/ui/render across 11 files; **the 1397-LOC
god-file ELIMINATED** — file deleted; the boss-finale adversarial review caught + fixed a BLOCKING latent
mount-crash [orphaned SPELL_UPGRADES] that had silently vacuous-ed the visual gate since iter 101). **3 of the
5 god-files now de-monolithed** (SoundManager, EnhancedMagicSystem [data], AdvancedGameFeatures[gone]); the
NPC [✅ dissolved @ iter 144] + Components god-files remain. **The WORLD-DESIGN pass is now ACTIVE** (Kevin-ratified 2026-06-13, HYBRID
"Anchored Infinite"; spec + 6-milestone ladder committed): **M1 (Hearth) ✅ + M2 (divable oceans) ✅ + M3 (biome-table refactor) ✅ + M4a (biome FOLIAGE
distinctness — snow pines) ✅ SHIPPED (iters 108/110/112/114)**; M4 was split (M4a foliage ✅ → M4b palette → M4c
topography). Then locomotion-audio ✅ (iter 116) + M5a ocean depth-tint ✅ (118) + **🏆 M6 landmarks ✅ (120) → the M1-M6 "Anchored
Infinite" ladder COMPLETE** (Hearth · divable oceans · biome-table · biome-foliage · ocean-depth · landmarks) + **biome-ambient
audio ✅ SHIPPED (iter 122)** — each biome now SOUNDS distinct (the world pass lands on sight+feel+sound; audio ledger
feel@61/audio@93/116/122). Then resumed the charter-#4 STRUCTURAL spine: **S3-M5 (Components de-monolith) parts 1-2 ✅
SHIPPED (iters 124/126)** — render/UI leaves → `ui/GameHud.jsx`+`render/playerRender.jsx`, then pure kernels → `game/spawnPlacement.js`+`game/locomotion.js` (characterization-first, the loop's first spawn/locomotion tests). **Components 1812 → 1286 LOC.** **4 of 5 god-files dissolved-or-shrinking** (SoundManager/EMS/AGF done;
Components −512 in progress; NPC ✅ dissolved 1217→801 @ iter 144). Then PICKED **📱 TOUCH/MOBILE INPUT** — the §0 hard-frame gap (the game was UNPLAYABLE on its stated iPad/mobile target: zero touch handlers, Pointer-Lock-gated which iOS lacks). A grounded 3-lens design-gate workflow → committed spec (dual-zone floating-joystick + drag-look + crosshair; reuses the intent-SoT/verb-router/active-gate seams with ZERO movement-consumer change; M0→M3 ladder) + **TOUCH M0 ✅ + M1 ✅ + M2a ✅ SHIPPED (iters 128-137; M1 reviewed-clean)** — M0 the pure `touchMath.js` (joystick→booleans · PLC look-clamp · multi-touch id→zone) + M1 the producer-wiring overlay (reuses setIntent/performVerb/setActive) + M2a the VISIBLE S1-C surface (lucide gold-glyph dark buttons + joystick ring + crosshair; colliding HUD hidden on touch; `mobile.png` baseline 18/18). **The game is now CORE-PLAYABLE + VISIBLE on touch — the §0 hard-frame gap closed for the core loop.** Touch **M3a (panel-access tray) ✅ SHIPPED (iters 146-147 — panels reachable on touch + a surface-wide glyph color fix)**; M2b (focus polish) / M3b (radial verb wheel) / M3c (analog + hotbar-cycle) queued. Then (axis-change per anti-tunneling): S3-M5 part 3 (Player-loop SM-wiring) · world new-blocks (M4b+M5b) · **S3-M6 (NPC de-monolith) ✅ COMPLETE @ iters 140-144 — XP/loot steppers + hit-FX + MobModel render → the last original-audit god-file dissolved (NPC 1217→801)** · **GamePanels de-god-filed @ iter 148 (CraftingTable + itemUi → `ui/panels/`, 1094→739) · EMS de-god-filed @ iter 152 (spellVfx render group → `render/spellVfx.jsx`, 904→474) — only Components 1297 + GameScene 914 remain >900 (both risky; the cheap byte-exact wins are exhausted)** · interleaves. **Post-spine hardening + polish (iters 158-165):** a 3-crash BROKEN-MAIN arc was found + fixed, all the SAME class — a symbol orphaned by a byte-exact extraction (`lookSensitivity` @159, `MagicWand` @160, `_trailDir` @161 [a live spell-cast crash]) — hidden ~6 iters by a diff-on-stale-`current/` verification hole now CLOSED (capture.mjs fails loud on render crashes) AND guarded commit-time by an **ESLint crash-class gate @162** (`no-undef` + `react/jsx-no-undef`, run inside `vitest`). Then visual interleaves: **loot rarity AURA @163** (a bloom glow-shell, any-angle rarity tell) + a loot-showcase fixture cube-leak fix @164, and a **twilight NIGHT SKY @165** (moon disc + stars on the dusk mood). **Player de-monolith continued @167-168** (dodge + WASD moveVector → pure `game/` kernels, characterization-first; then judged the Player pure-kernel grind diminishing-returns — the rest is imperative loop orchestration). **Doc-currency sweep @166.** **🎨 MOB BESTIARY DISTINCTNESS @169-171** — per-type SILHOUETTE features (skeleton ribs / hound ears+tail / brute shoulders+crown / skitterling antennae / cow horns) in the bold-flat box vocabulary, fixing the generic-voxel mob look; visual gate 18→19 (new `mob-bestiary` fixture). **Mature-game polish arc (iters 172-180):** boss silhouette (Shadow Dragon horns/tail/ridge) @172 · **low-health danger feedback** (red vignette @173 + heartbeat audio @174) · new mob **emberhusk** @175 + **de-monolith formally PARKED** (Components 1297 / GameScene 914 — cheap byte-exact kernels exhausted, the remainder is risky imperative-orchestration, not blocking) · premium **level-up flourish** @176 · first-session **onboarding nudge** @177 · **mob loot coverage** @178 (the 4 newer hostiles were lootless → loot tables + a coverage gate) · **day/night transition audio** @179 (siege horn + dawn chime) · **survival-progression quests** @180 (survive-nights + new-mob hunts — the siege loop is now promise→audio→goal coherent). **Holistic step-back + backlog-harvest arc (iters 181-187):** a code-grounded multi-agent design Workflow produced a 22-item ranked next-levers backlog (`docs/superpowers/specs/2026-06-14-crafty-next-levers-backlog.md`); then verify-before-assert HARVESTED the validatable quick-wins while correcting the backlog's systematic over-optimism (4 of its top items were already-done/redundant — break-debris, incoming-hit flash/shake, spell-upgrade scaling): **dusk pre-warning** @181 · **block-place puff** @182 · **reward-beat audio** @183 (fixed a DEAD `window.playLevelUpSound` bug + an achievement/quest fanfare) · **coin sink** @184 (coins→potions — the dead currency is spendable) · **HOME compass marker** @185 (find the Hearth) · **endless bounty quests** @186 (the goal feed never dries up) · **numbered siege ladder** @187. **The quick-win backlog is now HARVESTED; the 4 remaining MILESTONE levers (recurring boss spine · build-identity talents · enemy attack telegraphs · cinematic-beat pass) are combat-FEEL/playtest-gated → Kevin-steer pending (KEVIN-REVIEW #35), NOT built blind by the loop.** **Live-play P0 + completion arc (2026-06-14, post-187):** Kevin caught the DESKTOP MOUSE-LOOK was DEAD (drei PointerLockControls — element-match-fragile + UNtestable in the pinned-camera capture harness) → replaced with own `input/pointerLook.js` + a real-browser `npm run test:look` gate (the loop's first LIVE-input gate; the headless suite never exercised camera/feel — the root blind spot). Then **TOUCH COMPLETED** — cold-start was DEAD on iOS (menu→play was Pointer-Lock-gated, which iOS lacks → stuck on the title screen forever) → bridged via `enterPlay()`; + phone-HUD declutter (QuestTracker collapses on touch), spell-label nowrap, a compact touch XP/LEVEL readout, and a hardened deterministic `touch-probe.mjs` (iPhone-13 emulation + real touch events + Pointer-Lock deleted = iOS-faithful); touch is now probe-exhausted (only real-device finger-feel = Kevin). Then **🌊 OCEAN MILESTONE COMPLETE (S1-S4, plan-driven + reference-locked)** — the flat dark-blue water became a SOTA stylized sea: brighter tropical-teal surface + sun-Fresnel sheen (S1), shore FOAM (S2 — the reads-as-ocean signature; needed un-merging the greedy mesher's water-top faces to bake per-cell foam into spare vertex-color channels), depth-graded TOP surface shallow-teal→deep-navy (S3), + an `ocean-coast` capture state pixel-gating it all (S4); every slice self-validated via a new headless `ocean-probe.mjs`. **ALL SELF-VALIDATABLE FRONTS NOW DONE (camera · music · terrain+sun · touch · ocean); the remaining work is Kevin-gated — redeploy crafty-sand + real-device touch + music ear-check + ocean taste (KEVIN-REVIEW #37/#38) → the loop WAS in steady-state hold until Kevin's 2026-06-15 MEGA-DIRECTIVE (below).**

**🔶 2026-06-15 MEGA-DIRECTIVE (supersedes the hold; this §3 is the master-plan registration of the milestone plan `docs/superpowers/plans/2026-06-15-crafty-world-purpose-sota.md`).** Kevin steered: the world STILL reads mountainous + POINTLESS (aimless wander on a pretty island), music OK → do a thorough SFX pass, treat ALL pre-masterplan code as suspect, make everything visually STUNNING, + research agentic E2E. Three deep workflows ran → synthesized to `docs/superpowers/research/2026-06-15-crafty-codebase-reality-audit.md` + `...-agentic-e2e-testing.md` + the milestone plan above. **DECISIONS OF RECORD (Kevin 2026-06-15, see §6):** game DIRECTION = **"Ember Frontier + grafted Blight-Heart climax"** (THE answer to "what's the point" — outward see-it-go-to-it exploration on the existing landmark/compass rails + a fixed foreshadowed boss-lair WIN-STATE; today the boss is a non-sited level-5 ambush = literally aimless) · E2E installs = BOTH (@react-three/test-renderer + Playwright/WebKit) · visual re-baselines = BATCH review. **The audit caught real defects** (a 3-bug postproc chain = the dim/flat root cause; invisible block-break debris; a DebugOverlay shipping to prod [✅ fixed `dc6f3cc`]; a worker↔main-thread height drift; an unlimited/clipping audio bus; dead spell-upgrade progression). **PHASE 2 build (plan-driven slices; STATUS 2026-06-15):** S5 shared-`heightAt` drift-fix ✅ (`61b6438`) → S4 tame-mountains ✅ (`192039e`; data-verified gentler — peaks +36→+12.8, highland fires 15%→4.4%; gate 20/20, INVISIBLE to the capture cams so verified by the worldShape test not the gate) → **NEXT: the VISIBLE "dark/flat" fix (it's lighting, NOT height)** — S2 aerial-perspective + S1 vertex-AO + audit rank-1 postproc tune → S3 un-gate beacons/shadows-in-capture → S6 ores-by-depth → **S4b de-island** (SPLIT off S4: lowering OCEAN_CONTINENT_THRESHOLD moves every coastline → needs ocean-camera relocation + a spawn-distance taste call). THEN gameplay S7-S10 (distance tier scalar / interactive shrines / Blight-Heart climax + win-state / onboarding-purpose) per the confirmed direction. Also shipped this arc: DebugOverlay-in-prod ✅ fixed (`dc6f3cc`); E2E tools (@react-three/test-renderer + Playwright/WebKit) ✅ installed. **KEY finding:** capture mode was hiding cast shadows + landmark emissive beacons, so the reviewed baselines were the FLATTEST version of the world (not real play); and ToneMapping is already NEUTRAL + MOOD_GRADE already ships (don't redo those). i18n #73 BLOCKED (item-name-as-identity; needs an id/display decouple refactor first). Live scale (2026-06-15):
~25k LOC src / ~245 files / 1191 unit tests / 20-state visual gate / ~57 static-gate files (LIVE-verified,
+`hearth`+`biome-snow`+`ocean-depth`+`ocean-coast`+`landmark`+`mobile` fixtures) / perf-probe harness
(`?perf=A..E`). Full risk map: `memory/STATE-REVIEW-2026-06-10.md`. **The task registry is the source of
truth, not this line.** Known managed item: the dependabot build-toolchain vuln (esbuild→vite chain; the
`vite@8` breaking migration, dev-only — not in the shipped bundle) logged in KEVIN-REVIEW-BATCH #9.

## 4. Workstreams + sequencing

| Stream | Scope | Status / entry criteria |
|---|---|---|
| **S2-B Aspect spine** | The signature: 4 Aspects, sequential, deep-before-next — **B1 Wildheart ✅ → B2 Voidhand (M2→M8) → B3 Soulbind (capture-creatures; mobKillBus seam pre-built) → B4 Elemancer (reactive terrain — the ONLY re-mesh-risk Aspect, perf-gated, deliberately last)** | ✅ COMPLETE (all 4 Aspects shipped 2026-06-10/11). Method per Aspect: grounded design workflow → committed spec (self-gate per charter §5) → per-milestone plan docs → build → adversarial review. |
| **§5 SOTA-experience axes** | Audio · game-feel · visual polish · content variety · UX legibility · i18n | LIVE — interleaved (≥1 unit every 2–3 milestones, charter §2.5). |
| **S3 engine + platform** | De-monolith god-files (characterization-first) · partial-ECS resolution · **touch/mobile input + UI** (the third-person control pivot likely fuses here — Kevin 2026-06-07) · real perf numbers + adaptive-quality hardening · gen-system perf | **LIVE — the entry gate is MET (all 4 Aspects ✅, 2026-06-11), so the recorded "AFTER S2-B complete" condition is satisfied (the ≥3-Aspect relaxation was never needed).** De-monolith M1-M4 + M5 parts 1-2 shipped; **touch/mobile input DESIGN-GATED + M0+M1+M2a+M3a ✅ shipped (iters 128-147) — the game is now core-playable + VISIBLE on touch AND panels are reachable (the panel-access tray); touch is now COMPLETE/probe-exhausted (2026-06-14: iOS cold-start bridged via `enterPlay()` + phone-HUD declutter + deterministic `touch-probe.mjs`; only real-device finger-feel = Kevin); M2b/M3b/M3c are optional polish**; perf-number hardening + partial-ECS resolution still queued. Backlog in ROADMAP §S3-deferred. |
| **S4 multiplayer + business** | Netcode, accounts, persistence-at-scale, payments, monetization model (Kevin decision), distribution (web-first → app stores later, Kevin 2026-06-04) | LAST. Entry: single-player core SOTA + S3 platform base. The dead client auth/cloud stubs are **deletable any time as dead code** (charter §4 — they fire a failing XHR every load today); whatever S4 needs gets rebuilt properly here. |

**Named content passes (re-anchored from v1):** per-Aspect **music motif** → owned by §5 AUDIO (backfill
WILDHEART, fold into every Aspect's LOOK milestone) · **bestiary design+behavior pass** → after B3 Soulbind
(creatures serve capture/transform) · **world-design/landmarks pass** → late-S2 (after B3, before/with B4),
gen-perf hardening in S3.

## 5. SOTA-experience axes (Kevin 2026-06-10 mandate — first-class streams, not polish)

- **AUDIO (music overhaul SHIPPED 2026-06-14 — ElevenLabs day/night/boss tracks + crossfade via src/ui/MusicPlayer.jsx; procedural pad/arp now MUTED [SoundManager PROC_MUSIC_GAIN=0]; ~16 procedural SFX + biome wind-bed retained):** per-Aspect
  motifs + full verb SFX (roar/transform owed for WILDHEART; grab/hurl/slam for VOIDHAND); a
  **siege-escalation motif** (the core loop's tension peak — committed since v1, still unbuilt);
  player-vs-enemy hit distinction; ambient day/night/biome beds; UI sounds; loudness/mix pass. Tooling decision (procedural
  WebAudio vs asset-based vs ElevenLabs) = first AUDIO unit, decided by the loop on evidence.
  **SFX OVERHAUL MANDATED (Kevin 2026-06-15; music "okay so far" per his ear-check):** the audit found
  NO master-bus/limiter (8 chains clip at peak), AudioContext not resumed on the start gesture (cold-load
  SFX silently dropped), and 8-bit-toy mono voices (no ADSR/reverb) — a thorough SFX review+enhancement is
  queued in Phase 2 (master bus + limiter + `audioContext.resume()` first). See the 2026-06-15 audit doc.
- **GAME-FEEL:** hitstop/screenshake tuning, per-verb camera kicks, landing/footstep feedback, damage
  direction cues, transform/grab weight. Judged by playing, tuned in small Kevin-eyeballable steps.
- **VISUAL polish:** per-element projectile geometry variety; siege/dawn sky moments; FPV beast-form interim
  treatment (#71); loot-VFX premium pass (parked branch exists); biome/landmark silhouettes (§4 pass).
- **CONTENT variety:** mobs beyond 6 box-template swaps (post-B3 by default; pull forward if cheap);
  biome distinctness; quest/dialogue freshness.
- **UX legibility:** controls-panel truth + onboarding (#71); panel-key matrix (#70); coin sinks; hotbar
  honesty; denied-action feedback.
- **i18n:** full zh-CN content pass (#73 — toggle, EN default) + the per-milestone `t()` discipline.

## 6. Process (how this plan executes)

- **Autonomous build loop:** `docs/superpowers/LOOP-CHARTER.md` is the operating constitution (orientation,
  one-verified-unit-per-iteration, priority order, self-gated taste discipline, doc-currency, parking rules).
  Kevin reviews ASYNC via `docs/superpowers/KEVIN-REVIEW-BATCH.md` + CHANGELOG; only physically-Kevin items
  block (real-device runs, spend/accounts/publishing, reversals of his recorded directional decisions).
- **Method:** subagent/workflow-driven design + adversarial review; specs in `docs/superpowers/specs/`,
  plan docs in `docs/superpowers/plans/`; the 4-piece (`memory/`) carries session state across compaction.
- **Decisions of record (do not relitigate without Kevin):** audience-broad (2026-06-04) · third-person
  direction w/ deferred control pivot (2026-06-07) · monetization model = S4 · web-first distribution ·
  the locked S1-C design language + WILDHEART look · soft death · Aspect sequence · **game-direction = "Ember Frontier + Blight-Heart climax" (2026-06-15)** — outward exploration on existing landmark/compass rails + a fixed foreshadowed boss-lair win-state; the canonical answer to "what is the point of the game" (the world-purpose milestone, plan in `docs/superpowers/plans/2026-06-15-crafty-world-purpose-sota.md`).

## 7. Pointers

- `memory/ACTIVE_PLAN.md` (resume) · `memory/CHANGELOG.md` / `ARCHITECTURE.md` / `ROADMAP.md` (4-piece)
- `memory/STATE-REVIEW-2026-06-10.md` (latest full reconciliation + risk map) · `memory/REALITY-AUDIT-2026-05-30.md` (S0) · `memory/PRE-S2B-CONTENT-AUDIT-2026-06-03.md`
- `docs/superpowers/specs/2026-06-02-crafty-s2-game-design-design.md` (the S2 design of record) ·
  `crafty-coherence-pillars.md` (P0–P5) · per-Aspect specs · `docs/superpowers/LOOP-CHARTER.md`
- `docs/superpowers/KEVIN-REVIEW-BATCH.md` (Kevin's async review surface)
- **2026-06-15 mega-directive docs:** `docs/superpowers/plans/2026-06-15-crafty-world-purpose-sota.md`
  (world+purpose milestone — the Ember Frontier build contract) · `docs/superpowers/research/2026-06-15-crafty-codebase-reality-audit.md`
  (the suspect-everything debt audit + 15-item plan) · `docs/superpowers/research/2026-06-15-crafty-agentic-e2e-testing.md` (E2E options)
