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
