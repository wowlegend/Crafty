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

## 📍 B7 stray-tap-freeze SHIPPED (`83ef50d`, 2026-07-14); NEXT = B7 remainder (2 left)
✅ **B7 stray-tap-kills-joystick — DONE.** The touch zone router made EVERY left-half touch a 'move' touch,
so a stray tap while the joystick was held owned the move zone too — and `handleTouchEnd` clears all four
move intents when ANY move touch ends → the tap's release froze the player mid-run. Fix (pure, in
`touchMath.js makeTouchRouter.onStart`): exactly ONE move touch active; a concurrent second left-half touch →
inert `'ignore'` zone (no move/look, no cleanup on release). RED-first pure unit test (router + handleTouchEnd,
no DOM), mutation-proven (drop the single-owner guard → RED). unit 2044→2046. Pure logic, no render change →
no visual baseline impact (clean headless win, no browser needed).

✅ **B7 invisible-controls — DONE (`d45b698`).** The touch joystick knob + all button borders were invisible: bare
`var(--ui-accent)` resolves to space-separated channels `201 168 106` (an invalid CSS color; the hex fallback
never fires because the var is always defined) → transparent knob + dropped borders. Fix: wrapped INK/GOLD in
`rgb(...)` (`ui/TouchControlsSurface.jsx`). Verified in a REAL touch browser via new
`tests/e2e/touch-controls.spec.js` (chromium + `hasTouch` → `maxTouchPoints>0` → `isTouchUIMode()` true):
RED-first `bg rgba(0,0,0,0)` / `border 0px`; GREEN `bg rgb(201,168,106)` / `border 4px`. Mutation-proven
(cp-backup revert to bare var → RED). unit 2044. **The `mobile.png` touch baseline now shows the OLD invisible
knob → joins the owed re-baseline batch.**

**⚠️ VISUAL RE-BASELINE — still OWED + capture harness is UNHEALTHY.** Attempted `npm run test:visual` at
load 3.48 this iteration; the capture hung with a puppeteer `ProtocolError` (a single `callFunctionOn` > 180s)
at the **title-mascot** step — the charter's documented recurring infra timeout (needs a box-free / Chrome
restart, NOT just low load). Wrote NO fresh frames (fail-loud `complete:true` sentinel guards the diff, so no
false-green). OWED frames: every in-world HUD frame (explore-day/night, hearth, landmark, ocean-*, …) from
B5-layout + `mobile.png` from B7. When the harness is healthy: `npm run test:visual`, HD self-eyeball,
re-baseline, add the before/after contact sheet to KEVIN-REVIEW.

**NEXT — B7 remainder (2 sub-bugs left) → then B5 modal-overflow → then B8 feel/balance (KEVIN).**
(1) the Pause hit-button is disjoint from the glyph + covers the Settings gear → tapping Settings pauses —
VERIFY the real hit-target on live HEAD first (the registry's `touchHandlers.js:39-44` ref is STALE — it
points at look-zone camera code; the pause glyph is at `TouchControlsSurface.jsx:76 right:64`, and the hit
targets are in `ui/TouchControls.jsx`'s `isButton`/button-rect logic). (2) hotbar overflows the phone
viewport — 9 slots × `w-[62px]` + gap-2 + p-2.5 ≈ 642px centered on a 390px phone (`ui/GameHud.jsx:20-24`);
measurable via the touch e2e (all 9 `[data-hotbar-block]` rects within [0, viewportWidth]); the fix is a
taste-adjacent responsive-shrink/scroll call — pick the conventional mobile approach + note it for Kevin.
Use the `tests/e2e/touch-controls.spec.js` pattern (chromium + hasTouch + a mobile viewport). B5
modal-overflow remainder: Progression header off-screen (`ui/SpellUpgradePanel.jsx:40`), Inventory "+" below
fold (`ui/GamePanels.jsx:252`).

## 📍 (superseded) B5 stat-stack layout SHIPPED (`7e0f004`, 2026-07-14)
✅ **B5 parts 1+2 (health-bar collision + ribbon) — DONE.** Moved the stat stack from `top-16 left-4`
(buried under the QuestTracker panel) to **bottom-left** + `flex flex-col gap-2 w-44`. Verified in a REAL
browser via new `tests/e2e/hud-layout.spec.js` (measures rendered geometry): RED-first health at (16,72)
inside the quest panel; GREEN health at (16,736), mana below at (16,764), clear of the panel. Lived e2e
geometry gate (stronger than a pixel diff for this bug), mutation-proven (className is the sole RED→GREEN
variable). **The forcePlay/HUD-mount lesson:** the in-game HUD DOM needs the world FULLY built + `active`
re-asserted in a poll (the optimistic `active` gets reset by the input controller's mount-time pointer-lock
sync). `bootDev` → wait `isSpawnChunkLoaded` (90s, load-sensitive) → poll `forcePlay` until `stat-health`
attaches → measure. Existing e2e read the store, never the HUD DOM — this is the first lived HUD-DOM gate.
**⚠️ VISUAL RE-BASELINE OWED:** the gameplay HUD baselines (explore-day/night, hearth, landmark, ocean-*,
etc.) still show the OLD buried position; a `npm run test:visual` re-capture is owed once machine load < ~10
(was ~24 — the capture harness times out above that). Intended §4 improvement (health bar now visible),
batched for Kevin in KEVIN-REVIEW with the before/after. (DebugOverlay is dev-only `import.meta.env.DEV`, so
prod bottom-left is clean; any capture overlap is dev-chrome, not a shipped collision.)

**B5 REMAINDER (smaller, separate — a modal-overflow class, own probe, LOW):** the Progression panel header
(incl. close X) off-screen at 1280×800 (`ui/SpellUpgradePanel.jsx:40`); the Inventory attribute "+" buttons
below the fold, no scroll (`ui/GamePanels.jsx:252`).

**NEXT — B7 (touch is visually + functionally broken).** Per the loop prompt: puppeteer, iPhone-13 viewport
via `browserName: 'chromium', hasTouch: true` (NOT `devices[...]`). Transparent joystick knob, disjoint pause
button, hotbar overflow. RED-first via the touch probe (`scripts/visual/touch-probe.mjs` pattern) or a
Playwright touch spec. Then the B5 modal-overflow remainder, then B8 feel/balance → KEVIN-REVIEW-BATCH.

## 📍 (superseded) B5 — part 3 (DIAL) SHIPPED (`712ea78`, 2026-07-14)
✅ **Part 3 (day/night dial phase) — DONE.** The dial was a quarter-cycle (90°) out of phase. The offset
`-180` assumed `cf=0` was midnight, but the game's real clock (`dayNight.isDayAtUnit`) is day=`[0,600)`.
Fix: pure `dayPhase.markerAngleDeg` seam with offset `-90` + a `markerQuadrant` geometry helper; RED-first
against the REAL clock, mutation-proven, wired both HUD sites. unit 2040→2044.
**⚠️ RECORD CORRECTION (verify-before-assert lesson):** mid-analysis I briefly concluded "the dial is
correct" because I anchored on `dayPhase.js`'s OWN comment (which mislabels `cf=0` as midnight) and the
math was self-consistent with that mislabel. Running the two modules TOGETHER (cycleFraction vs
`isDayAtUnit`) exposed a 7/12 glyph-vs-horizon desync → the original registry diagnosis ("90° out of
phase") was RIGHT; my read-the-comment detour was the trap. The oracle was RUNNING it, not reading it.

**NEXT — B5 parts 1+2 (the layout lies; need a PUPPETEER probe, no pure oracle):**
(1) health/mana stat stack `HUD.jsx:547 absolute top-16 left-4 z-20` COLLIDES with QuestTracker
`QuestSystem.jsx:437 absolute top-4 left-4 z-20` (same z, later in DOM → covers the health bar).
(2) `StatBar.jsx:18` root is `inline-flex` → the stat-stack's `space-y-2` is a no-op → 7 bars ribbon
horizontally.
**HUD zone map: occupied = top-3/14 right (coins/dial), top-4 left (quest tracker), top-12/center +
top-1/2 center, bottom-4 center (hotbar). BOTTOM-LEFT is FREE.**
**RECOMMENDED (autonomous, prompt-authorized): move the stat stack to bottom-left (conventional RPG
health placement, non-colliding) AND fix the ribbon (`flex flex-col gap-2`, or StatBar `flex` not
`inline-flex`). RED-first via a PUPPETEER probe on the managed port 4179 `--strictPort` (getBoundingClientRect
+ elementFromPoint at the health-bar centre = the health bar, not the quest panel; bars stack vertically) —
browser.close in a `finally`; `kill-test-procs.sh` after. Then B7 (touch).**
