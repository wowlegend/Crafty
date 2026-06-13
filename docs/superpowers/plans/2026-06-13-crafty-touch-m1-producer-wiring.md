# Touch Input M1 — Producer wiring (the touch overlay) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the M0 `touchMath.js` pure lib into the live game as a touch-overlay producer that drives the EXISTING `setIntent` / `setActive` / verb seams — making the game actually playable by touch — while staying **desktop-inert** (renders nothing on desktop) and **capture-safe** (renders nothing under `isCaptureMode()`), so all 17 visual baselines stay byte-identical.

**Architecture:** Three new small modules + two surgical edits. `input/touchDevice.js` (`isTouchDevice()` — the 3-tier `any-pointer:coarse` detector, spec §5). `input/touchHandlers.js` (pure-ish glue: synthetic-event → `makeTouchRouter` → `joystickToMove`→`setIntent` / `applyLook`→`camera.rotation`, dependency-injected so it unit-tests with a fake camera + spy `setIntent`). `ui/TouchControls.jsx` (a thin React shell: `if (isCaptureMode()) return null` first line, `isTouchDevice()` device-gate, full-screen transparent zones binding raw touch events with `touch-action:none`/`{passive:false}`, refs-not-setState, a Tap-to-Play / Pause focus model via `setActive`). Edits: extract `performVerb(button)` from Components' `handleMouseDown` + register it to the store (so a touch action-button reuses the exact desktop verb-routing); flip `Terrain.jsx:269` build-highlight gate from `document.pointerLockElement` to `getInput().active`; gate the App pause-on-unlock effect on `!isTouchDevice()`.

**Tech Stack:** React 19, R3F (camera via `store.gameCamera`, set at Components:170), zustand 5, vitest. No new deps (hand-rolled per spec §1 — nipplejs rejected for capture-determinism + direct-intent-wiring).

**Spec of record:** `docs/superpowers/specs/2026-06-13-crafty-touch-input-design.md` — §2 seam table, §3 traps (1 [BLOCKING] capture-pollution · 2 [HIGH] desktop-regression · 3 [HIGH] focus-lifecycle · 4 iOS gotchas · 6 [MEDIUM] Game-Loop-Isolation), §6 M1 row. M0 (`touchMath.js`) is SHIPPED + provides `joystickToMove` / `applyLook` / `makeTouchRouter` / `MAX_PITCH` / `LOOK_BASE_SENSITIVITY` / `DEFAULT_DEADZONE`.

> **Scope boundary (M1 vs M2):** M1 = the WIRING + desktop-inert/capture-safe plumbing, verified by static gates + unit tests + the 17 baselines staying green (NO re-baseline, NO new visual fixture). M2 = the VISIBLE thumb-cluster surface (joystick nub / buttons / crosshair styled S1-C) + the `mobile.png` visual fixture + the full `resumeControl()` relock-site refactor + Settings sensitivity. M1's zones are transparent/minimal; M1's action triggers can be invisible full-area taps — the point is the plumbing is correct + desktop is untouched.

---

### Task 1: `isTouchDevice()` detector

**Files:**
- Create: `frontend/src/input/touchDevice.js`
- Test: `frontend/src/input/touchDevice.test.js`

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/input/touchDevice.test.js
import { describe, it, expect, afterEach, vi } from 'vitest';
import { isTouchDevice } from './touchDevice.js';

const setEnv = ({ maxTouchPoints, anyCoarse, ontouchstart }) => {
  vi.stubGlobal('navigator', { maxTouchPoints: maxTouchPoints ?? 0 });
  vi.stubGlobal('window', {
    PointerEvent: maxTouchPoints !== undefined ? function () {} : undefined,
    matchMedia: (q) => ({ matches: q.includes('any-pointer: coarse') ? !!anyCoarse : false }),
    ...(ontouchstart ? { ontouchstart: null } : {}),
  });
};

describe('isTouchDevice', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('PointerEvent path: maxTouchPoints > 0 → touch', () => {
    setEnv({ maxTouchPoints: 5 });
    expect(isTouchDevice()).toBe(true);
  });

  it('PointerEvent path: maxTouchPoints 0 → not touch (desktop)', () => {
    setEnv({ maxTouchPoints: 0 });
    expect(isTouchDevice()).toBe(false);
  });

  it('iPad-with-trackpad (desktop UA, fine primary) still detected via any-pointer:coarse + maxTouchPoints', () => {
    setEnv({ maxTouchPoints: 5, anyCoarse: true });
    expect(isTouchDevice()).toBe(true);
  });

  it('legacy fallback (no PointerEvent): any-pointer:coarse matches → touch', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('window', { matchMedia: (q) => ({ matches: q.includes('any-pointer: coarse') }) });
    expect(isTouchDevice()).toBe(true);
  });

  it('SSR / no window → false (never crashes)', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('navigator', undefined);
    expect(isTouchDevice()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run (from `frontend/`): `npx vitest run src/input/touchDevice.test.js`
Expected: FAIL — `Failed to resolve import './touchDevice.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// frontend/src/input/touchDevice.js
/**
 * isTouchDevice() — capability detection for whether to mount the touch overlay (spec §5).
 * Uses any-pointer:coarse (NOT pointer:coarse) so a hybrid iPad-with-trackpad — which reports a
 * desktop-class UA + pointer:fine — still registers its touchscreen. 3-tier, SSR-safe.
 * NOTE: capability, not intent — M2 adds a Settings Auto/On/Off override + last-input-wins.
 */
export function isTouchDevice() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (window.PointerEvent && 'maxTouchPoints' in navigator) {
    if (navigator.maxTouchPoints > 0) return true;
    // a fine-only device with PointerEvent + 0 touch points is desktop, UNLESS any-pointer:coarse
    return window.matchMedia?.('(any-pointer: coarse)')?.matches ?? false;
  }
  return (window.matchMedia?.('(any-pointer: coarse)')?.matches ?? false) || 'ontouchstart' in window;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/input/touchDevice.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/input/touchDevice.js frontend/src/input/touchDevice.test.js
git commit -m "feat(touch-m1): isTouchDevice() — 3-tier any-pointer:coarse detector (hybrid-iPad safe)"
```

---

### Task 2: `touchHandlers.js` — the testable event→effect glue

**Files:**
- Create: `frontend/src/input/touchHandlers.js`
- Test: `frontend/src/input/touchHandlers.test.js`

**Why a separate module:** the TouchControls component is a thin DOM shell; the LOGIC (route a touch → quantize joystick → write intents; route a look-drag → write camera rotation) is dependency-injected here so it unit-tests with a synthetic router + a fake camera `{rotation:{x,y,order}}` + a spy `setIntent` — no DOM, no R3F.

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/input/touchHandlers.test.js
import { describe, it, expect, vi } from 'vitest';
import { makeTouchRouter } from './touchMath.js';
import { handleTouchMove, MOVE_KEYS } from './touchHandlers.js';

const T = (identifier, clientX, clientY) => ({ identifier, clientX, clientY });
const fakeCamera = () => ({ rotation: { x: 0, y: 0, order: 'YXZ' } });

describe('handleTouchMove (DI glue)', () => {
  it('move-zone drag writes the quantized move intents (up → moveF, clears others)', () => {
    const router = makeTouchRouter();
    router.onStart(T(1, 100, 400), 1000); // left → move
    const setIntent = vi.fn();
    handleTouchMove(router, [T(1, 100, 340)], { camera: fakeCamera(), setIntent, sensitivity: 1 });
    // up drag (dy -60) → moveF true, the other three false (each move key written every frame)
    expect(setIntent).toHaveBeenCalledWith('moveF', true);
    expect(setIntent).toHaveBeenCalledWith('moveB', false);
    expect(setIntent).toHaveBeenCalledWith('moveL', false);
    expect(setIntent).toHaveBeenCalledWith('moveR', false);
  });

  it('move-zone inside deadzone clears all four move intents (no chatter)', () => {
    const router = makeTouchRouter();
    router.onStart(T(1, 100, 400), 1000);
    const setIntent = vi.fn();
    handleTouchMove(router, [T(1, 102, 401)], { camera: fakeCamera(), setIntent, sensitivity: 1 });
    for (const k of MOVE_KEYS) expect(setIntent).toHaveBeenCalledWith(k, false);
  });

  it('look-zone drag writes camera.rotation (yaw/pitch) and NEVER calls setIntent', () => {
    const router = makeTouchRouter();
    router.onStart(T(2, 900, 400), 1000); // right → look
    const setIntent = vi.fn();
    const camera = fakeCamera();
    handleTouchMove(router, [T(2, 850, 420)], { camera, setIntent, sensitivity: 1 });
    expect(camera.rotation.y).toBeCloseTo(-(-50) * 0.002, 10); // dx = 850-900 = -50 → yaw -= dx*k
    expect(camera.rotation.x).toBeCloseTo(-(20) * 0.002, 10);  // dy = 420-400 = 20 → pitch -= dy*k
    expect(setIntent).not.toHaveBeenCalled();
  });

  it('a null camera is tolerated (look no-ops, no throw)', () => {
    const router = makeTouchRouter();
    router.onStart(T(2, 900, 400), 1000);
    expect(() => handleTouchMove(router, [T(2, 850, 420)], { camera: null, setIntent: vi.fn(), sensitivity: 1 })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/input/touchHandlers.test.js`
Expected: FAIL — `Failed to resolve import './touchHandlers.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// frontend/src/input/touchHandlers.js
/**
 * touchHandlers.js — the dependency-injected glue between the M0 pure math and the live game.
 * The TouchControls component owns the DOM/refs; this owns the per-event effect so it unit-tests
 * with a fake camera + spy setIntent (no DOM, no R3F). Game-Loop-Isolation preserved: callers
 * invoke these from raw touch listeners writing setIntent / camera mutation — never React state.
 */
import { joystickToMove, applyLook } from './touchMath.js';

export const MOVE_KEYS = ['moveF', 'moveB', 'moveL', 'moveR'];

/**
 * Apply a touchmove event's changed touches: move-zone → quantized boolean move intents;
 * look-zone → camera.rotation yaw/pitch (reusing the M0 clamp). `deps` = {camera,setIntent,sensitivity}.
 */
export function handleTouchMove(router, touchList, { camera, setIntent, sensitivity = 1 }) {
  for (const t of touchList) {
    const r = router.onMove(t);
    if (!r) continue;
    if (r.zone === 'move') {
      const m = joystickToMove(r.vecX, r.vecY);
      for (const k of MOVE_KEYS) setIntent(k, m[k]); // write every key every frame (keydown/up parity)
    } else if (camera && camera.rotation) {
      const { yaw, pitch } = applyLook(camera.rotation.y, camera.rotation.x, r.dx, r.dy, sensitivity);
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
    }
  }
}

/** On touch end/cancel: if the released touch owned the MOVE zone, clear all four move intents. */
export function handleTouchEnd(router, touchList, { setIntent }) {
  for (const t of touchList) {
    const r = router.onEnd(t);
    if (r && r.zone === 'move') for (const k of MOVE_KEYS) setIntent(k, false);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/input/touchHandlers.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/input/touchHandlers.js frontend/src/input/touchHandlers.test.js
git commit -m "feat(touch-m1): touchHandlers — DI move→intent / look→camera glue (testable, Game-Loop-safe)"
```

---

### Task 3: Extract `performVerb(button)` in Components + register to the store

**Files:**
- Modify: `frontend/src/Components.jsx` (the `handleMouseDown` block ~:420-481 + the listener-setup effect)

**Why:** a touch action-button must fire the EXACT same context-routed verb (`routeMouseVerb` → attack/cast/mine/place/interact) as the desktop mouse. The body already closes over everything it needs (`getInput`, `camera`, `useGameStore`, `GameMethods`, `routeMouseVerb`, `isPointInCone`, `AIM_CONE_*`, `THREE`, `triggerMeleeAttack`, `triggerSpellCast`, `voidhandVerbRef`, `castFiredRef`). Extract it in-place as `performVerb(button)`; `handleMouseDown` becomes a one-liner; register `performVerb` to the store so TouchControls can call it. Byte-exact behavior for desktop.

- [ ] **Step 1: Refactor (no test-first — this is a behavior-preserving extraction; the desktop verify is the 17 baselines + build)**

In `Components.jsx`, replace the `const handleMouseDown = (e) => { ... };` block (the whole body at ~:420-481) with:

```js
    // #72 VERB ROUTER (unchanged logic): one click / one touch-tap -> exactly ONE verb.
    // Extracted to performVerb(button) so the touch overlay (M1) reuses the identical
    // ctx-build + routeMouseVerb dispatch (spec §2 seam table). handleMouseDown is now a thin
    // adapter; performVerb is registered to the store for TouchControls.
    const performVerb = (button) => {
      if (!getInput().active) return;
      if (button !== 0 && button !== 2) return;
      const store = useGameStore.getState();
      if (!store.isAlive) return;

      const lookDir = new THREE.Vector3();
      camera.getWorldDirection(lookDir);
      const aimDir = lookDir.clone();
      lookDir.y = 0; lookDir.normalize();
      const playerPos = camera.position.clone();
      playerPos.y -= 0.8;

      let meleeHit = false;
      if (GameMethods.checkMobsInMeleeCone) {
        meleeHit = GameMethods.checkMobsInMeleeCone(playerPos, lookDir, 4.5, Math.PI / 2).length > 0;
      }
      if (!meleeHit && store.isBossActive?.() && store.getBossPosition) {
        const bp = store.getBossPosition();
        if (bp) meleeHit = isPointInCone(playerPos, lookDir, { x: bp[0], y: bp[1], z: bp[2] }, 4.5, Math.PI / 2);
      }

      let aimedMobDist = Infinity;
      if (GameMethods.checkMobsInMeleeCone) {
        for (const m of GameMethods.checkMobsInMeleeCone(playerPos, aimDir, AIM_CONE_RANGE, AIM_CONE_ARC)) {
          const dx = m.position.x - playerPos.x, dy = m.position.y - playerPos.y, dz = m.position.z - playerPos.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d < aimedMobDist) aimedMobDist = d;
        }
      }
      if (store.isBossActive?.() && store.getBossPosition) {
        const bp = store.getBossPosition();
        if (bp && isPointInCone(playerPos, aimDir, { x: bp[0], y: bp[1], z: bp[2] }, AIM_CONE_RANGE, AIM_CONE_ARC)) {
          const dx = bp[0] - playerPos.x, dy = bp[1] - playerPos.y, dz = bp[2] - playerPos.z;
          aimedMobDist = Math.min(aimedMobDist, Math.sqrt(dx * dx + dy * dy + dz * dz));
        }
      }

      const hit = GameMethods.castBuildRay ? GameMethods.castBuildRay() : null;
      const verb = routeMouseVerb(button, {
        held: store.voidhandHeld,
        meleeHit,
        aimedMobDist,
        terrainDist: hit ? hit.toi : Infinity,
        chestTargeted: !!(hit && hit.chestTargeted),
      });

      if (verb === 'attack') {
        if (store.voidhandHeld) voidhandVerbRef.current.attack = true;
        else triggerMeleeAttack();
      } else if (verb === 'cast') {
        if (store.voidhandHeld) voidhandVerbRef.current.cast = true;
        else { triggerSpellCast(); castFiredRef.current = true; }
      } else if (verb === 'mine') GameMethods.terrainVerbs?.mine(hit);
      else if (verb === 'place') GameMethods.terrainVerbs?.place(hit);
      else if (verb === 'interact') GameMethods.terrainVerbs?.open(hit);
    };
    const handleMouseDown = (e) => performVerb(e.button);
    useGameStore.setState({ performVerb }); // touch overlay (M1) dispatches via store.performVerb
```

(The `useGameStore.setState({ performVerb })` line goes inside the same `useEffect` that registers the listeners, right after `performVerb` is defined.)

- [ ] **Step 2: Verify desktop is byte-exact**

Run (from `frontend/`):
- `npx vitest run` → 975 (970 + 5 touchDevice; touchHandlers' 4 land in Task 2's commit already → 979 if Task 2 done first; count must only GROW).
- `npm run build` → clean.
- `npx vitest run --config vitest.visual.config.js` → **17/17** (desktop mouse path identical; the camera capture pose is unchanged).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/Components.jsx
git commit -m "refactor(touch-m1): extract performVerb(button) from handleMouseDown + register to store (byte-exact desktop)"
```

---

### Task 4: `TouchControls.jsx` — the capture-safe, desktop-inert overlay + mount

**Files:**
- Create: `frontend/src/ui/TouchControls.jsx`
- Modify: `frontend/src/App.jsx` (mount near `<HUD>` ~:726)

- [ ] **Step 1: Write the component**

```jsx
// frontend/src/ui/TouchControls.jsx
import { useEffect, useRef } from 'react';
import { isCaptureMode } from '../devtest/captureMode';
import { isTouchDevice } from '../input/touchDevice';
import { useGameStore } from '../store/useGameStore';
import { useActiveInput } from '../input/useActiveInput';
import { setIntent, setActive, getInput } from '../input/inputState';
import { makeTouchRouter } from '../input/touchMath';
import { handleTouchMove, handleTouchEnd, MOVE_KEYS } from '../input/touchHandlers';

// Desktop-inert + capture-safe by construction. Renders transparent full-screen touch zones
// (M1 = plumbing; M2 styles the visible joystick/buttons/crosshair). All input writes go through
// setIntent/setActive/store.performVerb via refs — NEVER React state per move (Game-Loop Isolation).
export default function TouchControls({ isWorldBuilt }) {
  // BLOCKING trap-1: never under capture (covers all 17 baselines at once). HIGH trap-2: never on desktop.
  if (isCaptureMode() || !isTouchDevice()) return null;
  return <TouchControlsLive isWorldBuilt={isWorldBuilt} />;
}

// isWorldBuilt is App-LOCAL useState (App.jsx:105 — verified NOT a store key) → passed as a prop.
function TouchControlsLive({ isWorldBuilt }) {
  const rootRef = useRef(null);
  const routerRef = useRef(makeTouchRouter());
  const active = useActiveInput();            // SAFE reactive read (transition-state only — spec/inputState; export verified src/input/useActiveInput.js)
  const isAlive = useGameStore((s) => s.isAlive); // verified store key (handleMouseDown reads store.isAlive)

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const router = routerRef.current;
    const camera = () => useGameStore.getState().gameCamera;

    const onStart = (e) => {
      const w = window.innerWidth;
      for (const t of e.changedTouches) router.onStart(t, w);
      e.preventDefault();
    };
    const onMove = (e) => {
      handleTouchMove(router, e.changedTouches, { camera: camera(), setIntent, sensitivity: 1 });
      e.preventDefault();
    };
    const onEnd = (e) => { handleTouchEnd(router, e.changedTouches, { setIntent }); e.preventDefault(); };

    // passive:false so preventDefault() actually cancels scroll/zoom/pull-to-refresh (spec §4).
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: false });
    el.addEventListener('touchcancel', onEnd, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      for (const k of MOVE_KEYS) setIntent(k, false); // clear on unmount
    };
  }, []);

  // Focus model (spec §3 trap-3): touch owns setActive. Tap-to-Play when world is up + alive + not yet live.
  const showTapToPlay = isWorldBuilt && isAlive && !active;
  return (
    <div
      ref={rootRef}
      style={{ position: 'fixed', inset: 0, zIndex: 40, touchAction: 'none',
               WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      {/* M1: transparent move/look zones are the whole surface (left=move via x<50%, right=look) */}
      {showTapToPlay && (
        <button
          onPointerUp={() => setActive(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
                   background: 'transparent', border: 'none', color: 'transparent' }}
          aria-label="Tap to play"
        />
      )}
      {active && (
        <button
          onPointerUp={() => setActive(false)}
          style={{ position: 'absolute', top: 'env(safe-area-inset-top, 8px)', right: 8,
                   width: 44, height: 44, opacity: 0.01 }}
          aria-label="Pause"
        />
      )}
      {/* M1: a single invisible primary-action tap (button 0). M2 adds the styled cluster + cast/jump. */}
      {active && (
        <button
          onPointerUp={() => useGameStore.getState().performVerb?.(0)}
          style={{ position: 'absolute', bottom: 'env(safe-area-inset-bottom, 24px)', right: 24,
                   width: 72, height: 72, opacity: 0.01 }}
          aria-label="Action"
        />
      )}
    </div>
  );
}
```

> NOTE (verified): `useActiveInput` exports from `src/input/useActiveInput.js` (App.jsx:19 imports it). `isWorldBuilt` is App-LOCAL `useState` (App.jsx:105), NOT a store key → passed as a PROP (above). `isAlive` IS a store key. `gameCamera` may be null at first touch (pre-mount) → `handleTouchMove`'s null-camera guard (Task 2) covers it. `isCaptureMode` from `src/devtest/captureMode.js`.

- [ ] **Step 2: Mount in App.jsx** — add `<TouchControls isWorldBuilt={isWorldBuilt} />` as a sibling right after `<HUD ... />` (~:743, before `<MenuSystem`; App already holds `isWorldBuilt` local state at :105), and `import TouchControls from './ui/TouchControls'` at the top.

- [ ] **Step 3: Verify desktop-inert + capture-safe**

Run: `npx vitest run --config vitest.visual.config.js` → **17/17 byte-identical** (the component returns null under capture AND on the desktop CI pointer profile → zero pixels). `npm run build` → clean. `npx vitest run` → count holds-or-grows.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/ui/TouchControls.jsx frontend/src/App.jsx
git commit -m "feat(touch-m1): TouchControls overlay — capture-safe + desktop-inert; zones wire touchMath→setIntent/camera/performVerb"
```

---

### Task 5: Build-highlight + pause-effect touch guards, static gates, full battery, close-out

**Files:**
- Modify: `frontend/src/world/Terrain.jsx:269` · `frontend/src/App.jsx` (pause effect ~:171)
- Create: `frontend/tests/gates/touch-wiring-gates.test.js`

- [ ] **Step 1: Flip the build-highlight gate (Terrain.jsx:269)**

Change `if (!meshRef.current || !world || !document.pointerLockElement) {` to:
```js
        if (!meshRef.current || !world || !getInput().active) {
```
and add `import { getInput } from '../input/inputState';` (grep first — it may already be imported). Rationale: `active` is true exactly when pointer-locked on desktop (no regression) AND true on touch (so the build outline shows). Spec §2.

- [ ] **Step 2: Guard the App pause-on-unlock effect (App.jsx ~:171)**

Change the guard to also require non-touch, so a touch `setActive(false)` (panel/pause) never auto-opens Settings:
```js
      if (!isTouchDevice() && s.isAlive && s.gameStarted &&
          !isAnyPanelOpen({ ...s, showSpellUpgrades, showAchievements, showStats, showAuthModal })) {
        s.setShowSettings(true);
      }
```
and `import { isTouchDevice } from './input/touchDevice'`. (NB: the effect is currently inert anyway because `gameStarted` is never set — see KEVIN batch — but this guard is correct regardless of that bug's fix.)

- [ ] **Step 3: Write the static gates**

```js
// frontend/tests/gates/touch-wiring-gates.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(here, '../../', p), 'utf8');

describe('touch wiring gates (M1)', () => {
  it('TouchControls early-returns null under isCaptureMode AND !isTouchDevice (trap-1/2)', () => {
    const c = read('src/ui/TouchControls.jsx');
    expect(/if\s*\(\s*isCaptureMode\(\)\s*\|\|\s*!isTouchDevice\(\)\s*\)\s*return null/.test(c)).toBe(true);
  });

  it('TouchControls writes through setIntent/setActive — NEVER reads document.pointerLockElement (trap-2)', () => {
    const c = read('src/ui/TouchControls.jsx');
    expect(c.includes('document.pointerLockElement')).toBe(false);
    expect(/setActive|setIntent|performVerb/.test(c)).toBe(true);
  });

  it('Components.jsx still has document.pointerLockElement AT MOST ONCE (single active-authority preserved)', () => {
    const m = read('src/Components.jsx').match(/document\.pointerLockElement/g) || [];
    expect(m.length).toBeLessThanOrEqual(1);
  });

  it('touch move/look uses refs, not React state — no setState/useState inside a touch handler (trap-6)', () => {
    const c = read('src/ui/TouchControls.jsx');
    // crude but effective: the touchmove handler body must not call a setter
    const moveBody = c.slice(c.indexOf('const onMove'), c.indexOf('const onEnd'));
    expect(/set[A-Z]\w*\(|useState/.test(moveBody)).toBe(false);
  });
});
```

- [ ] **Step 4: Full battery**

Run (from `frontend/`):
- `npx vitest run` → ~983 (970 + 5 touchDevice + 4 touchHandlers + 4 wiring gates), 0 failed (re-run once if the flaky Rapier WASM test stderrs).
- `npm run build` → clean.
- `npx vitest run --config vitest.visual.config.js` → **17/17 byte-identical** (desktop-inert + capture-null proven).
- Grep the new src files for U+2190–21FF/2300–23FF arrows (the zero-emoji hard gate) BEFORE committing — use `->` not `→` in comments.

- [ ] **Step 5: Commit + close-out**

```bash
git add frontend/src/world/Terrain.jsx frontend/src/App.jsx frontend/tests/gates/touch-wiring-gates.test.js
git commit -m "feat(touch-m1): build-highlight + pause guards for touch + the M1 wiring static gates"
git push origin main
```
- Banner this plan `✅ SHIPPED`; mark spec §6 M1 row done; update ACTIVE_PLAN (M1 shipped + NEXT = M2 the MVP visible surface + mobile.png fixture); CHANGELOG entry.
- **Adversarial review (charter §4, big delta):** spawn a Workflow to verify the M1 diff — desktop-regression (performVerb byte-exactness vs the original handleMouseDown), capture/desktop-inert proof, the single-active-authority invariant, Game-Loop-Isolation (no per-move setState), and that no other surface keys off `document.pointerLockElement`. Fix confirmed findings before declaring done.

## Self-Review

**Spec coverage:** §6 M1 row ("overlay consuming M0 → setIntent/setActive/routeMouseVerb-triggers; mounts only coarsePointer + null under capture; look writes camera.rotation; touch owns setActive; touchmove writes refs") → Task1 (detect) + Task2 (move/look glue) + Task3 (performVerb) + Task4 (overlay + focus model + mount) + Task5 (Terrain/App guards + the 4 static gates the spec names). ✅ Traps: 1 [BLOCKING] capture-null (Task4 first line + gate); 2 [HIGH] desktop-inert (isTouchDevice gate + pointerLockElement≤1 gate); 3 [HIGH] focus-lifecycle (Tap-to-Play/Pause setActive + App guard); 4 iOS (touch-action:none + passive:false + user-select); 6 [MEDIUM] Game-Loop-Isolation (refs + the no-setState gate). ✅

**Placeholder scan:** none — every step has concrete code + exact commands. The one flagged uncertainty (the `useActiveInput`/`isWorldBuilt` exact export names) is called out with a grep-first instruction, not left silent.

**Type consistency:** `handleTouchMove(router, touchList, {camera,setIntent,sensitivity})`; `MOVE_KEYS` shared; `joystickToMove`/`applyLook`/`makeTouchRouter` signatures match M0; `performVerb(button:0|2)` matches `routeMouseVerb(button, ctx)`. ✅

## Execution Handoff
Recommended: **Inline execution** for Tasks 1-2 (pure, low-risk), then a careful read for Tasks 3-4 (the integration risk), then the **adversarial-review Workflow** in Task 5 (the charter mandates it for a delta that touches the load-bearing player controller + the active-authority invariant).
