# S3-M6 — MobModel render extraction (de-god-file the NPC system) Implementation Plan

> **✅ SHIPPED (loop iter 144, 2026-06-13).** Byte-exact 309-line slice of `MobModel`+`HealthBar` (`HEAD:85-393`) → `render/MobModel.jsx` — **byte-equality PROVEN** (diff of moved slice vs HEAD == identical). `OUTLINE_RIM_STRENGTH` (sole user) moved into the new header; 5 now-dead NPC imports pruned; NPCSystem imports MobModel back. **NPC 1115→802 LOC — UNDER the 900 god-file threshold → the last god-file is dissolved.** Behavior-lock: build clean · 1022 unit · character-render trap-3 gate 5/5 (worker-tick anchor intact) · visual **18/18 byte-identical**. Commit `6369a19`.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Extract the `MobModel` (`:85-363`) + `HealthBar` (`:366-393`) render components (~310 LOC) from `SimplifiedNPCSystem.jsx` into `render/MobModel.jsx` — byte-exact (the proven S3 anchored-slice method). This is the high-impact NPC cut: it takes the last god-file **1115 → ~810 LOC, UNDER the 900-LOC god-file threshold** (the de-monolith's stated goal — NPC stops being a god-file).

**Architecture (charter S3 — extraction-only, NO behavior change):** a byte-exact line-range slice of `MobModel` + `HealthBar` → `render/MobModel.jsx`; `SimplifiedNPCSystem` imports `MobModel` back (NPCSystem renders `<MobModel entity={...}/>` at ~:1176-region) + drops the now-dead imports/consts that ONLY the moved block used. The behavior-lock: 18 visual baselines + 1022 unit + the build (rollup = the import-resolution gate).

> **Design-gate findings (iter 143 — why this is SAFE, not the gate-heavy nightmare the spec warned of):**
> - **GATE-FREE for MobModel's render:** the 9 gates that read `SimplifiedNPCSystem.jsx` pin OTHER code — the worker-tick guard + postMessage (`character-render-gates`), allegiance worldBlocks, `zoneSlowMult` (elemancer-noremesh), `rarityBeam` (loot-juice), emoji (static-gates). The only `MobToonMaterial|meshToonMaterial` gate is the BOSS one (reads `render/BossEntity.jsx`). NO gate asserts MobModel's render → **zero gate-repoints** (verified by grep).
> - **TRAP-3 SAFE:** `character-render-gates` finds the FIRST brace-less `if (isCaptureMode()) return;` by `indexOf` (the worker-tick guard at ~:638, which PRECEDES `postMessage`). MobModel (`:85-363`) has NO brace-less `if(isCaptureMode())return;` (its capture checks are braced-multi-condition `:147`, ternary `:227`, JSX `:344`). So removing MobModel does NOT shift the anchor. (Re-verify the gate stays green post-extraction.)
> - **BASELINE SAFE:** capture suppresses mob spawns; `spawnCharacterCloseup` may render a mob via MobModel → byte-exact extraction keeps it pixel-identical. 18/18 must hold (no re-baseline).

**Tech Stack:** byte-exact extraction (Python line-range slice or anchored Edit) + the dep-completeness grep (the SPELL_UPGRADES lesson) + vitest/build/visual battery.

**Spec of record:** `docs/superpowers/specs/2026-06-11-crafty-s3-demonolith-design.md` (S3-M6: "MobModel+HealthBar → render/MobModel.jsx").

---

### Task 1: dep-completeness analysis (the SPELL_UPGRADES lesson — DO THIS FIRST)

**The risk:** rollup catches a missing module-EXPORT, but NOT a free-variable reference to a module-local const/fn that MobModel uses but I didn't move/import. So enumerate them BEFORE cutting.

- [ ] **Step 1:** list what `MobModel`+`HealthBar` (`:85-393`) reference that is NOT a local var/param/import:
```bash
cd /Users/kz/Code/Crafty/frontend
# the block's referenced capitalized identifiers + bareword calls:
sed -n '85,393p' src/SimplifiedNPCSystem.jsx | grep -oE '\b[A-Z][a-zA-Z0-9_]+\b' | sort -u
# cross-check each against the file's imports (top) + top-level const/function defs:
grep -nE '^import|^const [A-Z]|^function [A-Z]|^const [a-z][a-zA-Z]+ =' src/SimplifiedNPCSystem.jsx | head -60
```
- [ ] **Step 2:** classify each referenced symbol → (a) already-imported (re-import in the new file from the SAME source), (b) module-local const/fn used ONLY by MobModel (MOVE it with the block), (c) module-local used by BOTH MobModel and code that stays (EXPORT it from the NPC file OR move to a shared module). Write the list in the commit body.
- [ ] **Step 3:** note the React/R3F/drei imports MobModel needs (useRef, useFrame, useThree?, `<Outlines>` from drei, THREE, useGameStore, isCaptureMode, the mob colors/toon-material const, etc.) — the new file's import header.

### Task 2: the byte-exact extraction

**Files:** Create `frontend/src/render/MobModel.jsx`; Modify `frontend/src/SimplifiedNPCSystem.jsx`

- [ ] **Step 1:** create `render/MobModel.jsx` = the computed import header (from Task 1) + the VERBATIM `:85-393` slice (MobModel + HealthBar + their comment headers) + `export { MobModel };` (HealthBar is internal — MobModel renders it; export only what NPCSystem imports). Move any category-(b) consts with the block.
- [ ] **Step 2:** in `SimplifiedNPCSystem.jsx`: delete the `:85-393` block; add `import { MobModel } from './render/MobModel';`; if any category-(c) symbol was moved, export/import it back. Prune now-dead imports (grep each top import for remaining in-file use; remove zero-use ones — grep-verified, the iter-124 method).
- [ ] **Step 2.5 (capture-safety):** confirm `render/MobModel.jsx` still imports `isCaptureMode` (MobModel uses it at the old :147/:227/:344) so the closeup determinism holds.

### Task 3: verify (the behavior-lock) + close-out

- [ ] **Step 1: full battery** (from `frontend/` — cwd drifts!):
  - `npx vitest run` → 1022 holds (no new tests; extraction-only), 0 failed. **Re-confirm `character-render-gates` (the worker-tick/trap-3 gate) GREEN.**
  - `npm run build` → clean (the import-resolution gate; catches a missing export).
  - `npx vitest run --config vitest.visual.config.js` → **18/18 byte-identical** (byte-exact → no pixel change; character-closeup must match).
  - `wc -l src/SimplifiedNPCSystem.jsx` → ~810 (under 900 → NPC de-god-filed).
  - Arrow-grep the new file (zero-emoji gate).
- [ ] **Step 2: adversarial review (charter §4, big delta):** a Workflow verifying byte-equality (diff the moved slice vs the original), import/dep completeness (no free-var ref left behind), gate-integrity (all 9 NPC-referencing gates still green + the trap-3 anchor intact), and no behavior change. Fix confirmed findings.
- [ ] **Step 3: commit + close-out** — `refactor(s3-m6): MobModel+HealthBar -> render/MobModel.jsx (byte-exact; NPC ~810, de-god-filed)` + banner this plan ✅ SHIPPED + ACTIVE_PLAN/CHANGELOG + SOTA (NPC under god-file threshold — a de-monolith milestone). Next S3-M6: SpawnerSystem pulls; the AIWorkerSystem Vite worker-URL seam (the hardest, LAST).

## Self-Review
**Spec coverage:** S3-M6 "MobModel+HealthBar → render/" ✓. **The design-gate de-risked it:** gate-free + trap-3-safe + baseline-safe all verified by grep (recorded above) — the remaining risk is purely dep-completeness (Task 1 mitigates) + byte-exactness (the slice + 18/18 + build lock it). **Placeholder scan:** the dep list is computed at build (Task 1 commands given) not pre-guessed — honest. **Type consistency:** `import { MobModel }` matches NPCSystem's `<MobModel entity=.../>` usage.

## Execution Handoff
Inline, but Task 1 (dep grep) is MANDATORY before the cut, and Task 3 Step 2 (adversarial review) is warranted (a 310-LOC move out of the load-bearing NPC god-file). The battery (build + 18/18 + the worker-tick gate green) is the behavior-lock — no capture-regen/device needed.
