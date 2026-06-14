import { describe, it, expect } from 'vitest';
import { RECIPES } from '../../src/data/recipes.js';

// Cooking recipes (2026-06-14, content/depth). Mobs drop Raw Porkchop / Raw Beef, and the inventory consumes
// Cooked Porkchop / Cooked Beef as (better) food (GamePanels), but NO recipe bridged raw->cooked -> the
// food-sustain loop was incomplete. This adds "cook over coal" recipes. RECIPES is extracted to a pure data
// module (the loot-tables precedent) so the recipe set is unit-testable, not just inline in the panel.

const key = (pattern) => JSON.stringify(pattern);

describe('the crafting recipe set', () => {
  it('every recipe has a non-empty pattern + a non-empty output', () => {
    expect(RECIPES.length).toBeGreaterThan(0);
    for (const r of RECIPES) {
      expect(Array.isArray(r.pattern)).toBe(true);
      expect(r.pattern.length).toBeGreaterThan(0);
      expect(Object.keys(r.output || {}).length).toBeGreaterThan(0);
    }
  });

  it('cooking recipes turn raw meat + coal into cooked food', () => {
    const pork = RECIPES.find(r => r.output && r.output['Cooked Porkchop']);
    const beef = RECIPES.find(r => r.output && r.output['Cooked Beef']);
    expect(pork, 'no Cooked Porkchop recipe').toBeDefined();
    expect(beef, 'no Cooked Beef recipe').toBeDefined();
    // each uses its raw cut + coal as fuel
    expect(JSON.stringify(pork.pattern)).toMatch(/Raw Porkchop/);
    expect(JSON.stringify(pork.pattern)).toMatch(/coal/);
    expect(JSON.stringify(beef.pattern)).toMatch(/Raw Beef/);
    expect(JSON.stringify(beef.pattern)).toMatch(/coal/);
  });

  it('a Health Potion is craftable from gathered loot (alchemy sustain path)', () => {
    const potion = RECIPES.find(r => r.output && r.output['Health Potion']);
    expect(potion, 'no Health Potion recipe').toBeDefined();
    // crafted from items the player gathers as loot (not free) — Emerald is the healing essence
    expect(JSON.stringify(potion.pattern)).toMatch(/Emerald/);
  });

  it('no two recipes share an identical pattern (each is reachable)', () => {
    const seen = new Set();
    for (const r of RECIPES) {
      const k = key(r.pattern);
      expect(seen.has(k), `duplicate pattern for ${r.name}`).toBe(false);
      seen.add(k);
    }
  });
});
