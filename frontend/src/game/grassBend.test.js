import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { collectBendSources, readPosition, BEND_SLOTS, INACTIVE } from './grassBend.js';

// The bug this exists to stop: the old inline version read `entity.position[0]` from live ECS
// entities, whose position is a THREE.Vector3. Indexing a Vector3 gives undefined -> NaN in the
// uniform -> the shader's `pos.y > 9990.0` skip is false for NaN, so the slot was burned and nothing
// bent. Mob grass-bending never worked and nothing reported it.

describe('readPosition — both position shapes this codebase actually carries', () => {
  it('reads a THREE.Vector3 (what ECS entities store — SpawnerSystem, npcSpawn)', () => {
    expect(readPosition(new THREE.Vector3(1, 2, 3))).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('reads an [x,y,z] array (what the store mirror stores — MinimapSyncSystem)', () => {
    expect(readPosition([4, 5, 6])).toEqual({ x: 4, y: 5, z: 6 });
  });

  it('reads a plain object (the store playerPosition)', () => {
    expect(readPosition({ x: 7, y: 8, z: 9 })).toEqual({ x: 7, y: 8, z: 9 });
  });

  it('DROPS anything non-finite instead of emitting NaN — NaN is what made the bug silent', () => {
    expect(readPosition(null)).toBeNull();
    expect(readPosition(undefined)).toBeNull();
    expect(readPosition({})).toBeNull();
    expect(readPosition([1, 2])).toBeNull();            // short array -> z undefined
    expect(readPosition({ x: NaN, y: 1, z: 2 })).toBeNull();
  });
});

describe('collectBendSources', () => {
  const P = { x: 10, y: 20, z: 30 };

  it('THE REGRESSION: a Vector3-positioned mob yields FINITE coordinates', () => {
    const mobs = [{ position: new THREE.Vector3(1, 2, 3) }];
    const slots = collectBendSources(P, mobs);
    expect(slots[1]).toEqual([1, 2, 3]);
    // and every emitted component is finite — the whole point
    for (const [x, y, z] of slots) {
      expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
    }
  });

  it('puts the player in slot 0 and mobs after it', () => {
    const slots = collectBendSources(P, [{ position: [1, 1, 1] }]);
    expect(slots[0]).toEqual([10, 20, 30]);
    expect(slots[1]).toEqual([1, 1, 1]);
  });

  it('always returns exactly 8 slots, padding with the shader sentinel', () => {
    const slots = collectBendSources(P, []);
    expect(slots).toHaveLength(BEND_SLOTS);
    expect(slots[1]).toEqual([INACTIVE, INACTIVE, INACTIVE]);
    // the sentinel must satisfy the shader's own skip test (`pos.y > 9990.0`)
    expect(slots[1][1]).toBeGreaterThan(9990);
  });

  it('never overflows the 8 slots the shader declares, however many mobs exist', () => {
    const mobs = Array.from({ length: 50 }, (_, i) => ({ position: new THREE.Vector3(i, i, i) }));
    const slots = collectBendSources(P, mobs);
    expect(slots).toHaveLength(BEND_SLOTS);
    expect(slots[7]).toEqual([6, 6, 6]); // player took slot 0, so mobs 0..6 fill 1..7
  });

  it('works with no player (pre-spawn) and skips malformed mobs without burning a slot', () => {
    const slots = collectBendSources(null, [{ position: null }, { position: new THREE.Vector3(5, 5, 5) }]);
    expect(slots[0]).toEqual([5, 5, 5]);
    expect(slots[1]).toEqual([INACTIVE, INACTIVE, INACTIVE]);
  });

  it('tolerates a null mob list', () => {
    expect(collectBendSources(P, null)).toHaveLength(BEND_SLOTS);
  });
});
