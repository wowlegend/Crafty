> **✅ SHIPPED (loop iter 126, 2026-06-13).** `game/spawnPlacement.js` (`resolveSpawnGround` + `isVoidFall` + `spawnTargetY`; 7 tests — incl. a `probeAvailable` param caught on review to preserve the getMobGroundLevel-missing edge byte-exact) + `game/locomotion.js` (`moveSpeed`/`jumpVelocity`/`applyGravity`; 4 tests). Both characterization-FIRST; Player calls them, the imperative setTranslation/velocityY stays. Components 1300 → 1286 LOC; **947 unit (+11) · build · visual 17/17** (spawn/move behavior unchanged — capture completes, player spawns). Commits T1 (spawn) · T2 (locomotion). NEXT = S3-M5 part 3 (the verb-ctx seam / SM-wiring — Player's loop, trap-4-aware, after jsdom characterization).

# S3-M5 (part 2) — Components god-file: the pure kernels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Checkbox steps. Parent: the S3 demonolith spec (S3-M5 row). **Extraction-only — NO behavior change.** Unlike part-1's render leaves, these kernels ARE unit-testable → **characterization-first (charter §2.6): author the kernel's I/O test, then move the inline math out, Player calls the pure fn.**

**Goal:** Pull two pure decision/math kernels out of the `Player` loop into testable `game/*.js` — the **spawn-placement** decision (ground-probe → safe Y, void-fall guard) and the **locomotion** math (move speed, jump velocity, gravity integrate + terminal clamp). The imperative side (`setTranslation`/`velocityY.current = …`/`setLinvel`) STAYS in Player; only the numbers + branches move. Gives the loop its first-ever spawn/locomotion unit characterization (the charter ledger names both).

**Architecture:** Two greenfield pure modules (`game/spawnPlacement.js`, `game/locomotion.js`) — named consts + pure functions, no React/THREE/Rapier. Player imports them and calls them where the inline math is today (Components.jsx ~:803-860 spawn, ~:799/:1005-1022 locomotion). Byte-exact-equivalent: the kernels reproduce the EXACT literals (1.2, 60, 120, 10, 15; 10, 12.0, -32.0, -50.0) so the player spawns + moves identically. The full battery + the visual gate + the capture (the player must still spawn/move) are the behavior-lock; the kernel characterization tests pin the formulas.

**Tech Stack:** new `game/spawnPlacement.js` + `game/locomotion.js` (+ sibling tests); `Components.jsx` (Player calls the kernels); vitest; build.

**Live seams (verified this iteration — Components.jsx):**
- **Spawn** (`:803-860`): void guard `if (spawnPosSet && currentTrans.y < 10) { teleport y=120; spawnPosSet=false }`; freeze `if (!isWorldBuilt) teleport y=120`; else-if `!spawnPosSet`: blockGroundY = scan `worldBlocks.has('0_'+y+'_0')` 150→1; else `physicsY = getMobGroundLevel(0,0)`, if `null||NaN||<=15` → `spawnProbeFails++`; if `<120` teleport y=120 + return (retry); else fall-through; if groundY still null → `60`; `safeY = groundY + 1.2`; setTranslation + camera.
- **Locomotion**: `speed = 10 * loco.moveMult` (`:799`); jump `velocityY.current = 12.0 * loco.jumpMult` (`:1008`); glue `velocityY.current = -0.5` (`:1015`); gravity `velocityY.current += -32.0 * loco.gravityMult * delta` (`:1019`); terminal `if (velocityY.current < -50.0) velocityY.current = -50.0` (`:1021`); ledge-vault `velocityY.current = 8.5` (form-invariant, `:990`).

**Verification note (spawn is off the pinned capture camera):** a spawn regression won't pixel-diff (the diorama camera ignores the player body), but (a) the kernel characterization test pins the decision, (b) the existing physics/store tests exercise the path, (c) a crash times out the capture. Locomotion likewise — the kernel test + battery are the lock.

---

## File Structure

- **Create** `frontend/src/game/spawnPlacement.js` — `SPAWN_*` consts + `isVoidFall(y)` + `resolveSpawnGround(blockGroundY, physicsY, probeFails)` + `spawnTargetY(groundY)`.
- **Create** `frontend/src/game/locomotion.js` — `BASE_MOVE_SPEED`/`JUMP_VELOCITY`/`VAULT_VELOCITY`/`GLUE_VELOCITY`/`GRAVITY`/`TERMINAL_VELOCITY` + `moveSpeed(loco)` + `jumpVelocity(loco)` + `applyGravity(vy, gravityMult, delta)`.
- **Modify** `frontend/src/Components.jsx` — import + call both kernels at the spawn + locomotion sites (replace the inline literals/branches).
- **Create** `frontend/tests/game/spawnPlacement.test.js` + `frontend/tests/game/locomotion.test.js`.

---

### Task 1: `game/spawnPlacement.js` (characterization-first)

- [ ] **Step 1: Write the failing test.** `frontend/tests/game/spawnPlacement.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { resolveSpawnGround, spawnTargetY, isVoidFall, SPAWN_FALLBACK_Y, SPAWN_EYE_OFFSET, SPAWN_PROBE_MAX_FAILS } from '../../src/game/spawnPlacement.js';

describe('spawnPlacement (S3-M5 p2) — the spawn-ground decision (pinned to the old inline logic)', () => {
  it('placed-block ground wins immediately (no probe)', () => {
    expect(resolveSpawnGround(72, 50, 5)).toEqual({ groundY: 72, retry: false, incFails: false });
  });
  it('valid physics ground (>15, not NaN) is used', () => {
    expect(resolveSpawnGround(null, 41, 0)).toEqual({ groundY: 41, retry: false, incFails: false });
  });
  it('invalid physics (null / NaN / <=15) increments fails + retries while under the cap', () => {
    for (const py of [null, NaN, 15, 10]) {
      const r = resolveSpawnGround(null, py, 3);
      expect(r.retry).toBe(true); expect(r.incFails).toBe(true); expect(r.groundY).toBe(null);
    }
  });
  it('at the fail cap, falls back to SPAWN_FALLBACK_Y (no infinite wait)', () => {
    const r = resolveSpawnGround(null, null, SPAWN_PROBE_MAX_FAILS - 1); // +1 reaches the cap
    expect(r).toEqual({ groundY: SPAWN_FALLBACK_Y, retry: false, incFails: true });
  });
  it('spawnTargetY lands the player SPAWN_EYE_OFFSET above ground', () => {
    expect(spawnTargetY(56)).toBe(56 + SPAWN_EYE_OFFSET);
    expect(SPAWN_EYE_OFFSET).toBe(1.2);
  });
  it('isVoidFall triggers below the void threshold (10)', () => {
    expect(isVoidFall(9.9)).toBe(true); expect(isVoidFall(10)).toBe(false); expect(isVoidFall(120)).toBe(false);
  });
});
```

- [ ] **Step 2: Run → fail.** **Step 3: Write the module:**

```js
// Spawn-placement decision (S3-M5 part 2) — extracted PURE from the Player loop. The imperative
// setTranslation/setLinvel stays in Player; this is the math + the branch logic, characterization-
// pinned to the old inline behavior (Components.jsx:803-860). NO React/Rapier.
export const SPAWN_FREEZE_Y = 120;       // hold in the sky until the world builds / on void-fall
export const VOID_RESET_Y = 10;          // y below this = fell through the floor -> reset
export const SPAWN_PROBE_MAX_FAILS = 120; // bounded probe wait (frames) before the fallback
export const SPAWN_FALLBACK_Y = 60;      // if the probe never resolves
export const SPAWN_EYE_OFFSET = 1.2;     // player center this far above ground (instant land)
const PROBE_MIN_Y = 15;                  // physicsY <= this is rejected (origin chunks still streaming)

export function isVoidFall(y) { return y < VOID_RESET_Y; }

// blockGroundY: highest placed-block y at origin, or null. physicsY: raycast ground, or null.
// probeFails: the CURRENT (pre-attempt) fail count. Returns { groundY, retry, incFails } — the
// caller increments its fail ref when incFails, teleports-to-freeze + returns when retry, else
// spawns at spawnTargetY(groundY). Mirrors the old: increment-then-`< MAX`-check semantics.
export function resolveSpawnGround(blockGroundY, physicsY, probeFails) {
  if (blockGroundY != null) return { groundY: blockGroundY, retry: false, incFails: false };
  const invalid = physicsY == null || Number.isNaN(physicsY) || physicsY <= PROBE_MIN_Y;
  if (!invalid) return { groundY: physicsY, retry: false, incFails: false };
  if (probeFails + 1 < SPAWN_PROBE_MAX_FAILS) return { groundY: null, retry: true, incFails: true };
  return { groundY: SPAWN_FALLBACK_Y, retry: false, incFails: true };
}

export function spawnTargetY(groundY) { return groundY + SPAWN_EYE_OFFSET; }
```

- [ ] **Step 4: Run → pass.** **Step 5: Wire Player** (Components.jsx:803-860): replace the inline scan/probe/fallback branch with `resolveSpawnGround` + `spawnTargetY` + `isVoidFall` (the void guard) + `SPAWN_FREEZE_Y` (the teleport-y literals). The caller keeps: the worldBlocks scan loop (produces blockGroundY), `if (r.incFails) spawnProbeFailsRef.current++`, `if (r.retry) { teleport(SPAWN_FREEZE_Y); return; }`, `setTranslation(0, spawnTargetY(r.groundY), 0)`. The `< 10` void guard → `isVoidFall(currentTrans.y)`; the two `y: 120` freezes → `SPAWN_FREEZE_Y`.
- [ ] **Step 6: Verify** (suite + build) + **Commit** `feat(s3-m5): spawnPlacement.js — the spawn-ground decision kernel (characterization-first)`.

---

### Task 2: `game/locomotion.js` (characterization-first)

- [ ] **Step 1: Write the failing test.** `frontend/tests/game/locomotion.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { moveSpeed, jumpVelocity, applyGravity, BASE_MOVE_SPEED, JUMP_VELOCITY, GRAVITY, TERMINAL_VELOCITY } from '../../src/game/locomotion.js';

describe('locomotion (S3-M5 p2) — movement math (pinned to the old inline literals)', () => {
  it('move speed = 10 * moveMult', () => {
    expect(moveSpeed({ moveMult: 1 })).toBe(10);
    expect(moveSpeed({ moveMult: 1.3 })).toBeCloseTo(13);
    expect(BASE_MOVE_SPEED).toBe(10);
  });
  it('jump velocity = 12 * jumpMult (hawk higher, golem lower)', () => {
    expect(jumpVelocity({ jumpMult: 1 })).toBe(12);
    expect(jumpVelocity({ jumpMult: 1.4 })).toBeCloseTo(16.8);
    expect(JUMP_VELOCITY).toBe(12.0);
  });
  it('gravity integrates vy += -32*gravityMult*delta', () => {
    expect(applyGravity(0, 1, 0.1)).toBeCloseTo(-3.2);
    expect(applyGravity(-3.2, 1, 0.1)).toBeCloseTo(-6.4);
    expect(GRAVITY).toBe(-32.0);
  });
  it('clamps at terminal velocity (-50)', () => {
    expect(applyGravity(-49, 5, 0.5)).toBe(TERMINAL_VELOCITY); // would overshoot -> clamped
    expect(TERMINAL_VELOCITY).toBe(-50.0);
  });
});
```

- [ ] **Step 2: Run → fail.** **Step 3: Write the module:**

```js
// Locomotion math (S3-M5 part 2) — extracted PURE from the Player loop (Components.jsx:799/1005-1022).
// The velocityY.current assignments stay in Player; these are the numbers. Pinned to the old literals.
export const BASE_MOVE_SPEED = 10;     // horizontal speed before the form move-mult
export const JUMP_VELOCITY = 12.0;     // grounded jump impulse before the form jump-mult
export const VAULT_VELOCITY = 8.5;     // the ledge-vault hop (form-INVARIANT)
export const GLUE_VELOCITY = -0.5;     // small downward force to stay glued to slopes/stairs
export const GRAVITY = -32.0;          // per-second gravity accel before the form gravity-mult
export const TERMINAL_VELOCITY = -50.0; // fall-speed clamp

export function moveSpeed(loco) { return BASE_MOVE_SPEED * loco.moveMult; }
export function jumpVelocity(loco) { return JUMP_VELOCITY * loco.jumpMult; }
export function applyGravity(vy, gravityMult, delta) {
  const next = vy + GRAVITY * gravityMult * delta;
  return next < TERMINAL_VELOCITY ? TERMINAL_VELOCITY : next;
}
```

- [ ] **Step 4: Run → pass.** **Step 5: Wire Player:** `:799` `const speed = moveSpeed(loco)`; `:1008` `velocityY.current = jumpVelocity(loco)`; `:1015` `velocityY.current = GLUE_VELOCITY`; `:1019-1021` `velocityY.current = applyGravity(velocityY.current, loco.gravityMult, delta)`; `:990` `velocityY.current = VAULT_VELOCITY`. (Import the consts/fns.)
- [ ] **Step 6: Verify** + **Commit** `feat(s3-m5): locomotion.js — move/jump/gravity math kernel (characterization-first)`.

---

### Task 3: Verify + close-out

- [ ] `npx vitest run` (count GROWS by the 2 characterization suites) · `npm run build` clean · `npm run visual:capture` (mount-guard — the player must still spawn; a broken kernel crashes or mis-spawns) → `npx vitest run --config vitest.visual.config.js` **17/17** (movement/spawn behavior unchanged; the FPV/player body is off the pinned camera so this confirms no collateral + no crash). Gate-integrity: no static gate pins the moved literals by path (these are new `game/` modules — verify none of the no-re-mesh/input gates regex the kernels).
- [ ] **Doc close-out:** banner this plan ✅ SHIPPED; update the S3 spec S3-M5 row (part-2 done + Components new LOC); ACTIVE_PLAN (shipped S3-M5 part 2 + NEXT = part 3, the verb-ctx seam / SM-wiring — Player's loop, trap-4-aware, after jsdom characterization) + CHANGELOG; SOTA banner. Final commit `docs(s3-m5): part-2 close-out — Components NNNN; resume = part 3 (verb-ctx/SM-wiring)`, push.

---

## Self-Review

**Spec coverage (S3-M5 part 2):** ✅ pure kernels `spawnPlacement.js` + `locomotion.js`; ✅ characterization-FIRST (the charter ledger named "spawnMob/player-spawn" + the locomotion math — both now have their first unit tests); ✅ Player's loop shrinks AROUND (the imperative stays, the math/decisions leave); the SM-wiring/verb-ctx is part 3 (not here).

**Byte-exactness:** every literal preserved (1.2/60/120/10/15; 10/12/-32/-50/8.5/-0.5) — the tests assert the exact consts; the battery + capture lock end-to-end behavior. Reverts clean (extraction-only).

**Placeholder scan:** none — exact paths/code; the wire-Player steps cite exact line literals.

**Type/name consistency:** `resolveSpawnGround(blockGroundY, physicsY, probeFails) → {groundY, retry, incFails}` identical at def/test/caller; `applyGravity(vy, gravityMult, delta)` matches the caller (`loco.gravityMult`, `delta`); the consts' values match the inline literals exactly.
