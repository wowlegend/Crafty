// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act, cleanup, fireEvent, screen } from '@testing-library/react';

/**
 * THE SQUAD IS SAVED WITH ITS WORLD (deep audit 2026-10-30, lane L3; AUDIT:verbs:squad-not-saved-and-leaks-across-worlds,
 * the persistence half; spec docs/superpowers/specs/2026-06-10-crafty-s2b3-soulbind-design.md: "the squad ROSTER
 * (types/hybrid ids) persists in the save progression slice (positions don't — respawn at the player on load)").
 *
 * A bound squad (35 ember a bind, 50 more and two creatures for a hybrid) lived only in the ECS, so every reload, every
 * context-loss resume and, since lane L2, every world switch dropped it while the level, coins, ember and talents came
 * back. Here a squad is bound and fused with the real allegiance and fusion code, the real App's autosave writes the
 * world, and the next page load (vi.resetModules: a new module graph, an empty ECS, as a reload gives) boots it through
 * the real entry (startGame.jsx). The squad must stand at the player again, each creature the one a bind or a fusion
 * makes, and a new world must start with none.
 *
 * The 3D scene is stood in (the squad's frame loop is not the subject: its bodies are); the reload is a module function
 * the stand-in records, and the test runs the next page load as the browser would.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, receipts in the commit.
 */

vi.mock('../../src/GameScene', () => ({ GameScene: () => { globalThis.__worldRan?.(); return null; } }));
vi.mock('../../src/HUD', () => ({ HUD: () => null }));
vi.mock('../../src/ui/TouchControls', () => ({ default: () => null }));
vi.mock('../../src/ui/DebugOverlay', () => ({ DebugOverlay: () => null }));
vi.mock('../../src/devtest/PerfProbeRunner', () => ({ PerfProbeRunner: () => null }));
vi.mock('../../src/devtest/devBridge.js', () => ({ installDevBridge: () => {} }));
vi.mock('../../src/render/TitleDiorama.jsx', () => ({ TitleDiorama: () => null }));
vi.mock('../../src/render/dragonLoader.js', () => ({ preloadDragon: () => {}, shouldPreloadAtMount: () => false }));
vi.mock('../../src/SoundManager', () => ({
  SoundProvider: ({ children }) => children,
  useSounds: () => ({ musicEnabled: false, playBackgroundMusic: () => {}, resumeAudio: () => {} }),
  useGameSounds: () => ({ playAttack: () => {}, playSwing: () => {}, playHit: () => {}, playDefeat: () => {} }),
}));
vi.mock('../../src/game/pageReload.js', () => ({ reloadPage: () => { globalThis.__reloads.push(sessionStorage.getItem('crafty.boot')); } }));

const AUTOSAVE_MS = 5000; // App.jsx's delay
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });
const SPOT = { x: 40, y: 30, z: -12 };

async function pageLoad() {
  vi.resetModules();
  const { useGameStore } = await import('../../src/store/useGameStore');
  const { startGame } = await import('../../src/startGame.jsx');
  const saves = await import('../../src/game/worldSaves.js');
  const ecsWorld = await import('../../src/ecs/world.js');
  const { convertMobToAlly } = await import('../../src/game/allegiance.js');
  const { applyFusion } = await import('../../src/game/hybrids.js');
  const { releaseOverCap } = await import('../../src/game/allegiance.js');
  const { buildSaveData } = await import('../../src/game/saveSchema.js');
  const { MOB_TYPES } = await import('../../src/game/mobTypes.js');
  const THREE = await import('three');
  const boot = await import('../../src/game/worldBoot.js');
  globalThis.__worldRan = () => boot.settleBoot(sessionStorage, useGameStore.getState()._bootAttempt);
  await act(async () => { startGame({ render: (el) => render(el) }); });
  await act(async () => { await Promise.resolve(); });
  let nextId = 100;
  /** A mob as the spawner makes one (systems/SpawnerSystem.jsx), wounded to the snare's low HP, beside the player. */
  const mob = (type) => {
    const c = MOB_TYPES[type];
    return ecsWorld.ecs.add({
      isMob: true, id: nextId++, type, position: new THREE.Vector3(SPOT.x + 2, SPOT.y, SPOT.z + 1), color: c.color,
      health: 5, maxHealth: c.health, speed: c.speed, passive: c.passive, damage: c.damage,
      ...(c.legMode ? { legMode: c.legMode } : {}), targetX: SPOT.x, targetZ: SPOT.z, rotation: 0.5, moveTimer: 1,
      isMoving: false, isAggro: true, lastAttackTime: 0, knockback: null, lastHit: 0,
    });
  };
  return {
    S: () => useGameStore.getState(), useGameStore, saves, ...ecsWorld, convertMobToAlly, applyFusion, releaseOverCap, buildSaveData, mob,
    unload: () => { act(() => { window.dispatchEvent(new Event('beforeunload')); }); cleanup(); },
  };
}

// What a creature IS, without where it stands or its per-session AI state: the fields a bind or a fusion sets.
const TRANSIENT = new Set(['id', 'position', 'rotation', 'moveTimer', 'targetX', 'targetZ', 'lastAllyAttack', 'lastAttackTime', 'isMoving', 'knockback', 'lastHit', 'snapSync']);
const identity = (e) => Object.fromEntries(Object.entries(e).filter(([k]) => !TRANSIENT.has(k)).sort(([a], [b]) => a.localeCompare(b)));
const byType = (list) => [...list].sort((a, b) => a.type.localeCompare(b.type));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
  localStorage.clear();
  sessionStorage.clear();
  globalThis.__reloads = [];
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('a bound squad comes back with its world, at the player, and a new world has none', () => {
  it('bind a spider and a zombie, fuse them, bind a skeleton; save; reload: the hybrid and the skeleton stand at the player', async () => {
    let p = await pageLoad();
    act(() => { p.useGameStore.setState({ playerPosition: SPOT, level: 14, unlockedTalents: { soulbind_snare: 1 } }); });
    fireEvent.click(screen.getByTestId('title-start'));
    let bound;
    act(() => {
      const spider = p.convertMobToAlly(p.ecs, p.mob('spider'));
      const zombie = p.convertMobToAlly(p.ecs, p.mob('zombie'));
      expect(p.applyFusion(p.ecs, spider, zombie), 'SETUP: the fusion made no hybrid').toBeTruthy();
      p.convertMobToAlly(p.ecs, p.mob('skeleton'));
      bound = byType(p.alliesQuery.entities).map(identity);
    });
    expect(bound.map((e) => e.type), 'SETUP: the squad is not the one bound').toEqual(['dreadweaver', 'skeleton']);
    advance(AUTOSAVE_MS + 200);
    const id = p.S()._sessionWorldId;
    expect(id, 'SETUP: the autosave wrote no slot').toBeTruthy();
    const saved = p.saves.readWorld(id);
    expect(saved?.progression?.squad, 'the save holds no squad roster').toEqual(expect.arrayContaining([{ type: 'dreadweaver' }, { type: 'skeleton' }]));
    expect(saved.progression.squad).toHaveLength(2);
    p.unload();

    // The reload: a plain visit continues the world just saved.
    p = await pageLoad();
    expect(p.S().level, 'SETUP: the boot did not load the saved world (the instrument sees a restore)').toBe(14);
    const back = byType(p.alliesQuery.entities);
    expect(back.map((e) => e.type), 'the squad did not come back with its world').toEqual(['dreadweaver', 'skeleton']);
    expect(back.map(identity), 'a creature came back other than the one bound').toEqual(bound);
    for (const a of back) {
      expect(typeof a.position?.clone, `${a.type}'s position is not a Vector3 (MobModel drives the mesh with Vector3 ops)`).toBe('function');
      expect(Math.hypot(a.position.x - SPOT.x, a.position.z - SPOT.z), `${a.type} did not come back at the player`).toBeLessThan(8);
    }
    expect(new Set(back.map((a) => a.id)).size, 'two creatures share an id').toBe(2);
    expect(p.mobsQuery.entities.filter((e) => e.isAlly), 'a rebuilt creature is hostile').toEqual([]);
    // Played on and saved again, the roster is the same two: the rebuild did not double it.
    fireEvent.click(screen.getByTestId('title-continue'));
    act(() => { p.S().addCoins(1); });
    advance(AUTOSAVE_MS + 200);
    expect(p.saves.readWorld(id).progression.squad, 'the second save doubled or lost the roster').toHaveLength(2);

    // New World from the title of a third page: a fresh world, no squad.
    p.unload();
    p = await pageLoad();
    expect(p.alliesQuery.entities.length, 'SETUP: the third page did not bring the squad back').toBe(2);
    fireEvent.click(screen.getByTestId('title-new-world'));
    expect(globalThis.__reloads.at(-1), 'SETUP: New World did not reload').toBeTruthy();
    p.unload();
    p = await pageLoad();
    expect(p.S().level, 'SETUP: New World did not boot a fresh world').toBe(1);
    expect(p.alliesQuery.entities.length, 'the new world started with the old world\'s squad').toBe(0);
    expect(p.S().squad, 'the new world\'s roster is not empty').toEqual([]);
    p.unload();
  }, 60000);

  it('a rebuilt creature starts just outside the follow ring at the player\'s feet, and on its own floor where that is known', async () => {
    vi.resetModules();
    const { useGameStore } = await import('../../src/store/useGameStore');
    const { alliesQuery } = await import('../../src/ecs/world.js');
    const { installSquadPersistence } = await import('../../src/world/squadPersistence.js');
    const { FOLLOW_RING } = await import('../../src/game/squadAI.js');
    // A load's player position is the save's: the base capsule's centre (game/saveSchema.js savePosition), 0.9 m over its
    // lower end, so these feet are at 20.05. The camera would be 0.67 m over the centre.
    const CENTRE = { x: 40, y: 20.95, z: -12 };
    const FEET = 20.05;
    const squad = [{ type: 'zombie' }, { type: 'skeleton' }, { type: 'dreadweaver' }];
    useGameStore.setState({ squad, playerPosition: CENTRE, getMobFloor: null, getMobGroundLevel: null });
    let off = installSquadPersistence(useGameStore);
    expect(alliesQuery.entities.map((a) => a.type), 'SETUP: the roster was not rebuilt').toEqual(squad.map((e) => e.type));
    for (const a of alliesQuery.entities) {
      expect(Math.hypot(a.position.x - CENTRE.x, a.position.z - CENTRE.z), `${a.type} is not just outside the follow ring`)
        .toBeCloseTo(FOLLOW_RING.max + 1, 6);
      expect(a.position.y, `${a.type}, no floor known: not standing at the player's feet`).toBeCloseTo(FEET + 0.5, 6);
    }
    off();
    // The floor known, and different in two columns: each creature stands half a block over its own (SquadAISystem.jsx).
    const askedFrom = [];
    const floorAt = (x) => (x > CENTRE.x ? 18 : 21);
    useGameStore.setState({ getMobFloor: (x, z, feet) => { askedFrom.push(feet); return floorAt(x); } });
    off = installSquadPersistence(useGameStore);
    expect(alliesQuery.entities.filter((a) => a.position.x > CENTRE.x), 'SETUP: no creature on the lower column').toHaveLength(1);
    for (const a of alliesQuery.entities) {
      expect(a.position.y, `${a.type} is not on its floor`).toBeCloseTo(floorAt(a.position.x) + 0.5, 6);
    }
    expect(askedFrom, 'the floor was not looked for from the player\'s feet').toHaveLength(3);
    for (const f of askedFrom) expect(f).toBeCloseTo(FEET, 6);
    off();
  });

  it('in one page: the cap\'s release writes the roster, a load in place stands the loaded squad, and a new world none', async () => {
    const p = await pageLoad();
    act(() => { p.useGameStore.setState({ playerPosition: SPOT }); });
    fireEvent.click(screen.getByTestId('title-start'));
    act(() => { for (const t of ['zombie', 'skeleton', 'spider']) p.convertMobToAlly(p.ecs, p.mob(t)); });
    expect(p.S().squad.map((e) => e.type).sort(), 'SETUP: the binds did not reach the roster').toEqual(['skeleton', 'spider', 'zombie']);
    act(() => { p.releaseOverCap(p.ecs, p.alliesQuery.entities, 2); });
    expect(p.S().squad.map((e) => e.type), 'the cap released a creature and the roster kept it').toHaveLength(2);
    const other = p.buildSaveData(p.useGameStore.getInitialState(), { position: { x: -30, y: 25, z: 60 } });
    other.progression = { ...other.progression, squad: [{ type: 'cow' }, { type: 'bonehide_bulwark' }, { type: 'villager' }, { type: 'dragon' }, 7] };
    act(() => { p.S().loadWorldData(other); });
    expect(byType(p.alliesQuery.entities).map((e) => e.type), 'the load in place kept the old squad, or stood another')
      .toEqual(['bonehide_bulwark', 'cow']);
    expect(p.alliesQuery.entities.every((a) => Math.hypot(a.position.x + 30, a.position.z - 60) < 8), 'the loaded squad is not at the loaded player').toBe(true);
    expect(p.S().squad, 'the roster after the load is not the loaded one, without what no squad can hold').toEqual([{ type: 'cow' }, { type: 'bonehide_bulwark' }]);
    act(() => { p.S().startNewWorld(null); });
    expect(p.alliesQuery.entities.length, 'a new world in place kept the squad').toBe(0);
    expect(p.S().squad).toEqual([]);
    p.unload();
  }, 60000);
});
