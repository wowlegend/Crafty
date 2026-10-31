// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { blightHeartSite } from '../../src/world/blightHeart.js';
import { bossTierStats } from '../../src/game/bossTier.js';

/**
 * EVERY WORLD SWITCH IS A BOOT (deep audit 2026-10-30, seam S1 and lane L2; DECISIONS 2026-10-30 items 200-203).
 *
 * A world's state has owners beside the store: the dragon fight and the quest log in hook state seeded at mount, quest
 * chests and shrines in hook refs, allies, mobs, orbs and loot in the ECS. The in-place load reached the store alone:
 * - the context-loss resume loaded its world in a child's effect, after the hooks had mounted, so the quest log, the
 *   counters, the kill achievements and the dragon fight were overwritten by the hooks' fresh state and saved that way
 *   (AUDIT:debt:resume-clobbers-quests-and-boss);
 * - after the dragon woke, Create New World or Load left a 600-700 HP dragon in the hook that no hit could touch
 *   (AUDIT:softlocks:boss-hook-ignores-world-load).
 * Now each switch saves the world in play, leaves a note and reloads, and the page loads the noted world before React
 * renders. These run the real App through page loads (vi.resetModules(); jsdom's storage persists as a tab's does) and
 * the real entry (startGame.jsx), the real ContextLossPanel, the real World Manager and the real dragon hook, whose
 * props to the 3D scene are recorded. The reload is stood in for: the stand-in records the note and the disk at the
 * moment of the reload, and the test runs the next page load itself, as the browser would.
 *
 * BLIND SPOT: chests, shrines, the ECS pools and the Rapier body start empty on a real reload by construction (a new JS
 * heap); this does not mount them. The hold on the loaded spot is the e2e's (tests/e2e/continue.spec.js).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, receipts in the commit:
 *   W1 startGame renders without the boot's load                              -> RED expected
 *   W2 the World Manager's Create starts the new world in place, no reload    -> RED expected
 *   W3 the World Manager's Load loads in place, no reload                     -> RED expected
 *   W4 plausible-wrong: the switch reloads BEFORE it saves                    -> RED expected
 *   W5 plausible-wrong: the context-loss note names no world (a plain visit)   -> RED expected
 *   W6 Create writes the live world into the new slot (the L2 review's M14)    -> RED expected
 *   W7 Create's fresh note names no slot (the review's M17 and static F4)      -> RED expected
 *   W0 identity (a comment edit)                                               -> must SURVIVE
 */

// The 3D world, stood in: it records the dragon props, and it runs, so its first frame takes back the boot's attempt
// (systems/BootSettle.jsx).
vi.mock('../../src/GameScene', () => ({
  GameScene: (p) => {
    globalThis.__scene = { active: p.bossActive, health: p.bossHealth, tier: p.bossTier };
    globalThis.__worldRan?.();
    return null;
  },
}));
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
vi.mock('../../src/game/pageReload.js', () => ({
  reloadPage: () => {
    const disk = {};
    for (let i = 0; i < localStorage.length; i++) disk[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
    globalThis.__reloads.push({ note: sessionStorage.getItem('crafty.boot'), disk });
  },
}));

const AUTOSAVE_MS = 5000; // App.jsx's delay
const POLL_MS = 1600; // the dragon's arrival poll runs every 1500 ms (world/bossSystem.js)
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });
const lair = blightHeartSite();

async function pageLoad() {
  vi.resetModules();
  globalThis.__scene = null;
  globalThis.__hudQuest = null;
  const { useGameStore } = await import('../../src/store/useGameStore');
  const { startGame } = await import('../../src/startGame.jsx');
  const saves = await import('../../src/game/worldSaves.js');
  const bus = await import('../../src/game/mobKillBus.js');
  const input = await import('../../src/input/inputState.js');
  const boot = await import('../../src/game/worldBoot.js');
  globalThis.__worldRan = () => boot.settleBoot(sessionStorage, useGameStore.getState()._bootAttempt);
  await act(async () => { startGame({ render: (el) => render(el) }); });
  await act(async () => { await Promise.resolve(); });
  const S = () => useGameStore.getState();
  return {
    S, saves, bus, input, useGameStore,
    unload: () => { act(() => { window.dispatchEvent(new Event('beforeunload')); }); cleanup(); },
  };
}

/** The player's half of a page: Continue on the title, and the input gate a locked pointer would open. */
const continuePlay = (p) => {
  fireEvent.click(screen.getByTestId('title-continue'));
  act(() => { p.input.setActive(true); });
};

const quest = (qs) => qs && { kills: qs.stats?.kills, completed: [...(qs.completedQuestIds || [])].sort(), ach: [...(qs.unlockedAchievements || [])].sort() };
const hookQuest = () => {
  const q = globalThis.__hudQuest;
  return q && { kills: q.stats?.kills, completed: null, ach: [...q.unlockedAchievements].sort() };
};
const storeBoss = (s) => ({ active: s.bossActive, health: s.bossHealth, defeated: s.bossDefeated, tier: s.bossTier });
const blob = (p, id) => p.saves.readWorld(id);
const blobBoss = (b) => b && { active: b.game_state.bossState.active, health: b.game_state.bossState.health, defeated: b.game_state.bossState.defeated, tier: b.game_state.bossState.tier };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
  localStorage.clear();
  sessionStorage.clear();
  globalThis.__reloads = [];
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const FIGHT = { level: 9, coins: 42, gameWon: false, nightCount: 2, bossTier: 0, bossDefeated: false, bossHealth: 210, bossActive: true, bossKillNight: 0 };
const WON = { level: 9, coins: 42, gameWon: true, nightCount: 4, bossTier: 1, bossDefeated: true, bossHealth: 0, bossActive: false, bossKillNight: 3 };

describe('the context-loss resume keeps the world it saved', () => {
  for (const [label, pre] of [['mid-fight (210 of 700)', FIGHT], ['won (tier-1 dragon slain)', WON]]) {
    it(`${label}: the quest log, the counters, the achievements and the fight survive the reload, in the hooks and on disk`, async () => {
      // Session 1: a world in play, real kills through the quest hook, then the loss and the tap.
      let p = await pageLoad();
      act(() => { p.useGameStore.setState({ playerPosition: { x: 5, y: 30, z: 5 }, ...pre }); });
      fireEvent.click(screen.getByTestId('title-start'));
      act(() => { for (let i = 0; i < 12; i++) p.bus.emitMobKill('zombie', [0, 0, 0], 'player'); });
      const played = { quest: quest(p.S().questState), boss: storeBoss(p.S()) };
      expect(played.quest.kills, 'SETUP: the kills never reached the quest log').toBe(12);
      expect(played.quest.completed.length, 'SETUP: no quest completed').toBeGreaterThan(0);
      act(() => { p.S().setIsWebGLContextLost(true); });
      fireEvent.click(screen.getByTestId('context-loss-resume'));
      expect(globalThis.__reloads, 'the tap did not reload').toHaveLength(1);
      const id = p.S()._sessionWorldId; // the tap's save minted the slot
      expect(id, 'SETUP: the tap saved no slot').toBeTruthy();
      const { note } = globalThis.__reloads[0];
      p.unload();

      // Session 2: the reload.
      p = await pageLoad();
      const s = p.S();
      expect(quest(s.questState), 'the store\'s quest log after the resume is not the one played').toEqual(played.quest);
      expect(hookQuest(), 'the quest hook after the resume is not the quest log played').toEqual({ ...played.quest, completed: null });
      expect(storeBoss(s), 'the store\'s dragon after the resume is not the one played').toEqual(played.boss);
      expect(globalThis.__scene, 'the dragon hook after the resume is not the one played').toEqual({ active: played.boss.active, health: played.boss.health, tier: played.boss.tier });
      continuePlay(p);
      act(() => { p.S().setGameTime((t) => t + 1); });
      advance(AUTOSAVE_MS + 200);
      const d = blob(p, id);
      expect(quest(d.questState), 'the autosave after the resume wrote another quest log').toEqual(played.quest);
      expect(blobBoss(d), 'the autosave after the resume wrote another dragon').toEqual(played.boss);
      expect(JSON.parse(note || 'null'), 'the note does not name the world the tab was playing').toEqual({ world: id });
      p.unload();
    }, 60000);
  }

  it('a loss on the title of a new world brings the new world back, not the newest save', async () => {
    let p = await pageLoad();
    fireEvent.click(screen.getByTestId('title-start'));
    act(() => { p.S().addCoins(5); });
    advance(AUTOSAVE_MS + 200);
    expect(p.saves.listWorlds(), 'SETUP: no world saved').toHaveLength(1);
    p.unload();
    p = await pageLoad();
    fireEvent.click(screen.getByTestId('title-new-world'));
    p.unload();
    p = await pageLoad();
    expect(p.S().coins, 'SETUP: New World did not boot a fresh world').toBe(0);
    act(() => { p.S().setIsWebGLContextLost(true); });
    const reloads = globalThis.__reloads.length;
    fireEvent.click(screen.getByTestId('context-loss-resume'));
    expect(globalThis.__reloads.length, 'the tap did not reload').toBe(reloads + 1);
    expect(p.saves.listWorlds(), 'a loss on the title saved a world nobody played').toHaveLength(1);
    p.unload();
    p = await pageLoad();
    expect(screen.queryByTestId('title-continue'), 'the reload put the newest save on the title instead of the new world').toBeNull();
    expect(p.S().coins, 'the reload left the new world').toBe(0);
    p.unload();
  }, 60000);
});

describe('a world switch in play leaves nothing of the world before it', () => {
  it('the dragon woken at the lair, then Create New World: no dragon after it, and hook == store == the new world\'s save', async () => {
    let p = await pageLoad();
    act(() => { p.useGameStore.setState({ level: 9, playerPosition: { x: lair.x, y: 40, z: lair.z } }); });
    fireEvent.click(screen.getByTestId('title-start'));
    act(() => { p.input.setActive(true); });
    advance(POLL_MS);
    expect(globalThis.__scene?.active, 'SETUP: the dragon did not wake at the lair').toBe(true);
    expect(p.S().bossActive, 'SETUP: the store did not see the dragon wake').toBe(true);
    act(() => { p.S().damageBoss(100); });
    act(() => { p.S().setShowWorldManager(true); });
    await act(async () => { await vi.dynamicImportSettled(); });
    fireEvent.click(screen.getByText('Create New World'));
    fireEvent.change(screen.getByPlaceholderText(/world name/i), { target: { value: 'Fresh' } });
    fireEvent.click(screen.getByText('Create'));
    const freshId = p.saves.listWorlds().find((w) => w.name === 'Fresh')?.id;
    expect(freshId, 'SETUP: Create wrote no slot named Fresh').toBeTruthy();
    // B2b: Create's slot holds a new world from the moment it is written, not the level-9 world in play.
    expect({ level: blob(p, freshId)?.progression?.level, coins: blob(p, freshId)?.progression?.coins },
      'Create\'s slot holds the world in play, not a new one').toEqual({ level: 1, coins: 0 });
    if (globalThis.__reloads.length) { p.unload(); p = await pageLoad(); }
    expect(p.S()._sessionWorldId, 'the new world does not own the slot Create made').toBe(freshId);
    const max = bossTierStats(0).health;
    const want = { active: false, health: max, tier: 0 };
    expect(globalThis.__scene, `the dragon hook kept the old world's fight: ${JSON.stringify(globalThis.__scene)}`).toEqual(want);
    expect(storeBoss(p.S()), 'the store\'s encounter is not a fresh one').toEqual({ ...want, defeated: false });
    expect(p.S().level, 'the new world is not level 1').toBe(1);
    // The new world, played: nothing wakes at the origin, and the save holds what the hook and the store hold.
    if (screen.queryByTestId('title-start')) fireEvent.click(screen.getByTestId('title-start'));
    act(() => { p.input.setActive(true); p.S().setGameTime((t) => t + 1); p.S().addCoins(5); });
    advance(POLL_MS + AUTOSAVE_MS);
    expect(globalThis.__scene, 'a dragon woke in the new world').toEqual(want);
    expect(blobBoss(blob(p, freshId)), 'the new world\'s save holds another encounter').toEqual({ ...want, defeated: false });
    // The new world saves into the slot Create made, under the name typed, and mints none of its own.
    expect(blob(p, freshId)?.progression?.coins, 'the new world did not save into the slot Create made').toBe(5);
    expect(p.saves.listWorlds().map((w) => w.name === 'Fresh' ? 'Fresh' : 'other').sort(),
      'the slots after the new world saved: the world switched from, and Fresh').toEqual(['Fresh', 'other']);
    p.unload();
  }, 60000);

  it('the World Manager\'s Load during a fight saves the world in play first, then reloads into the other world\'s own encounter', async () => {
    // A calm world on disk, played and saved in an earlier session.
    let p = await pageLoad();
    fireEvent.click(screen.getByTestId('title-start'));
    act(() => { p.S().addCoins(7); });
    advance(AUTOSAVE_MS + 200);
    const calmId = p.saves.listWorlds()[0].id;
    p.unload();
    sessionStorage.setItem('crafty.boot', JSON.stringify({ fresh: true }));

    // A second world in a fight, then Load of the calm one.
    p = await pageLoad();
    act(() => { p.useGameStore.setState({ level: 9, playerPosition: { x: lair.x, y: 40, z: lair.z } }); });
    fireEvent.click(screen.getByTestId('title-start'));
    act(() => { p.input.setActive(true); });
    advance(POLL_MS);
    expect(globalThis.__scene?.active, 'SETUP: the dragon did not wake at the lair').toBe(true);
    act(() => { p.S().damageBoss(150); p.S().addCoins(31); });
    const fighting = { coins: p.S().coins, health: globalThis.__scene.health };
    act(() => { p.S().setShowWorldManager(true); });
    await act(async () => { await vi.dynamicImportSettled(); });
    const card = screen.getAllByRole('heading', { level: 3 }).map((h) => h.closest('.bg-gray-700')).find((c) => c && c.textContent.includes(p.saves.listWorlds().find((w) => w.id === calmId).name));
    fireEvent.click(within(card).getByRole('button', { name: 'Load' }));
    const at = globalThis.__reloads.at(-1);
    const fightId = p.S()._sessionWorldId;
    if (at) { p.unload(); p = await pageLoad(); }

    const want = { active: false, health: bossTierStats(0).health, tier: 0 };
    expect(globalThis.__scene, `the dragon hook kept the other world's fight: ${JSON.stringify(globalThis.__scene)}`).toEqual(want);
    expect(storeBoss(p.S()), 'the store\'s encounter is not the loaded world\'s').toEqual({ ...want, defeated: false });
    expect(p.S()._sessionWorldId, 'the page does not play the world loaded').toBe(calmId);
    expect(at, 'Load did not reload').toBeTruthy();
    expect(JSON.parse(at.note), 'the note does not name the world loaded').toEqual({ world: calmId });
    const saved = JSON.parse(at.disk[`crafty_world_save_${fightId}`] || 'null');
    expect(saved && { coins: saved.progression.coins, health: saved.game_state.bossState.health },
      'the world in play was not saved before the reload').toEqual(fighting);
    p.unload();
  }, 60000);
});
