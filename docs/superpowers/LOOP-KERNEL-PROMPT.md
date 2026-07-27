# Crafty Autonomous Build Loop — KERNEL PROMPT (v9, 2026-07-21 · "Holistic SOTA")

> **Usage (Kevin):** open a FRESH Claude Code session in `/Users/kz/Code/Crafty` (fresh > compacted — a context
> RESET beats a deep compaction; the loop re-orients from disk either way), then type `/loop ` followed by the
> ENTIRE block below.
> **This file is the DURABLE copy of the live `/loop` ScheduleWakeup prompt** — a cold / git-only recovery
> reconstructs the loop from HERE, so a stale copy silently re-arms the wrong mode. Keep it in sync with
> `LOOP-CHARTER.md` (the constitution) whenever the MODE / ORIENT / gates / ask-gates change.
>
> **Version history:** v2 steady-state-hold · v3 mega-directive · v4 SOTA rebuild · v5 post-audit fix ·
> v6 tech-debt→de-monolith · v7 weather+spell-VFX · v8 (2026-07-13) drive the STATUS.md registry ·
> **v9 (2026-07-21) = drive the HOLISTIC-REVIEW verified-findings queue under EXPANDED aggressive-SOTA authority.**
> **The big change in v9:** a repo-wide, adversarially-verified review (source + tests/scripts/config + docs) produced
> `docs/superpowers/HOLISTIC-REVIEW-2026-07-21.md` — **215 confirmed findings** that are now the PRIMARY work queue.
> Kevin widened the mandate: *aggressive unilateral enhancement, make everything SOTA-shaped.* Volatile per-slice
> state is still NOT inlined here — the kernel points at the work-of-record docs.

---

CRAFTY /loop kernel — v9 "HOLISTIC SOTA". Autonomous build loop, full + EXPANDED authority per the charter.

EXPANDED AUTHORITY (Kevin, 2026-07-20): APPLY fixes AND enhancements autonomously — correctness, perf, a11y, code
quality, dead-code, comment/doc truth, polish, better patterns — and MAKE taste calls, noting them veto-ably rather
than blocking. GUARDRAILS still binding (they make "aggressive" safe, not reckless): every change RED-first +
mutation-proven + full suite green; atomic verified checkpoints (auditable, git-reversible, ONE coherent unit per
commit); do NOT silently reverse a RECORDED Kevin decision (world-design hybrid · CPU-ocean fork · F=cast/T=melee ·
bloom 0.65 · Ember-Frontier/Blight-Heart · affixes kept · broad audience); irreversible high-blast (hard-delete a
REFERENCED file, force-push, external send, money/accounts/publishing, a NEW dependency) still gets care + usually
Kevin. Prefer ARCHIVE (reversible) over DELETE.

ORIENT EVERY ITERATION (assume amnesia — the context may have just compacted or reset):
`cd /Users/kz/Code/Crafty && git fetch && git status -s && git log --oneline -8`
Then READ, IN THIS ORDER — do not skip, do not go doc-mining elsewhere for "what's next":
1. **`memory/ACTIVE_PLAN.md`** — the 🔭 SUPER-CAMPAIGN block (top) is the live cursor + phase.
2. **`docs/superpowers/HOLISTIC-REVIEW-2026-07-21.md`** — THE PRIMARY QUEUE: 215 verified findings, priority-laddered,
   each tagged `[AUTO]` (safe mechanical) / `[KEVIN]` (owner-judgment) + the by-file execution batches.
   ⚠️ **This markdown is now the ONLY copy.** The machine JSON `scratchpad/findings.json` and the three
   `scratchpad/*-result.json` it was regenerable from all lived in a SESSION-SCOPED tmp scratchpad and are
   GONE (verified absent 2026-07-27). Do not go looking for them; do not treat their absence as a blocker.
3. **`memory/STATUS.md`** — the SECONDARY queue: gameplay/content/UX registry items the CODE review didn't cover
   (R*/C*/X*/D*/E/F/G). VERIFY each is still open before working it — much of the older A-bis/V1 work is DRAINED.
4. **`docs/superpowers/LOOP-CHARTER.md`** — the constitution (esp. **§0-B SOTA harness layer** + **§3 gates**).
5. `docs/superpowers/INDEX.md` — the doc map, only if you need a doc. A stale doc is a LIVE TRAP; never mine old
   plans/audits for "what's next" — the work is in the queues above.
Re-load the coding domain overlay if this is a fresh post-compact session.

REPO (two-level): ROOT `/Users/kz/Code/Crafty` (docs + memory + master plan) · APP `/Users/kz/Code/Crafty/frontend`
(run npm/tests HERE). Absolute paths always. NEVER assert file-absence from a relative ls/find.

MISSION: drive the **HOLISTIC-REVIEW-2026-07-21.md** queue to zero in its priority ladder —
**security → bugs → test-bugs → script/probe hygiene → config-drift → dead-code → comment-lies → doc-drift →
test-vacuity (seam-extract) → coverage-gaps → perf → a11y → inconsistency → enhancements** — preferring the by-file
BATCHES (fix every finding in a file together = one commit). Then execute the **docs reorg** (Wave-1 ~83 autonomous
plan-archives via `git mv` → `docs/archive/2026-Q2/…`; Wave-2 ~24 owner-gated — the 4 lint-CRITICAL move ONLY in a
commit that also drift-fixes the citing LIVE doc; ARCHIVE-not-delete). Then the STATUS §2 secondary queue. Ship ONE
verified unit per iteration; keep `docs/superpowers/LOOP-PROGRESS.html` current (the progress dashboard). Route pure
taste / recorded-decision reversals to `KEVIN-REVIEW-BATCH.md`. Never end the loop yourself.

THE FIVE RULES THAT MATTER MOST (each one is a scar):
1. **⛔ MUTATION-PROVE EVERY GATE.** A gate that greps SOURCE TEXT is NOT a gate. Break the behavior → the gate MUST
   go red → **revert via cp-backup, NEVER `git checkout <file>`** (it nukes untracked / reverts tracked). A new gate
   green on day one against unfixed code is a RUBBER STAMP; the slice is VOID. (`quest-rewards-gates` asserted a line
   EXISTED while it never RAN — green through a live save-corrupting bug.)
2. **VERIFY BEFORE ASSERT.** Agent / workflow / doc / registry claims are HYPOTHESES (T3) — grep the cited
   `file:line` on live HEAD before acting. A finding labeled "vacuous" can be 4/5 legit (survival-quests was). Run
   modules TOGETHER; check the BUILD/console before blaming "env" (a `{/* */}` after `return (` = esbuild error →
   boot-timeout, misdiagnosed as a load hang). **Open the file. Open the image.**
3. **A GREEN HEADLESS GATE PROVES CODE-PRESENCE, NOT LIVED RESULT.** Drive the real surface (E2E with REAL input · a
   live probe · LOOK at the rendered frame) or route to Kevin, before claiming a render/feel/audio result done.
4. **NEVER WEAKEN TO PASS.** No deleting/skipping/scope-narrowing a test; no widening a timeout; no loosening a
   threshold; no silencing a lint (incl. doc-currency — a doc that writes a DELETED file's path as if live is a REAL
   stale claim: state it REMOVED on the path's line, don't suppress). Fix a genuinely-wrong gate with justification.
5. **THE WORKER MAY NOT JUDGE ITS OWN COMPLETION.** For milestone-scale units an independent evaluator (a subagent,
   adversarial verify, or Kevin) grades against stated criteria. The 215-finding queue is itself adversarially verified.

DISCIPLINE (every code tick): TDD red-first; AST-safe edits only on .js/.jsx; seam-extraction (move buggy/vacuous-
gated logic to a pure injectable module, test purely, mutation-prove, wire); Game-Loop-Isolation (no reactive state
in useFrame — transient refs / `.getState()` / seeded); capture-determinism (NO Math.random/clock in capture — seeded
+ `isCaptureMode()`-gated; static geometry at module load); **NO mid-combat RE-MESH (a HARD P4 veto)**; bloom 0.65
INTENDED; zero-emoji in `src/` (use `\u{}` escapes); the store owns persisted state; no AI footer on commits; no
`git add -A`; `.state/` untouched; `git commit -F -` heredoc. Full suite + eslint + build + knip + pre-push each push.
BUILD-FIRST on any JSX/structure change. Capture-verify EVERY render-affecting slice (`npm run visual:capture` — the
harness is FIXED as of `75191ef`, runs ~5min to a clean end; **Read the frame with your own eyes**), re-baseline
output → Kevin sign-off.

TASTE BOUNDS: the coherence pillars **P0–P5** (`specs/crafty-coherence-pillars.md`; summarized in STATUS §4). **The
only HARD vetoes are P4's two invariants: no mid-combat re-mesh; input via intent-abstraction, not pointer-lock.**
Accessibility never vetoes depth. Reference-lock before any look-bearing work; judge IN-WORLD on the real grade.

⚠️ BROWSER / TEST-PROCESS HYGIENE (charter §6.4 — hard rule): **anything you launch, you kill.** Headless Chromium +
vite from capture/e2e/probes do NOT die on a throw. Every ad-hoc probe closes its browser in a `finally`; **spawn
vite `detached` and SIGKILL the whole process GROUP (`process.kill(-server.pid)`) — a plain `server.kill()` only reaps
the npx wrapper and ORPHANS the forked vite child holding the port** (the repo-wide probe-hygiene bug class; ocean-probe
+ capture fixed, ~25 more in the queue). Guard `browser.close()` with a timeout + force-kill (a GPU-context-lost Chrome
hangs close() forever — the old "capture title-mascot hang"). Use ONE managed port (E2E 4179, capture 4178); never
hand-start vite on an ad-hoc one-off port. Sweep `sh frontend/scripts/dev/kill-test-procs.sh` after; when the box is
slow, check for leaks BEFORE blaming a gate. cmux opens a preview tab per localhost port that OUTLIVES the killed
process → `sh frontend/scripts/dev/close-preview-tabs.sh` LISTS husks; **NEVER hand-run `cmux close-surface` or
`--close` in the loop** (an unresolved `--surface` closes YOUR OWN tab — a loop self-decapitated this way). List only.

SESSION-CLOSE (charter §6.5 — fires at the CONTEXT WATERMARK, 85/90/94%, unprompted): kill leaked test procs → LIST
husks → green the tree → update ACTIVE_PLAN + STATUS + CHANGELOG + LOOP-PROGRESS.html → **refresh the REMOTE GitHub
surfaces (README truth · repo description · CI badge) and PUSH** → mark-truth → re-arm. A session that ends without the
remote step has left the project's public face lying about it.

STILL GENUINELY KEVIN (surface to `KEVIN-REVIEW-BATCH.md`; never block on it): the holistic PLAYTEST (his eye + ear —
spell look, movement feel, storm, audio mix, real-device touch) · S4 multiplayer + monetization scope (the loop will
NOT start netcode or payments) · final taste sign-offs incl. visual re-baselines + water aesthetic · real-device runs ·
anything spending money / creating accounts / publishing externally · adding any NEW dev dependency · the recorded
design calls (chest-mining, damage-lockout, camera-shake feel, 3D mob AI).
SETTLED (do NOT relitigate): F=cast / T=melee · bloom 0.65 · grantXP full-heal · affixes KEPT · Ember-Frontier +
Blight-Heart · audience is BROAD (Marcus is a user, not a ceiling) · world-design HYBRID · CPU-ocean fork.

CONTINUE: while committable units remain (the 215-finding queue is DEEP — this is an ACTIVE build queue, not a hold).
AWAIT + INTEGRATE any in-flight background Workflow instead of idle-spinning. ~20–30min heartbeat ONLY if genuinely
blocked on Kevin. Never end the loop yourself.
