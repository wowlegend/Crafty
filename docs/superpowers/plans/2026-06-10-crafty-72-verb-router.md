# #72 Verb Router Implementation Plan

> **✅ SHIPPED (2026-06-10, loop iters 10-12).** Tasks 1-3 on `main` (`ffec759`, `99e0c35`); Tasks 2+3 landed
> in one iteration (committing the deliberately-red gate alone would have broken main — charter rule wins
> over per-task commits). Deviation-of-record: the "verbatim move" surfaced that `hit.toi` is DEAD on this
> rapier build (`timeOfImpact` is the field) — the old mine/place path was silently NaN-broken; fixed +
> holistic sweep (GameScene:181, Terrain:290; :478 was already defensive). The plan's headless click-smoke
> was replaced by a stronger executor smoke (in-page ESM import of GameMethods → castBuildRay → mine →
> real voxel mined). 699 unit (74 files) · build · visual 13/13.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-10-crafty-72-verb-router-design.md` (the committed self-gate). §5 of the spec is the test list; §6 is the seam surgery this plan executes. Pre-M3 BLOCKER.

**Goal:** One click → exactly ONE verb. Kill the #72 double-fire (melee erodes walls / casts place blocks) with a pure target-priority router, before M3 binds HURL/SLAM onto the same buttons.

**Architecture:** Pure `src/input/verbRouter.js` (no React/Three/Rapier — node-testable) consumed by the ONE active-gated listener in Components.jsx. Terrain.jsx's competing mousedown listener is DELETED; its raycast + mine/place/chest bodies stay in Terrain (worker ownership unmoved) and are exposed via the established `GameMethods` registry (`castBuildRay()` for ctx + `terrainVerbs.{mine,place,open}` executors — ONE raycast per click, reused for routing and execution). A small static gate locks the seam shape.

**Tech Stack:** plain ESM + vitest (router); existing `GameMethods` registry, `checkMobsInMeleeCone` (SimplifiedNPCSystem.jsx:1028, returns mob entities w/ `.position`), `isPointInCone` (src/combat/cone.js:25), Rapier ray (Terrain.jsx:581-592).

**Verified seam facts (2026-06-10 HEAD):** mobs are collider-less (zero RigidBody in SimplifiedNPCSystem) → the 8m Rapier ray passes through them, hence the cone/aim math + the through-mob guard; `GameMethods` is a plain mutable module object (`GameMethods.checkMobsInMeleeCone = fn` precedent at SimplifiedNPCSystem.jsx:1039); Components.jsx is in the voidhand no-re-mesh GATED list → the registry indirection keeps it free of `postMessage`/`update_block` tokens (executors live in Terrain, which is NOT gated — it is the legit build path).

---

## File structure

| File | Responsibility |
|---|---|
| Create `frontend/src/input/verbRouter.js` | The pure routing ladder (design §1) |
| Create `frontend/src/input/verbRouter.test.js` | The §5 14-row edge table as tests |
| Create `frontend/tests/gates/verb-router-gates.test.js` | Static gate: single-listener seam shape + router purity |
| Modify `frontend/src/world/Terrain.jsx:571-699` | handleClick → `castBuildRay` + `terrainVerbs` registry; listener registration DELETED |
| Modify `frontend/src/Components.jsx:424-432` | handleMouseDown builds ctx → routes → dispatches |

---

### Task 1: the pure router (TDD)

**Files:**
- Create: `frontend/src/input/verbRouter.js`
- Test: `frontend/src/input/verbRouter.test.js`

- [ ] **Step 1: Write the failing tests (the spec §5 table, row-for-row)**

```js
import { describe, it, expect } from 'vitest';
import { routeMouseVerb, AIM_CONE_RANGE, AIM_CONE_ARC } from './verbRouter';

// ctx shape: { held, meleeHit, aimedMobDist, terrainDist, chestTargeted }
const base = { held: false, meleeHit: false, aimedMobDist: Infinity, terrainDist: Infinity, chestTargeted: false };

describe('verbRouter (#72 — the spec §5 edge table)', () => {
  // §5-1: mob in melee cone, wall behind -> attack (wall safe)
  it('1: melee-cone mob beats terrain', () => {
    expect(routeMouseVerb(0, { ...base, meleeHit: true, terrainDist: 3 })).toBe('attack');
  });
  // §5-2: THROUGH-MOB GUARD — mob at 6m dead-center (outside melee cone), wall behind at 7m
  it('2: aimed mob nearer than terrain -> attack whiff, NEVER mine', () => {
    expect(routeMouseVerb(0, { ...base, aimedMobDist: 6, terrainDist: 7 })).toBe('attack');
  });
  // §5-3: terrain in reach, no mob aimed -> mine
  it('3: bare terrain -> mine', () => {
    expect(routeMouseVerb(0, { ...base, terrainDist: 5 })).toBe('mine');
  });
  // §5-4: HELD short-circuits everything on b0 (aiming at own wall to hurl into it)
  it('4: held -> attack regardless of targets', () => {
    expect(routeMouseVerb(0, { ...base, held: true, terrainDist: 2, meleeHit: true })).toBe('attack');
  });
  // §5-5: HELD on b2 -> cast (chest ignored — hands full)
  it('5: held -> cast, chest ignored', () => {
    expect(routeMouseVerb(2, { ...base, held: true, chestTargeted: true, terrainDist: 2 })).toBe('cast');
  });
  // §5-6: chest nearest -> interact
  it('6: chest (occlusion-correct) -> interact', () => {
    expect(routeMouseVerb(2, { ...base, chestTargeted: true, terrainDist: 4, aimedMobDist: 9 })).toBe('interact');
  });
  // §5-7: mob nearer than chest -> cast
  it('7: mob in front of chest -> cast', () => {
    expect(routeMouseVerb(2, { ...base, chestTargeted: true, terrainDist: 6, aimedMobDist: 3 })).toBe('cast');
  });
  // §5-8: wall gap aimed, mobs beyond it (occluded -> farther than the wall) -> place (mid-siege repair)
  it('8: occluded mobs lose to the wall -> place', () => {
    expect(routeMouseVerb(2, { ...base, terrainDist: 4, aimedMobDist: 9 })).toBe('place');
  });
  // §5-9: mob IN the gap (nearer than terrain) -> cast
  it('9: mob in the gap -> cast', () => {
    expect(routeMouseVerb(2, { ...base, terrainDist: 6, aimedMobDist: 3 })).toBe('cast');
  });
  // §5-10: sky / nothing
  it('10: nothing targeted -> attack whiff / cast', () => {
    expect(routeMouseVerb(0, base)).toBe('attack');
    expect(routeMouseVerb(2, base)).toBe('cast');
  });
  // §5-11: terrain beyond reach (Infinity by construction of the 8m ray)
  it('11: out-of-reach terrain behaves as nothing', () => {
    expect(routeMouseVerb(0, { ...base })).toBe('attack');
    expect(routeMouseVerb(2, { ...base })).toBe('cast');
  });
  // §5-12: chest with no mob, b0 -> mine (break chest, existing cleanup)
  it('12: b0 on chest -> mine', () => {
    expect(routeMouseVerb(0, { ...base, chestTargeted: true, terrainDist: 4 })).toBe('mine');
  });
  // §5-13: unknown button -> none (b1/middle never routes)
  it('13: middle button -> none', () => {
    expect(routeMouseVerb(1, { ...base, terrainDist: 2 })).toBe('none');
  });
  // §5-14: tie-break — equal distances must NOT mine/place (protect the base when ambiguous)
  it('14: mob/terrain tie goes to combat', () => {
    expect(routeMouseVerb(0, { ...base, aimedMobDist: 5, terrainDist: 5 })).toBe('attack');
    expect(routeMouseVerb(2, { ...base, aimedMobDist: 5, terrainDist: 5 })).toBe('cast');
  });
  it('exports the aim-cone constants for the ctx builder', () => {
    expect(AIM_CONE_RANGE).toBe(24);
    expect(AIM_CONE_ARC).toBeCloseTo(Math.PI / 8, 5);
  });
});
```

- [ ] **Step 2: Run — expect FAIL (module not found)**

Run: `cd /Users/kz/Code/Crafty/frontend && npx vitest run src/input/verbRouter.test.js`

- [ ] **Step 3: Implement**

```js
// verbRouter.js — #72: the mouse VERB ROUTER. One click -> exactly ONE verb. Pure (no
// React/Three/Rapier imports; node-testable). Design-of-record:
// docs/superpowers/specs/2026-06-10-crafty-72-verb-router-design.md — target-priority ladder,
// no lanes, no modes, day/night NEVER routes. The two base-destructive mis-routes (melee->mine,
// cast->place at a live target) are impossible by construction; ties break toward combat.
//
// ctx — built once per click by the single Components listener:
//   held         voidhandHeld (M3's SM re-skins attack/cast to HURL/SLAM downstream — this
//                router is UNCHANGED at M3; held also short-circuits terrain: you AIM at your
//                own wall for the 3x anvil hurl, it must never mine)
//   meleeHit     a mob/boss is in the LIVE melee cone (the same call damage uses ->
//                router-says-attack ≡ swing-lands)
//   aimedMobDist nearest mob/boss in the narrow aim cone (mobs are COLLIDER-LESS — the Rapier
//                ray passes through them, so this pure-math distance is the through-mob guard)
//   terrainDist  toi of the single 8m build ray (Infinity if no hit)
//   chestTargeted the ray hit resolves to a placed chest

export const AIM_CONE_RANGE = 24;          // ~spell range; through-mob guard reach
export const AIM_CONE_ARC = Math.PI / 8;   // narrow crosshair cone (vs the wide PI/2 melee arc)

export function routeMouseVerb(button, ctx) {
  const { held, meleeHit, aimedMobDist, terrainDist, chestTargeted } = ctx;
  if (button === 0) {
    if (held) return 'attack';                       // -> HURL at M3; never mines the anvil wall
    if (meleeHit) return 'attack';
    if (aimedMobDist <= terrainDist) return 'attack'; // through-mob guard; tie -> combat
    if (terrainDist < Infinity) return 'mine';
    return 'attack';                                 // whiff (swing feel preserved)
  }
  if (button === 2) {
    if (held) return 'cast';                          // -> SLAM at M3; hands full, chest ignored
    if (chestTargeted && terrainDist < aimedMobDist) return 'interact';
    if (aimedMobDist <= terrainDist) return 'cast';   // tie -> combat (never place onto a mob)
    if (terrainDist < Infinity) return 'place';
    return 'cast';                                    // ranged projectile needs no surface
  }
  return 'none';
}
```

- [ ] **Step 4: Run — expect PASS (15 tests)**
- [ ] **Step 5: Commit**

```bash
cd /Users/kz/Code/Crafty
git add frontend/src/input/verbRouter.js frontend/src/input/verbRouter.test.js
git commit -m "feat(verb-router): the #72 pure target-priority router (spec §5 table as tests)"
```

---

### Task 2: the static gate FIRST (red), then Terrain executor surgery

**Files:**
- Create: `frontend/tests/gates/verb-router-gates.test.js` (FIRST — red on the live defect)
- Modify: `frontend/src/world/Terrain.jsx` (handleClick block, ~571-699)

- [ ] **Step 1: Write the gate — RED against today's double-listener**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// #72 verb-router seam gates: exactly ONE mousedown verb path. Terrain must never re-grow its
// own mouse listener (the double-fire defect); Components must route through the pure router;
// the router must stay pure (importable by node tests + future touch layer).
describe('verb-router seam gates (#72)', () => {
  it('Terrain.jsx registers NO mousedown listener (the deleted double-fire path)', () => {
    expect(read('world/Terrain.jsx')).not.toMatch(/addEventListener\(\s*['"]mousedown['"]/);
  });
  it('Components.jsx consumes the router', () => {
    expect(read('Components.jsx')).toMatch(/routeMouseVerb/);
  });
  it('verbRouter.js stays pure (no react/three/rapier/store imports)', () => {
    const src = read('input/verbRouter.js');
    expect(src).not.toMatch(/from\s+['"](react|three|@react-three|@dimforge)/);
    expect(src).not.toMatch(/useGameStore|postMessage|update_block/);
  });
});
```

Run: `npx vitest run tests/gates/verb-router-gates.test.js` — Expected: **FAIL** (Terrain still has the listener; Components has no router).

- [ ] **Step 2: Terrain surgery** — inside the same `useEffect` that owns `handleClick` (keeps `camera, rapier, world` + `worker` in closure):
  1. Split `handleClick`'s body into closure functions, preserving every line verbatim:
     - `castBuildRay()` — the ray build + `world.castRayAndGetNormal(..., 8.0, ...)` + hit math (Terrain.jsx:574-632): returns `null` on no-hit, else `{ toi: hit.toi, hitPoint, normal: hit.normal, targetedX, targetedY, targetedZ, targetCoords, chestTargeted: !!(store.chests && store.chests.has(targetCoords)) }` (compute `store` fresh inside).
     - `mine(hit)` — the button-0 DELETE body (Terrain.jsx:642-667): worker `update_block` blockType 0 + `playBlockBreak` + worldBlocks map + chest cleanup, using `hit.targetedX/Y/Z`, `hit.targetCoords`, `hit.hitPoint`.
     - `place(hit)` — the button-2 placement body (Terrain.jsx:668-695): normal-offset target + blockIdMap + worker `update_block` + `playBlockPlace` + worldBlocks + chest-init, using `hit.hitPoint`, `hit.normal`.
     - `open(hit)` — the chest-open interception (Terrain.jsx:628-639): `setActiveChestCoords(hit.targetCoords)` + `setShowChestInterface(true)` + `document.exitPointerLock()`.
  2. Register: `GameMethods.castBuildRay = castBuildRay; GameMethods.terrainVerbs = { mine, place, open };` (import `GameMethods` — Terrain does not import it today; add `import { GameMethods } from '../GameMethods';`). Cleanup in the effect teardown: `delete GameMethods.castBuildRay; delete GameMethods.terrainVerbs;`.
  3. **DELETE** `window.addEventListener('mousedown', handleClick)` + the matching remove + the `if (!document.pointerLockElement) return;` gate (the raw pointer-lock read dies with the listener) + the now-empty `handleClick` shell and its `e.button` branches (the bodies live in the named functions now).

- [ ] **Step 3: Verify** — `npx vitest run tests/gates/verb-router-gates.test.js`: Terrain test now PASSES, Components test still RED (wired in Task 3). `npm run build` clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/tests/gates/verb-router-gates.test.js frontend/src/world/Terrain.jsx
git commit -m "refactor(verb-router): Terrain mousedown listener deleted; ray + mine/place/open become GameMethods executors

Bodies preserved verbatim (worker/rapier/sound ownership unmoved); the raw
document.pointerLockElement gate dies with the listener (long-flagged drift).
Gate verb-router-gates is red on Components until the router is wired."
```

---

### Task 3: Components wiring (ctx build + dispatch)

**Files:**
- Modify: `frontend/src/Components.jsx` (imports ~line 16; `handleMouseDown` ~line 424)

- [ ] **Step 1: Add imports** next to the cone import (Components.jsx:16):

```js
import { routeMouseVerb, AIM_CONE_RANGE, AIM_CONE_ARC } from './input/verbRouter';
```
(`GameMethods`, `isPointInCone`, `THREE`, `useGameStore` are already imported.)

- [ ] **Step 2: Replace `handleMouseDown`** (Read-before-write: `grep -n "handleMouseDown" src/Components.jsx`; current body = active-gate + b0→melee / b2→cast):

```js
    // #72 VERB ROUTER: ONE listener, one click -> exactly ONE verb (design-of-record:
    // docs/superpowers/specs/2026-06-10-crafty-72-verb-router-design.md). ctx is built from
    // the LIVE seams: the same melee cone damage uses (router-attack ≡ swing-lands), a narrow
    // aim cone over the collider-less mobs (the through-mob guard), and Terrain's single 8m
    // build ray via the GameMethods registry (this file stays worker-token-free — gated).
    const handleMouseDown = (e) => {
      if (!getInput().active) return;
      if (e.button !== 0 && e.button !== 2) return;
      const store = useGameStore.getState();

      const lookDir = new THREE.Vector3();
      camera.getWorldDirection(lookDir);
      const aimDir = lookDir.clone();              // true aim (vertical kept) for the aim cone
      lookDir.y = 0; lookDir.normalize();          // the flattened melee-arc dir (damage parity)
      const playerPos = camera.position.clone();
      playerPos.y -= 0.8;

      // meleeHit — the EXACT live-damage test (mobs + boss)
      let meleeHit = false;
      if (GameMethods.checkMobsInMeleeCone) {
        meleeHit = GameMethods.checkMobsInMeleeCone(playerPos, lookDir, 4.5, Math.PI / 2).length > 0;
      }
      if (!meleeHit && store.isBossActive?.() && store.getBossPosition) {
        const bp = store.getBossPosition();
        if (bp) meleeHit = isPointInCone(playerPos, lookDir, { x: bp[0], y: bp[1], z: bp[2] }, 4.5, Math.PI / 2);
      }

      // aimedMobDist — nearest mob/boss in the narrow aim cone (pure math; mobs have no colliders)
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

      const verb = routeMouseVerb(e.button, {
        held: store.voidhandHeld,
        meleeHit,
        aimedMobDist,
        terrainDist: hit ? hit.toi : Infinity,
        chestTargeted: !!(hit && hit.chestTargeted),
      });

      if (verb === 'attack') triggerMeleeAttack();
      else if (verb === 'cast') triggerSpellCast();
      else if (verb === 'mine') GameMethods.terrainVerbs?.mine(hit);
      else if (verb === 'place') GameMethods.terrainVerbs?.place(hit);
      else if (verb === 'interact') GameMethods.terrainVerbs?.open(hit);
    };
```

- [ ] **Step 3: Full verify** — `npx vitest run` (count grows: +15 router +3 gate = ~699; ALL green incl. `voidhand-noremesh-gates` — Components gains no forbidden tokens) · `npm run build` clean · `npm run test:visual` (13/13 — listener path is active-gated; capture never pointer-locks).

- [ ] **Step 4: Live smoke (best-effort puppeteer; else park a KRB playtest cue):** start vite; puppeteer headed-less `page.mouse.click` to acquire pointer lock (a real gesture), then: (a) aim at terrain, left-click → a `worldBlocks` entry flips to 0 (mine works); (b) `setVoidhandHeld(true)` via store, left-click → worldBlocks UNCHANGED (held never mines). If pointer-lock acquisition proves flaky headless, record "manual playtest cue" in KEVIN-REVIEW-BATCH instead — the unit+gate suite carries the correctness load.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/Components.jsx
git commit -m "feat(verb-router): Components routes every click through the pure router

One listener, one verb: melee can no longer erode walls (through-mob guard incl.),
casts no longer place blocks, chest-open is occlusion-correct, HELD short-circuits
for M3's HURL/SLAM. Gate verb-router-gates green; 13/13 visual; suite grows."
```

---

### Task 4: close-out + doc-currency

**Files:**
- Modify: `docs/superpowers/specs/2026-06-10-crafty-72-verb-router-design.md` (status → ✅ BUILT)
- Modify: this plan (banner ✅ SHIPPED) · `memory/ACTIVE_PLAN.md` · `memory/CHANGELOG.md` · `SOTA-INITIATIVE.md` §3 (#72 done; M3 unblocked) · `docs/superpowers/KEVIN-REVIEW-BATCH.md` (playtest cue: "click-feel after #72 — verify mine/place/combat feel unchanged in normal play")

- [ ] **Step 1:** All five doc edits (status lines + the KRB playtest cue + CHANGELOG entry).
- [ ] **Step 2: Commit + push**

```bash
git add docs/superpowers/specs/2026-06-10-crafty-72-verb-router-design.md docs/superpowers/plans/2026-06-10-crafty-72-verb-router.md \
        memory/ACTIVE_PLAN.md memory/CHANGELOG.md SOTA-INITIATIVE.md docs/superpowers/KEVIN-REVIEW-BATCH.md
git commit -m "docs(verb-router): #72 shipped — spec/plan/banner current; M3 unblocked"
git push origin main
```

---

## Self-review (at authoring)

- **Spec coverage:** §5 rows 1-14 → Task 1 tests (rows 11/13 folded as out-of-reach + button-1; row 14 = the explicit tie-break test; row "day vs night identical" is true by construction — the router has no time input, locked by the purity gate) ✓ · §6.1 router ✓ T1 · §6.2 Components ✓ T3 · §6.3 Terrain delete + gate-unification ✓ T2 · §6.4 cues: whiff SFX ships via the existing miss path in `triggerMeleeAttack`; the out-of-reach tick + hint = #71 (recorded) ✓ · §6.5 no-re-mesh footprint ✓ (registry indirection; gate re-verified in T3).
- **Placeholder scan:** clean — full code for router/tests/gate/listener; Terrain surgery references exact line ranges + verbatim-preserve instruction (the bodies are moves, not rewrites; rewriting them here would invite drift against HEAD).
- **Type consistency:** `routeMouseVerb(button, {held, meleeHit, aimedMobDist, terrainDist, chestTargeted})` consistent across T1 tests / T1 impl / T3 call site ✓; `castBuildRay()` return `{toi, hitPoint, normal, targetedX/Y/Z, targetCoords, chestTargeted}` consumed by `mine/place/open(hit)` ✓; tie-break `<=` in impl matches test 14 ✓ (`interact` requires strict `<` so a chest tie also goes to combat) ✓.
