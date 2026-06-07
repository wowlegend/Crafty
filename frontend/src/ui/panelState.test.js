import { describe, it, expect } from 'vitest';
import { PANEL_FLAGS, isAnyPanelOpen } from './panelState.js';

// Locks the menu-overlay / key-gate single-source-of-truth (the 2026-06-07 U-key bug: two hand-kept
// lists drifted, so the main menu popped OVER the Aspect tree + 7 other panels). A regression here means
// a panel was added/removed without keeping the canonical list — fix the list, not the test.

describe('isAnyPanelOpen — single source of truth for panel-open', () => {
  it('false when nothing is open (and for empty/null input)', () => {
    expect(isAnyPanelOpen(null)).toBe(false);
    expect(isAnyPanelOpen(undefined)).toBe(false);
    expect(isAnyPanelOpen({})).toBe(false);
    expect(isAnyPanelOpen({ unrelated: true, isPointerLocked: false })).toBe(false);
  });

  it('true when ANY single panel flag is set — for EVERY canonical panel', () => {
    for (const flag of PANEL_FLAGS) {
      expect(isAnyPanelOpen({ [flag]: true })).toBe(true);
    }
  });

  it('covers the 8 panels the old menu guard silently OMITTED (the bug)', () => {
    // these were absent from MenuSystem's hardcoded `!showInventory && ...` guard -> menu popped over them
    for (const flag of ['showSpellUpgrades', 'showAchievements', 'showChestInterface',
      'showWorldManager', 'showCredits', 'showTradingInterface', 'showAuthModal', 'showStats']) {
      expect(PANEL_FLAGS).toContain(flag);
      expect(isAnyPanelOpen({ [flag]: true })).toBe(true);
    }
  });

  it('is the COMPLETE set of 13 panels (catch a forgotten new panel)', () => {
    expect(PANEL_FLAGS).toEqual([
      'showInventory', 'showCrafting', 'showMagic', 'showBuildingTools', 'showSettings',
      'showChestInterface', 'showTradingInterface', 'showWorldManager', 'showCredits',
      'showSpellUpgrades', 'showAchievements', 'showStats', 'showAuthModal',
    ]);
  });
});
