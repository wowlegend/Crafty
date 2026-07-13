# docs/superpowers — THE MAP

> **Purpose:** this repo has **142 docs / ~44K lines**. An agent that tries to read them all burns its context
> and still gets a stale picture. This is the map. **Read the CANONICAL five. Consult the rest on demand.
> Never treat a HISTORICAL doc as current — several are live traps** (a stale line in the charter regenerated a
> week-sized dead proposal on 2026-07-13).
>
> Status for the whole project lives in **`memory/STATUS.md`** — not here, and not in any doc below.

---

## ✅ CANONICAL — read these, in this order

| Doc | Role |
|---|---|
| **`memory/STATUS.md`** | **Where we are · the open-work REGISTRY · what's next.** THE source of truth. |
| **`memory/ACTIVE_PLAN.md`** | The live cursor: the ONE unit in flight right now. |
| **`LOOP-CHARTER.md`** | The loop's constitution — how it operates, what it may/may not do. |
| **`LOOP-KERNEL-PROMPT.md`** | Durable copy of the `/loop` prompt (cold/git-only recovery source). |
| **`KEVIN-REVIEW-BATCH.md`** | Kevin's decision/eyeball queue. Append; never block on it. |

Plus, at the repo root: **`SOTA-INITIATIVE.md`** = DIRECTION/vision only (**its §3 status block is FROZEN —
superseded by STATUS.md**), and **`CLAUDE.md` → `.agent/AGENTS.md`** = the project's agent constitution.

---

## 📐 SPECS — design of record (consult when building the thing it describes)

**Live / still-governing:**
- `crafty-coherence-pillars.md` — **P0–P5, the taste bounds on every addition.** Read before any look-bearing work.
- `2026-06-28-crafty-control-scheme-design.md` — **Option A picked by Kevin**; the 4 A-enhancements are
  AUTHORIZED loop work and **still unbuilt** (STATUS §C1).
- `2026-06-29-crafty-spell-vfx-sota-redesign.md` — the v7 spell language (shipped).
- `2026-06-17-crafty-sota-rebuild-design.md` — the W1–W4 rebuild design (shipped).
- `2026-06-14-crafty-next-levers-backlog.md` — ⚠️ its quick-wins are HARVESTED, but its **4 MILESTONE levers**
  are still the best statement of the remaining depth gap (STATUS §E). Its own premises were systematically
  over-optimistic — verify every claim against code.
- `2026-06-13-crafty-world-design-hybrid.md` · `2026-06-02-crafty-s2-game-design-design.md` — world + game design of record.
- `2026-06-01-crafty-s1c-ui-system-brief.md` + `-m3-icon-registry-contract.md` — **the LOCKED bold-flat UI system.**
- `2026-05-30-crafty-visual-direction-design.md` — the visual direction (note: the restrained-grade lock was
  REVERSED 2026-06-17; glowier is authorized).

**Shipped, historical reference:** the four Aspect designs (`s2b1-wildheart`, `s2b2-voidhand`, `s2b3-soulbind`,
`s2b4-elemancer`), `72-verb-router-design`, `touch-input-design`, `ux-legibility-design`,
`mob-distinctness-design`, `mob-variety-pass`, `music-motifs-v2`, `audio-aspect-sfx-design`,
`aspect-ux-clarity`, `soulbind-feel-pass`, `s3-demonolith-design`, `s2b2-m7-look-design`,
`shadow-enable-meshes-design`.

---

## 🔨 PLANS — build contracts (~90 files)

Plans are **per-milestone build contracts**. Once a milestone ships, its plan is **history**. Do not mine an old
plan for "what to do next" — that is what `memory/STATUS.md` is for.

- **Most recent / most relevant:** `2026-06-29-crafty-{de-monolith,spell-vfx-redesign}`,
  `2026-06-20-crafty-biome-flora`, `2026-06-17-crafty-W{1,2,3,4}-*` (the big rebuild, 503 steps),
  `2026-06-15-crafty-world-purpose-sota` (+ the S6–S10 gameplay ladder).
- **Everything dated ≤ 2026-06-16** is shipped-and-historical (S1/S2/S2-B/S3/world/touch/interleaves).
- `2026-06-13-crafty-loot-glow-PARKED.md` — parked by name.

---

## 🔬 RESEARCH — still-actionable findings

- `2026-06-15-crafty-agentic-e2e-testing.md` — ⚠️ **still load-bearing.** Its rec #1 (drive **input** → step →
  assert) is only *half* done: the e2e specs assert store transitions, not real input. Its rec #2 (seeded sim +
  state-hash replay gate) is **not built at all**. See STATUS §V2/§V5.
- `2026-06-15-crafty-codebase-reality-audit.md` — the ranked file:line P0 debt chain (mostly harvested).
- `2026-06-15-crafty-loop-machinery-review.md` — its 12 charter edits were APPLIED. Historical.

---

## 🧾 AUDITS — snapshots (all are PAST-TENSE by construction)

- `AUDIT-2026-06-28-full-status.md` — **the most honest scorecard ever taken of this project**
  (~70% done; and the 0.5%-of-185-features-fully-validated finding). **Its gap list is now folded into
  `memory/STATUS.md`; read STATUS, not this, for what's open.** Much of its list was closed by v6/v7.
- `CODE-REVIEW-2026-06-20.md` (2614 L) — the 39-agent all-file review. Its backlog was driven to zero.
- `2026-06-16-SOTA-TOTAL-AUDIT.md` — **explicitly SUPERSEDED** by the 06-17 rebuild. Historical only.
- `audits/2026-06-17-*` — the 11-agent pre-rebuild element audit (fed W1–W4). Historical.

---

## 🗄️ HISTORICAL — in `memory/`, cited by other docs (do NOT delete; do NOT treat as current)

`IN_DEPTH_AUDIT.md` · `REALITY-AUDIT-2026-05-30.md` · `REALITY-AUDIT-S1-2026-06-02.md` ·
`PRE-S2B-CONTENT-AUDIT-2026-06-03.md` · `STATE-REVIEW-2026-06-10.md` ·
`MONETIZATION-VIRALITY-SCAN-2026-05-30.md` · `S2B1-M2-PERF.md` · `S2B1-M5-MOTION.md` · `S2B2-M2-PERF.md` ·
`SOTA-KICKOFF-PROMPT.md`

*(Each is cited by 1–7 other docs, so they stay in place. They are snapshots, not status.)*

---

## The rule that keeps this map honest

A milestone completing updates **`memory/STATUS.md` + `memory/CHANGELOG.md` + its own plan-doc banner** — and
adds a line here **only if a new doc was created**. Status never gets written into a spec, a plan, an audit, or
the master plan again. That scatter is what this map exists to end.
