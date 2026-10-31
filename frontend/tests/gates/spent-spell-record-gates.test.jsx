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
const drawnArcs = new Map(); // every chain arc the system handed its renderer, by id
vi.mock('@react-three/fiber', async (orig) => ({
  ...(await orig()),
  useFrame: (cb) => { frameCb = cb; },
}));
vi.mock('../../src/render/spellVfx', () => ({
  EnhancedSpellProjectile: () => null,
  SpellImpactPop: () => null,
  CastTelegraph: () => null,
  ChainArc: ({ arc }) => { drawnArcs.set(arc.id, arc); return null; },
  MagicWand: () => null,
}));
vi.mock('../../src/SoundManager', () => ({
  useGameSounds: () => ({ playMagicCast() {}, playMagicHit() {}, playMagicExplosion() {} }),
}));

const { EnhancedMagicSystem } = await import('../../src/EnhancedMagicSystem.jsx');
const { useGameStore } = await import('../../src/store/useGameStore.jsx');
const { GameMethods } = await import('../../src/GameMethods.js');
const { callTestHook, _resetBridge } = await import('../../src/devtest/testBridge.js');
const { ecs } = await import('../../src/ecs/world.js');

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
// The world advances at most MAX_FRAME_STEP_SEC (0.25 s, src/game/frameStep.js) per frame, so long spans are driven as
// frames at that step.
const STEP = 0.25;
const frames = (n) => { for (let i = 0; i < n; i++) frame(STEP); };
const ageOut = () => frames(13); // 3250 ms > maxAge 3000: every spell cast before it ends in the 13th frame
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
  drawnArcs.clear();
  _resetBridge();
  vi.unstubAllEnvs();
  useGameStore.setState({
    isAlive: true, mana: 1e6, maxMana: 1e6,
    playSpatialSound: noop, triggerGPUSparks: noop, triggerBloomSpike: noop, triggerCameraShake: noop,
    triggerHitstop: noop, damageBoss: noop, bossActive: false, getBossPosition: null,
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
    frames(3); // 18.75 m of flight, 0.08 m short of the floor
    expect(spent(), 'the spell landed before the frame under test').toEqual([]);
    frame(STEP); // 6.25 m more in one frame: the spell must stop where it landed, not where the frame ended
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
    // The distance the e2e reads off the record. The muzzle stands at y 19.33 (2 m along the view from 20.05) and falls
    // 0.36 per metre, so y <= 12.5 needs 18.97 m: the first substep past it (13 per frame of 6.25 m) is the 40th, at
    // 19.23 m; not 18.75 (the last frame's start) and not 25 (its end).
    expect(dist(end, muzzle)).toBeCloseTo((40 * 6.25) / 13, 4);
    expect(live(), 'the landed spell is still live').toEqual([]);
  });

  it('age: the point the last frame carried it to, and the age that ended it', () => {
    mount();
    useGameStore.setState({ gameCamera: camera([-5, 30, 2], [0.6, 0, 0.8]) }); // level, high: never lands
    const muzzle = cast('fireball');
    const seen = [];
    for (let i = 0; i < 12; i++) { frame(STEP); seen.push(live().find((p) => p.id === muzzle.id)); }
    expect(seen.every(Boolean), 'the spell ended before its age ran out — the scenario is not an age-out').toBe(true);
    expect(spent()).toEqual([]);
    frame(STEP); // 3250 ms > maxAge 3000
    const [end, ...rest] = spent();
    expect(rest).toEqual([]);
    expect(end.by).toBe('age');
    expect(end.age).toBe(3250);
    // The reference: equal frames of straight flight, so the last frame moved it as far as the one before.
    const a = seen[10], b = seen[11];
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
      bossActive: true, getBossPosition: () => [boss.x, boss.y, boss.z],
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
    ageOut(); // every one ages out in the same frame
    const rec = spent();
    expect(rec.length, 'the record grew past its cap').toBe(16);
    expect(rec.map((r) => r.id), 'kept the wrong spells').toEqual(ids.slice(4));
  });

  it('hands out copies: a reader mutating one does not reach the record', () => {
    mount();
    useGameStore.setState({ gameCamera: camera([0, 30, 0], [0, 0, -1]) });
    cast('fireball');
    ageOut();
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
    ageOut();
    expect(live(), 'the spell did not end — nothing below is about the record').toEqual([]);
    expect(spent(), 'wrote a record with DEV off').toEqual([]);
    vi.stubEnv('DEV', true); // PRESENCE, same mount, same instrument
    cast('fireball');
    ageOut();
    expect(spent().length).toBe(1);
  });

  it('registers neither hook when mounted with DEV off', () => {
    vi.stubEnv('DEV', false);
    render(<EnhancedMagicSystem />);
    expect(typeof frameCb, 'EnhancedMagicSystem did not mount').toBe('function');
    expect(callTestHook('readSpentProjectiles'), 'registered with DEV off').toBeUndefined();
    expect(callTestHook('readProjectiles'), 'registered with DEV off').toBeUndefined();
    expect(callTestHook('readChainArcs'), 'registered with DEV off').toBeUndefined();
  });
});

// Levels come from fighting. A spell that lands on nothing pays nothing, or casting at the sky or at your own feet is the
// fastest way to level. XP reaches the bar two ways, the GameMethods.grantXP bridge and the store itself, so both are
// read after the spell has ended AND after every timer the cast could have left queued has run, and the spell-quest step
// is read too.
describe('a spell that lands on nothing grants no XP', () => {
  afterEach(() => {
    vi.useRealTimers();
    useGameStore.setState({ onSpellHit: null });
  });

  it.each([
    // Up and away: never lands, and flies out its 3 s life.
    ['at the sky', [0, 30, 0], [0.2, 1, 0.1], 3.5, 'age'],
    // Down and across onto the floor: lands about 19 m out, well inside its life.
    ['at the ground', [3, 20.05, 7], [0.48, -0.36, -0.8], 1, 'ground'],
  ])('ten casts %s spend mana ten times, end there, and pay nothing on any channel', async (where, from, dir, settle, endBy) => {
    // Only the timer queues: the frame clock and the store's own clocks stay real.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate'] });
    mount();
    const grants = [];
    let quest = 0;
    GameMethods.grantXP = (amount) => { grants.push(amount); };
    useGameStore.setState({
      gameCamera: camera(from, dir), level: 1, currentXP: 0, totalXP: 0, onSpellHit: () => { quest++; },
    });
    const xp = () => { const s = useGameStore.getState(); return { level: s.level, currentXP: s.currentXP, totalXP: s.totalXP }; };
    const before = useGameStore.getState().mana;
    const ids = [cast('fireball').id];
    const perCast = before - useGameStore.getState().mana;
    expect(perCast, 'a cast spent no mana — the cast path was refused before it ran').toBeGreaterThan(0);
    for (let i = 1; i < 10; i++) ids.push(cast('fireball').id);
    expect(before - useGameStore.getState().mana, 'not every cast went through').toBeCloseTo(10 * perCast, 6);
    frame(0.1); // in flight: a grant on the frame after the cast is the same farm
    expect(live().length, 'the ten spells are not in flight').toBe(10);
    frames(Math.ceil(settle / STEP)); // the span as frames at the world's step
    const ends = spent().filter((s) => ids.includes(s.id)).map((s) => s.by);
    expect(ends, `the ten spells cast ${where} did not all end by '${endBy}' — nothing below is about that end`)
      .toEqual(Array(10).fill(endBy));
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(grants, 'casting granted XP through GameMethods').toEqual([]);
    expect(xp(), 'casting moved the XP in the store').toEqual({ level: 1, currentXP: 0, totalXP: 0 });
    expect(quest, `casting ${where} advanced a spell quest`).toBe(0);
  });
});

// A spell that lands pays only when it lands on an enemy: a Settler or livestock is not a fight. It pays twice, 5 XP and
// a step of the spell quests (QuestSystem's onSpellHit, published on the store), and both are checked.
describe('a spell that lands pays only on an enemy', () => {
  // One fireball into `target`, resolved by the real hit loop; returns the XP grants and quest steps that hit made.
  const land = (target) => {
    const grants = [];
    let quest = 0;
    GameMethods.grantXP = (amount) => { grants.push(amount); };
    useGameStore.setState({ onSpellHit: () => { quest++; } });
    GameMethods.checkMobCollision = (_pos, _r, exclude) => (exclude && exclude.has(target.id) ? null : target);
    GameMethods.damageMob = (_id, dmg) => { target.health -= dmg; return target; };
    useGameStore.setState({ gameCamera: camera([0, 30, 0], [0, 0, -1]) });
    const bolt = cast('fireball');
    frame(0.05);
    const end = spent().find((s) => s.id === bolt.id);
    expect(end?.by, `the fireball never landed on the ${target.type} — nothing below is about a hit`).toBe('mob');
    return { grants, quest };
  };
  afterEach(() => useGameStore.setState({ onSpellHit: null }));

  it('a hit on a Settler or a Boar pays nothing; a hit on a Husk pays, the killing hit included', () => {
    mount();
    expect(land({ id: 's1', type: 'villager', passive: true, health: 120 }), 'a spell on a Settler paid')
      .toEqual({ grants: [], quest: 0 });
    expect(land({ id: 'p1', type: 'pig', passive: true, health: 50 }), 'a spell on a Boar paid')
      .toEqual({ grants: [], quest: 0 });
    // Presence on the same instrument, and the order of the check: health 1 dies to this hit, so a hostility read
    // after the damage would see a corpse and pay nothing.
    expect(land({ id: 'z1', type: 'zombie', passive: false, health: 500 }), 'a spell on a Husk did not pay')
      .toEqual({ grants: [5], quest: 1 });
    expect(land({ id: 'z2', type: 'zombie', passive: false, health: 1 }), 'the killing hit on a Husk did not pay')
      .toEqual({ grants: [5], quest: 1 });
  });
});

// "Land 10 spells on enemies" counts spells. A bolt that pierces three enemies or arcs through them is one spell landed;
// a spell on the Shadow Dragon is a spell landed on an enemy. Per-hit XP stays per hit.
describe('a spell counts once toward the spell quests, whatever it lands on', () => {
  const added = [];
  const mob = (fields) => {
    const e = ecs.add({ isMob: true, type: 'zombie', health: 100, maxHealth: 100, passive: false, ...fields });
    added.push(e);
    return e;
  };
  let grants;
  let quest;
  beforeEach(() => {
    grants = [];
    quest = 0;
    GameMethods.grantXP = (amount) => { grants.push(amount); };
    useGameStore.setState({ onSpellHit: () => { quest++; } });
  });
  afterEach(() => {
    while (added.length) ecs.remove(added.pop());
    useGameStore.setState({ onSpellHit: null });
  });
  const flyOut = (bolt) => {
    for (let i = 0; i < 40 && live().some((p) => p.id === bolt.id); i++) frame(0.05);
    return spent().find((s) => s.id === bolt.id)?.by;
  };

  it('an arcane bolt through three Husks pays 5 XP a hit and one quest step', () => {
    mount();
    const line = ['h1', 'h2', 'h3'].map((id) => ({ id, type: 'zombie', passive: false, health: 500 }));
    GameMethods.checkMobCollision = (_pos, _r, exclude) => line.find((m) => !(exclude && exclude.has(m.id))) ?? null;
    GameMethods.damageMob = (id, dmg) => { const m = line.find((x) => x.id === id); m.health -= dmg; return m; };
    useGameStore.setState({ gameCamera: camera([0, 30, 0], [0, 0, -1]) });
    expect(flyOut(cast('arcane')), 'the arcane bolt did not end on a mob').toBe('mob');
    expect(line.map((m) => m.health < 500), 'the bolt did not pierce all three Husks — nothing below is about a pierce')
      .toEqual([true, true, true]);
    expect(grants, 'each Husk the bolt pierced pays its 5 XP').toEqual([5, 5, 5]);
    expect(quest, 'one bolt through three Husks counted more than one spell').toBe(1);
  });

  it('a spell that lands on the Shadow Dragon counts', () => {
    mount();
    useGameStore.setState({
      bossActive: true, getBossPosition: () => [-4, 31, 21], gameCamera: camera([-4, 30, 0], [0, 0, 1]),
    });
    expect(flyOut(cast('fireball')), 'the fireball did not end on the boss').toBe('boss');
    expect(quest, 'a spell on the Shadow Dragon did not count').toBe(1);
  });

  // The direct target stands under the muzzle; two Husks stand inside the chain's 8 m reach of it.
  const strike = (direct) => {
    const A = mob({ id: 9201, position: new THREE.Vector3(0, 29, -6), ...direct });
    mob({ id: 9202, position: new THREE.Vector3(3, 29, -8) });
    mob({ id: 9203, position: new THREE.Vector3(-3, 29, -8) });
    let directHits = 0;
    const hops = [];
    GameMethods.checkMobCollision = (_pos, _r, exclude) => (exclude && exclude.has(A.id) ? null : (directHits++, A));
    GameMethods.damageMob = (id, dmg, _type, source) => {
      const e = ecs.entities.find((m) => m.id === id);
      if (source === undefined) hops.push(id); // the chain's hops pass no source; the direct hit does
      if (e) e.health -= dmg;
      return e;
    };
    useGameStore.setState({ gameCamera: camera([0, 30, 0], [0, 0, -1]) });
    expect(flyOut(cast('lightning')), 'the lightning did not end on a mob').toBe('mob');
    expect(directHits, 'the bolt never struck its target — nothing below is about a strike').toBe(1);
    expect(hops.length, 'the strike did not chain to both Husks — nothing below is about a chain').toBe(2);
  };

  it('a lightning strike on a Husk that chains to two more counts once', () => {
    mount();
    strike({});
    expect(quest, 'one lightning strike counted once per mob it reached').toBe(1);
  });

  it('a lightning strike on a Settler that arcs into Husks counts once, and the Settler hit pays no XP', () => {
    mount();
    strike({ type: 'villager', passive: true });
    expect(grants, 'the hit on the Settler paid XP').toEqual([]);
    expect(quest, 'a strike that reached Husks through its chain did not count').toBe(1);
  });
});

// The chain picks its victims itself, so it must pick them from the mobs as they are at the hop: an arc drawn to where a
// mob stood a moment ago, or onto one already dead, is damage and a bolt landing on nothing.
describe('chain lightning hops onto the live mobs', () => {
  const added = [];
  const mob = (fields) => {
    const e = ecs.add({ isMob: true, type: 'zombie', health: 100, maxHealth: 100, passive: false, ...fields });
    added.push(e);
    return e;
  };
  afterEach(() => { while (added.length) ecs.remove(added.pop()); });

  // One lightning strike on A, with the four ways a chain can go wrong standing within its 8 m reach. Returns every
  // hop as damageMob saw it: the target, and its live state at that instant.
  const strike = () => {
    const A = mob({ id: 9101, position: new THREE.Vector3(0, 29, -6) });   // takes the bolt directly
    const C = mob({ id: 9102, position: new THREE.Vector3(1, 29, -5) });   // nearest; dies inside the direct hit
    const D = mob({ id: 9103, position: new THREE.Vector3(-1, 29, -5), dyingUntil: 1 }); // a corpse, dissolving
    const ox = mob({ id: 9104, type: 'cow', passive: true, position: new THREE.Vector3(0, 29.5, -4) }); // never auto-picked
    const B = mob({ id: 9105, position: new THREE.Vector3(3, 29, -8) });   // stands here now
    let directHits = 0;
    GameMethods.checkMobCollision = (_pos, _r, exclude) => (exclude && exclude.has(A.id) ? null : (directHits++, A));
    const hops = [];
    GameMethods.damageMob = (id, dmg, type, source) => {
      const e = ecs.entities.find((m) => m.id === id);
      if (source === undefined) { // the chain's hops pass no source; the direct hit does
        hops.push({ id, type, alive: !!e && e.health > 0 && !e.dyingUntil, at: e && e.position.clone() });
      }
      if (e) e.health -= dmg;
      if (id === A.id) { C.health = 0; C.dyingUntil = 1; } // something else killed C in this frame, before the chain
      return e;
    };

    useGameStore.setState({ gameCamera: camera([0, 30, 0], [0, 0, -1]) });
    cast('lightning');
    frame(0.05);
    expect(directHits, 'the bolt never struck A — nothing below is about a chain').toBe(1);
    expect(hops.length, 'the strike chained to nobody').toBeGreaterThan(0);
    while (added.length) ecs.remove(added.pop());
    return { hops, ids: { A: A.id, B: B.id, C: C.id, D: D.id, ox: ox.id } };
  };
  const arcEnd = (arc) => arc.points.slice(-3);

  it('skips a mob killed earlier in the same frame, and draws each arc to where its target stands', () => {
    mount();
    const { hops, ids } = strike();
    expect(hops.every((h) => h.type === 'lightning')).toBe(true);
    const hit = hops.map((h) => h.id);
    expect(hit, 'the chain hopped onto a mob that died earlier in the same frame').not.toContain(ids.C);
    expect(hit, 'the chain hopped onto a dissolving corpse').not.toContain(ids.D);
    expect(hit, 'the chain picked the Ox on its own').not.toContain(ids.ox);
    expect(hit, 'the chain never reached B, standing 4.4 m from the strike').toContain(ids.B);
    expect(hops.every((h) => h.alive), 'a hop landed on a dead mob').toBe(true);

    const arcs = [...drawnArcs.values()];
    expect(arcs.length, 'one arc per hop').toBe(hops.length);
    hops.forEach((h, i) => {
      const [x, y, z] = arcEnd(arcs[i]);
      // The arc ends at body height over the mob's feet.
      expect(Math.hypot(x - h.at.x, y - 0.9 - h.at.y, z - h.at.z), `the arc to mob ${h.id} ends away from where it stands`)
        .toBeLessThan(1e-6);
    });

    // The DEV record the e2e reads is the drawn geometry, hop for hop.
    const rec = callTestHook('readChainArcs');
    expect(rec.map((r) => r.target), 'the record names other targets than the hops').toEqual(hit);
    rec.forEach((r, i) => expect([r.x, r.y, r.z], 'the record is not the drawn end').toEqual(arcEnd(arcs[i])));
  });

  it('records only while DEV is on, and stays bounded at 16 hops', () => {
    mount();
    vi.stubEnv('DEV', false);
    strike();
    expect(callTestHook('readChainArcs'), 'wrote a chain record with DEV off').toEqual([]);
    vi.stubEnv('DEV', true); // PRESENCE, same mount, same instrument
    strike();
    expect(callTestHook('readChainArcs').length).toBe(1);
    for (let i = 0; i < 20; i++) strike();
    expect(callTestHook('readChainArcs').length, 'the chain record grew past its cap').toBe(16);
  });
});
