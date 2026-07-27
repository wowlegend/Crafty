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
> **▶ PHASE 2 IN PROGRESS (2026-07-21 → 27) — ~154 findings fixed / 215.** ✅ COMMENT-LIE (34) + ✅ DOC-DRIFT (21) +
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
> **▶ NEW 2026-07-27 — GOVERNING-DOC SOTA PASS (Kevin-requested). PLAN OF RECORD:
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

