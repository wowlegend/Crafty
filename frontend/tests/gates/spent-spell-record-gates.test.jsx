// @vitest-environment jsdom
//
// THE SPELL'S END RECORD (readSpentProjectiles) — what it stores, how much, and only in DEV.
//
// tests/e2e/mob-floor.spec.js judges a fireball cast under a roof by where the spell itself says it ENDED, because
// on CI one rendered frame can hold a whole flight and no per-frame sample can see it (675cdda8). That makes the
// record the e2e's instrument, and the e2e proves only that the record EXISTS (its E3 mutant). Three mutants of the
// record itself survived the whole suite (review, 2026-10-27): nothing checked WHAT it stores. A record that names
// the wrong cause turns a muzzle burst into a "mob in the way" the spec sets aside; one that stores a position other
// than the END hands the spec the wrong distance; an uncapped one grows for a whole session.
//
// BEHAVIOURAL, not a source grep: this mounts the real EnhancedMagicSystem, casts through the store's real castSpell,
// drives the real frame callback (useFrame is captured, everything else runs), and reads the record through the
// real test-bridge hook. Only the renderers and the sound hook are stubbed. Every expected END comes from a reference
// the record did not produce: the point the ground probe stopped the spell at, the point the mob test resolved the
// hit at, the live positions the spell reported a frame earlier.
//
// WHAT THIS DOES NOT CHECK: that the running game reaches the record (the e2e's presence check, E3, does), and
// where the ground probe's floor comes from (tests/gates/mob-floor-gates does).
//
// Mutation-Proof: 13 mutants of src/EnhancedMagicSystem.jsx through scripts/dev/mutate.sh (one at a time, 8 tests
//   collected each time, every RED confirmed against a green baseline, subject byte-identical to HEAD afterwards);
//   the identity mutant (a comment edit) SURVIVED and all 13 went RED (2026-10-27):
//   R1 the cap dropped (`if (spent.length > 16) spent.shift();` removed) -> RED "keeps the newest 16 ends"
//   R2 the cap off by one (`> 16` -> `> 17`) -> RED, the same test
//   R3 the OLDEST kept instead of the newest (`spent.shift()` -> `spent.pop()`) -> RED, the same test
//   R4 every cause read as 'ground' (`by: spentBy` -> `by: 'ground'`) -> RED age, mob, boss, copies
//   R5 a mob end recorded as 'ground' (`spentBy = 'mob'` -> `'ground'`) -> RED mob
//   R6 a boss end recorded as 'mob' (`spentBy = 'boss'` -> `'mob'`) -> RED boss
//   R7 an age end recorded as 'ground' (`spentBy = 'age'` -> `'ground'`) -> RED age, copies
//   R8 the position axes crossed (x <- position.z, z <- position.x) -> RED ground, age, mob, boss
//   R9 the age dropped (`age: projectile.age` -> `age: 0`) -> RED ground, age
//   R10 the record written in production (`else if (import.meta.env.DEV)` -> `else`) -> RED "writes nothing while DEV is off"
//   R11 the hooks registered in production (`if (!import.meta.env.DEV) return;` removed) -> RED "registers neither hook"
//   R12 the read handing out the live entries (`({ ...s })` -> `s`) -> RED "hands out copies"
//   R13 the record's type pinned (`type: projectile.type` -> `type: 'fireball'`) -> RED mob (an iceball)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as THREE from 'three';

let frameCb = null;
vi.mock('@react-three/fiber', async (orig) => ({
  ...(await orig()),
  useFrame: (cb) => { frameCb = cb; },
}));
vi.mock('../../src/render/spellVfx', () => ({
  EnhancedSpellProjectile: () => null,
  SpellImpactPop: () => null,
  CastTelegraph: () => null,
  ChainArc: () => null,
  MagicWand: () => null,
}));
vi.mock('../../src/SoundManager', () => ({
  useGameSounds: () => ({ playMagicCast() {}, playMagicHit() {}, playMagicExplosion() {} }),
}));

const { EnhancedMagicSystem } = await import('../../src/EnhancedMagicSystem.jsx');
const { useGameStore } = await import('../../src/store/useGameStore.jsx');
const { GameMethods } = await import('../../src/GameMethods.js');
const { callTestHook, _resetBridge } = await import('../../src/devtest/testBridge.js');

const FLOOR = 12; // the ground probe's floor everywhere; a spell lands within 0.5 of it
const noop = () => {};
let probed = []; // every point the ground probe was asked about, in order

const camera = (from, dir) => {
  const cam = new THREE.PerspectiveCamera();
  cam.position.set(...from);
  cam.lookAt(from[0] + dir[0], from[1] + dir[1], from[2] + dir[2]);
  cam.updateMatrixWorld(true);
  return cam;
};
const frame = (seconds) => act(() => { frameCb({}, seconds); });
const spent = () => callTestHook('readSpentProjectiles');
const live = () => callTestHook('readProjectiles');
const cast = (type) => {
  const before = new Set(live().map((p) => p.id));
  act(() => { useGameStore.getState().castSpell(type); });
  const mine = live().find((p) => !before.has(p.id));
  expect(mine, `castSpell('${type}') created no projectile — the scenario was never built`).toBeTruthy();
  return mine;
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

beforeEach(() => {
  frameCb = null;
  probed = [];
  _resetBridge();
  vi.unstubAllEnvs();
  useGameStore.setState({
    isAlive: true, mana: 1e6, maxMana: 1e6,
    playSpatialSound: noop, triggerGPUSparks: noop, triggerBloomSpike: noop, triggerCameraShake: noop,
    triggerHitstop: noop, damageBoss: noop, isBossActive: () => false, getBossPosition: null,
    // A flat floor at FLOOR under every column, through the same two probes the game registers.
    getMobGroundLevel: () => FLOOR,
    getMobFloor: (x, z, y) => { probed.push({ x, z, y }); return FLOOR; },
  });
  GameMethods.checkMobCollision = () => null;
  GameMethods.damageMob = () => null;
  GameMethods.grantXP = noop;
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete GameMethods.checkMobCollision;
  delete GameMethods.damageMob;
  delete GameMethods.grantXP;
});

const mount = () => {
  render(<EnhancedMagicSystem />);
  expect(typeof frameCb, 'EnhancedMagicSystem registered no frame callback').toBe('function');
  expect(spent(), 'the end record hook is not registered').toEqual([]);
};

describe('the end record stores where a spell ENDED, what ended it, and its age', () => {
  it('ground: the landing point — the last point the ground probe saw — and the distance from the muzzle', () => {
    mount();
    // Down and across on all three axes with different magnitudes, so a crossed axis or a sign cannot pass.
    useGameStore.setState({ gameCamera: camera([3, 20.05, 7], [0.48, -0.36, -0.8]) });
    const muzzle = cast('fireball');
    frame(1); // 25 m of flight in one frame: the spell must stop where it landed, not where the frame ended
    const rec = spent();
    expect(rec.length, 'a landed spell left no end record').toBe(1);
    const [end] = rec;
    expect(end.id).toBe(muzzle.id);
    expect(end.type).toBe('fireball');
    expect(end.by).toBe('ground');
    expect(end.age).toBe(1000);
    // The reference: the ground probe's LAST question is the substep that landed (it asks just under the point).
    const landed = probed[probed.length - 1];
    expect(end.x).toBeCloseTo(landed.x, 6);
    expect(end.z).toBeCloseTo(landed.z, 6);
    expect(end.y).toBeLessThanOrEqual(FLOOR + 0.5);
    expect(end.y - landed.y).toBeGreaterThan(0); // the probe asks a hair under the spell (mobFloor's feet epsilon)
    expect(end.y - landed.y).toBeLessThan(0.25);
    // The distance the e2e reads off the record: 19 m here (38 half-metre substeps until y <= 12.5), not 0 (the muzzle)
    // and not 25 (the frame's whole move).
    expect(dist(end, muzzle)).toBeCloseTo(19, 4);
    expect(live(), 'the landed spell is still live').toEqual([]);
  });

  it('age: the point the last frame carried it to, and the age that ended it', () => {
    mount();
    useGameStore.setState({ gameCamera: camera([-5, 30, 2], [0.6, 0, 0.8]) }); // level, high: never lands
    const muzzle = cast('fireball');
    const seen = [];
    for (let i = 0; i < 6; i++) { frame(0.5); seen.push(live().find((p) => p.id === muzzle.id)); }
    expect(seen.every(Boolean), 'the spell ended before its age ran out — the scenario is not an age-out').toBe(true);
    expect(spent()).toEqual([]);
    frame(0.5); // 3500 ms > maxAge 3000
    const [end, ...rest] = spent();
    expect(rest).toEqual([]);
    expect(end.by).toBe('age');
    expect(end.age).toBe(3500);
    // The reference: equal frames of straight flight, so the last frame moved it as far as the one before.
    const a = seen[4], b = seen[5];
    expect(end.x).toBeCloseTo(b.x + (b.x - a.x), 6);
    expect(end.y).toBeCloseTo(b.y + (b.y - a.y), 6);
    expect(end.z).toBeCloseTo(b.z + (b.z - a.z), 6);
    expect(dist(end, muzzle)).toBeGreaterThan(dist(b, muzzle));
  });

  it('mob: the point the mob test resolved the hit at, and the spell type', () => {
    mount();
    // The mob stands 10 m out along -z; the stand-in resolves the hit once the spell is within reach of it.
    const hits = [];
    GameMethods.checkMobCollision = (pos) => {
      if (pos.z > -10) return null;
      hits.push({ x: pos.x, y: pos.y, z: pos.z });
      return { id: 'm1' };
    };
    GameMethods.damageMob = () => ({ health: 5 });
    useGameStore.setState({ gameCamera: camera([2, 30, 0], [0.1, 0, -1]) });
    const muzzle = cast('iceball');
    for (let i = 0; i < 40 && live().length; i++) frame(0.05);
    expect(hits.length, 'the mob test never resolved a hit — nothing below is about a mob end').toBe(1);
    const [end, ...rest] = spent();
    expect(rest).toEqual([]);
    expect(end.id).toBe(muzzle.id);
    expect(end.type).toBe('iceball');
    expect(end.by).toBe('mob');
    expect(end.x).toBeCloseTo(hits[0].x, 6);
    expect(end.y).toBeCloseTo(hits[0].y, 6);
    expect(end.z).toBeCloseTo(hits[0].z, 6);
    expect(dist(end, muzzle)).toBeGreaterThan(7.5);
  });

  it('boss: the first frame-end inside the boss\'s 6 m reach', () => {
    mount();
    const boss = { x: -4, y: 31, z: 21 };
    useGameStore.setState({
      isBossActive: () => true, getBossPosition: () => [boss.x, boss.y, boss.z],
      gameCamera: camera([-4, 30, 0], [0, 0, 1]),
    });
    const muzzle = cast('fireball');
    const seen = [muzzle];
    for (let i = 0; i < 40; i++) {
      frame(0.05);
      const now = live().find((p) => p.id === muzzle.id);
      if (!now) break;
      seen.push(now);
    }
    expect(seen.length, 'the spell ended on its first frame — no live sample to measure the frame-end against').toBeGreaterThan(2);
    const [end, ...rest] = spent();
    expect(rest).toEqual([]);
    expect(end.by).toBe('boss');
    const a = seen[seen.length - 2], b = seen[seen.length - 1];
    expect(dist(end, boss), 'the record is not inside the boss\'s reach').toBeLessThan(6);
    expect(dist(b, boss), 'the frame before was already in reach — the spell flew on through the boss').toBeGreaterThanOrEqual(6);
    // Equal frames of straight flight: the frame that ended it moved it as far as the one before.
    expect(end.z - b.z, 'the record is not the frame-end after the last live sample').toBeCloseTo(b.z - a.z, 6);
    expect(end.x).toBeCloseTo(b.x, 6);
  });
});

describe('the record is bounded, and a read cannot change it', () => {
  it('keeps the newest 16 ends, oldest dropped first', () => {
    mount();
    useGameStore.setState({ gameCamera: camera([0, 30, 0], [0, 0, -1]) });
    const ids = [];
    for (let i = 0; i < 20; i++) ids.push(cast('fireball').id);
    expect(new Set(ids).size, 'the casts did not produce 20 distinct spells').toBe(20);
    frame(3.5); // every one ages out in the same frame
    const rec = spent();
    expect(rec.length, 'the record grew past its cap').toBe(16);
    expect(rec.map((r) => r.id), 'kept the wrong spells').toEqual(ids.slice(4));
  });

  it('hands out copies: a reader mutating one does not reach the record', () => {
    mount();
    useGameStore.setState({ gameCamera: camera([0, 30, 0], [0, 0, -1]) });
    cast('fireball');
    frame(3.5);
    const first = spent()[0];
    expect(first.by).toBe('age');
    first.by = 'mob'; first.x = 1e9;
    expect(spent()[0].by, 'a reader mutated the record').toBe('age');
    expect(spent()[0].x).not.toBe(1e9);
  });
});

describe('DEV only', () => {
  it('writes nothing while DEV is off, and the same mount writes again once it is back on', () => {
    mount();
    useGameStore.setState({ gameCamera: camera([0, 30, 0], [0, 0, -1]) });
    vi.stubEnv('DEV', false);
    cast('fireball');
    frame(3.5);
    expect(live(), 'the spell did not end — nothing below is about the record').toEqual([]);
    expect(spent(), 'wrote a record with DEV off').toEqual([]);
    vi.stubEnv('DEV', true); // PRESENCE, same mount, same instrument
    cast('fireball');
    frame(3.5);
    expect(spent().length).toBe(1);
  });

  it('registers neither hook when mounted with DEV off', () => {
    vi.stubEnv('DEV', false);
    render(<EnhancedMagicSystem />);
    expect(typeof frameCb, 'EnhancedMagicSystem did not mount').toBe('function');
    expect(callTestHook('readSpentProjectiles'), 'registered with DEV off').toBeUndefined();
    expect(callTestHook('readProjectiles'), 'registered with DEV off').toBeUndefined();
  });
});

// Levels come from fighting. A spell cast at nothing pays nothing, or casting at the sky is the fastest way to level.
describe('a cast grants no XP', () => {
  it('ten casts at the sky spend mana ten times and grant no XP', () => {
    mount();
    const grants = [];
    GameMethods.grantXP = (amount) => { grants.push(amount); };
    useGameStore.setState({ gameCamera: camera([0, 30, 0], [0.2, 1, 0.1]) });
    const before = useGameStore.getState().mana;
    cast('fireball');
    const perCast = before - useGameStore.getState().mana;
    expect(perCast, 'a cast spent no mana — the cast path was refused before it ran').toBeGreaterThan(0);
    for (let i = 1; i < 10; i++) cast('fireball');
    expect(before - useGameStore.getState().mana, 'not every cast went through').toBeCloseTo(10 * perCast, 6);
    frame(0.1); // in flight: a grant on the frame after the cast is the same farm
    expect(live().length, 'the ten spells are not in flight').toBe(10);
    expect(grants, 'casting granted XP').toEqual([]);
  });
});
