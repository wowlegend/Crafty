// stance-pursuit-gates.test.js — what the REAL ai.worker.js does to a chasing mob, measured, never the formula.
//
// The combat stance (game/combatStance.js, Tasks 2-4 of docs/superpowers/plans/2026-10-27-crafty-combat-stance.md)
// derives its retreat cap from the chase multiplier. That derivation is only as good as the claim that the
// worker moves a mob at the speed the formula says. So this file drives the real worker (the harness of
// tests/gates/perfect-dodge-gates.test.js: a globalThis.self stub, then the import), with heightGrid null and the
// player still at the origin, and measures how far the mob actually moved.
//
// The expected step values are LITERALS on purpose. Computed from chaseSpeedMult, they would move with a mutant of
// it, and a wrong multiplier could never turn them red; as literals they also prove the worker READS the shared
// function (a worker keeping its own spider multiplier would step the literal under a mutant of it).
//
// WHAT THIS DOES NOT CHECK: terrain. heightGrid is null, so no wall, slope or A* detour enters the step; a mob
// parked by a wall (ai.worker.js clampMove) is the stance's stall rule's business, unit-proven in
// src/game/combatStance.test.js. The calm multiplier: every mob here is aggro'd (src/game/mobMovement.test.js has
// it). RETREAT_FLOOR (tests/gates/stance-roster-gates.test.js has it) and the strafe cap, which nothing here measures
// (src/game/combatStance.test.js has it).
import { describe, it, expect, beforeAll } from 'vitest';
import { buildMobPayload, applyMobUpdate } from '../../src/game/mobStateSync.js';
import { MOB_TYPES } from '../../src/game/mobTypes.js';
import { STANCE_CAPS, MIN_CLOSING_RATE, pursuers } from '../../src/game/combatStance.js';

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

/**
 * `ticks` ticks of the real worker at delta 0.1 (100 ms of world clock each) from (fromX, 50.5, 0). Returns the mean
 * metres/second of RADIAL closing over the ticks in which the mob MOVED (a measured displacement, not the worker's
 * own isMoving flag): the brute's brace ticks stand still and are excluded. 10 ticks from 10 m, so even the spider
 * (6 m in 1 s) is still closing at the last tick and no arrival tick dilutes the mean.
 *
 * It THROWS 'empty denominator' when no tick moved: a mob that never moved has no closing speed, and a NaN mean must
 * not reach an assertion as if it were a measurement.
 */
function closingOver(type, fromX, ticks) {
  const m = mobAt(type, fromX);
  let sum = 0, moved = 0;
  for (let i = 0; i < ticks; i++) {
    const x0 = m.position.x, z0 = m.position.z, d0 = planarDist(m);
    tick(m, 10000 + i * 100);
    if (Math.hypot(m.position.x - x0, m.position.z - z0) > 1e-9) { sum += (d0 - planarDist(m)) / 0.1; moved++; }
  }
  if (moved === 0) throw new Error(`empty denominator: the ${type} never moved in ${ticks} ticks from ${fromX} m`);
  return sum / moved;
}

describe('the stance caps against what the REAL worker does (Task 2)', () => {
  it('every pursuer\'s MEASURED closing speed exceeds the retreat cap by at least MIN_CLOSING_RATE', () => {
    const ps = pursuers();
    expect(ps.length, 'empty denominator').toBe(6);
    for (const t of ps) expect(closingOver(t, 10, 10) - STANCE_CAPS.retreat, t).toBeGreaterThanOrEqual(MIN_CLOSING_RATE - 0.05);
  });
  it('the skeleton exemption holds: inside 8 m it retreats, so it never closes', () => {
    expect(closingOver('skeleton', 5, 10)).toBeLessThan(0);
  });
});
