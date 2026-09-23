import { describe, it, expect, beforeAll } from 'vitest';
import {
  PERFECT_WINDOW_MS, PERFECT_RANGE, STAGGER_MS, RIPOSTE_MULT, perfectDodgeTargets, isStaggered, riposteDamage,
  strikesToApply, applyPerfectDodge, staggerPose, PERFECT_HITSTOP_MS, holdStagger,
} from '../../src/game/perfectDodge.js';
import { LEAP_RANGE } from '../../src/game/mobSenses.js';
import { VOICES } from '../../src/audio/synthVoices.js';
import { HITSTOP } from '../../src/game/trauma.js';
import { carriersOf, sourceTexts } from './_srcWalk.js';
import { buildMobPayload, applyMobUpdate } from '../../src/game/mobStateSync.js';
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
 *   (Task 3:) D1 applyPerfectDodge leaves the windup running (the pose and the worker's pending strike)
 *   D2 plausible-wrong: the stagger stamped as a duration, not an instant on the clock it was given
 *   D3 plausible-wrong: the sway read off the wall clock, not the world time passed in
 *   D4 the dodge start never refunds (structural)  D5 the riposte applied AFTER the hitstop is sized
 *   (structural order)  D6 MobModel never poses the stagger (structural)
 *
 * BLIND SPOT: the Task 3 wiring checks are structural — whether a real Shift press staggers a real zombie, and
 * whether a hit on it really deals 1.5x through damageMob, is tests/e2e/perfect-dodge.spec.js's job.
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
    // Every windup is aimed at the player and starts only when its attack can reach, so the range is a sanity
    // bound: it must cover the LONGEST wound-up attack — the spider's leap (review #7, R8.6), not only melee.
    expect(PERFECT_RANGE, 'a spider leaping from beyond PERFECT_RANGE could never be perfectly dodged').toBeGreaterThanOrEqual(LEAP_RANGE);
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

  it('range: horizontal and vertical within PERFECT_RANGE — a leap from 5.5 m, or from 5 m above, counts', () => {
    expect(perfectDodgeTargets([mob({ position: { x: 5.5, y: 50.5, z: 0 } })], player, NOW), 'a leap wound up from 5.5 m').toHaveLength(1);
    expect(perfectDodgeTargets([mob({ position: { x: 1, y: 55.5, z: 0 } })], player, NOW), 'a leap from 5 m above').toHaveLength(1);
    expect(perfectDodgeTargets([mob({ position: { x: PERFECT_RANGE - 0.01, y: 50.5, z: 0 } })], player, NOW)).toHaveLength(1);
    expect(perfectDodgeTargets([mob({ position: { x: PERFECT_RANGE + 0.01, y: 50.5, z: 0 } })], player, NOW), 'out of range counted').toHaveLength(0);
    expect(perfectDodgeTargets([mob({ position: { x: 1, y: 50.5 + PERFECT_RANGE + 0.1, z: 0 } })], player, NOW), 'a mob far above counted').toHaveLength(0);
    // Horizontal is the planar distance, not x alone.
    // Planar: (4.6, 4.6) is 6.5 m away, but inside the range on either axis alone.
    expect(perfectDodgeTargets([mob({ position: { x: 4.6, y: 50.5, z: 4.6 } })], player, NOW), 'range read one axis only').toHaveLength(0);
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
  it('the riposte stays a whole number: x1.5 of an odd hit is rounded, not "37.5" on the health bar (R8.2)', () => {
    expect(riposteDamage(25, { staggerUntil: NOW + 500 }, NOW)).toBe(38);
    expect(riposteDamage(27, { staggerUntil: NOW + 500 }, NOW)).toBe(41);
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

// ---- Task 3: the dodge start staggers, the riposte and the pose read it, the feedback exists --------------

describe('applyPerfectDodge — what the dodge start does to the mobs it answers', () => {
  it('stamps the stagger on the WORLD clock it is given and cancels the windup; everyone else untouched', () => {
    const a = mob({ id: 'a' }), far = mob({ id: 'far', position: { x: 9, y: 50.5, z: 0 } });
    const hit = applyPerfectDodge([a, far], player, NOW);
    expect(hit.map((m) => m.id)).toEqual(['a']);
    expect(a.staggerUntil).toBe(NOW + STAGGER_MS);
    expect(a.windupUntil, 'the windup kept running: the pose coils on and the worker still holds the strike').toBe(0);
    expect(far.staggerUntil).toBeUndefined();
    expect(far.windupUntil).toBe(NOW + 120);
    expect(applyPerfectDodge([mob({ windupUntil: NOW + 500 })], player, NOW), 'a press too early staggered').toEqual([]);
  });
  it('the deflection lands with the heavy hitstop, and the parry voice exists in the bank', () => {
    expect(PERFECT_HITSTOP_MS).toBe(HITSTOP.heavy);
    expect(typeof VOICES.parry).toBe('function');
  });
});

describe('staggerPose — reeling, on the world clock', () => {
  it('leans back and sags; the sway is bounded and moves with the time it is GIVEN (a hitstop holds it)', () => {
    const p = staggerPose(1000);
    expect(p.pitch).toBeLessThan(0);
    expect(p.scaleY).toBeLessThan(1);
    expect(staggerPose(1000)).toEqual(p);
    expect(Math.abs(staggerPose(1131).roll - p.roll), 'the sway does not move with world time').toBeGreaterThan(0.1);
    for (let t = 0; t < 2000; t += 37) expect(Math.abs(staggerPose(t).roll)).toBeLessThanOrEqual(0.25);
  });
});

describe('the wiring (weak, structural — the e2e drives these through a real Shift press)', () => {
  it('the dodge start calls applyPerfectDodge on the live mobs at world time, and refunds the cooldown', () => {
    expect(carriersOf(/applyPerfectDodge\(mobsQuery\.entities, currentTrans, worldNow\(\)\)/)).toEqual(['Components.jsx']);
    expect(carriersOf(/dodge\.lastDodgeTime = nowTime - dodge\.cooldown;/)).toEqual(['Components.jsx']);
    expect(carriersOf(/GameMethods\.spawnPerfectText = /)).toEqual(['SimplifiedNPCSystem.jsx']);
  });
  it('damageMob applies the riposte BEFORE the hitstop is sized from the damage', () => {
    const src = sourceTexts().find((x) => x.file === 'systems/CombatSystem.jsx').code;
    const ri = src.indexOf('if (isPlayerSource(source)) damage = riposteDamage(damage, entity, worldNow());');
    const hs = src.indexOf('triggerHitstop(hitstopForHit(damage');
    expect(ri, 'no riposte in damageMob').toBeGreaterThan(0);
    expect(hs, 'the hitstop line moved — re-anchor this check').toBeGreaterThan(0);
    expect(ri, 'the riposte runs after the hitstop is sized').toBeLessThan(hs);
  });
  it('MobModel poses a staggered mob', () => {
    expect(carriersOf(/isStaggered\(entity, wnow\)\) \{\s*[^}]*staggerPose\(wnow\)/)).toEqual(['render/MobModel.jsx']);
  });
});

// ---- review #7 (QUEUE R8) --------------------------------------------------------------------------------

describe('a reply computed BEFORE the dodge cannot bring the cancelled windup back (R8.1) — through the real worker', () => {
  it('the in-flight reply re-writes windupUntil; holdStagger clears it, and a staggered mob is not a target again', () => {
    const z = {
      id: 'z8', passive: false, type: 'zombie', position: { x: 1.2, y: 50.5, z: 0 }, isAggro: true, isMoving: false,
      targetX: 1.2, targetZ: 0, lastAttackTime: 0, windupUntil: 0, damage: 8, moveTimer: 0, speed: 1.2, rotation: 0,
      health: 60, maxHealth: 60,
    };
    const tick = (payload, now) => {
      posted.length = 0;
      onmessage({ data: { type: 'TICK', playerPos: [0, 50.5, 0], now, delta: 0.1, mobs: [payload], captureSeed: null } });
      return posted[posted.length - 1].updates.find((u) => u.id === 'z8');
    };
    let now = 30000;
    for (let i = 0; i < 40 && !(z.windupUntil > now); i++) { now += 100; applyMobUpdate(z, tick(buildMobPayload(z, { speed: 1.2, heightGrid: null }), now)); }
    expect(z.windupUntil, 'the zombie never wound up — the scenario is empty').toBeGreaterThan(now);
    const inFlight = buildMobPayload(z, { speed: 1.2, heightGrid: null }); // sent before the press
    const pressAt = z.windupUntil - 100;
    expect(applyPerfectDodge([z], player, pressAt)).toHaveLength(1);
    applyMobUpdate(z, tick(inFlight, pressAt)); // its reply lands after the press
    expect(z.windupUntil, 'control: the in-flight reply did not restore the windup — the scenario proves nothing').toBeGreaterThan(pressAt);
    holdStagger(z, pressAt);
    expect(z.windupUntil, 'the staggered mob kept a live windup (the charge glow, and a target again)').toBe(0);
    z.windupUntil = pressAt + 50;
    expect(perfectDodgeTargets([z], player, pressAt), 'an already-staggered mob was perfect-dodged again').toEqual([]);
  });
  it('AIWorkerSystem holds the stagger on every reply; MobModel never shows the charge on a staggered mob (weak, structural)', () => {
    expect(carriersOf(/applyMobUpdate\(entity, update\);\s*holdStagger\(entity, worldNow\(\)\);/)).toEqual(['systems/AIWorkerSystem.jsx']);
    expect(carriersOf(/const charging = !isHit && !isStaggered\(entity, wnow\)/)).toEqual(['render/MobModel.jsx']);
  });
  it('the riposte is the PLAYER\'s: an ally, a zone or a hazard hitting a staggered mob gets no x1.5 (R8.5, structural)', () => {
    expect(carriersOf(/if \(isPlayerSource\(source\)\) damage = riposteDamage\(damage, entity, worldNow\(\)\);/)).toEqual(['systems/CombatSystem.jsx']);
  });
});
