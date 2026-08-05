import { describe, it, expect, beforeAll } from 'vitest';

// A-bis B4 — the mob brain reasoned on the XZ plane only, so a zombie 200 blocks below you and one block
// away horizontally was inside MELEE_RANGE and swung. Pillaring up, walling in and going underground gave
// ZERO protection, which makes building strategically pointless in a game whose whole loop is
// build-by-day / survive-the-night — the 18-domain review's worst-damage-to-core-fantasy finding.
//
// THIS GATE RUNS THE WORKER. The first version asserted the fix by regexing ai.worker.js for `canReach(`,
// and scripts/ci/gate-shape.mjs rejected it on the spot: "a new gate should EXECUTE the module it guards,
// not regex its text", refusing to let the source-grep population grow. It was right, and executing turns
// out to be easy — the worker is a plain module that assigns `self.onmessage`, so shimming `self` lets the
// real tick run and the real attack list be inspected. That asserts what a PLAYER experiences (did the mob
// hit me?) rather than what the source happens to say.
const posted = [];
let onmessage;

beforeAll(async () => {
  globalThis.self = { postMessage: (m) => posted.push(m), set onmessage(fn) { onmessage = fn; }, get onmessage() { return onmessage; } };
  await import('../../src/workers/ai.worker.js');
});

// The worker's own constants (ai.worker.js): AGGRO_RANGE 20, MELEE_RANGE 2.5, ATTACK_COOLDOWN 1500.
const NOW = 10_000_000;
const mob = (over = {}) => ({
  id: 'm1', passive: false, x: 0, y: 0, z: 0, targetX: 0, targetZ: 0, isMoving: false, isAggro: true,
  lastAttackTime: 0, windupUntil: 0, damage: 5, type: 'zombie', moveTimer: 0, speed: 1, rotation: 0,
  health: 100, maxHealth: 100, heightGrid: null, ...over,
});

/** Run one tick with the player at `playerPos`, then a second so a windup can resolve into a strike. */
function tick(playerPos, mobOver = {}) {
  posted.length = 0;
  let m = mob(mobOver);
  onmessage({ data: { type: 'TICK', playerPos, now: NOW, delta: 0.016, mobs: [m] } });
  const first = posted[posted.length - 1];
  // The telegraph defers the blow behind a ~380ms windup, so a single tick can only ever produce a windup.
  // Carry the mob's updated state forward and tick again past the windup to see whether a strike lands.
  const u = first.updates[0];
  m = mob({ ...mobOver, isAggro: u.isAggro, windupUntil: u.windupUntil, lastAttackTime: u.lastAttackTime });
  onmessage({ data: { type: 'TICK', playerPos, now: NOW + 600, delta: 0.016, mobs: [m] } });
  const second = posted[posted.length - 1];
  return {
    aggro: u.isAggro,
    attacks: [...first.attacks, ...second.attacks],
  };
}

describe('B4 — height is real cover, driven through the actual worker', () => {
  it('a zombie 200 blocks BELOW the player, 1 block away horizontally, lands NO attack', () => {
    // The literal reported symptom. Under the old XZ-only distance this produced a melee strike.
    expect(tick([1, 200, 0]).attacks).toEqual([]);
  });

  it('...and does not even aggro', () => {
    expect(tick([1, 200, 0]).aggro).toBe(false);
  });

  it('a player who pillars up 10 blocks takes no hit', () => {
    expect(tick([0, 10, 0]).attacks).toEqual([]);
  });

  it('a player behind a 3-block wall takes no hit', () => {
    expect(tick([1.5, 3, 0]).attacks).toEqual([]);
  });

  it('a zombie deep underground does not aggro a surface player', () => {
    expect(tick([0, 40, 0], { y: 0 }).aggro).toBe(false);
  });
});

describe('B4 — the night is still dangerous (the counter-case)', () => {
  // Without these, "fix the mobs so they never reach you" would pass every assertion above and destroy the
  // game. Each one fails if the sense radius or the reach collapses.
  it('a zombie on level ground DOES land a melee attack', () => {
    const r = tick([1.5, 0, 0]);
    expect(r.aggro).toBe(true);
    expect(r.attacks.length).toBeGreaterThan(0);
    expect(r.attacks[0].type).toBe('melee');
  });

  it('a zombie still reaches a player standing on a 2-block step', () => {
    expect(tick([1, 2, 0]).attacks.length).toBeGreaterThan(0);
  });

  it('a zombie still AGGROS a player on a high wall even though it cannot hit them', () => {
    // Sensing and reaching are deliberately different questions: it should come for you, not ignore you.
    const r = tick([4, 3, 0]);
    expect(r.aggro).toBe(true);
    expect(r.attacks).toEqual([]);
  });

  it('a zombie out of horizontal range lands nothing, height notwithstanding', () => {
    expect(tick([12, 0, 0]).attacks).toEqual([]);
  });
});
