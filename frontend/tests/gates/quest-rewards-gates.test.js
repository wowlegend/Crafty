import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// B4 — quest rewards wiring. The reward math is unit-tested (game/questRewards.test.js); this pins
// that claimQuest actually GRANTS the full bundle (xp + coins + item), not just xp (the XP-only bug),
// and that quests carry itemReward gear payoffs. Fails closed if a refactor drops coins/items.
describe('B4 quest-rewards wiring (claim grants xp + coins + item)', () => {
  const qs = read('QuestSystem.jsx');

  it('imports questRewards', () => {
    expect(qs).toMatch(/import \{ questRewards \} from '\.\/game\/questRewards/);
  });
  it('claimQuest computes the normalized reward bundle from the claimed quest', () => {
    expect(qs).toMatch(/const r = questRewards\(claimedQuest\)/);
  });
  it('grants coins + routes the item into inventory (not xp-only)', () => {
    expect(qs).toMatch(/store\.addCoins\(r\.coins\)/);
    expect(qs).toMatch(/store\.addToInventory\(r\.item\.item, r\.item\.count\)/);
  });
  it('quests carry itemReward gear payoffs (earn back the B6-stripped gear)', () => {
    expect(qs).toMatch(/itemReward:\s*\{\s*item:\s*'Iron Sword'/);
    expect(qs).toMatch(/itemReward:\s*\{\s*item:\s*'Diamond Sword'/);
  });
});
