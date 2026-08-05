import { describe, it, expect, beforeAll } from 'vitest';
import { DEFAULT_ARCHETYPE } from '../../src/game/mobArchetypes.js';

// STATUS §E3 — ten silhouettes, three behaviour arms. Five hostiles (zombie, skitterling, duskhound,
// moss_brute, emberhusk) shared one beeline-and-bonk brain, so the moss brute LOOKED like a tank and PLAYED
// like a zombie. §D2 put it exactly: the art has out-run the AI.
//
// mobArchetypes.test.js pins the table. This drives the WORKER, because a table nobody reads changes
// nothing — the failure mode would be a beautifully-designed profile that never reaches a decision.
// Executes rather than greps, per the ratchet that rejected a source-grep gate on B4.
const posted = [];
let onmessage;

beforeAll(async () => {
  globalThis.self = { postMessage: (m) => posted.push(m), set onmessage(fn) { onmessage = fn; }, get onmessage() { return onmessage; } };
  await import('../../src/workers/ai.worker.js');
});

const NOW = 30_000_000;
const mob = (over = {}) => ({
  id: 'm1', passive: false, x: 0, y: 0, z: 0, targetX: 0, targetZ: 0, isMoving: false, isAggro: false,
  lastAttackTime: 0, windupUntil: 0, damage: 5, type: 'zombie', moveTimer: 0, speed: 1, rotation: 0,
  health: 100, maxHealth: 100, heightGrid: null, ...over,
});
/** One tick at a given horizontal distance; returns this mob's resulting state + any attacks. */
const at = (distance, over = {}) => {
  posted.length = 0;
  onmessage({ data: { type: 'TICK', playerPos: [distance, 0, 0], now: NOW, delta: 0.016, mobs: [mob(over)] } });
  const out = posted[posted.length - 1];
  return { ...out.updates[0], attacks: out.attacks };
};

describe('E3 — the leash is per-type: who keeps coming, and who gives up', () => {
  const beyondBaselineLeash = DEFAULT_ARCHETYPE.aggroRange * DEFAULT_ARCHETYPE.leashMult + 5; // 35

  it('a zombie DROPS aggro past its leash — the baseline, unchanged', () => {
    expect(at(beyondBaselineLeash, { type: 'zombie', isAggro: true }).isAggro).toBe(false);
  });

  it('a MOSS BRUTE keeps coming at the same distance — it is a siege engine, not a wanderer', () => {
    // The headline behavioural difference: identical input, opposite outcome, purely from the archetype.
    expect(at(beyondBaselineLeash, { type: 'moss_brute', isAggro: true }).isAggro).toBe(true);
  });

  it('a SKITTERLING gives up where a zombie would still chase — a swarm must be escapable', () => {
    const insideBaselineLeash = DEFAULT_ARCHETYPE.aggroRange * DEFAULT_ARCHETYPE.leashMult - 2; // 28
    expect(at(insideBaselineLeash, { type: 'zombie', isAggro: true }).isAggro).toBe(true);
    expect(at(insideBaselineLeash, { type: 'skitterling', isAggro: true }).isAggro).toBe(false);
  });
});

describe('E3 — aggro radius is per-type: who finds you', () => {
  it('a DUSKHOUND notices you at a range where a zombie does not', () => {
    const between = 24; // zombie 20, duskhound 28
    expect(at(between, { type: 'zombie' }).isAggro).toBe(false);
    expect(at(between, { type: 'duskhound' }).isAggro).toBe(true);
  });

  it('but nothing aggros from arbitrarily far — the pack hunter has a limit too', () => {
    expect(at(60, { type: 'duskhound' }).isAggro).toBe(false);
  });
});

describe('E3 — reach is per-type: the big one has long arms', () => {
  const between = 2.9; // zombie 2.5, moss_brute 3.2

  it('a MOSS BRUTE lands a blow at a distance a zombie cannot reach', () => {
    expect(at(between, { type: 'zombie', isAggro: true, windupUntil: NOW - 1 }).attacks).toEqual([]);
    const brute = at(between, { type: 'moss_brute', isAggro: true, windupUntil: NOW - 1 });
    expect(brute.attacks.length).toBeGreaterThan(0);
  });

  it('a SKITTERLING must get closer than a zombie to bite', () => {
    const inside = 2.2; // zombie 2.5, skitterling 1.8
    expect(at(inside, { type: 'zombie', isAggro: true, windupUntil: NOW - 1 }).attacks.length).toBeGreaterThan(0);
    expect(at(inside, { type: 'skitterling', isAggro: true, windupUntil: NOW - 1 }).attacks).toEqual([]);
  });
});

describe('E3 — the undesigned mobs are untouched (the regression guard)', () => {
  // If this file only proved that SOME mobs changed, a careless edit that re-tuned every mob would pass.
  it('a zombie still aggros and strikes exactly at the baseline numbers', () => {
    expect(at(DEFAULT_ARCHETYPE.aggroRange - 0.1, { type: 'zombie' }).isAggro).toBe(true);
    expect(at(DEFAULT_ARCHETYPE.aggroRange + 0.1, { type: 'zombie' }).isAggro).toBe(false);
    expect(at(2.4, { type: 'zombie', isAggro: true, windupUntil: NOW - 1 }).attacks.length).toBeGreaterThan(0);
    expect(at(2.6, { type: 'zombie', isAggro: true, windupUntil: NOW - 1 }).attacks).toEqual([]);
  });

  it('an emberhusk behaves identically to a zombie — deliberately undesigned', () => {
    for (const d of [19.9, 20.1, 2.4, 2.6]) {
      expect(at(d, { type: 'emberhusk' }).isAggro, `emberhusk at ${d}`).toBe(at(d, { type: 'zombie' }).isAggro);
    }
  });
});
