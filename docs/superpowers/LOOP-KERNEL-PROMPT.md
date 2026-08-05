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
`cd /Users/kz/Code/Crafty && git fetch && git status -sb && git log --oneline -8`
(`-sb`, not `-s`: plain `-s` suppresses the `## main...origin/main [behind N]` line, so you cannot see you are stale.)

**0. STATE YOU CANNOT SEE FROM DISK — compute it BEFORE reading any doc.** Run this and print the raw output:
   `gh run list --workflow=ci.yml --branch main --limit 6 --json headSha,status,conclusion,createdAt`
   **CI IS PART OF THE TREE. A push that leaves CI non-`success` is a RED TREE and outranks every queue item.**
   Green means exactly one thing: `"conclusion":"success"` on the newest COMPLETED run at a sha that is an
   ancestor of local HEAD. **`cancelled` · `timed_out` · `skipped` · `neutral` · `stale` · `action_required` ·
   "no run found" · a `gh` auth failure are ALL NOT-GREEN.** Never write a check — or a sentence — of the form
   "not failure" or "no red X": GitHub reports a job that blows its own `timeout-minutes` as `cancelled`,
   byte-identical to a run superseded by `cancel-in-progress`, and that single ambiguity IS the whole failure.
   If the newest completed run is not `success`, read it before anything else: `gh run view --log-failed <id>`.
   *Scar (2026-07-13 → 07-27):* ci.yml concluded `success` **0 times in its first 88 runs across 14 days**
   (86 cancelled, 2 failure) — the Playwright job exceeded its 25-min budget on every single run — and no
   document anywhere told anyone to look. In that window the loop wrote "CI green" into CHANGELOG.md on a day
   the entire CI history was one failure and a pile of cancellations. **Confirm a `success` with your own eyes
   before believing any claim that CI is fixed, including this one.**

**THE GENERAL RULE THIS IS AN INSTANCE OF:** a claim about any system outside this working tree — CI, the
deploy, an npm advisory, a GitHub API, an upstream release — is only true if the command that OBSERVED it ran
in the same turn you assert it. Not remembered, not inferred from a doc, not carried over from earlier in the
session. No observation, no claim.

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
5. **`docs/superpowers/DECISIONS.md`** — the decision RECORD (the outbox). `KEVIN-REVIEW-BATCH.md` is the
   INBOX and is append-only, so it cannot tell you what has been settled — it accumulated ~146 entries with 6
   marked resolved. Before re-raising anything, or reversing anything, check here. A reversal is a NEW dated
   entry naming the one it supersedes; never a silent edit.
6. `docs/superpowers/INDEX.md` — the doc map, only if you need a doc. A stale doc is a LIVE TRAP; never mine old
   plans/audits for "what's next" — the work is in the queues above.
Re-load the coding domain overlay if this is a fresh post-compact session.

REPO (two-level): ROOT `/Users/kz/Code/Crafty` (docs + memory + master plan) · APP `/Users/kz/Code/Crafty/frontend`
(run npm/tests HERE). Absolute paths always. NEVER assert file-absence from a relative ls/find.

MISSION: drive the **HOLISTIC-REVIEW-2026-07-21.md** queue to zero in its priority ladder —
**security → bugs → test-bugs → script/probe hygiene → config-drift → dead-code → comment-lies → doc-drift →
test-vacuity (seam-extract) → coverage-gaps → perf → a11y → inconsistency → enhancements** — preferring the by-file
BATCHES (fix every finding in a file together = one commit). ~~Then execute the **docs reorg**~~ **(DONE — `docs/archive/` exists and
`plans/` went 100 → 35 files. Do NOT re-run it. This line sent cold-start agents at finished work, which is
exactly the "a stale doc is a LIVE TRAP" failure warned about below.)** Then the STATUS §2 secondary queue —
note **A-bis (all 8 seams) CLOSED 2026-08-05**; verify any registry line against live code before working
OR repeating it (two were found describing code that did not exist). Ship ONE
verified unit per iteration; **keep `docs/superpowers/LOOP-PROGRESS.html` current — a SESSION-CLOSE
obligation, not a nicety.** It went 25 commits stale in Aug 2026 while STATUS and CHANGELOG stayed
immaculate, and the published era-review artifact went 9 days / 99 commits stale still leading with
"CI 0/88" — false for two days. Kevin had to ask. **The surface he READS is part of the deliverable**; a
dashboard asserting a state it no longer has is the same defect as a gate reporting PASS over input it never
examined. Update an artifact IN PLACE by passing its URL, or a fresh publish mints a new URL and strands the
bookmarked one. Route pure
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
5. **THE WORKER MAY NOT JUDGE ITS OWN COMPLETION — NOR ITS OWN DISMISSALS, NOR ITS OWN PROGRESS.**
   **(a) COMPLETION.** For milestone-scale units an independent evaluator grades against pre-stated criteria.
   Independent means it starts from ZERO context, reads ONLY the committed diff plus the written criteria — never
   `memory/`, never the plan's reasoning, never this session — and is prompted to REFUTE, not approve. A subagent
   spawned from this session shares your blind spots; treat its approval as weaker evidence than its objections.
   **A model may BLOCK. Only a command may PASS.**
   **(b) DISMISSALS.** *A queue whose findings were adversarially VERIFIED tells you nothing about whether their
   DISPOSITION was.* The old closing sentence here ("the 215-finding queue is itself adversarially verified") read
   verified PROVENANCE as verified DISPOSITION, and that is the clause that licensed self-dismissal. You may NOT
   close a finding "false positive / already correct / non-issue" on your own authority: mark it
   `⊘ DISMISSED — <reason> — \`<command proving it>\``. **A dismissal is a claim; claims are RULE 2.** *Scar:* the
   loop's vacuity pass flagged 32 gates, strengthened 3 and dismissed 29 itself; an auditor later mutation-proved
   **7 of the dismissed stay green when the code they guard is deleted.**
   **(c) PROGRESS.** A category is not done until every item carries its own marker IN THE QUEUE DOC, written in the
   SAME commit as the fix: `▣✓ <sha>` done · `▢` open · `⊘ DISMISSED …`. Never write "category X COMPLETE" until
   the marked count equals the finding count. **[MECH: `frontend/scripts/ci/queue-ledger.mjs`, in pre-push]** — a
   RATCHET on the unmarked count (may fall, never rise) plus a hard fail on any dismissal with no proof command.
   *Scar:* the queue reached ~154-of-215 claimed-fixed with **zero** markers in 528 lines, so remaining work existed
   only as prose — which is how test-bug (13), config-drift (3), perf (2) and a11y (1) reached 2026-07-27 with
   nothing started and nobody noticing.

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
