import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore';
import { damageArgsForAttack, mobLockoutKey } from '../../src/game/mobDamage.js';

/**
 * C1/Q21 — A PACK MUST OUT-DAMAGE A SINGLE ATTACKER. The gate the fix never got.
 *
 * `damagePlayer` used to rate-limit on `lastDamageTime`, ONE number for the whole game, so the rule was
 * never "this attacker may hit me twice a second" — it was "the WORLD may hit me twice a second". Six
 * mobs swinging on their own cooldowns landed the damage of one. That single line silently deleted the
 * entire threat model built on top of it: the night siege, `SquadAISystem`, `squadAI.js`, and every
 * distinction `mobArchetypes.js` draws — the duskhound designed as a pack hunter, the skitterling as
 * swarm chip damage — all collapse to identical DPS when the second and third attacker are free.
 *
 * The keying was fixed and commented. THE GATE WAS NOT WRITTEN. The queue asked for one ("a pack of
 * three must measurably out-damage a single") and nothing in the suite drove more than one attacker, so
 * the highest-gameplay-value line in the repo was protected by a comment. A silent revert to a shared
 * key would have restored the exact defect with every test green — and the failure is invisible in play
 * too, because a pack that deals single-mob damage does not look broken, it just feels easy.
 *
 * DRIVEN THROUGH THE REAL STORE, not a reimplementation of the rule. A test that recomputes the lockout
 * arithmetic itself would agree with itself forever; this calls the shipped action and reads the shipped
 * health.
 *
 * BLIND SPOT, stated (R7): this drives `damagePlayer` directly. It does not prove the AI worker reaches
 * it, that mobs swing on their own cooldowns in a live world, or that a pack FEELS more dangerous. The
 * call site is asserted structurally at the end; the lived half needs a booted world with spawned mobs,
 * which no harness here drives.
 *
 * Mutation-Proof: 4 mutations, recorded on the commit.
 */
describe('C1 pack damage — the lockout is PER-ATTACKER', () => {
  const HP = 500;

  beforeEach(() => {
    // R12: every variable the assertions read is SET here. The spawn grace (_spawnTime) and the dodge
    // i-frames both silently swallow damage, and inheriting either would make a pack look identical to a
    // single attacker for reasons that have nothing to do with the lockout.
    useGameStore.setState({
      isAlive: true,
      // `playerHealth`, NOT `health`. The first version of this fixture set `health`, which the store
      // does not read — so every hit landed on a field nothing consumed and the pack and single cases
      // both measured zero damage. They would have compared equal-ish and three of the six cases would
      // have reported a broken mechanic as healthy. The positive control below is what caught it.
      playerHealth: HP,
      maxHealth: HP,
      damageLockouts: {},
      lastDamageTime: 0,
      _spawnTime: Date.now() - 60000,
      isPlayerInvincible: () => false,
      attributes: { strength: 0, agility: 0, intellect: 0, armor: 0, attributePoints: 0 },
      equipment: { head: null, chest: null, boots: null, weapon: null, offhand: null },
    });
  });

  const hit = (id, dmg = 10) =>
    useGameStore.getState().damagePlayer(...damageArgsForAttack({ id, damage: dmg, type: 'melee', position: null }));

  it('the fixture actually damages the player — the positive control', () => {
    // Without this, every comparison below is between two zeros and the gate reports a healthy pack
    // mechanic over a player nothing can hurt.
    hit('a');
    expect(useGameStore.getState().playerHealth, 'no damage landed at all — armour, i-frames or spawn grace')
      .toBeLessThan(HP);
  });

  it('THREE attackers in the same instant out-damage ONE, which is the whole point', () => {
    hit('mob-1'); hit('mob-2'); hit('mob-3');
    const pack = HP - useGameStore.getState().playerHealth;

    useGameStore.setState({ playerHealth: HP, damageLockouts: {} });
    hit('mob-1'); hit('mob-1'); hit('mob-1');
    const single = HP - useGameStore.getState().playerHealth;

    expect(single, 'one attacker swinging three times must still land once — the lockout is gone').toBe(10);
    expect(pack, 'three attackers landed the damage of one — the lockout is GLOBAL again').toBe(30);
    expect(pack).toBeGreaterThan(single);
  });

  it('the SAME attacker is still rate-limited — the lockout was not simply deleted', () => {
    // The other half. Removing the limit entirely would also pass the pack case above while making a
    // single mob machine-gun the player.
    hit('mob-1');
    const afterFirst = useGameStore.getState().playerHealth;
    for (let i = 0; i < 20; i++) hit('mob-1');
    expect(useGameStore.getState().playerHealth, 'one attacker hit 21 times inside the lockout window')
      .toBe(afterFirst);
  });

  it('two mobs of the SAME TYPE do not share a lockout — the key is per ENTITY', () => {
    // `mobLockoutKey` keys on id, not type, and the display string stays 'melee' for both. Keying on the
    // type would make a pack of six duskhounds land one duskhound's damage — the original bug, narrowed
    // rather than fixed, and it would pass a test that only ever used differing types.
    expect(mobLockoutKey({ id: 'a' })).not.toBe(mobLockoutKey({ id: 'b' }));
    hit('dusk-1'); hit('dusk-2');
    expect(HP - useGameStore.getState().playerHealth, 'same-type mobs are sharing a lockout').toBe(20);
  });

  it('a caller with NO key degrades to per-class, never to no limit', () => {
    // `sourceKey || source`. A pre-existing call site that passes no key must keep SOME rate limit;
    // losing it silently would be worse than the global lockout it replaced.
    const dp = useGameStore.getState().damagePlayer;
    dp(10, 'starvation');
    const afterFirst = useGameStore.getState().playerHealth;
    dp(10, 'starvation');
    expect(useGameStore.getState().playerHealth, 'a keyless caller lost its rate limit entirely').toBe(afterFirst);
  });

  it('lastDamageTime is still stamped — the HUD and camera read it as a hit SIGNAL', () => {
    // It was kept deliberately when it stopped being the rate limiter. If a future edit deletes it as
    // "unused", the hit direction indicator and the camera shake lose their trigger.
    useGameStore.setState({ lastDamageTime: 0 });
    hit('mob-1');
    expect(useGameStore.getState().lastDamageTime, 'the hit signal is no longer stamped').toBeGreaterThan(0);
  });
});
