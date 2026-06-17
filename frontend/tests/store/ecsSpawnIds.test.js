import { describe, it, expect, beforeEach } from 'vitest';
import { GameMethods } from '../../src/GameMethods.js';
import { ecs } from '../../src/ecs/world.js';
// Side-effect import: SimplifiedNPCSystem assigns GameMethods.spawnLootDrop at
// module-eval time (the test seam). Without it, GameMethods is the bare {} export.
import '../../src/SimplifiedNPCSystem.jsx';

describe('ECS spawn entities carry a unique id', () => {
  beforeEach(() => { for (const e of [...ecs.entities]) ecs.remove(e); });

  it('loot drops each get a defined unique id', () => {
    GameMethods.spawnLootDrop('bone', 0, [0, 10, 0]);
    GameMethods.spawnLootDrop('bone', 0, [1, 10, 0]);
    const loot = [...ecs.entities].filter(e => e.isLootDrop);
    expect(loot.length).toBe(2);
    expect(loot.every(e => e.id !== undefined)).toBe(true);
    expect(new Set(loot.map(e => e.id)).size).toBe(2);
  });
});
