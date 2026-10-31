// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, act, cleanup, fireEvent, screen } from '@testing-library/react';
import { STRINGS } from '../../src/i18n/strings.js';

/**
 * A SWITCH THE BROWSER WILL NOT CARRY IS NOT MADE, AND THE PLAYER IS TOLD (REVIEW:l2:switch-without-session-storage;
 * lane L8). Every world switch saves, leaves a note in sessionStorage naming the world to boot, and reloads
 * (game/worldBoot.js switchWorld). Where sessionStorage refuses the write, the reload went ahead as a plain visit, which
 * continues the newest world, the one just saved: Load and Create landed back on the world the player was leaving, New
 * World did nothing, and nothing said why. Now a switch from the World Manager or the title whose note is refused does
 * not reload: the world in play stays, still saving into its slot, the notice save.switchRefused says so, and the World
 * Manager shows it too; a refused Create takes back the slot it wrote, so that "nothing changed" is true. Two still
 * reload, as a plain visit: the context-loss recovery (the lost context leaves nothing to stay in) and the conflict
 * panel's Reload (a refused one is a dead button under an opaque panel). That plain visit continues the newest world
 * earned in or named, which is the world just saved unless it is an empty placeholder (item 334: then an older world
 * holding something).
 *
 * The page is the real entry (startGame.jsx) with the real autosave; the World Manager is the real one; sessionStorage
 * refuses writes at Storage.prototype.setItem, as a sandboxed frame or a locked-down browser does; the reload is
 * recorded.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, receipts in the commit:
 *   S1 a refused note still reloads                                         -> RED expected
 *   S2 the refusal says nothing                                             -> RED expected
 *   S3 plausible-wrong: the context-loss recovery is refused too            -> RED expected
 *   S4 the conflict panel's Reload is refused with its note (a dead button)  -> RED expected
 *   S5 a refused Create leaves the world it wrote (so "nothing changed" is false) -> RED expected
 *   S0 identity (a comment edit)                                            -> must SURVIVE
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
vi.mock('../../src/game/pageReload.js', () => ({ reloadPage: () => { globalThis.__reloads += 1; } }));

const AUTOSAVE_MS = 5000; // App.jsx's delay
const PLAYED = 'local_played';
const OTHER = 'local_other';
const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });
const coinsOn = (id) => JSON.parse(localStorage.getItem(`crafty_world_save_${id}`) || 'null')?.progression?.coins;
let refuse = false;

async function page() {
  const saves = await import('../../src/game/worldSaves.js');
  const { buildSaveData } = await import('../../src/game/saveSchema.js');
  const { useGameStore: seedStore } = await import('../../src/store/useGameStore');
  const put = (id, name, coins) => saves.writeWorld(id, { name, created_at: '2026-10-01T00:00:00Z', is_owner: true, saved_at: '2026-10-30T12:00:00Z' },
    buildSaveData({ ...seedStore.getInitialState(), coins }, { position: { x: 0.5, y: 40, z: 0.5 } }));
  put(OTHER, 'Other Vale', 50);
  put(PLAYED, 'Played Keep', 100);
  vi.resetModules();
  const { useGameStore } = await import('../../src/store/useGameStore');
  const { startGame } = await import('../../src/startGame.jsx');
  const boot = await import('../../src/game/worldBoot.js');
  const recovery = await import('../../src/game/contextRecovery.js');
  globalThis.__worldRan = () => boot.settleBoot(sessionStorage, useGameStore.getState()._bootAttempt);
  await act(async () => { startGame({ render: (el) => render(el) }); });
  await act(async () => { await Promise.resolve(); });
  const S = () => useGameStore.getState();
  expect(S()._sessionWorldId, 'SETUP: the visit did not continue the world').toBe(PLAYED);
  const notices = [];
  const channel = S().addNotification;
  useGameStore.setState({ addNotification: (...a) => { notices.push(a[0]); return channel?.(...a); } });
  return { S, notices, recovery };
}
async function openWorldManager() {
  const { WorldManager } = await import('../../src/WorldManager.jsx');
  render(<WorldManager onClose={() => {}} />);
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
  localStorage.clear();
  sessionStorage.clear();
  globalThis.__reloads = 0;
  refuse = false;
  const real = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
    if (refuse && this === window.sessionStorage) throw new DOMException('The operation is insecure.', 'SecurityError');
    return real.call(this, k, v);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('a world switch whose note sessionStorage refuses', () => {
  it('control: with sessionStorage, the World Manager\'s Load reloads into the world it names', async () => {
    await page();
    await openWorldManager();
    fireEvent.click(screen.getAllByText('Load')[1]);
    expect({ reloads: globalThis.__reloads, note: JSON.parse(sessionStorage.getItem('crafty.boot')) }, 'SETUP: Load did not switch')
      .toEqual({ reloads: 1, note: { world: OTHER } });
  }, 30000);

  it('Load in the World Manager: no reload, the world in play stays and saves, and the player is told', async () => {
    const { S, notices } = await page();
    fireEvent.click(screen.getByTestId('title-continue'));
    await openWorldManager();
    refuse = true;
    fireEvent.click(screen.getAllByText('Load')[1]);
    expect(globalThis.__reloads, 'the page reloaded with no note: a plain visit back into the world it left').toBe(0);
    expect(notices, 'the refused switch said nothing').toContain('save.switchRefused');
    expect(screen.queryByText(STRINGS.en['save.switchRefused']), 'the World Manager does not say why nothing happened').not.toBeNull();
    act(() => { S().addCoins(5); });
    advance(AUTOSAVE_MS + 200);
    expect({ slot: S()._sessionWorldId, coins: coinsOn(PLAYED) }, 'the world in play did not stay and save').toEqual({ slot: PLAYED, coins: 105 });
  }, 30000);

  it('New World on the title: no reload, and the player is told', async () => {
    const { notices } = await page();
    refuse = true;
    fireEvent.click(screen.getByTestId('title-new-world'));
    expect({ reloads: globalThis.__reloads, told: notices.includes('save.switchRefused') }, 'New World reloaded into the same world, or said nothing')
      .toEqual({ reloads: 0, told: true });
    expect(typeof STRINGS['zh-CN']['save.switchRefused'], 'no zh-CN copy').toBe('string');
  }, 30000);

  it('Create in the World Manager: no reload, the new world\'s slot is taken back, and the panel\'s "nothing changed" is true', async () => {
    const { notices } = await page();
    await openWorldManager();
    const before = JSON.parse(localStorage.getItem('crafty_world_saves')).map((w) => w.id).sort();
    refuse = true;
    fireEvent.click(screen.getByTestId('world-create-new'));
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(screen.getByTestId('world-name-field'), { target: { value: 'Probe Keep' } });
    fireEvent.click(screen.getByText('Create'));
    await act(async () => { await Promise.resolve(); });
    const after = JSON.parse(localStorage.getItem('crafty_world_saves'));
    expect({ reloads: globalThis.__reloads, told: notices.includes('save.switchRefused') }, 'SETUP: the refused Create switched, or said nothing')
      .toEqual({ reloads: 0, told: true });
    expect(screen.queryByText(STRINGS.en['save.switchRefused']), 'SETUP: the World Manager does not show the refusal').not.toBeNull();
    expect({ worlds: after.map((w) => w.id).sort(), named: after.some((w) => w.name === 'Probe Keep') },
      'the World Manager said nothing changed and left the new world written').toEqual({ worlds: before, named: false });
    expect(Object.keys(localStorage).filter((k) => k.startsWith('crafty_world_save_')).length, 'the new world\'s save was left behind')
      .toBe(before.length);
  }, 30000);

  it('control: Create with sessionStorage reloads into the new world, written under its name', async () => {
    await page();
    await openWorldManager();
    fireEvent.click(screen.getByTestId('world-create-new'));
    await act(async () => { await Promise.resolve(); });
    fireEvent.change(screen.getByTestId('world-name-field'), { target: { value: 'Probe Keep' } });
    fireEvent.click(screen.getByText('Create'));
    await act(async () => { await Promise.resolve(); });
    const made = JSON.parse(localStorage.getItem('crafty_world_saves')).find((w) => w.name === 'Probe Keep');
    expect({ reloads: globalThis.__reloads, note: JSON.parse(sessionStorage.getItem('crafty.boot')) }, 'SETUP: Create did not switch')
      .toEqual({ reloads: 1, note: { fresh: true, world: made?.id } });
  }, 30000);

  it('the conflict panel\'s Reload still reloads: the world it names is the newest save, which a plain visit continues', async () => {
    const { S, notices } = await page();
    fireEvent.click(screen.getByTestId('title-continue'));
    // Another tab saves this world: its index entry is newer than the save this tab read, and the storage event says so.
    const saves = await import('../../src/game/worldSaves.js');
    const entry = saves.listWorlds().find((w) => w.id === PLAYED);
    saves.writeWorld(PLAYED, { ...entry, saved_at: '2026-10-31T12:30:00Z' }, saves.readWorld(PLAYED));
    act(() => { window.dispatchEvent(new Event('storage')); });
    expect(S().slotConflict, 'SETUP: the other tab\'s save raised no conflict').toEqual({ id: PLAYED });
    refuse = true;
    fireEvent.click(screen.getByTestId('slot-conflict-reload'));
    expect({ reloads: globalThis.__reloads, refused: notices.includes('save.switchRefused') },
      'the conflict panel\'s Reload did nothing behind its opaque panel, where sessionStorage refuses the note').toEqual({ reloads: 1, refused: false });
  }, 30000);

  it('the context-loss recovery still reloads, as a plain visit: the lost context leaves nothing to stay in', async () => {
    const { S, recovery } = await page();
    fireEvent.click(screen.getByTestId('title-continue'));
    refuse = true;
    recovery.recoverFromContextLoss({ getState: S, storage: window.sessionStorage, reload: () => { globalThis.__reloads += 1; } });
    expect(globalThis.__reloads, 'the context-loss recovery was refused with its note').toBe(1);
  }, 30000);
});
