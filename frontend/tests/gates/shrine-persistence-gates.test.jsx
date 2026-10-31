// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import * as THREE from 'three';
import { useQuestSystem, useTreasureChests, QUEST_LIST } from '../../src/QuestSystem.jsx';
import { ObjectiveTracker } from '../../src/HUD.jsx';
import { useGameStore } from '../../src/store/useGameStore';
import { nearestLandmark } from '../../src/world/shrines.js';
import { buildSaveData } from '../../src/game/saveSchema.js';
import { bootWorld, writeBootNote } from '../../src/game/worldBoot.js';
import * as worldSaves from '../../src/game/worldSaves.js';
import { claimHudTick, emitHudTick } from '../../src/ui/hudTicker.js';
import { exitCaptureMode } from '../../src/devtest/captureMode.js';

/**
 * A WORLD REMEMBERS ITS SHRINES (deep audit 2026-10-30, lane L3; AUDIT:debt:shrine-facts-session-scoped, the persistence
 * half).
 *
 * Which frontier shrines the player has reached, and which shrine chests they have opened, lived in two hook refs and
 * one session flag. So every reload sent the HUD objective back to "Reach the frontier shrine" for a player who had
 * reached one, and re-armed every shrine's reward chest, and a shrine reached before Pilgrimage was offered never
 * counted for it (persisting the set alone would make that permanent: the quest must be credited from the set).
 *
 * Each page runs the real quest and chest hooks and the real HUD objective tracker over the real store; a reload is the
 * real boot (game/worldBoot.js) from the real localStorage index into a fresh store, with the hooks mounted after it, as
 * startGame does. The player stands on a real landmark (world/shrines.js, the live hash). Presence first: on a first
 * visit the chest spawns and the tracker names the shrine, so an absence after the reload is the record, not a dead poll.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/QuestSystem.jsx, src/store/useGameStore.jsx, src/game/saveSchema.js
 * and src/HUD.jsx, receipts in the commit.
 */

const shrine = nearestLandmark(0, 0);
const KEY = `${shrine.cx}_${shrine.cz}`;
const AT_SHRINE = { x: shrine.worldX, y: 60, z: shrine.worldZ };
const AWAY = { x: shrine.worldX + 200, y: 60, z: shrine.worldZ + 200 };
const POLL_MS = 3100; // the reach and shrine-chest polls run every 3000 ms
const ID = 'local_shrines';

let release = null;
const Harness = () => {
  globalThis.__q = useQuestSystem();
  globalThis.__c = useTreasureChests();
  return <ObjectiveTracker />;
};

/** A page: a fresh store, the boot's load if a save is on disk, the hooks mounted after it, the player at `at`. */
function page(at, { boot = true } = {}) {
  cleanup();
  useGameStore.setState(useGameStore.getInitialState(), true);
  if (boot) bootWorld({ store: useGameStore, session: sessionStorage, saves: worldSaves });
  useGameStore.setState({
    playerPosition: at, getMobGroundLevel: () => 59, isCaptureMode: false,
    gameCamera: { matrixWorld: new THREE.Matrix4() },
  });
  const view = render(<Harness />);
  return view;
}
const poll = () => act(() => { vi.advanceTimersByTime(POLL_MS); });
// The tracker rescans for the nearest shrine at most every 750 ms of performance.now() (HUD.jsx), and the fake clock starts
// at 0, so a read first lets that much pass.
const objective = (view) => {
  act(() => { vi.advanceTimersByTime(800); emitHudTick(0); });
  return view.getByTestId('objective-tracker').textContent;
};
const shrineChests = () => globalThis.__c.chests.filter((c) => c.shrine && !globalThis.__c.openedChestIds.has(c.id));
const save = () => {
  const s = useGameStore.getState();
  if (!s._sessionWorldId) useGameStore.setState({ _sessionWorldId: ID });
  expect(useGameStore.getState().saveActiveWorld(s.playerPosition), 'SETUP: the save did not write').toBe(true);
};
const pilgrim = () => globalThis.__q.quests.find((q) => q.id === 'pilgrim');
// The quest hook's own toasts, by id, gathered after each poll (a toast clears itself after 4 s).
const seen = new Map();
const gather = () => { for (const n of globalThis.__q.notifications) seen.set(n.id, n); };
const pilgrimDone = () => [...seen.values()].filter((n) => /Quest Complete: Pilgrimage/.test(n.text || '')).length;

/** A save on disk of a world at level 6 whose active feed holds Pilgrimage, untouched, and which has reached `reached`. */
function writePilgrimWorld(reached) {
  const s = buildSaveData(useGameStore.getInitialState(), { position: AWAY });
  const def = QUEST_LIST.find((q) => q.id === 'pilgrim');
  s.questState = { quests: [{ ...def, progress: 0, completed: false, claimed: false }], completedQuestIds: ['first_blood', 'hunter', 'miner'], stats: null, unlockedAchievements: ['first_step'] };
  s.game_state = { ...s.game_state, shrines: { reached, rewarded: [] } };
  expect(worldSaves.writeWorld(ID, { name: 'Pilgrim', is_owner: true, created_at: '2026-10-31T09:00:00.000Z' }, s), 'SETUP').toBe(true);
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  exitCaptureMode();
  release = claimHudTick();
});
afterEach(() => { cleanup(); release(); vi.useRealTimers(); });

describe('a reached shrine and an opened shrine chest survive a reload', () => {
  it('reach, open, save, reload, revisit: the objective is the Blight Heart and no second chest spawns', () => {
    let view = page(AT_SHRINE, { boot: false });
    expect(objective(view), 'SETUP: a first visit\'s tracker does not name the shrine').toMatch(/frontier shrine/i);
    poll();
    expect(useGameStore.getState().reachedShrines, 'standing on the shrine did not reach it').toEqual([KEY]);
    expect(shrineChests(), 'SETUP: the shrine\'s chest did not spawn on the first visit').toHaveLength(1);
    act(() => { globalThis.__c.openChest(shrineChests()[0].id); });
    expect(useGameStore.getState().rewardedShrines, 'opening the shrine\'s chest did not record it').toEqual([KEY]);
    expect(objective(view), 'the tracker did not move on to the Blight Heart').toMatch(/Blight Heart/);
    save();
    expect(worldSaves.readWorld(ID).game_state.shrines, 'the save does not hold the shrine record').toEqual({ reached: [KEY], rewarded: [KEY] });

    view = page(AT_SHRINE);
    expect(useGameStore.getState()._sessionWorldId, 'SETUP: the reload did not boot the saved world').toBe(ID);
    expect(objective(view), 'after the reload the objective went back to the shrine already reached').toMatch(/Blight Heart/);
    poll();
    poll();
    expect(shrineChests(), 'the reload re-armed the shrine\'s chest the player had opened').toHaveLength(0);
  });

  it('the shrine chest opened and the page closed before a drop is picked up: the reload holds its loot with the record', () => {
    page(AT_SHRINE, { boot: false });
    poll();
    expect(shrineChests(), 'SETUP: the chest did not spawn').toHaveLength(1);
    const bag0 = { ...useGameStore.getState().inventory.blocks };
    const xp0 = useGameStore.getState().totalXP;
    let loot = [];
    act(() => { loot = globalThis.__c.openChest(shrineChests()[0].id); });
    expect(loot.length, 'SETUP: the shrine chest paid less than its guaranteed rolls').toBeGreaterThan(1);
    save(); // the close: the autosave flushes a pending save when the tab is hidden or closed, before any pickup
    page(AT_SHRINE);
    const s = useGameStore.getState();
    expect(s.rewardedShrines, 'SETUP: the reload did not keep the record').toEqual([KEY]);
    const owed = {};
    for (const l of loot) owed[l.item] = (owed[l.item] || 0) + 1;
    for (const [item, n] of Object.entries(owed)) {
      expect(s.inventory.blocks[item] ?? 0, `${item}: the save records the shrine paid and holds none of its loot`).toBe((bag0[item] ?? 0) + n);
    }
    const xp = loot.reduce((a, l) => a + (l.effect === 'xp' ? l.value : 10), 0);
    expect(s.totalXP, 'the loot\'s XP was lost with the drops').toBe(xp0 + xp);
    poll();
    poll();
    expect(shrineChests(), 'the paid shrine gave a second chest').toHaveLength(0);
  });

  it('a chest spawned and left shut is still owed after the reload: one chest, once', () => {
    page(AT_SHRINE, { boot: false });
    poll();
    expect(shrineChests(), 'SETUP: the chest did not spawn').toHaveLength(1);
    save();
    expect(worldSaves.readWorld(ID).game_state.shrines, 'a shut chest was recorded as its reward taken').toEqual({ reached: [KEY], rewarded: [] });
    page(AT_SHRINE);
    poll();
    poll();
    expect(shrineChests(), 'the owed chest did not come back, or came back twice').toHaveLength(1);
  });

  it('a new world from the boot\'s note starts with no shrine reached and its own chest', () => {
    page(AT_SHRINE, { boot: false });
    poll();
    act(() => { globalThis.__c.openChest(shrineChests()[0].id); });
    save();
    writeBootNote(sessionStorage, { fresh: true });
    const view = page(AT_SHRINE);
    expect(useGameStore.getState().reachedShrines, 'the new world inherited the old world\'s shrines').toEqual([]);
    expect(objective(view)).toMatch(/frontier shrine/i);
    poll();
    expect(shrineChests(), 'the new world\'s shrine gave no chest').toHaveLength(1);
  });
});

describe('a save from before the shrine record whose Pilgrimage is done (REVIEW:l3:pilgrimage-done-shows-shrine-objective)', () => {
  // The record began with lane L3; a save from before it holds no game_state.shrines and reads as having reached none
  // (saveSchema.js liveShrines). A completed Pilgrimage proves the world reached a shrine, though not which one.
  const writeOldWorld = (completed) => {
    const s = buildSaveData(useGameStore.getInitialState(), { position: AWAY });
    s.questState = { quests: [], completedQuestIds: completed, stats: null, unlockedAchievements: ['first_step'] };
    delete s.game_state.shrines;
    expect(worldSaves.writeWorld(ID, { name: 'Old Pilgrim', is_owner: true, created_at: '2026-10-20T09:00:00.000Z' }, s), 'SETUP').toBe(true);
  };

  it('Pilgrimage done: the objective is the Blight Heart, away from every shrine; not done, it is the shrine', () => {
    writeOldWorld(['first_blood']);
    let view = page(AWAY);
    // PRESENCE: the same old save without Pilgrimage done still names the shrine, so the tracker can show either.
    expect(objective(view), 'SETUP: an old save with no shrine reached does not name the shrine').toMatch(/frontier shrine/i);
    writeOldWorld(['first_blood', 'pilgrim']);
    sessionStorage.removeItem('crafty.bootAttempt'); // the first page's world ran (systems/BootSettle.jsx)
    view = page(AWAY);
    expect(useGameStore.getState().reachedShrines, 'SETUP: the old save loaded a shrine record').toEqual([]);
    expect(objective(view), 'a world whose Pilgrimage is done was sent to reach a shrine again').toMatch(/Blight Heart/);
  });
});

describe('Pilgrimage is credited from the shrines this world has reached, whenever it is offered', () => {
  it('control: offered in a world that has reached none, away from every shrine, it stays at 0', () => {
    writePilgrimWorld([]);
    page(AWAY);
    expect(pilgrim(), 'SETUP: the loaded feed does not hold Pilgrimage').toBeTruthy();
    poll();
    poll();
    expect(pilgrim().progress).toBe(0);
  });

  it('offered after a shrine was reached: completed within one poll, away from every shrine, and once', () => {
    writePilgrimWorld([KEY]);
    seen.clear();
    page(AWAY);
    expect(pilgrim(), 'SETUP: the loaded feed does not hold Pilgrimage').toBeTruthy();
    poll();
    gather();
    expect(useGameStore.getState().questState?.completedQuestIds ?? [],
      `the shrine reached before Pilgrimage was offered did not count: ${JSON.stringify(pilgrim())}`).toContain('pilgrim');
    poll(); gather();
    poll(); gather();
    expect(pilgrimDone(), 'Pilgrimage completed other than once').toBe(1);
  });
});
