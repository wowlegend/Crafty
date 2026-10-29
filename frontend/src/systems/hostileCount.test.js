import { describe, it, expect } from 'vitest';
import { countLiveHostiles } from './hostileCount.js';

describe('countLiveHostiles', () => {
  it('counts live mobs that are not passive: not livestock, not a hub NPC, not a corpse at zero health', () => {
    const mobs = [
      { type: 'zombie', health: 40, passive: false },
      { type: 'spider', health: 1, passive: false },
      { type: 'ox', health: 30, passive: true },
      { type: 'villager', health: 200, passive: true, isNPC: true },
      { type: 'zombie', health: 0, passive: false, dyingUntil: 9 },
      null,
    ];
    expect(countLiveHostiles(mobs)).toBe(2);
    expect(countLiveHostiles([])).toBe(0);
    expect(countLiveHostiles(undefined)).toBe(0);
  });
});
