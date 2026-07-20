# Crafty Autonomous Build Loop — KERNEL PROMPT (v8, 2026-07-13 · "Playable Truth + Depth")

> **Usage (Kevin):** open a FRESH Claude Code session in `/Users/kz/Code/Crafty` (fresh > compacted — a context
> RESET beats a deep compaction; the loop re-orients from disk either way), then type `/loop ` followed by the
> ENTIRE block below.
> **This file is the DURABLE copy of the live `/loop` ScheduleWakeup prompt** — a cold / git-only recovery
> reconstructs the loop from HERE, so a stale copy silently re-arms the wrong mode. Keep it in sync with
> `LOOP-CHARTER.md` (the constitution) whenever the MODE / ORIENT / gates / ask-gates change.
>
> **Version history:** v2 steady-state-hold · v3 mega-directive · v4 SOTA rebuild · v5 post-audit fix ·
> v6 tech-debt→de-monolith · v7 weather+spell-VFX ·
> **v8 (2026-07-13) = drive the STATUS.md registry ("fix/enhance everything, don't miss anything" — Kevin).**
> **The big change in v8: volatile state is NO LONGER inlined here.** The kernel points at `memory/STATUS.md`;
> that file is the work-of-record. This is deliberate — inlined per-slice state is exactly what drifted and
> scattered across six competing surfaces.

---

CRAFTY /loop kernel — v8 "PLAYABLE TRUTH + DEPTH". Autonomous build loop, full authority per the charter.

ORIENT EVERY ITERATION (assume amnesia — the context may have just compacted or reset):
`cd /Users/kz/Code/Crafty && git fetch && git status -s && git log --oneline -8`
Then READ, IN THIS ORDER — this is the whole point of v8; do not skip it, and do not go doc-mining elsewhere:
1. **`memory/STATUS.md`** — THE source of truth: where we are, the open-work REGISTRY, what's next.
2. **`memory/ACTIVE_PLAN.md`** — the live cursor (the ONE unit in flight).
3. **`docs/superpowers/LOOP-CHARTER.md`** — the constitution (esp. **§0-B the SOTA harness layer** + **§3 gates**).
4. `docs/superpowers/INDEX.md` — the map, if and only if you need a doc. **142 docs / 44k lines; a stale doc is a
   LIVE TRAP** (one stale charter line regenerated a week-sized dead proposal). Never mine old plans/audits for
   "what's next" — the work is in STATUS.md.
Re-load the coding domain overlay if this is a fresh post-compact session.

REPO (two-level): ROOT `/Users/kz/Code/Crafty` (docs + memory + master plan) · APP `/Users/kz/Code/Crafty/frontend`
(run npm/tests HERE). Absolute paths always. NEVER assert file-absence from a relative ls/find.

MISSION: drive the **`memory/STATUS.md` §2 REGISTRY** to zero, in the §3 order:
**R1 (the live quest reward-theft bug) → V1/V6 (vacuous-gate audit + CI) → V2/V3 (input-driven E2E) →
C1 (control-scheme Option-A) → X1 (touch Aspect wheel — a HARD P4 pillar violation) → D1 (the boss art
emergency) → E (depth levers) → F/G (perf, i18n unblock, doc-currency).**
Kevin: *"fix / enhance and address every single one of these items, don't miss anything. leave the truly manual
ones for me to review later."* Ship ONE verified unit per iteration. Never end the loop yourself.

THE FIVE RULES THAT MATTER MOST (each one is a scar):
1. **⛔ MUTATION-PROVE EVERY GATE.** A gate that greps SOURCE TEXT is NOT a gate. Break the behavior → the gate
   MUST go red → revert. A new gate that is green on day one against unfixed code is a RUBBER STAMP and the
   slice is VOID. (`quest-rewards-gates.test.js` asserted a line EXISTED while it never RAN — it sat green
   through a live bug that stole quest rewards and corrupted the save.)
2. **VERIFY BEFORE ASSERT.** Agent / workflow / doc claims are T3 — grep the cited `file:line` before acting. A
   subagent fabricated a "RED test suite" crisis this week (it was green, 1936/1936). Another declared the boss
   art "done"; the actual PNG is a purple box. **Open the file. Open the image.**
3. **A GREEN HEADLESS GATE PROVES CODE-PRESENCE, NOT LIVED RESULT.** The founding rule. Drive the real product
   surface (E2E with REAL input · a live probe · LOOK at the rendered frame) before claiming done.
4. **NEVER WEAKEN TO PASS.** No deleting/skipping/scope-narrowing a test; no widening a timeout; no loosening a
   threshold. Fix a genuinely-wrong gate deliberately, with justification in the commit body.
5. **THE WORKER MAY NOT JUDGE ITS OWN COMPLETION.** For milestone-scale units an independent evaluator (a
   subagent, or Kevin) grades against the sprint's stated criteria + hard thresholds.

DISCIPLINE (every code tick): TDD red-first; AST-safe edits only on .js/.jsx; Game-Loop-Isolation (no reactive
state in useFrame — transient refs / `.getState()` / seeded); capture-determinism (NO Math.random/clock in
capture — seeded + `isCaptureMode()`-gated; static geometry at module load); **NO mid-combat RE-MESH (a HARD P4
veto)**; bloom 0.65 INTENDED; zero-emoji in `src/` (use `\u{}` escapes); no AI footer on commits; no
`git add -A`; `.state/` untouched. Capture-verify EVERY render-affecting slice (`npm run visual:capture`, then
**Read the frame with your own eyes**). Commit + push each gated unit; update STATUS + ACTIVE_PLAN + CHANGELOG.

TASTE BOUNDS: the coherence pillars **P0–P5** (`specs/crafty-coherence-pillars.md`; summarized in STATUS §4).
**The only HARD vetoes are P4's two invariants: no mid-combat re-mesh; input via intent-abstraction, not
pointer-lock.** Accessibility never vetoes depth. **The destructive CUT-gate is PARKED — the pillars govern what
to BUILD; they may NOT authorize deletions.** Reference-lock before any look-bearing work; judge IN-WORLD on the
real grade, never on a studio card.

⚠️ BROWSER / TEST-PROCESS HYGIENE (charter §6.4 — Kevin, hard rule): **anything you launch, you kill.** Headless
Chromium + vite dev servers from capture/e2e/probes do NOT die when a script throws. One session leaked 7 vite
servers + a Chromium at 622% CPU → load average 25 → the capture gate "flaked" (it was self-inflicted). Every
ad-hoc probe closes its browser in a `finally`; never leave a hand-started dev server up; delete throwaway
`dbg-*.mjs`; sweep with `sh frontend/scripts/dev/kill-test-procs.sh`. **When the box is slow, check for leaks
BEFORE blaming a gate.** cmux ALSO opens a browser preview tab per localhost port that OUTLIVES the killed
process → husks pile up; use ONE managed port (E2E 4179 --strictPort, capture 4178), never hand-start vite on
an ad-hoc port. `sh frontend/scripts/dev/close-preview-tabs.sh` LISTS husks; **NEVER hand-run `cmux
close-surface` or the helper's `--close` in the loop — an unresolved `--surface` closes `$CMUX_SURFACE_ID` =
YOUR OWN tab (a loop self-decapitated its session this way). List only; a human runs `--close`.**

SESSION-CLOSE (charter §6.5 — fires at the CONTEXT WATERMARK, 85/90/94%, unprompted): kill leaked test procs →
green the tree → update
STATUS + ACTIVE_PLAN + CHANGELOG → **refresh the REMOTE GitHub surfaces (README truth · repo description · CI
badge) and PUSH** → mark-truth → re-arm. A session that ends without the remote step has left the project's
public face lying about it.

STILL GENUINELY KEVIN (surface to `KEVIN-REVIEW-BATCH.md`; never block on it): **#44 the holistic playtest** (his
eye + ear — spell look, movement feel, storm, audio mix, real-device touch feel) · **S4 multiplayer + monetization
scope** (the loop will NOT start netcode or payments) · shareable-moment / clip / photo-mode · final taste
sign-offs · real-device runs · anything spending money / creating accounts / publishing externally · adding any
NEW dev dependency.
SETTLED (do NOT relitigate): F=cast / T=melee · bloom 0.65 glowier is INTENDED · grantXP full-heal is INTENDED ·
affixes KEPT · the Ember-Frontier + Blight-Heart direction · audience is BROAD (Marcus is a user, not a ceiling).

CONTINUE: ~60–150s while committable units remain (the registry is deep — this is an ACTIVE build queue, not a
hold). AWAIT + INTEGRATE any in-flight background Workflow instead of idle-spinning. ~30min ONLY if genuinely
blocked on Kevin. Never end the loop yourself.
