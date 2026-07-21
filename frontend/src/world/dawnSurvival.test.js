import { describe, it, expect, vi } from 'vitest';
import { resolveDawn } from './dawnSurvival.js';

// V1 gate-triage: this REPLACES the one vacuous sub-test of `tests/gates/survival-quests-gates.test.js` --
// its "the dawn->survive_nights wiring is in place" case was a pure source-grep (readFileSync + regex of
// survivalSystem.js/QuestSystem.jsx for `onNightSurvived` / `if (r)...onNightSurvived`). It proved the
// STRINGS existed, never the actual invariant: the survive_nights quest must be credited EXACTLY ONCE per
// genuinely-survived night. grantDawnReward guards once-per-night internally and returns its descriptor
// only when it truly granted (null on a re-fired/duplicate dawn, a remount, or a mid-run reload); the dawn
// handler credits the quest IFF that descriptor is truthy. A bug that credits on `nightCount > 0` instead
// of on the grant result would double-count the quest on every re-fired dawn. This pins that coupling on
// the extracted pure decision. (The gate's other 4 cases are genuine data-driven contract tests -- kept.)
//
// MUTATION-PROOF: change `creditSurvivedNight: !!reward` to `survived > 0` in dawnSurvival.js and the
// "a duplicate dawn (grant returns null) does NOT credit" case goes RED (it would double-count).

describe('resolveDawn — survive_nights credit is gated on the dawn grant (behavioral)', () => {
  it('night 0 (no night survived yet): does not grant and does not credit', () => {
    const grant = vi.fn(() => ({ xp: 1, coins: 1, lootItem: 'x' }));
    const out = resolveDawn(0, grant);
    expect(grant).not.toHaveBeenCalled(); // the survived>0 gate
    expect(out.reward).toBeNull();
    expect(out.creditSurvivedNight).toBe(false);
    expect(out.message).toBe('Dawn breaks! You survived the night!');
  });

  it('a genuinely-survived night (grant returns a descriptor): credits the quest once + builds the reward message', () => {
    const grant = vi.fn(() => ({ xp: 120, coins: 20, lootItem: 'Iron Ingot' }));
    const out = resolveDawn(3, grant);
    expect(grant).toHaveBeenCalledTimes(1);
    expect(grant).toHaveBeenCalledWith(3); // grants for the night actually survived (== nightCount)
    expect(out.reward).toEqual({ xp: 120, coins: 20, lootItem: 'Iron Ingot' });
    expect(out.creditSurvivedNight).toBe(true); // fire onNightSurvived
    expect(out.message).toBe('Dawn! +120 XP, +20 coins, Iron Ingot!');
  });

  it('a duplicate / re-fired dawn (grant returns null though nightCount>0): does NOT credit — the once-per-night guard', () => {
    const grant = vi.fn(() => null); // grantDawnReward already rewarded this night
    const out = resolveDawn(3, grant);
    expect(grant).toHaveBeenCalledTimes(1);
    expect(out.reward).toBeNull();
    expect(out.creditSurvivedNight).toBe(false); // RED if credit keys on nightCount instead of the grant result
    expect(out.message).toBe('Dawn breaks! You survived the night!'); // the fallback message, no double-count
  });
});
