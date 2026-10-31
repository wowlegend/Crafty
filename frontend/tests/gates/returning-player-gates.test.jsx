// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act, cleanup, fireEvent, screen } from '@testing-library/react';
import { STRINGS } from '../../src/i18n/strings.js';
import PRE_CUT from '../fixtures/pre-cut-save.json';

/**
 * A RETURNING PLAYER LANDS IN THEIR OWN WORLD (deep audit 2026-10-30, AUDIT:persistence:returning-player-never-resumed;
 * DECISIONS 2026-10-30 items 200-203). Nothing loaded a save at boot: every visit's title offered one button that began a
 * fresh level-1 world, its first autosave minted another Save_<date> slot, and the real world was reachable only through
 * Esc > Settings > Manage Worlds > Load among identical cards.
 *
 * Each "page load" here is what a browser does: vi.resetModules() re-runs every module (a fresh store, a fresh
 * _sessionWorldId, fresh hooks), while jsdom's localStorage and sessionStorage persist as a tab's do. The page starts
 * through the real entry (startGame.jsx: the boot's load, then the render of the real App), with its real title
 * (MenuSystem), its real autosave and the real quest hook. Only renderers jsdom cannot run are stood in for (the 3D scene,
 * the title's vista, the HUD, whose props are recorded), and the page reload, which a gate cannot do: the stand-in
 * counts it and the test runs the next page load itself.
 *
 * BLIND SPOT: that index.jsx calls startGame, and the hold on the loaded spot in a real world, are the e2e's
 * (tests/e2e/continue.spec.js).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, receipts in the commit:
 *   R1 startGame renders without the boot's load                                -> RED expected
 *   R2 plausible-wrong: the plain visit skips the newest world (index 1)        -> RED expected
 *   R3 the autosave saves before Start                                          -> RED expected
 *   R4 the title's Continue never shows                                          -> RED expected
 *   R5 the quest system does not replay the boot's notices                       -> RED expected
 *   R6 plausible-wrong: the New World note is not fresh (reloads the old world)  -> RED expected
 *   R0 identity (a comment edit)                                                 -> must SURVIVE
 */

// The 3D world, stood in, runs: its first frame takes back the boot's attempt (systems/BootSettle.jsx), or the next
// plain visit would hold the world on the title (tests/gates/boot-guard-gates.test.jsx).
vi.mock('../../src/GameScene', () => ({ GameScene: () => { globalThis.__worldRan?.(); return null; } }));
vi.mock('../../src/HUD', () => ({ HUD: (p) => { globalThis.__hudQuest = p.questSystem; return null; } }));
vi.mock('../../src/ui/TouchControls', () => ({ default: () => null }));
vi.mock('../../src/ui/DebugOverlay', () => ({ DebugOverlay: () => null }));
vi.mock('../../src/devtest/PerfProbeRunner', () => ({ PerfProbeRunner: () => null }));
vi.mock('../../src/devtest/devBridge.js', () => ({ installDevBridge: () => {} }));
vi.mock('../../src/render/TitleDiorama.jsx', () => ({ TitleDiorama: () => null }));
// Whole-module stand-ins only: a mock survives vi.resetModules, so one built from the original module would keep the
// first page's store. The dragon's chunk has no part in a save.
vi.mock('../../src/render/dragonLoader.js', () => ({ preloadDragon: () => {}, shouldPreloadAtMount: () => false }));
vi.mock('../../src/SoundManager', () => ({
  SoundProvider: ({ children }) => children,
  useSounds: () => ({ musicEnabled: false, playBackgroundMusic: () => {}, resumeAudio: () => {} }),
  useGameSounds: () => ({ playAttack: () => {}, playSwing: () => {}, playHit: () => {}, playDefeat: () => {} }),
}));
vi.mock('../../src/game/pageReload.js', () => ({ reloadPage: () => { globalThis.__reloads = (globalThis.__reloads || 0) + 1; } }));

const AUTOSAVE_MS = 5000; // App.jsx's delay
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });

/** One page load of the tab: the modules fresh, the storage kept, the real entry. */
async function pageLoad(day) {
  vi.setSystemTime(new Date(`2026-10-${day}T19:00:00Z`));
  vi.resetModules();
  globalThis.__hudQuest = null;
  const { useGameStore } = await import('../../src/store/useGameStore');
  const { startGame } = await import('../../src/startGame.jsx');
  const saves = await import('../../src/game/worldSaves.js');
  const boot = await import('../../src/game/worldBoot.js');
  globalThis.__worldRan = () => boot.settleBoot(sessionStorage, useGameStore.getState()._bootAttempt);
  await act(async () => { startGame({ render: (el) => render(el) }); });
  await act(async () => { await Promise.resolve(); });
  const S = () => useGameStore.getState();
  const disk = () => saves.listWorlds().map((w) => {
    const b = saves.readWorld(w.id);
    return { id: w.id, level: b.progression.level, coins: b.progression.coins, blocks: b.world_data.blocks.length, savedAt: w.saved_at ?? null };
  });
  const unload = () => {
    act(() => { window.dispatchEvent(new Event('beforeunload')); });
    cleanup();
  };
  return { S, disk, unload, saves };
}

const play = (S, { xp = 0, coins = 0, blocks = 0, day = 0 } = {}) => act(() => {
  if (xp) S().grantXP(xp, 'gate');
  if (coins) S().addCoins(coins);
  if (blocks) {
    const m = new Map(S().worldBlocks);
    for (let i = 0; i < blocks; i++) m.set(`${i}_40_${day}`, 3);
    S().setWorldBlocks(m);
  }
  S().setGameTime((t) => t + 1);
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  localStorage.clear();
  sessionStorage.clear();
  globalThis.__reloads = 0;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('a returning player continues their world from the title', () => {
  it('visit 2 and 3 show Continue with the world, continue it at its level, and write back into its one slot', async () => {
    // VISIT 1: the first visit ever. The title starts a world; playing saves it.
    let p = await pageLoad(20);
    expect(screen.queryByTestId('title-continue'), 'a first visit offered Continue with nothing saved').toBeNull();
    fireEvent.click(screen.getByTestId('title-start'));
    play(p.S, { xp: 60000, coins: 3400, blocks: 5, day: 20 });
    advance(AUTOSAVE_MS + 200);
    const first = p.disk();
    expect(first, 'SETUP: visit 1 saved nothing').toHaveLength(1);
    expect(first[0].level, 'SETUP: visit 1 never reached level 15').toBe(15);
    const id = first[0].id;
    p.unload();

    for (const [visit, day] of [[2, 21], [3, 22]]) {
      p = await pageLoad(day);
      const before = JSON.stringify(p.disk());
      // The title, before Start: the loaded world, and nothing saved while it waits.
      const cont = screen.queryByTestId('title-continue');
      expect(cont, `visit ${visit}: the title offers no Continue (state level ${p.S().level}, worlds ${p.disk().length})`).not.toBeNull();
      const meta = screen.getByTestId('title-continue-meta').textContent;
      expect(meta, `visit ${visit}: the caption does not say the level`).toContain(STRINGS.en['menu.level'].replace('{n}', '15'));
      expect(meta, `visit ${visit}: the caption does not name the world`).toContain(p.saves.listWorlds()[0].name);
      expect(meta, `visit ${visit}: the caption does not say when it was played`).toMatch(/played (yesterday|\d+ (hours?|days?) ago)/);
      expect(screen.getByTestId('title-new-world'), `visit ${visit}: no New World beside Continue`).toBeTruthy();
      advance(AUTOSAVE_MS + 1000);
      expect(JSON.stringify(p.disk()), `visit ${visit}: the title saved before Start`).toBe(before);

      fireEvent.click(cont);
      expect(p.S().gameStarted, `visit ${visit}: Continue did not start play`).toBe(true);
      expect({ level: p.S().level, coins: p.S().coins, blocks: p.S().worldBlocks.size },
        `visit ${visit}: Continue did not play the saved world`).toEqual({ level: 15, coins: 3400 + visit - 2, blocks: 5 });
      play(p.S, { coins: 1 });
      advance(AUTOSAVE_MS + 200);
      const now = p.disk();
      expect(now.map((w) => w.id), `visit ${visit}: the save did not land in the world's own slot`).toEqual([id]);
      expect(now[0].coins, `visit ${visit}: the autosave in play wrote nothing`).toBe(3400 + visit - 1);
      p.unload();
    }
  }, 60000);

  it('New World on the title reloads into a fresh world; the old one is kept; the next plain visit continues the newer', async () => {
    let p = await pageLoad(20);
    fireEvent.click(screen.getByTestId('title-start'));
    play(p.S, { xp: 60000, coins: 3400, day: 20 });
    advance(AUTOSAVE_MS + 200);
    const oldId = p.disk()[0].id;
    p.unload();

    p = await pageLoad(21);
    const reloads = globalThis.__reloads;
    fireEvent.click(screen.getByTestId('title-new-world'));
    expect(globalThis.__reloads, 'New World did not reload').toBe(reloads + 1);
    p.unload();

    p = await pageLoad(21);
    expect(screen.queryByTestId('title-continue'), 'the fresh world\'s title offers Continue').toBeNull();
    expect({ level: p.S().level, coins: p.S().coins }, 'New World did not start a fresh world').toEqual({ level: 1, coins: 0 });
    fireEvent.click(screen.getByTestId('title-start'));
    play(p.S, { coins: 7 });
    advance(AUTOSAVE_MS + 200);
    const worlds = p.disk();
    expect(worlds, 'the new world was not saved beside the old one').toHaveLength(2);
    expect(worlds.find((w) => w.id === oldId), 'New World touched the old world').toMatchObject({ level: 15, coins: 3400 });
    const newId = worlds.find((w) => w.id !== oldId).id;
    p.unload();

    p = await pageLoad(22);
    expect(p.S().continueWorld?.id, 'a plain visit did not continue the world written last').toBe(newId);
    expect(p.S().coins).toBe(7);
    p.unload();
  }, 60000);

  it('a load the boot runs still tells the player what it changed (the Cut\'s respec, once the quest system is up)', async () => {
    const { writeWorld } = await import('../../src/game/worldSaves.js');
    writeWorld(PRE_CUT.id, { name: 'Pre-cut', created_at: '2026-10-01T00:00:00Z', is_owner: true }, structuredClone(PRE_CUT));
    const p = await pageLoad(20);
    expect(p.S().continueWorld?.id, 'SETUP: the boot did not load the pre-cut save').toBe(PRE_CUT.id);
    const notices = (globalThis.__hudQuest?.notifications || []).map((n) => n.key || n.message);
    expect(notices.some((k) => /talentsRespec/.test(String(k))),
      `the respec notice the load raised was lost: ${JSON.stringify(notices)}`).toBe(true);
    p.unload();
  }, 30000);
});
