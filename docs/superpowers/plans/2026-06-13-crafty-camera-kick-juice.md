# Camera-Kick Juice (per-verb impact weight) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Add per-verb camera "kick" — a brief directional camera lurch on melee / cast / slam / hard-landing — so every action has tactile WEIGHT (the §6 "per-verb camera kicks" backlog item). Distinct from the existing random damage-jitter (`cameraShakeIntensity`): a kick is an intentional, directional, quickly-recovering impulse.

**Architecture:** A pure `game/cameraKick.js` (an impulse-accumulator that exponentially decays toward zero — fully unit-testable, no React/Three). The `Player` follow-cam (Components.jsx:1172-1218) already adds a `shakeX/Y/Z` offset to the camera target; the kick adds its decaying offset there too. The verb triggers (`triggerMeleeAttack` :234, `triggerSpellCast` :317, the hurl/slam, the landing edge) push a camera-LOCAL impulse (converted to world via the camera basis). **Capture-safe by construction:** the Player loop early-returns under `isCaptureMode()` long before :1172, so the kick never affects the 18 visual baselines (no re-capture/re-baseline needed — immune to the flaky capture harness). FEEL is play/Kevin-verified (like audio); the LOGIC is unit-tested.

**Tech Stack:** plain JS (the pure module) + a surgical Components wiring edit. Game-Loop-Isolation: the kick state is a `useRef` (transient), stepped in `useFrame`, never React state.

> **Reference/discipline:** game-feel, not a look — no visual baseline. The taste check is in-play (does an attack feel "weighty" not "twitchy"?). Tunables = the KICK_PROFILES magnitudes + decay; keep SUBTLE (a few cm of lurch + fast recovery), never nauseating.

---

### Task 1: the pure `cameraKick.js` module

**Files:** Create `frontend/src/game/cameraKick.js` + `frontend/src/game/cameraKick.test.js`

- [ ] **Step 1: failing test**
```js
// frontend/src/game/cameraKick.test.js
import { describe, it, expect } from 'vitest';
import { makeKick, addKick, stepKick, KICK_PROFILES, KICK_DECAY } from './cameraKick.js';

describe('cameraKick', () => {
  it('a fresh kick is zero offset', () => {
    expect(stepKick(makeKick(), 0.016)).toEqual({ x: 0, y: 0, z: 0 });
  });
  it('addKick injects an impulse the next step returns (decayed by < one full frame)', () => {
    const k = makeKick();
    addKick(k, [0, -0.2, 0]);
    const o = stepKick(k, 0.016);
    expect(o.y).toBeLessThan(0);            // kicked down
    expect(o.y).toBeGreaterThan(-0.2);      // already decaying
  });
  it('decays toward zero over ~0.3s (recovers, never lingers)', () => {
    const k = makeKick();
    addKick(k, [0.3, -0.3, 0.3]);
    let o;
    for (let i = 0; i < 20; i++) o = stepKick(k, 0.016); // ~0.32s
    expect(Math.hypot(o.x, o.y, o.z)).toBeLessThan(0.01);
  });
  it('accumulates concurrent kicks (no overwrite) + never NaNs', () => {
    const k = makeKick();
    addKick(k, [0.1, 0, 0]); addKick(k, [0.1, 0, 0]);
    const o = stepKick(k, 0.016);
    expect(o.x).toBeGreaterThan(0.1);
    expect(Number.isNaN(o.x)).toBe(false);
  });
  it('exposes per-verb profiles (melee/cast/slam/land) + a sane decay', () => {
    for (const v of ['melee', 'cast', 'slam', 'land']) {
      expect(Array.isArray(KICK_PROFILES[v]) && KICK_PROFILES[v].length === 3).toBe(true);
    }
    expect(KICK_DECAY).toBeGreaterThan(4);  // recovers in well under a second
  });
});
```
- [ ] **Step 2: run → RED** (`npx vitest run src/game/cameraKick.test.js`).
- [ ] **Step 3: implement**
```js
// frontend/src/game/cameraKick.js
/**
 * cameraKick.js — PURE per-verb camera-kick impulse model (no React/Three; node-testable).
 * A kick is a transient positional offset (camera-local, the caller converts to world) that is
 * injected instantly (addKick) and exponentially decays toward zero (stepKick) — giving actions a
 * brief tactile lurch + fast recovery. Distinct from the random damage-jitter (cameraShakeIntensity).
 * Consumed by the Player follow-cam (added to the shake offset, below the isCaptureMode early-return).
 */
export const KICK_DECAY = 11; // per-second exponential rate -> ~0.25s recovery; SUBTLE, never nauseating

// per-verb impulse in camera-local axes [right(+x), up(+y), forward(-z is forward in three cam space)]
// kept small (a few cm). melee = a down+back thunk; cast = a gentle forward push; slam = hard down;
// land = a downward bob punch.
export const KICK_PROFILES = {
  melee: [0, -0.07, 0.09],   // down + back (recoil)
  cast:  [0, 0.03, -0.10],   // slight up + forward push
  slam:  [0, -0.16, 0.06],   // hard down
  land:  [0, -0.12, 0],      // down bob
};

export function makeKick() { return { x: 0, y: 0, z: 0 }; }

export function addKick(k, [dx, dy, dz]) { k.x += dx; k.y += dy; k.z += dz; }

/** Decay the kick toward zero and return the current offset (same object reused by caller is fine). */
export function stepKick(k, delta, decay = KICK_DECAY) {
  const f = Math.exp(-decay * Math.max(0, delta)); // 0<f<1
  k.x *= f; k.y *= f; k.z *= f;
  if (Math.abs(k.x) < 1e-4) k.x = 0;
  if (Math.abs(k.y) < 1e-4) k.y = 0;
  if (Math.abs(k.z) < 1e-4) k.z = 0;
  return { x: k.x, y: k.y, z: k.z };
}
```
- [ ] **Step 4: run → GREEN.**
- [ ] **Step 5: commit** `feat(juice): cameraKick.js — pure per-verb kick-impulse model (decaying, capture-safe)`

---

### Task 2: wire the kick into the Player follow-cam + verb triggers

**Files:** Modify `frontend/src/Components.jsx`

- [ ] **Step 1:** add `import { makeKick, addKick, stepKick, KICK_PROFILES } from './game/cameraKick';` + a `const kickRef = useRef(makeKick());` near the other refs.
- [ ] **Step 2:** a helper that converts a camera-local profile to world + injects it, callable from the verbs:
```js
  const fireKick = (profile) => {
    if (isCaptureMode()) return;                 // belt-and-suspenders (loop also early-returns)
    const [lx, ly, lz] = profile;
    // camera-local -> world: right * lx + up * ly + (-forward) * lz, using the camera basis
    const e = new THREE.Vector3();
    camera.getWorldDirection(e); e.y = 0; e.normalize();          // flattened forward
    const right = new THREE.Vector3(e.z, 0, -e.x);                // forward x up
    addKick(kickRef.current, [right.x*lx + e.x*lz, ly, right.z*lx + e.z*lz]);
  };
```
  (Refine the basis math at build; the key is a SMALL world-space impulse. `ly` is world-up directly.)
- [ ] **Step 3:** in `triggerMeleeAttack` add `fireKick(KICK_PROFILES.melee);`; in `triggerSpellCast` add `fireKick(KICK_PROFILES.cast);`. (Hurl/slam → `KICK_PROFILES.slam` at the slam dispatch; the landing edge `prevGroundedRef` transition ~:1168 → `fireKick(KICK_PROFILES.land)` — only on a real fall-landing, gate on downward velocity so every step doesn't kick.)
- [ ] **Step 4:** in the follow-cam (after the shake block ~:1185, before the target compute), step the kick + add to the offset:
```js
    const kick = stepKick(kickRef.current, delta);
    // then at the target: targetX += kick.x; targetY += kick.y; targetZ += kick.z;
```
  Fold `kick.x/y/z` into `targetX/Y/Z` (:1210-1212) alongside `shakeX/Y/Z`.
- [ ] **Step 5: verify** — `npx vitest run` (count holds-or-grows), `npm run build` clean, `npx vitest run --config vitest.visual.config.js` → **18/18 byte-identical** (the kick is below the capture early-return → never in a baseline; NO re-capture needed). Then drive the app (Kevin/play) to feel it — tune magnitudes if twitchy.
- [ ] **Step 6: commit** `feat(juice): wire per-verb camera kick into the Player follow-cam (melee/cast/slam/land)` + close-out (CHANGELOG + ACTIVE_PLAN; KRB note: "camera-kick juice — feel-check in play, tune KICK_PROFILES if too strong/subtle").

## Self-Review
- **Spec/backlog coverage:** §6 "per-verb camera kicks" ✓. **Placeholder scan:** the basis math in Task 2 Step 2 is flagged "refine at build" with the intent stated (a small world-space impulse) — not silent. **Capture-safety:** the kick lives below the `isCaptureMode()` early-return + a belt-and-suspenders guard in `fireKick`; visual 18/18 unchanged is the gate. **Game-Loop-Isolation:** `kickRef` is a ref, stepped in useFrame, never setState.

## Execution Handoff
Inline. Task 1 (pure module) is the safe, fully-verified core; Task 2 touches the load-bearing follow-cam — keep it additive (fold into the existing shake offset) + verify 18/18 holds.
