# SOULBIND M5 — Squad AI + Ally Render Implementation Plan

> **✅ SHIPPED (2026-06-10, loop iter 48):** T1 (the pure brain, 8/8) + T2 (the bridge + ally render + gate). 774 unit (90 files) · build · visual 13/13. The vanish-on-bind gap is closed — bound creatures follow at heel and fight.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note:** design-of-record = `docs/superpowers/specs/2026-06-10-crafty-s2b3-soulbind-design.md` §2/§3 M5.
> **HONESTY NOTE (found at plan time):** a bound ally currently has NO renderer (conversion exits
> `mobsQuery`, whose NPCSystem map was its only render path) — the creature VANISHES on bind. M5's
> render task closes a real visibility gap, not just polish; the M4 KRB cue gets corrected at close-out.

**Goal:** Bound allies are VISIBLE (jade-rimmed, parametric MobModel reuse), FOLLOW the player at a ring, ENGAGE hostiles near the player (attribution-gated damage, no player-feel bleed), and LEASH back when left behind — main-thread only, the worker untouched.

**Architecture:** A pure `game/squadAI.js` brain (TDD: the design §4 edge table = the test list) stepped by a 15Hz-accumulator `SquadAISystem` (the AIWorkerSystem accumulator clone at :820-824: `accum += delta; if (accum < AI_TICK_SEC) return; const tick = Math.min(accum, 0.25); accum = 0;`). Moves apply to `entity.position` with the `store.getMobGroundLevel` snap (the worker-reply precedent); attacks via `GameMethods.damageMob(id, dmg, 'physical', 'ally')` + `victim.isAggro = true` (persists through the worker — draws the siege toward the fight). Render: export `MobModel` (one-line delta at :90) + an `AllySquadRender` mapping `useEntities(alliesQuery)` with a jade `<Outlines>` rim.

**Tech Stack:** alliesQuery (M3); damageMob source param (M1); MobModel damp/snap render (:90-165); AI_TICK_SEC = 1/15 (:72).

---

### Task 1: `game/squadAI.js` — the pure brain (TDD; the edge table IS the test list)

**Files:** Create `frontend/src/game/squadAI.js` + `frontend/src/game/squadAI.test.js`

- [x] **Step 1: failing tests:**
```js
import { describe, it, expect } from 'vitest';
import { stepSquad, FOLLOW_RING, ENGAGE_RADIUS, ATTACK_RANGE, ATTACK_COOLDOWN_SEC, LEASH_DIST, ALLY_DPS_HIT } from './squadAI';

const P = { x: 0, y: 10, z: 0 };
const ally = (over = {}) => ({ id: 1, position: { x: 10, y: 10, z: 0 }, type: 'zombie', lastAllyAttack: 0, ...over });
const hostile = (over = {}) => ({ id: 50, position: { x: 3, y: 10, z: 0 }, health: 50, passive: false, ...over });

describe('S2-B3-M5: the squad brain (pure)', () => {
  it('no hostiles near the player -> FOLLOW: moves toward the ring, never inside it', () => {
    const { moves, attacks } = stepSquad([ally()], [], P, 10, true);
    expect(attacks).toEqual([]);
    expect(moves).toHaveLength(1);
    const m = moves[0];
    const dBefore = Math.hypot(10 - P.x, 0 - P.z);
    const dAfter = Math.hypot(m.x - P.x, m.z - P.z);
    expect(dAfter).toBeLessThan(dBefore);           // approaching
    expect(dAfter).toBeGreaterThanOrEqual(FOLLOW_RING.min - 0.01); // but not crowding the player
  });
  it('inside the ring -> holds (no thrash)', () => {
    const a = ally({ position: { x: FOLLOW_RING.min + 0.5, y: 10, z: 0 } });
    const { moves } = stepSquad([a], [], P, 10, true);
    expect(moves).toEqual([]); // standing in the band = no move order
  });
  it('a hostile within ENGAGE_RADIUS of the PLAYER -> moves to it; in ATTACK_RANGE + off cooldown -> attacks', () => {
    const h = hostile();
    const far = ally({ position: { x: 8, y: 10, z: 0 } });
    const r1 = stepSquad([far], [h], P, 10, true);
    expect(r1.moves[0]).toBeDefined(); // closing on the hostile, not the ring
    const near = ally({ position: { x: h.position.x + 1, y: 10, z: h.position.z }, lastAllyAttack: 0 });
    const r2 = stepSquad([near], [h], P, 10, true);
    expect(r2.attacks).toEqual([{ id: near.id, targetId: h.id }]);
  });
  it('attack cooldown: a fresh hit blocks until ATTACK_COOLDOWN_SEC elapses', () => {
    const h = hostile();
    const a = ally({ position: { x: h.position.x + 1, y: 10, z: h.position.z }, lastAllyAttack: 9.0 });
    expect(stepSquad([a], [h], P, 10, true).attacks).toEqual([]); // 1.0s < 1.5s
    expect(stepSquad([a], [h], P, 10 + ATTACK_COOLDOWN_SEC, true).attacks).toHaveLength(1);
  });
  it('hostiles beyond ENGAGE_RADIUS of the player are IGNORED (the leash keeps squads home)', () => {
    const h = hostile({ position: { x: ENGAGE_RADIUS + 10, y: 10, z: 0 } });
    const { moves, attacks } = stepSquad([ally()], [h], P, 10, true);
    expect(attacks).toEqual([]);
    // follow-ring move only (toward the player, not the far hostile)
    if (moves.length) expect(Math.hypot(moves[0].x - P.x, moves[0].z - P.z)).toBeLessThan(10);
  });
  it('an ally beyond LEASH_DIST -> a teleport order to the ring', () => {
    const lost = ally({ position: { x: LEASH_DIST + 5, y: 10, z: 0 } });
    const { teleports } = stepSquad([lost], [], P, 10, true);
    expect(teleports).toHaveLength(1);
    expect(Math.hypot(teleports[0].x - P.x, teleports[0].z - P.z)).toBeLessThanOrEqual(FOLLOW_RING.max);
  });
  it('player dead -> squad disengages atomically (no moves, no attacks — the §4 edge contract)', () => {
    const h = hostile();
    const a = ally({ position: { x: h.position.x + 1, y: 10, z: h.position.z } });
    const { moves, attacks } = stepSquad([a], [h], P, 10, false);
    expect(moves).toEqual([]);
    expect(attacks).toEqual([]);
  });
  it('dead/invalid hostiles are never targeted', () => {
    const dead = hostile({ health: 0 });
    const a = ally({ position: { x: dead.position.x + 1, y: 10, z: dead.position.z } });
    expect(stepSquad([a], [dead], P, 10, true).attacks).toEqual([]);
  });
});
```
- [x] **Step 2: red** → **Step 3: implement:**
```js
/**
 * squadAI.js — S2-B3-M5: the pure squad brain (the voidhand/soulbind purity discipline).
 * stepSquad(allies, hostiles, playerPos, now, playerAlive) -> { moves, attacks, teleports }.
 * v1 auto-assist (design §2): FOLLOW a 3-5m ring · ENGAGE the nearest hostile within
 * ENGAGE_RADIUS of the PLAYER (the leash anchor — squads never chase the horizon) ·
 * attack at <=ATTACK_RANGE on a per-ally cooldown (entity.lastAllyAttack, written by the
 * bridge) · LEASH-teleport at >LEASH_DIST. The brain ORDERS; the SquadAISystem bridge
 * APPLIES (positions ground-snapped, damage via damageMob(...,'ally'), isAggro set).
 * Player dead -> empty orders (atomic disengage, the §4 edge contract).
 */
export const FOLLOW_RING = { min: 3, max: 5 };
export const ENGAGE_RADIUS = 18;   // hostiles must be near the PLAYER to be squad targets
export const ATTACK_RANGE = 2.2;
export const ATTACK_COOLDOWN_SEC = 1.5;
export const LEASH_DIST = 40;
export const ALLY_DPS_HIT = 12;    // per swing (Kevin-tunable; ~the design's DPS-assist stance)
const STEP = 0.28;                 // per-tick move step at 15Hz ≈ 4.2 u/s — brisk follow

const d2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

export function stepSquad(allies, hostiles, playerPos, now, playerAlive) {
  const moves = [], attacks = [], teleports = [];
  if (!playerAlive) return { moves, attacks, teleports };
  for (const a of allies) {
    if (!a || !a.position) continue;
    const dPlayer = Math.sqrt(d2(a.position.x, a.position.z, playerPos.x, playerPos.z));
    if (dPlayer > LEASH_DIST) {
      // left behind: rejoin at the outer ring edge along the player->ally bearing
      const k = FOLLOW_RING.max / Math.max(dPlayer, 1e-6);
      teleports.push({ id: a.id, x: playerPos.x + (a.position.x - playerPos.x) * k, z: playerPos.z + (a.position.z - playerPos.z) * k });
      continue;
    }
    // nearest live hostile NEAR THE PLAYER
    let target = null, tD2 = Infinity;
    for (const h of hostiles) {
      if (!h || h.passive || h.health <= 0) continue;
      if (d2(h.position.x, h.position.z, playerPos.x, playerPos.z) > ENGAGE_RADIUS * ENGAGE_RADIUS) continue;
      const dd = d2(a.position.x, a.position.z, h.position.x, h.position.z);
      if (dd < tD2) { tD2 = dd; target = h; }
    }
    if (target) {
      const dist = Math.sqrt(tD2);
      if (dist <= ATTACK_RANGE) {
        if (now - (a.lastAllyAttack || 0) >= ATTACK_COOLDOWN_SEC) attacks.push({ id: a.id, targetId: target.id });
      } else {
        const k = STEP / dist;
        moves.push({ id: a.id, x: a.position.x + (target.position.x - a.position.x) * k, z: a.position.z + (target.position.z - a.position.z) * k });
      }
      continue;
    }
    // FOLLOW: outside the band -> step toward the ring; inside -> hold
    if (dPlayer > FOLLOW_RING.max) {
      const k = STEP / dPlayer;
      const nx = a.position.x + (playerPos.x - a.position.x) * k;
      const nz = a.position.z + (playerPos.z - a.position.z) * k;
      // never step INSIDE the inner ring (no player-crowding)
      const nd = Math.sqrt(d2(nx, nz, playerPos.x, playerPos.z));
      if (nd >= FOLLOW_RING.min) moves.push({ id: a.id, x: nx, z: nz });
    }
    // dPlayer < min: backing off is v2 polish; holding is fine (no thrash either way)
  }
  return { moves, attacks, teleports };
}
```
  NOTE the test "moves toward the ring, never inside it" computes a single STEP move — with STEP=0.28 from 10m the after-distance is ~9.7m (≥ min ✓, < before ✓). Keep STEP small enough that one step from just-outside-max can't jump past min (max-min=2 >> 0.28 ✓).
- [x] **Step 4: green** → **commit** `feat(soulbind-m5): the pure squad brain — follow ring, player-anchored engage, leash, cooldowns`

### Task 2: the SquadAISystem bridge + ally render

**Files:** Create `frontend/src/world/SquadAISystem.jsx`; Modify `frontend/src/SimplifiedNPCSystem.jsx` (export MobModel at :90 — `export const MobModel = ...` — and mount the two new pieces inside NPCSystem's return OR mount SquadAISystem beside HurlSystem in Components and render allies from a small AllySquadRender INSIDE SimplifiedNPCSystem where MobModel is in scope [CHEAPEST — zero export-graph churn: an `{allies.map(...)}` block next to the existing `{entities.map(...)}`, jade Outlines rim, using useEntities(alliesQuery)]); extend `frontend/tests/gates/voidhand-noremesh-gates.test.js` GATED list with SquadAISystem.jsx

- [x] **Step 1:** SquadAISystem (mounted beside `<HurlSystem />` in Components):
```jsx
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/useGameStore';
import { GameMethods } from '../GameMethods';
import { ecs, mobsQuery, alliesQuery } from '../ecs/world';
import { isCaptureMode } from '../devtest/captureMode';
import { stepSquad, ALLY_DPS_HIT } from '../game/squadAI';

const AI_TICK_SEC = 1 / 15; // the AIWorkerSystem cadence (SimplifiedNPCSystem :72)

/**
 * SquadAISystem — S2-B3-M5: the 15Hz main-thread bridge for the pure squad brain.
 * The worker is NEVER touched (v1 stance: the player stays the tank). Orders apply
 * transiently: positions ground-snapped (the worker-reply precedent), attacks via
 * damageMob(...,'ally') (no hitstop/shake/XP — the M1 attribution contract) + the
 * victim's isAggro set (persists through the worker; the siege turns toward the fight).
 */
export function SquadAISystem() {
  const accumRef = useRef(0);
  useFrame((state, delta) => {
    if (isCaptureMode()) return;
    accumRef.current += delta;
    if (accumRef.current < AI_TICK_SEC) return;
    accumRef.current = 0;
    if (alliesQuery.entities.length === 0) return;
    const store = useGameStore.getState();
    const p = store.playerPosition;
    if (!p) return;
    const now = state.clock.getElapsedTime();
    const { moves, attacks, teleports } = stepSquad(alliesQuery.entities, mobsQuery.entities, p, now, store.isAlive);
    for (const m of moves.concat(teleports)) {
      const a = alliesQuery.entities.find((e) => e.id === m.id);
      if (!a) continue;
      a.position.x = m.x;
      a.position.z = m.z;
      if (store.getMobGroundLevel) {
        const gy = store.getMobGroundLevel(m.x, m.z);
        if (gy !== null && !Number.isNaN(gy)) a.position.y = gy + 0.5;
      }
    }
    for (const at of attacks) {
      const a = alliesQuery.entities.find((e) => e.id === at.id);
      if (a) a.lastAllyAttack = now;
      if (GameMethods.damageMob) GameMethods.damageMob(at.targetId, ALLY_DPS_HIT, 'physical', 'ally');
      const victim = mobsQuery.entities.find((e) => e.id === at.targetId);
      if (victim) victim.isAggro = true; // the siege notices (persists through the worker)
    }
  });
  return null;
}
```
- [x] **Step 2:** ally RENDER — inside SimplifiedNPCSystem's NPCSystem return, next to the mobs map: `const allies = useEntities(alliesQuery);` + `{allies.entities ? allies.entities.map(...) : allies.map(...)}` (match the existing useEntities usage shape EXACTLY — read :84-88 first) rendering `<MobModel key={'ally-' + entity.id} entity={entity} />` PLUS a jade rim: cheapest correct = reuse MobModel as-is (the entity.color jade lerp from M4 already differentiates) and add the rim at M6's look pass if the judge wants more. Import alliesQuery beside mobsQuery (:8).
- [x] **Step 3:** noremesh GATED list += `'world/SquadAISystem.jsx'`; mount `<SquadAISystem />` beside `<SnareTetherSystem />`.
- [x] **Step 4: full battery + commit** `feat(soulbind-m5): allies walk + fight — the 15Hz bridge applies brain orders; bound creatures RENDER again`

### Task 3: close-out
- [x] Spec §3 M5 row ✅ · this plan ✅ SHIPPED · **fix the M4 KRB cue** ("stands guard" → "follows you at heel and fights hostiles near you") · ACTIVE_PLAN → M6 (FUSE + the hybrid roster + HUD soul bar + THE LOOK JUDGE incl. the parked tether frame).

## Self-review
- Spec coverage: M5 row = "pure brain + 15Hz bridge + AllyModel render + capture-self-null" — T1, T2.1, T2.2, the isCaptureMode return ✓. The §4 player-death edge is a brain test ✓. Ally-hits-set-isAggro (design §2) ✓ T2.1.
- Placeholders: T2.2 carries a read-then-match instruction against a named line (:84-88) — bounded, not TBD. The jade rim explicitly deferred to M6's judge (a decision, not an omission).
- Type consistency: stepSquad's 5-arg signature matches between tests and impl; teleports included in the destructure everywhere ✓; lastAllyAttack written by the bridge, read by the brain ✓.
