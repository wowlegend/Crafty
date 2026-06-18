import { describe, it, expect } from 'vitest';
import { nametagFor } from '../../src/game/nametagData.js';

describe('nametagFor', () => {
  it('hostile mob -> name + health bar + danger color, only within range', () => {
    const tag = nametagFor({ type: 'zombie', health: 30, maxHealth: 60, passive: false, isAlly: false }, 20);
    expect(tag.text).toBeTruthy();
    expect(tag.showBar).toBe(true);
    expect(tag.hpFrac).toBeCloseTo(0.5);
    expect(tag.visible).toBe(true);
  });
  it('beyond the LOD range -> not visible', () => {
    expect(nametagFor({ type: 'zombie', health: 30, maxHealth: 60, passive: false }, 999).visible).toBe(false);
  });
  it('NPC / passive -> name only (no health bar)', () => {
    const tag = nametagFor({ type: 'villager', health: 120, maxHealth: 120, passive: true, npcName: 'Bram the Trader' }, 10);
    expect(tag.showBar).toBe(false);
    expect(tag.text).toBe('Bram the Trader');
  });
  it('bound ally -> jade color, friendly read', () => {
    expect(nametagFor({ type: 'zombie', health: 50, maxHealth: 60, isAlly: true }, 10).color).toMatch(/3DFFB0|jade/i);
  });
});
