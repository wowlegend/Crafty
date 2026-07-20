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

## 📍 B8 spatial-audio FIXED (`e78bd1c`, 2026-07-14) — ALL B8 FIXABLE DONE; NEXT = campaign spine (V1)
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

