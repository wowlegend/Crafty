import { describe, it, expect } from 'vitest';
import { projectileGravity, PROJECTILE_GRAVITY } from '../../src/game/projectilePhysics.js';

// B8 — FIREBALL (the DEFAULT starting spell) COULD NOT HIT ANYTHING PAST ~12 METRES. (18-domain review, HIGH.)
//
// fireball/iceball are launched STRAIGHT along the crosshair (camera.getWorldDirection()), like lightning
// and arcane — but uniquely got `velocity.y -= 12 * delta` every frame, so a level-aimed shot arced into
// the ground. The starting spell was unusable at range: aim != hit.
//
// FIX: per-type drop (game/projectilePhysics.js); fireball/iceball drop = 0 (straight flight). This gate
// simulates the REAL projectile integration (the EnhancedMagicSystem useFrame: velocity.y -= drop*delta;
// position += velocity*delta) and asserts a level-aimed fireball reaches a mob 25 m downrange.
//
// MUTATION-PROOF: set PROJECTILE_GRAVITY.fireball back to 12 -> the "hits at 25 m" case goes RED.

// fireball: speed 25, size 1.2 -> hit radius = size + 1.5 = 2.7 (checkMobCollision uses size + 1.5).
const SPEED = 25;
const HIT_RADIUS = 1.2 + 1.5;
const DT = 1 / 60;

// Simulate a LEVEL-aimed fireball from eye height and return the closest it passes to a mob `dist` m
// downrange at body height. Mirrors the real per-frame integration.
function closestApproach(dist, gravity) {
  const pos = { x: 0, y: 3.0, z: 0 };          // ~eye height
  const vel = { x: 0, y: 0, z: -SPEED };        // level shot, straight downrange
  const mob = { x: 0, y: 1.0, z: -dist };       // mob centre at ~ground + 1
  let best = Infinity;
  for (let t = 0; t < 4; t += DT) {             // maxAge is a few seconds
    if (gravity) vel.y -= gravity * DT;
    pos.x += vel.x * DT; pos.y += vel.y * DT; pos.z += vel.z * DT;
    const d = Math.hypot(pos.x - mob.x, pos.y - mob.y, pos.z - mob.z);
    if (d < best) best = d;
    if (pos.z < mob.z - 2) break;               // passed the mob
  }
  return best;
}

describe('B8 fireball range — the default spell hits at range', () => {
  it('the per-type drop for the direct-fire spells is 0 (straight flight, aim == hit)', () => {
    expect(projectileGravity('fireball')).toBe(0);
    expect(projectileGravity('iceball')).toBe(0);
    expect(projectileGravity('lightning')).toBe(0); // unlisted -> straight, unchanged
  });

  it('reproduces the bug: with the old 12/s^2 gravity a level fireball MISSES a mob 25 m away', () => {
    expect(closestApproach(25, 12)).toBeGreaterThan(HIT_RADIUS); // dropped below the mob -> miss
  });

  it('with the fix a level fireball HITS a mob 25 m away', () => {
    expect(closestApproach(25, projectileGravity('fireball'))).toBeLessThan(HIT_RADIUS);
  });

  it('a close shot still connected even under the old gravity (12 m was the ceiling)', () => {
    expect(closestApproach(10, 12)).toBeLessThan(HIT_RADIUS);        // near range worked (bug was RANGE)
    expect(closestApproach(10, projectileGravity('fireball'))).toBeLessThan(HIT_RADIUS);
  });

  it('the fireball travels far enough to matter (flies straight past 25 m)', () => {
    // sanity: the constant is a real knob, not a hidden magic literal
    expect(PROJECTILE_GRAVITY).toHaveProperty('fireball');
    expect(closestApproach(35, projectileGravity('fireball'))).toBeLessThan(HIT_RADIUS);
  });
});
