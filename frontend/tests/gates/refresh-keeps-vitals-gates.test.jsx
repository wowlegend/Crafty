// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup, fireEvent, screen } from '@testing-library/react';

/**
 * A REFRESH IS NO FREE HEAL (AUDIT:numeric:load-mid-fight-full-heal, lane L8's load-heal call). Since lane L2 a refresh
 * resumes the newest save in place, and every load stood the player at full health and mana, so F5 in the middle of a
 * fight was a full heal where the player stood, as often as they liked, with the dragon keeping its wounds. Now a save
 * holds the player's health and mana when they are below the maximum, and a load restores them under the maximum it
 * derives; a save at full holds neither and loads at the maximum, as a new world and a respawn do (a dead player's save
 * is the respawn's, dead-refresh-gates).
 *
 * Each page load is the real entry (startGame.jsx) after vi.resetModules(), jsdom's storage kept as a tab's is: the real
 * boot, the real autosave and its flush on unload, the real damage and mana writers. The HUD, the 3D scene and the
 * title's vista are stood in for.
 * BLIND SPOT: a real browser's unload (the flush is driven by dispatching beforeunload, as the autosave listens for it).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, receipts in the commit:
 *   V1 the load ignores the saved health (full again)                         -> RED expected
 *   V2 plausible-wrong: the load restores health but not mana                  -> RED expected
 *   V3 the save does not record health                                         -> RED expected
 *   V4 a change of health schedules no save (the hit, then F5 at once)         -> RED expected
 *   V5 the load does not cap a saved vital at the derived maximum               -> RED expected
 *   V6 plausible-wrong: a save at full records the placeholder health          -> RED expected (the new world)
 *   V7 plausible-wrong: the mana floor is above 0 (a refresh at no mana refills) -> RED expected
 *   V0 identity (a comment edit)                                               -> must SURVIVE
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
vi.mock('../../src/game/pageReload.js', () => ({ reloadPage: () => {} }));

const AUTOSAVE_MS = 5000; // App.jsx's delay
const SPAWN_GRACE_MS = 5200; // store damagePlayer ignores a hit inside 5000 ms of the spawn
const WORLD = 'local_keep';
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });

async function pageLoad() {
  vi.resetModules();
  const { useGameStore } = await import('../../src/store/useGameStore');
  const { startGame } = await import('../../src/startGame.jsx');
  const boot = await import('../../src/game/worldBoot.js');
  // The world's first frame takes back the boot's attempt (systems/BootSettle.jsx), or the next visit holds the world.
  globalThis.__worldRan = () => boot.settleBoot(sessionStorage, useGameStore.getState()._bootAttempt);
  await act(async () => { startGame({ render: (el) => render(el) }); });
  await act(async () => { await Promise.resolve(); });
  return {
    S: () => useGameStore.getState(),
    initial: () => useGameStore.getInitialState(),
    unload: () => { act(() => { window.dispatchEvent(new Event('beforeunload')); }); cleanup(); },
  };
}
const disk = () => JSON.parse(localStorage.getItem(`crafty_world_save_${WORLD}`) || 'null');
const vitals = (s) => ({ hp: s.playerHealth, mana: s.mana });

/** A level-5 world on disk, `player` its player_data extras, continued from the title. */
async function continueWorld(player = {}) {
  const saves = await import('../../src/game/worldSaves.js');
  const { buildSaveData } = await import('../../src/game/saveSchema.js');
  const { useGameStore } = await import('../../src/store/useGameStore');
  const data = buildSaveData({ ...useGameStore.getInitialState(), level: 5, coins: 40 }, { position: { x: 4.5, y: 40, z: -3.5 } });
  data.player_data = { ...data.player_data, ...player };
  saves.writeWorld(WORLD, { name: 'Keep', created_at: '2026-10-01T00:00:00Z', is_owner: true, saved_at: '2026-10-30T12:00:00Z' }, data);
  const p = await pageLoad();
  expect(p.S()._sessionWorldId, 'SETUP: the visit did not load the world').toBe(WORLD);
  fireEvent.click(screen.getByTestId('title-continue'));
  advance(SPAWN_GRACE_MS); // a hit inside the spawn's grace is ignored (store damagePlayer)
  return p;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a refresh keeps the player\'s health and mana', () => {
  it('hit and cast, F5 at once: the next page has the player as hurt and as spent as they were, and so does the one after', async () => {
    let p = await continueWorld();
    const full = { hp: p.S().maxHealth, mana: p.S().maxMana };
    // PRESENCE: the loaded player stands at the level's own maximum, so a heal after the refresh is visible.
    expect(vitals(p.S()), 'SETUP: a save holding no wound did not load at the maximum').toEqual(full);
    act(() => { p.S().damagePlayer(60, 'gate'); p.S().useMana(40); });
    const left = vitals(p.S());
    expect(left.hp < full.hp && left.mana < full.mana && p.S().isAlive, 'SETUP: the hit or the cast did not land').toBe(true);
    p.unload(); // the refresh, a moment after the hit: the unload flush is the only save

    p = await pageLoad();
    expect(vitals(p.S()), 'the refresh healed the player').toEqual(left);
    expect({ max: [p.S().maxHealth, p.S().maxMana] }, 'SETUP: the level\'s maximum moved').toEqual({ max: [full.hp, full.mana] });
    p.unload(); // a second refresh, nothing played: still no heal

    p = await pageLoad();
    expect(vitals(p.S()), 'a second refresh healed the player').toEqual(left);
    p.unload();
  }, 30000);

  it('a save at full holds no wound and loads full; a healed player saves full again', async () => {
    const p = await continueWorld();
    act(() => { p.S().damagePlayer(30, 'gate'); });
    advance(AUTOSAVE_MS + 200);
    expect(disk().player_data.health, 'the save does not hold the wound').toBe(p.S().playerHealth);
    act(() => { p.S().healPlayer(9999); });
    advance(AUTOSAVE_MS + 200);
    expect('health' in disk().player_data, 'a player at full saved a wound').toBe(false);
    p.unload();
    const q = await pageLoad();
    expect(vitals(q.S()), 'a save at full did not load at the maximum').toEqual({ hp: q.S().maxHealth, mana: q.S().maxMana });
    q.unload();
  }, 30000);

  it('every point of mana spent, then F5: the next page has none, as a living player can (mana is kept from 0)', async () => {
    let p = await continueWorld();
    act(() => { p.S().damagePlayer(20, 'gate'); p.S().useMana(p.S().mana); });
    const left = vitals(p.S());
    expect({ mana: left.mana, alive: p.S().isAlive }, 'SETUP: the cast did not spend every point').toEqual({ mana: 0, alive: true });
    p.unload();
    p = await pageLoad();
    // PRESENCE: the wounded health came back as saved, so the load read this save's vitals.
    expect(vitals(p.S()), 'a refresh at no mana refilled it').toEqual(left);
    p.unload();
  }, 30000);

  it('a saved vital is capped at the maximum the load derives, and one no living player has loads full', async () => {
    let p = await continueWorld({ health: 99999, mana: 99999 });
    expect(vitals(p.S()), 'a vital above the maximum loaded above it').toEqual({ hp: p.S().maxHealth, mana: p.S().maxMana });
    p.unload();
    localStorage.clear();
    p = await continueWorld({ health: 0, mana: 'x' });
    expect(vitals(p.S()), 'a save at no health, or a mana that is no number, loaded so').toEqual({ hp: p.S().maxHealth, mana: p.S().maxMana });
    p.unload();
  }, 30000);

  it('the title\'s New World starts at the level\'s own maximum, not the store\'s placeholder', async () => {
    sessionStorage.setItem('crafty.boot', JSON.stringify({ fresh: true }));
    const p = await pageLoad();
    const s = p.S();
    expect({ hp: s.playerHealth, mana: s.mana }, 'a new world started below its maximum').toEqual({ hp: s.maxHealth, mana: s.maxMana });
    expect(s.maxHealth, 'SETUP: the level-1 maximum is the placeholder, so the case cannot tell').not.toBe(p.initial().maxHealth);
    p.unload();
  }, 30000);
});
