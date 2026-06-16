# M2 — Combat Readability + Impact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make combat *read* — every hit shows WHERE it came from, every enemy attack telegraphs BEFORE it lands, and every death/victory has weight.

**Architecture:** Three independent themes, each shippable on its own. (1) **Directional impact** — feed the already-computed `entity.hitDirection` into the flinch lean, spark cone, and camera-shake bias (today all radial/ignored). (2) **Attack telegraphs** — a windup→strike→recover phase on enemy + boss attacks (anticipation pose + emissive charge ramp + boss ground-ring). (3) **Death/victory beats** — defer `ecs.remove` behind a dissolve, rebuild the Death/Victory overlays on theme tokens. Pure math (tilt/cone/bias/timing) is TDD'd in `src/game/*.js`; the render/store wiring is source-gated.

**Tech Stack:** R3F 9.5, Three 0.172, zustand 5, miniplex (mob ECS), vitest. JS/JSX.

**Locks honored:** bold-flat (NearestFilter, locked palette, no PBR), BLOOM>=0.85, NEUTRAL tonemap, Ember+Blight, ALL-SYNTH audio. Telegraph emissive ramps ride the existing toon material + bloom; no new material model. FEEL/timing/difficulty → KEVIN-REVIEW #50.

**Capture-determinism:** all M2 effects fire on COMBAT events (mob hit, enemy attack, death) which never occur during `npm run visual:capture` → no baseline drift. Any pure helper added is RNG-free. If a baseline frame moves, determinism leaked → FIX before commit.

---

## Theme 1 — Directional impact (#9) — warm-up, 3 slices

**Grounded live facts (Phase-B verified 2026-06-16):**
- `entity.hitDirection` IS computed (`SimplifiedNPCSystem.jsx:506`, a `THREE.Vector3` of the away-from-player unit dir from `hitKnockback`) but has **zero consumers**.
- The mob flinch tilt is **id-parity** (`MobModel.jsx:142`: `(entity.id % 2 === 0 ? 1 : -1) * 0.08 * wave`), NOT directional. `modelRef` is a child of `groupRef` which is rotated by `entity.rotation` about Y → the flinch is in the mob's **local** frame, so the world hit-dir must be rotated by `-facingY`.
- Sparks (`GPUSparkSystem.jsx` `triggerSparkBurst(pos, colorHex, count, type)`) are **radially symmetric** per-type velocity profiles — no direction input.
- Camera shake: `shakeOffset(trauma, seed, dirX, dirZ, intensity)` already supports a directional bias, but the M1 wiring passes `dirX=0, dirZ=0` (`Components.jsx:1165`). `triggerCameraShake(intensity)` (store) has no dir param.
- In `damageMob`, `hitDir` is computed (502-506) AFTER the camera-shake (476) + spark (488) sites → slices B/C move that computation up.

### Task 1 (Commit A): directional flinch lean

**Files:**
- Modify: `frontend/src/game/mobHitFx.js` (add `flinchTilt`)
- Test: `frontend/src/game/mobHitFx.test.js` (append a `flinchTilt` describe)
- Modify: `frontend/src/render/MobModel.jsx:141-142` (replace id-parity with directional)

- [ ] **Step 1: Write the failing test** — append to `mobHitFx.test.js`, import `flinchTilt`:

```js
describe('flinchTilt (the directional reel)', () => {
  it('zero hit direction -> no tilt', () => {
    expect(flinchTilt(0, 0, 0, 1)).toEqual({ pitch: 0, roll: 0 });
  });
  it('facing 0: a hit along world +Z pitches, no roll', () => {
    const t = flinchTilt(0, 1, 0, 1);
    expect(t.pitch).toBeCloseTo(0.22); expect(t.roll).toBeCloseTo(0);
  });
  it('facing 0: a hit along world +X rolls, no pitch', () => {
    const t = flinchTilt(1, 0, 0, 1);
    expect(t.pitch).toBeCloseTo(0); expect(t.roll).toBeCloseTo(-0.22);
  });
  it('scales with the wave envelope', () => {
    expect(flinchTilt(0, 1, 0, 0.5).pitch).toBeCloseTo(0.11);
  });
  it('is facing-relative: a side hit while turned 90deg rolls, not pitches', () => {
    const t = flinchTilt(0, 1, Math.PI / 2, 1); // world +Z hit, facing +90deg = local side
    expect(t.pitch).toBeCloseTo(0); expect(Math.abs(t.roll)).toBeCloseTo(0.22);
  });
});
```

- [ ] **Step 2: Run red** — `cd frontend && npx vitest run src/game/mobHitFx.test.js` → FAIL (`flinchTilt is not a function`).

- [ ] **Step 3: Implement** — add to `mobHitFx.js`:

```js
/**
 * Directional flinch tilt for a hit. The mob model is a child of a group rotated by `facingY`
 * about Y, so the WORLD away-from-player hit dir (hitDirX, hitDirZ) is rotated into the model's
 * LOCAL frame, then the model tips its top along that push: pitch (rotation.x) along local Z,
 * roll (rotation.z) along local X, scaled by the `wave` flinch envelope. Replaces the old
 * arbitrary id-parity roll. Pure + RNG-free.
 * @returns {{pitch:number, roll:number}}
 */
export function flinchTilt(hitDirX, hitDirZ, facingY, wave, tilt = 0.22) {
  const c = Math.cos(facingY), s = Math.sin(facingY);
  const localX = hitDirX * c - hitDirZ * s;
  const localZ = hitDirX * s + hitDirZ * c;
  return { pitch: localZ * tilt * wave, roll: -localX * tilt * wave };
}
```

- [ ] **Step 4: Run green** — same command → PASS.

- [ ] **Step 5: Wire MobModel** — `import { flinchTilt } from '../game/mobHitFx';` (top), replace 141-142:

```js
        // Tilt the model in the direction it was hit (from entity.hitDirection, away-from-player),
        // converted into the model's facing-local frame. Falls back to a flat back-lean if no dir.
        const hd = entity.hitDirection;
        if (hd) {
          const tl = flinchTilt(hd.x, hd.z, entity.rotation || 0, wave);
          modelRef.current.rotation.x = tl.pitch;
          modelRef.current.rotation.z = tl.roll;
        } else {
          modelRef.current.rotation.x = -0.2 * wave;
          modelRef.current.rotation.z = 0;
        }
```

- [ ] **Step 6: Verify + commit** — `npx vitest run` (grows) · `npm run build` · `npx eslint src/game/mobHitFx.js src/render/MobModel.jsx` · `npm run visual:capture` THEN gate 20/20 · LIVE-PROBE LOOK. Commit `-F` (no AI footer, no `git add -A`).

### Task 2 (Commit B): directional spark cone

**Files:**
- Modify: `frontend/src/game/mobHitFx.js` (add `biasAlong`)
- Test: `frontend/src/game/mobHitFx.test.js` (append `biasAlong` describe)
- Modify: `frontend/src/world/GPUSparkSystem.jsx` (optional `dir` param → bias horizontal velocity)
- Modify: `frontend/src/SimplifiedNPCSystem.jsx` (move `hitDir` computation above the spark site; pass it)

- [ ] **Step 1: Failing test** for `biasAlong`:

```js
describe('biasAlong (spark velocity cone)', () => {
  it('no direction -> velocity unchanged', () => {
    expect(biasAlong(3, 4, 0, 0, 0.6)).toEqual({ vx: 3, vz: 4 });
  });
  it('strength 1 aligns the full horizontal speed along the dir', () => {
    const r = biasAlong(3, 4, 1, 0, 1); // speed 5
    expect(r.vx).toBeCloseTo(5); expect(r.vz).toBeCloseTo(0);
  });
  it('strength 0 leaves it radial', () => {
    expect(biasAlong(3, 4, 1, 0, 0)).toEqual({ vx: 3, vz: 4 });
  });
});
```

- [ ] **Step 2: Run red.**
- [ ] **Step 3: Implement** in `mobHitFx.js`:

```js
/**
 * Bias a horizontal spark velocity (vx,vz) toward a unit hit direction (dirX,dirZ) by `strength`
 * in [0,1], preserving horizontal speed. strength 0 = radial (unchanged); 1 = fully along the dir.
 * Used to spray hit sparks in a cone AWAY from the player along the real hit vector. Pure.
 * @returns {{vx:number, vz:number}}
 */
export function biasAlong(vx, vz, dirX, dirZ, strength = 0.6) {
  const dl = Math.hypot(dirX, dirZ);
  if (dl === 0) return { vx, vz };
  const ux = dirX / dl, uz = dirZ / dl;
  const speed = Math.hypot(vx, vz);
  return { vx: vx * (1 - strength) + ux * speed * strength, vz: vz * (1 - strength) + uz * speed * strength };
}
```

- [ ] **Step 4: Run green.**
- [ ] **Step 5: Wire GPUSparkSystem** — extend the signature to `(pos, colorHex, count = 25, type = 'physical', dir = null)`; after the per-type vx/vy/vz profile and BEFORE writing `velAttr`, apply when `dir`:

```js
        if (dir) {
          const b = biasAlong(vx, vz, dir.x ?? dir[0] ?? 0, dir.z ?? dir[2] ?? 0, 0.55);
          vx = b.vx; vz = b.vz; // vy (upward arc) untouched
        }
```

  Import `biasAlong` from `../game/mobHitFx`. (Capture-safe: `dir` only passed from combat; placement sparks at `Terrain.jsx:868` pass none → unchanged radial.)

- [ ] **Step 6: Wire SNS** — move the `camera`/`hitKnockback`/`entity.hitDirection` block (currently 502-506) to right after `const store = useGameStore.getState();` (468); then pass `hitDir` as the 5th arg of `triggerGPUSparks` at the spark call (origin offset `+0.8`). Keep `entity.health -= damage` and `entity.lastHit` where they are.

- [ ] **Step 7: Verify + commit** (as Task 1 Step 6).

### Task 3 (Commit C): directional camera-shake bias

**Files:**
- Modify: `frontend/src/store/useGameStore.jsx` (add `cameraShakeDir`; extend `triggerCameraShake` to take + preserve a dir through decay)
- Modify: `frontend/src/Components.jsx:1163-1169` (consume `cameraShakeDir` in `shakeOffset`)
- Modify: `frontend/src/SimplifiedNPCSystem.jsx:477` (pass `hitDir` into `triggerCameraShake`)

- [ ] **Step 1** — store: `cameraShakeDir: [0, 0],` and:

```js
    triggerCameraShake: (intensity = 1.0, dirX, dirZ) => set((s) => ({
      cameraShakeIntensity: intensity,
      cameraShakeDir: dirX === undefined ? s.cameraShakeDir : [dirX, dirZ],
    })),
```

  (Decay calls omit dir → dir preserved across the multi-frame falloff.)

- [ ] **Step 2** — Components: `const [dx, dz] = store.cameraShakeDir || [0, 0];` then `const o = shakeOffset(trauma, performance.now() * 0.05, dx, dz, 0.55 * ji);`

- [ ] **Step 3** — SNS:477 (hitDir now in scope from Task 2's move): `store.triggerCameraShake(isCrit ? 1.6 : 1.0, hitDir[0], hitDir[2]);`

- [ ] **Step 4: gate test** — extend `tests/gates/trauma-wired-gates.test.js`: assert Components reads `cameraShakeDir` and passes it into `shakeOffset` (not literal `0, 0`).

- [ ] **Step 5: Verify + commit** (build · eslint · capture+gate 20/20 · LIVE-PROBE LOOK).

---

## Theme 2 — Attack telegraphs (#4) — HIGH, flagship readability gap (own plan doc at build)

Enemy + boss attacks fire instantly off cooldown with TEXT only — no anticipation. **Build-time grounding required** (not yet done): the AI attack emit path (`ai.worker.js` / `SquadAISystem` / `bossSystem.js` fireball/roar/lava). Approach: emit a `windup` event ~350-400ms BEFORE the strike → render an anticipation pose (rear-back/crouch) + element-colored emissive charge ramp on the toon material (BLOOM>=0.85), reserve red for unblockable/heavy; boss gets a ground-ring warning decal where AoE will land. TDD the pure windup→strike→recover state machine (timing/scheduling). Multi-slice → **dedicated plan doc** `docs/superpowers/plans/2026-06-16-crafty-m2-telegraphs.md` authored at build (worker logic → render pose/emissive → boss ring). Consider a multi-search on "2026 action-RPG attack telegraph / anticipation timing" to lock the bar. Timing/difficulty defaults → KEVIN #50.

## Theme 3 — Death/victory beats (#7) — HIGH/L (grounded at build)

Mob+boss death is instant `ecs.remove` + spark (no weight); Death/Victory overlays are off-token raw Tailwind. Approach: defer `ecs.remove` ~250-400ms behind a dissolve/scale-out death state (reuse M1 hitstop for a boss-kill slow-mo + the existing bloom-spike + a victory stinger); rebuild `DeathScreen` + `VictoryOverlay` (`GameSystems.jsx`) on Panel/Button + theme tokens with a run summary (level/nights/kills). TDD the pure dissolve-timing; source-gate the overlays-on-tokens. Capture-safe (death/victory never in capture). Commit per piece.

---

## Self-Review

- **Spec coverage:** Theme 1 maps to audit #9 (3 slices A/B/C); Theme 2 → #4; Theme 3 → #7. All three M2 backlog items covered.
- **Type consistency:** `flinchTilt(hitDirX, hitDirZ, facingY, wave, tilt)→{pitch,roll}`; `biasAlong(vx,vz,dirX,dirZ,strength)→{vx,vz}`; `triggerCameraShake(intensity, dirX?, dirZ?)`; `cameraShakeDir:[x,z]`. Consistent across tasks.
- **Capture-determinism:** every effect is combat-triggered (absent in capture) + every pure helper is RNG-free → no baseline drift expected; a moved frame = leak to fix.
- **Anti-tunneling:** 3 commits (A flinch / B sparks / C camera-shake-dir), each ≤3 systems.
