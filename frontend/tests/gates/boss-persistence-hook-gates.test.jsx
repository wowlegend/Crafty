// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { renderHook, render, cleanup, act } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { useBossSystem } from '../../src/world/bossSystem.js';
import { BOSS_CONFIG } from '../../src/game/bossConfig.js';
import { tIn } from '../../src/i18n/i18n.js';
import { blightHeartSite } from '../../src/world/blightHeart.js';
import { notificationText } from '../../src/ui/notifications.js';
import { makeDragonLoader, makeLazyDragon, DRAGON_RETRIES, DRAGON_RETRY_MS } from '../../src/render/dragonLoader.js';

// The dragon's calls go to the notification channel: what the hook sent, as the toast stack shows it in English.
const notices = () => (useGameStore.getState().addNotification?.mock?.calls ?? [])
  .map(([key, , o]) => notificationText({ key, vars: o?.vars }, (k, v) => tIn('en', k, v)));

// A-bis B2g — the half that the store round-trip CANNOT prove.
//
// boss-persistence-gates.test.js drives the store and shows the encounter reaches the save and comes back.
// That is only half the fix: `useBossSystem` held its own React copy seeded from `BOSS_CONFIG.health`, so
// the store could restore 35 HP perfectly and the player would still be shown — and would still have to
// chew through — a full 700 HP dragon. The store test stays green through that, because nothing in it
// renders the hook.
//
// So this mounts the real hook against a restored store and asserts what the player is actually handed.
const MAX = BOSS_CONFIG.health;

describe('B2g — the hook is seeded from the RESTORED store, not from the config', () => {
  beforeEach(() => {
    useGameStore.setState({ bossHealth: MAX, bossActive: false, bossDefeated: false, gameWon: false, addNotification: vi.fn() });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('hands the player back the dragon at the HP they left it at', () => {
    useGameStore.setState({ bossHealth: 35, bossActive: true, bossDefeated: false });
    const { result } = renderHook(() => useBossSystem(9));
    expect(result.current.bossHealth).toBe(35);
    expect(result.current.bossActive).toBe(true);
  });

  it('seeds the PHASE from that health, so mounting mid-fight announces nothing', () => {
    // The phase effect fires a banner on every change. Seeded at 0 while HP says phase 2, mounting would
    // announce "PHASE 3: ENRAGED!" — a transition the player passed before they quit.
    useGameStore.setState({ bossHealth: MAX * 0.17, bossActive: true, bossDefeated: false });
    const { result } = renderHook(() => useBossSystem(9));
    expect(result.current.bossPhase).toBe(2);
    expect(notices()).toEqual([]);
  });

  it('still announces a phase change that happens DURING play', () => {
    // The seeding must not be achieved by muting the banner outright — this is the false-positive canary
    // for the assertion above.
    useGameStore.setState({ bossHealth: MAX, bossActive: true, bossDefeated: false });
    const { result, rerender } = renderHook(() => useBossSystem(9));
    expect(result.current.bossPhase).toBe(0);
    act(() => result.current.damageBoss(MAX * 0.5));
    rerender();
    expect(result.current.bossPhase).toBe(1);
    expect(notices()).toEqual([expect.stringMatching(/PHASE 2/)]);
    // One of the dragon's calls: the encounter column shows it in the boss bar's line before any other notice.
    expect(useGameStore.getState().addNotification.mock.calls.map(([, type, o]) => [type, o?.boss])).toEqual([['danger', true]]);
  });

  it('mounts a fresh encounter at full health when nothing was restored', () => {
    const { result } = renderHook(() => useBossSystem(1));
    expect(result.current.bossHealth).toBe(MAX);
    expect(result.current.bossActive).toBe(false);
    expect(result.current.bossPhase).toBe(0);
  });

  it('mounts a defeated dragon as defeated, so it cannot be re-fought', () => {
    useGameStore.setState({ bossHealth: 0, bossActive: false, bossDefeated: true });
    const { result } = renderHook(() => useBossSystem(9));
    expect(result.current.bossDefeated).toBe(true);
    expect(result.current.bossActive).toBe(false);
  });

  it('mirrors the live fight back into the store, so the next save is current', () => {
    // The mirror is what makes the round-trip test upstream meaningful in real play: without it the store
    // holds whatever was loaded and the save writes stale HP.
    useGameStore.setState({ bossHealth: MAX, bossActive: true, bossDefeated: false });
    const { result, rerender } = renderHook(() => useBossSystem(9));
    act(() => result.current.damageBoss(200));
    rerender();
    expect(useGameStore.getState().bossHealth).toBe(MAX - 200);
  });
});

// DECISIONS 2026-10-30 item 121: a dragon chunk that never loads SUSPENDS the fight (render/dragonLoader.js gives up and
// calls the store's suspendBossEncounter). The bar, music and mood end with bossActive; the HP stays, the save mirror
// keeps it, and the lair re-arms: walking back in resumes the same fight at the same HP. The fight here is woken by an
// arrival and the player levels up during it, so the arrival poll's effect has re-run while the dragon was up and
// returned before arming an interval: only a re-arm can wake the fight again.
describe('a suspended encounter keeps its HP and re-arms the lair', () => {
  const lair = blightHeartSite();
  const away = { x: lair.x + 400, y: 40, z: lair.z };
  const atLair = { x: lair.x, y: 40, z: lair.z };
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.setState({ bossHealth: MAX, bossActive: false, bossDefeated: false, bossTier: 0, gameWon: false,
      isCaptureMode: false, hitstopUntil: 0, hitstopStart: 0, getMobGroundLevel: null, addNotification: vi.fn(),
      playerPosition: atLair });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('suspend: inactive, the same HP in the hook and the store; the next arrival resumes it at that HP', () => {
    const hook = renderHook(({ l }) => useBossSystem(l), { initialProps: { l: 9 } });
    act(() => { vi.advanceTimersByTime(1600); });
    expect(hook.result.current.bossActive, 'SETUP: the arrival did not wake the dragon').toBe(true);
    act(() => hook.result.current.damageBoss(MAX - 300));
    hook.rerender({ l: 10 });
    expect(hook.result.current.bossHealth).toBe(300);
    expect(typeof useGameStore.getState().suspendBossEncounter, 'the give-up path is not published on the store').toBe('function');
    act(() => useGameStore.setState({ playerPosition: away }));
    act(() => useGameStore.getState().suspendBossEncounter());
    hook.rerender({ l: 10 });
    expect(hook.result.current.bossActive).toBe(false);
    expect(hook.result.current.bossHealth).toBe(300);
    expect(useGameStore.getState().bossActive).toBe(false);
    expect(useGameStore.getState().bossHealth).toBe(300);
    // Away from the lair the poll waits; at the lair it wakes the SAME fight.
    act(() => { vi.advanceTimersByTime(3200); });
    expect(hook.result.current.bossActive, 'woke away from the lair').toBe(false);
    act(() => useGameStore.setState({ playerPosition: atLair }));
    act(() => { vi.advanceTimersByTime(1600); });
    hook.rerender({ l: 10 });
    expect(hook.result.current.bossActive, 'the lair did not re-arm after the suspend').toBe(true);
    expect(hook.result.current.bossHealth).toBe(300);
  });
});

// A GIVE-UP WITH THE PLAYER STILL AT THE LAIR. A tab left open across a deploy 404s the dragon's old chunk on every try,
// and the player is standing where the fight woke. The lair stays disarmed until they walk out of it, so the chunk is
// fetched again only on a new arrival (its retries bounded per arrival, never on a timer), and a resumed fight skips
// the entrance it already played. Mounted through the real LazyDragon over a loader that always fails, with the give-up
// wired to the store as the game wires it.
describe('a give-up at the lair leaves the player standing in a quiet lair', () => {
  const lair = blightHeartSite();
  const away = { x: lair.x + 400, y: 40, z: lair.z };
  const atLair = { x: lair.x, y: 40, z: lair.z };
  const real = {};
  let importer;
  const count = (key) => useGameStore.getState().addNotification.mock.calls.filter(([k]) => k === key).length;
  const tick = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  const mountFight = () => {
    importer = vi.fn(() => Promise.reject(new Error('404')));
    const Dragon = makeLazyDragon(makeDragonLoader(importer), {
      notify: (key) => useGameStore.getState().addNotification(key, 'warning'),
      onGiveUp: () => useGameStore.getState().suspendBossEncounter?.(),
    });
    const Fight = () => (useBossSystem(9).bossActive ? <Dragon /> : null);
    return render(<Fight />);
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = useGameStore.getState();
    for (const k of ['triggerHitstop', 'triggerCameraShake', 'triggerBloomSpike']) real[k] = s[k];
    useGameStore.setState({ bossHealth: MAX, bossActive: false, bossDefeated: false, bossTier: 0, gameWon: false,
      isCaptureMode: false, hitstopUntil: 0, hitstopStart: 0, getMobGroundLevel: null, addNotification: vi.fn(),
      triggerHitstop: vi.fn(), triggerCameraShake: vi.fn(), triggerBloomSpike: vi.fn(), playerPosition: atLair });
  });
  afterEach(() => { cleanup(); useGameStore.setState(real); vi.useRealTimers(); vi.restoreAllMocks(); });

  /** Wake the fight at the lair, wound it to 300 HP, and run its chunk to the give-up. */
  const toGiveUp = async () => {
    mountFight();
    await tick(1600);
    expect(useGameStore.getState().bossActive, 'SETUP: the arrival did not wake the dragon').toBe(true);
    expect(count('notice.bossAwakens'), 'SETUP: the instrument does not see the entrance').toBe(1);
    await act(async () => { useGameStore.getState().damageBoss(MAX - 300); });
    for (let i = 0; i <= DRAGON_RETRIES && count('notice.dragonLoadGaveUp') === 0; i++) await tick(DRAGON_RETRY_MS + 100);
    expect(count('notice.dragonLoadGaveUp'), 'SETUP: the failing chunk never gave up').toBe(1);
    expect(importer, 'SETUP: the first load and its retries').toHaveBeenCalledTimes(1 + DRAGON_RETRIES);
  };

  it('standing still for a minute after the give-up: no second wake, no further fetch, one entrance, one give-up', async () => {
    await toGiveUp();
    const woke = [];
    for (let s = 0; s < 60; s++) { await tick(1000); if (useGameStore.getState().bossActive) woke.push(s); }
    expect(woke, 'the fight woke again with the player still standing at the lair').toEqual([]);
    expect(importer, 'the chunk was fetched again with no new arrival').toHaveBeenCalledTimes(1 + DRAGON_RETRIES);
    expect(count('notice.bossAwakens'), 'the entrance played again').toBe(1);
    expect(useGameStore.getState().triggerHitstop, 'the entrance froze the world again').toHaveBeenCalledTimes(1);
    expect(count('notice.dragonLoadGaveUp')).toBe(1);
    expect(useGameStore.getState().bossHealth).toBe(300);
  });

  it('walking out and back in resumes the same fight at the same HP, fetches the chunk again, and plays no entrance', async () => {
    await toGiveUp();
    await act(async () => { useGameStore.setState({ playerPosition: away }); });
    await tick(1600);
    expect(useGameStore.getState().bossActive, 'woke away from the lair').toBe(false);
    await act(async () => { useGameStore.setState({ playerPosition: atLair }); });
    await tick(1600);
    expect(useGameStore.getState().bossActive, 'the lair did not re-arm after the player walked out and back').toBe(true);
    expect(useGameStore.getState().bossHealth).toBe(300);
    expect(importer.mock.calls.length, 'the return did not try the chunk again').toBeGreaterThan(1 + DRAGON_RETRIES);
    expect(count('notice.bossAwakens'), 'the resumed fight played its entrance again').toBe(1);
    expect(useGameStore.getState().triggerHitstop, 'the resumed fight froze the world again').toHaveBeenCalledTimes(1);
  });
});
