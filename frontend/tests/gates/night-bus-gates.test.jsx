// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { render, cleanup } from '@testing-library/react';

/**
 * THE FIRST NIGHT'S MOMENTS ON THE EVENT BUS (W3-A task script, unit U1; DECISIONS 2026-11-01 (W3-A PR C) item 497). The
 * night's units react to moments other systems know, so each producer is driven here through the real system:
 *   - nightfall and dawn: setGameTime's crossings (the store), each once, after the write (a subscriber reads the store
 *     already across), and never a load, a clock jump or a direct nightCount write (the same rule lastNightfall keeps,
 *     tests/store/night-seams.test.js);
 *   - the kill bus's fourth argument: the dying entity itself, from systems/CombatSystem.jsx damageMob, so the siege can
 *     tell its captain by id;
 *   - windupStart: systems/AIWorkerSystem.jsx, on a worker reply whose windup is new (its Web Worker stubbed, the reply
 *     handed to it), once per windup, at the mob's position after the reply's ground snap (a floor stubbed under it),
 *     and not for a windup a perfect dodge's stagger cancels.
 * siegeWave and siegeBroken are named for their units (N5, N6a), which emit them; only their names are pinned here.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh; the mutants and their reds are in the commit that adds this file.
 * NOT CHECKED HERE: any subscriber (S1's voices, the director); the windup's timing (attack-telegraph-gates).
 */
vi.mock('@react-three/fiber', () => import('@react-three/fiber/dist/react-three-fiber.esm.js'));
vi.mock('../../src/SoundManager', () => ({ useGameSounds: () => ({ playHit: () => {} }) }));
const worker = vi.hoisted(() => ({ live: null }));
vi.mock('../../src/workers/ai.worker.js?worker', () => ({
  default: class FakeAIWorker {
    constructor() { worker.live = this; }
    postMessage() {}
    terminate() {}
  },
}));
const { mountR3F } = await import('./_r3f.jsx');
const { AIWorkerSystem } = await import('../../src/systems/AIWorkerSystem.jsx');
const { CombatSystem } = await import('../../src/systems/CombatSystem.jsx');
const { GameMethods } = await import('../../src/GameMethods');
const { useGameStore } = await import('../../src/store/useGameStore.jsx');
const { buildSaveData } = await import('../../src/game/saveSchema.js');
const { EVENTS, on } = await import('../../src/game/eventBus.js');
const { subscribeMobKill } = await import('../../src/game/mobKillBus.js');
const { ecs } = await import('../../src/ecs/world.js');
const { MOB_TYPES } = await import('../../src/game/mobTypes.js');
const { HALF_CYCLE_UNITS } = await import('../../src/game/dayNight.js');
const { worldNow } = await import('../../src/game/worldClock.js');

const INITIAL = useGameStore.getInitialState();
const offs = [];
/** What `name` delivers from here on: each emit's first `arity` arguments (the bus always passes four). */
const heard = (name, arity) => { const got = []; offs.push(on(name, (...args) => got.push(args.slice(0, arity)))); return got; };
let r = null;
beforeEach(() => { useGameStore.setState(INITIAL, true); });
afterEach(async () => {
  for (const off of offs.splice(0)) off();
  if (r) await r.unmount();
  r = null;
  for (const e of [...ecs.entities]) ecs.remove(e);
  cleanup();
});

describe('nightfall and dawn', () => {
  it('are emitted once at each crossing of the clock, with the night, and never by a load, a jump or a nightCount write', () => {
    expect(['nightfall', 'dawn', 'windupStart', 'siegeWave', 'siegeBroken'].filter((n) => EVENTS[n] !== n), 'the bus does not name the night\'s moments')
      .toEqual([]);
    const falls = heard(EVENTS.nightfall, 2);
    const dawns = heard(EVENTS.dawn, 2);
    const s = () => useGameStore.getState();
    // What a reactor reads of the store when it is told: emitted after the write, it reads the store already across.
    const seen = [];
    for (const name of [EVENTS.nightfall, EVENTS.dawn]) offs.push(on(name, () => seen.push([name, s().isDay, s().nightCount])));
    const night = buildSaveData(INITIAL, { position: { x: 0, y: 18, z: 0 } });
    night.game_state.gameTime = HALF_CYCLE_UNITS + 50;
    s().loadWorldData(night);
    s().setTimeOfDay(0.9);
    s().setTimeOfDay(0.2);
    useGameStore.setState({ nightCount: 4 });
    expect({ falls, dawns }, 'a load, a clock jump or a nightCount write was heard as a crossing').toEqual({ falls: [], dawns: [] });

    useGameStore.setState({ gameTime: HALF_CYCLE_UNITS - 1, isDay: true, nightCount: 1 });
    s().setGameTime(HALF_CYCLE_UNITS - 0.5);
    s().setGameTime(HALF_CYCLE_UNITS + 0.5);
    s().setGameTime(HALF_CYCLE_UNITS + 1);
    expect(falls, 'the crossing into night was not heard once, with night 2 and its time').toEqual([[2, HALF_CYCLE_UNITS + 0.5]]);
    expect(dawns, 'SETUP: a dawn was heard at nightfall').toEqual([]);
    s().setGameTime(2 * HALF_CYCLE_UNITS + 2);
    s().setGameTime(2 * HALF_CYCLE_UNITS + 3);
    expect(dawns, 'the crossing into day was not heard once, with the night it ended and its time').toEqual([[2, 2 * HALF_CYCLE_UNITS + 2]]);
    expect(falls).toHaveLength(1);
    expect(seen, 'a reactor told of the crossing read the store before it (the emit is not after the write)')
      .toEqual([[EVENTS.nightfall, false, 2], [EVENTS.dawn, true, 2]]);
  });
});

describe('the kill bus', () => {
  it('hands its subscribers the dying entity as the fourth argument', () => {
    render(<CombatSystem setDamageNumbers={() => {}} setShockwaves={() => {}} damageId={{ current: 0 }} />);
    const mob = ecs.add({ isMob: true, id: 41, type: 'zombie', passive: false, health: MOB_TYPES.zombie.health,
      maxHealth: MOB_TYPES.zombie.health, xp: MOB_TYPES.zombie.xp, position: new THREE.Vector3(2, 0, 3) });
    const kills = [];
    offs.push(subscribeMobKill((...args) => kills.push(args)));
    GameMethods.damageMob(41, 999, 'physical', 'player');
    expect(kills.length, 'SETUP: the kill was not emitted').toBe(1);
    expect(kills[0].slice(0, 3), 'SETUP: the first three arguments moved').toEqual(['zombie', [2, 0, 3], 'player']);
    expect(kills[0][3], 'the kill bus did not hand over the dying entity').toBe(mob);
  });
});

describe('windupStart', () => {
  /** A worker reply moving mob `id` to `windupUntil`, every other field as the mob holds it. */
  const reply = (e, windupUntil) => ({ data: { type: 'TICK_RESULT', attacks: [], updates: [{
    id: e.id, x: e.position.x, z: e.position.z, rotation: 0, isAggro: true, targetX: 0, targetZ: 0, isMoving: false,
    lastAttackTime: 0, windupUntil, moveTimer: 0, wanderRoll: 0, isCoverSeeking: false, chargeX: 0, chargeZ: 0, chargeAt: 0, chargeReadyAt: 0,
  }] } });

  it('is emitted once when a windup begins, at the mob, and not for a windup held, ended, or cancelled by a stagger', async () => {
    // A floor at y 4 under every column, so the reply's ground snap moves the mob down from y 10 and the voice's place
    // tells a position read after the snap from one read before it.
    useGameStore.setState({ getMobFloor: () => 4, getMobGroundLevel: () => 4 });
    r = await mountR3F(<AIWorkerSystem />);
    expect(worker.live, 'SETUP: the AI system made no worker').not.toBeNull();
    const ups = heard(EVENTS.windupStart, 3);
    const mob = ecs.add({ isMob: true, id: 7, type: 'duskhound', passive: false, isAggro: true, health: 50, maxHealth: 50,
      windupUntil: 0, position: new THREE.Vector3(5, 10, -3) });
    const staggered = ecs.add({ isMob: true, id: 8, type: 'zombie', passive: false, isAggro: true, health: 50, maxHealth: 50,
      windupUntil: 0, staggerUntil: worldNow() + 60_000, position: new THREE.Vector3(-4, 10, 6) });

    const t = worldNow() + 380;
    worker.live.onmessage(reply(mob, t));
    expect(mob.windupUntil, 'SETUP: the reply was not applied to the mob').toBe(t);
    expect(mob.position.y, 'SETUP: the snap did not stand the mob on its floor').toBe(4.5);
    expect(ups.map(([type, at, e]) => [type, at, e === mob]), 'a new windup was not heard once, by type and its snapped place, with its mob')
      .toEqual([['duskhound', [5, 4.5, -3], true]]);
    worker.live.onmessage(reply(mob, t));
    expect(ups.length, 'a windup still winding was heard again').toBe(1);
    worker.live.onmessage(reply(mob, 0));
    worker.live.onmessage(reply(mob, t + 2000));
    expect(ups.length, 'the next windup after a strike was not heard').toBe(2);

    worker.live.onmessage(reply(staggered, t));
    expect(staggered.windupUntil, 'SETUP: the stagger did not cancel the windup').toBe(0);
    expect(ups.length, 'a windup the stagger cancelled was heard').toBe(2);
  });
});
