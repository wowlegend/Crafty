# Crafty SOTA — fresh-session kickoff prompt

> Start a NEW Claude Code session with cwd `~/Code/Crafty` (or `~/Code/Crafty/frontend`). First run `/effort ultracode`. Then paste the prompt below.

---

We're kicking off the **Crafty → SOTA initiative**. This continues a brainstorming exercise from a sister thread — the full handoff is in `~/Code/Crafty/SOTA-INITIATIVE.md`.

**Before anything else**, read in full: `SOTA-INITIATIVE.md`, then `memory/ARCHITECTURE.md`, `memory/ROADMAP.md`, `memory/CHANGELOG.md`, and `frontend/package.json`. Then skim the god-files listed in §3. Treat every "SOTA / COMPLETED / verified" claim in the docs as **Gemini's optimistic self-description, not ground truth** — verify against code.

**Mission**: make Crafty *actually* SOTA in every aspect — graphics/aesthetics (my highest bar — super tasteful, premium, distinctive, not generic-voxel), gameplay, architecture, perf, audio, UX — within a **web / iPad / mobile + touch** envelope (NOT GPU-heavy AAA). Everything is open to complete redesign; beyond-SOTA / never-before-seen mechanics & architectures are welcome. Multiplayer + monetization are in scope later. Marcus (8, Chinese-speaking) stays a key user, but this is now a commercial-grade product.

**Process (follow `superpowers:brainstorming` — do NOT jump to code):**
1. **S0 — Reality audit**: author + run a read-only **workflow** per `SOTA-INITIATIVE.md §6` to produce an honest "real-vs-claimed" baseline + prioritized slop/bug list → save to `memory/REALITY-AUDIT-<date>.md`. Use adversarial verification.
2. **S1 — Art-direction brainstorm** (`§7`, my highest bar): **offer the visual companion** (browser mockups/refs/comparisons) as its own message first, then explore visual identity / lighting / post / palette / UI design-system with strong opinionated options — one question at a time. Don't settle for safe defaults.
3. **Lock the vision → write a spec → I approve → then `writing-plans` → implement.** Hard gate: no implementation before an approved design. Stream-by-stream (S0→S1→S2/S3→S4 per `§4`).

**Guardrails**: verify doc-claims vs code; perf for web/iPad/mobile+touch; premium taste on every visual; no new slop (lock vision before building); Marcus joy + Chinese language; no Claude/AI footer in commits; this is its own repo (separate from moneymaker).

Start by confirming you've read the brief, give me your honest first read of the current state, and propose how you'll run S0. Then let's do the visual direction.
