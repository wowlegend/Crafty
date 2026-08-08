# Active Plan — the LIVE CURSOR

> **📍 REPO LAYOUT (compaction-resilient):** TWO-LEVEL repo. ROOT `/Users/kz/Code/Crafty/` holds `.git`,
> `docs/superpowers/`, `memory/`, `.superpowers/` (gitignored mockups). APP `/Users/kz/Code/Crafty/frontend/`
> holds `src/`, `tests/`, `package.json` — **run npm/tests from `frontend/`; source is `frontend/src/`; docs +
> memory are at the ROOT, one level ABOVE `frontend/`.** Bash cwd drifts and resets on compaction → use
> ABSOLUTE paths; **NEVER assert a file is "gone/missing" from a relative `ls`/`find`** (the false-absence trap
> — it bit twice on 2026-06-01).

> ## 🧭 DOC ROLE — this file owns THE CURSOR ONLY
> **It holds exactly one thing: the single unit of work in flight right now, and the next one.**
> - **Where we are / the full open-work registry / what's next** → **`memory/STATUS.md`** (the source of truth).
> - **How the loop operates** → `docs/superpowers/LOOP-CHARTER.md`.
> - **History** → `memory/CHANGELOG.md`. **Map of all docs** → `docs/superpowers/INDEX.md`.
>
> This file used to duplicate status, handoffs, and per-slice detail. That scatter is over. Keep it SHORT.

---

## 📍 THE CURSOR — 2026-08-08 (E11 · governance pass + B-race RESOLVED)

**Tree:** `main` clean, CI `success` observed at `cf744e3`/`21f9aa3`. Queue **121 done / 94 open**, 0 unmarked.
Both published surfaces gated and current. **11 pre-push gates** now (`commit-msg` joined at `191af24`).

**DONE** — ledger in `docs/superpowers/GOVERNANCE-REVIEW-2026-08-07.md`: C1-C21 · COMPRESSIONS (charter
43,273 → 40,384 B) · A1 · A3 · A4 · A5(i) · A5(ii) · A6 · A7(charter). Plus `npm audit` 3 high → **0**
(undici 7.29.0, ip-address 10.4.0 — lock-only, puppeteer re-verified by launching it).

**§B-race is RESOLVED — read `memory/STATUS.md` §B-race before touching the visual harness.** The harness
is **DETERMINISTIC** (2 full captures, identical code: 0 of 31 frames differ >1%, `beast-*` 0.00%, at load
18). The 2026-08-05 "non-determinism" does not reproduce, and the load hypothesis was DISCONFIRMED.

**▶ NEXT UNIT — the beast fixture is deterministically WRONG, and that is now the blocker:**
0. **⚠️ READ `memory/STATUS.md` §B-race PASS 7 FIRST.** The mount/camera explanations below are MEASURED
   DEAD: the beast IS mounted (21 meshes within 0.64 units, visible), and the camera IS aimed at it (8.5°
   off-axis, inside a 37.5° half-FOV). The body also MOVES during the stage (y=100 at hook-fire → y=120 at
   screenshot), so "physics is paused so the player never leaves spawn" — which I wrote in pass 6 — is
   WRONG. The live contradiction is that the scene state is correct at screenshot time and the PIXELS are a
   mountain, which points at frame freshness, not geometry. **Do not re-litigate mount/camera/position.**
1. **Fix `spawnBeastTransform` (`src/App.jsx:352-361`) — ONLY after the above is resolved.** `beast-*.png` contains NO BEAST — a distant snow
   mountain — in both runs AND in the committed baseline, so 4 of 31 gated states assert nothing about
   their subject. Measured cause: physics is `paused={isCaptureMode}` (`GameScene.jsx:231`) BY DESIGN, so
   the player never leaves spawn `(0,100,0)`; this is the ONLY fixture framing its camera off
   `rb.translation()`, and its comment "Player is settled on terrain by now" is structurally impossible.
   ⚠️ **Do NOT fix by waiting for a settle — it would hang forever.** Make the fixture independent of the
   frozen body (deterministic beast+camera placement, or drive it from terrain height).
   ⚠️ **STILL OPEN, do not assume:** the camera looks 3 units at the player and the beast is
   player-attached, so it arguably should be in frame even at spawn altitude — it is not. Whether the mesh
   fails to mount or mounts elsewhere is UNRESOLVED. Measure first.
   **Then add the precondition the stage lacks:** refuse to write `beast-*.png` when no beast is present.
   A capture that screenshots whatever is on screen is the vacuous-gate defect in harness form.
2. **Re-baseline the 27 NON-beast states** — unblocked, noise floor ≤0.08%. Do NOT re-baseline the 4 beast
   states until (1) lands; that would re-freeze the empty mountain, which is how the current ones got there.
3. **S8/S9 grass/terrain LOOK work** (`docs/superpowers/TERRAIN-GRASS-SOTA-PLAN.md`) — the instrument is
   trustworthy now, so these are executable. S4 stays DEFERRED.
4. **A2/A7 remainders** (counts are commands not generated blocks; `AGENTS.md` + kernel untagged), then the
   **HOLISTIC-REVIEW queue** (94 open): test-vacuity 27 · dead-code 25 · test-bug 13 · bug 10.

**AWAITING KEVIN (do not "fix"):** touch-ring ergonomics · grass motes (deleted, veto-able) · `MEMORY.md`
compaction (**explicitly deferred to a sister session, 2026-08-08 — do not touch it here**).

**Everything below this block is OLDER cursor history.** It accreted despite this file's own "owns THE CURSOR
ONLY" rule — read it as history, not as work.


## 🔭 SUPER-CAMPAIGN (2026-07-20, Kevin): HOLISTIC REPO REVIEW → SOTA — every line/word, fix+enhance
> **Expanded authority (Kevin, verbatim intent):** *"enumerate and review every line/word of code (incl comments/
> descriptions) in the entire repo, fix/enhance everything holistically... be AGGRESSIVE on unilateral enhancement,
> do as much autonomous decision as you decide best, make everything SOTA-shaped."* Also: reorganise/merge/delete/
> archive redundant/completed docs; keep loop progress in an HTML.
> **Operating boundary (widened):** APPLY enhancements autonomously (correctness/perf/a11y/quality/polish/patterns);
> make taste calls + note them veto-ably. **Guardrails still binding:** every change RED-first + mutation-proven +
> full suite green; atomic verified checkpoints (auditable/git-reversible); do NOT silently reverse a RECORDED Kevin
> decision (world-design hybrid, CPU-ocean fork) — enhance within; irreversible high-blast (hard-delete referenced
> files, force-push, external send) still gets care. Prefer ARCHIVE (reversible) over DELETE for docs.
>
> **Progress HTML:** `docs/superpowers/LOOP-PROGRESS.html` (committed SoT, regenerate each iteration) + Artifact
> https://claude.ai/code/artifact/ccdc987f-fef7-4eda-9a65-b5d6cb60529c (refresh at checkpoints).
>
> **PHASE 1 — REVIEW (3 workflows launched, background; find → adversarially-verify):**
> - Source review — ALL 260 src files, 40 slices. run `wf_918f2239-024` (task wx1yji3gp). partition `scratchpad/slices.json`.
> - Docs audit+reorg — classify every doc + merge/archive/delete plan. run `wf_3742b969-3aa` (task wmv6gbf42).
> - Tests+scripts+config — 377 files, 16 slices (vacuity/hygiene/drift). run `wf_3e0ea8c9-340` (task wldf4k3de). partition `scratchpad/slices_b2.json`.
> **✅ PHASE 1 COMPLETE (2026-07-21) — all 3 workflows landed + SYNTHESISED.** Merged, deduped, priority-laddered
> work queue → **`docs/superpowers/HOLISTIC-REVIEW-2026-07-21.md`** (the audit-of-record) + machine JSON
> `scratchpad/findings.json`. ⚠️ **BOTH THE JSON AND THE RAW RESULTS ARE GONE** — they lived in a session-scoped
> tmp scratchpad, not the repo (verified absent 2026-07-27). The committed markdown is the only surviving copy;
> that is fine, it holds all 215. **Lesson: an artifact the loop depends on across sessions must be COMMITTED.**
> **215 CONFIRMED** (132 auto / 83 owner-judgment) + 79 plausible + 132 docs classified. By kind: dead-code 38,
> comment-lie 34, test-vacuity 32, hygiene 25, doc-drift 21, bug 18, test-bug 13, inconsistency 11, coverage-gap 8,
> enhancement 7, config-drift 3, perf 2, **security 2** (package.json phantom rapier dep; ci.yml no `permissions:` →
> over-privileged GITHUB_TOKEN), a11y 1. **2 HIGH bugs:** `TradingInterface.jsx:141`, `workers/ai.worker.js:302`.
> 28 files carry ≥2 findings (batch targets). Docs reorg: Wave-1 ~83 autonomous plan-archives, Wave-2 ~24 owner-gated
> (4 lint-CRITICAL — archive ONLY with a same-commit drift-fix to the citing LIVE doc; ARCHIVE-not-delete). Side-fix
> already shipped `75191ef`: capture-harness hang FIXED (was `browser.close()` blocking on a crashed browser; not env).
>
> **✅ PHASE 1.5 DONE (`262665b`):** loop kernel + charter updated to v9 "Holistic SOTA" (queue-repointed, expanded
> authority, new probe-hygiene scars). Capture-harness hang FIXED (`75191ef`) — visual re-baseline unblocked.
> > ## ⚖️ PHASE 2, MEASURED (2026-08-05) — the prose below overstated it by 35 findings
> The queue-of-record is now marked per-finding (`▣✓ <sha>` / `▢`), backfilled by 27 adjudicators reading
> LIVE code with an adversarial refutation pass over every claimed fix; anything unverified was forced to
> `▢`. **The real count is 119 done / 96 open, not ~154.** Spot-checked by hand afterwards.
>
> | kind | done | open | | kind | done | open |
> |---|---:|---:|---|---|---:|---:|
> | security | 2 | 0 | | comment-lie | 30 | **4** |
> | bug | 8 | 10 | | doc-drift | 19 | **2** |
> | test-bug | **0** | **13** | | test-vacuity | 4 | **28** |
> | hygiene | 24 | 1 | | coverage-gap | 7 | **1** |
> | config-drift | 1 | 2 | | perf | **0** | **2** |
> | dead-code | **13** | **25** | | a11y | **0** | **1** |
> | inconsistency | 7 | **4** | | enhancement | 4 | **3** |
>
> **SIX categories the text below calls ✅ COMPLETE are not:** comment-lie, doc-drift, coverage-gap,
> inconsistency, enhancement and — worst — **dead-code at 13 of 38**. That last one is a conflation worth
> naming: the campaign really did clear 80 eslint `no-unused-vars` items and promote the rule to blocking,
> but that is a DIFFERENT SET from the review's 38 dead-code findings, which include dead files, dead
> exports, dead prop-chains and unreachable branches eslint never flags. "The lint is green" was read as
> "the findings are closed".
>
> **test-vacuity 4/32** is the self-dismissal scar showing up as a number: 29 were dismissed by the loop on
> its own authority, and an auditor later mutation-proved 7 of those stay green when the code they guard is
> deleted. They are `▢` again until each carries its own proof.
>
> The claims below are kept verbatim as the historical record of what was believed.

**▶ PHASE 2 IN PROGRESS (2026-07-21 → 27) — ~154 findings fixed / 215 (SUPERSEDED — see the measured block above).** ✅ COMMENT-LIE (34) + ✅ DOC-DRIFT (21) +
> ✅ COVERAGE-GAPS (8/8) + ✅ INCONSISTENCY (11) + ✅ ENHANCEMENT (7) + ✅ DEAD-CODE (38 → 80 actual) COMPLETE;
> test-vacuity TRIAGED (3
> strengthened, rest FP/legit). Inconsistency finale (`d539b0b`): GearInspector consumable-registry fallback,
> CreditsScreen font_puhuiti i18n, touchTray aria-label i18n (+ui.build/magic keys) — [9]/[10] were non-issues
> (test-scoped emoji / cosmetic port-reuse). Enhancements (`d539b0b`): combat.js redundant-round, ORE_TILES
> hoist out of per-pixel loop, run-scenarios perf-gate now exits non-zero on FAIL. Routed to KEVIN-REVIEW:
> ai.worker A* Manhattan→octile heuristic (mob-pathing feel), ci.yml dependency-scan (touches the 2 dependabot
> highs). Skipped/already-fixed: synthVoices [1], CombatSystem store-shadow, Components performVerb-cleanup.
> **✅ DEAD-CODE COMPLETE (2026-07-27, `9387c7d`) — the rule is now a BLOCKING gate.** `no-unused-vars` went
> OFF → `warn` (`0d1b28a`) → **`error`** (`9387c7d`); eslint surfaced **80 items** (> the review's 38 estimate),
> all 80 cleared across 6 batches: `0d1b28a` (~28 catch-bindings → optional-catch + useFrame arg-drops) ·
> `a72bffd`+`b443141` (34) · `2824334` (4 Components/EMS locals+prop) · `9387c7d` (the last 15). `npm run lint`
> now exits non-zero on any dead import/var/arg. Final-batch highlights: four DEAD PROP-CHAINS traced end-to-end
> before deletion — showStats/setShowStats (App→HUD→GameUI was dead at all 4 levels; the LIVE consumers are
> GameScene's `<Stats/>` and MenuSystem→SettingsPanel), HUD setIsPointerLocked (dead since KEVIN-FIX C3; MenuSystem
> still uses it for touch entry, so the explanatory comment MOVED there), MenuSystem spellUpgrades (SpellUpgradePanel
> reads talents from the store), PaperDollSlot slotName (5 callers, 0 readers).
> **⚠️ LESSON (part-2 scar, kept):** eslint-unused ≠ DEAD when a structural GATE requires the symbol — removing
> InputManager's `setActive` import broke input-abstraction-gates (pre-push caught it AFTER a bad push slipped
> through, because pre-push tests the WORKING TREE not the commit; restored in `b443141`). ALWAYS grep tests/gates
> before deleting a flagged import. `setActive` survives on a justified `// eslint-disable-next-line` naming the gate.
> **⚠️ SECOND-ORDER FIND (`9387c7d`):** that gate was itself VACUOUS — it matched `/\bsetActive\b/` against the
> whole file, so the *comment* explaining why the import is kept already satisfied it and deleting the import still
> passed. Strengthened to match the import SPECIFIER, mutation-proven RED. **Generalizable:** any whole-file
> substring gate is satisfiable by a comment; anchor structural gates to the syntactic form, not a bare token.
> **✅ 2026-08-02 — THE AUDIT BATCH IS DECIDED AND SHIPPED (Kevin: *"do all you decide to be best"*).**
> All nine awaiting-decision items dispositioned; every decision + reasoning recorded in the new
> **`docs/superpowers/DECISIONS.md`** (the outbox KEVIN-REVIEW-BATCH never had — it had ~146 entries and 6
> marked resolved). Shipped `32625c0`..`d85fb23`:
> · **deps** — rapier3d-compat DECLARED (devDeps, exact 0.19.2 to match what @react-three/rapier pins, so the
>   integration test keeps driving the same WASM the app ships) + the knip `ignoreDependencies` that hid it
>   DELETED; `npm audit fix` → **0 vulnerabilities, 0 open dependabot alerts** (was "2 highs needing a human
>   decision" for weeks — package.json is byte-identical, it was a lockfile refresh).
> · **CI CONCLUDES AND IS GREEN-ABLE** — perf-siege tagged `@local-only` and excluded in the workflow (it is a
>   perf probe; ci.yml's own policy always excluded those), world-rebuild's recovery window now CALIBRATED
>   from the machine's own measured stream throughput (the 80% assertion untouched). No threshold lowered.
> · **visual** — all 7 ungated states promoted; 31/31 now assert. **That immediately caught a real
>   determinism bug:** `WeatherSystem` cycles clear↔storm every 90s and a capture takes >4min, so every
>   outdoor frame has been a coin flip against its baseline for as long as the gate existed. Gated — and the
>   check must be INSIDE the interval callback, because `isCaptureMode()` is flipped by the harness AFTER
>   mount (a setup-time guard reads false and silently does nothing; I shipped that version first).
> · **gate-shape.mjs** — the mechanical kill for the comment-satisfied-assertion class, in pre-push + CI.
>   Found a real one on its first run (place-puff), and got three wrong (ocean-coastline) which hand-checking
>   caught — the fix was to stop treating a gate's IMPORT path as the file under test.
> · **pre-push certifies the PUSHED REFS** via a detached worktree, not the working tree; the docs-only skip
>   path is gone. Mutation-proven in the exact `a72bffd` shape.
> · **i18n ratchet** — 109 hardcoded strings frozen per-file; may shrink, never grow.
> · **kernel ORIENT step 0 reads CI** (`gh run list`, green ≡ the literal string `success`); **charter §8
>   rule hygiene** — a rule names its enforcer or it is deleted; a number is computed or it is deleted; a
>   claim about outside state is emitted by the command that observed it.
>
> **✅ RESOLVED 2026-08-02 — `world-rebuild-after-load` was a TEST defect, and I was wrong TWICE first.**
> (1) "slow-runner false negative" — falsified by the calibrated window (settled at exactly 30 under 101s /
> 134s / 150s). (2) "partial recovery, a real save/load bug" — falsified by the trajectory instrumentation:
> all three CI attempts climb `2→12→25→30` and flatline for 60–100s, the shape of a streamer FINISHING.
> **Root cause:** `GameScene.jsx:185` mounts a `<PerformanceMonitor>` that steps the quality tier down;
> `TIERS.renderDistance` 4/3/2 → boxes 81/49/25, re-read every tick. On a 2-core runner it declines med→low
> DURING the measured window, so the streamer correctly refills 25 (+stragglers = 30) while the test compared
> it against a med-tier baseline of 49. Target now computed from the tier AT ASSERTION TIME; the 80% bar is
> untouched and the real bug (count parks at 0) still fails against every tier's box.
>
> **🔎 NEW LEAD from that work (queued, not actioned): a tier downgrade frees nothing.** A local run logged
> `baseline 81 @low` — tier `low` (box 25) with **81 chunks still resident**, because `cullDist =
> renderDistance + 2` culls only beyond ±4 and therefore retains a 9×9 box at every tier. So `high→low` stops
> LOADING but never UNLOADS: on exactly the machine the downgrade exists to protect, memory and draw calls
> stay at high-tier levels. Verify on a real tier transition before changing cull behaviour — hysteresis is
> presumably deliberate to stop thrashing at a tier boundary, so the fix is likely a slower separate
> reclaim, not a smaller cullDist.
>
> **✅ 2026-08-02 — CI IS GREEN. First `success` conclusion in 96 runs** (`190aac9`, all five jobs:
> unit·lint·knip·build, doc-currency, e2e shards 1/3 2/3 3/3). Verified per the kernel's definition —
> the literal string `success` on the newest completed run at a sha that is an ancestor of HEAD.
>
> **✅ 2026-08-02 — the `ai.worker` inline mirrors are GONE (`815c007`).** The "classic Worker cannot
> import" premise was false and is now disproven by construction: the built worker is 3.71 kB with ZERO
> bare imports because Vite inlines them. AIWorkerSystem switched to the `?worker` form terrain.worker has
> always used; the worker imports mobLineOfSight/attackTelegraph/mobSteering directly; the telegraph block
> is the imported state machine rather than a copy of its transitions. The three sync gates were REWRITTEN,
> not deleted — behavioural halves kept (one gained coverage), mirror-pinning halves replaced with
> import-specifier anchors that gate-shape verifies cannot be comment-satisfied. Mutation-proven on the
> real historical regression (re-pointing steerGoalCell at the player turns the kite gate RED). **Rule 3
> paid: lived night-siege probe — 13 frames over 12.4s of saturated siege, zero fatal runtime errors,
> heapGrowth 0.** The eslint crash-class gate caught an undefined local mid-refactor, which is exactly
> what it was built for.
>
> **✅ 2026-08-02 — DOCS REORG WAVE-1 DONE (`56dd545`).** `docs/superpowers/plans/` 100 → 38; 62 archived to
> `docs/archive/2026-Q2/plans/` via `git mv` (all 62 tracked as renames, history follows the file).
> Selection was MECHANICAL — a reverse-dependency scan over every tracked `.md` outside the plans dir:
> **62 zero inbound refs → archived · 34 cited only by CHANGELOG → left (moving a file history cites
> falsifies the record) · 4 cited by a CANONICAL doc → left, that IS Wave-2** (loot-glow-PARKED,
> ocean-coast, world-purpose-sota, biome-flora — each may only move in a commit that also drift-fixes the
> citing doc, else doc-currency trips). INDEX.md documents what moved and why the other 38 stayed.
>
> **▶ 2026-08-02 — i18n sweep: 109 → 32 (`75474da`, `711f472`, `138b1fe`). GamePanels is at ZERO.**
> Each of the three commits was mostly a GATE defect the translation happened to expose.
> **(a)** The detector read an arrow function as UI text — `.filter(p => time - p.time < 0.14)` brackets
> ` time - p.time ` between a `=>`'s `>` and a comparison's `<`. Second instance of that class, and the
> first fix pinned nothing, so `scanSource()` is now a pure seam with six fixtures. Found while
> mutation-proving it that the module ran its **CLI on import** — `process.exit(1)` killed the vitest
> worker during collection ("1 failed | no tests"), so the first proof proved nothing.
> **(b)** `settings-a11y-gates` asserted `/Feedback Intensity/` and stayed GREEN after the literal left the
> code, held up by the comment above the slider. Five gates re-anchored to the `t()` form — NOT an
> `(?:English|t\(...\))` alternation, which would keep matching those comments forever.
> **(c)** Nothing checked that a `t()` key EXISTS; `t()` returns the key on a miss, so a typo ships as UI
> text with everything green. `tests/i18n/key-resolution.test.js` closes it.
> **(d)** `gate-shape` recognised a target only if the literal contained `src/` — which gates never write,
> since the prefix lives in a `read()` helper. **49 of 116 gates were never opened**; 97 → **399**
> assertions verified. Its own findings then forced three more fixes (composed paths, `.not.toMatch`
> polarity, multi-target attribution) before they stopped being false accusations.
> **Remaining: 25 across 9 files** (`d188fc0` took the death/victory overlays, quest log and controls
> panel to zero — none of those three had `useT()` at all): MenuSystem (5), CraftingTable (4),
> GameHud (4 aria-labels), index.jsx (3), TouchControls (3 aria-labels), QuestSystem (2),
> TradingInterface (2), App (1), HUD (1).
> ⚠️ **Blind spot recorded, not closed:** interpolated copy (`Requires Lv {n}`) is invisible to the
> detector, and closing it needs `t()` to take parameters first — a real API change, its own unit.
>
> — superseded —
> **▶ 2026-08-02 — i18n sweep: 109 → 62 (`b864703`, `11d93b1`). The halves are DIFFERENT.**
> `109→84` is METHODOLOGY, not progress — the detector had two defects that inflated the ledger:
> comparison operators produced fake "text nodes" (`if (diff > 0) return <span` was reported as the string
> `0) return`), and DEV-only `DebugOverlay` (12 hits, `import.meta.env.DEV`, tree-shaken out) was counted as
> product copy. `84→74` is REAL work: GamePanels' four attribute labels, three panel headers and three
> allocation aria-labels, keyed under the existing `stat.*` namespace with zh-CN matching the shipped
> ATK/DEF/SPD/CRIT register. GearInspector had no `useT()` at all, which is why those four were hardcoded.
> **Remaining: 74 across 17 files** — next largest are GamePanels (23 left), SpellUpgradePanel (9),
> WorldManager / ChestInventoryPanel / MenuSystem (6 each).
>
> **✅ 2026-08-02 — cull-hysteresis RESOLVED (`842c423`), RED-first on a real tier transition.**
> Measured, not inferred: before `high=81 → low=72` flat for 45s (freed 11% against a box of 25); after
> `high=81 → low=42` (`81→49→45→42`). Fix is a THROTTLED reclaim past a 1.5× overshoot, capped 4/tick —
> deliberately not a smaller `cullDist`, which would tighten the band during ordinary movement and
> reintroduce the thrash the +2 exists to prevent. New e2e `tier-downgrade-reclaim.spec.js` drives the real
> transition through the same store action PerformanceMonitor uses.
>
> **✅✅ 2026-08-02 ~19:10 — THE VISUAL GATE IS BACK (`f9a6989`).** Machine recovered; capture printed
> `preflight: browser produced 72 frames in 1.2s` and ran all 31 states clean. `test:visual` = **31/32**.
> The one failure (`explore-day-low`, 6.55% vs 6%) is INTENDED and attributable — opened both frames:
> missing mid-distance terrain = `842c423` tier reclaim (81→42 chunks), relocated health bar = `7e0f004`.
> **⚠️ ALL 31 BASELINES ARE 2026-06-22..06-30 — 293 commits stale**; they pass because 6% is generous.
> **RE-BASELINE IS KEVIN'S CALL** (charter) → routed to KEVIN-REVIEW-BATCH with the taste question (no
> distance fade masks the low-tier horizon cut). **Do NOT re-baseline unilaterally.** All render work
> shipped during the outage is now pixel-verified, incl. the GamePanels i18n sweep
> (`inventory-open`/`achievements-open`/`progression-open` all pass).
>
> **✅✅ 2026-08-03 — DOC-SOTA PLAN COMPLETE, 14 of 14 (`34f8319`).** #6 shipped: Rule 5 split into
> (a) completion / (b) dismissals / (c) progress, and its licensing clause ("the 215-finding queue is itself
> adversarially verified" — verified PROVENANCE read as verified DISPOSITION) is gone. `queue-ledger.mjs`
> ratchets the UNMARKED count in the queue-of-record (215, may fall never rise) and hard-fails any
> `⊘ DISMISSED` lacking a backticked proof command. **▶ WORK-OF-RECORD RETURNS TO `memory/STATUS.md` §2.**
>
> — superseded —
> **✅ 2026-08-03 — DOC-SOTA now 13 of 14 SHIPPED, 1 REMAINS (#6 Rule-5 self-adjudication).**
> **#8** (`6412bb6`): AGENTS.md named STATUS.md ZERO times — fixed with the charter §0-A ladder copied, not
> invented; and its compaction instruction told the compactor to PRESERVE GATE RESULTS, which is how "CI
> green" got written on a day CI had never passed. Now preserves the COMMAND, not the number.
> **#10** (`8e2539b`): `mutation-proof-trailer.mjs` — a commit ADDING a gate needs a `Mutation-Proof:`
> trailer; runs FIRST in pre-push. Scoped to NEW gates (a trailer per edit is noise, and noise disables
> checks). ⚠️ flagged to Kevin as VETOABLE in KEVIN-REVIEW-BATCH — it changes the contract for his commits.
>
> — superseded —
> **✅ 2026-08-03 — DOC-SOTA now 11 of 14 SHIPPED, 3 REMAIN** (#6 Rule-5 self-adjudication · #8 AGENTS tail ·
> #10 charter §3). Shipped since: **#5+#11** `measure.mjs` + the MEASURED block (AGENTS size numbers were 12x
> wrong on files, 2.5x on LOC, and claimed ONE >=900-LOC file when there are FIVE; now generated, with a
> ±10% drift check mutation-proven 3 ways). **#14 (amended)** — charter §6 → pointer to STATUS §2; §5
> COMPRESSED **not deleted**, because it holds the self-gate rule `SOTA-INITIATIVE.md:111` cites and
> doc-currency cannot see section-anchor references.
>
> **✅ 2026-08-02 — DOC-SOTA PLAN RE-VERIFIED (`96d20f8`): 8 of 14 SHIPPED, 6 REMAIN.** The header had
> said "3 shipped / 11 remain" since 07-27 while six landed during the loop era — the kernel carried the
> stale count for days. Per-row evidence table now in the plan. **OPEN: #5 measure.mjs, #6 Rule-5
> self-adjudication, #8 AGENTS tail, #10 charter §3, #11 MEASURED block, #14 delete charter §5/§6.**
> **▶ NEXT UNIT: #5 + #11 TOGETHER** — the MEASURED block has nothing to source until `measure.mjs` exists,
> and AGENTS:40 still carries `~14.4k LOC / ~31 JS(X) files` + the whole de-monolith narrative, which the
> plan itself cites as the headline example of a rotting number (already 1.8x wrong the day it shipped).
> **✅ Also shipped (`3555db5`): AGENTS gate table** — it named 2 of the 7 push-authorizing gates; now all 9,
> transcribed from pre-push + ci.yml, incl. that `test:visual` is run by NEITHER (manual only).
>
> **✅ 2026-08-02 — DOCS REORG WAVE-2 DONE (`2d788f2`).** Archived ocean-coast + loot-glow-PARKED +
> biome-flora (plans/ now 35). **world-purpose-sota STAYS** — LOOP-CHARTER cites it twice as the live
> `Source:` for current design; it is a DESIGN OF RECORD, not history. Wave-1s deferral premise was wrong:
> `doc-currency` matched only backticked paths, so moving a bare-path-cited doc left ARCHITECTURE dangling
> and the lint still printed PASS. Bare-path matching added + mutation-proven.
> **▶ NEXT: the 11 remaining edits in `docs/superpowers/LOOP-DOC-SOTA-PLAN-2026-07-27.md`.**
>
> **✅✅ i18n ADOPTION SWEEP COMPLETE — 109 → 0** (`dd6e3fa` decoupling, `2ece9c9` the sweep). Ledger is
> 0 across 0 files, so the ratchet is now a ZERO-TARGET: any new hardcoded string fails as a NEW FILE.
> Pixel-verified 31/32 (only the known `explore-day-low`). Two lessons worth keeping:
> **(a)** `t(key, vars)` HAS always interpolated — the "t() takes no parameters" claim in
> `i18n-adoption.mjs` was written without reading `i18n.js` and is corrected; interpolated copy is
> wrappable today, only the DETECTOR can't see it. **(b)** the HUD objective banner is written
> IMPERATIVELY (`txt.textContent = label`), so the detector's flagged JSX default was cosmetic — the real
> player-visible strings were invisible JS literals. Enumerate imperative writes, not just JSX.
> **User-facing copy is no longer a test selector** — 9 call sites across an e2e spec, 3 probes and an
> integration test now use `data-testid`; verified live via `touch-probe.mjs` + the 3 touch e2e tests.
>
> — superseded —
> **▶ i18n 25 → 19** (`6dfdc16`: crafting table + villager trading). ⚠️ **NEXT i18n UNIT IS BLOCKED ON A
> DECOUPLING:** the remaining `GameHud` (4) / `TouchControls` (3) / `index.jsx` (3) strings are aria-labels
> and error text that **4 probes + an e2e spec use as RUNTIME SELECTORS** (`button[aria-label="Settings"]`,
> `[aria-label="Action"]`, `[aria-label="Tap to play"]`, `innerText.includes('Something went wrong')`).
> Wrapping is safe today (en renders identically) but couples the harness to English. Add `data-testid` +
> repoint the probes FIRST, then wrap. Remaining after that: MenuSystem (5), QuestSystem (2), App (1), HUD (1).
>
> — superseded —
> **✅ 2026-08-02 — CAPTURE-GATE ROOT CAUSE FOUND (`82a6cc1`, `c26367f`). Still blocked, but the ask is
> now just A REBOOT — and "reinstall Chrome" was WRONG.** `requestAnimationFrame` fires **0 times in 2s**
> in this box's headless Chrome, so `flushFrames()` (which awaits 10 rAF callbacks inside a
> `page.evaluate`) can never return, and puppeteer's default 180s protocolTimeout surfaces as the generic
> `Runtime.callFunctionOn timed out`. **The browser is fine** — launches, runs JS, makes a WebGL 2.0
> context; **`Page.captureScreenshot` also hangs on a bare `data:` URL with no app**, under swiftshader /
> no-flag / `--disable-gpu` / `--disable-gpu-compositing` / `--in-process-gpu` / `--single-process` /
> `--enable-software-rasterizer` / old headless. **Crafty itself boots in 2.7s**, bridge answers,
> `enterCapture`+`start` return, diorama canvas mounts instantly. OS-level compositor state.
> `capture.mjs` now PREFLIGHTS it: **3.5s to a named cause + repro command** instead of 180s of silence.
> **Deliberately no wall-clock fallback** — with rAF dead nothing renders, so a fallback would green the
> gate over blank frames. Rather blind than lying.
> *Also fixed:* `capture.mjs` ran `main()` on import (same defect as `i18n-adoption.mjs`), and the new test
> was first written to `tests/visual/` — which **vitest excludes**, so it would never have run.
>
> — superseded (isolation still valid; only the recommended fix was wrong) —
> **🛑 BLOCKER — THE VISUAL CAPTURE GATE IS DOWN (Kevin-facing, routed).** `ProtocolError:
> Runtime.callFunctionOn timed out` before a single frame. **Isolated, NOT a code regression:** reverting
> Terrain → same failure; worktree at `190aac9` (pre-refactor) → same failure; load 2.8/5.7/24/31 → same
> failure; 0 leaked procs; port free; Chrome 147 present as puppeteer expects. **`190aac9` passed 32/32 at
> 10:41 today and fails at 13:30.** Machine state changed mid-session. Needs a reboot or
> `npx puppeteer browsers install chrome` — neither is an unattended action. **While it is down, no render
> change has pixel verification.** Fixed in passing: `kill-test-procs.sh` never swept puppeteer's Chrome
> (only `ms-playwright/`), so every "0 playwright alive" was reporting on the wrong process family.
>
> — superseded: the cull-hysteresis lead as originally queued —
> **▶ NEXT UNIT: the cull-hysteresis lead** (a tier downgrade frees nothing — `cullDist = renderDistance + 2`
> retains a 9×9 box at every tier, so `high→low` stops loading but never unloads, on exactly the machine
> the downgrade exists to protect). Verify on a real tier transition first; the hysteresis is probably
> deliberate anti-thrash, so the fix is likely a separate slow reclaim rather than a smaller cullDist.
> Then: the 11 remaining doc-SOTA edits, the 109-string i18n sweep, the docs REORG.
>
> — superseded note kept for provenance: the ai.worker unit was originally deferred as follows — Premise is false
> (terrain.worker imports 10 modules) and the sync gates are drift-blind (21,655/200,000 mismatches stayed
> green). Deferred because it is the only item that changes MOB BEHAVIOUR at runtime — Rule 3 wants a lived
> pathing probe, and it must not ride along in a harness tranche where a regression is hard to attribute.
> Then: the 11 remaining doc-SOTA edits, the 109-string i18n sweep, the docs REORG.
>
> **▶ 2026-07-27 — GOVERNING-DOC SOTA PASS (Kevin-requested). PLAN OF RECORD:
> `docs/superpowers/LOOP-DOC-SOTA-PLAN-2026-07-27.md` — 14 edits, 3 SHIPPED, 11 REMAIN, with exact
> paste-ready text + the adversarial critic's standing rejections.** Principle: *a rule names its
> enforcer or it is deleted; a number is computed or it is deleted; a claim about state outside the
> working tree is emitted by the command that observed it.* The audit's split was mechanism, not
> diligence — every rule checkable from an artifact the loop already produced was obeyed ~100% across
> 999 commits; every rule needing a separate experiment whose only consumer was the loop's own prose
> was obeyed erratically or never. Highest-value remaining: **[2] `gate-shape.mjs`** (AST lint that
> fails a gate whose assertion is satisfied by a COMMENT — kills the 85%-source-grep vacuity class
> mechanically), **[3] pre-push certifies the PUSHED REFS** (it reads no stdin today, and a docs-only
> push skips lint/tests/build entirely), **[5] `measure.mjs`** (one authority for every number, wired
> into doc-currency so stale counts fail the push). **BEFORE applying any edit, read the critic's
> standing rejections at the foot of the plan** — three otherwise-obvious remedies are already proven
> dead (doc-currency mtime for STATUS freshness; CHANGELOG under the doc lint; any text claiming CI
> is green — it has concluded `success` ZERO times).
>
> **THEN: docs REORG (Wave-1 ~83 shipped-plan archives via `git mv` → docs/archive/2026-Q2/
> plans/; Wave-2 4 lint-CRITICAL, ARCHIVE-not-delete, drift-fix the citing LIVE doc same commit).** Comment-lie: `4ae60bc`+`4f05f77`+`bf1fa9a`+`d2684fd`+`5740c9e` (29 fixed, 3 FP, 1 held
> [Terrain.jsx:138 KEVIN shader], 1 dup) incl. 2 dead-value removals + a mutation-proven gate strengthening.
> Doc-drift: `88010a9` (19 fixed — numeric/roster drift, stale baseline counts dropped, de-brittled moved-code
> refs, voxelKit/inputState content, + the r3f winding-rule doc's Bottom/Front/Back corrected to the shipped
> gate-verified terrain.worker.js; 2 FP already fixed by b5be02f). `edd0cec` routed 7 visual/taste to KEVIN.
> **▶ TEST-VACUITY (32) TRIAGED (`3f327b3`):** HIGH false-positive rate confirmed — most flagged *-gates
> files are deliberate STRUCTURAL complements whose behavior IS covered in a sibling (siege↔siegeParams.test,
> element-impact↔mobHitFx.test, quest-lore↔questLore.test — all verified). 3 genuinely-weak ones strengthened
> + mutation-checked (hub-render per-Emissive count, input-abstraction getInput().active anchor, hud-declutter
> survival gate). Remaining ~24 are legit-structural or sibling-covered (bare-token anchors = low ROI); a
> deeper per-file pass is DEFERRED (not worth grinding vs the actionable categories). NOT counting the ~24 as
> "fixed". **NEXT: coverage-gaps (8) → inconsistency (11) → enhancements (7) → docs REORG → eslint
> no-unused-vars unit.**
> Probe-hygiene batch (~25 — all 22 probe/perf
> scripts on `scripts/visual/_serve.mjs`) + Phase-2a bugs: `e8e218e` HIGH trade · `3660284` ci security · `93bf3d3`
> Player dead-code · `aa121de` HIGH archer-kite · `b5be02f` Terrain. **Phase-2b correctness batch (7):** `0dee956`
> test-cleanup ×3 · `a2ae62f` worldSaves index-write failure · `13184e6` spawner loop-bound (seam
> `systems/spawnPlacement.js`) · `f3e87db` ai.worker LOS clamp (seam `game/mobLineOfSight.js` + sync-gate) ·
> `d09b56d` cameraKick right-axis sign · `c71b57e` questClaim null-guard (+ the promised `game/questClaim.test.js`) ·
> `c41d693` magic burn-ticker unmount leak (seam `game/burnManager.js`). All RED-first + mutation-proven.
> **✅ PROBE-HYGIENE + TEST-CLEANUP + deterministic bug mediums/lows CLOSED.**
> NEXT (down the ladder): the REMAINING bugs are VISUAL/feel (UV tiling, boss/mob hit-flash, rain rotation) →
> KEVIN-REVIEW; [11] deviceMemory≥12 tier threshold → KEVIN (real-hardware perf tuning). Then comment-lie (34) +
> doc-drift (21) by-file batches — pure text, VERIFY each on live HEAD (review had false-positives) → test-vacuity
> seams (32, only genuinely-testable) → coverage (8) → inconsistency (11) → enhancements (7) → docs REORG (Wave-1
> ~83 archives; Wave-2 4 lint-CRITICAL). Held for care: the KEVIN shader comment at Terrain.jsx:138. Queued: enable
> eslint `no-unused-vars` (own unit — surfaces the dead-code 38 cleanup). — original Phase-1.5 note below —
> **PHASE 1.5 — UPDATE THE LOOP + CHARTER (Kevin 2026-07-20, timing clarified):** AFTER all 3 workflows land AND I
> synthesise the review-derived next-steps queue — but BEFORE the fix-work is finished — UPDATE the loop kernel
> (`docs/superpowers/LOOP-KERNEL-PROMPT.md` + the re-armed `/loop` ScheduleWakeup prompt) AND
> `docs/superpowers/LOOP-CHARTER.md` to latest + SOTA-shaped (as of 2026-07-21), so the loop's work-queue reflects the
> synthesised findings and subsequent firings continue on the RIGHT queue. Verbatim: *"update the loop after the
> workflows land and you synthesise the latest next steps, not after the actual works are finished."*
> **PHASE 2 — FIX/ENHANCE (main-loop, verified units):** batch by severity/kind — correctness bugs → comment-lies →
> dead-code → perf → a11y → consistency → SOTA enhancements. Each RED-first + mutation-proven + gated + committed
> (ONE coherent unit per commit; no `git add -A`). Execute the doc reorg (archive completed → `docs/archive/…`,
> fix drift, merge dupes; DELETE only genuinely-useless, git-recoverable). Route recorded-decision reversals + pure
> taste to KEVIN-REVIEW-BATCH. Update LOOP-PROGRESS.html + STATUS + CHANGELOG each batch.
> **This SUPER-CAMPAIGN supersedes the idle V1/V2 loop below** — the review findings ARE the new work queue. The
> existing ScheduleWakeup heartbeat + workflow-completion notifications both resume HERE.

---

## ▶️ CURRENT CAMPAIGN: **v8 — "Playable Truth + Depth"**

**Steer (Kevin, 2026-07-13, verbatim):** *"fix / enhance and address every single one of these items you
identified, don't miss anything. leave the truly manual ones for me to review later. the mob/boss art direction
you should have a go at fixing / enhancing as you decide best… set up the loop so that it's SOTA loop
engineering (as of today) and gets all the Crafty documentations / relevant surfaces updated so work progress
and documentations and masterplans are not scattered all over the places… get Crafty's remote github surfaces
updated too near the end of every session when you hit the context-watermark."*

**This de-gated two things that were previously blocked:** the **mob/boss art direction** (now full loop
authority) and the **control-scheme Option-A enhancements** (which were *already* authorized on 2026-06-28 —
the `[KEVIN-GATED]` tag on them was stale).

**The work-of-record is the REGISTRY in `memory/STATUS.md` §2.**

## 📍 THE CURSOR (2026-07-14)

**The 18-domain review is COMPLETE and INTEGRATED** — 91 confirmed bugs (17 CRITICAL), full report at
`docs/superpowers/audits/2026-07-13-18-domain-review.md`, folded into STATUS §2 as **`A-bis` B1–B8**.
It **reordered the campaign**: fix the game before building E2E scaffolding and an art pass on top of it.

**IN FLIGHT — `A-bis` the confirmed-bug seams.** The 18-domain review's 9 remaining seams were dug +
adversarially skeptic-checked into verified RED-first drafts (`docs/superpowers/audits/2026-07-14-b-seams-drafts.json`;
land-plan `…-landplan.md`). Landing them one at a time, RED-first + mutation-proven by me (the drafts are
hypotheses; two of my own tests this week passed with the bug reintroduced).

**SHIPPED (2026-07-14 loop):** B1 · B2a-f · **B2h** (boss kill-block extracted) · B3a/B3c/B3d · **B3b** (crystal black hole) · B6a+B6b (quest miscount). All seam-extracted + mutation-proven. Unit 1950→2033.

**NEXT:**
- **B2g [DEFERRED — needs lived/Kevin verification]** — persist the boss fight across reload. The correct fix is a store-owns boss-state rewrite whose regression surface is the VISUAL/AUDIO boss layer (BossEntity, BossHealthBar, boss music) that CANNOT be verified headlessly (green units ≠ lived boss fight). Rare edge case (reload mid-climax). Draft in `2026-07-14-b-seams-drafts.json` (B2g-boss-reset). Do NOT rush unattended.
- **B4** (mob AI 2D→3D — balance-sensitive) → **B5** (HUD lies — needs a puppeteer probe, not pure unit) → **B7** (touch — puppeteer) → **B8** (combat/world feel — the PURE ones first: arcane triple-hit, fireball 12m cap, camera-shake per-frame). Then V1/V6 → V2/V3 → C1 → D → E → F/G.
- **Separate LOW:** the 2 unlockable achievements (`updateLevel` zero callers, QuestSystem.jsx).

**PARALLEL (non-Crafty): the cmux self-close PR** — both trace + conventions workflows are DONE. Root cause
`TerminalController+ControlSurfaceContext2.swift:408` (a `?? focusedPanelId` fallback closes the caller on a
failed resolution). Fix = server guard + CLI guard + budget bump; playbook says land on a clean branch off
`origin/main`, two-commit red/green Swift test in the already-wired `cmuxTests/TerminalControllerSocketSecurityTests.swift`.
Scripts: `scratchpad/cmux-close-surface-bug.js`, `cmux-pr-conventions.js` (outputs in the task .output files).

**Every slice: RED-first, then MUTATION-PROVE the gate** (break the behaviour → it must go red → revert).
Three separate times this week a "green" gate turned out to be measuring nothing — including two versions
of the B2d E2E that I wrote myself and that passed with the bug deliberately reintroduced.

---

## ✅ SHIPPED THIS SESSION (2026-07-13)

**Harness tranche — DONE.** The build is now actually verifiable:
1. ✅ **Doc consolidation** (`6857b57`) — `memory/STATUS.md` canonical + `docs/superpowers/INDEX.md` (the map)
   + role banners. The six-way status scatter is over.
2. ✅ **SOTA loop rewrite** (`4e32dbf`) — LOOP-CHARTER §0-B (mutation-proof-every-gate · evaluator ≠ generator ·
   drive the product surface · context-reset > compaction · never weaken to pass) + KERNEL v8 (points at
   STATUS instead of inlining volatile state) + the §6.5 session-close ritual.
3. ✅ **CI + pre-push hook** (`58972b4`, `939da0e`) — the first CI this repo has ever had, plus two
   MUTATION-PROVEN gates (`bundle-budget.mjs`, `doc-currency.mjs`) and a live `core.hooksPath` pre-push gate.
   CI caught a real repro bug on run #1 (the lockfile could not `npm ci` on linux).
4. ✅ **R1 — the quest reward-theft + save-corruption bug** (`926751e`) — RED-first, pure reducer, and it
   exposed a HARMFUL source-grep gate that was anti-correlated with correctness.

---

## 🚨 IN-FLIGHT BACKGROUND WORK — MUST BE INTEGRATED, DO NOT LOSE THIS

**Workflow `w9flt750j` (run `wf_e310cbcd-7b8`) — THE 18-DOMAIN DEEP REVIEW.** Kevin explicitly approved all
4 phases and said: *"make sure this major work progress survives compaction and is fully completed."*

- **What it is:** all 18 feature domains (not the 10 the 06-28 audit managed). Per domain: (1) MEASURE the real
  validation coverage by grep — behavioural vs source-grep-only vs visual vs live vs none, **no inference**;
  (2) **DRIVE the code** — agents run throwaway scripts importing the real modules and report *observed output*
  (every bug found today came from running or looking, never from reading); (3) adversarially REFUTE every
  finding (agents fabricate — one invented a RED test suite this session); (4) synthesize.
- **Why it matters:** it replaces the INHERITED, partially-inferred "0.5% of 185 features" estimate (from an
  audit that only agent-audited 10 of 18 domains) with a **measured** number.
- **ON COMPLETION (this is the obligation):** fold the confirmed bugs into the `memory/STATUS.md` §2 REGISTRY,
  record the measured coverage in STATUS §1 (replacing the inherited estimate), add the ranked gate-backlog to
  V1, and log it in CHANGELOG. **The workflow finishing is NOT the deliverable — the integration is.**
- **If the session died mid-run:** resume with
  `Workflow({scriptPath: "<see below>", resumeFromRunId: "wf_e310cbcd-7b8"})` — completed agents replay from
  cache, so nothing is re-billed. Script:
  `~/.claude/projects/-Users-kz-Code-Crafty/c7297111-afb7-46c9-83b3-6edc09ed7f41/workflows/scripts/crafty-18-domain-deep-review-wf_e310cbcd-7b8.js`
  Its per-agent results are in that run's `journal.jsonl` (one `{"type":"result"}` line per agent) — READ THAT
  before assuming the work is lost.

## ⏭️ NEXT UNIT (pick up here — 2026-07-13, session 2 close)

**1. INTEGRATE the 18-domain review** (`w9flt750j`) the moment it lands — see the pinned block above. That is
the first priority and the integration IS the deliverable.

**2. V1 triage (in progress).** First-pass classification of all 124 gate files is DONE and recorded in
STATUS §V1. **My earlier "114 of 124 are vacuous / 92%" headline was OVERSTATED and is corrected there** —
reading source ≠ vacuous. Real counts: **3 clearly VACUOUS** (`boss-notif-timer-gates`,
`melee-swing-audio-gates`, `survival-quests-gates`), **~31 legitimately STRUCTURAL** (worker inline-mirror
sync, zero-emoji, no-raw-hex, capture-determinism — do NOT rewrite these, they are the correct tool),
**~80 still to triage**, 10 already behavioural.
→ Next concrete step: rewrite the 3 vacuous ones behaviourally (mutation-prove each), then work the ~80.

---

## ⏭️ (older cursor, still valid after the above)

**R4 — the block-id collapse (`world/Terrain.jsx:724`).** Placing diamond/gold/iron/coal/lava/glass/cobblestone
all send worker id `3` (stone), while the reverse map at `:585` reads 10-13 as the real ores → **placing a
diamond turns it into stone and persists that to disk; mining it back returns stone. The material is
destroyed.** (`sand:4` also collides with `water:4`.)
**RED-first:** a round-trip property test — for EVERY block type, `place(x) → read back == x`. It must fail
against HEAD. Then give the ores their real ids, resolve sand/water, and make the forward + reverse maps a
**single shared source of truth** so they can never disagree again.

**Then:** X3 (the touch hotbar dead-tap — a one-line `pointerEvents` ship-blocker) → V1 (the 114 vacuous gates)
→ V2/V3 (input-driven E2E).

Full registry + attack order: **`memory/STATUS.md`**.

---

*History of what shipped (v6, v7, W1–W4, the Aspect spine, …) lives in `memory/CHANGELOG.md`. Do not re-add it here.*

## 📍 OWED ocean lived-probe DONE + 3 vacuous gates BEHAVIORAL (2026-07-14/20) — NEXT = triage the ~80 untriaged OR V2·V3 E2E
✅ **OWED ocean LIVED PROBE — DONE (`cbc9f40`→ocean, load ~6).** Paid the RULE-3 debt on the `05082fa`
oceanVisibleNear gate: hardened `scripts/visual/ocean-probe.mjs` FIRST (charter §6.4 hygiene — browser now closes
in a `finally`; vite spawned `detached` so the finally SIGKILLs the whole process GROUP, fixing a real orphan-vite
leak where `server.kill()` only reaped the `npx` wrapper — VERIFIED: re-run left zero leaked vite), then ran it.
4 coast/surface/underwater shots ALL CLEAN — ocean renders at the coast (crisp coastline + animated water/foam),
depth-tint + shore→deep ramp underwater, no black voids / missing chunks / land-bleed → **no coastal regression.**
Caveat: COAST shots only — in-cave suppression is pure-unit-covered (oceanVisibility.test.js), not lived here; an
in-cave shot + the water aesthetic sign-off → Kevin. **2 preview-tab husks (:4196) LISTED for attended `--close`.**
✅ **V1 boss-notif-timer gate — DONE (behavioral).** The vacuous source-grep gate that used to be at
`tests/gates/boss-notif-timer-gates.test.js` (a readFileSync+regex of bossSystem.js) is now REMOVED and
REPLACED: seam-extracted `world/bossNotifTimers.js makeNotifClearTracker`,
wired into `useBossSystem`, + a behavioral `bossNotifTimers.test.js` (fake timers) proving clearAll() cancels
pending timers → no setBossNotification-after-unmount. RED-first (module-missing) + mutation-proven (clearAll
no-op → RED). Deleted the source-grep. unit 2058.
✅ **V1 melee-swing-audio gate — DONE (behavioral).** The vacuous melee-swing-audio-gates source-grep (it
readFileSync+regex'd App.jsx/Components.jsx for `playAttackSounds` strings — proved code STRINGS existed, never
that a swing made a sound) is now REMOVED. M6 #4 regression: `playAttackSounds` was dead code + the swing whoosh
was MISS-ONLY. Seam-extracted the audio composition to `game/attackSounds.js makeAttackSoundPlayer` (playSwing
NOW + playAttack after 100ms, injectable scheduler), wired into App.jsx, + a behavioral `attackSounds.test.js`
(fake timers) proving the swing whoosh fires SYNCHRONOUSLY, the strike after the delay, order swing→attack, and
every swing re-whooshes. RED-first (module-missing) + mutation-proven (drop `playSwing()` → 3 RED). Deleted the
source-grep. unit 2058→2060.
✅ **V1 survival-quests gate — DONE (behavioral), with a RULE-2 correction.** VERIFY-first paid off: this gate was
NOT wholly vacuous — 4 of its 5 tests are genuine DATA-DRIVEN contract tests (import the real QUEST_LIST/MOB_TYPES:
survive_nights quest TYPE exists, moss_brute/emberhusk targeted quests, mobType cross-refs are real, new quests
tier≥2). Only test 5 (the "dawn→survive_nights wiring") was a source-grep (regex of survivalSystem.js/QuestSystem.jsx
for `onNightSurvived`/`if (r)…`). Seam-extracted the real invariant to `world/dawnSurvival.js resolveDawn`: the
survive_nights quest is credited EXACTLY ONCE per genuinely-survived night, gated on the grant descriptor (grant
returns null on a re-fired/duplicate dawn → no double-count). Wired into `useSurvivalMode`, + a behavioral
`dawnSurvival.test.js`. RED-first + mutation-proven (credit keyed on `nightCount>0` instead of the grant result →
duplicate-dawn test RED). Removed test 5 + its dead readFileSync helpers; KEPT the 4 data-driven tests. unit 2060→2062.
**THE 3 KNOWN-VACUOUS GATES ARE ALL BEHAVIORAL NOW.**
**NEXT — no more pre-identified vacuous gates. Pick one:** (a) triage the ~80 untriaged gates (STATUS §V1) — classify
VACUOUS / STRUCTURAL-legit / BEHAVIORAL, then seam-fix any genuinely-vacuous ones; or (b) start V2·V3 input-driven
E2E ("Playable Truth" — the 0-of-11-e2e-fire-a-real-key gap, STATUS §V1/§V2). Per RULE 2, VERIFY each candidate is
actually vacuous before rewriting (survival-quests proved the label is a hypothesis — it was mostly legit).
**OWED (do if `uptime` load < ~10):** ocean LIVED PROBE + B5/B7 VISUAL RE-BASELINE (capture harness hangs at
title-mascot — needs a box-free/Chrome-restart).

## 📍 (prior) B8 spatial-audio FIXED (`e78bd1c`, 2026-07-14) — ALL B8 FIXABLE DONE
✅ **B8 spatial-audio — DONE.** Was "dead until the first hostile spawns." ROOT CAUSE (traced, not the registry's
guess): the SoundProvider context `value` exposes `audioContext.current` + `sounds.current` (REFS read at render),
but they're populated in a mount-effect — a ref mutation doesn't re-render, so consumers got stale undefined/{}
until an UNRELATED re-render; the music effect keys on `activeHostiles`, so the first hostile spawn was the first
such re-render. Fix: `setAudioReady(true)` at the end of the audio-init effect forces one re-render so the value
carries the populated refs immediately. RED-first jsdom (mock Web Audio; consumer sees a defined audioContext
after mount), mutation-proven (setAudioReady the sole RED→GREEN variable). unit 2056→2057. **Aural confirmation
(footsteps audible from start) → a quick Kevin ear (audio can't be verified headlessly).**

**B8 IS COMPLETE (autonomous):** all 5 fixable fixed (fireball, arcane-pierce, alt-tab, ocean-in-caves,
spatial-audio); chest-mining + damage-lockout + camera-shake + B4 mob-AI-2D are → KEVIN-REVIEW (design/feel).

**The A-bis 18-domain confirmed-bug backlog is essentially DRAINED** (B1·B2a-h·B3·B5·B6·B7·B8 all fixed or
correctly routed; B2g boss-persistence stays DEFERRED — needs lived/Kevin). 9 bugs fixed this session +2 earlier
B8; 2 verified-not-autonomous (inventory stale, chest-mining design). unit 1950→2057.

**NEXT — the campaign's next spine per STATUS §V1 (PURE test work, NO browser — ideal under load):** rewrite the
3 known-VACUOUS gates behaviorally + mutation-prove each — `boss-notif-timer-gates`, `melee-swing-audio-gates`,
`survival-quests-gates` (they assert source TEXT / timers, not behaviour). Then triage the ~80 untriaged gates
(STATUS §V1). **OWED (do when `uptime` load < ~10):** the ocean LIVED PROBE + the B5/B7 VISUAL RE-BASELINE (the
capture harness hangs at title-mascot even low load — needs a box-free/Chrome-restart).

✅ **B8 chest-mining → Kevin (design, `verbRouter.test.js` §5-12 explicitly tests LMB→mine); feel/balance
(500ms damage-lockout, camera-shake, B4 mob-AI-2D) → KEVIN-REVIEW.** Verify-before-assert wins, not autonomous.

✅ **B8 alt-tab-stuck-keys — DONE (`92d92ec`).** Held move intents now cleared on blur/tab-hide
(`inputState.clearHeldIntents` + `input/blurReset.js`); RED-first jsdom, mutation-proven. unit 2050.

✅ **B8 alt-tab-stuck-keys — DONE (`92d92ec`).** Held move intents now cleared on blur/tab-hide
(`inputState.clearHeldIntents` + `input/blurReset.js`); RED-first jsdom, mutation-proven. unit 2050.

**NEXT — a genuinely-fixable B8 bug (VERIFY on live HEAD first):** (1) **ocean plane in inland caves**
(~14% frame budget 1.1km from water — find the ocean render, gate it on proximity/altitude; a pure predicate
`shouldRenderOcean(playerPos, waterLevel)` seam + a lived probe); (2) **spatial audio dead until first hostile
spawns** (AudioContext/listener init ordering — find where the listener/context resumes). Then the campaign's
next spine per STATUS (V1 gate-triage / V2·V3 input-driven E2E). B2g boss-persistence stays DEFERRED.

✅ **B5 fully DONE** (dial `712ea78` + stat-stack `7e0f004` + progression-modal `690b070`; inventory-"+"
verified STALE `f332ac7` — 3rd+ stale registry ref caught by verify-before-assert this session).

✅ **B7 DONE — all 4 touch sub-bugs** (colors `d45b698` · stray-tap `83ef50d` · pause-mistap `9f6c422` ·
hotbar-overflow `efa844e`), each RED-first + mutation-proven in `tests/e2e/touch-controls.spec.js`.
**⚠️ SELF-LESSON (still live):** a boot "timeout" was my own broken JSX (a `{/* */}` after `return (` = esbuild
syntax error → broken module). CHECK THE BUILD / console before blaming env load; JSX comments go inside
children or as `//` above the return.

**⚠️ OWED (env-blocked): the VISUAL RE-BASELINE.** Every in-world HUD frame (B5-layout) + `mobile.png` (B7).
The capture harness is UNHEALTHY — it hangs with a puppeteer `ProtocolError` at title-mascot even at low load
(needs a box-free / Chrome restart). When healthy: `npm run test:visual`, HD self-eyeball, re-baseline,
before/after to KEVIN-REVIEW. (The hotbar scale only applies ≤640px, so the 1280px `mobile.png` capture is
likely unaffected by it — only the B7 color fix changed `mobile.png`.)

**NEXT — the confirmed-bug backlog (A-bis) is nearly drained. Remaining = B8's split + deferrals.**
**B8 has 4 FIXABLE bugs (pick ONE, VERIFY on live HEAD first):** (1) **left-clicking a chest MINES it** —
chest + contents deleted, no drop, no confirm (destructive, high-impact; guard the mine action against chest
blocks — likely a clean pure/e2e unit); (2) **alt-tab leaves movement keys stuck ON** (a blur/visibilitychange
handler should clear held move intents — likely PURE + testable); (3) **the ocean plane renders inside inland
caves** (~14% frame budget 1.1km from water — gate the ocean render on proximity/altitude); (4) **spatial
audio dead until the first hostile spawns** (an AudioContext/listener init ordering bug). Recommend chest-mining
(destructive) or alt-tab (pure) next.
**B8 feel/balance → KEVIN-REVIEW-BATCH (do NOT change, add file:line + decision entry):** 500ms global
damage-lockout, camera-shake decays per-frame-not-per-second, **B4** mob-AI-2D→3D (balance-sensitive). **B2g**
boss-persistence stays DEFERRED (needs lived/Kevin verification of the store-owns boss-state rewrite).
**Then:** the campaign's next spine per STATUS — V1 gate-triage / V2·V3 input-driven E2E.

