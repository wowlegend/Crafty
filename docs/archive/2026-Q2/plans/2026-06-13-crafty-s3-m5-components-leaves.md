> **✅ SHIPPED (loop iter 124, 2026-06-13).** Byte-exact line-range slices: HUD chrome (MinecraftHotbar + GameUI) → `ui/GameHud.jsx` (HUD.jsx repointed); the FPV player-render cluster (ProceduralWeapon + RibbonTrail + StableMagicHands + spell hand FX) → `render/playerRender.jsx` (consolidated the plan's 2 render cuts into one — StableMagicHands orchestrates the rest intra-module; Player repointed). 10 now-dead imports pruned. Dep-analysis confirmed zero missed module-local consts (the SPELL_UPGRADES guard). **Components 1812 → 1300 LOC (−512).** 936 unit · build · visual 17/17 (byte-identical HUD; the off-frame FPV hands verified by the capture completing — no mount-crash). Zero gate churn. Commits T1 (HUD) · T2 (renders). NEXT = S3-M5 part 2 (pure kernels `spawnPlacement.js` / `locomotion.js`).

# S3-M5 (part 1) — Components god-file: the render + UI leaves Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Checkbox steps. Parent design-of-record: `docs/superpowers/specs/2026-06-11-crafty-s3-demonolith-design.md` (S3-M5 row + the 5-trap catalog). **Prime directive: extraction-only — NO behavior change.**

**Goal:** Shrink the biggest god-file (`Components.jsx`, 1812 LOC) from its EDGES — move the self-contained render leaves (weapon/trail/hands) → `render/` and the HUD chrome (hotbar/GameUI) → `ui/`, byte-identically. The dangerous `Player` loop (:163-1378) is NOT touched (it's the last sub-part of S3-M5). ~500 LOC leaves the file.

**Architecture:** The proven S3 byte-exact anchored-slice method (35+ Aspect-era pulls + S3-M1..M4): a Python slice by start/end anchor strings (the file is the single source of truth — no hand-transcription), the new module gets a computed import header + `export`, the source loses the block, importers repoint. **NO new `<System/>` siblings (trap-4) — these are leaf components Player/GameScene already render as children, so moving them + repointing the import is behavior-neutral.** Each move does a DEP-COMPLETENESS grep FIRST (the iter-101 SPELL_UPGRADES lesson: a moved symbol must carry its MODULE-LOCAL const deps, not just its imported symbols — esbuild won't catch an undefined-at-runtime ref).

**Tech Stack:** `Components.jsx` → new `render/*.jsx` + `ui/*.jsx`; vitest (the full battery as the behavior-lock — these are render/UI leaves, so the VISUAL gate is the primary proof: byte-exact move → 17/17 unchanged); `npm run build` (catches broken imports + the Vite graph).

**Live structure (verified this iteration — `Components.jsx`):**
- UI chrome: `MinecraftHotbar` React.memo (:77-~116, ~40 LOC) · `GameUI` export (:134-162, ~30 LOC). (`PositionTracker` :117 stays — it's a store-writer, not chrome.)
- Render leaves: `ProceduralWeapon` export (:1379-~1504) · `ProceduralRibbonTrail` export (:1505-~1626) · `StableMagicHands` (:1627-~1794) · `SpellHandEffects` (:1795) · `SpellLeftHandEffects` (:1810-EOF).
- `Player` (:163-1378) — the core loop; UNTOUCHED this milestone.
- **The 5 leaf renders are `export`ed → grep ALL importers across `src/` before moving (repoint them same-commit).** The 2 UI are: `MinecraftHotbar` (not exported — used only by `GameUI`/Player locally) · `GameUI` (exported).

---

## File Structure

- **Create** `frontend/src/render/proceduralWeapon.jsx` — `ProceduralWeapon` + `ProceduralRibbonTrail` (the weapon cluster).
- **Create** `frontend/src/render/playerHands.jsx` — `StableMagicHands` + `SpellHandEffects` + `SpellLeftHandEffects` (the hands cluster).
- **Create** `frontend/src/ui/GameHud.jsx` — `MinecraftHotbar` + `GameUI` (the HUD chrome).
- **Modify** `frontend/src/Components.jsx` — delete the moved blocks; import the moved symbols back where `Player`/exports need them.
- **Modify** any other importers of the moved `export`s (grep-found) — repoint to the new paths.

---

### Task 1: Extract the UI chrome (lowest-dep first) → `ui/GameHud.jsx`

**Files:** Create `frontend/src/ui/GameHud.jsx`; Modify `frontend/src/Components.jsx` (+ importers).

- [ ] **Step 1: Map deps + importers.** `cd /Users/kz/Code/Crafty/frontend`. For `MinecraftHotbar` + `GameUI`: (a) `grep -rn "import.*GameUI\|import.*MinecraftHotbar" src/` (who imports them); (b) read both component bodies + list every symbol they reference (hooks, `useGameStore`, icons, tailwind classes, any module-local const/helper in Components.jsx like `MOTIF_COOLDOWN_SEC` or theme tokens). **Every referenced module-local symbol must either move too or be imported (the SPELL_UPGRADES lesson).**
- [ ] **Step 2: Slice + write the module.** Use a Python anchored-slice (start = `const MinecraftHotbar = React.memo(`, end = the matching close; same for `export const GameUI =`) → `ui/GameHud.jsx` with a computed import header (React, useGameStore, icons, etc. per Step 1) + `export` on both. Delete the two blocks from `Components.jsx`.
- [ ] **Step 3: Repoint.** In `Components.jsx`, add `import { GameUI, MinecraftHotbar } from '../ui/GameHud'` IF `Player` or other in-file code uses them (it does — `MinecraftHotbar` is rendered by Player/GameUI; `GameUI` re-exported if external importers exist). Update the grep-found external importers of `GameUI` to `'../ui/GameHud'` (or keep a re-export shim in Components if many — prefer direct repoint).
- [ ] **Step 4: Verify.** `npx vitest run` (count HOLDS) · `npm run build` (clean — catches a missed import) · then the visual capture + gate in Task 4. Commit `refactor(s3-m5): HUD chrome (MinecraftHotbar + GameUI) -> ui/GameHud.jsx (byte-exact)`.

---

### Task 2: Extract the weapon renders → `render/proceduralWeapon.jsx`

- [ ] **Step 1: Deps + importers.** `grep -rn "ProceduralWeapon\|ProceduralRibbonTrail" src/` (importers — likely `Player` + maybe `BeastAvatar`/render). List their referenced symbols (THREE, `useFrame`, `useRef`, any weapon-geometry consts, `getWeaponBaseDamage`? probably not — render-only). Carry/import every module-local dep.
- [ ] **Step 2: Anchored-slice** `ProceduralWeapon` (:1379) + `ProceduralRibbonTrail` (:1505) → `render/proceduralWeapon.jsx` (import header + exports). Delete from Components.
- [ ] **Step 3: Repoint** all importers (Components/Player + grep-found) to `'../render/proceduralWeapon'`.
- [ ] **Step 4: Verify** (vitest count holds + build clean). Commit `refactor(s3-m5): ProceduralWeapon + RibbonTrail -> render/proceduralWeapon.jsx (byte-exact)`.

---

### Task 3: Extract the hands renders → `render/playerHands.jsx`

- [ ] **Step 1: Deps + importers.** `grep -rn "StableMagicHands\|SpellHandEffects\|SpellLeftHandEffects" src/`. These are used by `Player`'s render. List deps (THREE, hooks, `SPELL_COLORS` from GameSystems, spell profiles, any module-local hand-pose const). **Carry module-local consts (the SPELL_UPGRADES lesson) — esp. any pose/offset tables defined in Components.jsx that the hands read.**
- [ ] **Step 2: Anchored-slice** the 3 components (:1627 → EOF) → `render/playerHands.jsx`. Delete from Components.
- [ ] **Step 3: Repoint** Player's import to `'../render/playerHands'`.
- [ ] **Step 4: Verify** (vitest + build). Commit `refactor(s3-m5): StableMagicHands + spell hand FX -> render/playerHands.jsx (byte-exact)`.

---

### Task 4: Verify byte-identical + gate-integrity + close-out

- [ ] **Step 1:** `npx vitest run` — count HOLDS (no test lost; these moves add no tests, the battery is the lock) · `npm run build` clean.
- [ ] **Step 2: Gate-integrity (trap 1/2):** `grep -rn "Components" src/**/*gates*` + the no-re-mesh gate file-lists — confirm NO gate pins the moved leaves by path (the spec says S3-M5-leaves = ZERO gate churn; VERIFY, don't assume). If any gate references a moved symbol's path → repoint same-commit. Confirm no moved file contains `postMessage` joining the elemancer list (trap 2) — these are renders, none should.
- [ ] **Step 3: Visual (the primary proof for render/UI leaves):** `npm run visual:capture` (mount guard — a broken import or undefined ref blanks the app → caught) → `npx vitest run --config vitest.visual.config.js` → **17/17 unchanged, NO diff** (byte-exact moves render identically — the FPV hands/weapon aren't in the pinned-camera fixtures, and the HUD chrome renders the same markup). A diff ⇒ the move changed behavior (likely a missed module-local dep) → STOP + reconcile (do NOT re-baseline — extraction is look-neutral).
- [ ] **Step 4: Doc close-out.** Banner this plan ✅ SHIPPED (part 1); update the S3 spec's S3-M5 row with the part-1 progress + Components new LOC; `memory/ACTIVE_PLAN.md` (shipped S3-M5 part 1 + NEXT = S3-M5 part 2, the pure kernels `spawnPlacement.js`/`locomotion.js`) + `memory/CHANGELOG.md`. Refresh the SOTA banner (god-file count/LOC). Final commit `docs(s3-m5): part-1 close-out — Components NNNN->MMMM; resume = part 2 (kernels)`, push.

---

## Self-Review

**Spec coverage (S3-M5 row, part 1):** ✅ hands/weapon renders → `render/`, hotbar/GameUI chrome → `ui/`; ✅ Player's loop UNTOUCHED (last); ✅ extraction-only / byte-exact (the battery + visual gate are the lock); ✅ the 5 traps checked (Task 4 Step 2 — esp. trap 1 gate-paths + trap 2 forbidden-list, expected zero for renders).

**Risk (the iter-101 lesson, called out per task):** the dep-completeness grep BEFORE each move — a moved component must carry its module-local const deps (pose tables, color maps), not just imported symbols; a missed one builds clean but renders broken (caught by the visual mount-guard, but the grep prevents it). Reverts are clean (extraction-only).

**Placeholder scan:** the slice anchors are exact symbol strings; the dep lists are build-time greps (the method, not a placeholder — each task's Step 1 enumerates them against the live file).

**Type/name consistency:** moved `export const` names unchanged (ProceduralWeapon/RibbonTrail/GameUI) → importers repoint path only, not name; `MinecraftHotbar` (non-exported) moves with `GameUI` (its only user) so its reference stays intra-module in `ui/GameHud.jsx`.
