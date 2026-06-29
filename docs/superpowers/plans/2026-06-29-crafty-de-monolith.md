# Plan — De-monolith the 3 remaining god-files (Crafty v6 Phase A)

> **Status: ACTIVE (2026-06-29).** Kevin directed de-monolith under full loop authority (v6). Built
> AFTER Phase C tech-debt closed (visual-gate fail-loud + E2E perf + coherence verify all shipped).
> Method: `superpowers:writing-plans` — smallest verifiable slices, characterization-first, each
> individually gated. Ground truth = git `main`. Charter §1/§3 discipline applies (AST-safe; Game-Loop-
> Isolation; NO-RE-MESH; capture-verify any render-touching slice; unit count holds-or-grows; no AI footer).

## Goal + non-goals

- **Goal:** reduce the 3 files >900 LOC by EXTRACTING cohesive units into focused modules, with the
  god-file left as thin wiring/orchestration. Targets (verified 2026-06-29): `Components.jsx` 1345 ·
  `SimplifiedNPCSystem.jsx` 934 · `GameScene.jsx` 933.
- **Behavior is FROZEN.** This is a pure structural refactor — zero behavior/render/timing change. Every
  extraction must keep the full gate green (unit + build + eslint + the 21-state visual capture +
  the e2e smoke + perf-siege). A slice that can't prove byte-identical behavior is reverted, not shipped.
- **Non-goals:** no logic rewrites, no perf "improvements", no API redesign, no dead-code deletion beyond
  what the move makes trivially unreferenced (knip stays 0). Those are separate ticks.

## Why this is safe to do autonomously now

- The codebase has a DENSE characterization net already: ~1896 unit tests, ~75 `tests/gates/*` static
  gates (many assert exact wiring of these very files), a 21-state visual capture gate (now fail-loud,
  C1), an e2e smoke (boots + renders + no runtime throw) and the new perf-siege (no freeze/throw under
  load). A behavior-changing extraction trips at least one. That net is the "characterization test
  before extraction" the charter requires — augmented per-slice where a component lacks coverage.
- Component extraction (move a self-contained component to its own file + import it back) is the lowest-
  risk refactor: no call-site changes, only the module boundary moves.

## Risk-ordered phases (do in order; each PHASE is several one-slice ticks)

### Phase A1 — SimplifiedNPCSystem.jsx (934 → ~thin orchestrator)  [LOWEST RISK, BIGGEST WIN]
It is already a stack of 8 INDEPENDENT components + 1 pure helper, only co-located:
`SpawnerSystem`, `AIWorkerSystem`, `MinimapSyncSystem`, `CombatSystem`, `EnemyProjectileSystem`,
`XPOrbSystem`, `LootSystem`, the `NPCSystem` orchestrator (renders the others), and exported pure
`getItemRarity`. Each is a clean extraction target → `src/systems/<Name>.jsx`.

- **Slice A1.0 — shared seam first.** Grep lines 1-99 for module-local consts/helpers referenced by >1
  system (spawn tables, tuning consts, scratch vectors, ECS world/query handles). Hoist the shared ones
  to `src/systems/_npcShared.js` (or import from their existing home) as a standalone gated slice BEFORE
  moving any system, so later moves are pure relocations. If nothing is shared, skip.
- **Slices A1.1..A1.n — one system per tick**, smallest/most-independent first to build confidence:
  MinimapSyncSystem → XPOrbSystem → LootSystem → EnemyProjectileSystem → SpawnerSystem → AIWorkerSystem →
  CombatSystem. Per slice: (1) confirm a gate already covers it OR add a focused characterization test
  (red→green); (2) move the component verbatim to `src/systems/<Name>.jsx` carrying its imports; (3)
  import it back into SimplifiedNPCSystem; (4) full gate incl. visual capture (these render in the live
  scene but are capture-SUPPRESSED — NPC AI early-returns in capture — so frames must stay byte-identical)
  + perf-siege (proves no runtime break under siege); (5) commit + push.
- **Slice A1.final — getItemRarity** → `src/systems/itemRarity.js` (pure; already exported + has callers).
  Leave `NPCSystem` orchestrator in place importing all systems. Expect SimplifiedNPCSystem ≈ 120-180 LOC.

### Phase A2 — GameScene.jsx (933 → Canvas + thin composition)  [MEDIUM RISK]
A stack of driver components + the Canvas host: `Sun`, `BloomSpikeDriver`, `MoodGradeDriver`,
`SpatialAudioController` (largest, ~285 LOC, audio-occlusion useFrame), `WeatherSystem` (~260 LOC),
`PointerLook`, and the `GameScene` export. Extract drivers → `src/render/<Name>.jsx`, one per tick.
- Watch the shared per-frame SCRATCH vectors at module top (line ~75) — hoist to `src/render/_sceneScratch.js`
  first (A2.0) so SpatialAudio/Weather keep their zero-alloc hot paths intact (Game-Loop-Isolation).
- SpatialAudioController + WeatherSystem are useFrame-driven → after moving, run the relevant gates
  (spatial-sfx-bus-gates, weather-density-gate, master-bus-gates) + visual capture + perf-siege.
- Order: Sun → MoodGradeDriver → BloomSpikeDriver → PointerLook → WeatherSystem → SpatialAudioController.
  Expect GameScene ≈ 250-350 LOC (Canvas + lights + composition).

### Phase A3 — Components.jsx (1345)  [HIGHEST RISK — bounded scope]
Dominated by the `Player` component (≈ lines 92-1315): one giant imperative useFrame controller
(movement, beast-form swap, combat, camera, audio, cooldown mirror). The component itself is NOT safely
splittable (one tightly-coupled imperative loop — splitting it risks Game-Loop-Isolation + ordering bugs).
- **DO NOT extract the Player useFrame body into sub-components.** Instead extract only the PURE HELPERS
  the loop calls (math/geometry/decision functions with no React/Three/store coupling) into
  `src/game/*.js` pure modules with unit tests (red→green), and call them from the loop. This both
  shrinks Components.jsx and ADDS unit coverage. Also extract `PositionTracker` (lines 72-91, a tiny
  self-contained useFrame) → `src/systems/PositionTracker.jsx`.
- Candidate pure helpers to identify by reading the loop: locomotion/velocity math, camera-pose/shake
  math, beast-swap dimension math, aim/target-selection geometry, cooldown-mirror build (some already
  extracted, e.g. buildCooldownMirror). Each helper is its own slice (extract → unit-test → wire → gate).
- Realistic target: Components.jsx into the 900s-low / 800s with helpers peeled off + PositionTracker out;
  getting it well under 900 is the bar, NOT an arbitrary small number. If a helper can't be cleanly
  isolated without behavior risk, leave it and note it — partial is fine, breakage is not.

## Per-slice gate (every tick)
From `frontend/`: `npx vitest run` (holds-or-grows) → `npm run build` → `npx eslint src` → for any
render-touching slice `npm run visual:capture` then `npx vitest run --config vitest.visual.config.js`
(now fail-loud, C1) → `npx playwright test smoke perf-siege` for scene/system slices. Commit one slice,
push, update ACTIVE_PLAN cursor + CHANGELOG at phase boundaries. `git -C /Users/kz/Code/Crafty`; `>|` for
/tmp logs; no `git add -A`; `.state/` untouched; emoji-free src (`->` not the arrow glyph).

## Done = each god-file under 900 LOC with behavior provably unchanged, OR a documented note explaining
the residual that could not be safely extracted. Update CLAUDE.md's architecture-reality LOC line at the end.
