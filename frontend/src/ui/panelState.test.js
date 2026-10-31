// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PANEL_FLAGS, isAnyPanelOpen, shouldShowTitleMenu, shouldShowResumeOverlay, shouldOpenPauseOnUnlock } from './panelState.js';
import { MenuSystem } from '../MenuSystem.jsx';
import { SoundProvider } from '../SoundManager.jsx';
import { useGameStore } from '../store/useGameStore.jsx';

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
      'showWorldManager', 'showCredits', 'showTradingInterface']) {
      expect(PANEL_FLAGS).toContain(flag);
      expect(isAnyPanelOpen({ [flag]: true })).toBe(true);
    }
  });

  it('is the COMPLETE set of 13 panels (catch a forgotten new panel)', () => {
    // W1: the auth panel was deleted (auth subsystem purge) -> the auth flag is gone.
    // M-NARRATIVE.3: showQuestLog added (the quest LOG panel, now the Journal's Quests tab).
    // 2026-10-27: showStats REMOVED — the F3 readout is not a panel (panelState.js header: it stranded a player on ESC).
    // 2026-10-29: showControls added — H opens a controls panel with a scrim and a close button (the HUD lane).
    expect(PANEL_FLAGS).toEqual([
      'showInventory', 'showForge', 'showMagic', 'showBuildingTools', 'showSettings',
      'showChestInterface', 'showTradingInterface', 'showWorldManager', 'showCredits', 'showQuestLog', 'showControls',
      'showSpellUpgrades', 'showAchievements',
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

  it('is SUPPRESSED by VICTORY and the lost-context panel — each is its own way back, and the overlay would cover it', () => {
    expect(shouldShowResumeOverlay({ ...live, victoryPending: true }), 'a second scrim over Keep exploring').toBe(false);
    expect(shouldShowResumeOverlay({ ...live, isWebGLContextLost: true }), 'a second scrim over the recovery tap').toBe(false);
  });

  it('never throws on empty/null input', () => {
    expect(shouldShowResumeOverlay(null)).toBe(false);
    expect(shouldShowResumeOverlay(undefined)).toBe(false);
    expect(shouldShowResumeOverlay({})).toBe(false);
  });
});

// Mutation-Proof (2026-10-27, the Show Stats stranding): via scripts/dev/mutate.sh on src/ui/panelState.js, one batch,
// receipts in the commit:
//   A1 'showStats' re-added to PANEL_FLAGS                     -> RED expected: the close sweep, the INVARIANT, F3 + ESC
//   A2 shouldOpenPauseOnUnlock ignores an open panel            -> RED expected ("an open panel was replaced")
//   A3 shouldOpenPauseOnUnlock ignores touch                    -> RED expected
//   A0 identity (a comment edit)                               -> must SURVIVE

// F3 THEN ESC (2026-10-27): the stranding. With the readout up, an in-game unlock opened no pause panel (App read Show
// Stats as an open panel) and showed no resume overlay (same), so the player had no surface and no input. Both decisions
// now see the readout for what it is. App calls shouldOpenPauseOnUnlock on the unlock transition.
describe('Show Stats on, then ESC: a way back exists', () => {
  const live = { gameStarted: true, isAlive: true, isPointerLocked: false, isTouch: false };
  it('the pause panel opens on the unlock, readout up or not; a real panel still keeps the screen', () => {
    expect(shouldOpenPauseOnUnlock(live), 'SETUP: an in-game unlock does not open the pause panel at all').toBe(true);
    expect(shouldOpenPauseOnUnlock({ ...live, showStats: true }), 'F3 on, ESC: no pause panel — the player is stranded').toBe(true);
    expect(shouldOpenPauseOnUnlock({ ...live, showInventory: true }), 'an open panel was replaced by the pause panel').toBe(false);
    expect(shouldOpenPauseOnUnlock({ ...live, isTouch: true })).toBe(false);
    expect(shouldOpenPauseOnUnlock({ ...live, gameStarted: false })).toBe(false);
    expect(shouldOpenPauseOnUnlock({ ...live, isAlive: false })).toBe(false);
  });
  it('and if the pause panel is closed or refused, the resume overlay is there with the readout up', () => {
    expect(shouldShowResumeOverlay({ ...live, showStats: true }), 'F3 on: the resume overlay is suppressed').toBe(true);
  });
});

// WHICH PANELS ARE A WAY BACK — MEASURED, NOT ASSUMED (2026-10-27). The invariant below used to count ANY open panel flag
// as a way back (`isAnyPanelOpen(s)`), so it passed over `showStats`: F3's in-canvas readout was a panel flag with nothing
// to click, and F3 + ESC stranded a desktop player with no pause panel, no resume overlay and no input. Now a panel
// counts only if the REAL MenuSystem, rendered with that flag on and the input dead, shows a close control that closes
// THAT panel (its setter called with false). A flag that renders nothing closable — the readout, if it is ever listed
// again — is therefore no way back, and the exhaustive loop reports the stranded state.
const QUEST_STUB = { achievements: [], unlockedAchievements: [], stats: {}, quests: [] };
const setterOf = (flag) => `set${flag[0].toUpperCase()}${flag.slice(1)}`;
async function closesItself(flag) {
  const close = vi.fn();
  const NOOP = () => {};
  const flags = { [flag]: true, [setterOf(flag)]: (v) => { if (v === false) close(); } };
  // Every flag goes BOTH ways, as a store flag in gameState and as a MenuSystem prop (the React-local ones): the panel
  // reads whichever it reads, and the other is ignored.
  const gameState = { ...useGameStore.getState(), gameStarted: true, isAlive: true, requestPointerLock: NOOP, ...flags };
  // Inside the SoundProvider, as in App (the settings panel reads it).
  render(createElement(SoundProvider, null, createElement(MenuSystem, {
    gameState,
    showAchievements: false, setShowAchievements: NOOP,
    showSpellUpgrades: false, setShowSpellUpgrades: NOOP,
    showStats: false, setShowStats: NOOP,
    isPointerLocked: false, setIsPointerLocked: NOOP,
    questSystem: QUEST_STUB,
    ...flags,
  })));
  const controls = await screen.findAllByRole('button', { name: /^(close|×)$/i }, { timeout: 4000 }).catch(() => []);
  for (const c of controls) fireEvent.click(c);
  cleanup();
  return close.mock.calls.length > 0;
}

// The two covering surfaces that are not panels (coveringSurfaceUp): each suppresses the resume overlay and the pause
// panel, so each must render its own way back. VICTORY's Keep exploring dismisses it; the lost-context panel's tap runs the
// recovery (a save and a reload).
const SURFACE_FLAGS = ['victoryPending', 'isWebGLContextLost'];
async function surfaceDismisses(flag) {
  if (flag === 'victoryPending') {
    const { VictoryOverlay } = await import('../GameSystems.jsx');
    const dismiss = vi.fn();
    render(createElement(SoundProvider, null, createElement(VictoryOverlay, { onDismiss: dismiss })));
    const keep = screen.queryByTestId('victory-keep-exploring');
    if (keep) fireEvent.click(keep);
    cleanup();
    return dismiss.mock.calls.length > 0;
  }
  const { ContextLossPanel } = await import('./ContextLossPanel.jsx');
  const reload = vi.fn();
  useGameStore.setState({ isWebGLContextLost: true });
  render(createElement(ContextLossPanel, { reload }));
  const resume = screen.queryByTestId('context-loss-resume');
  if (resume) fireEvent.click(resume);
  cleanup();
  useGameStore.setState({ isWebGLContextLost: false });
  return reload.mock.calls.length > 0;
}

describe('INVARIANT: input can never be dead with no way back (exhaustive over the state space)', () => {
  // This is the gate that actually matters. The bug was not in one branch — it was that NO branch
  // owned the "lock refused" case. So enumerate the WHOLE reachable cross-product rather than
  // sampling the paths I happened to think of, because the paths I think of are exactly the ones
  // that already work.
  const LOCKED = [true, false];
  const STARTED = [true, false, undefined];
  const ALIVE = [true, false, undefined];
  const PANELS = [null, ...PANEL_FLAGS, ...SURFACE_FLAGS];
  const closable = new Set();
  beforeAll(async () => {
    for (const flag of PANEL_FLAGS) if (await closesItself(flag)) closable.add(flag);
    for (const flag of SURFACE_FLAGS) if (await surfaceDismisses(flag)) closable.add(flag);
  }, 60000);
  afterEach(cleanup);

  it('every listed panel renders a control that closes it (the measurement the invariant rests on)', () => {
    const notClosable = PANEL_FLAGS.filter((f) => !closable.has(f));
    expect(PANEL_FLAGS.length, 'SETUP: no panels listed — nothing was measured').toBeGreaterThan(0);
    expect(notClosable, 'a panel flag renders nothing that closes it — it is no way back, and it suppresses the pause panel and the resume overlay').toEqual([]);
  });

  it('VICTORY and the lost-context panel each render their own way back (they suppress the resume overlay too)', () => {
    expect(SURFACE_FLAGS.filter((f) => !closable.has(f)), 'a covering surface renders nothing that leaves it').toEqual([]);
  });

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

            // An open panel or a covering surface is a way back only if it renders its own control (measured above).
            const closablePanelOpen = [...PANEL_FLAGS, ...SURFACE_FLAGS].some((f) => s[f] && closable.has(f));
            const wayBack = closablePanelOpen || shouldShowTitleMenu(s) || shouldShowResumeOverlay(s);
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
