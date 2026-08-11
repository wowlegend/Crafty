import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stepEnemyProjectiles, ENEMY_PROJECTILE_SPEED_SCALE, ENEMY_PROJECTILE_HIT_RADIUS, ENEMY_PROJECTILE_TTL_SEC } from './enemyProjectiles.js';

const mk = (pos, vel, age = 0) => ({ id: 1, position: new THREE.Vector3(...pos), velocity: new THREE.Vector3(...vel), age });
const FAR_PLAYER = new THREE.Vector3(999, 999, 999);

describe('stepEnemyProjectiles (pure)', () => {
  it('advances position by velocity * dt * 60 (legacy per-frame-at-60fps units), mutating IN PLACE (zero alloc)', () => {
    const p = mk([0, 0, 0], [0.4, 0, 0]);
    const posRef = p.position;
    const { survivors } = stepEnemyProjectiles([p], 1 / 60, FAR_PLAYER);
    expect(survivors).toHaveLength(1);
    expect(p.position).toBe(posRef);                       // same object — no clone per step
    expect(p.position.x).toBeCloseTo(0.4, 5);              // 0.4 * (1/60) * 60
    expect(ENEMY_PROJECTILE_SPEED_SCALE).toBe(60);
  });

  it('expires at TTL: age >= 3s drops out, hits stays 0', () => {
    const p = mk([0, 0, 0], [0, 0, 0], 2.99);
    const r1 = stepEnemyProjectiles([p], 0.005, FAR_PLAYER);
    expect(r1.survivors).toHaveLength(1);                  // 2.995 < 3
    const r2 = stepEnemyProjectiles(r1.survivors, 0.01, FAR_PLAYER);
    expect(r2.survivors).toHaveLength(0);                  // 3.005 >= 3
    expect(r2.hits).toBe(0);
    expect(ENEMY_PROJECTILE_TTL_SEC).toBe(3);
  });

  it('player hit inside 1.5u: removed + counted', () => {
    const player = new THREE.Vector3(1, 0, 0);
    const p = mk([0, 0, 0], [0, 0, 0]);                     // 1.0u away < 1.5
    const { survivors, hits } = stepEnemyProjectiles([p], 0.016, player);
    expect(hits).toBe(1);
    expect(survivors).toHaveLength(0);
    expect(ENEMY_PROJECTILE_HIT_RADIUS).toBe(1.5);
  });

  it('no membership change => survivors are the SAME refs in the same order (caller can detect transitions by length)', () => {
    const a = mk([0, 0, 0], [0.1, 0, 0]); const b = mk([5, 0, 0], [0, 0.1, 0], 1);
    const { survivors, hits } = stepEnemyProjectiles([a, b], 0.016, FAR_PLAYER);
    expect(hits).toBe(0);
    expect(survivors[0]).toBe(a);
    expect(survivors[1]).toBe(b);
  });
});

// AN ARROW THAT PASSED STRAIGHT THROUGH THE PLAYER.
//
// This is hurl.js's twin, and it had the exact defect hurl.js was rewritten to fix: the whole frame delta
// integrated in ONE jump, with a single post-advance point sample against a 1.5 u hit radius. At 24 u/s a
// dead-centre pass is missed once dt exceeds ~0.125 s, and a 1.4 u grazing pass needs only ~0.045 s.
// Nothing clamps dt: @react-three/fiber 9.5.0 passes clock.getDelta() straight through, the system
// forwards it raw, and there is no project-level cap -- while hurl.js's own header records dt = 0.50 s
// OBSERVED in this repo at nearly identical geometry.
describe('stepEnemyProjectiles — a frame spike cannot tunnel an arrow through you', () => {
  const V = (x, y, z) => ({
    x, y, z,
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; },
    distanceTo(o) { return Math.hypot(this.x - o.x, this.y - o.y, this.z - o.z); },
  });
  const arrow = (fromZ, dirZ = 1) => ({ position: V(0, 0, fromZ), velocity: V(0, 0, dirZ * 0.4), age: 0 });
  const PLAYER = V(0, 0, 0);

  it('registers a DEAD-CENTRE pass on a long frame', () => {
    // 0.5s at 24 u/s is 12 units -- from -6 straight through the player to +6, entirely past the radius.
    const { hits, survivors } = stepEnemyProjectiles([arrow(-6)], 0.5, PLAYER);
    expect(hits, 'the arrow passed through the player and was never counted').toBe(1);
    expect(survivors).toHaveLength(0);
  });

  it('registers a GRAZING pass, which needs only a ~45ms frame to be missed', () => {
    const grazing = { position: V(1.4, 0, -3), velocity: V(0, 0, 0.4), age: 0 };
    const { hits } = stepEnemyProjectiles([grazing], 0.3, PLAYER);
    expect(hits, 'the grazing pass was missed').toBe(1);
  });

  it('counts a passing arrow ONCE, not once per substep', () => {
    // The opposite error, and just as invisible: a substepped loop that kept going after a hit would turn
    // one arrow into a dozen 15-damage hits on a long frame.
    const { hits } = stepEnemyProjectiles([arrow(-6)], 1.0, PLAYER);
    expect(hits).toBe(1);
  });

  it('still misses an arrow that genuinely goes past — the control', () => {
    const wide = { position: V(8, 0, -6), velocity: V(0, 0, 0.4), age: 0 };
    const { hits, survivors } = stepEnemyProjectiles([wide], 0.3, PLAYER);
    expect(hits, 'an arrow eight units off-axis "hit" the player').toBe(0);
    expect(survivors).toHaveLength(1);
  });

  it('advances the same TOTAL distance as the unsubstepped version, within the frame cap', () => {
    const a = arrow(-100);
    stepEnemyProjectiles([a], 0.1, V(0, 0, 500));
    expect(a.position.z).toBeCloseTo(-100 + 0.1 * 0.4 * 60, 6);
    expect(a.age).toBeCloseTo(0.1, 6);
  });

  it('caps a pathological frame instead of running hundreds of substeps', () => {
    const a = arrow(-1000);
    stepEnemyProjectiles([a], 30, V(0, 0, 5000));
    expect(a.age, 'a 30-second frame advanced the arrow 30 seconds').toBeLessThanOrEqual(0.25 + 1e-9);
  });

  it('survives a garbage delta rather than emitting NaN positions', () => {
    const a = arrow(-5);
    stepEnemyProjectiles([a], NaN, PLAYER);
    expect(Number.isFinite(a.position.z)).toBe(true);
  });
});
