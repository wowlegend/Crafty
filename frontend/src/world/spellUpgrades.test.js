import { describe, it, expect } from 'vitest';
import { requiredLevelForUpgrade } from './spellUpgrades.js';

// The single-source-of-truth player-level ladder for buying a spell upgrade. It was hard-coded identically
// in upgradeSpell() AND SpellUpgradePanel.jsx until it was extracted here; both now call this, so the two
// gates can never drift. Locks the xpCost -> required-level thresholds (incl. boundaries).
describe('requiredLevelForUpgrade — the shared spell-upgrade level ladder', () => {
  it('returns 0 for a maxed spell (no next entry)', () => {
    expect(requiredLevelForUpgrade(null)).toBe(0);
    expect(requiredLevelForUpgrade(undefined)).toBe(0);
  });
  it('xpCost <= 100 -> player level 2 (incl. the 100 boundary)', () => {
    expect(requiredLevelForUpgrade({ xpCost: 50 })).toBe(2);
    expect(requiredLevelForUpgrade({ xpCost: 100 })).toBe(2);
  });
  it('101..200 -> player level 3 (incl. the 200 boundary)', () => {
    expect(requiredLevelForUpgrade({ xpCost: 101 })).toBe(3);
    expect(requiredLevelForUpgrade({ xpCost: 200 })).toBe(3);
  });
  it('> 200 -> player level 5', () => {
    expect(requiredLevelForUpgrade({ xpCost: 201 })).toBe(5);
    expect(requiredLevelForUpgrade({ xpCost: 999 })).toBe(5);
  });
});
