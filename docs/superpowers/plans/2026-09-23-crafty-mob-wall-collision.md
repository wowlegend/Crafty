# Mobs Respect Walls Implementation Plan (QUEUE P1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hostile mob can no longer walk up a wall taller than it can step: it routes around through the
local grid when it can, slides along the wall when it cannot, and never rises onto a wall top it was not
able to climb — so a player-built wall is a defense.

**Architecture:** The worker's Step 4 (`workers/ai.worker.js`) moves `x, z` with no height check, and the main
thread snaps `y` to the top surface (a ray cast down from y = 255), so any unreachable goal turns into a wall
climb. Two pure functions fix it, both in a new `game/localPath.js` the worker imports: `findLocalPath`
(the existing 9×9 A*, extracted, returning the best PARTIAL path when the goal is unreachable) and
`stepAllowed`/`clampMove` (refuse a move into a cell more than STEP_UP above the mob's own, sliding along the
free axis). Spiders keep climbing — the genre's convention, and the only mob whose speed multiplier already
marks it as the agile one — stated as data (`CLIMBERS`).

**Tech Stack:** plain JS module, vitest, the real ai.worker.js driven through the `self` shim.

**Spec:** `docs/superpowers/sota-2026-09/QUEUE.md` §P1 (this is a defect fix; the queue row is the spec).

## Global Constraints

- The A* step rule is unchanged: a rise of more than 1.25 blocks is a wall (`STEP_UP = 1.25`).
- The grid framing is unchanged: cell `(gx, gz)` is world `(round(mobX) - 4 + gx, round(mobZ) - 4 + gz)`,
  row-major `gz * 9 + gx`, exactly as `AIWorkerSystem` builds it and `steerGoalCell` reads it.
- No new dependency. AST-safe edits. No emoji in `src/`.

## Review Focus

1. A mob charging (brute, SHOULDER_CHARGE_SPEED) moves more than one cell in a tick — the check must not let a
   fast move jump the wall: test a charge into a wall.
2. A mob already standing ON a wall top (spawned there) must be free to step DOWN: only rises are refused.
3. A wall with a gap must still be routed through the gap (the partial-path change must not break a full path).
4. A goal outside the grid (player 20 blocks away behind a long wall): the mob must make progress along the
   wall, not freeze in place forever — the partial path picks the reached cell nearest the goal.
5. No heightGrid (a wandering mob): unchanged behaviour, stated as a blind spot.

---

### Task 1: `game/localPath.js` — the partial-path A* and the step rule, pure

**Files:**
- Create: `frontend/src/game/localPath.js`
- Create: `frontend/tests/gates/mob-wall-gates.test.js`
- Modify: `frontend/src/workers/ai.worker.js` (import it; delete the inline `findAStarPath`)

**Interfaces:**
- Produces: `STEP_UP = 1.25`, `GRID = 9`, `CLIMBERS: Set<string>`,
  `findLocalPath(heightGrid, sx, sz, ex, ez) -> Array<[gx, gz]> | null` (a full path when the goal is
  reachable, else the path to the reached cell nearest the goal, else null when no neighbour is reachable),
  `clampMove(heightGrid, fromX, fromZ, toX, toZ, climber) -> { x, z, blocked }`.

- [ ] **Step 1: Failing tests** — on synthetic grids: a gap in a wall is routed through; an unbroken wall gives
  a partial path ending at the reachable cell nearest the goal (not null, not through the wall); a single
  wall cell straight ahead is walked around; `clampMove` refuses a move into a cell 2 blocks up, slides along
  the free axis, allows any step down, and allows everything for a climber.
- [ ] **Step 2: Run → FAIL** (module missing).
- [ ] **Step 3: Implement** — move the A* verbatim, add best-node tracking (min heuristic, then min g).
- [ ] **Step 4: Run → PASS.**

### Task 2: the worker uses them, proven across REAL ticks

- [ ] **Step 1: Failing loop test** in `mob-wall-gates` — the real worker, a world heightmap with a 3-high wall
  between a zombie and the player, the grid rebuilt EVERY tick from the mob's position exactly as
  `AIWorkerSystem` builds it: over 200 ticks the zombie's ground height (the heightmap under it) never exceeds
  the ground it started on + STEP_UP; with a gap in the wall it reaches the player's side; a spider in the
  same world does cross. A brute's shoulder charge into the wall does not pass it.
- [ ] **Step 2: Run → FAIL** (today: the zombie walks onto the wall).
- [ ] **Step 3: Implement** — Step 3 calls `findLocalPath`; Step 4 routes the final move through `clampMove`
  when a grid is present.
- [ ] **Step 4: Run → PASS**, lint, full unit suite, build.
- [ ] **Step 5: Mutation-prove** — the partial path removed (null on an unreachable goal); STEP_UP ignored in
  clampMove; the slide removed (a blocked move freezes instead of sliding); climbers blocked too; the worker
  bypasses clampMove.
- [ ] **Step 6: Commit** with call-site counts; queue the in-game check (a built wall under a real night siege)
  as the stated blind spot.
