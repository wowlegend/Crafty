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
- **Game-design direction (Kevin-CONFIRMED 2026-06-15, decision-of-record — do NOT relitigate):** "The Ember
  Frontier, gated toward a Blight Heart climax" — outward *see-it-go-to-it* exploration on the already-built
  landmark + compass rails, the Shadow Dragon relocated from its ~25-block ambush to a single fixed, foreshadowed
  far-edge "Blight Heart" lair = a real WIN-STATE + endless post-climax handoff. North star for the gameplay layer
  (tier-by-distance, shrines, climax). Source: `docs/superpowers/plans/2026-06-15-crafty-world-purpose-sota.md`.
  REVERSING this is §4-genuinely-Kevin; AFFIRMING a sub-direction within it is loop authority.
- **2026-06-17 COMPREHENSIVE REBUILD (Kevin redirection — the ACTIVE spine; supersedes the 2026-06-15 Phase-2
  S5–S10 ladder as the work-of-record):** Kevin reviewed the LIVE game; the prior "SOTA" work was largely
  INVISIBLE (green gates measured code-PRESENCE, not lived result — only the grass visibly changed across ~21
  frames). Re-run via the FULL superpowers flow → an 11-agent every-element audit (`docs/superpowers/audits/2026-06-17-*`)
  + a Kevin-APPROVED design spec (`specs/2026-06-17-crafty-sota-rebuild-design.md`) + 4 trust-first plans
  (`plans/2026-06-17-crafty-W{1,2,3,4}-*.md`), executed **subagent-driven in batches with a controller LIVE-LOOK
  + gate checkpoint between batches** (a green pinned-capture gate is necessary NOT sufficient — that blind spot
  is the whole reason for the rebuild; the §1.5 LIVE-PROBE axis is now load-bearing on EVERY visible slice).
  **LOCK REVERSAL (Kevin 2026-06-17):** the restrained-NEUTRAL grade lock is REVERSED — glowier/warmer is
  AUTHORIZED (ocean = toon Caribbean water-plane; title = Cinematic 3D vista; W3 = Living-frontier MAX; spells =
  4 distinct silhouettes). The Ember-Frontier game DIRECTION (above) still stands — the rebuild fixes LOOK +
  dead-code + content fidelity on top of it.
- **2026-06-20 MANDATE EXPANSION (Kevin verbatim: "fix everything. and then build out everything too" + "keep going autonomously"):**
  the loop now runs a FULL two-phase drive. **(A) FIX EVERYTHING:** drive the exhaustive-review backlog
  (`docs/superpowers/CODE-REVIEW-2026-06-20.md` — 5 HIGH all fixed; ~36 mechanical autonomousFixQueue items; the 17
  kevinDecisions are now LOOP-DECIDED with best judgment, NOT deferred — Kevin said "i'm too lazy to spell them out
  one by one") + the knip dead-export backlog + impact-ring dedup → to ZERO, in small gated batches.
  **(B) THEN BUILD OUT EVERYTHING:** the deferred KEVIN-REVIEW game features (biome-flora render-wiring, spell-color
  unify, distinct shrine model, quest gear/coin rewards, mob/boss art, starting-inventory rebalance, …) + the
  master-plan remaining work, each as a proper milestone (brainstorm→spec→plan→build). Arsenal now: knip (dead-code
  gate), ast-grep `sg` (codemods), serena LSP / native `LSP` tool (prove-dead-before-delete, symbol nav).
  **ONE carve-out still genuinely-Kevin:** S4 multiplayer + monetization is a product/business decision (servers,
  accounts, real money, legal) → the loop SURFACES a scope-confirm before standing up netcode or payments; ALL other
  single-player / content / polish / quality work is full loop authority. Taste calls the loop makes go to
  KEVIN-REVIEW as FYI, not as blocking questions.
- **2026-06-28 MANDATE = POST-AUDIT EXHAUSTIVE FIX/IMPLEMENT (Kevin verbatim: "keep going autonomously to fix/implement all, dont miss anything"; "keep going"):**
  the W1–W4 rebuild + Phase B are COMPLETE. An exhaustive multi-agent status audit ran 2026-06-28
  (`docs/superpowers/AUDIT-2026-06-28-full-status.md`) — answers: completion NO (~70%; 159 items: 109 verified / 18 partial /
  9 not-done / 16 parked / 7 superseded), code-review MOSTLY (fresh all-file pass; 3 HIGH all fixed), E2E/visual NO (the
  weakest axis — now being closed). The loop's job: drive the audit's gap list + the tracked task queue (recorded in
  ACTIVE_PLAN "2026-06-28 CAMPAIGN QUEUE") to completion, then continue the master plan. **⚠️ THE AUDIT IS PARTLY STALE —
  VERIFY-BEFORE-ASSERT EVERY task against LIVE code (grep/Read the cited file:line) BEFORE fixing.** Empirical: task #1
  ("boss reward = junk") was a FALSE ALARM — the items were registered + rarity resolved; a blind "fix" would have been
  wrong. The audit also wrongly claimed @playwright/test was installed. Treat every audit finding as a T3 hypothesis.
  **NEW DECISIONS OF RECORD (Kevin 2026-06-28, do NOT relitigate):** (1) control scheme = **Option A** with **F = cast spell**
  (magic is the marquee feature), **T = melee** (shipped `74fd858`); the A enhancements (verb-telegraph reticle, hold-Alt
  force-build, persistent control legend, full key-rebinding) are AUTHORIZED loop work; the touch Aspect-verb radial wheel is
  DEFERRED to a Kevin playtest. (2) **bloom luminanceThreshold 0.65 (glowier) is INTENDED** — it supersedes the old ≥0.85
  spec; do NOT "fix" it; reconcile the stale spec note instead. (3) **grantXP full-heal on level-up is INTENDED** — leave it.
  (4) **E2E = `@playwright/test` gameplay-flow specs (`npm run test:e2e`, tests/e2e/) on the dev test-bridge + the headless-safe
  `forcePlay` hook**, kept SEPARATE from the puppeteer visual gate; design-of-record `specs/2026-06-28-crafty-control-scheme-design.md`.
  Execution posture: CONTROLLER-SEQUENTIAL (TDD→gate→commit→push per item) for code — NOT fan-out code-editors (shared god-files
  rate-limit + conflict, the logged M-HUD lesson); use background Workflows for read-only analysis / adversarial verification.
- **2026-06-29 MANDATE = v6 TECH-DEBT → DE-MONOLITH (Kevin verbatim: "do all the autonomous-doable tech-debt first. and then the de-monolith. get the loop / charter updated first and invoke the loop. keep going autonomously"):**
  the post-audit campaign closed all safe veins; Kevin RE-ARMED the loop with a strict two-phase order. **PHASE C (autonomous tech-debt — do ALL first, to zero):** (1) visual-gate FAIL-LOUD hardening (item #12 — capture already non-zero-exits on a render-crash; the residual hole is `diff.test.js` passing on STALE `current/` when run isolated after a crashed/timed-out capture → a run-sentinel + a pure `captureFreshness` predicate + a freshness assertion); (2) E2E perf coverage (frame-rate + memory via the existing `devtest/perfProbe` harness, wired into a Playwright spec); (3) coherence-gate calibration-verify. **PHASE A (de-monolith — after C is zero):** Components ~1345 / SimplifiedNPCSystem ~934 / GameScene ~933 LOC → plan-doc-first (`superpowers:writing-plans`), then extract-pure-module + thin-wiring slices, each INDIVIDUALLY gated (characterization test before extraction; capture-verify any render-touching slice). **DE-MONOLITH IS NOW FULL LOOP AUTHORITY** — it was parked as Kevin-gated scope/taste (iter-175); Kevin has now explicitly DIRECTED it, so it is no longer a §4-genuinely-Kevin item. STILL Kevin-gated: zh-CN i18n #73, S4, control-scheme #9, compass #6, touch radial wheel, mob/boss art, W4 weather, clip/photo-mode, live-eye taste, affixes full wiring. Live cursor + per-item detail in `memory/ACTIVE_PLAN.md` (the v6 block).
- **Ground truth precedence:** git `main` → `memory/ACTIVE_PLAN.md` → `docs/superpowers/specs+plans` (incl. the 2026-06-15
  mega-directive set: `plans/2026-06-15-crafty-world-purpose-sota.md` [S5..S10 ladder + direction], `research/2026-06-15-crafty-codebase-reality-audit.md`
  [ranked file:line P0-debt backlog of record], `research/2026-06-15-crafty-agentic-e2e-testing.md` [E2E roadmap]) →
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
3. **PICK exactly ONE COMMITTABLE unit (multi-front aware)** by §2 priority. The loop may hold MULTIPLE
   concurrent fronts — a build slice + an in-flight background Workflow + a pending Kevin decision — but commits
   exactly ONE verifiable unit per iteration. A unit is one of: (a) a CODE SLICE (completable+verifiable+committable
   this tick), (b) a WORKFLOW LAUNCH (the authored workflow-spec is the deliverable — see step 4), or (c) a
   WORKFLOW-ARTIFACT INTEGRATION (synthesizing a returned workflow's output into a plan/spec/decision is itself the
   unit). Background workflows run in parallel + do NOT block the tick; await+integrate is its own later unit.
   Too big → split it; record the split in the plan doc.
4. **BUILD with the standing method:** milestone-scale work gets a `superpowers:writing-plans` plan doc in
   `docs/superpowers/plans/` FIRST (CLAUDE.md §Method — no build-from-spec shortcuts); TDD red-first for
   logic; extract-pure modules + thin god-file wiring; AST-safe edits only; Game-Loop-Isolation; NO-RE-MESH;
   capture-determinism. Big/risky deltas: adversarially review via a multi-agent Workflow (explicitly
   authorized) — confirmed findings get fixed before the unit is "done".
   **Workflow orchestration (ultracode mode):** AUTHORING a background multi-agent Workflow is a first-class
   substantive activity (not just a within-iteration review step) for research / codebase audit / SOTA-design /
   concept-judging fan-outs. Spin a BACKGROUND Workflow (not inline work) when the task is breadth-first analysis,
   needs parallel independent investigation, or would blow one tick's context. A workflow-launch (or artifact-
   integration) tick is EXEMPT from the §3 test-growth invariant — its deliverable is a committed plan/spec/research
   doc, not code. **T3-trust caveat:** agent/workflow CLAIMS are UNTRUSTED until verified against LIVE code
   (grep/Read the cited file:line) — the 2026-06-15 codebase audit itself made false claims later corrected by
   verify-before-assert (e.g. "breaking already shatters" was wrong — debris was invisible). Persist the artifact
   (commit the doc) as the tick's PERSIST step.
5. **VERIFY before declaring (evidence, not belief):** from `frontend/` — `npx vitest run` (count must HOLD
   OR GROW — see §3 ratchet; a workflow/doc-only tick may hold the count FLAT, say so) · `npm run build` clean · the
   N-state visual gate (read N LIVE from ACTIVE_PLAN — 20 as of 2026-06-15; do NOT hardcode it here, counts drift),
   or a DELIBERATE re-baseline per §4 with rationale + self-eyeball. **⚠️ VISUAL-GATE HAZARD (the iter-159 lesson — a crash hid on main for 5
   iters):** `npx vitest run --config vitest.visual.config.js` ALONE only DIFFS the pre-existing `current/`
   PNGs against `baseline/` — it does NOT re-render. So it reports "18/18" on STALE frames + silently MISSES
   any render-affecting change (the iter-154 GameScene crash passed this "gate" @154-158 on iter-150 frames).
   **For ANY change that can affect a rendered scene/HUD/component, you MUST re-CAPTURE first: `npm run
   visual:capture` (or `npm run test:visual` = capture+diff), THEN read the changed frame.** The diff-alone is
   valid ONLY for changes that provably cannot render (pure logic / capture-null overlays / non-rendering props
   — and say WHY in the report). A unit that can't reach green this iteration gets reverted or parked behind a
   note in ACTIVE_PLAN — never left silently broken.
   **⚠️ LIVE-PROBE + LOOK is a REQUIRED verification axis, not optional:** the headless gates (visual = static
   pinned-camera diorama; unit = pure logic) are BLIND to live input/camera/feel/audio — this blind spot shipped a
   DEAD desktop mouse-look AND a DEAD iOS touch cold-start, both "green". For ANY change touching input/camera/feel/
   render-in-motion, run the standing per-modality LIVE probe (`frontend/scripts/visual/{pov-probe,touch-probe,ocean-probe,look-e2e}.mjs`
   — drive the REAL app HUD-hidden, screenshot, LOOK with your own eyes) BEFORE claiming done. Gate metric = 6%
   pixelmatch, NOT md5 (bloom/dither is sub-perceptually non-byte-stable). swiftshader ≈ GPU but is NOT a real finger
   or ear — audio + real-device feel stay honestly Kevin-gated. **Also: the capture cams don't frame a highland peak,
   so a world-SHAPE change can be INVISIBLE to the gate — verify world-gen changes via DATA (a worldShape-style test)
   + a probe pointed at the actual thing, not the gate alone (the 2026-06-15 S4 lesson).**
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
   de-stale pass) — this step exists so it never needs catching again. **Sync the durable kernel copy too:**
   when the `/loop` kernel's operating MODE / ORIENT / CONTINUE / ask-gates change, mirror it into
   `docs/superpowers/LOOP-KERNEL-PROMPT.md` the SAME tick — that file is a self-standing duplicate of those
   surfaces AND the cold/git-only recovery source, so it is a second drift surface (it went stale once: the
   v2 file vs the refreshed live kernel, caught by Kevin 2026-06-15).
7. **REPORT** one short paragraph to the chat: shipped-what, evidence (test/frame counts), next-unit.
8. **CONTINUE (three-state cadence):** schedule the next firing ~60–150s out while committable units remain (the
   DEFAULT — Phase-2 is an ACTIVE build queue, not a hold). If a background Workflow is in flight whose output gates
   the next build, AWAIT+INTEGRATE it (poll /tmp task outputs + TaskList each orient; the integration is the next
   unit — do not idle-spin or manufacture churn while waiting). ~30min ONLY if EVERYTHING is blocked on Kevin/external
   (say so explicitly). Never end the loop yourself; never idle-spin tokens.

## 2. Work-selection priority (top-down; skip = locked/blocked only)

1. **Broken main** (tests/build/visual red) — fix first, always.
2. **The current in-flight milestone** per ACTIVE_PLAN (finish > start).
3. **Pre-requisites the plan-of-record marks blocking** (e.g. #72 verb-mode seam before VOIDHAND M3;
   #69 gate inversion before M3).
4. **The active structural spine = the 2026-06-17 COMPREHENSIVE REBUILD** (the W1–W4 trust-first plans
   `plans/2026-06-17-crafty-W{1,2,3,4}-*.md`, executed subagent-driven; see §0). The 2026-06-15 mega-directive
   S5–S10 ladder + `codebase-reality-audit` P0 chain are SUPERSEDED as the spine — their shipped parts are
   subsumed by the 2026-06-17 11-agent audit; any remaining items are folded into W1–W4. The four-Aspect spine
   (WILDHEART · VOIDHAND · SOULBIND · ELEMANCER) completed 2026-06-11; S3 de-monolith is now LARGELY DONE (4-of-5
   god-files dissolved; only Components ~1297 + GameScene ~914 remain, formally PARKED iter-175 — risky
   imperative-loop extraction, not actively blocking) → de-monolith is now a DEBT LANE behind the mega-directive,
   not the spine. B4-v1.5 + the v2 voxel-mutation seam (iPad-gated) + S4 stay Kevin-gated/later.
5. **SOTA experience enhancements** (the explicit Kevin mandate — interleave at least one every 2–3
   milestones, don't ghetto them to "later"): §6 backlog — audio/music, game-feel/juice, visual/render
   polish, content variety, UX legibility, i18n.
6. **Codebase-debt triage (NEW standing posture — "treat ALL pre-masterplan code as suspect until SOTA-reviewed",
   Kevin 2026-06-15):** work the ranked file:line backlog in `research/2026-06-15-crafty-codebase-reality-audit.md`.
   Verified P0 (highest player-visible leverage): the postproc 3-bug chain (dim/flat root cause), invisible
   block-break debris, worker↔climate height drift [✅ S5], no master audio bus/limiter, AudioContext-never-resumed,
   palette fork. Sequencing rule: audit ranks 1/7/13/14 OVERLAP the visual plan → co-sequence with the world-purpose
   slices, do NOT double-tune the pipeline.
7. **Quality-infrastructure debt** from STATE-REVIEW + tasks (#70 panel matrix, #71 legibility, #73 i18n,
   #32 vitest bump, characterization before any de-monolith).
8. **Hygiene** (doc currency, dead code per the coherence rules).

## 3. Quality gates + the ratchet (non-negotiable)

- **Test ratchet:** NEVER delete, weaken, skip, or edit-to-pass an existing test or static gate to make work
  green (the canonical long-running-agent failure). A genuinely wrong test may be CHANGED only with a
  written justification in the commit body + an ACTIVE_PLAN note. Unit count holds-or-grows every iteration —
  EXCEPT a Workflow-LAUNCH or Workflow-ARTIFACT-INTEGRATION tick (§1 step 4), whose deliverable is a committed
  design/audit/research doc not code; such a tick holds the count flat + says so in the report. The destructive
  ratchet (never delete/weaken/skip/edit-to-pass a test or static gate) stays in FULL force for every CODE tick.
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
  effects freeze or self-null under `isCaptureMode()`). **BATCH re-baseline cadence (visual-overhaul campaigns,
  Kevin-confirmed 2026-06-15 = "re-baselines = BATCH review"):** when a planned campaign produces MULTIPLE intended
  re-baselines each exceeding the 6% gate (e.g. the world-purpose AO/aerial/beacon/postproc slices), accumulate the
  before/after pairs across iterations + present them as ONE consolidated KEVIN-REVIEW-BATCH taste review at
  slice-ladder close (a contact-sheet of N frames + one taste ask), NOT slice-by-slice. Each individual re-baseline
  still gets its HD self-eyeball + commit + one-line rationale at the tick it ships; only the Kevin-facing TASTE
  sign-off batches. Use stable git refs (`git show <commit>:.../baseline/<frame>.png`), never `current/`.
- **Audio is a first-class axis** (it shipped most-neglected): every Aspect gets its motif + verb SFX; the
  WILDHEART roar-set backfill is owed (#74 — the loop now OWNS this decision: do it).
- **Genuinely-Kevin items** (park + batch, never block the loop): real-device iPad/phone runs, anything
  spending money / creating accounts / publishing externally, big direction REVERSALS of his recorded decisions
  (third-person timing, monetization=S4, audience, the Ember-Frontier direction); **NEW-DIRECTION CONFIRMATION**
  (when the loop surfaces a proposed game-direction/sub-direction for Kevin to AFFIRM before building the gameplay
  layer — a PICK, distinct from a reversal; the Ember-Frontier pick was this before 2026-06-15); **adding any NEW dev
  dependency / test substrate / install** (e.g. @react-three/test-renderer + Playwright/WebKit — approved + landed
  `0f8cad9`; the zero-dep gameplay-flow + state-hash E2E needs NO ask, built under loop authority); ear / taste
  sign-off (audio mix, final colour/foam taste).

## 5. Process deltas vs the pre-loop era (so old docs don't confuse the loop)

- The "Kevin HARD GATE before implementation" in older specs/CLAUDE.md is **replaced by the self-gate**: a
  grounded design workflow (seam-map vs LIVE code + research + adversarial critique) whose output spec is
  committed BEFORE building, + the §4 discipline. Kevin reviews ASYNC via KEVIN-REVIEW-BATCH + CHANGELOG.
- Kevin-decision backlog items in old docs (e.g. #74 music policy, loot-beam punchiness, named regions,
  hotbar honesty): the loop decides them on the recorded evidence, logs the decision + reversal-path in
  KEVIN-REVIEW-BATCH, and proceeds. Exceptions: the §4 genuinely-Kevin list.
- The master plan itself may be edited (status banners, re-sequencing, adding named passes) — keep §1–§2
  vision intact, log every edit in CHANGELOG.
- **CAPTURE-MODE HID REAL LIGHTING (verified 2026-06-15):** capture mode was DISABLING both cast shadows AND the
  landmark emissive crowns — so every reviewed visual baseline was the FLATTEST, beacon-less version of the world,
  NOT real play. Treat pre-S3 visual baselines as a floor, not ground truth; world-purpose S3 un-gates beacons+shadows
  in capture so reviewed frames match play. This is WHY the step-5 LIVE-PROBE axis is load-bearing: the diorama lied.

## 6. SOTA-experience backlog

**SUPERSEDED (2026-06-15) by two newer, file:line-cited backlogs of record — work THOSE first:** (1) the
**codebase-reality-audit** (`research/2026-06-15-crafty-codebase-reality-audit.md`): the ranked P0 debt chain
(postproc 3-bug dim/flat root cause, invisible debris, height drift [✅ S5], audio clipping/no-limiter, palette fork,
build-verb mis-map, token-SoT) + the SOTA visual-opportunity ranking; (2) the **world-purpose-sota** plan
(`plans/2026-06-15-crafty-world-purpose-sota.md`): vertex AO, aerial perspective, un-gate landmark emissive crowns +
cast shadows in capture, ore generation, tier-by-distance, shrines, fixed Blight-Heart climax + win-state.
**ANTI-REDO (verified — do NOT re-tune):** ToneMapping is ALREADY NEUTRAL (not ACES) + the per-mood MOOD_GRADE
script ALREADY ships in `render/mood.js`. The original 2026-06-10 seed list below stays a valid INTERLEAVE candidate
pool where not subsumed:

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
