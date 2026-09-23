// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { useBossSystem } from '../../src/world/bossSystem';
import { useGameStore } from '../../src/store/useGameStore';
import { GameMethods } from '../../src/GameMethods';
import { blightHeartSite } from '../../src/world/blightHeart';
import { bossTierStats, RETURN_NIGHTS, LEVEL_STEP, BOSS_BASE_LEVEL, showsVictory } from '../../src/game/bossTier.js';
import { carriersOf } from './_srcWalk.js';

/**
 * THE DRAGON RETURNS — through the REAL hook (QUEUE C3, plan Task 3).
 *
 * Drives useBossSystem to the real spawn condition (the level, standing at the lair, the 1500 ms arrival
 * poll), kills it, then advances nights and levels and walks back. The pure tier table (boss-tier-gates) says
 * what a tier IS; this says the fight actually becomes one: the kill bumps the tier, the win still lands, the
 * dragon does not wake early, and when it does it has the tier's health.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh against src/world/bossSystem.js, each observed RED:
 *   B1 the kill never bumps the tier                    B2 plausible-wrong: the return ignores the nights
 *   B3 plausible-wrong: the return ignores the level     B4 the return spawns at tier 0's health
 *   B5 the tier bump placed AFTER a throwing reward, un-isolated (the win-strand shape)
 *   B6 the reawakening announced every poll              B7 plausible-wrong: rewards read from tier 0
 *   B8 BossEntity reads BOSS_CONFIG.phases again (structural)
 *   B9 the return's entrance says "the Shadow Dragon" again   B10 = B4 re-proven on the refactored line
 *   V1 plausible-wrong: showsVictory back to `tier === 1` (a throwing tier step strands VICTORY — R4.5)
 *   V2 showsVictory ignores the tier (a return kill announces the win again)
 *
 * BLIND SPOT: BossEntity's per-phase speed/damage come from bossTierStats(bossTier) by source shape only
 * (a structural check at the end); whether the tier-2 dragon FEELS harder is a person-playing question.
 */
const lair = blightHeartSite();
const atLair = { x: lair.x, y: 40, z: lair.z };
const poll = () => act(() => { vi.advanceTimersByTime(1600); });

const arm = (over = {}) => useGameStore.setState({
  playerPosition: atLair, gameWon: false, isCaptureMode: false, hitstopUntil: 0, hitstopStart: 0,
  bossHealth: bossTierStats(0).health, bossActive: false, bossDefeated: false, bossTier: 0, bossKillNight: 0,
  nightCount: 5, getMobGroundLevel: null, unlockedTalents: {}, ...over,
});

/** Spawn at `lvl`, kill it, and return the hook. */
const fightAndKill = (lvl) => {
  const hook = renderHook(({ l }) => useBossSystem(l), { initialProps: { l: lvl } });
  poll();
  expect(useGameStore.getState().bossActive, 'the dragon never spawned — the scenario did not happen').toBe(true);
  act(() => useGameStore.getState().damageBoss(99999));
  hook.rerender({ l: lvl });
  return hook;
};

describe('C3 — a kill makes the next dragon a tier stronger, and the first is still the win', () => {
  let grantXP;
  beforeEach(() => { vi.useFakeTimers(); arm(); grantXP = GameMethods.grantXP; GameMethods.grantXP = vi.fn(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); GameMethods.grantXP = grantXP; });

  it('the tier-0 kill: the win, tier 1, and the night it happened on', () => {
    fightAndKill(BOSS_BASE_LEVEL);
    const s = useGameStore.getState();
    expect(s.gameWon).toBe(true);
    expect(s.bossTier).toBe(1);
    expect(s.bossKillNight).toBe(5);
    expect(s.bossDefeated).toBe(true);
    expect(GameMethods.grantXP).toHaveBeenCalledWith(bossTierStats(0).xpReward, 'Shadow Dragon Defeated!');
  });

  it('the TIER step itself throwing still lands the win AND its VICTORY screen (review #3, R4.5)', () => {
    const setBossEncounter = useGameStore.getState().setBossEncounter;
    // Only the TIER write throws: the hook's per-change sync (bossSystem.js) calls the same action without a tier.
    useGameStore.setState({
      setBossEncounter: (e) => { if (e.tier !== undefined) throw new Error('tier write blew up'); return setBossEncounter(e); },
    });
    try {
      const hook = fightAndKill(BOSS_BASE_LEVEL);
      expect(useGameStore.getState().gameWon, 'the win itself was stranded').toBe(true);
      const r = hook.result.current;
      expect(r.bossTier, 'the tier step did not actually fail — this case tested nothing').toBe(0);
      expect(showsVictory({ bossDefeated: r.bossDefeated, bossTier: r.bossTier, victoryDismissed: false }),
        'the player won the game and VICTORY stayed hidden').toBe(true);
    } finally {
      useGameStore.setState({ setBossEncounter });
    }
  });

  it('a reward that THROWS still lands the tier bump and the win', () => {
    GameMethods.grantXP = () => { throw new Error('reward blew up'); };
    fightAndKill(BOSS_BASE_LEVEL);
    expect(useGameStore.getState().gameWon).toBe(true);
    expect(useGameStore.getState().bossTier).toBe(1);
  });
});

describe('C3 — the slain dragon waits, then returns at its tier', () => {
  let grantXP;
  beforeEach(() => { vi.useFakeTimers(); arm(); grantXP = GameMethods.grantXP; GameMethods.grantXP = vi.fn(); });
  afterEach(() => { cleanup(); vi.useRealTimers(); GameMethods.grantXP = grantXP; });

  const due = BOSS_BASE_LEVEL + LEVEL_STEP;

  it('not a night early, even at the level', () => {
    const hook = fightAndKill(BOSS_BASE_LEVEL);
    act(() => useGameStore.setState({ nightCount: 5 + RETURN_NIGHTS - 1 }));
    hook.rerender({ l: due });
    poll(); poll();
    expect(useGameStore.getState().bossActive).toBe(false);
  });

  it('not a level early, even on the night', () => {
    const hook = fightAndKill(BOSS_BASE_LEVEL);
    act(() => useGameStore.setState({ nightCount: 5 + RETURN_NIGHTS }));
    hook.rerender({ l: due - 1 });
    poll(); poll();
    expect(useGameStore.getState().bossActive).toBe(false);
  });

  it('when both are due, arriving at the lair wakes it — at TIER 1\'s health, with its name', () => {
    const hook = fightAndKill(BOSS_BASE_LEVEL);
    act(() => useGameStore.setState({ nightCount: 5 + RETURN_NIGHTS }));
    hook.rerender({ l: due });
    poll();
    const s = useGameStore.getState();
    expect(s.bossActive).toBe(true);
    expect(s.bossDefeated).toBe(false);
    expect(hook.result.current.bossHealth).toBe(bossTierStats(1).health);
    expect(hook.result.current.bossMaxHealth).toBe(bossTierStats(1).health);
    expect(hook.result.current.bossName).toBe(bossTierStats(1).name);
    // The ENTRANCE names the tier too (review 2026-09-22: it still said "the Shadow Dragon awakens").
    expect(hook.result.current.bossNotification).toBe(`The Blight Heart stirs -- the ${bossTierStats(1).name} awakens! [Climax]`);
  });

  it('killing the return pays the TIER\'s reward and makes the next one tier 2', () => {
    const hook = fightAndKill(BOSS_BASE_LEVEL);
    act(() => useGameStore.setState({ nightCount: 8 }));
    hook.rerender({ l: due });
    poll();
    GameMethods.grantXP = vi.fn();
    act(() => useGameStore.getState().damageBoss(99999));
    hook.rerender({ l: due });
    expect(useGameStore.getState().bossTier).toBe(2);
    expect(useGameStore.getState().bossKillNight).toBe(8);
    expect(GameMethods.grantXP).toHaveBeenCalledWith(bossTierStats(1).xpReward, `${bossTierStats(1).name} Defeated!`);
  });

  it('a reload DURING a return fight keeps the dragon\'s HP (review 2026-09-22: it refilled)', () => {
    // The store hydrates an active tier-1 fight at 200 HP; the hook mounts with nothing spawned, the arrival
    // poll re-places the dragon at the lair — and must not treat it as a fresh return.
    arm({ bossActive: true, bossDefeated: false, bossTier: 1, bossKillNight: 4, bossHealth: 200, gameWon: true, nightCount: 9 });
    const hook = renderHook(({ l }) => useBossSystem(l), { initialProps: { l: due } });
    poll();
    expect(hook.result.current.bossHealth, 'the reload refilled a wounded return fight').toBe(200);
    expect(useGameStore.getState().bossActive).toBe(true);
  });

  it('the reawakening is announced ONCE when it becomes due, before the player gets there', () => {
    const hook = fightAndKill(BOSS_BASE_LEVEL);
    act(() => useGameStore.setState({ nightCount: 8, playerPosition: { x: lair.x + 500, y: 40, z: lair.z } }));
    hook.rerender({ l: due });
    // Count RISING EDGES of the toast, sampled every 100 ms for 15 s. A single end-state check was
    // coincidence-prone: the toast's clear timers are never cancelled, so a re-announce every poll can
    // happen to be cleared at the instant it is sampled — that mutant survived the first version of this.
    let edges = 0, was = false;
    for (let i = 0; i < 150; i++) {
      act(() => { vi.advanceTimersByTime(100); });
      const on = /stirs again/i.test(hook.result.current.bossNotification || '');
      if (on && !was) edges++;
      was = on;
    }
    expect(edges, 'the reawakening was announced more than once (or never)').toBe(1);
    expect(useGameStore.getState().bossActive, 'announced, but it must wait for the player at the lair').toBe(false);
  });
});

describe('showsVictory — the first dragon\'s screen, never a return kill\'s', () => {
  it('tier 0 (the tier step failed) and 1 (the first kill) show it; a return kill (2+) and a dismissal do not', () => {
    expect(showsVictory({ bossDefeated: true, bossTier: 1 })).toBe(true);
    expect(showsVictory({ bossDefeated: true, bossTier: 0 })).toBe(true);
    expect(showsVictory({ bossDefeated: true, bossTier: 2 })).toBe(false);
    expect(showsVictory({ bossDefeated: true, bossTier: 1, victoryDismissed: true })).toBe(false);
    expect(showsVictory({ bossDefeated: false, bossTier: 1 })).toBe(false);
  });
});

describe('C3 — the renderer and the health bar read the tier (weak, structural)', () => {
  it('BossEntity takes its phase speed and damage from the tier, and the scene passes the tier in', () => {
    expect(carriersOf(/const tierPhases = useMemo\(\(\) => bossTierStats\(bossTier\)\.phases/)).toEqual(['render/BossEntity.jsx']);
    expect(carriersOf(/BOSS_CONFIG\.phases\[bossPhase\]/), 'a phase read straight from BOSS_CONFIG is back').toEqual([]);
    expect(carriersOf(/bossTier=\{bossSystem\.bossTier\}/)).toEqual(['GameScene.jsx']);
    expect(carriersOf(/bossName=\{bossSystem\.bossName\}/)).toEqual(['HUD.jsx']);
    // The VICTORY overlay is the first dragon's: gated on the tier that kill produces, so a return kill after
    // a reload does not announce the win again (review 2026-09-22).
    expect(carriersOf(/showsVictory\(\{ bossDefeated: bossSystem\?\.bossDefeated, bossTier: bossSystem\?\.bossTier, victoryDismissed \}\)/)).toEqual(['HUD.jsx']);
  });
});

