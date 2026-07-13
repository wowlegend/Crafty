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

**The work-of-record is the REGISTRY in `memory/STATUS.md` §2.** Attack order (STATUS §3):
`R1 → V1/V6 → V2/V3 → C1 → D → E → F/G`.

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
