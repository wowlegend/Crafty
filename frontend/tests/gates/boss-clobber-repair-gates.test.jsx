// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { useBossSystem } from '../../src/world/bossSystem';
import { useGameStore } from '../../src/store/useGameStore';
import { blightHeartSite } from '../../src/world/blightHeart';
import { bossTierStats } from '../../src/game/bossTier.js';
import { buildSaveData } from '../../src/game/saveSchema.js';
import { bootWorld, settleBoot } from '../../src/game/worldBoot.js';
import * as worldSaves from '../../src/game/worldSaves.js';
// The slot a wiped save became on the live 8579918e build (lane L2's boot, before this repair): booted, the player walked
// to the lair, the poll woke the 700 HP tier-1 dragon whose return was not due, and the autosave wrote it as a fight.
// Made by the round-1 dynamic review's probe on that build's own code.
import WOKEN_UNDER_8579918E from '../fixtures/boss-woken-wipe-8579918e.json';

/**
 * A SAVE THE CONTEXT-LOSS RESUME WIPED GETS ITS SLAIN DRAGON BACK (DECISIONS 2026-10-31 item 250; deep audit lane L3's
 * one-way door).
 *
 * From the deploy of 2026-10-28T10:41:29Z to that of 2026-10-31T07:09:42Z the resume loaded its world after the dragon
 * hook had mounted, and the hook's mirror wrote its mount-time encounter (700 HP, inactive, not defeated) over the
 * loaded one, keeping the tier and the kill night. A slain tier-1 dragon was saved as `{ health: 700, active: false,
 * defeated: false, tier: 1, killNight }`, and once the hook seeds from the loaded store, that save wakes a 700 HP tier-1
 * dragon at the lair whose return is not due. The repair loads it slain, once per save, for a slot created before the
 * window closed.
 *
 * The production order: the save is written to the real localStorage index, the real boot (game/worldBoot.js) loads it
 * into the real store before the hook mounts, and the real hook runs its arrival poll with the player at the lair. The
 * save written after is read back from disk. Presence first: a slot created after the window keeps its shape, and that
 * fight wakes at the lair, so a quiet lair in the repaired case is the repair, not a dead poll.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/game/saveSchema.js and src/store/useGameStore.jsx, receipts in the
 * commit.
 */

const lair = blightHeartSite();
const AT_LAIR = { x: lair.x, y: 40, z: lair.z };
const WIPED = Object.freeze({ health: 700, active: false, defeated: false, tier: 1, killNight: 4 });
const IN_WINDOW = '2026-10-29T12:00:00.000Z';
const AFTER_WINDOW = '2026-10-31T08:00:00.000Z';
const REPAIR = 'boss.resumeWipe'; // the name the save's record keeps: renaming it re-runs the repair on every save
const ID = 'local_wiped';

/** A save as the window's builds wrote it: by default a won tier-1 world at level 9 on night `nightCount`, at the lair. */
function writeSlot({ bossState = WIPED, created_at = IN_WINDOW, migrated = ['talents.cut'], nightCount = 5, gameWon = true } = {}) {
  const save = buildSaveData(useGameStore.getInitialState(), { position: AT_LAIR });
  save.migrated = migrated;
  save.game_state = { ...save.game_state, gameWon, bossState: { ...bossState } };
  save.progression = { ...save.progression, level: 9, nightCount };
  const meta = { name: 'Wiped', is_owner: true, ...(created_at ? { created_at } : {}) };
  expect(worldSaves.writeWorld(ID, meta, save), 'SETUP: the slot did not write').toBe(true);
}

/** A page load: the boot loads the newest owned world into a fresh store, then the hook mounts on it. */
function bootAndArrive() {
  useGameStore.setState(useGameStore.getInitialState(), true);
  const booted = bootWorld({ store: useGameStore, session: sessionStorage, saves: worldSaves });
  expect(booted, 'SETUP: the boot did not load the slot').toEqual({ kind: 'world', id: ID });
  useGameStore.setState({ addNotification: vi.fn(), getMobGroundLevel: null, isCaptureMode: false, playerPosition: AT_LAIR });
  const hook = renderHook(() => useBossSystem(9));
  settleBoot(sessionStorage, useGameStore.getState()._bootAttempt); // the world ran, so the next visit loads it again
  act(() => { vi.advanceTimersByTime(3200); }); // two of the arrival poll's 1500 ms ticks
  return hook;
}
const notices = () => useGameStore.getState().addNotification.mock.calls.map(([k]) => k);
const encounterIn = (s) => ({ health: s.bossHealth, active: s.bossActive, defeated: s.bossDefeated, tier: s.bossTier, killNight: s.bossKillNight });
const disk = () => worldSaves.readWorld(ID);
const saveNow = () => expect(useGameStore.getState().saveActiveWorld(AT_LAIR), 'SETUP: the save did not write').toBe(true);

describe('a save the resume wiped loads its slain dragon (item 250)', () => {
  beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); sessionStorage.clear(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('presence: a return fight that is due, suspended at 700 in a save that ran the repair, wakes at the lair at 700', () => {
    writeSlot({ created_at: AFTER_WINDOW, migrated: ['talents.cut', REPAIR], nightCount: 7 });
    const hook = bootAndArrive();
    expect(hook.result.current.bossActive, 'the poll did not wake the fight: the instrument cannot see a wake').toBe(true);
    expect(hook.result.current.bossHealth, 'a due return fight lost the HP it was suspended at').toBe(700);
    expect(useGameStore.getState().bossDefeated).toBe(false);
  });

  it('a slot created after the window, the wipe\'s shape with its return not due: slain on every load (a tab left on an old build)', () => {
    writeSlot({ created_at: AFTER_WINDOW });
    const hook = bootAndArrive();
    expect(encounterIn(useGameStore.getState()), 'a tier-1 dragon not slain and not due loaded as a fight')
      .toEqual({ health: 0, active: false, defeated: true, tier: 1, killNight: 4 });
    expect(hook.result.current.bossActive, `a 700 HP tier-1 dragon woke with its return not due: ${JSON.stringify(notices())}`).toBe(false);
    saveNow();
    expect(disk().migrated, 'a slot the repair passed over is not recorded, so a later load would look again').toContain(REPAIR);
  });

  it('the save the live 8579918e build wrote after waking a wiped slot at the lair loads slain, and again on the next load', () => {
    const { id: _id, name, created_at, is_owner, saved_at: _at, ...save } = WOKEN_UNDER_8579918E;
    expect(save.game_state.bossState, 'SETUP: the fixture is not the woken wipe')
      .toEqual({ health: 700, active: true, defeated: false, tier: 1, killNight: 4 });
    expect(worldSaves.writeWorld(ID, { name, is_owner, created_at }, save), 'SETUP: the slot did not write').toBe(true);
    for (const load of ['first', 'second']) {
      const hook = bootAndArrive();
      expect(encounterIn(useGameStore.getState()), `the ${load} load kept the woken wipe as a fight`)
        .toEqual({ health: 0, active: false, defeated: true, tier: 1, killNight: 4 });
      expect(hook.result.current.bossActive, `the ${load} load woke the dragon at 700: ${JSON.stringify(notices())}`).toBe(false);
      saveNow();
      expect(disk().game_state.bossState, `the save after the ${load} load wrote the fight back`)
        .toEqual({ health: 0, active: false, defeated: true, tier: 1, killNight: 4 });
      cleanup();
    }
  });

  it('a stale tab writes the wipe after the repair is recorded: it loads slain all the same, and on the next load', () => {
    for (const bossState of [WIPED, { ...WIPED, active: true }]) {
      writeSlot({ bossState, migrated: ['talents.cut', REPAIR] });
      for (const load of ['first', 'second']) {
        const hook = bootAndArrive();
        expect(encounterIn(useGameStore.getState()), `${JSON.stringify(bossState)}, ${load} load: not slain`)
          .toEqual({ health: 0, active: false, defeated: true, tier: 1, killNight: 4 });
        expect(hook.result.current.bossActive).toBe(false);
        saveNow();
        cleanup();
      }
    }
  });

  it('the repair of a save not yet recorded matches only the wipe: a due return active at 700 or suspended at 650 keeps its fight', () => {
    for (const bossState of [{ ...WIPED, active: true }, { ...WIPED, health: 650 }]) {
      writeSlot({ bossState, nightCount: 7 });
      const hook = bootAndArrive();
      expect(useGameStore.getState().bossDefeated, `${JSON.stringify(bossState)} was repaired as the wipe`).toBe(false);
      expect(hook.result.current.bossActive, `${JSON.stringify(bossState)} did not wake`).toBe(true);
      expect(hook.result.current.bossHealth, `${JSON.stringify(bossState)} lost its HP`).toBe(bossState.health);
      cleanup();
    }
  });

  it('a wiped slot from the window: slain, the lair quiet while the return is not due, and the save says so', () => {
    writeSlot();
    const hook = bootAndArrive();
    expect(encounterIn(useGameStore.getState()), 'the wipe was not repaired (the encounter after the boot and the poll)')
      .toEqual({ health: 0, active: false, defeated: true, tier: 1, killNight: 4 });
    expect(hook.result.current.bossActive, `a 700 HP tier-1 dragon woke with its return not due: ${JSON.stringify(notices())}`).toBe(false);
    expect(hook.result.current.bossDefeated).toBe(true);
    expect(notices(), 'the return was announced before it was due').not.toContain('notice.bossReturns');
    saveNow();
    const saved = disk();
    expect(saved.game_state.bossState, 'the first save after the load wrote the wipe back')
      .toEqual({ health: 0, active: false, defeated: true, tier: 1, killNight: 4 });
    expect(saved.migrated, 'the repair is not recorded on the save').toContain(REPAIR);
  });

  it('a wiped slot with no creation date (an index entry older than the field) is repaired too', () => {
    writeSlot({ created_at: null });
    bootAndArrive();
    expect(useGameStore.getState().bossDefeated, 'a slot that cannot show it was made after the window was not repaired').toBe(true);
  });

  it('once the return is due (three nights, level 9), it is announced and wakes at its tier\'s full HP with its entrance', () => {
    writeSlot({ nightCount: 7 });
    const hook = bootAndArrive();
    expect(notices(), 'the due return was never announced').toContain('notice.bossReturns');
    expect(hook.result.current.bossActive, 'the due return did not wake at the lair').toBe(true);
    expect(hook.result.current.bossHealth, 'the return woke at the wipe\'s HP, not its tier\'s').toBe(bossTierStats(1).health);
    expect(notices(), 'the return woke without its entrance').toContain('notice.bossAwakens');
  });

  it('a tier-0 save of the wipe\'s shape is the fresh fight it already loads as, and the repair is recorded', () => {
    writeSlot({ bossState: { ...WIPED, tier: 0, killNight: 0 }, gameWon: false });
    bootAndArrive();
    // The poll woke it: a fresh tier-0 fight at the lair, the player at level 9.
    expect(encounterIn(useGameStore.getState())).toEqual({ health: 700, active: true, defeated: false, tier: 0, killNight: 0 });
    saveNow();
    expect(disk().migrated).toContain(REPAIR);
  });
});
