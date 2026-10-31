// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { useGameStore } from '../store/useGameStore.jsx';
import { useBossSystem, lookbookDragonSpot } from './bossSystem.js';
import { blightHeartSite } from './blightHeart.js';
import { installLookbookSeam, _resetLookbookForTest } from '../render/lookbookSeam.js';
import { lookbookDragonHold } from '../render/lookbookState.js';
import { setActive, getActiveSnapshot } from '../input/inputState.js';
import { cycleFraction } from '../game/dayPhase.js';

// THE LOOKBOOK'S DRAGON, BOTH HALVES (DECISIONS 2026-10-30 item 122). The production build's only way to wake the
// dragon past the fight's level and lair gates is world/bossSystem.js's lookbookSpawnDragon, installed only when the
// page URL carries ?lookbook=1; the seam's dragon() reaches it through the store, as index.jsx wires it. Driven here
// against the real hook and the real seam. That BossEntity honours the hold in a running game is
// tests/e2e/lookbook-seam.spec.js's.
//
// Mutation-Proof: via scripts/dev/mutate.sh, each observed RED, with an identity mutant (a comment edit) GREEN:
//   B2 the spawn installed without the parameter -> "a page without ?lookbook=1 has no dragon spawn"
//   B3 the default height over the ground ignored (the ground itself) -> "over the ground at its spot"
//   B5 the spot at the lair's centre (inside its monolith) -> "inside or against the lair's monolith"
//   B4 an unloaded lair's ground let through (spawned at NaN) -> "refuses while the lair's ground is unknown"
const lair = blightHeartSite();
const at = (search) => window.history.replaceState(null, '', `/${search}`);

beforeEach(() => {
  _resetLookbookForTest();
  useGameStore.setState({ bossHealth: 700, bossActive: false, bossDefeated: false, bossTier: 0, gameWon: false,
    isCaptureMode: false, hitstopUntil: 0, hitstopStart: 0, addNotification: vi.fn(), getMobGroundLevel: null,
    playerPosition: { x: 0, y: 60, z: 0 }, lookbookSpawnDragon: null });
});
afterEach(() => { cleanup(); at(''); _resetLookbookForTest(); });

describe('the lookbook spawn exists only on a ?lookbook=1 page', () => {
  it('a page without ?lookbook=1 has no dragon spawn', () => {
    at('?perf=A');
    renderHook(() => useBossSystem(1));
    expect(useGameStore.getState().lookbookSpawnDragon).toBeNull();
  });

  it('with it, the seam wakes a live dragon where asked, past the level gate, and holds the pose', () => {
    at('?lookbook=1');
    const hook = renderHook(() => useBossSystem(1));
    expect(typeof useGameStore.getState().lookbookSpawnDragon, 'the spawn is missing on a ?lookbook=1 page').toBe('function');
    const w = { location: { search: '?lookbook=1' } };
    installLookbookSeam(w, { store: useGameStore, setActive, getActive: getActiveSnapshot, cycleOf: cycleFraction,
      glInfo: () => null, contextLosses: () => 0, spawnDragon: (o) => useGameStore.getState().lookbookSpawnDragon?.(o) });
    act(() => { w.__craftyLookbook.dragon({ pose: 'rest', position: [12, 70, -8] }); });
    hook.rerender();
    expect(hook.result.current.bossActive).toBe(true);
    expect(useGameStore.getState().bossActive).toBe(true);
    expect(useGameStore.getState().getBossPosition()).toEqual([12, 70, -8]);
    expect(lookbookDragonHold()).toBe('rest');
    expect(w.__craftyLookbook.info().dragon).toEqual({ active: true, hold: 'rest', position: [12, 70, -8] });
  });

  it('with no position it wakes beside the lair, over its ground, and refuses while the lair\'s ground is unknown', () => {
    at('?lookbook=1');
    renderHook(() => useBossSystem(1));
    const spawn = () => useGameStore.getState().lookbookSpawnDragon({});
    expect(spawn, 'refuses with no ground reader').toThrow(/ground/);
    // An unloaded chunk answers null (world/Terrain.jsx getMobGroundLevel), the shape a lookbook run meets first.
    useGameStore.setState({ getMobGroundLevel: () => null });
    expect(spawn, 'refuses while the lair\'s ground is unknown').toThrow(/ground/);
    expect(useGameStore.getState().bossActive).toBe(false);
    const [sx, sz] = lookbookDragonSpot();
    useGameStore.setState({ getMobGroundLevel: (x, z) => (x === sx && z === sz ? 41 : null) });
    let woke;
    act(() => { woke = spawn(); });
    expect([woke.position[0], woke.position[2]]).toEqual([sx, sz]);
    expect(woke.position[1], 'over the ground at its spot, in the air where its first phase flies').toBeGreaterThan(41 + 8);
    expect(woke.position[1]).toBeLessThan(41 + 16);
    // Clear of the lair's monolith (9 m across, world/Terrain.jsx BlightMonolith), on the side the player walks in from.
    const off = Math.hypot(sx - lair.x, sz - lair.z);
    expect(off, 'inside or against the lair\'s monolith').toBeGreaterThan(9);
    expect(off).toBeLessThan(24);
    expect(Math.hypot(sx, sz)).toBeLessThan(Math.hypot(lair.x, lair.z));
    expect(useGameStore.getState().bossActive).toBe(true);
  });
});
