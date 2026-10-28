// stance-pursuit-gates.test.js — what the REAL ai.worker.js does to a chasing mob, measured, never the formula.
//
// The combat stance (game/combatStance.js, Tasks 2-4 of docs/superpowers/plans/2026-10-27-crafty-combat-stance.md)
// derives its retreat cap from the chase multiplier. That derivation is only as good as the claim that the
// worker moves a mob at the speed the formula says. So this file drives the real worker (the harness of
// tests/gates/perfect-dodge-gates.test.js: a globalThis.self stub, then the import), with heightGrid null and the
// player still at the origin, and measures how far the mob actually moved.
//
// The expected step values are LITERALS on purpose. Computed from chaseSpeedMult, they would move with a mutant of
// it, and K1 below could never go RED (the plan's review finding 7).
//
// WHAT THIS DOES NOT CHECK: terrain. heightGrid is null, so no wall, slope or A* detour enters the step; a mob
// parked by a wall (ai.worker.js clampMove) is the stance's stall rule's business, unit-proven in
// src/game/combatStance.test.js.
//
// Mutation-Proof: (scripts/dev/mutate.sh, observed 2026-10-27, subject src/game/mobMovement.js) K1 the aggro
// spider `? 2.0 :` -> `? 1.5 :` in chaseSpeedMult -> RED, the worker stepped the spider 0.45 against the literal
// 0.6, which proves the worker READS the shared function (a worker keeping its own 2.0 would step 0.6 and the
// mutant would survive); K1b the other-aggro `: 1.5;` -> `: 1.25;` -> RED (zombie step 2.0 x 1.25 x 0.1 vs 0.3);
// K0 identity (a comment edit) -> survived. NOT killed here, by design: K1c (the calm multiplier), which only
// src/game/mobMovement.test.js sees, because every mob in this file is aggro'd.
import { describe, it, expect, beforeAll } from 'vitest';
import { buildMobPayload, applyMobUpdate } from '../../src/game/mobStateSync.js';
import { MOB_TYPES } from '../../src/game/mobTypes.js';

const PLAYER = [0, 50.5, 0];
const posted = [];
let onmessage;
beforeAll(async () => {
  globalThis.self = { postMessage: (m) => posted.push(m), set onmessage(fn) { onmessage = fn; }, get onmessage() { return onmessage; } };
  await import('../../src/workers/ai.worker.js');
});

/** A fresh aggro'd mob of `type` at (x, 50.5, 0), at full health, with no state carried. */
function mobAt(type, x) {
  const d = MOB_TYPES[type];
  return {
    id: `${type}-1`, passive: !!d.passive, type, position: { x, y: 50.5, z: 0 }, isAggro: true, isMoving: false,
    targetX: x, targetZ: 0, lastAttackTime: 0, windupUntil: 0, damage: d.damage, moveTimer: 0, speed: d.speed,
    rotation: 0, health: d.health, maxHealth: d.health,
  };
}

/** One TICK of the real worker for one mob; applies the update to it and returns the update. */
function tick(m, now) {
  posted.length = 0;
  onmessage({ data: { type: 'TICK', playerPos: PLAYER, now, delta: 0.1, mobs: [buildMobPayload(m, { speed: m.speed, heightGrid: null })], captureSeed: null } });
  const r = posted[posted.length - 1];
  const u = r.updates.find((x) => x.id === m.id);
  if (!u) throw new Error(`SETUP: the worker returned no update for ${m.id}`);
  applyMobUpdate(m, u);
  return u;
}

const planarDist = (m) => Math.hypot(m.position.x - PLAYER[0], m.position.z - PLAYER[2]);

/** One TICK at delta 0.1 from (x, 50.5, 0): metres moved toward the player. */
function stepOnce(type, x) {
  const m = mobAt(type, x);
  const before = planarDist(m);
  tick(m, 10000);
  return before - planarDist(m);
}

describe('the worker reads the chase multiplier (Task 1)', () => {
  it('the real worker steps an aggro\'d mob by speed x the chase multiplier x delta (the multiplier is READ, not copied)', () => {
    expect(stepOnce('zombie', 10)).toBeCloseTo(0.3, 6); // 2.0 x 1.5 x 0.1
    expect(stepOnce('spider', 10)).toBeCloseTo(0.6, 6); // 3.0 x 2.0 x 0.1
  });
});
