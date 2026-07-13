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

## 📌 IN FLIGHT RIGHT NOW

**Harness-first tranche** (must land before the build tranche, so the build is actually verifiable):
1. ▣ **Doc consolidation** — `memory/STATUS.md` (new, canonical) + `docs/superpowers/INDEX.md` (the map) +
   role banners on the competing surfaces. *This file is part of that change.*
2. ▢ **SOTA loop rewrite** — LOOP-CHARTER + LOOP-KERNEL to mid-2026 harness practice (context-reset > compaction;
   evaluator ≠ generator; the ANTI-VACUOUS-GATE rule; doc-gardening; the session-close GitHub ritual).
3. ▢ **CI + pre-push hook** — verified absent today (`no .github/workflows`, no `core.hooksPath`) while Vercel
   auto-deploys every push, so a red push ships live.

**Then the build tranche** begins at **R1** (the quest multi-claim reward-theft bug — RED-first).

---

## ⏭️ NEXT UNIT

**R1 — quest multi-claim.** Write the behavioral test FIRST (two completed quests, one `Q` press → assert BOTH
rewards grant AND both ids land in `completedQuestIds`). It **must go RED against HEAD** before any fix. A
green-on-day-one version is a rubber stamp and the slice is void.

---

## 🔎 Open background work

- Workflow `wdqzgav3q` — exhaustive mining of all 142 `docs/superpowers` files (verify each claimed-open item
  against live code). **Awaiting completion; its deltas get folded into `STATUS.md` §2, not into this file.**
- Backfill agent — the `specs/` lane (it errored in the workflow: the `specs/s1c-ui-reference/` dir holds two
  **PNG binaries** that a text-reader choked on).

---

*History of what shipped (v6, v7, W1–W4, the Aspect spine, …) lives in `memory/CHANGELOG.md`. Do not re-add it here.*
