# Crafty Autonomous Build Loop — CHARTER (the loop's constitution)

> **Authority grant (Kevin, 2026-06-10, verbatim intent):** autonomously keep building Crafty per the master
> plan; anything in the master plan may be **enhanced / deleted / fixed** as the loop judges best — **especially
> visuals / graphics / gameplay / audio**, where the bar is *significant, SOTA-grade* enhancement. The game
> should **look, feel and sound SOTA and amazing to play as of June 2026**, within the web/iPad/mobile envelope.
> This charter is the loop's full constitution; the `/loop` kernel prompt orders it read EVERY iteration.
> The kernel prompt is re-injected verbatim each firing (compaction-proof); this file is git-tracked
> (machine-loss-proof); CLAUDE.md auto-loads (session-proof). Three redundant layers — that is the design.

## 0-A. READ ORDER (this replaces the old accreted mandate-ladder)

<!-- BEGIN READ-ORDER (regenerate: node frontend/scripts/ci/read-order.mjs --write) -->
**Orientation read order — GENERATED. Do not edit here.** It lives in
`frontend/scripts/ci/read-order.mjs` and is rendered into every surface that states it, because three
hand-kept copies drifted three different ways while one of them claimed they "cannot disagree".

1. `git main` + **CI on `main`** — the code is the only truth that cannot lie — and CI IS PART OF THE TREE. `gh run list --workflow=ci.yml --branch main`; a push that leaves CI non-`success` is a RED TREE and outranks every queue item.
2. `memory/ACTIVE_PLAN.md` — the live cursor — the ONE unit in flight right now.
3. `docs/superpowers/HOLISTIC-REVIEW-2026-07-21.md` — the PRIMARY work queue — 215 verified findings, priority-laddered, each tagged `[AUTO]`/`[KEVIN]` and marked `▣✓ <sha>` / `▢` / `⊘`. **This markdown is the ONLY copy** — the machine JSON it was regenerable from died with a session-scoped tmp scratchpad (verified absent 2026-07-27). Do not hunt for it; its absence is not a blocker.
4. `memory/STATUS.md` — THE source of truth for WHERE WE ARE, and the SECONDARY queue (gameplay/content/UX items the code review did not cover). Both, without contradiction: it owns status, the review owns the work ladder. VERIFY an item is still open before working it — much of the older A-bis/V1 work is DRAINED.
5. `docs/superpowers/LOOP-CHARTER.md` — the constitution — how the loop operates (esp. §0-B harness layer + §3 gates), plus `LOOP-KERNEL-PROMPT.md`, the durable copy of the `/loop` prompt and the cold/git-only recovery source.
6. `docs/superpowers/DECISIONS.md` — the decision RECORD. `KEVIN-REVIEW-BATCH.md` is the append-only INBOX and structurally cannot tell you what is settled. A reversal is a NEW dated entry naming the one it supersedes — never a silent edit.
7. `docs/superpowers/INDEX.md` — the doc map — what to read and what to IGNORE. A stale doc is a LIVE TRAP; never mine old plans for "what is next".
8. `SOTA-INITIATIVE.md` — DIRECTION only. Its §3 status block is FROZEN — do not read status from it.
<!-- END READ-ORDER -->

> **Every historical mandate (2026-06-10 authority grant · 06-17 rebuild · 06-20 "fix everything then build
> everything" · 06-28 post-audit · 06-29 tech-debt/de-monolith · v7) is now HISTORY. Their decisions-of-record
> are preserved in §0-C below. Do not re-read the old ladder to find work — the work is in STATUS.md.**
>
> **CURRENT MANDATE (Kevin, 2026-07-13):** *"fix / enhance and address every single one of these items you
> identified, don't miss anything. leave the truly manual ones for me to review later. the mob/boss art
> direction you should have a go at fixing / enhancing as you decide best."* → **campaign v8, work-of-record =
> the STATUS.md registry.** This de-gated **mob/boss art** (now full loop authority) and confirmed the
> **control-scheme Option-A** enhancements (which were already authorized on 06-28; the `[KEVIN-GATED]` tag on
> them was stale).

## 0-B. THE SOTA HARNESS LAYER (added 2026-07-13 — researched live, A1 sources)

Sources: Anthropic *Effective harnesses for long-running agents* + *Harness design for long-running application
development*; OpenAI *Harness engineering*; arXiv **2606.26300** *The Verification Horizon*.

**COMPRESSED 2026-08-07 under this file's own §8.** Items 1 and 7 were a second, weaker, enforcer-less copy of
rules that live in §3 WITH mechanisms — exactly the "escalating by REPETITION where they should have been
enforcing" disease §8 diagnoses, sitting 400 lines above the rule that forbids it. They are now pointers; a
pointer is not a restatement. **The numbering is preserved deliberately** — `§0-B.2` and `§0-B.6` are cited
elsewhere, and `doc-anchors.mjs` resolves compound cites permissively, so renumbering would have redirected
them silently while the push stayed green. What remains is the part §3 does NOT carry: rules with no
deterministic enforcer, which §8 rule 1 requires be marked advisory rather than stated emphatically.

1. **Mutation-prove every new gate → §3**, which states it with its enforcer (`mutation-proof-trailer.mjs`,
   first in `.githooks/pre-push`) and the `quest-rewards-gates` scar. ENFORCED.
2. **[ADVISORY — no mechanism] The worker may not judge its own completion.** (arXiv 2606.26300: an agent that
   verifies itself tampers with the verifier; a judge that is not the worker cut hacked solves 28.6% → 0.6%
   while *raising* clean solves 40% → 61%.) ⇒ milestone-scale units get an independent evaluator (a subagent,
   or Kevin) grading SURFACED EVIDENCE against the sprint's stated criteria. A self-reported "done" is not
   evidence. *No checker can exist for this — a loop cannot enforce its own recusal, which is the point.*
3. **Sprint contract BEFORE code** — "done" and *how it will be proven* stated first, naming the GATE and not
   just the steps. Enforced in practice by the per-milestone plan-doc discipline (`.agent/AGENTS.md` Method).
4. **[ADVISORY] Drive the product surface, not the implementation.** Real-input E2E outranks unit tests for
   "does it work"; unit tests sit too close to the code. `memory/STATUS.md §V2` is the campaign's spine.
5. **[ADVISORY] Context RESET > compaction for long work** — compaction preserves continuity but not a clean
   slate, so premature wrap-up persists. The durable artifacts (STATUS + ACTIVE_PLAN + CHANGELOG + git) ARE the
   handoff: prefer a fresh session with a clean read over grinding a deeply-compacted one.
6. **A MAP, not a manual** → `docs/superpowers/INDEX.md`. The corpus cannot all be read and a **stale doc is a
   live trap** (a stale charter line regenerated a week-sized dead proposal on 2026-07-13). Doc-gardening is a
   first-class loop duty. ENFORCED by `doc-currency.mjs`. *(The "142 docs / 44k lines" here was hand-typed,
   wrong, and had already propagated into two other files — deleted per §8 rule 2: a number is computed or it
   is deleted.)*
7. **Never weaken a gate to pass → §3** ("Never weaken to pass" + the test ratchet), which holds the full rule.
   ENFORCED.

## 0-C. Mission + hard frame (never overridden by taste)

- **🔭 v9 ACTIVE MISSION + EXPANDED AUTHORITY (Kevin, 2026-07-20/21) — supersedes the day-to-day work-selection
  below, does NOT override the hard frame:** a repo-wide, adversarially-verified review (source · tests/scripts/config
  · docs) produced **`docs/superpowers/HOLISTIC-REVIEW-2026-07-21.md` — 215 confirmed findings**, now the PRIMARY work
  queue (priority-laddered; `[AUTO]` safe-mechanical vs `[KEVIN]` owner-judgment). Kevin widened the mandate, verbatim:
  *"be AGGRESSIVE on unilateral enhancement, do as much autonomous decision as you decide best, make everything
  SOTA-shaped."* So the loop now APPLIES fixes AND enhancements autonomously (correctness/perf/a11y/quality/dead-code/
  comment+doc truth/polish/patterns) and MAKES taste calls, noting them veto-ably rather than blocking. The guardrails
  that keep aggressive *safe* remain binding: every change RED-first + mutation-proven + full suite green; atomic
  verified checkpoints (auditable, git-reversible, ONE unit/commit); NO silent reversal of a recorded Kevin decision
  (the "do NOT relitigate" set below); irreversible high-blast (hard-delete a REFERENCED file, force-push, external
  send, money/accounts/publishing, a NEW dependency) still gets care + usually Kevin; ARCHIVE-over-DELETE for docs.
  Progress dashboard: `docs/superpowers/LOOP-PROGRESS.html` (kept current) + its Artifact.
- **Vision** = `SOTA-INITIATIVE.md` v2 §1 (goal) + §2 (hard guardrails): SOTA in every aspect; visual/aesthetic taste is the
  HIGHEST bar (premium, distinctive, tasteful — never generic-voxel, never AI-slop); **web + iPad + mobile
  envelope** (clever > brute-force GPU); commercial-grade ambition (S4 multiplayer/monetization later).
- **Kevin's decisions-of-record — do NOT relitigate or silently reverse.** Stated in full in
  `docs/superpowers/DECISIONS.md` (read-order #6), NAMED here so the loop cannot forget one exists:
  **Ember-Frontier / Blight-Heart** world direction · the **grade LOCK REVERSAL** (glowier/warmer authorized) ·
  **control scheme Option A, F=cast / T=melee** · **bloom 0.65 is INTENDED** (supersedes the ≥0.85 spec) ·
  **grantXP full-heal is INTENDED** · **E2E = `@playwright/test`, separate from the visual gate** · **audience
  is BROAD** (Marcus is a user, not a ceiling) · **zh-CN is a toggle, EN default** · **controller-SEQUENTIAL
  for code** · **de-monolith is full loop authority**. Reversing one is genuinely-Kevin; affirming a
  sub-direction inside one is loop authority.
  *(Migrated 2026-08-07. They had been embedded in ~5.5 KB of mandate narrative — 06-17 rebuild, 06-20 "fix
  everything then build everything", 06-28 post-audit, 06-29 tech-debt — that §0-A already declares HISTORY.
  A file read EVERY iteration was carrying superseded process instructions as packaging for ten decisions.
  The narrative is in `memory/CHANGELOG.md` + git; nothing was reversed or reworded.)*
- The loop has **no terminal state** — SOTA is a direction. It runs until Kevin stops it.

## 1. Per-iteration procedure (the only loop shape)

1. **ORIENT (assume amnesia — context may have just compacted):**
   `git -C /Users/kz/Code/Crafty fetch && git -C /Users/kz/Code/Crafty status -sb && git log --oneline -8`
   (**`-sb`, never `-s`**: plain `-s` suppresses the `## main...origin/main [behind N]` line, so you cannot
   see you are stale — the other two docs already mandate `-sb`, and this step is read EVERY iteration)
   → read `memory/ACTIVE_PLAN.md`
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
   N-state visual gate (`ls frontend/tests/visual/baseline/*.png | wc -l` — never hardcode it; this said 20),
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
   god-files dissolved; `GameScene.jsx` is DONE — 299 LOC as of 2026-08-07, not the "~914" this line claimed.
   Read the live ≥900-LOC set from the generated MEASURED block in `.agent/AGENTS.md`; there are more than the
   one this sentence implies, and `Components.jsx` is PARKED iter-175 — risky
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

- **⛔ MUTATION-PROOF EVERY NEW GATE (added 2026-07-13 — the hardest lesson this project has learned).**
  **[MECH: `frontend/scripts/ci/mutation-proof-trailer.mjs`, run first in `.githooks/pre-push`]** — a commit
  that ADDS a file under `tests/gates/` or `scripts/ci/` — **or REWRITES an existing one's ASSERTIONS**
  (widened 2026-08-07) — must carry a trailer stating the proof:
  `Mutation-Proof: <what you broke> -> <gate> went RED (<message>)`. Until 2026-08-03 this rule was stated
  repeatedly across two documents with **zero checkers**, which is precisely why so many gate files still
  read source text without importing the module they guard. **Add-only was a hole**: replacing a vacuous gate
  with another vacuous one is an EDIT and demanded nothing, which is where this rule has actually failed
  (`91530be`, `03c4297`). Over the 120 commits before the widening it caught five more. The anti-noise
  scoping the add-only rule was protecting is preserved by targeting ASSERTION-bearing hunks only: a rename
  sweep, an import reorder or a comment fix stays silent, because a trailer demanded for every edit during a
  sweep is noise, and noise is how a check gets switched off. The trailer
  cannot be verified true by machine — it forces the claim into a place a reviewer can read, which is the
  only thing that has ever worked here.
  A gate that greps SOURCE TEXT is **not a gate**. Before a gate counts: **break the behavior it claims to
  guard and watch it go RED**, then revert. If you cannot make it go red, it is decoration — delete it or
  replace it. A gate that is **green on day one** against unfixed code is a **rubber stamp**, and the slice that
  shipped it is VOID.
  *Empirical (past tense — do not read this as the current state of the file):* `quest-rewards-gates.test.**jsx**`
  ONCE asserted `expect(qs).toMatch(/store\.addCoins\(r\.coins\)/)`; it proved the line EXISTED while the line
  never RAN on a 2nd claim, so it sat green through a live bug that stole quest rewards and corrupted the save.
  **It was rewritten at `926751e` (2026-07-13) and is now mutation-proven** — the `addCoins` strings left in it
  are COMMENTS quoting its dead self, which is exactly the shape that makes a grep-based re-audit misfire.
  Still-live example: `bundle-split-gates.test.js` greps `vite.config.js` for `manualChunks` and asserts **zero
  bytes** against a ~4.5MB bundle. **Assume a gate is vacuous until you have seen it fail.**
- **Never weaken to pass.** No widening a timeout, loosening a threshold, narrowing a test's scope, or
  `.skip`-ing to get green. If a gate is genuinely wrong, change it **deliberately, with written justification
  in the commit body** — never silently. (This is the classic reward-hack: *delete the failing test to turn CI
  green.*)
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
  dependency / test substrate / install**; ear / taste sign-off (audio mix, final colour/foam taste).
  > **⚠️ CORRECTED 2026-07-13 (this line was a LIVE TRAP).** It used to claim `@react-three/test-renderer` was
  > "approved + landed (`0f8cad9`)". **It was REMOVED as unused by `8b6e3a44`** — verified: absent from
  > `package.json`, imported nowhere. That single stale sentence caused an agent to propose a week-sized
  > "wire the installed E2E substrates" campaign for a package that does not exist. **Current truth:**
  > `@playwright/test` **IS** installed and wired (`playwright.config.js`, `npm run test:e2e`; count them with `ls frontend/tests/e2e/*.spec.js | wc -l`) — but
  > those specs drive the **store**, not real input (see STATUS §V2). The zero-dep input-driven E2E + state-hash
  > work needs **no ask** and is full loop authority.

## 5. Process deltas vs the pre-loop era (so old docs don't confuse the loop)

- The "Kevin HARD GATE before implementation" in older specs/CLAUDE.md is **replaced by the self-gate**: a
  grounded design workflow (seam-map vs LIVE code + research + adversarial critique) whose output spec is
  committed BEFORE building, + the §4 discipline. Kevin reviews ASYNC via KEVIN-REVIEW-BATCH + CHANGELOG.
- Kevin-decision backlog items in old docs: the loop decides them on the recorded evidence and proceeds.
  **The decision goes in `docs/superpowers/DECISIONS.md`** (the OUTBOX), not only in KEVIN-REVIEW-BATCH —
  the batch is append-only and cannot say what has been settled; it reached ~146 entries with 6 marked
  resolved, none in six weeks. Exceptions: the §4 genuinely-Kevin list.
- The master plan itself may be edited (status banners, re-sequencing, adding named passes) — keep §1–§2
  vision intact, log every edit in CHANGELOG.

*(The capture-mode-hid-real-lighting scar moved to `memory/STATUS.md` §5 with the ANTI-REDO it belongs
with. It is a do-not-repeat, not a process delta.)*

## 6. SOTA-experience backlog — MOVED, not deleted

**The backlog lives in `memory/STATUS.md` §2 (D Art · E Gameplay depth · F Perf + polish). Go there.**

This section used to carry a candidate pool of audio / game-feel / visual / UX / i18n ideas, and its own
first line had declared it SUPERSEDED since 2026-06-15. A backlog in the constitution is the wrong shape by
this charter's own doc-role rule — STATUS.md owns the registry, and two copies of a work list mean one of
them is quietly wrong. The still-live items were already represented in STATUS §2; the one thing that was
NOT is the ANTI-REDO warning (ToneMapping is already NEUTRAL, `MOOD_GRADE` already ships), which moved to
STATUS §5 "Anti-patterns this project has already paid for" — the section for exactly that.

## 6.4 ⚠️ BROWSER / TEST-PROCESS HYGIENE — anything you launch, you kill (Kevin, 2026-07-13)

**This degrades Kevin's actual machine. Treat it as a hard rule, not housekeeping.**

Headless Chromium and vite dev servers spawned by capture / e2e / ad-hoc probes **do NOT die when the script
throws or the run is interrupted.** On 2026-07-13 one session leaked **7 vite servers + a headless Chromium
spinning at 622% CPU (six cores)** → machine load average **25** → the visual-capture gate timed out. That
presented as a *"flaky gate"*. It was **self-inflicted**, and it wasted a real debugging cycle.

- Every ad-hoc Playwright/Puppeteer probe closes its browser in a **`finally`** (a throw must still close it).
- **Spawn vite `detached` and SIGKILL the whole process GROUP (`process.kill(-server.pid, 'SIGKILL')`) in the
  finally — a plain `server.kill()` only reaps the `npx` wrapper and ORPHANS the forked vite child holding the
  port (2026-07-20; the repo-wide probe-hygiene bug class — ocean-probe + capture fixed, ~25 more flagged in the
  holistic-review queue as `hygiene`).**
- **Guard `browser.close()` with a timeout + a force-kill of the browser process** (race `close()` against ~8s,
  cleared on settle, then `browser.process().kill('SIGKILL')`). A GPU-context-lost / crashed headless Chrome
  leaves `close()` hanging on an unanswered CDP command forever — this WAS the long-blamed "capture hangs at the
  title-mascot step" (it was `close()`, not the render; the fix at `75191ef` also made the ungated title-mascot
  state NON-FATAL, so the harness runs to a clean end and the visual re-baseline is unblocked).
- Never leave a hand-started dev server running — prefer Playwright's `webServer` (self-managing). If you start
  one by hand, kill it in the same turn.
- Delete throwaway probe scripts (`rm -f frontend/dbg-*.mjs`); never commit them.
- **Sweep with `sh frontend/scripts/dev/kill-test-procs.sh`** — it only kills THIS repo's vite + Playwright's
  own cached browsers, never a user browser.
- **When the box is slow, check for leaks BEFORE blaming a gate.** `uptime` + `ps aux | grep ms-playwright`.
  A leaked browser is the most common cause of a "mystery" capture timeout, and the capture harness is
  load-sensitive by design.
- **cmux PREVIEW TABS are the OTHER half of the leak (Kevin, 2026-07-14).** cmux opens a browser preview
  surface per localhost port; **the tab outlives the process you kill**, so `kill-test-procs.sh` alone leaves
  husks (30+ `localhost:*` tabs piled up across sessions). Prevention: E2E uses ONE managed port (4179
  `--strictPort`); capture uses 4178; **never hand-start vite on an ad-hoc port** for a probe. Clear husks
  with `sh frontend/scripts/dev/close-preview-tabs.sh` (LISTS by default). **⚠️ FOOTGUN: never touch
  `cmux close-surface` by hand — an unresolved `--surface` falls back to closing `$CMUX_SURFACE_ID`, YOUR OWN
  tab. A loop iteration self-decapitated its session this way.** The helper is the only sanctioned path
  (SELF-excluded by UUID + fallback overridden + aborts if SELF vanishes). **The loop must NEVER auto-run
  `--close`** — session-close may run the LIST (report only); a human runs `--close`.

## 6.5 SESSION-CLOSE RITUAL — fire at the CONTEXT WATERMARK (Kevin, 2026-07-13)

> **Kevin, verbatim:** *"get Crafty's remote github surfaces updated too near the end of every session when you
> hit the context-watermark."*

**Trigger:** the context watermark (the harness nudges at **85 / 90 / 94%** of the auto-compact window). Also
fire it on any deliberate `/compact`, or when Kevin says "wrap up". **Do not wait to be asked.**

**The ritual (in order — each is cheap, and skipping one is how state rots):**
0. **Kill your leaked test processes** — `sh frontend/scripts/dev/kill-test-procs.sh` (§6.4). Never end a
   session leaving a headless browser or dev server burning Kevin's CPU. Then **LIST orphan cmux preview
   tabs** — `sh frontend/scripts/dev/close-preview-tabs.sh` (list only; report the count — do NOT auto-close,
   §6.4 footgun).
1. **Green the tree.** Finish-or-revert the in-flight unit. Never close a session on an unverified half-state.
2. **Local surfaces:** `memory/STATUS.md` (registry ticked: what closed, what opened) → `memory/ACTIVE_PLAN.md`
   (the NEXT unit, so a cold session resumes in one read) → `memory/CHANGELOG.md` (what shipped) →
   plan-doc banners (`✅ SHIPPED`).
2b. **PUBLISHED surfaces — the two that drift silently, because nothing rendered locally shows their staleness:**
   - `docs/superpowers/LOOP-PROGRESS.html` — the kernel calls this a session-close obligation and it had gone
     **17 commits stale** by 2026-08-07 (last touched `1b776ca`). It has NO gate. Refresh it here or it rots.
   - `docs/superpowers/era-review.html` → its published Artifact. This one DOES have a gate
     (`node frontend/scripts/ci/artifact-currency.mjs`, informational under 30 commits, hard fail above).
     **Update IN PLACE via the URL in `.artifact-sync.json`, then `--sync`.** A fresh publish mints a new URL
     and strands the bookmark Kevin already has.
3. **REMOTE / GitHub surfaces** *(this is the step that kept getting skipped)*:
   - **README.md** — is it still TRUE? (It went ~6 weeks stale once, with a **`localhost:3000` "Live Demo"
     link** shipped to the public.) Features, controls, and the demo URL must match reality.
   - **Repo description + topics** (`gh repo edit`) — must describe the game as it *is*.
   - **CI `success`** — confirmed with `gh run list --workflow=ci.yml --branch main`, NEVER from the README
     badge. CI has existed since 2026-07-13, and a job that blows its own `timeout-minutes` renders as
     `cancelled`, which the badge does not show as failure. Read the conclusion string, not the image.
   - `git push` — **the tree must be pushed, not just committed.** Vercel auto-deploys from `main`.
4. **Durable memory:** mark-truth any operator-state change; snapshot the native-memory dir.
5. **Re-arm** the loop with the kernel (`LOOP-KERNEL-PROMPT.md`) so the next firing orients from disk.

**Rule:** a session that ends without step 3 has left the project's **public face** lying about it. That is a
first-class failure, not a nicety.

## 7. Compaction + crash resilience (why this survives anything)

- The kernel `/loop` prompt re-arrives VERBATIM every firing — it carries orientation + the pointer here.
- Every iteration ends committed+pushed with ACTIVE_PLAN updated → a fresh context (or fresh machine)
  recovers from git + the 4-piece alone. Mid-iteration compaction recovers via step 1-2 (ORIENT/STABILIZE).
- CLAUDE.md carries a compaction-preserve note (the compactor reads it).
- If THIS file is missing at orient-time, restore it from git history before any other work.
- **CI state does not survive in git and is not in this file.** Recover it with the command in the kernel's
  ORIENT step 0 (`gh run list`), every firing. Nothing on disk can tell you the tree is red on the remote.

## 8. Rule hygiene (added 2026-08-02 — the meta-rule that keeps this document honest)

A 16-agent audit of the loop's commits found one clean split, and it was **mechanism, not diligence**.
(Denominator: `git rev-list --count --since=2026-06-10 --until=2026-08-03 HEAD`. This paragraph used to say
"996 loop commits" and, four lines later, "in 999 commits" — one denominator, two numbers, neither
reconstructible, sitting directly above rule 2 below.)

- Every rule checkable from an artifact the loop was already producing — the diff, the commit message, the
  process table — was obeyed at essentially 100%: zero AI footers, zero doc deletions, zero skipped tests,
  one justified eslint-disable, one commit over 25 files.
- Every rule requiring a SEPARATE experiment whose only consumer was this document's own prose — mutation-prove,
  independent evaluation, "CI green", STATUS currency, the priority ladder — was obeyed erratically or never.
  "MUTATION-PROOF EVERY NEW GATE" was stated repeatedly across two files with **zero** checkers, and appeared
  in 0 of 479 June code commits. **It has an enforcer now** — `.githooks/pre-push:73`,
  `mutation-proof-trailer.mjs`, run FIRST, with the `[MECH:]` pointer in §3. Count the proofs, do not recall
  them: `git log --format=%b | grep -c '^Mutation-Proof:'` (28 on 2026-08-07).
- **⚠️ The counterexample this section used to hide, because it is evidence AGAINST the thesis above:**
  "zero `.state/` writes" was filed under mechanically-checkable. **There is no mechanism** — `.state/` is not
  in `.gitignore`, no hook or CI step touches it, and it is tracked (a `git status -sb` right now shows
  `.state/` files modified and untracked). That rule is obeyed by DILIGENCE alone, and six reviewers missed it.
  Keep it visible: the split is real but it is not clean, and a thesis that quietly drops its counterexample is
  the same failure as a gate that skips its hard inputs.

So the documents had been escalating by REPETITION where they should have been enforcing. Three rules follow,
and unlike the rules they govern, all three are gradeable by grep:

1. **A rule names its enforcer, or it is deleted.** When adding a rule here, name the deterministic check —
   a hook, a CI step, a test, a script. If none is possible, say so explicitly and accept that the rule is
   advisory. An unenforceable rule stated emphatically is worse than no rule: it manufactures the belief that
   the behaviour is covered.
2. **A number is computed, or it is deleted.** No hand-typed counts in any governing document. A count appears
   as the command that regenerates it, or as a dated past-tense scar ("was 88 runs on 2026-07-27"). Every
   hand-typed number in these docs rotted: `.agent/AGENTS.md` claimed "~14.4k LOC / ~31 files" against an
   actual 29.5k / 264 (measured 2026-08-02) — already false by 1.8x the day it was written. That block is GENERATED now.
3. **A claim about state outside the working tree is emitted by the command that observed it, in the same
   turn, or it is a fabrication** — regardless of whether it happens to be true. This is the generative cause
   of both the CI blindness and the "CI green" written into CHANGELOG on a day CI had never once passed.

**Corollary — never re-state a rule instead of enforcing it.** If a rule is being violated, the response is a
checker or a deletion, never a fourth copy in bolder type. If you catch yourself adding emphasis to an existing
rule, that is the signal that it needs a mechanism.
