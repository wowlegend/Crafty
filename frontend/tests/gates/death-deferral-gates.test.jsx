// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as THREE from 'three';
import { ecs, mobsQuery } from '../../src/ecs/world';
import { CombatSystem } from '../../src/systems/CombatSystem';
import { GameMethods } from '../../src/GameMethods';
import { MOB_TYPES } from '../../src/game/mobTypes';
import { DEATH_DISSOLVE_MS } from '../../src/game/deathFx.js';
import { sweepExpiredCorpses, isRenderableMob } from '../../src/systems/corpseSweep.js';
import { subscribeMobKill } from '../../src/game/mobKillBus.js';
import { canPlayerDamage } from '../../src/combat/targeting.js';

// THE DEATH-DEFERRAL LIFECYCLE, DRIVEN THROUGH THE REAL SYSTEM.
//
// M2 #7 (death weight): a kill no longer makes the mob vanish on the frame it dies. The finisher fires
// (XP, spark, kill-bus), `dyingUntil` is stamped, and the corpse keeps rendering until the dissolve
// elapses and the sweep retires it. Three linked facts.
//
// They were asserted by three source regexes across two files — `if (entity.health <= 0 &&
// !entity.dyingUntil)`, the `dyingUntil = performance.now() + DEATH_DISSOLVE_MS` assignment, and the
// render filter's `health > 0 || dyingUntil`. Each pins the exact spelling of an expression rather than
// what it does: a correct rewrite reds them, and a real regression (the assignment moved above the guard,
// the deadline computed from the wrong clock, the filter applied to the wrong array) passes them. Worse,
// the property that actually matters here is a SEQUENCE — fire once, defer, sweep later — and a regex
// over file text cannot see a sequence at all.
//
// CombatSystem renders in jsdom and publishes `damageMob` onto GameMethods (the sibling arcane-pierce
// suite already does this), so the sequence can simply be run.
vi.mock('../../src/SoundManager', () => ({ useGameSounds: () => ({ playHit: () => {} }) }));

const clearWorld = () => { for (const e of [...ecs.entities]) ecs.remove(e); };

const spawnMob = (id, health = MOB_TYPES.zombie.health) => ecs.add({
  isMob: true, id, type: 'zombie', passive: false,
  health, maxHealth: MOB_TYPES.zombie.health, xp: MOB_TYPES.zombie.xp,
  position: new THREE.Vector3(0, 0, 0),
});

const liveMob = (id) => [...mobsQuery.entities].find((e) => e.id === id);

beforeEach(() => {
  clearWorld();
  render(<CombatSystem setDamageNumbers={() => {}} setShockwaves={() => {}} damageId={{ current: 0 }} />);
});
afterEach(() => { cleanup(); clearWorld(); });

describe('a kill DEFERS removal behind the dissolve', () => {
  it('the mob is still in the world after the killing blow, with a deadline stamped on it', () => {
    spawnMob(1, 10);
    const before = performance.now();
    GameMethods.damageMob(1, 999, 'physical', 'player');

    const mob = liveMob(1);
    expect(mob, 'the mob was removed on the frame it died — the death beat never plays').toBeTruthy();
    expect(mob.health).toBeLessThanOrEqual(0);
    expect(mob.dyingUntil, 'no dissolve deadline was stamped').toBeGreaterThanOrEqual(before + DEATH_DISSOLVE_MS);
    expect(mob.dyingUntil).toBeLessThanOrEqual(performance.now() + DEATH_DISSOLVE_MS + 50);
  });

  it('the corpse keeps RENDERING while it dissolves, and stops once it is gone', () => {
    spawnMob(1, 10);
    expect(isRenderableMob(liveMob(1)), 'a living mob is not rendered').toBe(true);
    GameMethods.damageMob(1, 999, 'physical', 'player');
    expect(isRenderableMob(liveMob(1)), 'the corpse vanishes on the frame it dies').toBe(true);

    // And the converse, which is the half a `health > 0 || dyingUntil` grep could not check: a dead
    // entity with no deadline must NOT render, or a failed sweep leaves an invisible mob on screen.
    expect(isRenderableMob({ health: 0 })).toBe(false);
    expect(isRenderableMob(null)).toBe(false);
  });

  // A NOTE FOR WHOEVER MUTATION-TESTS THIS NEXT: fire-once has TWO independent guards, and breaking
  // either one alone leaves the test below GREEN. That is correct sensitivity, not a vacuous test, and
  // it was established by measurement rather than assumed:
  //
  //   · targeting.js `canPlayerDamage` -> `isDefeated` refuses any entity at health<=0 OR mid-dissolve,
  //     at CombatSystem.jsx:33, BEFORE a single side effect fires.
  //   · CombatSystem.jsx:113's own `&& !entity.dyingUntil` term.
  //
  // Weakening `isDefeated` alone: green. Deleting the `!entity.dyingUntil` term alone: green. Doing BOTH:
  // red, on this test. So the property really is "the finisher fires once", and it survives the loss of
  // either layer — which is what defence-in-depth is supposed to look like. The next test pins the outer
  // guard on its own, so neither layer can rot unobserved behind the other.
  it('the finisher fires exactly ONCE — a hit on a dissolving corpse cannot re-kill it', () => {
    const kills = [];
    const off = subscribeMobKill((type) => kills.push(type));
    try {
      spawnMob(1, 10);
      GameMethods.damageMob(1, 999, 'physical', 'player');
      expect(kills.length, 'the kill bus did not fire at all').toBe(1);

      GameMethods.damageMob(1, 999, 'physical', 'player');
      GameMethods.damageMob(1, 999, 'physical', 'player');
      expect(kills.length, 'a corpse can be re-killed — every extra hit pays XP and quest credit again').toBe(1);
    } finally { off(); }
  });

  it('the OUTER guard refuses a dissolving corpse on its own, so it cannot rot behind the inner one', () => {
    // Pinned separately BECAUSE the two layers mask each other. Without this, `isDefeated` could lose its
    // `dyingUntil` term entirely and every other assertion in this file would still pass — the exact
    // shape of "a gate that reports healthy over the thing it stopped examining".
    expect(canPlayerDamage({ health: 100 }), 'a living mob cannot be damaged').toBe(true);
    expect(canPlayerDamage({ health: 0 }), 'a dead mob is still damageable').toBe(false);
    expect(canPlayerDamage({ health: 40, dyingUntil: performance.now() + 100 }),
      'a dissolving corpse is still damageable — every targeter that walks mobsQuery can hit it').toBe(false);
  });
});

describe('the sweep retires the corpse, on the deadline and not before', () => {
  it('holds the corpse until the dissolve elapses, then removes it', () => {
    spawnMob(1, 10);
    GameMethods.damageMob(1, 999, 'physical', 'player');
    const deadline = liveMob(1).dyingUntil;

    expect(sweepExpiredCorpses(mobsQuery.entities, deadline - 1, (e) => ecs.remove(e)),
      'the corpse was swept BEFORE its dissolve finished — the animation is cut short').toBe(0);
    expect(liveMob(1), 'swept early').toBeTruthy();

    expect(sweepExpiredCorpses(mobsQuery.entities, deadline, (e) => ecs.remove(e)),
      'the corpse outlived its deadline — an invisible mob stays in mobsQuery, occupying targeter and grass-bend slots').toBe(1);
    expect(liveMob(1), 'the corpse is still in the world after the sweep').toBeFalsy();
  });

  it('leaves LIVING mobs alone', () => {
    // The presence case for the sweep: a predicate that removed everything would satisfy the test above.
    spawnMob(1, 10);
    spawnMob(2, 100);
    GameMethods.damageMob(1, 999, 'physical', 'player');
    sweepExpiredCorpses(mobsQuery.entities, performance.now() + DEATH_DISSOLVE_MS + 1, (e) => ecs.remove(e));
    expect(liveMob(2), 'the sweep removed a living mob').toBeTruthy();
    expect(liveMob(1)).toBeFalsy();
  });
});
