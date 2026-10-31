// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup, fireEvent, screen } from '@testing-library/react';

/**
 * A REFRESH ON THE DEATH SCREEN IS NOT A WAY BACK TO LIFE (L2 review round 1, static F3). A refresh now resumes the
 * newest save in place, and a load then stood the player at full HP, so F5 on the death screen brought the player back alive
 * where they fell: the save written while dead stood them there (saveWorldInPlay saved a dead player as any other),
 * and with nothing pending the reload loaded the last save made alive, a few seconds before the death. Respawn sends
 * the player back to the origin spawn and counts the death (HUD.jsx: respawn, then the quest system's onPlayerDeath).
 * Now the death itself schedules a save (isAlive is an autosave trigger), and a save written while dead is the world
 * as Respawn leaves it (game/saveSchema.js asRespawned): no spot of its own, so the load stands the player at the origin
 * spawn, and the death counted.
 *
 * Each page load is the real entry (startGame.jsx) after vi.resetModules(), jsdom's storage kept as a tab's is; the real
 * autosave, the real quest hook and the real death (store damagePlayer). The HUD, whose Respawn button calls the two
 * writers this test calls, the 3D scene and the title's vista are stood in for.
 * BLIND SPOT: where the origin spawn then stands the player (the Player loop's spawn branch with resumeSpawn null, the
 * same branch Respawn's teleport enters) is the e2e's and the chaos gate's, not this.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, receipts in the commit:
 *   D1 the save written while dead keeps the spot where the player fell      -> RED expected
 *   D2 the save written while dead does not count the death                  -> RED expected
 *   D3 the death schedules no save (isAlive not an autosave trigger)          -> RED expected
 *   D4 plausible-wrong: the death is counted on the live save too (twice)     -> RED expected
 *   D0 identity (a comment edit)                                              -> must SURVIVE
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
const WORLD = 'local_far';
const FELL = { x: 61.5, y: 40, z: -44.5 };
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });

async function pageLoad() {
  vi.resetModules();
  const { useGameStore } = await import('../../src/store/useGameStore');
  const { startGame } = await import('../../src/startGame.jsx');
  const boot = await import('../../src/game/worldBoot.js');
  globalThis.__worldRan = () => boot.settleBoot(sessionStorage, useGameStore.getState()._bootAttempt);
  await act(async () => { startGame({ render: (el) => render(el) }); });
  await act(async () => { await Promise.resolve(); });
  return {
    S: () => useGameStore.getState(),
    unload: () => { act(() => { window.dispatchEvent(new Event('beforeunload')); }); cleanup(); },
  };
}
const disk = () => JSON.parse(localStorage.getItem(`crafty_world_save_${WORLD}`) || 'null');
const deaths = (qs) => qs?.stats?.deaths ?? null;

/** A far world on disk, continued from the title and played: its autosave holds the spot and a living player. */
async function playFar() {
  const saves = await import('../../src/game/worldSaves.js');
  const { buildSaveData } = await import('../../src/game/saveSchema.js');
  const { useGameStore } = await import('../../src/store/useGameStore');
  saves.writeWorld(WORLD, { name: 'Far Reach', created_at: '2026-10-01T00:00:00Z', is_owner: true, saved_at: '2026-10-29T12:00:00Z' },
    buildSaveData({ ...useGameStore.getInitialState(), coins: 40 }, { position: FELL }));
  const p = await pageLoad();
  expect(p.S()._sessionWorldId, 'SETUP: the visit did not load the far world').toBe(WORLD);
  fireEvent.click(screen.getByTestId('title-continue'));
  act(() => { p.S().addCoins(5); });
  advance(AUTOSAVE_MS + 200);
  // PRESENCE: a save made alive holds the spot and the living count, so the instrument can see both change.
  expect({ at: disk().player_data.position, deaths: deaths(disk().questState) }, 'SETUP: the save in play').toEqual({ at: FELL, deaths: 0 });
  return p;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a refresh on the death screen resumes as Respawn would', () => {
  it('F5 at once after the death: the next page has the player alive at the origin spawn, at full health, the death counted', async () => {
    let p = await playFar();
    act(() => { p.S().damagePlayer(99999, 'gate'); });
    expect(p.S().isAlive, 'SETUP: the player did not die').toBe(false);
    p.unload(); // the refresh, a moment after the death: the unload flush is the only save

    p = await pageLoad();
    const s = p.S();
    expect({ alive: s.isAlive, full: s.playerHealth === s.maxHealth, resumeSpawn: s.resumeSpawn },
      'the refresh brought the player back where they fell, not to the origin spawn').toEqual({ alive: true, full: true, resumeSpawn: null });
    expect(deaths(s.questState), 'the refresh skipped the death').toBe(1);
    expect(disk().player_data.position, 'the save written while dead holds the spot where the player fell').toBeUndefined();
    p.unload();
  }, 30000);

  it('dead a while, the autosave writes the respawn; Respawn then counts the death once', async () => {
    const p = await playFar();
    act(() => { p.S().damagePlayer(99999, 'gate'); });
    advance(AUTOSAVE_MS + 200);
    expect({ at: disk().player_data.position, deaths: deaths(disk().questState) },
      'the death wrote no save, or wrote the player alive where they fell').toEqual({ at: undefined, deaths: 1 });
    // Respawn, as HUD.jsx's button does it.
    act(() => { p.S().respawn(); p.S().onPlayerDeath(); });
    expect(deaths(p.S().questState), 'SETUP: Respawn did not count the death').toBe(1);
    act(() => { p.S().addCoins(1); });
    advance(AUTOSAVE_MS + 200);
    expect({ placed: !!disk().player_data.position, deaths: deaths(disk().questState) },
      'the save after Respawn counted the death twice, or lost the player\'s spot').toEqual({ placed: true, deaths: 1 });
    p.unload();
  }, 30000);
});
