import { describe, it, expect } from 'vitest';
import { ITEMS, getItemRarity } from '../../src/data/items.js';

describe('boss reward items are registered legendaries', () => {
  it('Crown of the Dragon King is a registered legendary', () => {
    const entry = Object.values(ITEMS).find(i => i.name === 'Crown of the Dragon King');
    expect(entry).toBeTruthy();
    expect(getItemRarity('Crown of the Dragon King')).toBe('legendary');
  });
  it('Dragon Scale is a registered epic', () => {
    const entry = Object.values(ITEMS).find(i => i.name === 'Dragon Scale');
    expect(entry).toBeTruthy();
    expect(getItemRarity('Dragon Scale')).toBe('epic');
  });
});
