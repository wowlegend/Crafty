import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { siegeWarning } from '../../src/game/dayNight.js';

// Night-count + siege escalation in the nightfall warning (2026-06-14, next-levers #8). The nightfall
// banner was a fixed "Night has fallen... Hostile mobs are stronger!" with NO night number — the player
// couldn't tell WHICH night they were on or read the escalation (the siege ramps via siegeParams but
// invisibly). This adds a tiered, numbered warning so the siege has a readable ladder + a survival score.
const __dir = dirname(fileURLToPath(import.meta.url));
const survival = readFileSync(resolve(__dir, '../../src/world/survivalSystem.js'), 'utf8');

describe('siegeWarning (pure)', () => {
  it('includes the night NUMBER', () => {
    expect(siegeWarning(1)).toMatch(/Night 1/);
    expect(siegeWarning(7)).toMatch(/Night 7/);
  });
  it('escalates the phrasing across night tiers', () => {
    const early = siegeWarning(1);
    const mid = siegeWarning(4);
    const late = siegeWarning(9);
    expect(early).not.toBe(mid);
    expect(mid).not.toBe(late);
    expect(early).not.toBe(late);
  });
  it('clamps a nullish / <=0 / NaN night to night 1 (never "Night 0")', () => {
    expect(siegeWarning(0)).toMatch(/Night 1/);
    expect(siegeWarning(undefined)).toMatch(/Night 1/);
    expect(siegeWarning(NaN)).toMatch(/Night 1/);
    expect(siegeWarning(-3)).toMatch(/Night 1/);
  });
});

describe('the nightfall warning uses the numbered siege message', () => {
  it('survivalSystem composes the warning via siegeWarning(nightCount)', () => {
    expect(survival).toMatch(/siegeWarning/);
    expect(survival).toMatch(/nightCount/);
    // the old fixed string must be gone (replaced by the numbered one)
    expect(survival).not.toMatch(/Night has fallen\.\.\. Hostile mobs are stronger!/);
  });
});
