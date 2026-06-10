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
layered on a day-build / night-siege survival loop. Wildheart (beast-transform) is SHIPPED; Voidhand
(kinetic grab/hurl) is in flight.

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
3. **Quality gates green every unit:** unit suite holds-or-grows · build clean · the 13-state visual gate
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

## 3. Status (LIVING — refresh at every milestone; last: 2026-06-10)

**S0 ✅ · S1-A/B/C/D ✅ (foundation, render recipe, bold-flat UI system, signatures) · S2 design ✅ ·
S2-A foundation ✅ · S2-B1 WILDHEART ✅ (merged `458bbb5`) · #68 perf remediation ✅ (`868e4e7`) ·
S2-B2 VOIDHAND IN-FLIGHT (M1 ✅ · **M2 FPS gate ✅** [desktop-PASS, re-gated w/ REAL hurls; iPad confirm
parked to Kevin] · **#72 verb-router ✅** [+ fixed silently-NaN-broken mine/place] · **M3 HURL/SLAM ✅** ·
**M4 ANVIL+KINETIC ✅ · M5 ✅ · M6 ✅ · M7 THE LOOK ✅ · M8 CONTENT ✅) — 🏆 S2-B2 VOIDHAND ASPECT
COMPLETE 2026-06-10** (grab→orbit→HURL/SLAM→anvil-3×-gold-WALL-HIT; kinetic economy; 9-type tints;
ink+violet-rim look judged in-world; zero re-baselines across the whole Aspect; FPV-feel + iPad runs
parked to Kevin non-blocking) · next on the spine = **the owed AUDIO interleave unit** (charter §2.5:
6 milestones since the last experience unit; #74 motif policy is loop-owned + WILDHEART roar SFX owed +
voidhand verb SFX) **→ then S2-B3 SOULBIND design workflow** · S2-B4 + S3 + S4 not started.** Live scale
(measured 2026-06-10 post-Aspect): ~22.6k LOC src / 128 files / 727 unit tests (77 files) /
21 static-gate files / 13-state visual gate / perf-probe harness (`?perf=A..E`). Full risk map:
`memory/STATE-REVIEW-2026-06-10.md`. Open tasks: #69–#74 (+ earlier #32 vitest · #63 B1 tuning ·
#64 beast-capture · #66 panel flags) — **the task registry is the source of truth, not this line.**
Known managed drift: WILDHEART shipped audio-silent (the motif pass — §5 AUDIO now owns it).

## 4. Workstreams + sequencing

| Stream | Scope | Status / entry criteria |
|---|---|---|
| **S2-B Aspect spine** | The signature: 4 Aspects, sequential, deep-before-next — **B1 Wildheart ✅ → B2 Voidhand (M2→M8) → B3 Soulbind (capture-creatures; mobKillBus seam pre-built) → B4 Elemancer (reactive terrain — the ONLY re-mesh-risk Aspect, perf-gated, deliberately last)** | LIVE. Each Aspect: grounded design workflow → committed spec (self-gate per charter §5) → per-milestone plan docs → build → adversarial review. |
| **§5 SOTA-experience axes** | Audio · game-feel · visual polish · content variety · UX legibility · i18n | LIVE — interleaved (≥1 unit every 2–3 milestones, charter §2.5). |
| **S3 engine + platform** | De-monolith god-files (characterization-first) · partial-ECS resolution · **touch/mobile input + UI** (the third-person control pivot likely fuses here — Kevin 2026-06-07) · real perf numbers + adaptive-quality hardening · gen-system perf | **AFTER S2-B complete (all 4 Aspects) — the recorded decision.** A LOOP-PROPOSED relaxation (logged in KEVIN-REVIEW-BATCH for async ratification, NOT yet policy): enter at ≥3 Aspects if a forcing event lands (an external commitment making touch load-bearing, or a hard perf wall). Backlog accruing in ROADMAP §S3-deferred. |
| **S4 multiplayer + business** | Netcode, accounts, persistence-at-scale, payments, monetization model (Kevin decision), distribution (web-first → app stores later, Kevin 2026-06-04) | LAST. Entry: single-player core SOTA + S3 platform base. The dead client auth/cloud stubs are **deletable any time as dead code** (charter §4 — they fire a failing XHR every load today); whatever S4 needs gets rebuilt properly here. |

**Named content passes (re-anchored from v1):** per-Aspect **music motif** → owned by §5 AUDIO (backfill
WILDHEART, fold into every Aspect's LOOK milestone) · **bestiary design+behavior pass** → after B3 Soulbind
(creatures serve capture/transform) · **world-design/landmarks pass** → late-S2 (after B3, before/with B4),
gen-perf hardening in S3.

## 5. SOTA-experience axes (Kevin 2026-06-10 mandate — first-class streams, not polish)

- **AUDIO (most-neglected axis — current: 16 procedural SFX + 1 generative pad + arpeggiator):** per-Aspect
  motifs + full verb SFX (roar/transform owed for WILDHEART; grab/hurl/slam for VOIDHAND); a
  **siege-escalation motif** (the core loop's tension peak — committed since v1, still unbuilt);
  player-vs-enemy hit distinction; ambient day/night/biome beds; UI sounds; loudness/mix pass. Tooling decision (procedural
  WebAudio vs asset-based vs ElevenLabs) = first AUDIO unit, decided by the loop on evidence.
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
  the locked S1-C design language + WILDHEART look · soft death · Aspect sequence.

## 7. Pointers

- `memory/ACTIVE_PLAN.md` (resume) · `memory/CHANGELOG.md` / `ARCHITECTURE.md` / `ROADMAP.md` (4-piece)
- `memory/STATE-REVIEW-2026-06-10.md` (latest full reconciliation + risk map) · `memory/REALITY-AUDIT-2026-05-30.md` (S0) · `memory/PRE-S2B-CONTENT-AUDIT-2026-06-03.md`
- `docs/superpowers/specs/2026-06-02-crafty-s2-game-design-design.md` (the S2 design of record) ·
  `crafty-coherence-pillars.md` (P0–P5) · per-Aspect specs · `docs/superpowers/LOOP-CHARTER.md`
- `docs/superpowers/KEVIN-REVIEW-BATCH.md` (Kevin's async review surface)
