// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { paceFor, TITLE_FPS, PANEL_FPS, BLUR_FPS } from '../../src/render/canvasPace.js';
import { useWindowFocused } from '../../src/render/useWindowFocused.js';

/**
 * WHO DECIDES HOW OFTEN THE GAME CANVAS DRAWS (plan 2026-09-23-crafty-perf-heat-ipad, Task 3). Behind the opaque title
 * screen the game canvas drew the whole world at the display rate while nobody could see it. paceFor is the one
 * decision; this drives every combination of its three inputs.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   P1 the title case removed -> "the covered canvas drew at the setting's rate"
 *   P2 plausible-wrong: the title case STOPS the canvas (fps 0 on demand) -> "the covered canvas never draws"
 *   P3 plausible-wrong: the harness check after the title check -> "the harness was paced"
 *   P4 plausible-wrong: Unlimited paced at 60 -> "Unlimited is capped"
 *   and P0, an identity mutant (a comment edit in canvasPace.js, same harness and batch), SURVIVED.
 *
 * BLIND SPOT: that GameScene reads this, and that MenuSystem's title flag reaches the store, is the e2e's
 * (tests/e2e/frame-cap.spec.js); that the pace BINDS is the same e2e's 1 fps case.
 */
describe('paceFor', () => {
  it('in play, the setting decides: 60 -> paced at 60, Unlimited -> the display rate', () => {
    expect(paceFor({ frameCap: 60, titleCovering: false, harness: false })).toEqual({ loop: 'demand', fps: 60 });
    expect(paceFor({ frameCap: 0, titleCovering: false, harness: false }), 'Unlimited is capped').toEqual({ loop: 'always', fps: 0 });
  });
  it('behind the title, the covered canvas draws slowly whatever the setting — never at the display rate, never not at all', () => {
    for (const frameCap of [60, 0]) {
      const p = paceFor({ frameCap, titleCovering: true, harness: false });
      expect(p.loop, 'the covered canvas drew at the setting\'s rate').toBe('demand');
      expect(p.fps, 'the covered canvas drew at the setting\'s rate').toBe(TITLE_FPS);
      expect(p.fps, 'the covered canvas never draws — Start would pay for every shader compile at once').toBeGreaterThan(0);
    }
    expect(TITLE_FPS, 'a title pace at or above the cap saves nothing').toBeLessThan(60);
  });
  it('the capture harness and the perf probe are never paced, title or not', () => {
    for (const titleCovering of [false, true]) {
      for (const frameCap of [60, 0]) {
        expect(paceFor({ frameCap, titleCovering, harness: true }), 'the harness was paced').toEqual({ loop: 'always', fps: 0 });
      }
    }
  });
});

/**
 * PACING BEYOND THE TITLE (plan 2026-10-27-crafty-steady-cool, item g; masterpiece 0g). A panel covers the canvas with
 * a full-screen bg-ink/75 scrim (ui/GamePanels.jsx), and an unfocused desktop window is not being looked at; both drew
 * the world at the full rate. Behind a panel: 30 fps (still alive behind the scrim); unfocused: 10. Never ABOVE the
 * player's cap, never under the harness.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh on src/render/canvasPace.js and src/render/useWindowFocused.js, receipts in
 * the commit:
 *   P5 the panel case removed                                  -> RED expected
 *   P6 the unfocused case removed                              -> RED expected
 *   P7 plausible-wrong: the panel pace ignores a lower cap      -> RED expected (a 1 fps cap is exceeded)
 *   P8 plausible-wrong: the panel case checked before unfocused -> RED expected (a blurred window with a panel draws 30)
 *   P9 the window blur listener removed                        -> RED expected (the hook never sees the blur)
 *   P10 plausible-wrong: the harness check after the new cases  -> RED expected
 */
describe('paceFor — behind a panel and in an unfocused window', () => {
  const pace = (o) => paceFor({ frameCap: 60, titleCovering: false, panelCovering: false, unfocused: false, harness: false, ...o });
  it('a panel over the canvas: 30 fps under the cap and under Unlimited', () => {
    expect(PANEL_FPS).toBe(30);
    expect(pace({ panelCovering: true })).toEqual({ loop: 'demand', fps: PANEL_FPS });
    expect(pace({ panelCovering: true, frameCap: 0 }), 'Unlimited drew at the display rate behind a panel').toEqual({ loop: 'demand', fps: PANEL_FPS });
  });
  it('an unfocused window: 10 fps, whether or not a panel is open', () => {
    expect(BLUR_FPS).toBe(10);
    expect(pace({ unfocused: true })).toEqual({ loop: 'demand', fps: BLUR_FPS });
    expect(pace({ unfocused: true, panelCovering: true }), 'a blurred window with a panel open drew at the panel pace').toEqual({ loop: 'demand', fps: BLUR_FPS });
    expect(pace({ unfocused: true, frameCap: 0 })).toEqual({ loop: 'demand', fps: BLUR_FPS });
  });
  it('never above the cap the player (or a test) set', () => {
    expect(pace({ panelCovering: true, frameCap: 1 })).toEqual({ loop: 'demand', fps: 1 });
    expect(pace({ unfocused: true, frameCap: 1 })).toEqual({ loop: 'demand', fps: 1 });
  });
  it('the title still wins, and the harness wins over everything', () => {
    expect(pace({ titleCovering: true, panelCovering: true, unfocused: true })).toEqual({ loop: 'demand', fps: TITLE_FPS });
    expect(pace({ harness: true, panelCovering: true, unfocused: true }), 'the harness was paced').toEqual({ loop: 'always', fps: 0 });
  });
  it('nothing covering, focused: the setting decides, as before', () => {
    expect(pace({})).toEqual({ loop: 'demand', fps: 60 });
    expect(pace({ frameCap: 0 })).toEqual({ loop: 'always', fps: 0 });
  });
});

describe('useWindowFocused — the unfocused input, from the window, desktop only', () => {
  it('follows blur and focus on a fine pointer', () => {
    const { result } = renderHook(() => useWindowFocused({ finePointer: true }));
    expect(result.current, 'SETUP: jsdom starts unfocused').toBe(document.hasFocus());
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(result.current, 'a focus event was not seen').toBe(true);
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(result.current, 'a blur event was not seen').toBe(false);
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(result.current).toBe(true);
  });
  it('a coarse pointer (iPad) always reads focused — the OS throttles a hidden page itself', () => {
    const { result } = renderHook(() => useWindowFocused({ finePointer: false }));
    act(() => { window.dispatchEvent(new Event('blur')); });
    expect(result.current).toBe(true);
  });
});

/**
 * SHOW STATS IS NOT A COVERING PANEL (review 2026-10-27, steady-cool HIGH 1). Show Stats (F3) is a panel FLAG — the key
 * gate and the menu guard read it — but it draws the frame-time readout inside the canvas, with no scrim. Published as
 * "covering", it paced the game to 30 fps, so the readout reported the pace instead of the game, and it unmounted the
 * tier governor's monitor (governorSamples). This renders the REAL MenuSystem against the real store and reads what it
 * publishes; the F3 key end to end is tests/e2e/canvas-pace-panels.spec.js.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED, an identity mutant SURVIVED (receipts in the commit):
 *   C1 MenuSystem publishes isAnyPanelOpen again (the shipped defect)             -> RED "Show Stats paced the canvas"
 *   C2 NON_COVERING_FLAGS emptied (Show Stats counted as covering)               -> RED (pure + render)
 *   C3 plausible-wrong: COVERING_FLAGS drops the React-local panels               -> RED "the achievements scrim"
 *   C0 identity (a comment edit in panelState.js)                                -> SURVIVED
 */
describe('covering = a panel whose scrim covers the canvas; Show Stats is not one', () => {
  it('every panel flag but Show Stats covers', async () => {
    const { PANEL_FLAGS, COVERING_FLAGS, isAnyPanelCovering } = await import('../../src/ui/panelState.js');
    expect(PANEL_FLAGS.length, 'SETUP: the panel list changed size — re-check which panels draw a scrim').toBe(13);
    expect(COVERING_FLAGS.length, 'the covering set is not every panel but one').toBe(PANEL_FLAGS.length - 1);
    for (const flag of PANEL_FLAGS) {
      expect(isAnyPanelCovering({ [flag]: true }), `${flag}`).toBe(flag !== 'showStats');
    }
    expect(isAnyPanelCovering({ showStats: true, showInventory: true }), 'Show Stats masked a real panel').toBe(true);
    expect(isAnyPanelCovering(null)).toBe(false);
  });

  it('MenuSystem publishes panelCovering from the covering set, React-local panels included', async () => {
    const React = (await import('react')).default;
    const { render, cleanup } = await import('@testing-library/react');
    const { MenuSystem } = await import('../../src/MenuSystem.jsx');
    const { useGameStore } = await import('../../src/store/useGameStore.jsx');
    const NOOP = () => {};
    const quest = { achievements: [], unlockedAchievements: [], stats: {}, quests: [] };
    const props = (o) => ({
      gameState: { gameStarted: true, isAlive: true, requestPointerLock: NOOP },
      showAchievements: false, setShowAchievements: NOOP, showSpellUpgrades: false, setShowSpellUpgrades: NOOP,
      showStats: false, setShowStats: NOOP, isPointerLocked: true, setIsPointerLocked: NOOP, questSystem: quest, ...o,
    });
    const published = (o) => {
      useGameStore.setState({ panelCovering: 'unset' });
      render(React.createElement(MenuSystem, props(o)));
      const v = useGameStore.getState().panelCovering;
      cleanup();
      return v;
    };
    // Presence first: the instrument must see a covering panel before its silence about Show Stats means anything.
    expect(published({ showAchievements: true }), 'the achievements scrim (React-local) did not pace the canvas').toBe(true);
    expect(published({}), 'nothing open, yet the canvas is paced').toBe(false);
    expect(published({ showStats: true }), 'Show Stats paced the canvas it is measuring').toBe(false);
    expect(published({ showStats: true, showAchievements: true }), 'Show Stats masked the achievements scrim').toBe(true);
  });
});
