// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { useBossSystem } from '../../src/world/bossSystem.js';
import { BOSS_CONFIG } from '../../src/game/bossConfig.js';
import { tIn } from '../../src/i18n/i18n.js';
import { notificationText } from '../../src/ui/notifications.js';

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
