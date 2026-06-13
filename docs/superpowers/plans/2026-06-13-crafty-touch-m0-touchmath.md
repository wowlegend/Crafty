# Touch Input M0 — Pure touch→intent math (`touchMath.js`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, node-testable touch→intent math library that the touch overlay (M1) will consume — joystick→movement booleans, look-delta→clamped yaw/pitch, and multi-touch identifier→zone routing — with ZERO React / DOM / Three imports.

**Architecture:** A single pure ES module `frontend/src/input/touchMath.js`, same purity contract as the existing `input/inputState.js` (no framework imports → fully unit-testable in vitest, no GPU). It exports (1) `joystickToMove(vecX,vecY,deadzone)` → `{moveF,moveB,moveL,moveR}` via a deadzone + 8-way dominant-octant that GUARANTEES no opposing pair; (2) `applyLook(yaw,pitch,dx,dy,sensitivity)` → clamped `{yaw,pitch}` reusing three PointerLockControls' verbatim constants; (3) `makeTouchRouter()` → a per-`Touch.identifier` zone tracker (left half=move, right half=look) so simultaneous fingers never cross-contaminate. M1 wires these into `setIntent`/`camera.quaternion`; M0 ships none of that.

**Tech Stack:** Plain JavaScript (ESM), vitest. No new dependencies.

**Spec of record:** `docs/superpowers/specs/2026-06-13-crafty-touch-input-design.md` (§2 seam-reuse, §3 traps 4+5, §6 M0 row). This is the charter "characterization-first / lowest-risk-first" opening cut — mirrors every Aspect-era `game/*.js` pure pull.

---

### Task 1: `joystickToMove` + shared movement constants

**Files:**
- Create: `frontend/src/input/touchMath.js`
- Test: `frontend/src/input/touchMath.test.js`

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/input/touchMath.test.js
import { describe, it, expect } from 'vitest';
import { joystickToMove, DEFAULT_DEADZONE } from './touchMath.js';

// Screen-space convention: +x = right, +y = DOWN. Forward (moveF) = up = -y.
const noOpposingPair = (m) => {
  expect(m.moveF && m.moveB, 'never both moveF & moveB').toBe(false);
  expect(m.moveL && m.moveR, 'never both moveL & moveR').toBe(false);
};

describe('joystickToMove', () => {
  it('inside the deadzone → all false', () => {
    const m = joystickToMove(2, -1, DEFAULT_DEADZONE); // mag ~2.2 < default deadzone
    expect(m).toEqual({ moveF: false, moveB: false, moveL: false, moveR: false });
  });

  it('straight up (−y) → moveF only', () => {
    const m = joystickToMove(0, -50);
    expect(m).toEqual({ moveF: true, moveB: false, moveL: false, moveR: false });
    noOpposingPair(m);
  });

  it('straight down (+y) → moveB only', () => {
    const m = joystickToMove(0, 50);
    expect(m).toMatchObject({ moveF: false, moveB: true, moveL: false, moveR: false });
  });

  it('straight right (+x) → moveR only', () => {
    expect(joystickToMove(50, 0)).toMatchObject({ moveR: true, moveL: false, moveF: false, moveB: false });
  });

  it('straight left (−x) → moveL only', () => {
    expect(joystickToMove(-50, 0)).toMatchObject({ moveL: true, moveR: false });
  });

  it('up-right diagonal → moveF + moveR', () => {
    const m = joystickToMove(40, -40);
    expect(m).toMatchObject({ moveF: true, moveR: true, moveB: false, moveL: false });
  });

  it('down-left diagonal → moveB + moveL', () => {
    const m = joystickToMove(-40, 40);
    expect(m).toMatchObject({ moveB: true, moveL: true, moveF: false, moveR: false });
  });

  it('NEVER sets an opposing pair across a full sweep (noisy-thumb invariant)', () => {
    for (let deg = -180; deg < 180; deg += 1) {
      const r = deg * Math.PI / 180;
      noOpposingPair(joystickToMove(Math.cos(r) * 50, -Math.sin(r) * 50));
    }
  });

  it('sector boundary (22.5°) resolves to a diagonal, still no opposing pair', () => {
    const r = 22.5 * Math.PI / 180;
    noOpposingPair(joystickToMove(Math.cos(r) * 50, -Math.sin(r) * 50));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `frontend/`): `npx vitest run src/input/touchMath.test.js`
Expected: FAIL — "Failed to resolve import './touchMath.js'" / `joystickToMove is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// frontend/src/input/touchMath.js
/**
 * touchMath.js — PURE touch→intent math (NO React / DOM / Three imports; node-testable).
 * Consumed by the M1 touch overlay, which feeds these results into setIntent()/camera.quaternion.
 * Spec: docs/superpowers/specs/2026-06-13-crafty-touch-input-design.md
 */

/** Joystick deadzone in px from the (floating) origin — below this, no movement intent. */
export const DEFAULT_DEADZONE = 8;

/**
 * Map a joystick vector (screen-space: +x right, +y DOWN) to the four boolean movement
 * intents via a deadzone + 8-way dominant-octant. Forward (moveF) = up = −y.
 * GUARANTEES the result never sets an opposing pair (moveF&moveB or moveL&moveR).
 * @returns {{moveF:boolean,moveB:boolean,moveL:boolean,moveR:boolean}}
 */
export function joystickToMove(vecX, vecY, deadzone = DEFAULT_DEADZONE) {
  const out = { moveF: false, moveB: false, moveL: false, moveR: false };
  if (Math.hypot(vecX, vecY) < deadzone) return out;
  // atan2(-y, x): 0=right(E), 90=up(N/forward), ±180=left(W), -90=down(S/back).
  const deg = Math.atan2(-vecY, vecX) * 180 / Math.PI;
  let s = Math.round(deg / 45);      // -4..4 (eight 45° sectors)
  if (s === -4) s = 4;               // -180° and 180° both = West
  switch (s) {
    case 0: out.moveR = true; break;                       // E
    case 1: out.moveF = true; out.moveR = true; break;     // NE
    case 2: out.moveF = true; break;                       // N
    case 3: out.moveF = true; out.moveL = true; break;     // NW
    case 4: out.moveL = true; break;                       // W
    case -3: out.moveB = true; out.moveL = true; break;    // SW
    case -2: out.moveB = true; break;                      // S
    case -1: out.moveB = true; out.moveR = true; break;    // SE
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/input/touchMath.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/input/touchMath.js frontend/src/input/touchMath.test.js
git commit -m "feat(touch-m0): joystickToMove — 8-way dominant-octant, no opposing pair (pure)"
```

---

### Task 2: `applyLook` + the PointerLockControls-verbatim clamp constants

**Files:**
- Modify: `frontend/src/input/touchMath.js`
- Test: `frontend/src/input/touchMath.test.js`

- [ ] **Step 1: Write the failing test** (append to the test file)

```js
import { applyLook, LOOK_BASE_SENSITIVITY, MAX_PITCH } from './touchMath.js';

describe('applyLook', () => {
  it('exposes the PointerLockControls-verbatim constants', () => {
    expect(LOOK_BASE_SENSITIVITY).toBe(0.002);       // three PLC base rad/px
    expect(MAX_PITCH).toBeCloseTo(Math.PI / 2 - 0.05, 10); // matches Components:1218 clamp
  });

  it('drag right (+dx) decreases yaw; drag down (+dy) decreases pitch (PLC sign convention)', () => {
    const r = applyLook(0, 0, 100, 100, 1);
    expect(r.yaw).toBeCloseTo(-100 * 0.002, 10);
    expect(r.pitch).toBeCloseTo(-100 * 0.002, 10);
  });

  it('sensitivity multiplies the base rate', () => {
    const r = applyLook(0, 0, 100, 0, 1.5);
    expect(r.yaw).toBeCloseTo(-100 * 0.002 * 1.5, 10);
  });

  it('pitch saturates at +MAX_PITCH and never wraps past the gimbal guard (look far up)', () => {
    const r = applyLook(0, 0, 0, -100000, 1); // huge upward drag
    expect(r.pitch).toBeCloseTo(MAX_PITCH, 10);
  });

  it('pitch saturates at −MAX_PITCH (look far down)', () => {
    const r = applyLook(0, 0, 0, 100000, 1);
    expect(r.pitch).toBeCloseTo(-MAX_PITCH, 10);
  });

  it('yaw is unclamped (wraps freely)', () => {
    const r = applyLook(0, 0, 100000, 0, 1);
    expect(Math.abs(r.yaw)).toBeGreaterThan(Math.PI);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/input/touchMath.test.js`
Expected: FAIL — `applyLook is not a function` / `LOOK_BASE_SENSITIVITY` undefined.

- [ ] **Step 3: Write minimal implementation** (append to `touchMath.js`)

```js
/** Base look sensitivity, rad/px — VERBATIM from three's PointerLockControls (onMouseMove). */
export const LOOK_BASE_SENSITIVITY = 0.002;
/** Pitch clamp — matches PLC (minPolarAngle 0.05) and the controller's defensive clamp (Components:1218). */
export const MAX_PITCH = Math.PI / 2 - 0.05;

/**
 * Accumulate a touch-drag delta into yaw/pitch, mirroring PointerLockControls' math:
 * yaw −= dx·k, pitch −= dy·k, pitch clamped to ±MAX_PITCH (yaw unclamped). k = base·sensitivity.
 * @returns {{yaw:number,pitch:number}}
 */
export function applyLook(yaw, pitch, dx, dy, sensitivity = 1) {
  const k = LOOK_BASE_SENSITIVITY * sensitivity;
  const nextPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch - dy * k));
  return { yaw: yaw - dx * k, pitch: nextPitch };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/input/touchMath.test.js`
Expected: PASS (8 + 6 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/input/touchMath.js frontend/src/input/touchMath.test.js
git commit -m "feat(touch-m0): applyLook — PLC-verbatim yaw/pitch + MAX_PITCH clamp (pure)"
```

---

### Task 3: `makeTouchRouter` — multi-touch identifier→zone routing

**Files:**
- Modify: `frontend/src/input/touchMath.js`
- Test: `frontend/src/input/touchMath.test.js`

- [ ] **Step 1: Write the failing test** (append)

```js
import { makeTouchRouter } from './touchMath.js';

// synthetic Touch-like objects; viewport width 1000 → split at x=500.
const T = (identifier, clientX, clientY) => ({ identifier, clientX, clientY });

describe('makeTouchRouter', () => {
  it('left-half touchstart → move zone; right-half → look zone', () => {
    const r = makeTouchRouter();
    expect(r.onStart(T(1, 100, 400), 1000).zone).toBe('move');
    expect(r.onStart(T(2, 900, 400), 1000).zone).toBe('look');
    expect(r.activeCount).toBe(2);
  });

  it('move-zone onMove returns the vector FROM ORIGIN', () => {
    const r = makeTouchRouter();
    r.onStart(T(1, 100, 400), 1000);
    expect(r.onMove(T(1, 130, 360))).toEqual({ zone: 'move', vecX: 30, vecY: -40 });
  });

  it('look-zone onMove returns the INCREMENTAL delta since the last point', () => {
    const r = makeTouchRouter();
    r.onStart(T(2, 900, 400), 1000);
    expect(r.onMove(T(2, 910, 390))).toEqual({ zone: 'look', dx: 10, dy: -10 });
    // next move is relative to the previous point, not the origin
    expect(r.onMove(T(2, 915, 385))).toEqual({ zone: 'look', dx: 5, dy: -5 });
  });

  it('a look-drag identifier NEVER produces a move vector, even interleaved with a move finger', () => {
    const r = makeTouchRouter();
    r.onStart(T(1, 100, 400), 1000); // move finger
    r.onStart(T(2, 900, 400), 1000); // look finger
    const a = r.onMove(T(2, 950, 420)); // look finger moves
    const b = r.onMove(T(1, 120, 380)); // move finger moves
    const c = r.onMove(T(2, 960, 410)); // look finger moves again
    expect(a.zone).toBe('look');
    expect(b.zone).toBe('move');
    expect(c.zone).toBe('look');
    expect(a).not.toHaveProperty('vecX');
    expect(c).not.toHaveProperty('vecX');
  });

  it('onMove for an untracked id returns null (no crash on stray events)', () => {
    expect(makeTouchRouter().onMove(T(99, 0, 0))).toBeNull();
  });

  it('onEnd releases the id and reports its zone', () => {
    const r = makeTouchRouter();
    r.onStart(T(2, 900, 400), 1000);
    expect(r.onEnd(T(2)).zone).toBe('look');
    expect(r.activeCount).toBe(0);
    expect(r.onMove(T(2, 910, 410))).toBeNull(); // released → untracked
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/input/touchMath.test.js`
Expected: FAIL — `makeTouchRouter is not a function`.

- [ ] **Step 3: Write minimal implementation** (append)

```js
/**
 * A per-Touch.identifier zone router (pure factory; no DOM — feed it Touch-like
 * {identifier,clientX,clientY} objects). Left half of the viewport = 'move' (joystick,
 * vector from origin); right half = 'look' (incremental drag delta). Binding the zone at
 * touchstart for the touch's lifetime guarantees a look-drag never contaminates the move
 * vector (spec §3 trap-4: multi-touch identity).
 */
export function makeTouchRouter() {
  const touches = new Map(); // identifier -> {zone, originX, originY, lastX, lastY}
  return {
    onStart(touch, viewportWidth) {
      const zone = touch.clientX < viewportWidth / 2 ? 'move' : 'look';
      touches.set(touch.identifier, {
        zone, originX: touch.clientX, originY: touch.clientY,
        lastX: touch.clientX, lastY: touch.clientY,
      });
      return { zone };
    },
    onMove(touch) {
      const t = touches.get(touch.identifier);
      if (!t) return null;
      if (t.zone === 'move') {
        return { zone: 'move', vecX: touch.clientX - t.originX, vecY: touch.clientY - t.originY };
      }
      const dx = touch.clientX - t.lastX, dy = touch.clientY - t.lastY;
      t.lastX = touch.clientX; t.lastY = touch.clientY;
      return { zone: 'look', dx, dy };
    },
    onEnd(touch) {
      const t = touches.get(touch.identifier);
      if (!t) return null;
      touches.delete(touch.identifier);
      return { zone: t.zone };
    },
    get activeCount() { return touches.size; },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/input/touchMath.test.js`
Expected: PASS (all 20 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/input/touchMath.js frontend/src/input/touchMath.test.js
git commit -m "feat(touch-m0): makeTouchRouter — per-identifier zone routing (multi-touch safe, pure)"
```

---

### Task 4: Purity static gate + full-battery verification + close-out

**Files:**
- Create: `frontend/tests/gates/touch-purity-gates.test.js`

- [ ] **Step 1: Write the failing test**

```js
// frontend/tests/gates/touch-purity-gates.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = () => readFileSync(resolve(here, '../../src/input/touchMath.js'), 'utf8');

describe('touchMath.js purity (M0 contract — node-testable, no framework)', () => {
  it('has ZERO react / three / R3F / DOM imports (stays pure like inputState.js)', () => {
    const code = src();
    const banned = [/from\s+['"]react['"]/, /from\s+['"]three['"]/, /@react-three/, /from\s+['"].*inputState/];
    for (const re of banned) expect(re.test(code), `must not import ${re}`).toBe(false);
    // no direct DOM globals referenced
    expect(/\bdocument\.|window\.|navigator\./.test(code), 'no DOM globals').toBe(false);
  });

  it('exports the three pure units + the shared look constants', () => {
    const code = src();
    for (const name of ['joystickToMove', 'applyLook', 'makeTouchRouter', 'LOOK_BASE_SENSITIVITY', 'MAX_PITCH', 'DEFAULT_DEADZONE']) {
      expect(code.includes(`export function ${name}`) || code.includes(`export const ${name}`), `exports ${name}`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run to verify it passes** (the impl from Tasks 1-3 already satisfies it — this is a guard, expected GREEN immediately; if RED, the impl drifted)

Run: `npx vitest run tests/gates/touch-purity-gates.test.js`
Expected: PASS (2 tests).

- [ ] **Step 3: Full battery** (the behavior-lock — count must HOLD-OR-GROW, build clean, visual unchanged)

Run (from `frontend/`):
- `npx vitest run` → expected 947 + 22 (20 touchMath + 2 purity) = **969**, 0 failed (re-run once if the flaky Rapier WASM integration test stderrs).
- `npm run build` → clean (M0 is pure, no importers yet — build proves it parses + bundles).
- `npx vitest run --config vitest.visual.config.js` → **17/17 unchanged** (M0 renders nothing; no overlay yet).

- [ ] **Step 4: Commit the gate**

```bash
git add frontend/tests/gates/touch-purity-gates.test.js
git commit -m "test(touch-m0): purity static gate — touchMath stays framework-free"
```

- [ ] **Step 5: Close-out (PERSIST + doc-currency)**

- Banner this plan `✅ SHIPPED`; mark the spec §6 M0 row done.
- Update `memory/ACTIVE_PLAN.md` (M0 shipped + NEXT unit = M1 producer-wiring plan doc).
- Add the touch/mobile stream to the `SOTA-INITIATIVE.md` status banner (a new in-flight milestone stream).
- Add the §8 Kevin-batch items (the verified `gameStarted` latent bug + the 3 touch-UX defaults) to `docs/superpowers/KEVIN-REVIEW-BATCH.md`.
- `git push origin main`.

## Self-Review

**Spec coverage:** M0 row of the spec §6 = "joystick→booleans (deadzone + dominant-octant, no opposing pair); look-delta→yaw/pitch with the shared MAX_PITCH clamp; multi-touch id→zone partition + per-id delta." Task 1 = joystick; Task 2 = look + constants; Task 3 = router; Task 4 = purity gate + verification. ✅ Covered. The §7 unit-test list (no-opposing-pair invariant, clamp saturation, the 3-finger fixture) maps to Task1's sweep test, Task2's saturation tests, Task3's interleave test. ✅

**Placeholder scan:** none — every step has concrete code + exact commands + expected counts.

**Type consistency:** `joystickToMove`→`{moveF,moveB,moveL,moveR}` (matches INTENT_KEYS movement subset, consumed by M1's `setIntent`); `applyLook`→`{yaw,pitch}`; `makeTouchRouter().onMove`→`{zone,vecX,vecY}` (move) | `{zone,dx,dy}` (look) — vecX/vecY feed `joystickToMove`, dx/dy feed `applyLook`. Constants `MAX_PITCH`/`LOOK_BASE_SENSITIVITY`/`DEFAULT_DEADZONE` named identically across tasks. ✅

## Execution Handoff
Recommended: **Inline execution** in the loop (the module is small + fully specified; the loop's per-commit battery is the review). The traps live in M1 (integration) not M0 (pure math), so subagent-driven two-stage review is overkill here.
