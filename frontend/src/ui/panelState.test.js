import { describe, it, expect } from 'vitest';
import { PANEL_FLAGS, isAnyPanelOpen, shouldShowTitleMenu } from './panelState.js';

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

  it('covers the panels the old menu guard silently OMITTED (the bug)', () => {
    // these were absent from MenuSystem's hardcoded `!showInventory && ...` guard -> menu popped over them
    for (const flag of ['showSpellUpgrades', 'showAchievements', 'showChestInterface',
      'showWorldManager', 'showCredits', 'showTradingInterface', 'showStats']) {
      expect(PANEL_FLAGS).toContain(flag);
      expect(isAnyPanelOpen({ [flag]: true })).toBe(true);
    }
  });

  it('is the COMPLETE set of 12 panels (catch a forgotten new panel)', () => {
    // W1: the auth panel was deleted (auth subsystem purge) -> the auth flag is gone.
    expect(PANEL_FLAGS).toEqual([
      'showInventory', 'showCrafting', 'showMagic', 'showBuildingTools', 'showSettings',
      'showChestInterface', 'showTradingInterface', 'showWorldManager', 'showCredits',
      'showSpellUpgrades', 'showAchievements', 'showStats',
    ]);
  });
});

describe('shouldShowTitleMenu — the exact menu-overlay gate (not just the list)', () => {
  it('NEVER shows while dead — the DeathScreen owns that moment (KEVIN-FIX C5)', () => {
    expect(shouldShowTitleMenu({ isPointerLocked: false, isAlive: false })).toBe(false);
    expect(shouldShowTitleMenu({ isPointerLocked: false, isAlive: true })).toBe(true);
    expect(shouldShowTitleMenu({ isPointerLocked: false })).toBe(true); // pre-game: isAlive undefined
  });
  it('shows ONLY when the pointer is unlocked AND no panel is open', () => {
    expect(shouldShowTitleMenu({ isPointerLocked: false })).toBe(true);  // title / click-to-play
    expect(shouldShowTitleMenu({ isPointerLocked: true })).toBe(false);  // actively playing
    expect(shouldShowTitleMenu(null)).toBe(false);
  });

  it('is SUPPRESSED whenever ANY panel is open even with the pointer unlocked (THE bug)', () => {
    for (const flag of PANEL_FLAGS) {
      // opening a panel exits pointer-lock (isPointerLocked:false) — the menu must NOT appear over it
      expect(shouldShowTitleMenu({ isPointerLocked: false, [flag]: true })).toBe(false);
    }
  });

  it('NEVER shows once the game has started — an in-game unlock = the settings pause menu, not the title (KEVIN-FIX 2026-06-18 ESC flow)', () => {
    // pre-game (no gameStarted): the title/click-to-play screen shows
    expect(shouldShowTitleMenu({ isPointerLocked: false, isAlive: true, gameStarted: false })).toBe(true);
    // in-game ESC-unlock: the title menu must NOT flash in (App opens the pause panel on the transition)
    expect(shouldShowTitleMenu({ isPointerLocked: false, isAlive: true, gameStarted: true })).toBe(false);
  });
});
