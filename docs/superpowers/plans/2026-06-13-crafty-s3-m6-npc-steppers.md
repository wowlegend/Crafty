# S3-M6 (NPC de-monolith) — the safe pure-stepper cuts Implementation Plan

> **✅ XP-ORB CUT SHIPPED (loop iter 140, 2026-06-13).** T1 the pure `game/xpOrbStepper.js`
> (`stepXPOrb`, byte-equivalent to the inline physics — gravity/bounce, magnetic pull, collect;
> 5 characterization tests, the orb physics's first-ever coverage) + T2 wired `XPOrbSystem` to it
> (the component keeps the ECS loop + collect side-effects). Gate-free + capture-safe. **1011 unit ·
> build clean · visual 18/18 · NPC 1217 → 1182 LOC.** Commits `85bedbd`/`344b2a8`. **Next S3-M6 cuts
> (queued):** the near-duplicate LOOT stepper → `game/` (characterize, then maybe unify with this);
> then MobModel+HealthBar → `render/` (gate-repoints + the trap-3 anchor); the worker seam LAST.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Begin dissolving the last god-file (`SimplifiedNPCSystem.jsx`, 1217 LOC) with its LOWEST-blast-radius cuts first — the pure physics STEPPERS (XP-orb, then loot) → `game/*.js`, characterization-first. These are gate-free (the orb/loot RENDER leaves were already extracted in S3-M3 → `render/pickupVfx`; the PHYSICS isn't in any no-re-mesh/character-render gated region) and capture-safe (gen-time logic; orbs/loot aren't in the 18 static baselines + the systems freeze under capture).

**Architecture (charter S3 prime directive — extraction-only, NO behavior change):** extract the per-entity physics math into a PURE `game/xpOrbStepper.js` (`stepXPOrb(orb, delta, ctx) → {collected}`, mutating orb.position/velocity/age via plain `.x/.y/.z` arithmetic — works on both a THREE.Vector3 entity AND a plain test object; no THREE/React import). The `XPOrbSystem` component keeps the ECS iteration + the side-effects (grantXP / spawnXPText / playPickup / ecs.remove) gated on the returned `collected` flag. The behavior-lock: the existing 18 visual baselines + 1006 unit + the new characterization tests (the orb physics has ZERO tests today — this cut CREATES that coverage, per charter §2.6).

**Tech Stack:** plain JS pure module + vitest; a surgical `XPOrbSystem` rewrite (byte-equivalent physics).

**Spec of record:** `docs/superpowers/specs/2026-06-11-crafty-s3-demonolith-design.md` (S3-M6+ row: "XPOrb/Loot pure steppers → game/; two near-duplicate steppers, DIFFERENT params — unify only AFTER both are characterized"). This plan does the XP-orb stepper first (T1-T2); the loot stepper + MobModel render are later S3-M6 cuts.

> **Why NOT MobModel/the worker first:** the spec ranks NPC last because it's the most by-path-pinned (8 gates + the Vite worker-URL seam + the trap-3 stale-anchor: two brace-less `if(isCaptureMode())return;` at ~:638/:1044). The pure steppers avoid ALL of that (no gate touches the physics) — so they're the safe entry, honoring "lowest-blast-radius-first."

---

### Task 1: extract the pure `xpOrbStepper.js` (characterization-first)

**Files:** Create `frontend/src/game/xpOrbStepper.js` + `frontend/src/game/xpOrbStepper.test.js`

- [ ] **Step 1: write the characterization test (RED)** — pins the CURRENT physics (SimplifiedNPCSystem:964-1019):
```js
// frontend/src/game/xpOrbStepper.test.js
import { describe, it, expect } from 'vitest';
import { stepXPOrb } from './xpOrbStepper.js';

const orb = (o = {}) => ({ position: { x: 0, y: 10, z: 0 }, velocity: { x: 0, y: 5, z: 0 }, age: 0, ...o });
const ctx = (over = {}) => ({ playerPos: { x: 0, y: 1, z: 0 }, groundYAt: () => null, ...over });

describe('stepXPOrb', () => {
  it('explosion phase (age<0.8): gravity pulls velocity.y down + integrates position', () => {
    const o = orb();
    stepXPOrb(o, 0.1, ctx());
    expect(o.age).toBeCloseTo(0.1, 6);
    expect(o.velocity.y).toBeCloseTo(5 - 12 * 0.1, 6);   // gravity -12*dt
    expect(o.position.y).toBeCloseTo(10 + (5 - 12 * 0.1) * 0.1, 6); // integrate AFTER gravity
  });

  it('explosion phase: bounces off ground (damp + friction) when below groundY+0.1', () => {
    const o = orb({ position: { x: 0, y: 0.0, z: 0 }, velocity: { x: 2, y: -3, z: 2 } });
    stepXPOrb(o, 0.016, ctx({ groundYAt: () => 0 })); // ground at y=0 -> floor y=0.1
    expect(o.position.y).toBeCloseTo(0.1, 6);
    expect(o.velocity.y).toBeGreaterThan(0);             // bounced (sign flipped, damped)
    expect(Math.abs(o.velocity.x)).toBeLessThan(2);      // friction *0.7
  });

  it('pull phase (age>=0.8): magnetic pull toward player when dist<12, not collected yet', () => {
    const o = orb({ position: { x: 5, y: 1, z: 0 }, age: 1.0 });
    const r = stepXPOrb(o, 0.016, ctx({ playerPos: { x: 0, y: 1.5, z: 0 } }));
    expect(o.position.x).toBeLessThan(5);                // pulled toward player (-x)
    expect(r.collected).toBe(false);
  });

  it('pull phase: collects when dist<1.2 (returns collected:true)', () => {
    const o = orb({ position: { x: 0.5, y: 1, z: 0 }, age: 1.0 });
    const r = stepXPOrb(o, 0.016, ctx({ playerPos: { x: 0, y: 1.5, z: 0 } }));
    expect(r.collected).toBe(true);
  });

  it('pull phase: far orb (dist>=12) is NOT pulled or collected (just ground-snapped if groundY)', () => {
    const o = orb({ position: { x: 50, y: 9, z: 0 }, age: 1.0 });
    const r = stepXPOrb(o, 0.016, ctx({ groundYAt: () => 4 }));
    expect(o.position.x).toBe(50);                       // no pull
    expect(o.position.y).toBeCloseTo(4.1, 6);            // snapped to groundY+0.1
    expect(r.collected).toBe(false);
  });
});
```
- [ ] **Step 2: run → RED** (`npx vitest run src/game/xpOrbStepper.test.js`).
- [ ] **Step 3: implement** (byte-equivalent to the inline physics; plain arithmetic, no THREE):
```js
// frontend/src/game/xpOrbStepper.js
/**
 * xpOrbStepper.js -- PURE per-frame XP-orb physics (no THREE/React; node-testable). Extracted
 * byte-equivalent from SimplifiedNPCSystem's XPOrbSystem (the god-file de-monolith, charter S3).
 * Mutates orb.position/velocity/age via .x/.y/.z arithmetic (works on a THREE.Vector3 entity AND a
 * plain test object) and returns {collected} -- the component owns grantXP/spawnXPText/sound/remove.
 * ctx = { playerPos:{x,y,z}, groundYAt:(x,z)=>number|null }.
 */
export function stepXPOrb(orb, delta, ctx) {
  const p = orb.position, v = orb.velocity;
  orb.age += delta;
  if (orb.age < 0.8) {
    // explosion phase: gravity + ground bounce
    v.y -= 12 * delta;
    p.x += v.x * delta; p.y += v.y * delta; p.z += v.z * delta;
    const gy = ctx.groundYAt ? ctx.groundYAt(p.x, p.z) : null;
    if (gy !== null && !Number.isNaN(gy) && p.y < gy + 0.1) {
      p.y = gy + 0.1;
      v.y = -v.y * 0.4;   // bounce damping
      v.x *= 0.7; v.z *= 0.7; // friction
    }
    return { collected: false };
  }
  // magnetic pull phase
  const pp = ctx.playerPos;
  const dx = pp.x - p.x, dy = (pp.y - 0.5) - p.y, dz = pp.z - p.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist < 12) {
    const inv = 1 / (dist || 1e-6);
    const pullSpeed = Math.max(4, 80 / (dist + 0.2));
    p.x += dx * inv * pullSpeed * delta;
    p.y += dy * inv * pullSpeed * delta;
    p.z += dz * inv * pullSpeed * delta;
  } else if (ctx.groundYAt) {
    const gy = ctx.groundYAt(p.x, p.z);
    if (gy !== null && !Number.isNaN(gy)) p.y = gy + 0.1;
  }
  return { collected: dist < 1.2 };
}
```
- [ ] **Step 4: run → GREEN.** Arrow-grep both files (zero-emoji gate: ASCII only).
- [ ] **Step 5: commit** `feat(s3-m6): xpOrbStepper.js — pure XP-orb physics extracted from the NPC god-file (characterization-first)`

---

### Task 2: wire `XPOrbSystem` to the pure stepper (byte-exact)

**Files:** Modify `frontend/src/SimplifiedNPCSystem.jsx` (`XPOrbSystem`, ~:960-1022)

- [ ] **Step 1:** add `import { stepXPOrb } from './game/xpOrbStepper';` (near the other game imports).
- [ ] **Step 2:** replace the inline physics body (the `entity.age += delta; ...` block, :970-1017) with:
```js
      const collected = stepXPOrb(entity, delta, {
        playerPos: camera.position,
        groundYAt: store.getMobGroundLevel,
      }).collected;
      if (collected) {
        if (GameMethods.grantXP) GameMethods.grantXP(entity.amount);
        if (GameMethods.spawnXPText) GameMethods.spawnXPText(entity.amount, entity.position);
        playPickup();
        ecs.remove(entity);
      }
```
  (Keep the `for (const entity of [...xpOrbsQuery.entities])` loop + the `if (!camera) return;` + `store` read. `store.getMobGroundLevel` is passed as `groundYAt` — the stepper guards null/NaN exactly as before.)
- [ ] **Step 3: verify** — `npx vitest run` (count GROWS by the 5 new), `npm run build` clean, `npx vitest run --config vitest.visual.config.js` → **18/18 byte-identical** (orb physics is gen-time + orbs aren't in the static baselines; the system freezes under capture). NPC LOC drops ~45.
- [ ] **Step 4: commit** `refactor(s3-m6): XPOrbSystem uses the pure stepXPOrb (byte-exact; NPC 1217 -> ~1172)` + close-out (CHANGELOG + ACTIVE_PLAN: next S3-M6 cut = the loot stepper, then MobModel render).

## Self-Review
- **Spec coverage:** S3-M6 "XPOrb pure stepper → game/" ✓ (loot stepper + MobModel deferred to later cuts, noted). **Byte-exactness:** the stepper mirrors :964-1019 line-for-line (gravity -12, bounce 0.4/friction 0.7, pull `max(4,80/(dist+0.2))`, collect <1.2, the `playerY-0.5` core-pull, the pre-pull dist used for collection). The one representation change: `new THREE.Vector3(d).normalize()` → plain `d*inv` (same result; inv guards dist=0). **Gate-free:** no NPC gate pins the physics (render leaves already in `render/pickupVfx`); the full battery confirms. **Capture-safe:** logic-only, 18/18 holds. **Characterization-first:** the 5 tests are the orb physics's first-ever coverage.
- **Placeholder scan:** none. **Type consistency:** `stepXPOrb(orb, delta, {playerPos, groundYAt}) → {collected}` used identically in test + component.

## Execution Handoff
Inline. T1 (pure module + characterization) is the safe core; T2 is a tiny byte-equivalent swap. The full battery (incl. visual 18/18) is the behavior-lock — no device/capture-regen needed.
