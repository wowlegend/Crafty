# Damage-direction cues (combat-legibility interleave) Implementation Plan

> **✅ SHIPPED (loop iters 149-150, 2026-06-13).** T1 (149): pure `game/damageDirection.js` `hitDirection` + non-breaking `damagePlayer(…, sourcePos)` → `lastHitDir` + mob-melee threaded (commit `1abebbc`). T2 (150): `ui/DamageDirection.jsx` HUD cue — a red screen-edge glow placed from the angle (aspect-ratio robust), framer-motion fade ~0.8s in play / fixed-opacity gated on a `hitDir` capture-opt under capture (the 18 baselines pass no opt → null, like showTouch); mounted beside DamageOverlay. HD self-eyeballed (right-rear hit → lower-right glow, +26.5 red-dominance). 1031 unit · build clean · visual 18/18 byte-identical (capture-null → no re-baseline). Commit `83e6968`. **Follow-up (not blocking):** thread the projectile (`SimplifiedNPCSystem:609` — the stepper returns a hit COUNT, needs a small change to return positions) + BossEntity call-sites with their source positions; an optional permanent `damage-dir` gate fixture (the cue is capture-null in normal play, so no regression risk today).

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** When the player takes a hit, show WHICH WAY it came from (a screen-edge directional cue), not just the existing non-directional `damageFlash` + `screenShake`. A SOTA combat-legibility staple (Diablo/Vampire-Survivors/etc.) — you instinctively turn toward the threat. Fresh axis (combat game-feel) per the §5 interleave-floor.

**Architecture (charter §5 SOTA interleave — additive, non-breaking, capture-safe):** a pure `game/damageDirection.js` computes the on-screen angle toward an incoming hit from (playerPos, sourcePos, cameraYaw). `damagePlayer(amount, source, sourcePos=null)` gains an OPTIONAL 3rd param (existing calls unaffected) → when sourcePos is supplied it reads `gameCamera.rotation.y` (yaw) + `playerPosition` from the store, computes the angle, and stores `lastHitDir = { angle, t }`. A HUD `<DamageDirection>` (T2) reads it + renders a fading edge arc. **Capture-safe:** the cue only exists transiently after a real hit; capture never damages the player → the 18 baselines stay null (like the aggro snarl / camera kick) — no re-baseline for the core, and T2's visual gets its own opt-in fixture.

**Convention (unit-tested):** angle 0 = dead ahead (top of screen), +π/2 = right, −π/2 = left, ±π = behind. Derived from the three.js YXZ camera basis: forward `(−sinθ,0,−cosθ)`, right `(cosθ,0,−sinθ)`; `angle = atan2(d·right, d·forward)`.

**Tech Stack:** pure-module + vitest (the touchMath/cameraKick precedent); the existing `damagePlayer` store seam + `gameCamera`/`playerPosition` store fields.

---

### Task 1 (this cut — capture-SAFE): the pure math + non-breaking plumbing

**Files:** Create `frontend/src/game/damageDirection.js` + `frontend/src/game/damageDirection.test.js`; Modify `frontend/src/store/useGameStore.jsx`; Modify `frontend/src/SimplifiedNPCSystem.jsx`

- [ ] **Step 1 (RED):** `game/damageDirection.test.js` — pin the 4 cardinals at yaw 0 + a yaw-rotation case + null-safety:
```js
import { describe, it, expect } from 'vitest';
import { hitDirection } from './damageDirection';
const P = { x: 0, y: 0, z: 0 };
const near = (a, b) => Math.abs(a - b) < 1e-6;
describe('hitDirection — screen-relative incoming-hit angle', () => {
  it('yaw 0: front=0, right=+pi/2, left=-pi/2, behind=+/-pi', () => {
    expect(near(hitDirection(P, { x: 0, y: 0, z: -1 }, 0), 0)).toBe(true);        // ahead -> top
    expect(near(hitDirection(P, { x: 1, y: 0, z: 0 }, 0), Math.PI / 2)).toBe(true); // right
    expect(near(hitDirection(P, { x: -1, y: 0, z: 0 }, 0), -Math.PI / 2)).toBe(true); // left
    expect(Math.abs(Math.abs(hitDirection(P, { x: 0, y: 0, z: 1 }, 0)) - Math.PI) < 1e-6).toBe(true); // behind
  });
  it('rotating the camera yaw rotates the cue oppositely (a front hit reads right when you turn left)', () => {
    // source dead ahead in world (-z); turn the camera +pi/2 (yaw) -> the hit is now to screen-left
    expect(near(hitDirection(P, { x: 0, y: 0, z: -1 }, Math.PI / 2), -Math.PI / 2)).toBe(true);
  });
  it('accepts arrays or {x,z}; null source -> null; co-located -> 0', () => {
    expect(hitDirection([0,0,0], [1,0,0], 0)).toBeCloseTo(Math.PI / 2);
    expect(hitDirection(P, null, 0)).toBe(null);
    expect(hitDirection(P, P, 0)).toBe(0);
  });
});
```
Run `npx vitest run src/game/damageDirection.test.js` → FAIL (module missing).

- [ ] **Step 2 (GREEN):** `game/damageDirection.js`:
```js
/**
 * damageDirection.js — the screen-relative angle toward an incoming hit (combat-legibility cue).
 * 0 = dead ahead (top of screen), +pi/2 = right, -pi/2 = left, +/-pi = behind. Pure; accepts THREE
 * Vector3 ({x,z}) OR [x,y,z]. Derived from the three.js YXZ camera basis (forward (-sin,−cos), right (cos,-sin)).
 */
const cx = (p) => (p == null ? null : (p.x ?? p[0]));
const cz = (p) => (p == null ? null : (p.z ?? p[2]));

export function hitDirection(playerPos, sourcePos, cameraYaw) {
  if (!playerPos || !sourcePos) return null;
  const dx = cx(sourcePos) - cx(playerPos);
  const dz = cz(sourcePos) - cz(playerPos);
  if (dx === 0 && dz === 0) return 0;
  const s = Math.sin(cameraYaw || 0), c = Math.cos(cameraYaw || 0);
  const forward = -dx * s - dz * c; // d . forward(-sin,-cos)
  const right = dx * c - dz * s;     // d . right(cos,-sin)
  return Math.atan2(right, forward);
}
```
Run the test → PASS.

- [ ] **Step 3:** wire the store (`useGameStore.jsx`). Add the field near `damageFlash` (`:637`): `lastHitDir: null,`. In `damagePlayer` (`:652`) change the signature to `(amount, source = 'unknown', sourcePos = null)` and, inside the `set({...})` that fires on a real hit (`:675`), also compute + set the direction:
```js
import { hitDirection } from '../game/damageDirection';   // top of file
// ... inside damagePlayer, right before the set({ lastDamageTime... }):
const dir = sourcePos ? hitDirection(state.playerPosition, sourcePos, state.gameCamera?.rotation?.y) : null;
// add to the set: lastHitDir: dir != null ? { angle: dir, t: now } : state.lastHitDir,
```
(Non-breaking: every existing `damagePlayer(a, b)` call still works; `lastHitDir` only updates when a sourcePos is passed.)

- [ ] **Step 4:** thread the easy call-site — `SimplifiedNPCSystem.jsx:278` `store.damagePlayer(attack.damage, attack.type)` → `store.damagePlayer(attack.damage, attack.type, attack.position)` (`attack.position` is already used for `playSpatialSound('attack', attack.position, ...)` two lines up). The projectile (`:609`) + boss (`BossEntity`) call-sites are threaded in T2.

### Task 2 (verify T1 + close-out)

- [ ] **Step 1: battery** (from `frontend/`): `npx vitest run` (GROWS by the damageDirection tests; 0 fail) · `npm run build` clean · `npx vitest run --config vitest.visual.config.js` → **18/18 byte-identical** (no HUD yet; capture never damages → lastHitDir stays null) · arrow-grep the 2 new files.
- [ ] **Step 2: commit + close-out** — `feat(combat): damage-direction math + non-breaking damagePlayer sourcePos plumbing (T1)` + ACTIVE_PLAN (T1 done; T2 = the HUD `<DamageDirection>` cue + capture fixture + thread projectile/boss). Plan stays OPEN (T2 pending).

### T2 (next cut — documented; needs the capture env for the visual eyeball)
A HUD `<DamageDirection>` (mounted in the HUD, capture-null unless an opt-in `showHitDir` capture fixture): reads `lastHitDir`, renders a red edge-arc/chevron at screen angle `lastHitDir.angle`, opacity fading from `t` over ~800ms (transient read via `useFrame`/rAF or a short-lived state — Game-Loop-Isolation: don't subscribe per-frame to the store; sample `getState().lastHitDir`). Add a `damage-dir` capture fixture (force a `lastHitDir`) → HD self-eyeball + KEVIN-REVIEW before/after. Thread the remaining `damagePlayer` call-sites (projectile `:609`, BossEntity) with their source positions.

## Self-Review
**Spec coverage:** §6 game-feel "damage direction cues" ✓. **Placeholder scan:** the math + the store diff + the call-site are concrete. **Type consistency:** `hitDirection` accepts both Vector3 and array (the store's `playerPosition` is `{x,y,z}`; `attack.position` is a Vector3) — handled by the `cx/cz` accessors. **Non-breaking:** `sourcePos` defaults null → all existing `damagePlayer` calls compile + behave identically; `lastHitDir` only set when supplied. **Capture-safety:** no HUD in T1; capture never damages → 18/18 holds.
