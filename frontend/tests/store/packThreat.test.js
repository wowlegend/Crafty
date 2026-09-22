// A PACK OF SIX DEALT THE DAMAGE OF ONE.
//
// `damagePlayer` opened with `if (now - state.lastDamageTime < 500) return;` and `lastDamageTime` is ONE
// number for the whole game. So the lockout was never "this attacker may hit me twice a second" — it was
// "the WORLD may hit me twice a second". A duskhound, a moss brute and four skitterlings swinging on their
// own cooldowns landed, between them, the damage of a single mob.
//
// That one line silently deleted the threat model above it: the night siege, world/SquadAISystem.jsx,
// game/squadAI.js, and every distinction game/mobArchetypes.js draws between archetypes. Numbers were
// tuned per archetype in a data table that the damage path then collapsed into one shared budget.
//
// WHY THESE ASSERTIONS AND NOT A TIMING TEST. The invariant is about IDENTITY, not duration: damage is
// rate-limited per ATTACKER, so N distinct attackers in one window are N hits and one attacker in one
// window is one hit. Both halves are needed — the first alone passes if you simply delete the lockout,
// which would let a single mob machine-gun the player at frame rate.
//
// Drives the REAL store through the REAL damagePlayer. A pure helper passing proves nothing about whether
// the damage path calls it.
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';

const HIT = 10;

const reset = (over = {}) => {
  useGameStore.setState({
    isAlive: true,
    playerHealth: 100,
    maxHealth: 100,
    lastDamageTime: 0,
    damageLockouts: {},
    hitstopUntil: 0,
    lastHitDir: null,
    _spawnTime: 0,
    isPlayerInvincible: () => false,
    attributes: { strength: 1, agility: 1, intellect: 1, vitality: 1 },
    equipment: {},
    ...over,
  });
};

const health = () => useGameStore.getState().playerHealth;

describe('a pack is a pack — the damage lockout is per attacker, not global', () => {
  beforeEach(() => reset());

  // PRESENCE CONTROL, first. Every assertion below counts hits that DID land; if the damage path were
  // dead they would all read "0 hits" and look like a passing lockout.
  it('a single hit lands at all', () => {
    useGameStore.getState().damagePlayer(HIT, 'melee', null, 'mob:1');
    expect(health(), 'the damage path did not fire — every count below would be meaningless').toBe(90);
  });

  it('six distinct attackers in one window deal SIX hits, not one', () => {
    for (let i = 1; i <= 6; i++) {
      useGameStore.getState().damagePlayer(HIT, 'melee', null, `mob:${i}`);
    }
    // 100 - 6*10. Under the global lockout this read 90: one hit, five silently dropped.
    expect(health(), 'the pack collapsed into a single attacker — the global lockout is still in place').toBe(40);
  });

  it('ONE attacker hitting six times in the same window still deals ONE hit', () => {
    for (let i = 0; i < 6; i++) {
      useGameStore.getState().damagePlayer(HIT, 'melee', null, 'mob:7');
    }
    expect(health(), 'the per-attacker lockout is gone — one mob can machine-gun the player').toBe(90);
  });

  // The boss's four attacks are four distinct sources and SHOULD each land; that is the same invariant
  // seen from the other side, and it is the one that makes the fight read as a combo rather than a drip.
  it('the boss landing bite + shockwave in one window deals both', () => {
    useGameStore.getState().damagePlayer(HIT, 'Shadow Dragon Bite', null, 'boss:bite');
    useGameStore.getState().damagePlayer(HIT, 'Shadow Dragon Shockwave', null, 'boss:shockwave');
    expect(health()).toBe(80);
  });

  // Callers that pass no key must still be rate-limited — they fall back to the display source, which is
  // what every pre-existing call site relies on. This is the row that keeps the change backward-safe.
  it('a caller with no sourceKey falls back to its source string and is still limited', () => {
    useGameStore.getState().damagePlayer(HIT, 'starvation');
    useGameStore.getState().damagePlayer(HIT, 'starvation');
    expect(health(), 'an unkeyed caller lost its rate limit').toBe(90);
  });
});
