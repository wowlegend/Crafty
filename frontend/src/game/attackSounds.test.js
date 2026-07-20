import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeAttackSoundPlayer } from './attackSounds.js';

// V1 gate-triage: this REPLACES the vacuous `tests/gates/melee-swing-audio-gates.test.js`, which only
// readFileSync + regex'd App.jsx/Components.jsx for `playAttackSounds: () =>` / `playAttackSounds?.()` /
// `playSpatialSound('swing'` -- it proved the CODE STRINGS existed, never that a swing actually makes a
// sound. The real M6 #4 regression: `playAttackSounds` was DEFINED-BUT-NEVER-CALLED and the swing whoosh
// was MISS-ONLY, so a connecting melee hit had impact but no whoosh. The fix composes the whoosh as
// playSwing() NOW + playAttack() after a short delay, fired on every committed swing. This pins that
// COMPOSITION behaviorally on the extracted pure factory.
//
// MUTATION-PROOF: drop the `playSwing()` call in attackSounds.js and "fires the swing whoosh synchronously"
// goes RED (no swing SFX on a swing -- exactly the regression).

describe('makeAttackSoundPlayer — melee swing audio composition (behavioral)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires the swing whoosh synchronously when the swing is played', () => {
    const playSwing = vi.fn();
    const playAttack = vi.fn();
    const play = makeAttackSoundPlayer(playSwing, playAttack);
    play();
    expect(playSwing).toHaveBeenCalledTimes(1); // the whoosh is immediate -- RED if the swing SFX is dropped
    expect(playAttack).not.toHaveBeenCalled(); // the attack strike is delayed, not synchronous
  });

  it('fires the delayed attack strike after the delay (default 100ms)', () => {
    const playSwing = vi.fn();
    const playAttack = vi.fn();
    const play = makeAttackSoundPlayer(playSwing, playAttack);
    play();
    vi.advanceTimersByTime(99);
    expect(playAttack).not.toHaveBeenCalled(); // not yet
    vi.advanceTimersByTime(1);
    expect(playAttack).toHaveBeenCalledTimes(1); // fires at 100ms
  });

  it('swing precedes attack (whoosh then strike, never reversed)', () => {
    const order = [];
    const play = makeAttackSoundPlayer(() => order.push('swing'), () => order.push('attack'));
    play();
    vi.advanceTimersByTime(100);
    expect(order).toEqual(['swing', 'attack']);
  });

  it('honors an injected delay + scheduler (no dependence on the global setTimeout)', () => {
    const playAttack = vi.fn();
    let scheduled = null;
    const schedule = (fn, ms) => { scheduled = { fn, ms }; };
    const play = makeAttackSoundPlayer(vi.fn(), playAttack, { delayMs: 250, schedule });
    play();
    expect(scheduled.ms).toBe(250);
    expect(playAttack).not.toHaveBeenCalled();
    scheduled.fn();
    expect(playAttack).toHaveBeenCalledTimes(1);
  });

  it('every swing whooshes independently (a second committed swing re-fires the whoosh)', () => {
    const playSwing = vi.fn();
    const play = makeAttackSoundPlayer(playSwing, vi.fn());
    play();
    play();
    expect(playSwing).toHaveBeenCalledTimes(2); // NOT once-and-done -- guards the miss-only regression's inverse
  });
});
