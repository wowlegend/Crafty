import { describe, it, expect, beforeEach, vi } from 'vitest';

// THE FIRST NIGHT'S STORE SEAMS (W3-A task script, unit U1; DECISIONS 2026-11-01 (W3-A PR C) item 496). The night's later
// units (the kindle, the siege director, the flame, the dawn rush, regeneration, the lights) read and write the store
// through these fields, so each is pinned here before any of them exists:
//   - hearthLit: saved; a save without it reads lit.
//   - lastNightfall { night, gameTime }: written only by setGameTime's crossing into night; never by a load, a jump of
//     the clock or a direct nightCount write; nulled by a load.
//   - lastHurtAt: the WORLD clock (game/worldClock.js worldNow) at the last hit, so a frozen world holds it.
//   - lanterns: the placed lanterns' cells, kept with worldBlocks by a place, a mine and a load (world/lanternIndex.js).
//     No lantern block exists until unit L2 (block 16), so this file gives BLOCK_ID one, as L2 will.
//   - hearthFlame (quarter steps), siege, dawnRush and startDawnRush(): never saved; a load resets them.
// Mutation-proven in the commit that adds it (its Mutation-Proof trailer).
// NOT CHECKED HERE: the readers (the units that build them), and the bus events at the same crossings (night-bus-gates).
vi.mock('../../src/world/blockIds.js', async (orig) => {
  const real = await orig();
  return { ...real, BLOCK_ID: Object.freeze({ ...real.BLOCK_ID, lantern: 16 }) };
});
const { useGameStore } = await import('../../src/store/useGameStore.jsx');
const { buildSaveData, PERSISTED_KEYS } = await import('../../src/game/saveSchema.js');
const { tickWorldClock, worldNow } = await import('../../src/game/worldClock.js');
const { setActive } = await import('../../src/input/inputState.js');
const { HALF_CYCLE_UNITS } = await import('../../src/game/dayNight.js');

const INITIAL = useGameStore.getInitialState();
const LANTERN = 16;
/** A save of the initial world with `game_state` and `world_data` fields replaced. */
const saveWith = ({ game = {}, blocks } = {}) => {
  const save = buildSaveData(INITIAL, { position: { x: 0, y: 18, z: 0 } });
  Object.assign(save.game_state, game);
  if (blocks) save.world_data.blocks = blocks;
  return save;
};
const keysDeep = (v, out = new Set()) => {
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out); }
  return out;
};

beforeEach(() => {
  useGameStore.setState(INITIAL, true);
  setActive(false);
});

describe('hearthLit', () => {
  it('starts lit, is saved, and a save without it reads lit while one saying cold reads cold', () => {
    expect(useGameStore.getState().hearthLit, 'the store does not start with the Hearth lit').toBe(true);
    expect(PERSISTED_KEYS, 'hearthLit is not among the saved keys').toContain('hearthLit');
    useGameStore.setState({ hearthLit: false });
    expect(buildSaveData(useGameStore.getState()).game_state.hearthLit, 'the save does not record a cold Hearth').toBe(false);

    const without = saveWith();
    delete without.game_state.hearthLit;
    useGameStore.setState({ hearthLit: false });
    useGameStore.getState().loadWorldData(without);
    expect(useGameStore.getState().hearthLit, 'a save without hearthLit did not read lit').toBe(true);

    useGameStore.getState().loadWorldData(saveWith({ game: { hearthLit: false } }));
    expect(useGameStore.getState().hearthLit, 'a save holding a cold Hearth did not load cold').toBe(false);
    useGameStore.getState().loadWorldData(saveWith({ game: { hearthLit: true } }));
    expect(useGameStore.getState().hearthLit).toBe(true);
  });
});

describe('lastNightfall', () => {
  it('stays null through a night-save load, a clock jump and a direct nightCount write; a 1-unit tick across dusk sets it', () => {
    const s = () => useGameStore.getState();
    expect(s().lastNightfall, 'SETUP: a fresh store holds a nightfall').toBeNull();
    s().loadWorldData(saveWith({ game: { gameTime: HALF_CYCLE_UNITS + 100, isDay: false } }));
    expect(s().isDay, 'SETUP: the night save did not load into night').toBe(false);
    expect(s().lastNightfall, 'a load into night wrote a nightfall').toBeNull();
    s().setTimeOfDay(0.75);
    s().setTimeOfDay(0.1);
    expect(s().lastNightfall, 'setTimeOfDay wrote a nightfall').toBeNull();
    useGameStore.setState({ nightCount: 5 });
    expect(s().lastNightfall, 'a direct nightCount write wrote a nightfall').toBeNull();

    useGameStore.setState({ gameTime: HALF_CYCLE_UNITS - 1, isDay: true, nightCount: 2 });
    s().setGameTime(HALF_CYCLE_UNITS - 0.5);
    expect(s().lastNightfall, 'a tick short of dusk wrote a nightfall').toBeNull();
    s().setGameTime(HALF_CYCLE_UNITS + 0.5);
    expect(s().isDay, 'SETUP: the tick did not cross into night').toBe(false);
    expect(s().lastNightfall, 'the crossing into night did not record night 3 at its time').toEqual({ night: 3, gameTime: HALF_CYCLE_UNITS + 0.5 });

    s().setGameTime(2 * HALF_CYCLE_UNITS + 1);
    expect(s().isDay, 'SETUP: the tick did not cross into day').toBe(true);
    expect(s().lastNightfall, 'the crossing into day moved the nightfall').toEqual({ night: 3, gameTime: HALF_CYCLE_UNITS + 0.5 });
    s().loadWorldData(saveWith());
    expect(s().lastNightfall, 'a load kept the last world\'s nightfall').toBeNull();
  });
});

describe('lastHurtAt', () => {
  it('is the world clock at the hit, and a frozen world holds it', () => {
    const s = () => useGameStore.getState();
    useGameStore.setState({ isAlive: true, _spawnTime: 0, damageLockouts: {}, isPlayerInvincible: () => false, triggerHitstop: () => {},
      hitstopUntil: 0, hitstopStart: 0, hitstopFrozenTotal: 0, gameStarted: true });
    setActive(true);
    tickWorldClock(900_000);
    const at = worldNow();
    expect(s().lastHurtAt ?? null, 'SETUP: a hit is recorded before any hit').toBeNull();
    s().damagePlayer(10, 'test');
    expect(s().lastHitDir, 'SETUP: the hit was refused').not.toBeNull();
    expect(s().lastHurtAt, 'the hit is not stamped on the world clock').toBe(at);

    setActive(false); // the gate down with play begun: the world pauses (worldClock isPlayPaused)
    tickWorldClock(900_001);
    tickWorldClock(960_000);
    expect(worldNow() - s().lastHurtAt, 'the world clock ran on while the world was frozen, so calm would count it').toBeLessThan(5);
    setActive(true);
    tickWorldClock(960_001);
    tickWorldClock(965_000);
    expect(worldNow() - s().lastHurtAt, 'SETUP: the world clock did not run once play resumed').toBeGreaterThan(4_000);
  });
});

describe('the lantern index', () => {
  it('is kept by a place, a mine and a load', () => {
    const s = () => useGameStore.getState();
    expect(s().lanterns, 'SETUP: a fresh store holds lanterns').toEqual([]);
    const placed = new Map([['0_5_0', 1], ['3_10_-4', LANTERN]]);
    s().setWorldBlocks(placed);
    expect(s().lanterns, 'a placed lantern is not in the index').toEqual([{ x: 3, y: 10, z: -4 }]);
    const one = s().lanterns;
    s().setWorldBlocks(new Map([...placed, ['1_5_0', 3]]));
    expect(s().lanterns, 'an edit that moved no lantern replaced the index').toBe(one);
    s().setWorldBlocks(new Map([...placed, ['1_5_0', 3], ['-8_7_2', LANTERN]]));
    expect(s().lanterns.map((c) => `${c.x}_${c.y}_${c.z}`), 'a second lantern is not in the index').toEqual(['3_10_-4', '-8_7_2']);
    s().setWorldBlocks(new Map([...placed, ['1_5_0', 3], ['-8_7_2', LANTERN], ['3_10_-4', 0]]));
    expect(s().lanterns, 'a mined lantern stayed in the index').toEqual([{ x: -8, y: 7, z: 2 }]);

    s().loadWorldData(saveWith({ blocks: [['7_9_7', LANTERN], ['2_2_2', 1]] }));
    expect(s().lanterns, 'a load did not rebuild the index from the save\'s blocks').toEqual([{ x: 7, y: 9, z: 7 }]);
    s().loadWorldData(saveWith({ blocks: [] }));
    expect(s().lanterns, 'a load of a world with no lantern kept the last world\'s').toEqual([]);
  });
});

describe('the night\'s unsaved fields', () => {
  it('hearthFlame steps in quarters, up to the next one, and writes only on a change', () => {
    const s = () => useGameStore.getState();
    expect(s().hearthFlame, 'SETUP: the flame does not start full').toBe(1);
    const steps = [[0.9, 1], [0.74, 0.75], [0.5, 0.5], [0.26, 0.5], [0.1, 0.25], [0.0001, 0.25], [0, 0], [-1, 0], [2, 1]];
    for (const [f, want] of steps) {
      s().setHearthFlame(f);
      expect(s().hearthFlame, `a flame of ${f} is stored as ${s().hearthFlame}, not ${want}`).toBe(want);
    }
    expect(steps.length).toBe(9);
    let writes = 0;
    const off = useGameStore.subscribe(() => { writes += 1; });
    s().setHearthFlame(0.6);
    s().setHearthFlame(0.7);
    s().setHearthFlame(0.55);
    off();
    expect(writes, 'three flames in one quarter wrote the store more than once').toBe(1);
  });

  it('startDawnRush starts a rush at night only, and the crossing into day ends it', () => {
    const s = () => useGameStore.getState();
    expect(s().dawnRush, 'SETUP: a fresh store holds a rush').toBeNull();
    useGameStore.setState({ gameTime: 100, isDay: true });
    s().startDawnRush();
    expect(s().dawnRush, 'a rush started by day').toBeNull();
    useGameStore.setState({ gameTime: HALF_CYCLE_UNITS + 300, isDay: false, nightCount: 1 });
    s().startDawnRush();
    expect(s().dawnRush, 'the rush did not record its night and start').toEqual({ night: 1, startedAt: HALF_CYCLE_UNITS + 300 });
    const rush = s().dawnRush;
    s().startDawnRush();
    expect(s().dawnRush, 'a second start replaced the rush in progress').toBe(rush);
    s().setGameTime(2 * HALF_CYCLE_UNITS + 1);
    expect(s().isDay, 'SETUP: the tick did not cross into day').toBe(true);
    expect(s().dawnRush, 'the crossing into day did not end the rush').toBeNull();
  });

  it('none of them, nor the derived index and the clocks, is saved, and a load resets them', () => {
    const s = () => useGameStore.getState();
    useGameStore.setState({ siege: { night: 1, bearings: [1.2], wave: 2, captainId: 'SIEGE-MARK' },
      dawnRush: { night: 1, startedAt: 'RUSH-MARK' }, hearthFlame: 0.25, lastNightfall: { night: 1, gameTime: 'NIGHTFALL-MARK' },
      lastHurtAt: 123, lanterns: [{ x: 1, y: 2, z: 3 }] });
    const save = buildSaveData(s());
    const keys = keysDeep(save);
    const unsaved = ['siege', 'dawnRush', 'hearthFlame', 'lastNightfall', 'lastHurtAt', 'lanterns'];
    expect(keys.has('hearthLit'), 'SETUP: the key walk does not reach game_state').toBe(true);
    expect(unsaved.filter((k) => keys.has(k) || PERSISTED_KEYS.includes(k)), 'an unsaved night field is in the save').toEqual([]);
    const text = JSON.stringify(save);
    expect(['SIEGE-MARK', 'RUSH-MARK', 'NIGHTFALL-MARK'].filter((m) => text.includes(m)), 'a night field\'s value is in the save').toEqual([]);

    s().loadWorldData(save);
    expect({ siege: s().siege, dawnRush: s().dawnRush, hearthFlame: s().hearthFlame },
      'a load kept the last world\'s siege, rush or flame').toEqual({ siege: null, dawnRush: null, hearthFlame: 1 });
  });
});
