# Crafty Autonomous Build Loop — CHARTER (the loop's constitution)

> **Authority grant (Kevin, 2026-06-10, verbatim intent):** autonomously keep building Crafty per the master
> plan; anything in the master plan may be **enhanced / deleted / fixed** as the loop judges best — **especially
> visuals / graphics / gameplay / audio**, where the bar is *significant, SOTA-grade* enhancement. The game
> should **look, feel and sound SOTA and amazing to play as of June 2026**, within the web/iPad/mobile envelope.
> This charter is the loop's full constitution; the `/loop` kernel prompt orders it read EVERY iteration.
> The kernel prompt is re-injected verbatim each firing (compaction-proof); this file is git-tracked
> (machine-loss-proof); CLAUDE.md auto-loads (session-proof). Three redundant layers — that is the design.

## 0. Mission + hard frame (never overridden by taste)

- **Vision** = `SOTA-INITIATIVE.md` v2 §1 (goal) + §2 (hard guardrails): SOTA in every aspect; visual/aesthetic taste is the
  HIGHEST bar (premium, distinctive, tasteful — never generic-voxel, never AI-slop); **web + iPad + mobile
  envelope** (clever > brute-force GPU); commercial-grade ambition (S4 multiplayer/monetization later).
- **AUDIENCE IS BROAD (Kevin decision 2026-06-04, recorded in coherence-pillars P5 + project memory; the
  master plan v2 (2026-06-10) now states this natively — this clause guards against v1-era docs):** kids → young adults → adults, "blur the
  lines", to maximise appeal + later monetisation. Marcus (8) is A user, NOT a depth-lowering floor —
  intensity / real-stakes / hard modes are allowed; age-8 legibility stays a design virtue, never a ceiling.
- **Chinese (zh-CN) = a locale TOGGLE with ENGLISH as the default** (the shipped i18n design: en default +
  lazy-loaded zh-CN). Full game-content translation is owed (#73) but the game is EN-first; design copy in
  English, then route through t() so the toggle stays complete.
- **Ground truth precedence:** git `main` → `memory/ACTIVE_PLAN.md` → `docs/superpowers/specs+plans` →
  `memory/STATE-REVIEW-*.md` → this charter → `SOTA-INITIATIVE.md` v2 (direction-canonical; its §3 status
  line is LIVING — loop-maintained at every milestone per §1.6 below).
- The loop has **no terminal state** — SOTA is a direction. It runs until Kevin stops it.

## 1. Per-iteration procedure (the only loop shape)

1. **ORIENT (assume amnesia — context may have just compacted):**
   `git -C /Users/kz/Code/Crafty status --short && git log --oneline -8` → read `memory/ACTIVE_PLAN.md`
   (resume pointer) → this charter → the open task list. TWO-LEVEL repo: docs/memory at ROOT
   `/Users/kz/Code/Crafty/`, app in `frontend/` (npm/tests run THERE). Absolute paths always; never assert
   file-absence from a relative path.
2. **STABILIZE:** if the tree is dirty from an interrupted iteration — finish it to green or revert it,
   commit, THEN proceed. Never stack new work on an unverified half-state.
3. **PICK exactly ONE work unit** by §2 priority. One unit = completable + verifiable + committable in one
   iteration (a milestone task, a fix bundle slice, a polish pass). Too big → split it; record the split in
   the plan doc.
4. **BUILD with the standing method:** milestone-scale work gets a `superpowers:writing-plans` plan doc in
   `docs/superpowers/plans/` FIRST (CLAUDE.md §Method — no build-from-spec shortcuts); TDD red-first for
   logic; extract-pure modules + thin god-file wiring; AST-safe edits only; Game-Loop-Isolation; NO-RE-MESH;
   capture-determinism. Big/risky deltas: adversarially review via a multi-agent Workflow (explicitly
   authorized) — confirmed findings get fixed before the unit is "done".
5. **VERIFY before declaring (evidence, not belief):** from `frontend/` — `npx vitest run` (count must HOLD
   OR GROW — see §3 ratchet) · `npm run build` clean · `npx vitest run --config vitest.visual.config.js`
   (13/13, or a DELIBERATE re-baseline per §4 with rationale + self-eyeball). A unit that can't reach green
   this iteration gets reverted or parked behind a red-tests note in ACTIVE_PLAN — never left silently broken.
6. **PERSIST (the filesystem is the only memory that survives):** commit (no AI footers; no `git add -A`;
   `.state/` untouched) + **push `main`** + update `memory/ACTIVE_PLAN.md` (what shipped + the NEXT unit) and
   `memory/CHANGELOG.md` (milestone-grade entries). Batch Kevin-facing decisions/eyeballs into
   `docs/superpowers/KEVIN-REVIEW-BATCH.md` instead of blocking on them.
   **+ DOC-CURRENCY (explicit, not "I'll remember"):** the moment a milestone/Aspect completes — banner its
   plan doc `✅ SHIPPED`, update the owning spec's status header, refresh the `SOTA-INITIATIVE.md` status
   banner. When a spec claim is falsified by reality (a seam map, a count), correct the spec in the same
   iteration. Every ~5 iterations (or at every Aspect boundary), sweep `docs/superpowers/` + the master plan
   for stale "awaiting/draft/Status: PLAN" headers + a stale KEVIN-REVIEW-BATCH. Empirical basis: doc-drift
   was caught TWICE by Kevin in the week of 2026-06-09 (24 stale plan headers; the master plan missed by a
   de-stale pass) — this step exists so it never needs catching again.
7. **REPORT** one short paragraph to the chat: shipped-what, evidence (test/frame counts), next-unit.
8. **CONTINUE:** schedule the next firing ~60–120s out while workable units remain; ~30min if EVERYTHING is
   blocked on Kevin/external (say so in the report). Never end the loop yourself; never idle-spin tokens.

## 2. Work-selection priority (top-down; skip = locked/blocked only)

1. **Broken main** (tests/build/visual red) — fix first, always.
2. **The current in-flight milestone** per ACTIVE_PLAN (finish > start).
3. **Pre-requisites the plan-of-record marks blocking** (e.g. #72 verb-mode seam before VOIDHAND M3;
   #69 gate inversion before M3).
4. **The post-spine spine (amended 2026-06-11 — the four-Aspect spine COMPLETED that day: WILDHEART ·
   VOIDHAND · SOULBIND · ELEMANCER all live):** **S3 de-monolith + engine hardening** is the new
   structural spine — the 5 god-files tax every future milestone; characterization-first, the same
   design-workflow → spec → per-milestone-plans discipline. B4-v1.5 (reagents/frost-plates/fire-spread)
   and the v2 voxel-mutation seam (iPad-gated) queue behind it; S4 stays Kevin-gated.
5. **SOTA experience enhancements** (the explicit Kevin mandate — interleave at least one every 2–3
   milestones, don't ghetto them to "later"): §6 backlog — audio/music, game-feel/juice, visual/render
   polish, content variety, UX legibility, i18n.
6. **Quality-infrastructure debt** from STATE-REVIEW + tasks (#70 panel matrix, #71 legibility, #73 i18n,
   #32 vitest bump, characterization before any de-monolith).
7. **Hygiene** (doc currency, dead code per the coherence rules).

## 3. Quality gates + the ratchet (non-negotiable)

- **Test ratchet:** NEVER delete, weaken, skip, or edit-to-pass an existing test or static gate to make work
  green (the canonical long-running-agent failure). A genuinely wrong test may be CHANGED only with a
  written justification in the commit body + an ACTIVE_PLAN note. Unit count holds-or-grows every iteration.
- **Static gates are seam-allowlists** — when adding a gated-class feature, extend the gate FIRST (red) then
  build (green). New invariants of CLAUDE.md-critical class get their own gate.
- **Perf envelope:** every new render/physics feature states its frame-cost story (pooled? capped? tier-gated?
  zero-alloc hot path?). When in doubt, measure delta-from-baseline like the M2 FPS-gate pattern.
- **No new floating "TODO later"** — every deferral lands in a task or plan doc.

## 4. Design/taste discipline (how the loop self-gates what Kevin used to gate)

Kevin delegated taste authority — the loop replaces his gate with this discipline, NOT with vibes:
- **Reference-lock before building any look** (the locked VFX rule): pick/produce a concrete visual reference
  (existing locked refs in `.superpowers/`, or a generated mockup committed for the record), THEN build to it.
  Judge IN-WORLD (real context, the grade ON), never on a sky-studio card.
- **Coherence pillars** (`docs/superpowers/specs/crafty-coherence-pillars.md` P0–P5) bound every addition:
  one readable art direction (S1-C bold-flat + the locked render recipe), no kitchen-sink drift. The
  destructive-CUT gate stays PARKED (its own bound #1) — the loop may ADD/REFINE freely but large deletions
  of shipped player-facing features need a KEVIN-REVIEW-BATCH entry first (deleting dead code/scaffold is free).
- **Player-experience lens** on everything: builder-plays-before-done (drive the real app when behavior
  changed); content-variety + signature-fires checks; legibility (a fresh player must be able to FIND the
  feature — key taught, HUD honest, denied-actions give feedback).
- **Visual re-baselines are allowed and expected** (the look is MEANT to improve): re-baseline = render →
  self-eyeball at HD (340dpi-equivalent zoom, IB-grade scrutiny) → commit baseline + a one-line rationale +
  a KEVIN-REVIEW-BATCH entry with the before/after paths. Capture-determinism stays load-bearing (new
  effects freeze or self-null under `isCaptureMode()`).
- **Audio is a first-class axis** (it shipped most-neglected): every Aspect gets its motif + verb SFX; the
  WILDHEART roar-set backfill is owed (#74 — the loop now OWNS this decision: do it).
- **Genuinely-Kevin items** (park + batch, never block the loop): real-device iPad FPS runs, anything
  spending money / creating accounts / publishing externally, big direction reversals of his recorded
  decisions (third-person timing, monetization=S4, audience).

## 5. Process deltas vs the pre-loop era (so old docs don't confuse the loop)

- The "Kevin HARD GATE before implementation" in older specs/CLAUDE.md is **replaced by the self-gate**: a
  grounded design workflow (seam-map vs LIVE code + research + adversarial critique) whose output spec is
  committed BEFORE building, + the §4 discipline. Kevin reviews ASYNC via KEVIN-REVIEW-BATCH + CHANGELOG.
- Kevin-decision backlog items in old docs (e.g. #74 music policy, loot-beam punchiness, named regions,
  hotbar honesty): the loop decides them on the recorded evidence, logs the decision + reversal-path in
  KEVIN-REVIEW-BATCH, and proceeds. Exceptions: the §4 genuinely-Kevin list.
- The master plan itself may be edited (status banners, re-sequencing, adding named passes) — keep §1–§2
  vision intact, log every edit in CHANGELOG.

## 6. SOTA-experience backlog (seed list — extend it as you learn; as of 2026-06-10)

Audio: per-Aspect motifs + roar/transform/grab/hurl SFX · hit/kill audio split (player vs enemy) · pad LFO
movement + arpeggiator stingers · ambient day/night/biome beds · UI sounds. Game-feel: hitstop/screenshake
tuning · per-verb camera kicks · landing/footstep feedback · damage direction cues. Visual: per-element
projectile GEOMETRY variety · siege/dawn skybox moments · biome landmarks + silhouette landmarks · mob
bestiary distinctness (post-B3 per plan, pull earlier if cheap) · loot-VFX premium pass (parked branch
`s2a-loot-vfx-premium` exists) · FPV beast-form interim treatment (#71). UX: controls-panel truth + onboarding
toasts (#71) · panel matrix (#70) · coin sinks · hotbar honesty. i18n: full zh-CN content pass (#73 — locale
TOGGLE, English default, natural Simplified Chinese for a broad kids-to-adults audience). Each of
these follows §4 (reference/spec first for look-bearing ones).

## 7. Compaction + crash resilience (why this survives anything)

- The kernel `/loop` prompt re-arrives VERBATIM every firing — it carries orientation + the pointer here.
- Every iteration ends committed+pushed with ACTIVE_PLAN updated → a fresh context (or fresh machine)
  recovers from git + the 4-piece alone. Mid-iteration compaction recovers via step 1-2 (ORIENT/STABILIZE).
- CLAUDE.md carries a compaction-preserve note (the compactor reads it).
- If THIS file is missing at orient-time, restore it from git history before any other work.
