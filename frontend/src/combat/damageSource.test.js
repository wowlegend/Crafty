import { describe, it, expect, vi } from 'vitest';
import { isPlayerSource, isDirectPlayerHit, attributionSource } from './damageSource.js';
import { makeBurnManager } from '../game/burnManager.js';

// THE GAME SHOOK BECAUSE SOMETHING WAS QUIETLY ON FIRE.
//
// The fireball burn calls damageMob every 1000ms for 4 ticks and omitted `source`, so it took the
// 'player' default -- and 'player' is what gates the PLAYER FEEL effects. Every tick stamped hitstop
// (clamping the player's own motion), fired a camera shake and pushed an ImpactShockwave, seconds after
// the cast, with no input.
//
// Passing 'fireball' or 'dot' instead would have fixed the feel and silently zeroed the burn's XP and
// kill attribution, because the same string gates those too. So the question is split, not the value.
describe('damageSource — attribution and feel are different questions', () => {
  it('a burn tick IS the player\'s damage', () => {
    expect(isPlayerSource('player-dot')).toBe(true);
    expect(attributionSource('player-dot')).toBe('player');
  });

  it('a burn tick is NOT the player\'s input', () => {
    expect(isDirectPlayerHit('player-dot')).toBe(false);
  });

  it('a direct hit is both', () => {
    expect(isPlayerSource('player')).toBe(true);
    expect(isDirectPlayerHit('player')).toBe(true);
    expect(attributionSource('player')).toBe('player');
  });

  it('allies and hazards are neither, and reach the bus unchanged', () => {
    for (const s of ['ally', 'hazard']) {
      expect(isPlayerSource(s), `${s} became a player source`).toBe(false);
      expect(isDirectPlayerHit(s), `${s} became a direct hit`).toBe(false);
      expect(attributionSource(s), `${s} was rewritten on the way to the bus`).toBe(s);
    }
  });

  it('an unknown source is not silently promoted to the player', () => {
    for (const s of [undefined, null, '', 'fireball', 'dot']) {
      expect(isPlayerSource(s), `${s} was treated as the player`).toBe(false);
      expect(isDirectPlayerHit(s), `${s} was treated as a direct hit`).toBe(false);
    }
  });
});

describe('burnManager — the tick declares itself indirect', () => {
  it('passes player-dot, so the tick earns XP without shaking the camera', () => {
    // The reachability half: the predicates above are worth nothing if the burn still omits the
    // argument. This drives the REAL ticker and reads the REAL call.
    vi.useFakeTimers();
    try {
      const calls = [];
      const damageMob = (...args) => { calls.push(args); return { id: 1, health: 50 }; };
      const mgr = makeBurnManager();
      mgr.start(1, 4, 5, () => damageMob);
      vi.advanceTimersByTime(1000);
      expect(calls.length, 'the burn never ticked — the test proves nothing').toBe(1);
      const [, , type, source] = calls[0];
      expect(type).toBe('fireball');
      expect(source, 'the burn tick still claims to be a direct player hit').toBe('player-dot');
      expect(isDirectPlayerHit(source), 'the tick will stamp hitstop and shake the camera').toBe(false);
      expect(isPlayerSource(source), 'the tick will lose its XP and kill credit').toBe(true);
      mgr.stopAll();
    } finally {
      vi.useRealTimers();
    }
  });
});
