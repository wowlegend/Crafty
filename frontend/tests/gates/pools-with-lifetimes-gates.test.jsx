// @vitest-environment jsdom
//
// POOLS WITH LIFETIMES (lane L9 of the 2026-10-30 deep audit). Three pools the game fills and nothing emptied:
//   - AUDIT:leaks:chest-board-slots-never-reclaimed: the quest-chest board held at most five UNOPENED chests wherever
//     they stood, so five the player walked away from held every slot for the session and no periodic chest spawned
//     again (0 in 30 minutes at 600 m).
//   - AUDIT:leaks:stranded-pickups-never-despawn: an XP orb or a loot drop the player did not walk to stayed all session,
//     paying a floor probe and a render callback every frame (801 probes a frame at 801 pickups), and its XP waited.
//   - AUDIT:ultra:ultra-game-logic-4: the element-zone cap evicted the first painted, not the soonest to expire
//     (src/game/elementZones.test.js owns that order; here the registry is driven for its bound only).
//
// THE GATE IS THE AUDIT'S: the player parked 600 m from where the pools were filled for ten simulated minutes, kills
// still landing around them, and every pool within its bound at every second. The real hook, the real systems, the real
// kill path and the real store, driven by hand: the useFrame callbacks at 60 Hz, the hook's timers by the fake clock.
// The bounds are written here as literals: they are the contract, and raising one is a decision to make in this file.
//
// WHAT A PLAYER SEES AND HEARS (round 2): a pickup in their hands gives its chime, its floating number and its pop; one banked
// out of reach gives none of them, and what a frame banks is told in ONE line, however many it banked. The sound, the number
// and the pop are counted as the systems call them (the `feel` record below), so a mutant that flipped which pickups chime
// is red here and not only in a source regex.
//
// WHAT THE READINGS HAVE TO SHOW BEFORE ANY "WITHIN THE BOUND" MEANS ANYTHING (the denominators below):
//   - the pools were FULL before the move (the burst overflows the pickup bound, five chests stood, the zones filled);
//   - the pickups the player is next to are still collected, with their XP (the control that flips);
//   - every XP point and item the kills owed reached the player by the end: an expiry banks, it does not lose.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, renderHook, act, cleanup } from '@testing-library/react';

const frames = new Set();
const camera = { position: { x: 0, y: 0, z: 0 } };
vi.mock('@react-three/fiber', async (importOriginal) => {
  const real = await importOriginal();
  const R = await import('react');
  return {
    ...real,
    // The newest callback of each mounted system, called by hand; a re-render does not register a second one.
    useFrame: (cb) => {
      const ref = R.useRef(cb);
      ref.current = cb;
      R.useEffect(() => {
        const run = (...a) => ref.current(...a);
        frames.add(run);
        return () => { frames.delete(run); };
      }, []);
    },
    useThree: () => ({ camera }),
  };
});
// What the player would hear, see and be told, as the systems call it. The sound is a Proxy so any other sound is a no-op.
const feel = vi.hoisted(() => ({ chimes: 0, texts: [], pops: [], notices: [] }));
vi.mock('../../src/SoundManager', () => ({
  useGameSounds: () => new Proxy({}, { get: (_t, name) => (name === 'playPickup' ? () => { feel.chimes += 1; } : () => {}) }),
  useSounds: () => ({}),
}));

let clock = 1000;
vi.spyOn(performance, 'now').mockImplementation(() => clock);

import { CombatSystem } from '../../src/systems/CombatSystem.jsx';
import { XPOrbSystem } from '../../src/systems/XPOrbSystem.jsx';
import { LootSystem } from '../../src/systems/LootSystem.jsx';
import { xpOrbsQuery, lootDropsQuery } from '../../src/systems/_npcShared.js';
import { ecs } from '../../src/ecs/world.js';
import { GameMethods } from '../../src/GameMethods.js';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { useTreasureChests } from '../../src/QuestSystem.jsx';
import { subscribeMobKill } from '../../src/game/mobKillBus.js';
import { LOOT_TABLES } from '../../src/data/lootTables.js';
import { makeZoneRegistry, spawnZone, stepZones } from '../../src/game/elementZones.js';

// ---- the contract: the bounds, as the lane states them ----
const ORB_BOUND = 64;      // XP orbs alive at once
const LOOT_BOUND = 32;     // loot drops alive at once
const CHEST_BOUND = 5;     // unopened periodic chests, for a player who stays put
const WALK_CHEST_BOUND = 8; // ... for a player who walks on: five in reach plus the few still inside the retire radius
const BOARD_MAX = 10;      // ... for ANY player, however they move: the board's maximum, the farthest chests give way to it
const ZONE_BOUND = 8;      // element zones
const LIFETIME_S = 90;
const CULL_RANGE = 100;

const DT = 1 / 60;
const GROUND = 30;
const FAR = 600;

// Seeded randomness for the chest placements and the kills' scatter: the same run every time.
let seed = 1;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const LOOT_ITEM = LOOT_TABLES.zombie[0].item;
const LOOT_XP = LOOT_TABLES.zombie[0].xp;

let xpGranted = 0;
let probes = 0;
let owed = { xp: 0, loot: 0, orbXP: 0 };
let seenPickups = new Set();
let unsubKill = null;
let nextMobId = 9e6;

const lootInBag = () => useGameStore.getState().inventory.blocks[LOOT_ITEM] || 0;
let lootAtStart = 0;

function placePlayer(x, z) {
  camera.position.x = x; camera.position.y = GROUND + 2.6; camera.position.z = z;
  useGameStore.setState({ playerPosition: { x, y: GROUND + 2, z } });
}

function runFrames(n) {
  act(() => {
    for (let f = 0; f < n; f++) {
      clock += DT * 1000;
      for (const cb of [...frames]) cb({ clock: { elapsedTime: clock / 1000, getElapsedTime: () => clock / 1000 } }, DT);
    }
  });
}
// One simulated second: sixty frames of the systems, then the hook's timers by the fake clock. The frames come first
// because a player's kill holds the world for a hitstop on the mocked clock (isWorldFrozenNow), and the hook skips a tick
// that lands inside one: a second that put the timers first would lose the spawner's tick to the kill before it.
function runSecond() {
  runFrames(60);
  act(() => { vi.advanceTimersByTime(1000); });
}

// The XP and items a kill puts in the world, counted once each as they appear.
function harvest() {
  for (const e of xpOrbsQuery.entities) if (!seenPickups.has(e)) { seenPickups.add(e); owed.xp += e.amount; owed.orbXP += e.amount; }
  for (const e of lootDropsQuery.entities) if (!seenPickups.has(e)) { seenPickups.add(e); owed.xp += e.xp; owed.loot += 1; }
}
// A kill by the player's fireball, through the real damage path: the orbs from CombatSystem, the loot from the kill bus.
function killAt(x, z) {
  const id = nextMobId++;
  const mob = ecs.add({ isMob: true, id, type: 'zombie', position: { x, y: GROUND + 1.5, z }, health: 100, maxHealth: 100, speed: 2, passive: false, damage: 10, rotation: 0, knockback: null, lastHit: 0 });
  act(() => { GameMethods.damageMob(id, 999, 'fireball', 'player', false); });
  ecs.remove(mob);
  harvest();
}
function ringOfKills(n, cx, cz, radius) {
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; killAt(cx + Math.cos(a) * radius, cz + Math.sin(a) * radius); }
}

const hDist = (p, x, z) => Math.hypot(p.x - x, p.z - z);
const pickupCounts = () => ({ orbs: xpOrbsQuery.entities.length, loot: lootDropsQuery.entities.length });
// What the player has been given so far: chimes, floating numbers, pops, and the lines the notification channel carried.
const feelNow = () => ({ chimes: feel.chimes, texts: feel.texts.length, pops: feel.pops.length, notices: feel.notices.length });
const lootLines = () => feel.notices.filter((n) => /^Looted: /.test(n.text)).map((n) => n.text);
const xpLines = () => feel.notices.filter((n) => /^\+\d+ XP$/.test(n.text)).map((n) => n.text);
const strandedBeyond = (x, z, range) =>
  [...xpOrbsQuery.entities, ...lootDropsQuery.entities].filter((e) => hDist(e.position, x, z) > range).length;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  seed = 1;
  vi.spyOn(Math, 'random').mockImplementation(rnd);
  for (const e of [...ecs.entities]) ecs.remove(e);
  xpGranted = 0; probes = 0; owed = { xp: 0, loot: 0, orbXP: 0 }; seenPickups = new Set(); nextMobId = 9e6;
  feel.chimes = 0; feel.texts = []; feel.pops = []; feel.notices = [];
  GameMethods.spawnXPText = (amount) => { feel.texts.push(amount); };
  GameMethods.spawnLootPop = (_pos, color) => { feel.pops.push(color); };
  GameMethods.grantXP = (n) => { xpGranted += n; };
  useGameStore.setState({
    getMobGroundLevel: () => GROUND,
    getMobFloor: () => { probes += 1; return GROUND; },
    addNotification: (text, type) => { feel.notices.push({ text, type }); },
    onChestOpen: null,
    treasureChestsList: [],
    isDay: true,
    hitstopUntil: 0, hitstopStart: 0, hitstopFrozenTotal: 0, // a previous test's kill must not hold this one's world
  });
  lootAtStart = lootInBag();
  placePlayer(0, 0);
  // The loot half of the real kill path: QuestSystem rolls LOOT_TABLES on the kill bus. It is not mounted here, so this
  // listener forces the first row of the table, which makes every player kill drop one item.
  unsubKill = subscribeMobKill((type, pos, src) => { if (src === 'player') GameMethods.spawnLootDrop(LOOT_ITEM, LOOT_XP, pos); });
});
afterEach(() => {
  if (unsubKill) unsubKill();
  cleanup();
  vi.restoreAllMocks();
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.useRealTimers();
  for (const e of [...ecs.entities]) ecs.remove(e);
});

const mountSystems = () => render(<><CombatSystem setDamageNumbers={() => {}} setShockwaves={() => {}} damageId={{ current: 0 }} /><XPOrbSystem /><LootSystem /></>);

describe('pickups: the ones in reach are collected, and the ones out of it are banked, not lost', () => {
  it('CONTROL: kills beside the player are collected by the magnets, each point of XP and each item', () => {
    mountSystems();
    ringOfKills(5, 0, 0, 5);
    const spawned = pickupCounts();
    expect(spawned.orbs, 'the kills dropped no orbs: nothing below is meaningful').toBeGreaterThan(0);
    expect(spawned.loot, 'the kills dropped no loot: nothing below is meaningful').toBe(5);
    runFrames(300);
    expect(pickupCounts(), 'pickups beside the player were not collected').toEqual({ orbs: 0, loot: 0 });
    expect(xpGranted, 'the magnet collects delivered a different XP than the kills dropped').toBe(owed.xp);
    expect(lootInBag() - lootAtStart, 'the items the kills dropped did not all reach the bag').toBe(5);
    // Each pickup in hand gave its chime, its number, and (a drop) its pop and its line: the pickup feedback is live.
    expect(feelNow(), 'a pickup in the player\'s hands did not give its chime, number and pop').toEqual({
      chimes: spawned.orbs + spawned.loot, texts: spawned.orbs + spawned.loot, pops: spawned.loot, notices: spawned.loot,
    });
    expect(lootLines()).toHaveLength(5);
  });

  it('a stranded pickup waits its lifetime for the player, then is banked in full', () => {
    mountSystems();
    ringOfKills(10, 0, 0, 20); // 20 m out: past the loot magnet (7 m) and the XP magnet (12 m)
    const fresh = pickupCounts();
    expect(fresh.orbs, 'no orbs stranded: nothing below is meaningful').toBeGreaterThan(0);
    runFrames(60 * (LIFETIME_S - 5));
    expect(pickupCounts(), 'a stranded pickup left before its lifetime ran out').toEqual(fresh);
    expect(xpGranted, 'XP was banked while the pickups were still waiting').toBe(0);
    runFrames(60 * 10);
    expect(pickupCounts(), 'the pickups outlived their lifetime').toEqual({ orbs: 0, loot: 0 });
    expect(xpGranted, 'an expired pickup lost the XP it carried').toBe(owed.xp);
    expect(lootInBag() - lootAtStart, 'an expired pickup lost its item').toBe(10);
  });

  it('a pickup left more than the cull range behind is banked at once', () => {
    mountSystems();
    ringOfKills(6, 0, 0, 20);
    runFrames(60); // the 0.8 s burst is over; a pickup is not culled mid-scatter
    const before = pickupCounts();
    expect(before.orbs, 'the pickups did not wait for the player: nothing below is meaningful').toBeGreaterThan(0);
    expect(xpGranted, 'XP was banked before the player left').toBe(0);
    placePlayer(CULL_RANGE + 60, 0);
    runFrames(5);
    expect(pickupCounts(), 'pickups beyond the cull range stayed').toEqual({ orbs: 0, loot: 0 });
    expect(xpGranted).toBe(owed.xp);
    expect(lootInBag() - lootAtStart).toBe(6);
  });

  it('a burst past the bound is cut back to it by banking the oldest, and nothing it carried is lost', () => {
    mountSystems();
    ringOfKills(40, 0, 0, 20);
    const burst = pickupCounts();
    expect(burst.orbs, 'the burst did not overflow the orb bound: the cap is not exercised').toBeGreaterThan(ORB_BOUND);
    expect(burst.loot, 'the burst did not overflow the loot bound: the cap is not exercised').toBeGreaterThan(LOOT_BOUND);
    runFrames(2);
    const after = pickupCounts();
    expect(after.orbs).toBeLessThanOrEqual(ORB_BOUND);
    expect(after.loot).toBeLessThanOrEqual(LOOT_BOUND);
    expect(after.orbs, 'the cut took more than the overflow').toBeGreaterThan(ORB_BOUND - 8);
    // What was banked is exactly what is missing; the rest is still in the world.
    const inWorld = [...xpOrbsQuery.entities].reduce((s, e) => s + e.amount, 0) + [...lootDropsQuery.entities].reduce((s, e) => s + e.xp, 0);
    expect(xpGranted + inWorld, 'the cut lost XP').toBe(owed.xp);
    expect(lootInBag() - lootAtStart + after.loot, 'the cut lost items').toBe(40);
  });

  it('FRAME COST AT THE BOUND: one floor probe a frame per pickup, never more than the bound', () => {
    mountSystems();
    ringOfKills(40, 0, 0, 20);
    runFrames(120); // the burst's 0.8 s scatter is over and the cap has cut the pool to its bound
    const at = pickupCounts();
    expect(at.orbs, 'the pool is not at the orb bound: this reading is not of the bound').toBe(ORB_BOUND);
    expect(at.loot, 'the pool is not at the loot bound: this reading is not of the bound').toBe(LOOT_BOUND);
    probes = 0;
    const N = 600;
    const t0 = process.hrtime.bigint();
    runFrames(N);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const perFrame = probes / N;
    console.log(`[L9] frame cost at the bound: ${at.orbs} orbs + ${at.loot} loot: ${perFrame.toFixed(2)} floor probes a frame, ${(ms / N).toFixed(4)} ms a frame (both pickup systems, a stub floor)`);
    expect(perFrame, 'the pickup systems probed for fewer pickups than the pool holds: the reading is not of a pool at its bound').toBe(ORB_BOUND + LOOT_BOUND);
    expect(perFrame, 'the floor probes a frame grew past the bound').toBeLessThanOrEqual(ORB_BOUND + LOOT_BOUND);
  });
});

describe('what the player sees and hears: a pickup in their hands is felt, a pickup banked out of reach is told in one line', () => {
  it('in hand gives the chime, the number and the pop; an expired pickup out of reach gives none, and one line says what banked', () => {
    mountSystems();
    // PRESENCE first, in the same run: three kills at the player's feet are collected in hand and the instrument sees it.
    ringOfKills(3, 0, 0, 4);
    const near = pickupCounts();
    runFrames(300);
    expect(LOOT_XP, 'the loot row carries no XP: the number below is not exercised').toBeGreaterThan(0);
    expect(feelNow(), 'the instrument did not see a pickup in hand: nothing below is meaningful').toEqual({
      chimes: near.orbs + near.loot, texts: near.orbs + near.loot, pops: near.loot, notices: near.loot,
    });
    const inHand = feelNow();
    // ABSENCE: ten kills out of reach wait out their lifetime. They expire in one frame, and the player is told once.
    const orbXPBefore = owed.orbXP;
    ringOfKills(10, 0, 0, 20);
    const orbXPFar = owed.orbXP - orbXPBefore;
    expect(orbXPFar, 'the far kills dropped no orb XP: the XP line below is not exercised').toBeGreaterThan(0);
    runFrames(60 * (LIFETIME_S + 10));
    expect(pickupCounts(), 'the far pickups outlived their lifetime').toEqual({ orbs: 0, loot: 0 });
    expect(xpGranted, 'an expired pickup lost the XP it carried').toBe(owed.xp);
    const after = feelNow();
    expect({ chimes: after.chimes, texts: after.texts, pops: after.pops }, 'a banked pickup chimed, showed a number or popped').toEqual({ chimes: inHand.chimes, texts: inHand.texts, pops: inHand.pops });
    expect(lootLines().slice(near.loot), 'what ten drops banked in one frame is not told in one line').toEqual(['Looted: 10 items']);
    expect(xpLines(), 'what the banked orbs carried is not told in one line').toEqual([`+${orbXPFar} XP`]);
  });

  it('a return trip: what a frame banks is told once, however many it banked', () => {
    mountSystems();
    ringOfKills(30, 0, 0, 20);
    runFrames(60);                       // the burst is over; the bound has cut the orbs that overflowed it
    expect(pickupCounts().loot, 'the drops did not wait for the player: nothing below is meaningful').toBe(30);
    const orbXPLeft = [...xpOrbsQuery.entities].reduce((a, e) => a + e.amount, 0);
    expect(orbXPLeft, 'no orbs left to bank on the trip: the XP line below is not exercised').toBeGreaterThan(0);
    feel.notices.length = 0;             // only the move's own frame is read
    placePlayer(CULL_RANGE + 60, 0);
    runFrames(1);
    expect(pickupCounts(), 'the pickups did not all bank in the frame the player left their range').toEqual({ orbs: 0, loot: 0 });
    expect(lootLines(), 'thirty banked drops flooded the notification channel').toEqual(['Looted: 30 items']);
    expect(xpLines()).toEqual([`+${orbXPLeft} XP`]);
    expect(feel.notices, 'something other than the two banking lines was raised').toHaveLength(2);
    expect(xpGranted).toBe(owed.xp);
    expect(lootInBag() - lootAtStart).toBe(30);
  });

  it('a burst out of reach past the bound is cut back quietly: no chime, number or pop, and the cut is told in one line each', () => {
    mountSystems();
    ringOfKills(2, 0, 0, 4);             // presence: two in hand
    runFrames(300);
    const inHand = feelNow();
    expect(inHand.chimes, 'the instrument did not see a pickup in hand: nothing below is meaningful').toBeGreaterThan(0);
    feel.notices.length = 0;
    ringOfKills(40, 0, 0, 20);
    const burst = pickupCounts();
    expect(burst.orbs, 'the burst did not overflow the orb bound: the cut is not exercised').toBeGreaterThan(ORB_BOUND);
    expect(burst.loot, 'the burst did not overflow the loot bound: the cut is not exercised').toBeGreaterThan(LOOT_BOUND);
    const orbsBefore = [...xpOrbsQuery.entities];
    runFrames(2);
    const cutOrbs = orbsBefore.filter((e) => !xpOrbsQuery.entities.includes(e));
    expect(cutOrbs, 'the cut took more or fewer orbs than the overflow').toHaveLength(burst.orbs - ORB_BOUND);
    const after = feelNow();
    expect({ chimes: after.chimes, texts: after.texts, pops: after.pops }, 'a pickup the bound cut out of reach chimed, showed a number or popped').toEqual({ chimes: inHand.chimes, texts: inHand.texts, pops: inHand.pops });
    expect(lootLines(), 'the cut drops are not told in one line').toEqual([`Looted: ${burst.loot - LOOT_BOUND} items`]);
    expect(xpLines(), 'the cut orbs are not told in one line').toEqual([`+${cutOrbs.reduce((a, e) => a + e.amount, 0)} XP`]);
  });

  it('pickups the player is standing in are collected, not banked: the bound cuts the ones out of reach first, and the rest are felt', () => {
    mountSystems();
    ringOfKills(40, 0, 0, 3);            // loot 40 and orbs far past their bounds, all inside both magnets
    const burst = pickupCounts();
    expect(burst.orbs, 'the burst did not overflow the orb bound: the cut is not exercised').toBeGreaterThan(ORB_BOUND);
    expect(burst.loot, 'the burst did not overflow the loot bound: the cut is not exercised').toBeGreaterThan(LOOT_BOUND);
    runFrames(300);
    expect(pickupCounts()).toEqual({ orbs: 0, loot: 0 });
    expect(xpGranted).toBe(owed.xp);
    expect(feelNow(), 'a pickup the player was standing in was banked in silence').toEqual({
      chimes: burst.orbs + burst.loot, texts: burst.orbs + burst.loot, pops: burst.loot, notices: burst.loot,
    });
    expect(xpLines(), 'a pickup in reach was told as banked').toEqual([]);
    expect(lootLines().filter((t) => / items$/.test(t)), 'a drop in reach was told as banked').toEqual([]);
  });
});

describe('the audit gate: the player 600 m away for ten simulated minutes', () => {
  it('every pool stays within its bound, a chest comes within 60 m, and everything owed is delivered', () => {
    mountSystems();
    const { result } = renderHook(() => useTreasureChests());
    const periodic = () => result.current.chests.filter((c) => !c.shrine && !result.current.openedChestIds.has(c.id));
    const near = (r) => periodic().filter((c) => hDist({ x: c.position[0], z: c.position[2] }, FAR, 0) <= r).length;

    // FILL THE POOLS where the player stands. 150 s at the spawn puts five chests on the board; then a burst of ranged kills
    // strands more pickups than the bound; then the zones fill.
    for (let s = 0; s < 150; s++) runSecond();
    expect(periodic().length, 'the board never filled at the spawn: the fixture is not the scenario').toBe(CHEST_BOUND);
    ringOfKills(30, 0, 0, 20);
    expect(pickupCounts().orbs, 'the burst did not strand more orbs than the bound').toBeGreaterThan(ORB_BOUND);
    runFrames(2);

    const zones = makeZoneRegistry();
    let zoneNow = 0;
    const kinds = ['burning', 'frozen', 'conductive', 'resonant'];
    let zoneCasts = 0;
    const castZone = () => {
      // Positions spread far apart so the dedupe does not merge them, and kinds that do not annihilate each other:
      // the registry is filled to its cap and held there by casts, evicting.
      spawnZone(zones, { kind: kinds[zoneCasts % 3 === 0 ? 0 : 2], pos: { x: (zoneCasts % 40) * 9, y: 50, z: 0 } }, zoneNow);
      zoneCasts += 1;
    };
    for (let i = 0; i < ZONE_BOUND + 2; i++) { castZone(); zoneNow += 1; }
    expect(zones.zones.length, 'the zones never filled: the fixture is not the scenario').toBe(ZONE_BOUND);

    // THE MOVE: the player is 600 m from everything above, and stays for ten minutes. Ranged kills keep landing around
    // them (4 every 30 s for the first eight minutes, none in the last two), and a zone is cast every second for the first eight.
    placePlayer(FAR, 0);
    const MINUTES = 10, SECONDS = MINUTES * 60, KILLS_END = 8 * 60;
    const samples = [];
    let sawNearChestBy35 = null;
    for (let s = 1; s <= SECONDS; s++) {
      if (s <= KILLS_END && s % 30 === 1) ringOfKills(4, FAR, 0, 20);
      if (s <= KILLS_END) castZone(); // one a second: eight to ten live at once, so the cap evicts all the way
      runSecond();
      zoneNow += 1;
      stepZones(zones, zoneNow);
      const c = pickupCounts();
      samples.push({ s, orbs: c.orbs, loot: c.loot, chests: periodic().length, zones: zones.zones.length, stranded: strandedBeyond(FAR, 0, CULL_RANGE) });
      if (s === 35) sawNearChestBy35 = near(60);
    }

    // DENOMINATOR: the instrument sampled every second of the ten minutes and saw each pool hold something.
    const peak = (k) => Math.max(...samples.map((x) => x[k]));
    console.log(`[L9] ${samples.length} samples over ${MINUTES} min at ${FAR} m: peak orbs ${peak('orbs')}/${ORB_BOUND}, loot ${peak('loot')}/${LOOT_BOUND}, periodic chests ${peak('chests')}/${CHEST_BOUND}, zones ${peak('zones')}/${ZONE_BOUND}; chests within 60 m at 35 s: ${sawNearChestBy35}, at the end: ${near(60)}`);
    expect(samples).toHaveLength(SECONDS);
    expect(peak('orbs'), 'no orb was ever alive after the move: the kills at the new spot did not strand any').toBeGreaterThan(0);
    expect(peak('loot')).toBeGreaterThan(0);
    expect(peak('zones'), 'the zones never reached the cap during the move: eviction was not exercised').toBe(ZONE_BOUND);

    // Soft assertions from here: one red run names every pool that broke, not only the first.
    const over = (k, bound) => samples.filter((x) => x[k] > bound).map((x) => `${x.s}s:${x[k]}`);
    expect.soft(over('orbs', ORB_BOUND), `seconds with more than ${ORB_BOUND} orbs`).toEqual([]);
    expect.soft(over('loot', LOOT_BOUND), `seconds with more than ${LOOT_BOUND} loot drops`).toEqual([]);
    expect.soft(over('chests', CHEST_BOUND), `seconds with more than ${CHEST_BOUND} periodic chests`).toEqual([]);
    expect.soft(over('zones', ZONE_BOUND), `seconds with more than ${ZONE_BOUND} zones`).toEqual([]);
    expect.soft(over('stranded', 0), `seconds with a pickup more than ${CULL_RANGE} m from the player`).toEqual([]);

    // THE AUDIT'S OWN LINE: with nothing opened in ten minutes, a chest is within 60 m of the player.
    expect.soft(sawNearChestBy35, 'no periodic chest within 60 m of the player 35 s after they arrived').toBeGreaterThanOrEqual(1);
    expect.soft(near(60), 'no periodic chest within 60 m of the player at the end of ten minutes').toBeGreaterThanOrEqual(1);
    expect.soft(periodic().filter((c) => hDist({ x: c.position[0], z: c.position[2] }, 0, 0) < 300), 'a chest from the spawn, 600 m behind, is still on the board').toHaveLength(0);

    // NOTHING LOST: the kills stopped two minutes before the end, so every pickup has had its lifetime; each owed point of
    // XP and each item has reached the player, and the pools are empty.
    expect.soft(pickupCounts(), 'pickups remain two minutes after the last kill').toEqual({ orbs: 0, loot: 0 });
    expect.soft(xpGranted, 'the XP the kills owed is not the XP the player was granted').toBe(owed.xp);
    expect.soft(lootInBag() - lootAtStart, 'the items the kills dropped are not all in the bag').toBe(owed.loot);
    expect.soft(zones.zones.length, 'zones remain two minutes after the last cast').toBe(0);
  }, 180000);

  it('a player who walks on keeps meeting chests: the board follows them and stays bounded', () => {
    const { result } = renderHook(() => useTreasureChests());
    const periodic = () => result.current.chests.filter((c) => !c.shrine && !result.current.openedChestIds.has(c.id));
    const pace = 3.5; // m/s: a quarter of the walking speed, an average with stops
    const shrineIds = new Set(); // every shrine reward chest the walk ever caused: each is a once-per-shrine gift
    let x = 0, minutesWithAChest = 0, peak = 0;
    for (let s = 1; s <= 20 * 60; s++) {
      x += pace;
      placePlayer(x, 0);
      act(() => { vi.advanceTimersByTime(1000); });
      peak = Math.max(peak, periodic().length);
      for (const c of result.current.chests) if (c.shrine) shrineIds.add(c.id);
      if (s % 60 === 0 && periodic().some((c) => hDist({ x: c.position[0], z: c.position[2] }, x, 0) <= 80)) minutesWithAChest += 1;
    }
    const shrinesLeft = result.current.chests.filter((c) => c.shrine).length;
    console.log(`[L9] walked ${Math.round(x)} m in 20 min: a chest on the compass (80 m) in ${minutesWithAChest}/20 minutes, periodic chests peaked at ${peak} (bound ${WALK_CHEST_BOUND}); shrine chests caused ${shrineIds.size}, still on the board ${shrinesLeft}`);
    expect(shrineIds.size, 'the walk passed no shrine: the shrine exemption is not exercised').toBeGreaterThan(0);
    expect(shrinesLeft, 'a shrine reward chest was retired behind the player: its once-per-shrine gift is gone for good').toBe(shrineIds.size);
    expect(minutesWithAChest, 'the compass showed no chest for most of the walk').toBeGreaterThanOrEqual(18);
    expect(peak, 'the board grew without bound as the player walked').toBeLessThanOrEqual(WALK_CHEST_BOUND);
    expect(peak, 'no chest was ever on the board: the walk is not the scenario').toBeGreaterThan(0);
  }, 180000);

  // THE WORST CASE THE COUNT RADIUS ALLOWS. The cap counts chests within 120 m, so a player who loops through the ring
  // between 120 m and 240 m keeps adding chests where they no longer count and the retire radius does not yet reach. Measured
  // before the board had a maximum (three seeds, a circle walked at 3.5 m/s): 17 chests on a 125 m radius within the first
  // hour; 21 on a 140 m radius by the sixth hour, still rising at the end. Not a farm (a chest still comes only every 30 s),
  // but a pool nothing bounded. Three hours on the 140 m circle is where the old board passed 19.
  it('a player who circles a ring the count radius does not reach keeps the board at its maximum, and keeps a chest within reach', () => {
    const { result } = renderHook(() => useTreasureChests());
    const periodic = () => result.current.chests.filter((c) => !c.shrine && !result.current.openedChestIds.has(c.id));
    const R = 140, pace = 3.5, HOURS = 3;
    const samples = [];
    let minutesWithAChestInReach = 0;
    for (let s = 1; s <= HOURS * 3600; s++) {
      const a = (s * pace) / R;
      const px = R * Math.cos(a), pz = R * Math.sin(a);
      placePlayer(px, pz);
      act(() => { vi.advanceTimersByTime(1000); });
      samples.push(periodic().length);
      if (s % 60 === 0 && periodic().some((c) => hDist({ x: c.position[0], z: c.position[2] }, px, pz) <= 120)) minutesWithAChestInReach += 1;
    }
    const peak = Math.max(...samples);
    const hourPeaks = Array.from({ length: HOURS }, (_, h) => Math.max(...samples.slice(h * 3600, (h + 1) * 3600)));
    console.log(`[L9] circled a ${R} m ring for ${HOURS} h: periodic chests peaked at ${peak} (maximum ${BOARD_MAX}), per hour ${JSON.stringify(hourPeaks)}; a chest within reach (120 m) in ${minutesWithAChestInReach}/${HOURS * 60} minutes`);
    expect(samples, 'the walk sampled something other than every second').toHaveLength(HOURS * 3600);
    expect(peak, 'the board never passed the nominal five: the walk is not the scenario the maximum is for').toBeGreaterThan(CHEST_BOUND);
    expect(peak, 'a player circling the ring left the board past its maximum').toBeLessThanOrEqual(BOARD_MAX);
    expect(minutesWithAChestInReach, 'the maximum starved the player of a chest within reach').toBeGreaterThanOrEqual(HOURS * 60 * 0.9);
  }, 240000);

  // THE CALL SITE. The helper's radius is pinned in chestBoard.test.js; this pins the number the SPAWNER hands it. Every chest
  // is placed 40 m due west of the player (Math.random 0.5), so the geometry is set by where the player stands, not by luck.
  it('the spawner counts a chest within 120 m and no farther: one 100 m away still holds its slot, one 145 m away does not', () => {
    Math.random.mockImplementation(() => 0.5);
    const { result } = renderHook(() => useTreasureChests());
    const periodic = () => result.current.chests.filter((c) => !c.shrine && !result.current.openedChestIds.has(c.id));
    const dists = (x) => periodic().map((c) => hDist({ x: c.position[0], z: c.position[2] }, x, 0));
    const seconds = (n) => { for (let s = 0; s < n; s++) act(() => { vi.advanceTimersByTime(1000); }); };
    seconds(150);
    expect(periodic(), 'the board never filled at the spawn: the fixture is not the scenario').toHaveLength(CHEST_BOUND);

    // 75-100 m away: past the 60 m a miscounting spawner might use, inside 120 m. The board is full, so nothing spawns.
    placePlayer(60, 0);
    expect(Math.min(...dists(60)), 'the fixture is not past 60 m').toBeGreaterThan(60);
    expect(Math.max(...dists(60)), 'the fixture is not within 120 m').toBeLessThanOrEqual(120);
    seconds(150);
    expect(periodic(), 'a chest 75-100 m away stopped holding its slot').toHaveLength(CHEST_BOUND);

    // 145-170 m away: past the count radius, inside the retire radius. Every chest on the board is out of reach, so the next
    // tick spawns one beside the player, and the old five stay on the board.
    placePlayer(130, 0);
    expect(Math.min(...dists(130)), 'the fixture is not past 120 m').toBeGreaterThan(120);
    expect(Math.max(...dists(130)), 'the fixture is not inside the retire radius').toBeLessThan(240);
    seconds(35);
    expect(periodic().filter((c) => hDist({ x: c.position[0], z: c.position[2] }, 130, 0) <= 60), 'no chest was spawned though every chest on the board was past 120 m').toHaveLength(1);
    expect(periodic(), 'the chests past 120 m, inside 240 m, left the board').toHaveLength(CHEST_BOUND + 1);
  }, 180000);
});
