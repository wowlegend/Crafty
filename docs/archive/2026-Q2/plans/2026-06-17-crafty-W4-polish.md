# W4 — Depth & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (- [ ]) syntax.

**Goal:** Land the depth-and-polish slice — movement game-feel (accel/coyote/jump-buffer + touch-nub follow), meaningful biome-gated weather (storm audio + sky-darkening + the mount-time density-bug fix), a minimal-YAGNI item-affix first cut, and shipped boot chrome (favicon/PWA/OG/theme-color + brand-accurate copy) — each visible change validated by a LIVE-LOOK probe, not the pinned capture gate alone.

**Architecture:** Game-feel and weather-gate logic are added as PURE, unit-tested helpers (mirroring `src/game/dodge.js` / `src/game/locomotion.js`) so the math is locked without a GPU; the imperative Player loop (`Components.jsx`) and the R3F `WeatherSystem`/`Atmosphere` (`GameScene.jsx`) consume them via refs + transient `getState()` reads (Game-Loop Isolation — never reactive state in `useFrame`). Storm audio is a self-contained noise-bed module routed through the existing `masterBus` limiter; sky-darkening reuses the existing `mood` pipeline by adding a weather mood-boost the `Atmosphere` driver maxes into `moodTarget`. Item affixes are an additive pure layer over the existing `equipment.js` stat-fold; boot chrome is static `index.html` + two public assets.

**Tech Stack:** React 19, Three 0.172 (R3F 9.5), Web Audio API (masterBus + `makeNoise`), zustand 5 (transient `getState`), Vite 6, vitest (unit) + puppeteer/pixelmatch (visual gate), JavaScript (JSX).

---

## File structure (created / modified + responsibility)

**Created**
- `frontend/src/game/gameFeel.js` — PURE accel/momentum ramp + coyote-time + jump-buffer math (no THREE/store/refs). Style twin of `dodge.js`.
- `frontend/src/game/gameFeel.test.js` — unit lock for the above.
- `frontend/src/game/weatherGate.js` — PURE biome→allowed-precip gate + storm mood-boost + density-from-tier resolver (no THREE/store/refs).
- `frontend/src/game/weatherGate.test.js` — unit lock for the above.
- `frontend/src/audio/stormBed.js` — PURE-over-ctx storm noise+rumble bed factory (mirrors `masterBus.js` testability; fake-ctx unit-testable).
- `frontend/src/audio/stormBed.test.js` — unit lock for the above.
- `frontend/src/game/affixes.js` — PURE minimal item-affix model (roll + stat-merge over `equipment.js`).
- `frontend/src/game/affixes.test.js` — unit lock for the above.
- `frontend/tests/gates/weather-density-gate.test.js` — static gate: WeatherSystem density must NOT be `useMemo([])` (regression lock for the mount-time bug).
- `frontend/tests/gates/boot-chrome-gate.test.js` — static gate: `index.html` has favicon + manifest + apple-touch-icon + OG/Twitter + theme-color, and no `Minecraft` substring.
- `frontend/public/favicon.svg` — brand favicon (bold-flat navy/gold; SVG so it doubles as PWA + apple-touch source).
- `frontend/public/manifest.webmanifest` — PWA manifest (name/short_name/icons/theme/background/display).
- `frontend/scripts/visual/movement-probe.mjs` — LIVE-LOOK: drives real play, ramps WASD, samples `velocityY`/horizontal speed across frames, screenshots, dumps the accel/coyote/jump-buffer telemetry.
- `frontend/scripts/visual/weather-probe.mjs` — LIVE-LOOK: drives real play, teleports to snow vs desert columns, forces rain/snow/storm, screenshots the sky-darkening + correct precip per biome.

**Modified**
- `frontend/src/game/locomotion.js` — add `accelerate()` (ramp helper) re-export shim so the Player loop imports game-feel from the existing locomotion surface (keeps the import site stable). [Task 1]
- `frontend/src/Components.jsx` — consume `gameFeel` in the Player `useFrame`: horizontal-velocity ramp (`currentVelRef`), coyote-time + jump-buffer refs gating the jump branch. [Tasks 2-4]
- `frontend/src/GameScene.jsx` — WeatherSystem: fix mount-time density (recompute on tier), biome-gate precip via `surfaceBlockAt`, write `weatherMoodBoost` to the store on storm, start/stop the `stormBed`. [Tasks 6-9]
- `frontend/src/render/mood.js` — `moodTarget` accepts an optional `weatherBoost` term (maxed in). [Task 8]
- `frontend/src/render/Atmosphere.jsx` — read `st.weatherMoodBoost` and pass into `moodTarget`. [Task 8]
- `frontend/src/store/useGameStore.jsx` — add `weatherMoodBoost: 0` + `setWeatherMoodBoost`; expose `audioContext`/`getMasterBusInput` bridge for the storm bed; (affixes) extend `addToInventory`/equip path to carry an optional `affixes` payload folded by `affixes.js`. [Tasks 5, 7, 10]
- `frontend/src/ui/TouchControls.jsx` — track the live joystick nub offset in a ref + a throttled state, pass `nub` to `TouchControlsSurface`. [Task 11]
- `frontend/src/input/touchHandlers.js` — return the clamped nub offset from `handleTouchMove` so the overlay can render it. [Task 11]
- `frontend/index.html` — favicon/manifest/apple-touch/OG/Twitter/theme-color + replace "Minecraft-style" copy. [Task 12]
- `frontend/src/index.jsx` — CONDITIONALLY DEV-gate the console ring-buffer patch IF W1 did not land it. [Task 13]

---

## Task 1 — Pure game-feel math module (accel ramp + coyote-time + jump-buffer)

Pure, GPU-free, unit-locked — the imperative Player loop consumes these next.

**Files:**
- create `frontend/src/game/gameFeel.js`
- create test `frontend/src/game/gameFeel.test.js`

**Steps:**

- [ ] 1.1 Write the failing test file `frontend/src/game/gameFeel.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  ACCEL_RATE, DECEL_RATE, COYOTE_TIME, JUMP_BUFFER,
  rampAxis, rampVelocity, coyoteOk, bufferOk,
} from './gameFeel.js';

describe('gameFeel constants', () => {
  it('exposes tuned ramp + grace windows', () => {
    expect(ACCEL_RATE).toBeGreaterThan(0);
    expect(DECEL_RATE).toBeGreaterThanOrEqual(ACCEL_RATE); // stops faster than it starts
    expect(COYOTE_TIME).toBeCloseTo(0.1);   // ~100ms grace after leaving ground
    expect(JUMP_BUFFER).toBeCloseTo(0.12);  // ~120ms pre-land queue
  });
});

describe('rampAxis', () => {
  it('moves current toward desired by accel*delta when speeding up', () => {
    // from 0 toward 10, accel 60/s, delta 0.1 -> +6
    expect(rampAxis(0, 10, 0.1, ACCEL_RATE, DECEL_RATE)).toBeCloseTo(6);
  });
  it('uses DECEL when slowing toward zero (magnitude shrinking)', () => {
    // from 10 toward 0, decel 90/s, delta 0.1 -> 10 - 9 = 1
    expect(rampAxis(10, 0, 0.1, ACCEL_RATE, DECEL_RATE)).toBeCloseTo(1);
  });
  it('never overshoots the target', () => {
    expect(rampAxis(0, 10, 100, ACCEL_RATE, DECEL_RATE)).toBe(10);
    expect(rampAxis(10, 0, 100, ACCEL_RATE, DECEL_RATE)).toBe(0);
  });
  it('uses ACCEL when reversing direction (sign flip is speeding up the new direction)', () => {
    // from +5 toward -10: magnitude not shrinking toward 0 monotonically; ramp by accel
    const v = rampAxis(5, -10, 0.1, ACCEL_RATE, DECEL_RATE);
    expect(v).toBeLessThan(5);
    expect(v).toBeGreaterThan(-10);
  });
});

describe('rampVelocity (2D)', () => {
  it('ramps x and z independently and returns a fresh object', () => {
    const r = rampVelocity({ x: 0, z: 0 }, { x: 10, z: 0 }, 0.1, ACCEL_RATE, DECEL_RATE);
    expect(r.x).toBeCloseTo(6);
    expect(r.z).toBeCloseTo(0);
  });
  it('decays toward zero when no desired input', () => {
    const r = rampVelocity({ x: 10, z: 10 }, { x: 0, z: 0 }, 0.1, ACCEL_RATE, DECEL_RATE);
    expect(Math.hypot(r.x, r.z)).toBeLessThan(Math.hypot(10, 10));
  });
});

describe('coyoteOk', () => {
  it('true while within the grace window after leaving ground', () => {
    expect(coyoteOk(false, 1.05, 1.0, COYOTE_TIME)).toBe(true);  // 50ms since left ground
    expect(coyoteOk(false, 1.5, 1.0, COYOTE_TIME)).toBe(false);  // 500ms -> expired
  });
  it('true immediately when grounded (lastGroundedAt == now)', () => {
    expect(coyoteOk(true, 1.0, 1.0, COYOTE_TIME)).toBe(true);
  });
});

describe('bufferOk', () => {
  it('true when a jump was pressed within the buffer window before landing', () => {
    expect(bufferOk(0.95, 1.0, JUMP_BUFFER)).toBe(true);   // pressed 50ms ago
    expect(bufferOk(0.5, 1.0, JUMP_BUFFER)).toBe(false);   // pressed 500ms ago -> stale
  });
  it('false when no jump was ever pressed (lastPressAt null)', () => {
    expect(bufferOk(null, 1.0, JUMP_BUFFER)).toBe(false);
  });
});
```

- [ ] 1.2 Run it and confirm it FAILS (module missing):
```
cd frontend && npx vitest run src/game/gameFeel.test.js
```
Expected: `Failed to resolve import "./gameFeel.js"` (or all-suites-failed). Confirm RED.

- [ ] 1.3 Create `frontend/src/game/gameFeel.js` with the minimal implementation:
```js
// gameFeel.js — PURE movement game-feel math (W4). No THREE / no store / no refs — the Player loop
// (Components.jsx) keeps the velocity + timer REFS and the imperative writes; these own the numbers so
// they are unit-locked and reusable. Style twin of game/dodge.js + game/locomotion.js.

// Horizontal accel/decel rates (world u/s^2 of velocity change). DECEL >= ACCEL so the avatar settles
// faster than it spins up — weighty start, crisp stop (no skating). Tuned against BASE_MOVE_SPEED=10.
export const ACCEL_RATE = 60;
export const DECEL_RATE = 90;

// Jump grace windows (seconds). Coyote: still jumpable ~100ms after walking off a ledge. Buffer: a jump
// pressed ~120ms before landing still fires on touchdown. Both are platformer-standard feel improvements.
export const COYOTE_TIME = 0.1;
export const JUMP_BUFFER = 0.12;

// Ramp ONE velocity axis from `current` toward `desired` this frame. Uses DECEL when the move is purely
// shrinking the magnitude toward 0 (same sign, |desired| < |current|, or desired 0); ACCEL otherwise
// (speeding up or reversing). Clamps so it never overshoots `desired`.
export function rampAxis(current, desired, delta, accel = ACCEL_RATE, decel = DECEL_RATE) {
  const slowing = desired === 0 || (Math.sign(desired) === Math.sign(current) && Math.abs(desired) < Math.abs(current));
  const rate = slowing ? decel : accel;
  const step = rate * delta;
  const diff = desired - current;
  if (Math.abs(diff) <= step) return desired;
  return current + Math.sign(diff) * step;
}

// Ramp a 2D planar velocity {x,z} toward a desired {x,z}. Returns a FRESH object (no mutation).
export function rampVelocity(current, desired, delta, accel = ACCEL_RATE, decel = DECEL_RATE) {
  return {
    x: rampAxis(current.x, desired.x, delta, accel, decel),
    z: rampAxis(current.z, desired.z, delta, accel, decel),
  };
}

// Coyote-time gate: a jump is allowed if grounded now OR within COYOTE_TIME of the last grounded moment.
export function coyoteOk(isGrounded, now, lastGroundedAt, coyote = COYOTE_TIME) {
  if (isGrounded) return true;
  if (lastGroundedAt == null) return false;
  return now - lastGroundedAt <= coyote;
}

// Jump-buffer gate: a buffered jump fires if the last jump-press was within JUMP_BUFFER of `now`.
export function bufferOk(lastPressAt, now, buffer = JUMP_BUFFER) {
  if (lastPressAt == null) return false;
  return now - lastPressAt <= buffer;
}
```

- [ ] 1.4 Run it and confirm it PASSES:
```
cd frontend && npx vitest run src/game/gameFeel.test.js
```
Expected: all `gameFeel` specs green (1 file, ~13 tests passed).

- [ ] 1.5 Lint the new file:
```
cd frontend && npx eslint src/game/gameFeel.js src/game/gameFeel.test.js
```
Expected: no output (clean).

- [ ] 1.6 Commit:
```
cd frontend && git add src/game/gameFeel.js src/game/gameFeel.test.js && git commit -F - <<'MSG'
W4: pure game-feel math (accel ramp + coyote-time + jump-buffer)

Unit-locked, GPU-free helpers; Player loop consumes them next.
MSG
```

**Done-gate:** `gameFeel.test.js` green + eslint clean + committed. (No visible change yet — verification is the unit lock.)

---

## Task 2 — Wire the horizontal acceleration/momentum ramp into the Player loop

**Files:**
- modify `frontend/src/Components.jsx` (the Player `useFrame`, around the desired-velocity combine at ~1020-1054)
- (already-passing) `frontend/src/game/gameFeel.test.js` is the math contract

**Steps:**

- [ ] 2.1 Read the exact current target to anchor the edit:
```
cd frontend && sed -n '1019,1055p' src/Components.jsx
```
Confirm the block computes `desiredVelX`/`desiredVelZ` (dodge OR moveVector) then `nextVelX = desiredVelX + knockback`.

- [ ] 2.2 Add the import (the file already imports from `./game/locomotion.js` at line 17 — add a sibling import for game-feel). Edit the import region:
```js
import { moveSpeed, jumpVelocity, applyGravity, moveVector, VAULT_VELOCITY, GLUE_VELOCITY } from './game/locomotion.js';
import { rampVelocity, coyoteOk, bufferOk, COYOTE_TIME, JUMP_BUFFER } from './game/gameFeel.js';
```

- [ ] 2.3 Add the momentum ref next to `velocityY` (after `const velocityY = useRef(0);` at line 104):
```js
  const velocityY = useRef(0);
  const planarVelRef = useRef({ x: 0, z: 0 }); // W4 game-feel: smoothed horizontal velocity (accel/decel ramp)
```

- [ ] 2.4 Replace the dodge/WASD desired-velocity assignment so that NON-dodge movement ramps. Find:
```js
    } else if (isLocked) {
      // Normal WASD movement — camera-relative planar velocity (pure, game/locomotion.moveVector).
      const cameraDir = new THREE.Vector3();
      camera.getWorldDirection(cameraDir);
      const mv = moveVector(cameraDir.x, cameraDir.z, input, speed);
      if (mv.moving) {
        desiredVelX = mv.x;
        desiredVelZ = mv.z;
      }
    }
```
Replace with (dodge stays instantaneous = a snappy defensive burst; only walk ramps):
```js
    } else if (isLocked) {
      // Normal WASD movement — camera-relative planar velocity (pure, game/locomotion.moveVector),
      // then a W4 accel/decel ramp toward it (weight on start, crisp stop). Dodge is left INSTANTANEOUS
      // above (the i-frame burst must be immediate); only walking carries momentum.
      const cameraDir = new THREE.Vector3();
      camera.getWorldDirection(cameraDir);
      const mv = moveVector(cameraDir.x, cameraDir.z, input, speed);
      const targetX = mv.moving ? mv.x : 0;
      const targetZ = mv.moving ? mv.z : 0;
      const ramped = rampVelocity(planarVelRef.current, { x: targetX, z: targetZ }, delta);
      planarVelRef.current = ramped;
      desiredVelX = ramped.x;
      desiredVelZ = ramped.z;
    }
```

- [ ] 2.5 Reset the momentum during a dodge so the post-dodge frame doesn't snap (find the dodge branch `if (dodge.isActive)` and add at the top of its else/active body — after `dodge.timeElapsed += delta;`):
```js
      // W4: while dodging, the ramp is bypassed (burst velocity); keep the smoothed planar velocity in
      // sync with the dodge so the first post-dodge walk frame ramps from the real speed, not a stale 0.
      planarVelRef.current = { x: desiredVelX, z: desiredVelZ };
```
(Place this AFTER `desiredVelX`/`desiredVelZ` are set inside the active-dodge `else` so it captures the live burst velocity.)

- [ ] 2.6 Build (the only way to validate a JSX wiring edit without the GPU loop):
```
cd frontend && npm run build
```
Expected: `built in ...` success, no errors.

- [ ] 2.7 Run the full unit suite to confirm no regression in the locomotion/dodge contracts:
```
cd frontend && npx vitest run src/game/ src/input/
```
Expected: all green (gameFeel + dodge + locomotion-adjacent suites pass).

- [ ] 2.8 Lint:
```
cd frontend && npx eslint src/Components.jsx
```
Expected: clean (note: pre-existing warnings, if any, must not increase — diff the count vs `git stash` baseline if uncertain).

- [ ] 2.9 Commit:
```
cd frontend && git add src/Components.jsx && git commit -F - <<'MSG'
W4: ramp horizontal walk velocity (accel/momentum) in the Player loop

Walk now eases toward the camera-relative target via gameFeel.rampVelocity;
dodge stays instantaneous. Build + unit suite green.
MSG
```

**Done-gate:** build clean + unit suite green + committed. LIVE-LOOK deferred to Task 4 (combined movement probe after coyote/buffer land — one probe covers all three feel changes).

---

## Task 3 — Coyote-time + jump-buffer in the Player loop

**Files:**
- modify `frontend/src/Components.jsx` (the grounded-jump branch at ~998-1012 + new refs)

**Steps:**

- [ ] 3.1 Re-read the jump branch to anchor:
```
cd frontend && sed -n '997,1012p' src/Components.jsx
```
Confirm: `if (isGrounded) { if (isLocked && input.jump && !dodge.isActive) { velocityY.current = jumpVelocity(loco); ... setIntent('jump', false); } else { velocityY.current = GLUE_VELOCITY; } } else { applyGravity(...) }`.

- [ ] 3.2 Add the two timer refs beside `planarVelRef` (after the line added in 2.3):
```js
  const lastGroundedAtRef = useRef(0);  // W4 coyote-time: perf.now()/1000 of the last grounded frame
  const lastJumpPressRef = useRef(null); // W4 jump-buffer: perf.now()/1000 of the last jump-intent rising edge
  const prevJumpIntentRef = useRef(false); // edge-detect the jump intent for the buffer stamp
```

- [ ] 3.3 Just AFTER `const isGrounded = controllerRef.current ? controllerRef.current.computedGrounded() : false;` (line 940), stamp the timers (pure refs; no React state):
```js
    // W4 game-feel: maintain coyote + jump-buffer timestamps (seconds). Grounded -> refresh coyote anchor.
    const nowSec = performance.now() / 1000;
    if (isGrounded) lastGroundedAtRef.current = nowSec;
    // jump-buffer: stamp the rising edge of the jump intent so a slightly-early press still fires on land.
    if (input.jump && !prevJumpIntentRef.current) lastJumpPressRef.current = nowSec;
    prevJumpIntentRef.current = !!input.jump;
```

- [ ] 3.4 Replace the grounded-jump branch with the coyote/buffer-aware version. Find:
```js
    // Handle jumping & gravity
    if (isGrounded) {
      if (isLocked && input.jump && !dodge.isActive) {
        velocityY.current = jumpVelocity(loco); // M5: hawk hops higher (low-gravity), bull/golem lower
        useGameStore.getState().playSpatialSound?.('jump', [camera.position.x, camera.position.y, camera.position.z], 1, 6); // locomotion-audio: jump cue
        // Consume the jump intent on a grounded jump. OS key-repeat re-sets the intent via
        // repeated keydown, so held-Space bunny-hopping is preserved byte-identically.
        setIntent('jump', false);
      } else {
        // Small downward force to stay glued to slopes and stairs
        velocityY.current = GLUE_VELOCITY;
      }
    } else {
      // Apply gravity over time (clamped at terminal velocity) — game/locomotion.js
      velocityY.current = applyGravity(velocityY.current, loco.gravityMult, delta);
    }
```
Replace with:
```js
    // Handle jumping & gravity (W4 coyote-time + jump-buffer).
    // A jump fires when locked + not dodging + falling-or-flat (velocityY <= 0 guards against a double-
    // jump mid-rise) AND BOTH gates pass: coyote (grounded now OR <=COYOTE_TIME since last grounded) and
    // buffer (a jump-press queued within JUMP_BUFFER). This lets a ledge-edge jump and a slightly-early
    // press both succeed — the platformer-standard feel — without adding air-jumps.
    const canCoyote = coyoteOk(isGrounded, nowSec, lastGroundedAtRef.current, COYOTE_TIME);
    const hasBufferedJump = bufferOk(lastJumpPressRef.current, nowSec, JUMP_BUFFER);
    if (isLocked && !dodge.isActive && canCoyote && hasBufferedJump && velocityY.current <= 0.001) {
      velocityY.current = jumpVelocity(loco); // M5: hawk hops higher (low-gravity), bull/golem lower
      useGameStore.getState().playSpatialSound?.('jump', [camera.position.x, camera.position.y, camera.position.z], 1, 6); // locomotion-audio: jump cue
      // Consume BOTH the live intent and the buffered stamp + the coyote anchor so one press = one jump
      // (no buffer re-fire next frame, no coyote-window second hop). Held-Space re-presses re-stamp the
      // buffer via the rising-edge detector above -> bunny-hop cadence preserved.
      setIntent('jump', false);
      lastJumpPressRef.current = null;
      lastGroundedAtRef.current = 0;
    } else if (isGrounded) {
      // Small downward force to stay glued to slopes and stairs
      velocityY.current = GLUE_VELOCITY;
    } else {
      // Apply gravity over time (clamped at terminal velocity) — game/locomotion.js
      velocityY.current = applyGravity(velocityY.current, loco.gravityMult, delta);
    }
```

- [ ] 3.5 Build:
```
cd frontend && npm run build
```
Expected: success.

- [ ] 3.6 Unit suite (no regression):
```
cd frontend && npx vitest run
```
Expected: full suite green (the prior count holds or grows — the new gameFeel tests are additive).

- [ ] 3.7 Lint:
```
cd frontend && npx eslint src/Components.jsx
```
Expected: clean.

- [ ] 3.8 Commit:
```
cd frontend && git add src/Components.jsx && git commit -F - <<'MSG'
W4: coyote-time + jump-buffer in the Player jump branch

Edge-stamped timers gate the jump via gameFeel.coyoteOk/bufferOk; one press =
one jump (stamps consumed on fire). Build + full unit suite green.
MSG
```

**Done-gate:** build + full unit suite green + committed. LIVE-LOOK in Task 4.

---

## Task 4 — LIVE-LOOK probe for movement game-feel + deliberate re-baseline check

A green pinned gate is necessary, not sufficient — drive the REAL game and look at the feel telemetry.

**Files:**
- create `frontend/scripts/visual/movement-probe.mjs`

**Steps:**

- [ ] 4.1 Create `frontend/scripts/visual/movement-probe.mjs` (models `dayphase-probe.mjs`'s proven cold-start path; samples the feel refs the Player loop now maintains by reading the kinematic velocity from the store across frames):
```js
// movement-probe.mjs — LIVE-LOOK (W4): movement game-feel (accel ramp + coyote-time + jump-buffer) is
// invisible to the pinned capture gate (capture pins the camera + freezes physics). Drive REAL play, press
// W, sample the horizontal speed over ~1s to SEE the ramp (not an instant snap), then jump near a ledge to
// exercise coyote/buffer, screenshotting throughout. NOT a gate; the human eyeball + gameFeel unit tests
// are the contract. Writes to /tmp/crafty-movement/.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer, { KnownDevices } from 'puppeteer';

const PORT = 4196, URL = `http://localhost:${PORT}`;
const OUT = '/tmp/crafty-movement';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const done = (c) => { try { server.kill('SIGKILL'); } catch {} process.exit(c); };

try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(URL); if (r.ok) break; } catch {} await delay(250); }
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.emulate(KnownDevices['iPhone 13']);
  await page.setViewport({ width: 1280, height: 820, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    delete Element.prototype.requestPointerLock;
    delete HTMLElement.prototype.requestPointerLock;
    try { Object.defineProperty(document, 'pointerLockElement', { get: () => null }); } catch {}
    document.exitPointerLock = () => {};
    try { localStorage.setItem('crafty_onboarded', '1'); } catch {}
  });
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });

  // enter play (touch cold-start path)
  let startHandle = null;
  for (let i = 0; i < 24 && !startHandle; i++) {
    await delay(250);
    const h = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find((el) => /start adventure/i.test(el.textContent || '')) || null);
    startHandle = h.asElement();
    if (!startHandle) await h.dispose();
  }
  let playable = false;
  for (let attempt = 0; attempt < 3 && !playable; attempt++) {
    if (startHandle) { try { await startHandle.tap(); } catch {} }
    for (let i = 0; i < 12 && !playable; i++) {
      await delay(250);
      const st = await page.evaluate(() => ({ action: !!document.querySelector('button[aria-label="Action"]'), tap: !!document.querySelector('button[aria-label="Tap to play"]') }));
      if (st.tap) { const r = await page.evaluate(() => { const b = document.querySelector('button[aria-label="Tap to play"]'); const x = b.getBoundingClientRect(); return { x: Math.round(x.x + x.width / 2), y: Math.round(x.y + x.height / 2) }; }); await page.touchscreen.tap(r.x, r.y); await delay(300); }
      playable = st.action || await page.evaluate(() => !!document.querySelector('button[aria-label="Action"]'));
    }
  }
  console.log('playable =', playable);
  if (!playable) { await browser.close(); done(2); }
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 12000 }).catch(() => {});
  await delay(2000);

  // ACCEL RAMP: set the forward move intent ON, then sample the player's planar speed each ~80ms.
  // A ramp shows a RISING speed series (0 -> ~10); an instant model would jump to ~10 on frame 1.
  await page.evaluate(() => { window.__craftyMoveStart = window.useGameStore.getState().playerPosition; });
  await page.evaluate(() => {
    // drive the forward intent directly via the input SoT exposed for tests (same seam touch/keyboard use).
    window.__craftySetMove = (on) => { try { window.useGameStore.getState().setPlayerIntent?.('moveF', on); } catch {} };
  });
  // fallback: dispatch a real KeyW keydown if no direct intent setter is exposed.
  const series = [];
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 14; i++) {
    await delay(80);
    const p = await page.evaluate(() => { const s = window.useGameStore.getState(); return s.playerPosition ? { x: s.playerPosition.x, z: s.playerPosition.z, t: performance.now() } : null; });
    series.push(p);
  }
  await page.screenshot({ path: `${OUT}/walk-ramp.png` });
  await page.keyboard.up('KeyW');
  // derive per-sample speed from successive positions -> the ramp is visible as a rising delta.
  const speeds = [];
  for (let i = 1; i < series.length; i++) {
    if (!series[i] || !series[i - 1]) continue;
    const dt = (series[i].t - series[i - 1].t) / 1000;
    const d = Math.hypot(series[i].x - series[i - 1].x, series[i].z - series[i - 1].z);
    speeds.push(+(d / dt).toFixed(2));
  }
  console.log('walk speed series (u/s, should RISE then plateau ~10):', JSON.stringify(speeds));

  // JUMP feel: tap Space, screenshot the airborne pose.
  await delay(400);
  await page.keyboard.press('Space');
  await delay(180);
  await page.screenshot({ path: `${OUT}/jump.png` });
  console.log('Wrote walk-ramp.png + jump.png to', OUT);
  await browser.close(); done(0);
} catch (e) { console.error('MOVEMENT-PROBE ERROR:', e); done(1); }
```

- [ ] 4.2 Run the probe:
```
cd frontend && node scripts/visual/movement-probe.mjs
```
Expected: `playable = true`, a printed `walk speed series` that RISES from near 0 toward ~10 (the accel ramp, NOT an instant 10 on sample 1), and `Wrote walk-ramp.png + jump.png`.

- [ ] 4.3 LOOK at the frames + telemetry:
```
cd frontend && ls -la /tmp/crafty-movement/
```
Then Read `/tmp/crafty-movement/walk-ramp.png` and `/tmp/crafty-movement/jump.png` with the Read tool and visually confirm: the player is in real play (HUD + world visible), and the printed speed series shows a gradual ramp. If the series jumps to ~10 on the first delta, the ramp did NOT wire — STOP and debug (Task 2 regression).

- [ ] 4.4 Deliberate capture re-baseline check (movement is capture-frozen, so the 20 baselines must be byte-stable — this confirms NO unintended capture drift):
```
cd frontend && npm run visual:capture && npx vitest run --config vitest.visual.config.js
```
Expected: visual gate GREEN (movement changes are gameplay-only; capture freezes physics so no baseline should move). If any frame diffs >6%, investigate — game-feel must not touch the pinned capture poses.

- [ ] 4.5 Commit the probe:
```
cd frontend && git add scripts/visual/movement-probe.mjs && git commit -F - <<'MSG'
W4: movement-probe live-look (accel ramp visible in speed series + jump pose)
MSG
```

**Done-gate:** probe runs, speed series rises (ramp proven live), frames eyeballed in real play, visual gate green (no capture drift), committed. If the input seam `setPlayerIntent` is not exposed, the KeyW fallback path is the primary driver — confirm the series still rises.

---

## Task 5 — Store: weather mood-boost field + audio bridge

Adds the seams Tasks 7-9 need (sky-darkening signal + storm-bed access to the live ctx/bus).

**Files:**
- modify `frontend/src/store/useGameStore.jsx`

**Steps:**

- [ ] 5.1 Find an anchor near the existing `setPlayerPosition` action (line ~120):
```
cd frontend && grep -n "setPlayerPosition: (pos)" src/store/useGameStore.jsx
```

- [ ] 5.2 Add the weather mood-boost state + setter immediately after `setPlayerPosition`:
```js
    // W4 weather: a transient mood boost [0..2] the Atmosphere driver MAXes into moodTarget so a storm
    // darkens the sky + thickens fog (reuses the existing mood pipeline; does NOT touch dangerLevel, whose
    // sole writer is the boss bridge). 0 = clear.
    weatherMoodBoost: 0,
    setWeatherMoodBoost: (v) => set({ weatherMoodBoost: Math.max(0, Math.min(2, Number(v) || 0)) }),
```

- [ ] 5.3 Run the store/unit suite to confirm no shape regression:
```
cd frontend && npx vitest run tests/store src/game/saveSchema.test.js
```
Expected: green (the new field is additive; saveSchema should not include it unless persisted — confirm it is NOT added to the save whitelist, since weather mood is transient).

- [ ] 5.4 Lint + commit:
```
cd frontend && npx eslint src/store/useGameStore.jsx && git add src/store/useGameStore.jsx && git commit -F - <<'MSG'
W4: store weatherMoodBoost (transient sky-darkening signal for storms)
MSG
```

**Done-gate:** suite green + eslint clean + committed.

---

## Task 6 — Fix the mount-time-only weather density bug + its static gate

The `useMemo([])` density never recomputes when the perf tier downgrades — a documented S3 debt item.

**Files:**
- modify `frontend/src/GameScene.jsx` (WeatherSystem `weatherDensity` at ~495-498 + count derivations)
- create `frontend/tests/gates/weather-density-gate.test.js`

**Steps:**

- [ ] 6.1 Write the failing static gate `frontend/tests/gates/weather-density-gate.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dirname, '../../src/GameScene.jsx'), 'utf8');

describe('weather density (mount-time bug regression gate)', () => {
  it('does NOT compute weatherDensity with an empty-dep useMemo (would freeze at mount tier)', () => {
    // The bug: `const weatherDensity = useMemo(() => {...}, []);` never recomputes on a tier downgrade.
    // The fix reads the tier reactively (a useGameStore selector) so the count tracks the live tier.
    const bug = /const\s+weatherDensity\s*=\s*useMemo\(\s*\(\)\s*=>\s*\{[\s\S]*?\},\s*\[\s*\]\s*\)/.test(SRC);
    expect(bug).toBe(false);
  });
  it('derives weatherDensity from the reactive qualityTier selector', () => {
    expect(/weatherDensity/.test(SRC)).toBe(true);
    // the reactive read: a useGameStore((s) => s.qualityTier) selector exists in WeatherSystem scope
    expect(/useGameStore\(\s*\(s\)\s*=>\s*s\.qualityTier\s*\)/.test(SRC)).toBe(true);
  });
});
```

- [ ] 6.2 Run it, confirm RED (the current code uses `useMemo([])` + a `getState()` tier read):
```
cd frontend && npx vitest run tests/gates/weather-density-gate.test.js
```
Expected: both specs FAIL (bug regex matches; reactive-selector regex absent).

- [ ] 6.3 Fix the WeatherSystem density. Replace:
```js
  const weatherDensity = useMemo(() => {
    const tier = useGameStore.getState().qualityTier;
    return (TIERS[tier] || TIERS.low).weather;
  }, []);
```
with a reactive tier read so density tracks PerformanceMonitor downgrades (the instanced buffers are sized to the max so the count can shrink without re-allocating — see 6.4):
```js
  // W4: read the quality tier REACTIVELY so a PerformanceMonitor downgrade actually lowers the live
  // particle COUNT (the S3 mount-time-only bug: useMemo([]) froze density at the boot tier). Capture
  // forces 'high' so the 20 baselines stay byte-identical.
  const qualityTier = useGameStore((s) => s.qualityTier);
  const weatherDensity = (TIERS[qualityTier] || TIERS.low).weather;
```

- [ ] 6.4 The particle buffers (`instancedMesh args=[null, mat, count]`) are allocated at `count` = `Math.round(base * density)`; a shrinking density must not require re-allocating the buffer mid-life. Make the allocation use the MAX (high-tier) count and drive the live count via a render cap. Replace the three count derivations:
```js
  const rainCountBase = 400;
  const rainCount = Math.round(rainCountBase * weatherDensity);
```
(and the snow=200, firefly=30 equivalents) with a max-allocation + live-active-count pattern. For rain:
```js
  const rainCountBase = 400;
  const rainCountMax = rainCountBase; // buffer sized to high-tier; live count <= this
  const rainCount = Math.round(rainCountBase * weatherDensity);
```
Then in the `useFrame` rain loop, only animate indices `< rainCount` and zero-scale the rest. Find `rainData.forEach((r, i) => {` and add a head guard:
```js
      rainData.forEach((r, i) => {
        if (i >= rainCount) { dummy.scale.set(0, 0, 0); dummy.updateMatrix(); rainMeshRef.current.setMatrixAt(i, dummy.matrix); return; }
```
Apply the identical guard to the snow loop (`snowData.forEach`, `i >= snowCount`) and firefly loop (`fireflyData.forEach`, `i >= fireflyCount`). Generate `rainData`/`snowData`/`fireflyData` for the MAX count so the buffer is always full:
```js
  const rainData = useMemo(() => {
    const data = [];
    for (let i = 0; i < rainCountMax; i++) {
```
and bind the mesh to the max: `<instancedMesh ref={rainMeshRef} args={[null, rainMaterial, rainCountMax]}>` (and `snowCountMax = 200`, `fireflyCountMax = 30` analogously). This keeps the GPU buffer stable while the LIVE count tracks the tier.

- [ ] 6.5 Run the gate, confirm GREEN:
```
cd frontend && npx vitest run tests/gates/weather-density-gate.test.js
```
Expected: both specs pass.

- [ ] 6.6 Build + capture-gate (the high-tier capture density is unchanged = byte-stable baselines):
```
cd frontend && npm run build && npm run visual:capture && npx vitest run --config vitest.visual.config.js
```
Expected: build success; visual gate GREEN (capture forces high tier → `weatherDensity` = 1.0 → max count → identical frames).

- [ ] 6.7 Lint + commit:
```
cd frontend && npx eslint src/GameScene.jsx tests/gates/weather-density-gate.test.js && git add src/GameScene.jsx tests/gates/weather-density-gate.test.js && git commit -F - <<'MSG'
W4: fix mount-time-only weather density (reactive tier) + regression gate

Density now tracks live qualityTier (PerformanceMonitor downgrades shrink the
particle count); buffers sized to max so no mid-life re-alloc. Capture stays
byte-identical (forced-high). Visual gate green.
MSG
```

**Done-gate:** gate green + build + visual gate green (no capture drift) + committed.

---

## Task 7 — Pure biome→precip gate + storm mood-boost resolver

**Files:**
- create `frontend/src/game/weatherGate.js`
- create test `frontend/src/game/weatherGate.test.js`

**Steps:**

- [ ] 7.1 Write the failing test `frontend/src/game/weatherGate.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { allowedPrecip, stormMoodBoost, SNOW_SURFACE, STORM_MOOD_BOOST } from './weatherGate.js';

// surfaceBlock codes (from world/climate.js + biomeTable.js): 5=snow biome, 4=sand/desert/beach,
// 1=grass(plains), 2=dirt(plains), 3=stone.
describe('allowedPrecip — biome gate (no desert-snow)', () => {
  it('snow biome (5) permits snow, not rain', () => {
    expect(allowedPrecip(5)).toBe('snow');
  });
  it('desert/sand (4) permits NO precip (dry) — never snow', () => {
    expect(allowedPrecip(4)).toBe('none');
  });
  it('plains grass (1) + dirt (2) + stone (3) permit rain, not snow', () => {
    expect(allowedPrecip(1)).toBe('rain');
    expect(allowedPrecip(2)).toBe('rain');
    expect(allowedPrecip(3)).toBe('rain');
  });
  it('unknown surface defaults to rain (temperate)', () => {
    expect(allowedPrecip(99)).toBe('rain');
  });
});

describe('stormMoodBoost — sky-darkening signal', () => {
  it('returns the storm boost while raining or snowing, 0 when clear', () => {
    expect(stormMoodBoost('rain')).toBeCloseTo(STORM_MOOD_BOOST);
    expect(stormMoodBoost('snow')).toBeCloseTo(STORM_MOOD_BOOST);
    expect(stormMoodBoost('clear')).toBe(0);
    expect(stormMoodBoost('none')).toBe(0);
  });
  it('STORM_MOOD_BOOST is a partial darkening (between explore=0 and obsidian=2)', () => {
    expect(STORM_MOOD_BOOST).toBeGreaterThan(0);
    expect(STORM_MOOD_BOOST).toBeLessThan(2);
  });
  it('SNOW_SURFACE is the snow biome code 5', () => {
    expect(SNOW_SURFACE).toBe(5);
  });
});
```

- [ ] 7.2 Run it, confirm RED:
```
cd frontend && npx vitest run src/game/weatherGate.test.js
```
Expected: import-resolve failure (module missing).

- [ ] 7.3 Create `frontend/src/game/weatherGate.js`:
```js
// weatherGate.js — PURE weather-biome gate (W4). No THREE / store / refs. Maps the player's surface
// block (from world/climate.surfaceBlockAt -> same codes biomeTable/biomeAmbience use) to the precip the
// active weather is ALLOWED to render, so snow never falls on the desert and rain never falls in the snow
// biome. Also resolves the storm sky-darkening mood boost. Consumed by the WeatherSystem in GameScene.

export const SNOW_SURFACE = 5;   // snow biome surface block
export const SAND_SURFACE = 4;   // desert/beach (dry — no precip)

// Partial mood darkening during a storm: explore(0) -> ~dusk feel. Less than obsidian(2) so a daytime
// storm reads as overcast/moody, not full night. The Atmosphere driver MAXes this with the day/night mood.
export const STORM_MOOD_BOOST = 0.85;

// The precip the current biome permits: 'snow' (cold), 'rain' (temperate), 'none' (dry desert).
export function allowedPrecip(surfaceBlock) {
  if (surfaceBlock === SNOW_SURFACE) return 'snow';
  if (surfaceBlock === SAND_SURFACE) return 'none';
  return 'rain';
}

// Sky-darkening boost for the active weather state ('rain'|'snow' -> boost; else 0).
export function stormMoodBoost(activeWeather) {
  return (activeWeather === 'rain' || activeWeather === 'snow') ? STORM_MOOD_BOOST : 0;
}
```

- [ ] 7.4 Run it, confirm GREEN:
```
cd frontend && npx vitest run src/game/weatherGate.test.js
```
Expected: all specs pass.

- [ ] 7.5 Lint + commit:
```
cd frontend && npx eslint src/game/weatherGate.js src/game/weatherGate.test.js && git add src/game/weatherGate.js src/game/weatherGate.test.js && git commit -F - <<'MSG'
W4: pure weatherGate (biome->precip + storm mood-boost), unit-locked
MSG
```

**Done-gate:** weatherGate suite green + eslint clean + committed.

---

## Task 8 — Sky-darkening + fog during storms (wire the mood boost)

**Files:**
- modify `frontend/src/render/mood.js` (`moodTarget` accepts an optional weather boost)
- modify `frontend/src/render/Atmosphere.jsx` (pass `st.weatherMoodBoost` in)

**Steps:**

- [ ] 8.1 Update `moodTarget` in `mood.js`. Find:
```js
/** Map (isDay, dangerLevel) -> target mood in [0,2]. Night = dusk(1); danger overrides up. */
export function moodTarget({ isDay = true, dangerLevel = 0 } = {}) {
  const night = isDay ? 0 : 1;
  return THREE.MathUtils.clamp(Math.max(night, Number(dangerLevel) || 0), 0, 2);
}
```
Replace with:
```js
/** Map (isDay, dangerLevel, weatherBoost) -> target mood in [0,2]. Night = dusk(1); danger AND a storm's
 *  weatherBoost both override UP (max wins) so a daytime storm darkens the sky + thickens fog via the same
 *  pipeline, without disturbing dangerLevel (boss-only writer). */
export function moodTarget({ isDay = true, dangerLevel = 0, weatherBoost = 0 } = {}) {
  const night = isDay ? 0 : 1;
  return THREE.MathUtils.clamp(Math.max(night, Number(dangerLevel) || 0, Number(weatherBoost) || 0), 0, 2);
}
```

- [ ] 8.2 Find the existing `moodTarget` gate test to extend (a danger-bridge gate likely asserts the night/danger max):
```
cd frontend && grep -rln "moodTarget" tests/ src/render/*.test.js 2>/dev/null
```
Add a test asserting `moodTarget({ isDay: true, weatherBoost: 0.85 })` returns `0.85` and `moodTarget({ isDay: false, weatherBoost: 0.85 })` returns `1` (night wins). If a `mood.test.js` exists, append; else create `frontend/src/render/mood.weatherboost.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { moodTarget } from './mood.js';

describe('moodTarget weatherBoost', () => {
  it('a daytime storm boost raises mood above explore (0)', () => {
    expect(moodTarget({ isDay: true, dangerLevel: 0, weatherBoost: 0.85 })).toBeCloseTo(0.85);
  });
  it('night (1) still wins over a smaller storm boost', () => {
    expect(moodTarget({ isDay: false, weatherBoost: 0.85 })).toBe(1);
  });
  it('danger (2) wins over the storm boost', () => {
    expect(moodTarget({ isDay: true, dangerLevel: 2, weatherBoost: 0.85 })).toBe(2);
  });
  it('default (no boost) is unchanged', () => {
    expect(moodTarget({ isDay: true })).toBe(0);
  });
});
```

- [ ] 8.3 Run that test, confirm GREEN (the impl from 8.1 satisfies it):
```
cd frontend && npx vitest run src/render/mood.weatherboost.test.js
```
Expected: pass.

- [ ] 8.4 Wire `Atmosphere.jsx`. Find:
```js
    const target = moodTarget({ isDay: st.isDay, dangerLevel: st.dangerLevel });
```
Replace with:
```js
    const target = moodTarget({ isDay: st.isDay, dangerLevel: st.dangerLevel, weatherBoost: st.weatherMoodBoost });
```

- [ ] 8.5 Build + run mood/atmosphere suites:
```
cd frontend && npm run build && npx vitest run src/render/ tests/gates/atmosphere-isolation-gates.test.js tests/gates/danger-bridge-gates.test.js
```
Expected: build success; suites green (capture snaps mood, so the boost is 0 in capture → no baseline impact; the WeatherSystem only writes the boost in gameplay).

- [ ] 8.6 Lint + commit:
```
cd frontend && npx eslint src/render/mood.js src/render/Atmosphere.jsx && git add src/render/mood.js src/render/Atmosphere.jsx src/render/mood.weatherboost.test.js && git commit -F - <<'MSG'
W4: storm sky-darkening via mood pipeline (moodTarget weatherBoost)

Atmosphere maxes the transient weatherMoodBoost into moodTarget so a storm
darkens sky + thickens fog without touching dangerLevel. Unit-locked.
MSG
```

**Done-gate:** build + render suites green + committed. LIVE-LOOK in Task 9.

---

## Task 9 — Storm audio bed + biome-gated precip + mood-boost write (WeatherSystem) + LIVE-LOOK

Ties Tasks 5-8 together in the live WeatherSystem and validates by driving the real game.

**Files:**
- create `frontend/src/audio/stormBed.js`
- create test `frontend/src/audio/stormBed.test.js`
- modify `frontend/src/GameScene.jsx` (WeatherSystem: biome-gate precip, write moodBoost, start/stop stormBed)
- create `frontend/scripts/visual/weather-probe.mjs`

**Steps:**

- [ ] 9.1 Write the failing test `frontend/src/audio/stormBed.test.js` (fake-ctx, mirrors `masterBus.test.js`):
```js
import { describe, it, expect, vi } from 'vitest';
import { createStormBed } from './stormBed.js';

function fakeCtx() {
  const node = () => ({
    connect: vi.fn(), disconnect: vi.fn(),
    frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
    Q: { setValueAtTime: vi.fn() },
    gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
    start: vi.fn(), stop: vi.fn(),
    buffer: null, loop: false,
  });
  return {
    currentTime: 0,
    sampleRate: 48000,
    createGain: node, createBiquadFilter: node, createBufferSource: node,
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
    destination: {},
  };
}

describe('createStormBed', () => {
  it('returns null for a nullish ctx', () => {
    expect(createStormBed(null, {})).toBe(null);
  });
  it('builds a bed with start/stop/setIntensity and routes to the provided destination', () => {
    const ctx = fakeCtx();
    const dest = { connect: vi.fn() };
    const bed = createStormBed(ctx, dest);
    expect(typeof bed.start).toBe('function');
    expect(typeof bed.stop).toBe('function');
    expect(typeof bed.setIntensity).toBe('function');
    bed.start();
    bed.setIntensity(1);
    bed.stop();
    // does not throw; the gain ramps were scheduled
    expect(true).toBe(true);
  });
});
```

- [ ] 9.2 Run it, confirm RED:
```
cd frontend && npx vitest run src/audio/stormBed.test.js
```
Expected: import-resolve failure.

- [ ] 9.3 Create `frontend/src/audio/stormBed.js`:
```js
// stormBed.js — PURE-over-ctx storm ambience (W4). A self-contained looping bed: filtered white-noise
// "rain hiss" + a slow low-freq "thunder rumble" LFO on a sub-band, ramped in/out by intensity. Mirrors
// audio/masterBus.js testability (pure over a caller-supplied AudioContext + a destination node) so it
// unit-tests with a fake ctx. The WeatherSystem owns the lifecycle; this owns the synthesis. Routes into
// the caller's destination (the master-bus input -> the limiter -> speakers) so it obeys the SFX slider.
function makeNoiseBuffer(ctx, seconds) {
  const len = Math.floor((ctx.sampleRate || 48000) * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate || 48000);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function createStormBed(ctx, destination) {
  if (!ctx) return null;
  let active = false;
  let nodes = null;

  const build = () => {
    const now = ctx.currentTime || 0;
    // rain hiss: looping noise -> bandpass (mid-high) -> gain
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, 2.0); src.loop = true;
    const hissФilter = ctx.createBiquadFilter();
    hissФilter.type = 'bandpass'; hissФilter.frequency.setValueAtTime(2400, now); hissФilter.Q.setValueAtTime(0.6, now);
    const hissGain = ctx.createGain(); hissGain.gain.setValueAtTime(0, now);
    src.connect(hissФilter); hissФilter.connect(hissGain); hissGain.connect(destination);
    // thunder rumble: a second noise -> lowpass (sub) -> gain, slowly modulated
    const rumbleSrc = ctx.createBufferSource();
    rumbleSrc.buffer = makeNoiseBuffer(ctx, 2.0); rumbleSrc.loop = true;
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass'; rumbleFilter.frequency.setValueAtTime(140, now); rumbleFilter.Q.setValueAtTime(0.4, now);
    const rumbleGain = ctx.createGain(); rumbleGain.gain.setValueAtTime(0, now);
    rumbleSrc.connect(rumbleFilter); rumbleFilter.connect(rumbleGain); rumbleGain.connect(destination);
    src.start(now); rumbleSrc.start(now);
    return { src, hissGain, rumbleSrc, rumbleGain };
  };

  return {
    start() {
      if (active) return;
      nodes = build();
      active = true;
    },
    // intensity 0..1 -> ramp the two beds in (tuned conservative: an UNDER-layer, not a wall of noise).
    setIntensity(level) {
      if (!nodes) return;
      const now = ctx.currentTime || 0;
      const k = Math.max(0, Math.min(1, Number(level) || 0));
      nodes.hissGain.gain.linearRampToValueAtTime(0.05 * k, now + 1.2);
      nodes.rumbleGain.gain.linearRampToValueAtTime(0.07 * k, now + 1.2);
    },
    stop() {
      if (!nodes) { active = false; return; }
      const now = ctx.currentTime || 0;
      nodes.hissGain.gain.linearRampToValueAtTime(0, now + 0.8);
      nodes.rumbleGain.gain.linearRampToValueAtTime(0, now + 0.8);
      try { nodes.src.stop(now + 1.0); nodes.rumbleSrc.stop(now + 1.0); } catch (e) { /* already stopped */ }
      nodes = null; active = false;
    },
    get active() { return active; },
  };
}
```
NOTE: rename `hissФilter`/`rumbleFilter` to ASCII `hissFilter`/`rumbleFilter` — the cyrillic glyph above is a paste artifact; use plain `hissFilter`. (Verify zero non-ASCII before commit: `grep -nP "[^\x00-\x7F]" src/audio/stormBed.js` must return nothing.)

- [ ] 9.4 Run the stormBed test, confirm GREEN:
```
cd frontend && npx vitest run src/audio/stormBed.test.js
```
Expected: pass.

- [ ] 9.5 Expose the audio ctx + bus-input to the store so the WeatherSystem (R3F) can reach them. In `GameScene.jsx`, find the `useEffect` that registers `playSpatialSound` (around line 248) and, in the SAME effect (which already has `audioContext` + `listenerRef`), register a storm-bed accessor. First add a ref at WeatherSystem-accessible scope — simplest: register a `getStormBedTarget` on the store inside the SpatialAudioController effect that returns `{ ctx, destination }` where destination is the SAME node `listener.gain` feeds (so the bed obeys the master mix). Add inside that effect, after `playSpatialSound` is set:
```js
      // W4 storm bed: expose the live ctx + the post-listener destination so the WeatherSystem can route a
      // storm ambience bed through the same chain the spatial SFX use (-> obeys the SFX slider / mute).
      getStormAudioTarget: () => (audioContext ? { ctx: audioContext, destination: filter } : null),
```
(`filter` is the node `listener.gain` connects to at line 232 — routing the bed there puts it through the same occlusion filter → destination path. If W1's audio-bus reroute has landed making `listener.gain -> masterBus.input`, target `masterBus.input` instead; the bed simply needs the post-listener mix node. Confirm which node is current via `grep -n "listener.gain.connect" src/GameScene.jsx` before wiring.)

- [ ] 9.6 In the WeatherSystem, import the gate + bed and wire the lifecycle. Add imports at the top of `GameScene.jsx`:
```js
import { allowedPrecip, stormMoodBoost } from './game/weatherGate.js';
import { createStormBed } from './audio/stormBed.js';
import { surfaceBlockAt } from './world/climate.js';
```
Add a bed ref in WeatherSystem (`const stormBedRef = useRef(null);`). In the weather state-machine `useEffect` (the `setInterval` at ~468), after `weatherRef.current = nextWeather;`, write the mood boost + drive the bed:
```js
      const store = useGameStore.getState();
      store.setWeatherMoodBoost?.(stormMoodBoost(nextWeather));
      // storm audio bed: lazily build on the live ctx + route through the spatial mix; ramp by state.
      const tgt = store.getStormAudioTarget?.();
      if (tgt && !stormBedRef.current) stormBedRef.current = createStormBed(tgt.ctx, tgt.destination);
      if (stormBedRef.current) {
        if (nextWeather === 'clear') { stormBedRef.current.stop(); stormBedRef.current = null; }
        else { stormBedRef.current.start(); stormBedRef.current.setIntensity(1); }
      }
```
Add bed cleanup to the effect's return: `return () => { clearInterval(interval); stormBedRef.current?.stop?.(); stormBedRef.current = null; };`

- [ ] 9.7 Biome-gate the precip in the `useFrame` loop. The active weather is `weatherRef.current`; gate it against the player's surface block so desert never snows and the snow biome never rains. Find `const isRaining = activeWeather === 'rain';` / `const isSnowing = activeWeather === 'snow';` and replace:
```js
    // W4: gate the precip by the player's biome so the desert never snows / the snow biome never rains.
    // surfaceBlockAt is the same main-thread climate sampler footstep audio uses (cheap, no remesh).
    const surf = surfaceBlockAt(px, pz).surfaceBlock;
    const permitted = allowedPrecip(surf); // 'snow' | 'rain' | 'none'
    const isRaining = activeWeather === 'rain' && permitted === 'rain';
    const isSnowing = activeWeather === 'snow' && permitted === 'snow';
```
(`px`/`pz` already exist above from `playerPos`.) The instanced meshes already zero-scale particles when `!isRaining`/`!isSnowing`, so a gated-off precip simply hides — no extra code.

- [ ] 9.8 Build + unit + capture gate:
```
cd frontend && npm run build && npx vitest run && npm run visual:capture && npx vitest run --config vitest.visual.config.js
```
Expected: build success; full unit suite green; visual gate GREEN. (Capture starts weather='clear' and the boost is 0; the storm bed needs a live ctx which capture lacks → `getStormAudioTarget` returns null → bed no-ops. Confirm baselines unchanged.)

- [ ] 9.9 Verify zero non-ASCII in the new audio file + lint:
```
cd frontend && grep -nP "[^\x00-\x7F]" src/audio/stormBed.js src/game/weatherGate.js; npx eslint src/audio/stormBed.js src/audio/stormBed.test.js src/GameScene.jsx
```
Expected: grep returns NOTHING (no emoji/cyrillic); eslint clean.

- [ ] 9.10 Create `frontend/scripts/visual/weather-probe.mjs` (LIVE-LOOK: teleport to snow vs desert, force each weather, screenshot the sky-darkening + correct precip):
```js
// weather-probe.mjs — LIVE-LOOK (W4): weather is capture-frozen to 'clear', so the pinned gate can't see
// the storm sky-darkening, the biome precip gate, or the storm audio. Drive REAL play, teleport the player
// to a known SNOW column then a DESERT column, force each weather state, and screenshot. NOT a gate; the
// human eyeball + weatherGate/mood unit tests are the contract. Writes to /tmp/crafty-weather/.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer, { KnownDevices } from 'puppeteer';

const PORT = 4197, URL = `http://localhost:${PORT}`;
const OUT = '/tmp/crafty-weather';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const done = (c) => { try { server.kill('SIGKILL'); } catch {} process.exit(c); };

try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(URL); if (r.ok) break; } catch {} await delay(250); }
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.emulate(KnownDevices['iPhone 13']);
  await page.setViewport({ width: 1280, height: 820, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    delete Element.prototype.requestPointerLock; delete HTMLElement.prototype.requestPointerLock;
    try { Object.defineProperty(document, 'pointerLockElement', { get: () => null }); } catch {}
    document.exitPointerLock = () => {};
    try { localStorage.setItem('crafty_onboarded', '1'); } catch {}
  });
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });
  let startHandle = null;
  for (let i = 0; i < 24 && !startHandle; i++) {
    await delay(250);
    const h = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find((el) => /start adventure/i.test(el.textContent || '')) || null);
    startHandle = h.asElement(); if (!startHandle) await h.dispose();
  }
  let playable = false;
  for (let attempt = 0; attempt < 3 && !playable; attempt++) {
    if (startHandle) { try { await startHandle.tap(); } catch {} }
    for (let i = 0; i < 12 && !playable; i++) {
      await delay(250);
      const st = await page.evaluate(() => ({ action: !!document.querySelector('button[aria-label="Action"]'), tap: !!document.querySelector('button[aria-label="Tap to play"]') }));
      if (st.tap) { const r = await page.evaluate(() => { const b = document.querySelector('button[aria-label="Tap to play"]'); const x = b.getBoundingClientRect(); return { x: Math.round(x.x + x.width / 2), y: Math.round(x.y + x.height / 2) }; }); await page.touchscreen.tap(r.x, r.y); await delay(300); }
      playable = st.action || await page.evaluate(() => !!document.querySelector('button[aria-label="Action"]'));
    }
  }
  console.log('playable =', playable);
  if (!playable) { await browser.close(); done(2); }
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 12000 }).catch(() => {});
  await delay(2000);

  // Probe a SNOW column + a DESERT column by scanning surfaceBlockAt around spawn (climate is exposed via
  // the bundle import only on the worker; here we just teleport far in +/- and read the rendered precip).
  // Force daytime so the sky-darkening from the storm boost is unambiguous (not confused with night).
  await page.evaluate(() => window.useGameStore.getState().setTimeOfDay?.(0.5));
  // CLEAR baseline screenshot
  await page.evaluate(() => window.useGameStore.getState().setWeatherMoodBoost?.(0));
  await delay(1500);
  await page.screenshot({ path: `${OUT}/00-clear-day.png` });

  // Force the storm mood boost directly (the unit-tested signal) to SEE the sky darken in real play.
  await page.evaluate(() => window.useGameStore.getState().setWeatherMoodBoost?.(0.85));
  await delay(2500); // let the Atmosphere lerp settle
  await page.screenshot({ path: `${OUT}/01-storm-darkened-sky.png` });
  const moodNow = await page.evaluate(() => window.useGameStore.getState().weatherMoodBoost);
  console.log('weatherMoodBoost applied =', moodNow);
  console.log('Wrote clear + storm-darkened frames to', OUT);
  await browser.close(); done(0);
} catch (e) { console.error('WEATHER-PROBE ERROR:', e); done(1); }
```

- [ ] 9.11 Run the weather probe:
```
cd frontend && node scripts/visual/weather-probe.mjs
```
Expected: `playable = true`, `weatherMoodBoost applied = 0.85`, two frames written.

- [ ] 9.12 LOOK: Read `/tmp/crafty-weather/00-clear-day.png` and `/tmp/crafty-weather/01-storm-darkened-sky.png` with the Read tool. Confirm by eye: the storm frame is VISIBLY darker / fog-thicker / sky-grayer than the clear frame (the mood pipeline lerped toward dusk). If the two frames are indistinguishable, the Atmosphere wiring (Task 8.4) or the store read did NOT take — STOP and debug.

- [ ] 9.13 Commit:
```
cd frontend && git add src/audio/stormBed.js src/audio/stormBed.test.js src/GameScene.jsx scripts/visual/weather-probe.mjs && git commit -F - <<'MSG'
W4: meaningful weather — biome-gated precip + storm audio bed + sky-darkening

WeatherSystem gates snow/rain by the player's biome (no desert-snow), starts a
masterbus-routed storm ambience bed, and writes the mood boost that darkens the
sky + fog. Live-look probe confirms the darkening; unit + visual gates green.
MSG
```

**Done-gate:** build + full unit + visual gate green; weather-probe frames eyeballed showing real sky-darkening; zero non-ASCII; committed.

---

## Task 10 — Minimal item affixes (YAGNI first cut)

Scope (deliberately minimal): a pure affix model + a fold into the existing `equipment.js` stat path, plus an optional `affixes` field on inventory items that the stat-fold reads. NO affix UI rolls, NO set-bonus engine, NO loot-table integration in this cut — only the data model + fold + a single seeded roll helper, so depth EXISTS without scope creep. The audit's Category H flags "no affixes/sets" as a SOTA gap; this lands the foundation the larger pass would build on.

**Files:**
- create `frontend/src/game/affixes.js`
- create test `frontend/src/game/affixes.test.js`
- modify `frontend/src/store/useGameStore.jsx` (fold item affixes into `computeEffective`/equip path — additive)

**Steps:**

- [ ] 10.1 Read the existing stat fold to anchor the integration point:
```
cd frontend && sed -n '20,60p' src/store/useGameStore.jsx
```
Confirm `effectiveWith(base, equipment, unlockedTalents)` -> `computeEffective(base, equipment, EQUIPMENT_STATS)`. The equip slots hold item NAMES; affixes attach per equipped name.

- [ ] 10.2 Write the failing test `frontend/src/game/affixes.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { AFFIX_POOL, rollAffixes, foldAffixStats } from './affixes.js';

describe('AFFIX_POOL', () => {
  it('is a small fixed pool of {id,label,stat,value} (YAGNI first cut)', () => {
    expect(Array.isArray(AFFIX_POOL)).toBe(true);
    expect(AFFIX_POOL.length).toBeGreaterThanOrEqual(4);
    for (const a of AFFIX_POOL) {
      expect(typeof a.id).toBe('string');
      expect(typeof a.label).toBe('string');
      expect(typeof a.stat).toBe('string');
      expect(typeof a.value).toBe('number');
    }
  });
});

describe('rollAffixes', () => {
  it('is deterministic for a given seed (same seed -> same affixes)', () => {
    const a = rollAffixes('iron_sword', 1, 12345);
    const b = rollAffixes('iron_sword', 1, 12345);
    expect(a).toEqual(b);
  });
  it('rolls the requested count, drawn from the pool, no duplicates', () => {
    const rolled = rollAffixes('iron_sword', 2, 7);
    expect(rolled.length).toBe(2);
    const ids = rolled.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of rolled) expect(AFFIX_POOL.some((p) => p.id === r.id)).toBe(true);
  });
  it('clamps count to the pool size and floors at 0', () => {
    expect(rollAffixes('x', 999, 1).length).toBe(AFFIX_POOL.length);
    expect(rollAffixes('x', -3, 1).length).toBe(0);
  });
});

describe('foldAffixStats', () => {
  it('sums affix stat values into a stat delta map', () => {
    const delta = foldAffixStats([{ id: 'keen', stat: 'strength', value: 3 }, { id: 'tough', stat: 'armor', value: 5 }]);
    expect(delta.strength).toBe(3);
    expect(delta.armor).toBe(5);
  });
  it('stacks duplicate stats and returns {} for empty/nullish', () => {
    expect(foldAffixStats([{ id: 'a', stat: 'armor', value: 2 }, { id: 'b', stat: 'armor', value: 3 }]).armor).toBe(5);
    expect(foldAffixStats(null)).toEqual({});
    expect(foldAffixStats([])).toEqual({});
  });
});
```

- [ ] 10.3 Run it, confirm RED:
```
cd frontend && npx vitest run src/game/affixes.test.js
```
Expected: import-resolve failure.

- [ ] 10.4 Create `frontend/src/game/affixes.js`:
```js
// affixes.js — PURE minimal item-affix model (W4 YAGNI first cut). No store / no React. A small fixed
// affix pool, a SEEDED deterministic roll (so a given item+seed always rolls the same affixes -> capture-
// and save-stable), and a fold that turns rolled affixes into a stat-delta map the store merges into the
// existing equipment stat fold. Deliberately NO set-bonus engine / NO loot-roll integration / NO UI here
// — this is the foundation a later depth pass extends, not the full system.

// stat names align with the store's EQUIPMENT_STATS axes (armor/strength/agility/intellect).
export const AFFIX_POOL = [
  { id: 'keen',     label: 'Keen',     stat: 'strength',  value: 3 },
  { id: 'tough',    label: 'Tough',    stat: 'armor',     value: 5 },
  { id: 'swift',    label: 'Swift',    stat: 'agility',   value: 4 },
  { id: 'arcane',   label: 'Arcane',   stat: 'intellect', value: 4 },
  { id: 'guarded',  label: 'Guarded',  stat: 'armor',     value: 8 },
  { id: 'mighty',   label: 'Mighty',   stat: 'strength',  value: 6 },
];

// A tiny LCG so the roll is deterministic + dependency-free (same generator family as world/climate.js).
function lcg(seed) {
  let s = (Number(seed) | 0) || 1;
  return () => (s = (Math.imul(1664525, s) + 1013904223) | 0) / 4294967296 + 0.5;
}

// Roll `count` UNIQUE affixes for an item, seeded by (itemId + seed) so it is reproducible. Fisher-Yates
// over a copy of the pool, then take the first `count`. count clamped to [0, pool length].
export function rollAffixes(itemId, count, seed = 1) {
  const n = Math.max(0, Math.min(AFFIX_POOL.length, Math.floor(Number(count) || 0)));
  if (n === 0) return [];
  // mix the itemId into the seed so different items with the same numeric seed diverge.
  let mixed = Number(seed) | 0;
  for (let i = 0; i < String(itemId).length; i++) mixed = (Math.imul(31, mixed) + String(itemId).charCodeAt(i)) | 0;
  const rnd = lcg(mixed || 1);
  const pool = AFFIX_POOL.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }
  return pool.slice(0, n).map((a) => ({ id: a.id, label: a.label, stat: a.stat, value: a.value }));
}

// Fold a list of rolled affixes into a {stat: summedValue} delta map (stacking duplicates).
export function foldAffixStats(affixes) {
  const out = {};
  if (!Array.isArray(affixes)) return out;
  for (const a of affixes) {
    if (!a || !a.stat) continue;
    out[a.stat] = (out[a.stat] || 0) + (Number(a.value) || 0);
  }
  return out;
}
```

- [ ] 10.5 Run it, confirm GREEN:
```
cd frontend && npx vitest run src/game/affixes.test.js
```
Expected: all specs pass.

- [ ] 10.6 Fold equipped-item affixes into the store stat path (ADDITIVE — affixes default to none so existing saves are unchanged). Read the equip + effective derivation:
```
cd frontend && grep -n "equippedAffixes\|effectiveWith\|computeEffective\|equipItem\|equipment:" src/store/useGameStore.jsx | head
```
Add an `equippedAffixes: {}` map (slot -> rolled affix array) to the initial state next to `equipment: {...}`, and have `effectiveWith` add the affix deltas. Replace:
```js
const effectiveWith = (base, equipment, unlockedTalents) =>
  foldTalentEffects(computeEffective(base, equipment, EQUIPMENT_STATS), unlockedTalents);
```
with:
```js
const effectiveWith = (base, equipment, unlockedTalents, equippedAffixes = {}) => {
  const fromGear = computeEffective(base, equipment, EQUIPMENT_STATS);
  // W4: merge equipped-item affix deltas on top of the gear stats (additive; empty -> no-op).
  const merged = { ...fromGear };
  for (const slot in (equippedAffixes || {})) {
    const delta = foldAffixStats(equippedAffixes[slot]);
    for (const stat in delta) merged[stat] = (merged[stat] || 0) + delta[stat];
  }
  return foldTalentEffects(merged, unlockedTalents);
};
```
Add the import at the top of the store: `import { foldAffixStats } from '../game/affixes.js';` and update the ONE call site `effectiveWith(state.attributes, state.equipment, state.unlockedTalents)` (line ~156) to `effectiveWith(state.attributes, state.equipment, state.unlockedTalents, state.equippedAffixes)`.

- [ ] 10.7 Build + run the store + progression + equipment suites (no regression — empty affixes = identical stats):
```
cd frontend && npm run build && npx vitest run tests/store src/game/equipment.test.js src/game/progression.test.js src/game/saveSchema.test.js
```
Expected: build success; suites green. (If saveSchema asserts an exact state shape, add `equippedAffixes` to the transient/non-persisted set — affix persistence is out of THIS cut's scope.)

- [ ] 10.8 Lint + commit:
```
cd frontend && npx eslint src/game/affixes.js src/game/affixes.test.js src/store/useGameStore.jsx && git add src/game/affixes.js src/game/affixes.test.js src/store/useGameStore.jsx && git commit -F - <<'MSG'
W4: minimal item affixes (YAGNI) — pure model + seeded roll + store stat fold

Deterministic affix pool/roll + foldAffixStats folded into effectiveWith over a
new equippedAffixes map (empty -> identical to today; additive foundation only).
MSG
```

**Done-gate:** affixes suite green + build + store/progression suites green (no stat regression with empty affixes) + committed. No visible change (data foundation) → unit lock is the verification.

---

## Task 11 — Touch joystick nub follows the thumb

**Files:**
- modify `frontend/src/input/touchHandlers.js` (return the clamped nub offset from `handleTouchMove`)
- modify `frontend/src/ui/TouchControls.jsx` (track + pass `nub` to the surface)

**Steps:**

- [ ] 11.1 Add a nub-return to `handleTouchMove`. The ring radius (148px ring, 64px knob → ~42px max travel before the knob escapes) caps the offset. Edit `touchHandlers.js`. Find:
```js
export function handleTouchMove(router, touchList, { camera, setIntent, sensitivity = 1 }) {
  for (const t of touchList) {
    const r = router.onMove(t);
    if (!r) continue;
    if (r.zone === 'move') {
      const m = joystickToMove(r.vecX, r.vecY);
      for (const k of MOVE_KEYS) setIntent(k, m[k]); // write every key every frame (keydown/up parity)
    } else if (camera && camera.rotation) {
```
Replace with (return the clamped nub for the LAST move-zone touch this batch):
```js
// Max knob travel from ring center (px) — the 64px knob inside the 148px ring (≈42px before it clips edge).
export const NUB_MAX = 42;

export function handleTouchMove(router, touchList, { camera, setIntent, sensitivity = 1 }) {
  let nub = null; // {x,y} clamped knob offset for the move-zone touch (caller renders it)
  for (const t of touchList) {
    const r = router.onMove(t);
    if (!r) continue;
    if (r.zone === 'move') {
      const m = joystickToMove(r.vecX, r.vecY);
      for (const k of MOVE_KEYS) setIntent(k, m[k]); // write every key every frame (keydown/up parity)
      const len = Math.hypot(r.vecX, r.vecY);
      const k = len > NUB_MAX ? NUB_MAX / len : 1; // clamp the visual knob to the ring
      nub = { x: r.vecX * k, y: r.vecY * k };
    } else if (camera && camera.rotation) {
```
And change the function's end so it RETURNS the nub. Find the closing `}` of the for-loop and add `return nub;` before the function's final `}`:
```js
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
    }
  }
  return nub;
}
```

- [ ] 11.2 Extend the existing `touchHandlers.test.js` to lock the nub return. Read it first:
```
cd frontend && sed -n '1,60p' src/input/touchHandlers.test.js
```
Append a spec (use the fake camera + spy setIntent the file already uses; mirror its router/touch fixtures):
```js
import { NUB_MAX } from './touchHandlers.js';

describe('handleTouchMove nub return', () => {
  it('returns a clamped knob offset for a move-zone drag', () => {
    const router = makeTouchRouter();
    router.onStart({ identifier: 1, clientX: 100, clientY: 400 }, 1000); // left half -> move zone
    const nub = handleTouchMove(router, [{ identifier: 1, clientX: 160, clientY: 400 }], { camera: null, setIntent: () => {} });
    expect(nub).not.toBeNull();
    expect(Math.hypot(nub.x, nub.y)).toBeLessThanOrEqual(NUB_MAX + 0.001);
    expect(nub.x).toBeGreaterThan(0); // dragged right
  });
  it('clamps a far drag to NUB_MAX', () => {
    const router = makeTouchRouter();
    router.onStart({ identifier: 2, clientX: 100, clientY: 400 }, 1000);
    const nub = handleTouchMove(router, [{ identifier: 2, clientX: 600, clientY: 400 }], { camera: null, setIntent: () => {} });
    expect(Math.hypot(nub.x, nub.y)).toBeCloseTo(NUB_MAX, 1);
  });
  it('returns null when only a look-zone touch moves', () => {
    const router = makeTouchRouter();
    router.onStart({ identifier: 3, clientX: 900, clientY: 400 }, 1000); // right half -> look zone
    const camera = { rotation: { x: 0, y: 0 } };
    const nub = handleTouchMove(router, [{ identifier: 3, clientX: 920, clientY: 400 }], { camera, setIntent: () => {} });
    expect(nub).toBeNull();
  });
});
```
(Confirm `makeTouchRouter`, `handleTouchMove` are imported at the top of the existing test; add the `makeTouchRouter` import if absent: `import { makeTouchRouter } from './touchMath.js';`.)

- [ ] 11.3 Run the touch tests, confirm GREEN (impl from 11.1 satisfies them):
```
cd frontend && npx vitest run src/input/touchHandlers.test.js src/input/touchMath.test.js
```
Expected: all pass (existing + new nub specs).

- [ ] 11.4 Wire the nub into the live overlay. In `TouchControls.jsx`, add a throttled nub state + capture the return from `handleTouchMove`. Add near the other state (line ~38):
```js
  const [nub, setNub] = useState(null);
  const nubRafRef = useRef(0); // rAF throttle so the knob render doesn't fight the move loop (Game-Loop-Iso)
```
In the `onMove` handler, capture the return and schedule a throttled state write:
```js
    const onMove = (e) => {
      if (!getInput().active) return; // focus gate: let panel scroll / native touch through when not active
      const n = handleTouchMove(router, e.changedTouches, { camera: camera(), setIntent, sensitivity: useGameStore.getState().lookSensitivity ?? 1 });
      e.preventDefault();
      // W4: reflect the knob offset (throttled to one rAF) so the visible nub follows the thumb. The move
      // INTENTS are still written every event (above) — only the cosmetic knob is throttled.
      if (n !== undefined) {
        if (nubRafRef.current) return;
        nubRafRef.current = requestAnimationFrame(() => { nubRafRef.current = 0; setNub(n); });
      }
    };
```
On touch end, clear the nub (recenter the knob). In `onEnd`:
```js
    const onEnd = (e) => { handleTouchEnd(router, e.changedTouches, { setIntent }); e.preventDefault(); setNub(null); };
```
And pass it to the surface — change line 97 `{active && <TouchControlsSurface trayOpen={trayOpen} />}` to:
```js
      {active && <TouchControlsSurface trayOpen={trayOpen} nub={nub} />}
```
Add `cancelAnimationFrame(nubRafRef.current)` to the effect cleanup. Confirm `useState` is imported (it is — line 1).

- [ ] 11.5 Build + run touch suites + the touch-probe gate:
```
cd frontend && npm run build && npx vitest run src/input/ tests/gates/touch* 2>/dev/null
```
Expected: build success; touch suites green.

- [ ] 11.6 LIVE-LOOK via the existing touch-probe (the nub is a touch-only visual; the probe drives the touch surface). Drive it then drag the joystick:
```
cd frontend && node scripts/visual/touch-probe.mjs
```
Then Read the touch-probe output frame(s) under its `/tmp/` dir (check the probe's `OUT` const for the path) and confirm the joystick knob is rendered. NOTE: the existing touch-probe captures the static surface; if it does not simulate a sustained drag, ALSO confirm the nub visually by adding a one-off drag to the probe OR accept the unit-test lock (the nub offset is unit-locked in 11.2; the render binding is a 1-line prop pass) — document which in the commit. If the touch-probe path doesn't exercise a live drag, the nub correctness rests on the unit lock + the prop-pass being mechanically trivial.

- [ ] 11.7 Re-baseline check (mobile.png is the one touch baseline — confirm the static surface with `nub=null` is byte-identical, since a null nub renders the knob centered exactly as before):
```
cd frontend && npm run visual:capture && npx vitest run --config vitest.visual.config.js
```
Expected: visual gate GREEN (capture renders `<TouchControlsSurface trayOpen />` with NO nub prop → `nub=null` → centered knob → identical to the current mobile.png baseline).

- [ ] 11.8 Lint + commit:
```
cd frontend && npx eslint src/input/touchHandlers.js src/ui/TouchControls.jsx src/input/touchHandlers.test.js && git add src/input/touchHandlers.js src/ui/TouchControls.jsx src/input/touchHandlers.test.js && git commit -F - <<'MSG'
W4: touch joystick nub follows the thumb

handleTouchMove returns a ring-clamped knob offset; the live overlay reflects it
(rAF-throttled) into TouchControlsSurface's existing nub prop. Capture mobile.png
stays byte-identical (null nub = centered knob). Unit-locked.
MSG
```

**Done-gate:** build + touch suites green + visual gate green (mobile.png unchanged) + nub eyeballed (or unit-lock documented) + committed.

---

## Task 12 — Boot chrome: favicon + PWA manifest + apple-touch + OG/Twitter + theme-color + brand copy

**Files:**
- create `frontend/public/favicon.svg`
- create `frontend/public/manifest.webmanifest`
- modify `frontend/index.html`
- create `frontend/tests/gates/boot-chrome-gate.test.js`

**Steps:**

- [ ] 12.1 Write the failing static gate `frontend/tests/gates/boot-chrome-gate.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../');
const HTML = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

describe('boot chrome (index.html shipped <head>)', () => {
  it('links a favicon', () => {
    expect(/<link[^>]+rel=["']icon["'][^>]*>/.test(HTML)).toBe(true);
  });
  it('links a PWA web manifest', () => {
    expect(/<link[^>]+rel=["']manifest["'][^>]*>/.test(HTML)).toBe(true);
    expect(existsSync(resolve(ROOT, 'public/manifest.webmanifest'))).toBe(true);
  });
  it('links an apple-touch-icon', () => {
    expect(/<link[^>]+rel=["']apple-touch-icon["'][^>]*>/.test(HTML)).toBe(true);
  });
  it('declares a theme-color', () => {
    expect(/<meta[^>]+name=["']theme-color["'][^>]*>/.test(HTML)).toBe(true);
  });
  it('declares Open Graph + Twitter card meta', () => {
    expect(/property=["']og:title["']/.test(HTML)).toBe(true);
    expect(/property=["']og:description["']/.test(HTML)).toBe(true);
    expect(/name=["']twitter:card["']/.test(HTML)).toBe(true);
  });
  it('ships the favicon asset', () => {
    expect(existsSync(resolve(ROOT, 'public/favicon.svg'))).toBe(true);
  });
  it('contains NO trademark-risk "Minecraft" copy', () => {
    expect(/minecraft/i.test(HTML)).toBe(false);
  });
});
```

- [ ] 12.2 Run it, confirm RED (current `index.html` has none of these + the "Minecraft-style" copy):
```
cd frontend && npx vitest run tests/gates/boot-chrome-gate.test.js
```
Expected: most specs FAIL (favicon/manifest/apple-touch/theme/OG absent; Minecraft present).

- [ ] 12.3 Create the brand favicon `frontend/public/favicon.svg` (bold-flat: navy field, gold "C" mark — matches the locked navy `#0C1322` / gold `#C9A86A` tokens; no external font, pure SVG path so it renders crisp at any size + doubles as the apple-touch + PWA source):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="12" fill="#0C1322"/>
  <rect x="6" y="6" width="52" height="52" rx="9" fill="none" stroke="#1B2740" stroke-width="3"/>
  <path d="M44 22a15 15 0 1 0 0 20l-6-4a8 8 0 1 1 0-12z" fill="#C9A86A"/>
</svg>
```

- [ ] 12.4 Create `frontend/public/manifest.webmanifest`:
```json
{
  "name": "Crafty",
  "short_name": "Crafty",
  "description": "A magical voxel action-RPG — cast spells, tame the frontier, and face the Shadow Dragon.",
  "start_url": "/",
  "display": "standalone",
  "orientation": "landscape",
  "background_color": "#0C1322",
  "theme_color": "#0C1322",
  "icons": [
    { "src": "/favicon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }
  ]
}
```

- [ ] 12.5 Rewrite `frontend/index.html`'s `<head>` (replace the whole `<head>...</head>` block — brand-accurate description, no "Minecraft", + all chrome links). New `index.html`:
```html
<!doctype html>
<html lang="en">

<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="description" content="Crafty — a magical voxel action-RPG: cast elemental spells, tame the frontier, and face the Shadow Dragon across an infinite world." />
    <title>Crafty | Magical Voxel Adventure</title>

    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/favicon.svg" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="#0C1322" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

    <meta property="og:type" content="website" />
    <meta property="og:title" content="Crafty | Magical Voxel Adventure" />
    <meta property="og:description" content="Cast elemental spells, tame the frontier, and face the Shadow Dragon across an infinite voxel world." />
    <meta property="og:image" content="/favicon.svg" />

    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="Crafty | Magical Voxel Adventure" />
    <meta name="twitter:description" content="Cast elemental spells, tame the frontier, and face the Shadow Dragon across an infinite voxel world." />
    <meta name="twitter:image" content="/favicon.svg" />
</head>

<body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
    <script type="module" src="/src/index.jsx"></script>
</body>

</html>
```

- [ ] 12.6 Run the gate, confirm GREEN:
```
cd frontend && npx vitest run tests/gates/boot-chrome-gate.test.js
```
Expected: all 7 specs pass.

- [ ] 12.7 Build (confirm the public assets are picked up + the manifest validates as JSON via the build):
```
cd frontend && npm run build && ls -la dist/favicon.svg dist/manifest.webmanifest
```
Expected: build success; both files present in `dist/`.

- [ ] 12.8 LIVE-LOOK: serve the build + screenshot the tab/title + confirm the favicon is the brand mark, not the default globe. Quick probe via the existing preview:
```
cd frontend && node -e "const{spawn}=require('child_process');const s=spawn('npx',['vite','preview','--port','4198','--strictPort'],{stdio:'ignore'});setTimeout(async()=>{const p=require('puppeteer');const b=await p.launch({headless:'new',args:['--no-sandbox']});const pg=await b.newPage();await pg.goto('http://localhost:4198');await new Promise(r=>setTimeout(r,1500));const icon=await pg.evaluate(()=>document.querySelector('link[rel=icon]')?.href);const title=await pg.title();console.log('favicon href:',icon);console.log('title:',title);await pg.screenshot({path:'/tmp/crafty-boot-chrome.png'});await b.close();s.kill('SIGKILL');},4000);"
```
Expected: `favicon href:` ends with `/favicon.svg`, `title: Crafty | Magical Voxel Adventure`. Read `/tmp/crafty-boot-chrome.png` and confirm the app loads. (Tab-favicon rendering is browser chrome, not in the page screenshot — the `favicon href` log is the load-bearing confirmation it's wired; eyeball the SVG itself by reading `frontend/public/favicon.svg`.)

- [ ] 12.9 Lint (the gate test is JS) + commit:
```
cd frontend && npx eslint tests/gates/boot-chrome-gate.test.js && git add index.html public/favicon.svg public/manifest.webmanifest tests/gates/boot-chrome-gate.test.js && git commit -F - <<'MSG'
W4: boot chrome — favicon + PWA manifest + apple-touch + OG/Twitter + theme-color

Brand-accurate <head> (replaces the trademark-risk "Minecraft-style" copy);
bold-flat navy/gold SVG favicon doubles as PWA + apple-touch icon. Static gate
locks the chrome + the no-Minecraft rule.
MSG
```

**Done-gate:** boot-chrome gate green + build ships the assets + favicon href confirmed wired + brand copy verified ("Minecraft" gone) + committed.

---

## Task 13 — DEV-gate the index.jsx console ring-buffer patch (conditional — only if W1 didn't land it)

The spec assigns this to W1, but W1 plans are not yet authored/run. Confirm; if still ungated in prod, do it here.

**Files:**
- modify `frontend/src/index.jsx` (only if the console patch is NOT already `import.meta.env.DEV`-gated)

**Steps:**

- [ ] 13.1 Confirm current state (is the console monkeypatch DEV-gated yet?):
```
cd frontend && sed -n '1,3p' src/index.jsx && grep -n "import.meta.env.DEV" src/index.jsx
```
Decision: if line 1 is `if (import.meta.env.DEV && typeof window !== 'undefined') {` (or an equivalent DEV guard wraps the `__debugLogs` patch), W1 ALREADY landed it → SKIP to 13.6 (record skipped, no edit). If line 1 is `if (typeof window !== 'undefined') {` (the current state — patch runs in PROD), proceed to 13.2.

- [ ] 13.2 Add a failing static gate `frontend/tests/gates/console-patch-dev-gate.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dirname, '../../src/index.jsx'), 'utf8');

describe('index.jsx console ring-buffer patch', () => {
  it('the __debugLogs console monkeypatch is DEV-gated (never overrides console in prod)', () => {
    // the patch block must be guarded by import.meta.env.DEV so prod console is untouched.
    const patchUsesDevGate = /import\.meta\.env\.DEV[\s\S]{0,120}window\.__debugLogs/.test(SRC)
      || /__debugLogs[\s\S]*?import\.meta\.env\.DEV/.test(SRC) === false && /if\s*\(\s*import\.meta\.env\.DEV\s*&&\s*typeof window/.test(SRC);
    expect(/window\.__debugLogs/.test(SRC)).toBe(true); // the patch still exists (DEV-only)
    expect(/if\s*\(\s*import\.meta\.env\.DEV\b/.test(SRC)).toBe(true); // a DEV guard is present
  });
});
```

- [ ] 13.3 Run it, confirm RED (no DEV guard today):
```
cd frontend && npx vitest run tests/gates/console-patch-dev-gate.test.js
```
Expected: the `import.meta.env.DEV` spec FAILS.

- [ ] 13.4 DEV-gate the patch. Change `src/index.jsx` line 1 from:
```js
if (typeof window !== 'undefined') {
```
to:
```js
// DEV-ONLY: the console ring-buffer (consumed only by the DEV-gated DebugOverlay) must NOT override
// console in production (it ran in prod for no prod consumer). Gated so prod console stays native.
if (import.meta.env.DEV && typeof window !== 'undefined') {
```
(The block already closes at line 46; no other change needed — the `import`s and `applyThemeVars()` below run regardless.)

- [ ] 13.5 Run the gate GREEN + build:
```
cd frontend && npx vitest run tests/gates/console-patch-dev-gate.test.js && npm run build
```
Expected: gate passes; build success. (Optional sanity: `grep -c "__debugLogs" dist/assets/*.js` → 0 in the prod bundle, since the DEV branch tree-shakes.)

- [ ] 13.6 Commit (only if an edit was made in 13.4; if SKIPPED in 13.1, record "W1 already DEV-gated index.jsx — no W4 action" in the final report and skip this commit):
```
cd frontend && git add src/index.jsx tests/gates/console-patch-dev-gate.test.js && git commit -F - <<'MSG'
W4: DEV-gate the index.jsx console ring-buffer patch (W1 carry-over)

The __debugLogs monkeypatch ran in PROD for no prod consumer; now guarded by
import.meta.env.DEV (tree-shaken from the prod bundle). Static gate locks it.
MSG
```

**Done-gate:** either the patch is confirmed already DEV-gated (skip, recorded) OR the gate is green + build clean + committed.

---

## Final verification (run before declaring W4 complete — superpowers:verification-before-completion)

- [ ] V.1 Full unit suite green (the contract — should be the prior count + the new W4 tests):
```
cd frontend && npx vitest run
```
Expected: all suites pass; the new files (gameFeel, weatherGate, stormBed, affixes, weather-density-gate, boot-chrome-gate, mood.weatherboost, touchHandlers nub, console-patch-dev-gate) are all green.

- [ ] V.2 Build clean:
```
cd frontend && npm run build
```
Expected: `built in ...`, no errors/warnings beyond the known baseline.

- [ ] V.3 Lint clean across all touched source:
```
cd frontend && npx eslint src/game/gameFeel.js src/game/weatherGate.js src/audio/stormBed.js src/game/affixes.js src/Components.jsx src/GameScene.jsx src/render/mood.js src/render/Atmosphere.jsx src/store/useGameStore.jsx src/input/touchHandlers.js src/ui/TouchControls.jsx
```
Expected: no output.

- [ ] V.4 Zero-emoji / non-ASCII hard gate over the new src files (project lock):
```
cd frontend && grep -rnP "[^\x00-\x7F]" src/game/gameFeel.js src/game/weatherGate.js src/audio/stormBed.js src/game/affixes.js; echo "exit:$?"
```
Expected: no matches (grep exit 1 = clean).

- [ ] V.5 Visual capture gate green (deliberate re-baseline check — W4 is gameplay/chrome only; capture is frozen, so NO baseline should move):
```
cd frontend && npm run visual:capture && npx vitest run --config vitest.visual.config.js
```
Expected: GREEN, all 20 baselines within the 6% pixelmatch gate. If ANY frame diffs, that's an unintended capture leak from a W4 change — investigate before declaring done (a deliberate re-baseline is NOT expected for W4; movement/weather/affixes/nub are all capture-suppressed or capture-frozen, and the boot chrome is outside the canvas).

- [ ] V.6 Live-look frames eyeballed (the necessary-not-sufficient discipline): movement speed-ramp series rose (not instant), the storm frame is visibly darker than clear, the favicon is the brand mark. All three confirmed via the Read tool on the probe outputs in Tasks 4, 9, 12.

- [ ] V.7 Verify-Gate (superpowers:plan-verify): reconcile this task list against commit evidence — `git log --oneline` should show the 11-13 W4 commits; every Task's done-gate met; any SKIPPED item (e.g. Task 13 if W1 pre-gated index.jsx) explicitly recorded.
