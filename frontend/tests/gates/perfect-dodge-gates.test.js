import { describe, it, expect, beforeAll } from 'vitest';
import {
  PERFECT_WINDOW_MS, PERFECT_RANGE, STAGGER_MS, RIPOSTE_MULT, perfectDodgeTargets, isStaggered, riposteDamage,
  strikesToApply,
} from '../../src/game/perfectDodge.js';
import { buildMobPayload, applyMobUpdate } from '../../src/game/mobStateSync.js';
import { VERTICAL_REACH } from '../../src/game/mobSenses.js';
import { WINDUP_MS } from '../../src/game/attackTelegraph.js';

/**
 * THE PERFECT DODGE — the parry role, on the dodge verb (spec 2026-09-23-crafty-perfect-dodge-design, plan Task 1).
 *
 * A dodge pressed in the last PERFECT_WINDOW_MS of a nearby mob's windup staggers that mob: its strike never lands,
 * and it takes RIPOSTE_MULT damage while staggered. This file pins the pure core; the worker, the in-flight strike
 * filter, the dodge wiring and the running-game proof are the later tasks' gates.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   P1 plausible-wrong: a strike already due still counts   P2 plausible-wrong: the window's far edge excluded
 *   P3 plausible-wrong: range read on one axis              P4 the vertical reach ignored
 *   P5 only the first qualifying mob                          P6 plausible-wrong: isStaggered inclusive at the end
 *   P7 passive mobs targeted                                  W1 the worker ignores staggerUntil (it strikes)
 *   W2 a staggered mob still advances                         W3 the in-flight filter ignores the stagger
 *   W4 the payload drops staggerUntil (the worker never sees it)
 *
 * BLIND SPOT: nothing here proves a real Shift press reaches the selection (plan Task 4's e2e does).
 */
const NOW = 100000;
const mob = (over = {}) => ({
  id: 'm', health: 20, passive: false, windupUntil: NOW + 120, position: { x: 2, y: 50.5, z: 0 }, ...over,
});
const player = { x: 0, y: 50.5, z: 0 };

describe('the numbers are the design, and they fit the telegraph they answer', () => {
  it('the window is the LATE part of the windup, and generous for web input latency', () => {
    expect(PERFECT_WINDOW_MS).toBe(220);
    expect(PERFECT_WINDOW_MS, 'the window is longer than the windup itself').toBeLessThan(WINDUP_MS);
    expect(PERFECT_RANGE, 'shorter than the widest melee reach (moss_brute 3.2): a brute could hit from outside it')
      .toBeGreaterThanOrEqual(3.2);
    expect([STAGGER_MS, RIPOSTE_MULT]).toEqual([1400, 1.5]);
  });
});

describe('perfectDodgeTargets — which mobs a dodge pressed NOW staggers', () => {
  it('a mob in range whose strike is due inside the window', () => {
    expect(perfectDodgeTargets([mob()], player, NOW).map((m) => m.id)).toEqual(['m']);
  });

  it('the window edges: exactly PERFECT_WINDOW_MS out counts, a hair more does not; a strike already due does not', () => {
    expect(perfectDodgeTargets([mob({ windupUntil: NOW + PERFECT_WINDOW_MS })], player, NOW)).toHaveLength(1);
    expect(perfectDodgeTargets([mob({ windupUntil: NOW + PERFECT_WINDOW_MS + 1 })], player, NOW), 'too early counted').toHaveLength(0);
    expect(perfectDodgeTargets([mob({ windupUntil: NOW })], player, NOW), 'a strike already due counted').toHaveLength(0);
    expect(perfectDodgeTargets([mob({ windupUntil: 0 })], player, NOW), 'a mob not winding up counted').toHaveLength(0);
  });

  it('range: horizontal within PERFECT_RANGE, vertical within the melee reach', () => {
    expect(perfectDodgeTargets([mob({ position: { x: PERFECT_RANGE - 0.01, y: 50.5, z: 0 } })], player, NOW)).toHaveLength(1);
    expect(perfectDodgeTargets([mob({ position: { x: PERFECT_RANGE + 0.01, y: 50.5, z: 0 } })], player, NOW), 'out of range counted').toHaveLength(0);
    expect(perfectDodgeTargets([mob({ position: { x: 1, y: 50.5 + VERTICAL_REACH + 0.1, z: 0 } })], player, NOW), 'a mob far above counted').toHaveLength(0);
    // Horizontal is the planar distance, not x alone.
    expect(perfectDodgeTargets([mob({ position: { x: 2.5, y: 50.5, z: 2.5 } })], player, NOW), 'range read one axis only').toHaveLength(0);
  });

  it('never a passive or a dead mob; every qualifying mob, not only the first', () => {
    expect(perfectDodgeTargets([mob({ passive: true })], player, NOW)).toHaveLength(0);
    expect(perfectDodgeTargets([mob({ health: 0 })], player, NOW)).toHaveLength(0);
    const two = perfectDodgeTargets([mob({ id: 'a' }), mob({ id: 'b', position: { x: -2, y: 50.5, z: 1 } }), mob({ id: 'c', windupUntil: NOW + 300 })], player, NOW);
    expect(two.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('the stagger and the riposte', () => {
  it('isStaggered: strictly before staggerUntil', () => {
    expect(isStaggered({ staggerUntil: NOW + 1 }, NOW)).toBe(true);
    expect(isStaggered({ staggerUntil: NOW }, NOW)).toBe(false);
    expect(isStaggered({}, NOW)).toBe(false);
  });

  it('riposteDamage: x RIPOSTE_MULT while staggered, untouched otherwise', () => {
    expect(riposteDamage(20, { staggerUntil: NOW + 500 }, NOW)).toBe(30);
    expect(riposteDamage(20, { staggerUntil: NOW - 1 }, NOW)).toBe(20);
    expect(riposteDamage(20, {}, NOW)).toBe(20);
  });
});

// ---- Task 2: the REAL worker honours the stagger; a strike already in flight is dropped ----------------------

const posted = [];
let onmessage;
beforeAll(async () => {
  globalThis.self = { postMessage: (m) => posted.push(m), set onmessage(fn) { onmessage = fn; }, get onmessage() { return onmessage; } };
  await import('../../src/workers/ai.worker.js');
});

describe('a staggered mob neither strikes nor advances — through the real ai.worker.js', () => {
  it('beside the player it strikes repeatedly unstaggered (presence), not once while staggered, and again after', () => {
    const z = {
      id: 'z1', passive: false, type: 'zombie', position: { x: 1.2, y: 50.5, z: 0 }, isAggro: true, isMoving: false,
      targetX: 1.2, targetZ: 0, lastAttackTime: 0, windupUntil: 0, damage: 8, moveTimer: 0, speed: 1.2, rotation: 0,
      health: 60, maxHealth: 60,
    };
    const strikesIn = (from, to, staggerUntil) => {
      let n = 0;
      z.staggerUntil = staggerUntil;
      for (let now = from; now < to; now += 100) {
        posted.length = 0;
        onmessage({ data: { type: 'TICK', playerPos: [0, 50.5, 0], now, delta: 0.1, mobs: [buildMobPayload(z, { speed: 1.2, heightGrid: null })], captureSeed: null } });
        const r = posted[posted.length - 1];
        n += r.attacks.filter((a) => a.id === 'z1').length;
        for (const u of r.updates) applyMobUpdate(z, u);
      }
      return n;
    };
    expect(strikesIn(10000, 16000, 0), 'the zombie never struck unstaggered — the scenario is empty').toBeGreaterThan(1);
    z.position.x = 2.2; // step it back a metre: still in reach, with room to advance if the stagger failed to hold it
    expect(strikesIn(16000, 16000 + STAGGER_MS, 16000 + STAGGER_MS), 'a staggered zombie struck').toBe(0);
    expect(z.isMoving, 'a staggered zombie still advances').toBe(false);
    expect(z.position.x, 'a staggered zombie walked in').toBe(2.2);
    expect(strikesIn(16000 + STAGGER_MS, 24000, 16000 + STAGGER_MS), 'it never struck again after the stagger').toBeGreaterThan(0);
  });

  it('a strike computed before the dodge is dropped on arrival; everyone else\'s lands', () => {
    const now = 5000;
    const ents = { a: { staggerUntil: now + 100 }, b: {}, c: { staggerUntil: now - 1 } };
    const out = strikesToApply([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'gone' }], (id) => ents[id], now);
    expect(out.map((s) => s.id)).toEqual(['b', 'c', 'gone']);
  });
});
