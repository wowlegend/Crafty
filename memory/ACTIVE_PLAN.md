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

## ⏭️ NEXT UNIT (pick up here)

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
