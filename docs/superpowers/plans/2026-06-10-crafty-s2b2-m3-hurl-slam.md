# VOIDHAND M3 — HURL + SLAM Implementation Plan

> **✅ SHIPPED (2026-06-10, loop iters 13-18).** All 5 tasks on `main`. Deviations-of-record: the SM
> edge-contract test was already covered by M1's voidhand tests (no duplicate added); the headless smoke
> found a REAL frame-spike tunneling bug → `stepHurlChunked` substepped integrator (TDD, +3 tests) — NOT
> in the original plan; smoke-harness lesson: hand-injected ECS mobs get positions stomped by the AI
> bridge, so smokes must target REAL spawned mobs (verified: arc-compensated hurl at a live spider @30.3m
> → 60→30 HP). M2 re-gate executed with REAL hurls: E−B = 0.00/0.00ms = PASS. 714 unit · build · visual
> 13/13. FPV-feel sign-off parked to Kevin (KRB), non-blocking.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = spec §3c/§3d/§3e/§4 (`docs/superpowers/specs/2026-06-09-crafty-s2b2-voidhand-design.md`) + the #72 router HELD contract. Executed inline by the loop, ~one task per iteration.

**Goal:** The VOIDHAND verbs go live: while HELD, attack = HURL (ballistic phantom, mob knockback + element damage at impact), cast = SLAM (AoE at the orbit point) — wired through the existing SM + the #72 router with zero router changes.

**Architecture:** Flight is a PURE ballistic stepper (`src/game/hurl.js`, twin of the proven `enemyProjectiles.js` — mobs are collider-less, so impact = proximity math, NOT physics contacts; strictly cheaper than the M2-measured dynamic stand-in). A transient module channel (`hurlChannel.js`, the perfProbe `requestHurl/consumeHurl` pattern) carries launch requests from the Components SM apply-site to a new `HurlSystem.jsx` (transient mesh + impact application via `damageMob` + `entity.knockback`). Element is read AT IMPACT from `activeSpell` (spec: no mid-hold desync). The anvil 3× bonus is M4 — the impact event carries pos+dir so M4 only adds the wall ray.

**Tech Stack:** plain ESM + vitest (stepper/channel); R3F transient meshes (GLI); existing `damageMob(id, dmg, type)` (type IS the spark case, e.g. `'fireball'`), `entity.knockback=[x,y,z]` (consumed at SimplifiedNPCSystem ~:794-798), `mobsQuery.entities` (`.id`/`.position`), `GameMethods.castBuildRay` (#72) for the grab color.

**Loop-decided deltas vs spec wording (recorded, reversal = consts/one-liners):**
- HURL = pure-math kinematic arc (speed 22, mild gravity), NOT a Rapier dynamic body — physics contacts can't hit collider-less mobs anyway; M2's E scenario gets upgraded to drive REAL hurls at close-out (the honest re-gate).
- SLAM AoE centers on the PHANTOM'S current orbit point (timing the orbit = the aim skill), radius 3m.
- "AoE stun" → the knockback nudge is the v1 stun-proxy (no stun primitive exists; building one is not M3 scope — flag at M5 if the feel demands it).
- Grab color (M1 deferred): from `worldBlocks` when the grabbed block is a KNOWN (player-edited) voxel, else the placeholder — pristine-terrain types live in the worker (an async query is M7-look territory, recorded honestly).
- FPV-feel sign-off = Kevin (KRB cue, non-blocking) — the spec's human gate, parked per charter §4.

---

## File structure

| File | Responsibility |
|---|---|
| Create `frontend/src/game/hurl.js` (+ colocated `.test.js`) | Pure: makeHurl / stepHurl / resolveSlam + tuning consts |
| Create `frontend/src/game/hurlChannel.js` (+ `.test.js`) | Transient request channel (GLI-clean; no React/store) |
| Create `frontend/src/world/HurlSystem.jsx` | Flight mesh + impact application (damage/knockback/element) |
| Modify `frontend/src/game/voidhand.js` | + `PHANTOM_BLOCK_COLORS` data export (pure data, gate-safe) |
| Modify `frontend/src/world/PhantomBlockSystem.jsx` | Export the transient `phantomWorldPos` (slam aim point) |
| Modify `frontend/src/Components.jsx` | Held-branch dispatch (verb edges), SM attack/cast feed, hurl/slam apply, grab color |
| Modify `frontend/tests/gates/voidhand-noremesh-gates.test.js` | GATED += hurl.js, hurlChannel.js, HurlSystem.jsx (red-first ENOENT) |
| Modify `frontend/src/devtest/PerfProbeSystem.jsx` + `perfScenarios.js` label | Close-out: scenario E drives REAL hurls (M2 re-gate) |

---

### Task 1: the pure hurl/slam core (TDD)

**Files:** Create `frontend/src/game/hurl.js`, `frontend/src/game/hurl.test.js`

- [ ] **Step 1: failing tests**

```js
import { describe, it, expect } from 'vitest';
import {
  makeHurl, stepHurl, resolveSlam,
  HURL_SPEED, HURL_TTL_SEC, HURL_HIT_RADIUS, HURL_KNOCK, SLAM_RADIUS, SLAM_DAMAGE_MULT, HURL_DAMAGE,
} from './hurl';

const mob = (id, x, y, z) => ({ id, position: { x, y, z } });

describe('hurl core (S2-B2-M3)', () => {
  it('makeHurl launches along dir at HURL_SPEED with a small lift', () => {
    const h = makeHurl({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(h.velocity.x).toBeCloseTo(HURL_SPEED, 5);
    expect(h.velocity.y).toBeGreaterThan(0);
    expect(h.age).toBe(0);
  });

  it('stepHurl advances ballistically (gravity bends the arc)', () => {
    const h = makeHurl({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 });
    const vy0 = h.velocity.y;
    stepHurl(h, 0.1, []);
    expect(h.position.x).toBeCloseTo(HURL_SPEED * 0.1, 3);
    expect(h.velocity.y).toBeLessThan(vy0);
  });

  it('hits the nearest mob inside HURL_HIT_RADIUS and reports pos+dir (the M4 anvil seam)', () => {
    const h = makeHurl({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 });
    const m = mob('a', HURL_SPEED * 0.1 + 0.5, 10, 0); // just past the first step, inside radius
    const r = stepHurl(h, 0.1, [m]);
    expect(r.done).toBe(true);
    expect(r.hit.id).toBe('a');
    expect(r.hit.pos.x).toBeCloseTo(h.position.x, 5);
    const mag = Math.hypot(r.hit.dir.x, r.hit.dir.y, r.hit.dir.z);
    expect(mag).toBeCloseTo(1, 3); // normalized flight dir for knockback + the M4 wall ray
  });

  it('misses mobs outside the radius and expires at TTL', () => {
    const h = makeHurl({ x: 0, y: 10, z: 0 }, { x: 1, y: 0, z: 0 });
    const far = mob('b', 0, 10, 9);
    let r = stepHurl(h, 0.1, [far]);
    expect(r.done).toBe(false);
    r = stepHurl(h, HURL_TTL_SEC, [far]);
    expect(r.done).toBe(true);
    expect(r.hit).toBeNull();
  });

  it('resolveSlam returns radial knock events for mobs inside SLAM_RADIUS only', () => {
    const center = { x: 0, y: 10, z: 0 };
    const events = resolveSlam(center, [mob('in', 1.5, 10, 0), mob('edge', 0, 10, SLAM_RADIUS + 0.1), mob('in2', 0, 10.5, -2)]);
    expect(events.map((e) => e.id).sort()).toEqual(['in', 'in2']);
    const e = events.find((x) => x.id === 'in');
    expect(e.dir.x).toBeCloseTo(1, 3); // radial, horizontal, normalized
    expect(e.dir.y).toBe(0);
  });

  it('resolveSlam at a mob directly under the center still yields a finite dir', () => {
    const events = resolveSlam({ x: 0, y: 10, z: 0 }, [mob('under', 0, 9.5, 0)]);
    expect(events).toHaveLength(1);
    expect(Number.isFinite(events[0].dir.x)).toBe(true);
    expect(Math.hypot(events[0].dir.x, events[0].dir.z)).toBeCloseTo(1, 3);
  });

  it('exports the tuning table', () => {
    expect(HURL_SPEED).toBe(22);
    expect(HURL_HIT_RADIUS).toBeCloseTo(1.4, 5);
    expect(HURL_KNOCK).toBe(12);
    expect(SLAM_RADIUS).toBe(3);
    expect(SLAM_DAMAGE_MULT).toBeCloseTo(1.3, 5);
    expect(HURL_DAMAGE).toBe(30);
  });
});
```

- [ ] **Step 2: run red** — `cd /Users/kz/Code/Crafty/frontend && npx vitest run src/game/hurl.test.js` → module not found.
- [ ] **Step 3: implement**

```js
// hurl.js — S2-B2-M3: the PURE hurl/slam core (twin of enemyProjectiles.js — no React/Three/
// Rapier/store, node-testable, gate-clean). Mobs are COLLIDER-LESS, so impact is proximity math
// over the caller's mob snapshot, never physics contacts. The hit event carries pos + normalized
// flight dir — the seam M4's base-as-anvil wall ray consumes (this module stays wall-agnostic).

export const HURL_SPEED = 22;        // m/s along camera-forward (M2 stand-in ballpark)
export const HURL_LIFT = 2;          // small initial vy lift -> readable arc
export const HURL_GRAVITY = 9;       // mild pull-down (full 30 reads like a brick)
export const HURL_TTL_SEC = 1.5;     // max flight
export const HURL_HIT_RADIUS = 1.4;  // 0.85 cube + mob body
export const HURL_DAMAGE = 30;       // base; element type re-skins via damageMob's spark switch
export const HURL_KNOCK = 12;        // entity.knockback magnitude (leap precedent = 15)
export const SLAM_RADIUS = 3;        // AoE around the phantom's orbit point
export const SLAM_DAMAGE_MULT = 1.3;

export function makeHurl(origin, dir) {
  return {
    position: { x: origin.x, y: origin.y, z: origin.z },
    velocity: { x: dir.x * HURL_SPEED, y: dir.y * HURL_SPEED + HURL_LIFT, z: dir.z * HURL_SPEED },
    age: 0,
  };
}

/** Advance one frame. Returns { done, hit: { id, pos, dir } | null }. Mutates h in place (GLI). */
export function stepHurl(h, dt, mobs) {
  h.velocity.y -= HURL_GRAVITY * dt;
  h.position.x += h.velocity.x * dt;
  h.position.y += h.velocity.y * dt;
  h.position.z += h.velocity.z * dt;
  h.age += dt;

  let nearest = null;
  let nearestD = HURL_HIT_RADIUS;
  for (const m of mobs) {
    const dx = m.position.x - h.position.x;
    const dy = m.position.y - h.position.y;
    const dz = m.position.z - h.position.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < nearestD) { nearestD = d; nearest = m; }
  }
  if (nearest) {
    const vmag = Math.hypot(h.velocity.x, h.velocity.y, h.velocity.z) || 1;
    return {
      done: true,
      hit: {
        id: nearest.id,
        pos: { x: h.position.x, y: h.position.y, z: h.position.z },
        dir: { x: h.velocity.x / vmag, y: h.velocity.y / vmag, z: h.velocity.z / vmag },
      },
    };
  }
  return { done: h.age >= HURL_TTL_SEC, hit: null };
}

/** SLAM: radial horizontal knock events for mobs within radius of the orbit point. */
export function resolveSlam(center, mobs, radius = SLAM_RADIUS) {
  const events = [];
  for (const m of mobs) {
    const dx = m.position.x - center.x;
    const dy = m.position.y - center.y;
    const dz = m.position.z - center.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > radius) continue;
    const hmag = Math.hypot(dx, dz);
    // directly-under fallback: push +x (deterministic, finite)
    const dir = hmag > 1e-6 ? { x: dx / hmag, y: 0, z: dz / hmag } : { x: 1, y: 0, z: 0 };
    events.push({ id: m.id, dir });
  }
  return events;
}
```

- [ ] **Step 4: run green** (7 tests) · **Step 5: commit** `feat(voidhand-m3): pure hurl/slam core (ballistic stepper + slam resolver, TDD)`

---

### Task 2: the transient channel (TDD) + gate extension (red-first)

**Files:** Create `frontend/src/game/hurlChannel.js` + `.test.js`; Modify `frontend/tests/gates/voidhand-noremesh-gates.test.js`

- [ ] **Step 1: extend the GATED list FIRST** (after the devtest probe entries):
```js
    'game/hurl.js',                 // M3 pure flight/impact core
    'game/hurlChannel.js',          // M3 transient verb channel
    'world/HurlSystem.jsx',         // M3 flight mesh + impact application
```
Run the gate → RED (ENOENT on hurlChannel/HurlSystem; hurl.js exists from T1).

- [ ] **Step 2: channel test**

```js
import { describe, it, expect } from 'vitest';
import { requestHurl, consumeHurlRequest, requestSlam, consumeSlamRequest } from './hurlChannel';

describe('hurlChannel (S2-B2-M3)', () => {
  it('hurl request round-trips once and clears', () => {
    requestHurl({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: -1 }, '#A9966E');
    const r = consumeHurlRequest();
    expect(r.origin.x).toBe(1);
    expect(r.dir.z).toBe(-1);
    expect(r.color).toBe('#A9966E');
    expect(consumeHurlRequest()).toBeNull();
  });
  it('slam request round-trips once and clears', () => {
    requestSlam({ x: 5, y: 6, z: 7 }, '#ffffff');
    const r = consumeSlamRequest();
    expect(r.center.y).toBe(6);
    expect(consumeSlamRequest()).toBeNull();
  });
});
```

- [ ] **Step 3: implement**

```js
// hurlChannel.js — S2-B2-M3: the transient verb channel between the Components SM apply-site
// (producer, on a 'hurl'/'slam' SM action) and HurlSystem's useFrame (consumer). Module-level
// single-slot transients — the proven perfProbe requestHurl/consumeHurl pattern (GLI-clean:
// no React, no store, no per-frame allocation beyond the rare request object).

let _hurl = null;
let _slam = null;

export function requestHurl(origin, dir, color) { _hurl = { origin, dir, color }; }
export function consumeHurlRequest() { const r = _hurl; _hurl = null; return r; }
export function requestSlam(center, color) { _slam = { center, color }; }
export function consumeSlamRequest() { const r = _slam; _slam = null; return r; }
```

- [ ] **Step 4:** channel tests green; gate still red only on `world/HurlSystem.jsx`. **Step 5: commit** `feat(voidhand-m3): transient hurl/slam channel + no-re-mesh gate extension (red on HurlSystem)`

---

### Task 3: HurlSystem (flight mesh + impact application) + phantom aim-point export

**Files:** Create `frontend/src/world/HurlSystem.jsx`; Modify `frontend/src/world/PhantomBlockSystem.jsx`, `frontend/src/Components.jsx` (mount only)

- [ ] **Step 1: export the slam aim point from PhantomBlockSystem.** Add at module scope (below the consts):
```js
/** Transient world-position of the orbiting phantom (the SLAM aim point — M3 reads it at the
 *  apply-site). Module-level mutable (GLI; never React state). Stale when !held — consumers
 *  only read it on a 'slam' SM action, which can only fire while HELD. */
export const phantomWorldPos = { x: 0, y: 0, z: 0 };
```
and inside its `useFrame`, after the orbit write (needs a module-scope `const _wp = new THREE.Vector3();` temp):
```js
    groupRef.current.getWorldPosition(_wp);
    phantomWorldPos.x = _wp.x; phantomWorldPos.y = _wp.y; phantomWorldPos.z = _wp.z;
```

- [ ] **Step 2: create `frontend/src/world/HurlSystem.jsx`**

```jsx
import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { GameMethods } from '../GameMethods';
import { mobsQuery } from '../ecs/world';
import { isCaptureMode } from '../devtest/captureMode';
import { consumeHurlRequest, consumeSlamRequest } from '../game/hurlChannel';
import { makeHurl, stepHurl, resolveSlam, HURL_DAMAGE, HURL_KNOCK, SLAM_DAMAGE_MULT } from '../game/hurl';

/**
 * HurlSystem — S2-B2-M3: consumes hurlChannel requests and runs the PURE flight/impact core.
 * Single-flight (one phantom in M1-M3). Impact application: damageMob(id, dmg, activeSpell) —
 * the element is read AT IMPACT (spec §3c: mid-hold spell-switch can't desync; activeSpell IS
 * the spark-type string) — plus the entity.knockback nudge (consumed by the NPC main loop).
 * Render = ONE transient mesh, visible only in flight (Game-Loop-Isolation: setState only on
 * the rare flight start/end membership transitions, never per frame). Capture-safe: requests
 * can't be produced in capture (clicks never route) and the stepper is also hard-gated below.
 * NO voxel/worker seams — gated by voidhand-noremesh-gates.
 */
export function HurlSystem() {
  const flightRef = useRef(null); // { h, color }
  const meshRef = useRef();
  const [inFlight, setInFlight] = useState(false);

  useFrame((_, delta) => {
    if (isCaptureMode()) return;
    const store = useGameStore.getState();

    const slam = consumeSlamRequest();
    if (slam) {
      const element = store.activeSpell; // read at impact
      for (const ev of resolveSlam(slam.center, mobsQuery.entities)) {
        if (GameMethods.damageMob) GameMethods.damageMob(ev.id, Math.round(HURL_DAMAGE * SLAM_DAMAGE_MULT), element);
        const entity = mobsQuery.entities.find((e) => e.id === ev.id);
        if (entity) entity.knockback = [ev.dir.x * HURL_KNOCK, 2, ev.dir.z * HURL_KNOCK];
      }
    }

    const req = consumeHurlRequest();
    if (req && !flightRef.current) {
      flightRef.current = { h: makeHurl(req.origin, req.dir), color: req.color || '#A9966E' };
      setInFlight(true); // membership transition only
    }

    const f = flightRef.current;
    if (!f) return;
    const r = stepHurl(f.h, delta, mobsQuery.entities);
    if (meshRef.current) {
      meshRef.current.position.set(f.h.position.x, f.h.position.y, f.h.position.z);
      meshRef.current.rotation.x += delta * 6;
      meshRef.current.rotation.y += delta * 9;
    }
    if (r.hit) {
      const element = store.activeSpell; // read at impact
      if (GameMethods.damageMob) GameMethods.damageMob(r.hit.id, HURL_DAMAGE, element);
      const entity = mobsQuery.entities.find((e) => e.id === r.hit.id);
      if (entity) entity.knockback = [r.hit.dir.x * HURL_KNOCK, 2, r.hit.dir.z * HURL_KNOCK];
      // M4 anvil seam: r.hit.pos + r.hit.dir are where the wall ray + 3x bonus land.
    }
    if (r.done) {
      flightRef.current = null;
      setInFlight(false); // membership transition only
    }
  });

  if (!inFlight) return null;
  const color = (flightRef.current && flightRef.current.color) || '#A9966E';
  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[0.85, 0.85, 0.85]} />
      <meshStandardMaterial color={color} roughness={0.7} metalness={0.05} />
    </mesh>
  );
}
```

- [ ] **Step 3: mount** in `frontend/src/Components.jsx` next to `<PhantomBlockSystem />` (grep anchor `<PhantomBlockSystem`): add `<HurlSystem />` + the import `import { HurlSystem } from './world/HurlSystem';`.
- [ ] **Step 4:** gate green (all 10 files) · full suite green · build clean. **Step 5: commit** `feat(voidhand-m3): HurlSystem — transient flight mesh + impact application (damage/knockback/element-at-impact)`

---

### Task 4: SM wiring — held verbs dispatch into the SM, grab color, launch params

**Files:** Modify `frontend/src/Components.jsx` (verb-edge ref + dispatch branch + SM ctx feed + apply-site), `frontend/src/game/voidhand.js` (color data export)

- [ ] **Step 1: PHANTOM_BLOCK_COLORS in `src/game/voidhand.js`** (pure data, append after the consts):
```js
/** M3: worker-numeric block type -> phantom tint (M1-deferred "looked-at block" color; only
 *  KNOWN (player-edited) voxels resolve — pristine terrain types live in the worker; M7 decides
 *  whether an async worker query is worth it for the final look). */
export const PHANTOM_BLOCK_COLORS = {
  1: '#6FA34D', // grass
  2: '#8B6A42', // dirt
  3: '#8A8E94', // stone-family
  4: '#D8C98E', // sand/water-family
  6: '#9A7B4F', // wood/chest
  7: '#5F8F4E', // leaves/flowers
};
```

- [ ] **Step 2: verb-edge ref + dispatch branch** in Components. Add next to `voidhandSMRef` (grep anchor `voidhandSMRef`):
```js
  const voidhandVerbRef = useRef({ attack: false, cast: false }); // M3: held-click edges -> SM
```
In the #72 dispatcher, change the attack/cast branches:
```js
      if (verb === 'attack') {
        if (store.voidhandHeld) voidhandVerbRef.current.attack = true; // M3: HELD re-skin -> SM 'hurl'
        else triggerMeleeAttack();
      } else if (verb === 'cast') {
        if (store.voidhandHeld) voidhandVerbRef.current.cast = true;   // M3: HELD re-skin -> SM 'slam'
        else triggerSpellCast();
      }
```

- [ ] **Step 3: feed the SM + apply the actions.** In the VOIDHAND SM block (grep anchor `decideVoidhand(voidhandSMRef.current`): consume the edges + replace the hardcoded `attack: false, cast: false`:
```js
      const vAtk = voidhandVerbRef.current.attack; voidhandVerbRef.current.attack = false;
      const vCast = voidhandVerbRef.current.cast; voidhandVerbRef.current.cast = false;
```
```js
        attack: vAtk,
        cast: vCast,
```
Replace the apply-site (current: `'grab'` sets held+placeholder color; `'hurl'|'slam'|'drop'|'cancel'` all just clear) with:
```js
      if (vaction === 'grab') {
        // M3: tint from the looked-at block when it's a KNOWN voxel (worldBlocks); else placeholder.
        const gHit = GameMethods.castBuildRay ? GameMethods.castBuildRay() : null;
        const known = gHit ? stv.worldBlocks?.get(gHit.targetCoords) : undefined;
        stv.setVoidhandHeld(true);
        stv.setHeldPhantom({ color: PHANTOM_BLOCK_COLORS[known] || '#A9966E' });
      } else if (vaction === 'hurl') {
        // launch along camera-forward from just ahead of the head (the phantom visually snaps to it)
        const hd = new THREE.Vector3();
        camera.getWorldDirection(hd);
        const ho = camera.position.clone().add(hd.clone().multiplyScalar(1.2));
        requestHurl({ x: ho.x, y: ho.y, z: ho.z }, { x: hd.x, y: hd.y, z: hd.z }, stv.heldPhantom && stv.heldPhantom.color);
        stv.setVoidhandHeld(false);
        stv.setHeldPhantom(null);
      } else if (vaction === 'slam') {
        requestSlam({ x: phantomWorldPos.x, y: phantomWorldPos.y, z: phantomWorldPos.z }, stv.heldPhantom && stv.heldPhantom.color);
        stv.setVoidhandHeld(false);
        stv.setHeldPhantom(null);
      } else if (vaction === 'drop' || vaction === 'cancel') {
        stv.setVoidhandHeld(false);
        stv.setHeldPhantom(null);
      }
```
Imports to add: `import { requestHurl, requestSlam } from './game/hurlChannel';` · `import { phantomWorldPos } from './world/PhantomBlockSystem';` · extend the voidhand import with `PHANTOM_BLOCK_COLORS`.

- [ ] **Step 4: SM unit coverage** — extend `src/game/voidhand.test.js` (the SM itself already returns 'hurl'/'slam'; verify the EDGE contract feeding it):
```js
  it('M3: a held attack edge yields hurl, a held cast edge yields slam (single-frame edges)', () => {
    let sm = makeVoidhandState();
    const base = { held: true, grabEdge: false, attack: false, cast: false, active: true, alive: true, now: 1, canGrab: true };
    sm.heldUntil = 10;
    expect(decideVoidhand(sm, { ...base, attack: true }).action).toBe('hurl');
    expect(decideVoidhand(sm, { ...base, cast: true }).action).toBe('slam');
    expect(decideVoidhand(sm, base).action).toBe('none'); // edges cleared -> no repeat fire
  });
```
- [ ] **Step 5: full battery** — `npx vitest run` (count grows) · `npm run build` · `npm run test:visual` (13/13 — HurlSystem self-nulls; nothing fires in capture).
- [ ] **Step 6: headless smoke** — boot via testBridge, `spawnCharacterCloseup` (a deterministic zombie), in-page `import('/src/game/hurlChannel.js')` → `requestHurl` aimed at the zombie → wait ~1s → assert the zombie entity's health dropped + a knockback was set. Fallback if the capture-spawned target proves un-steppable (capture gates the stepper): spawn-free check = requestSlam at a live-spawned siege mob under `?perf=`-style live mode, or park a manual cue in KRB (the pure tests + SM tests carry correctness).
- [ ] **Step 7: commit** `feat(voidhand-m3): HELD attack/cast re-skin to HURL/SLAM through the SM (spec §3d) + looked-at-block grab tint`

---

### Task 5: close-out — the M2 re-gate (REAL hurls), docs, KRB

**Files:** Modify `frontend/src/devtest/PerfProbeSystem.jsx` (E drives the REAL channel), `frontend/src/devtest/perfScenarios.js` (E label), `memory/S2B2-M2-PERF.md` (re-gate addendum), spec/plan banners, `SOTA-INITIATIVE.md`, `memory/ACTIVE_PLAN.md`, `memory/CHANGELOG.md`, `docs/superpowers/KEVIN-REVIEW-BATCH.md`

- [ ] **Step 1:** PerfProbeSystem: replace the 3-body Rapier pool with the REAL path — on `consumeHurl()` (probe channel), call gameplay `requestHurl(camera-forward params)` so scenario E measures the SHIPPED hurl (delete the RigidBody pool; keep the component as the thin probe→gameplay adapter). E label → `'siege + REAL hurl every 3s (M3 re-gate)'`.
- [ ] **Step 2:** run `npm run perf:m2 -- --scenarios=B,C,E` → append the re-gate table to `memory/S2B2-M2-PERF.md` (C−B and E−B vs the same 1.5/3.0 budget; PASS expected — the pure stepper is cheaper than the dynamic stand-in).
- [ ] **Step 3:** doc-currency: spec §12 M3 row + status header (✅ mechanics built; FPV-feel = Kevin, non-blocking) · this plan ✅ SHIPPED · SOTA banner (M3 ✅ → next per spec seq = parallel(M4-M6), pick M4 kinetic+anvil first) · CHANGELOG · KRB cue: **FPV-feel sign-off** (the spec's human gate): grab V → orbit → left-click HURL at a mob / right-click SLAM a cluster — "does the aim feel learnable?" + the slam-at-orbit-point timing-skill decision flagged for taste review.
- [ ] **Step 4:** commit + push.

---

## Self-review (at authoring)

- **Spec coverage:** §3c orbit (already M1) + HURL ✓T1/T3 + SLAM ✓T1/T3 + both-end-HELD ✓T4 apply-site + element-at-impact ✓T3 (damageMob type = activeSpell) + knockback reuse ✓T3 (entity.knockback, consume loop :794) + sparks ✓ (inside damageMob's switch) · §3d intent re-skin ✓T4 (edges through the SM; IDLE behavior untouched — the #72 router already guarantees it) · §3e = M4 by spec §12 (the hit event carries pos+dir as the seam — recorded) · §4 zero-new-menu ✓ (no UI added) · M1 deferreds: attack/cast feed ✓T4, grab color ✓T4 (honest partial — worker voxels unknown) · M2 re-gate ✓T5.
- **Placeholder scan:** clean — full code for hurl.js/channel/HurlSystem/apply-site; grep anchors + exact import lists for the Components edits.
- **Type consistency:** `stepHurl(h, dt, mobs) → {done, hit:{id,pos,dir}}` matches T1 tests and T3 consumption ✓; channel `requestHurl(origin, dir, color)`/`requestSlam(center, color)` consistent T2/T3/T4 ✓; `phantomWorldPos` export name matches T3-step1 and T4-step3 ✓; `PHANTOM_BLOCK_COLORS` keyed by worker-numeric types matching Terrain's `blockIdMap` values ✓.
- **Honest risks:** the slam aim point is stale-by-one-frame (read at the SM apply, written in PhantomBlockSystem's useFrame — same-frame ordering depends on mount order; worst case 16ms of orbit drift ≈ 0.07 rad — imperceptible, accepted). The headless smoke may be capture-gated (fallback recorded). Mob `position` objects are worker-synced — the stepper reads them snapshot-free per frame (same as the live damage paths).
