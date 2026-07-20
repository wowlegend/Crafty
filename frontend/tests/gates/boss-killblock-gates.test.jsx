// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { applyBossDamage, runBossKillEffects } from '../../src/game/bossKill';
import { useBossSystem } from '../../src/world/bossSystem';
import { useGameStore } from '../../src/store/useGameStore';
import { GameMethods } from '../../src/GameMethods';
import { BOSS_CONFIG } from '../../src/game/bossConfig';

// B2h — THE BOSS KILL RAN INSIDE A setState UPDATER; ONE THROW VOIDED THE WIN IRRECOVERABLY.
// (18-domain review, HIGH.)
//
// The whole kill (~8 side effects) ran inside `setBossHealth(prev => {...})` with the idempotency latch set
// FIRST and the win latch (markGameWon) LAST. If a reward threw (grantXP, loot), every effect after it —
// including the win — silently didn't run, while the idempotency latch was already set, so a retry
// short-circuited. Result: bossHealth 0, bossDefeated true, gameWon FALSE forever. The game's win, voided.
//
// FIX: `applyBossDamage` is the pure updater (health only); the effects moved to a post-commit runner that
// runs each in ISOLATION with the win latch LAST, so a throwing reward can't strand the win.
//
// MUTATION-PROOF: in game/bossKill.js drop the isolation (`const isolate = (name, fn) => fn?.();`) — the
// "a throwing reward does not void the win" gate goes RED.

describe('B2h applyBossDamage — the pure updater', () => {
  it('subtracts and clamps, and reports the kill', () => {
    expect(applyBossDamage(700, 100)).toEqual({ newHealth: 600, killed: false });
    expect(applyBossDamage(50, 100)).toEqual({ newHealth: 0, killed: true });
    expect(applyBossDamage(100, 100)).toEqual({ newHealth: 0, killed: true });
  });
});

describe('B2h runBossKillEffects — isolation with the win last', () => {
  it('a throwing effect does not stop the effects after it (the win still runs)', () => {
    const order = [];
    const failed = runBossKillEffects([
      ['reward', () => { throw new Error('boom'); }],
      ['loot', () => order.push('loot')],
      ['win', () => order.push('win')],
    ]);
    expect(order).toEqual(['loot', 'win']);      // both ran despite 'reward' throwing
    expect(failed.map((f) => f.name)).toEqual(['reward']);
  });
});

// End-to-end through the REAL hook: force-spawn the boss (DEV hook), damage it to 0, and assert the win
// fires — even when a reward throws. Proves the effects are wired AND isolated.
const spawnBoss = () => {
  const fn = useGameStore.getState().forceBossSpawn;
  expect(fn, 'forceBossSpawn (DEV) must be registered').toBeTypeOf('function');
  act(() => fn([0, 50, 0]));
};

describe('B2h wiring — the win survives a throwing reward', () => {
  let originalGrantXP;
  beforeEach(() => {
    originalGrantXP = GameMethods.grantXP;
    useGameStore.setState({ gameWon: false });
  });
  afterEach(() => { GameMethods.grantXP = originalGrantXP; });

  it('killing the boss grants the win, XP, and the hitstop beat', () => {
    const grantXP = vi.fn();
    GameMethods.grantXP = grantXP;
    const { rerender } = renderHook(({ lvl }) => useBossSystem(lvl), { initialProps: { lvl: 10 } });
    spawnBoss();
    rerender({ lvl: 10 });

    act(() => useGameStore.getState().damageBoss(BOSS_CONFIG.health + 100)); // one-shot to 0
    rerender({ lvl: 10 });

    expect(useGameStore.getState().gameWon).toBe(true);
    expect(grantXP).toHaveBeenCalledWith(BOSS_CONFIG.xpReward, 'Shadow Dragon Defeated!');
    expect(useGameStore.getState().hitstopUntil).toBeGreaterThan(0);
  });

  it('THE BUG: a reward that THROWS must not void the win', () => {
    GameMethods.grantXP = () => { throw new Error('reward blew up'); };
    const { rerender } = renderHook(({ lvl }) => useBossSystem(lvl), { initialProps: { lvl: 10 } });
    spawnBoss();
    rerender({ lvl: 10 });

    act(() => useGameStore.getState().damageBoss(BOSS_CONFIG.health + 100));
    rerender({ lvl: 10 });

    // Before the fix the throw stranded markGameWon (which ran after grantXP in the updater). Now the win
    // latch runs LAST and each effect is isolated, so the win survives.
    expect(useGameStore.getState().gameWon).toBe(true);
  });
});
