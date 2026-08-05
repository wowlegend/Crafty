import { describe, it, expect } from 'vitest';
import { PANEL_FLAGS, isAnyPanelOpen, shouldShowTitleMenu, shouldShowResumeOverlay } from './panelState.js';

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

  it('is the COMPLETE set of 13 panels (catch a forgotten new panel)', () => {
    // W1: the auth panel was deleted (auth subsystem purge) -> the auth flag is gone.
    // M-NARRATIVE.3: showQuestLog added (the quest LOG panel, L).
    expect(PANEL_FLAGS).toEqual([
      'showInventory', 'showCrafting', 'showMagic', 'showBuildingTools', 'showSettings',
      'showChestInterface', 'showTradingInterface', 'showWorldManager', 'showCredits', 'showQuestLog',
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

// ---------------------------------------------------------------------------------------------
// KEVIN-REPORT 2026-08-05: "press ESC for the menu, press ESC to quit it -> character frozen, dies
// to a mob." Root cause: ESC is the browser's DEFAULT UNLOCK GESTURE, and per MDN, calling
// requestPointerLock() immediately after that gesture "will fail, EVEN IF a transient activation is
// available" — a documented, deterministic refusal that no retry or timer can defeat, only a fresh
// click. Every panel onClose in MenuSystem relocks OPTIMISTICALLY (KEVIN-FIX C4), so on refusal the
// player landed with: no panel, active=false (movement gated on it at Components.jsx:861), and
// shouldShowTitleMenu false because gameStarted — i.e. NO SURFACE AT ALL. Mobs do not gate on
// active, so the freeze is fatal.
//
// The fix is not "retry the lock" (physically impossible) — it is the INVARIANT below.
// ---------------------------------------------------------------------------------------------

describe('shouldShowResumeOverlay — the recovery surface for a REFUSED pointer-lock', () => {
  const live = { gameStarted: true, isAlive: true, isPointerLocked: false };

  it('shows when the game is live, input is dead, and no panel is offering a way back', () => {
    expect(shouldShowResumeOverlay(live)).toBe(true);
  });

  it('does NOT show while input is live — it is a recovery surface, not a HUD element', () => {
    expect(shouldShowResumeOverlay({ ...live, isPointerLocked: true })).toBe(false);
  });

  it('does NOT show before the game has started — the title menu owns that moment', () => {
    expect(shouldShowResumeOverlay({ ...live, gameStarted: false })).toBe(false);
    expect(shouldShowResumeOverlay({ isPointerLocked: false })).toBe(false);
  });

  it('does NOT show while dead — the DeathScreen owns that moment (same rule as the title menu)', () => {
    expect(shouldShowResumeOverlay({ ...live, isAlive: false })).toBe(false);
  });

  it('is SUPPRESSED by EVERY canonical panel — an open panel is already a way back', () => {
    for (const flag of PANEL_FLAGS) {
      expect(shouldShowResumeOverlay({ ...live, [flag]: true })).toBe(false);
    }
  });

  it('never throws on empty/null input', () => {
    expect(shouldShowResumeOverlay(null)).toBe(false);
    expect(shouldShowResumeOverlay(undefined)).toBe(false);
    expect(shouldShowResumeOverlay({})).toBe(false);
  });
});

describe('INVARIANT: input can never be dead with no way back (exhaustive over the state space)', () => {
  // This is the gate that actually matters. The bug was not in one branch — it was that NO branch
  // owned the "lock refused" case. So enumerate the WHOLE reachable cross-product rather than
  // sampling the paths I happened to think of, because the paths I think of are exactly the ones
  // that already work.
  const LOCKED = [true, false];
  const STARTED = [true, false, undefined];
  const ALIVE = [true, false, undefined];
  const PANELS = [null, ...PANEL_FLAGS];

  it('holds for every combination of lock x gameStarted x isAlive x panel', () => {
    const stranded = [];
    let checked = 0;
    for (const isPointerLocked of LOCKED) {
      for (const gameStarted of STARTED) {
        for (const isAlive of ALIVE) {
          for (const panel of PANELS) {
            checked++;
            const s = { isPointerLocked, gameStarted, isAlive };
            if (panel) s[panel] = true;

            // "input is dead" = the exact gate Components.jsx:861 reads to allow movement.
            const inputDead = !isPointerLocked;
            // the game is LIVE (a mob can kill you) — dead players are the DeathScreen's problem.
            const gameLive = gameStarted === true && isAlive !== false;
            if (!(inputDead && gameLive)) continue;

            const wayBack = isAnyPanelOpen(s) || shouldShowTitleMenu(s) || shouldShowResumeOverlay(s);
            if (!wayBack) stranded.push(JSON.stringify(s));
          }
        }
      }
    }
    // Guard the DENOMINATOR: a gate whose loop silently enumerated nothing reports a clean pass
    // over input it never examined — the failure mode this repo has shipped three times.
    expect(checked).toBe(LOCKED.length * STARTED.length * ALIVE.length * PANELS.length);
    expect(stranded).toEqual([]);
  });
});
