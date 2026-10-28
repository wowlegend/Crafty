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
 * The governor (review 2026-10-27: behind the title it read 10 fps as a slow machine and stepped every desktop down
 * to `low` before play), same harness, each observed RED:
 *   V1 the title case leaves the governor on -> "the governor samples the title's pace"
 *   V2 the harness case leaves it on -> "the governor samples a harness"
 *   V3 plausible-wrong: Unlimited play ungoverned -> "play is ungoverned"
 *   and V0, an identity mutant (a comment edit in canvasPace.js), SURVIVED.
 *
 * BLIND SPOT: that GameScene reads this, and that MenuSystem's title flag reaches the store, is the e2e's
 * (tests/e2e/frame-cap.spec.js); that the pace BINDS is the same e2e's 1 fps case. That GameScene mounts the monitor
 * on `governor` is pinned by shape in perf-config-gates and lived in the same e2e (the tier set on the title holds).
 */
describe('paceFor', () => {
  it('in play, the setting decides: 60 -> paced at 60, Unlimited -> the display rate', () => {
    expect(paceFor({ frameCap: 60, titleCovering: false, harness: false })).toMatchObject({ loop: 'demand', fps: 60 });
    expect(paceFor({ frameCap: 0, titleCovering: false, harness: false }), 'Unlimited is capped').toMatchObject({ loop: 'always', fps: 0 });
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
        expect(paceFor({ frameCap, titleCovering, harness: true }), 'the harness was paced').toMatchObject({ loop: 'always', fps: 0 });
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
    expect(pace({ panelCovering: true })).toEqual({ loop: 'demand', fps: PANEL_FPS, governor: true });
    expect(pace({ panelCovering: true, frameCap: 0 }), 'Unlimited drew at the display rate behind a panel').toEqual({ loop: 'demand', fps: PANEL_FPS, governor: true });
  });
  it('an unfocused window: 10 fps, whether or not a panel is open', () => {
    expect(BLUR_FPS).toBe(10);
    expect(pace({ unfocused: true })).toEqual({ loop: 'demand', fps: BLUR_FPS, governor: true });
    expect(pace({ unfocused: true, panelCovering: true }), 'a blurred window with a panel open drew at the panel pace').toEqual({ loop: 'demand', fps: BLUR_FPS, governor: true });
    expect(pace({ unfocused: true, frameCap: 0 })).toEqual({ loop: 'demand', fps: BLUR_FPS, governor: true });
  });
  it('never above the cap the player (or a test) set', () => {
    expect(pace({ panelCovering: true, frameCap: 1 })).toEqual({ loop: 'demand', fps: 1, governor: true });
    expect(pace({ unfocused: true, frameCap: 1 })).toEqual({ loop: 'demand', fps: 1, governor: true });
  });
  it('the title still wins, and the harness wins over everything', () => {
    expect(pace({ titleCovering: true, panelCovering: true, unfocused: true })).toEqual({ loop: 'demand', fps: TITLE_FPS, governor: false });
    expect(pace({ harness: true, panelCovering: true, unfocused: true }), 'the harness was paced').toEqual({ loop: 'always', fps: 0, governor: false });
  });
  it('nothing covering, focused: the setting decides, as before', () => {
    expect(pace({})).toEqual({ loop: 'demand', fps: 60, governor: true });
    expect(pace({ frameCap: 0 })).toEqual({ loop: 'always', fps: 0, governor: true });
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
 * SHOW STATS DOES NOT PACE THE GAME IT MEASURES (review 2026-10-27, steady-cool HIGH 1). F3 draws the frame-time readout
 * inside the canvas, with no scrim. While it was a panel flag MenuSystem published it as covering: the game dropped to 30
 * fps, the readout reported the pace instead of the game, and the tier governor's monitor unmounted (governorSamples).
 * Show Stats is no longer a panel at all (ui/panelState.js), so covering is simply "a panel is open" — one list. This
 * renders the REAL MenuSystem against the real store, reads what it publishes, and feeds that to the real pace and
 * governor decisions; the F3 key end to end is tests/e2e/canvas-pace-panels.spec.js.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, receipts in the commit (the earlier COVERING_FLAGS receipts C1-C3 are void:
 * that list is deleted). Re-adding 'showStats' to PANEL_FLAGS alone cannot reach this gate — no caller passes the readout
 * to the panel check any more — so the regression shape here is a caller counting it again:
 *   K1 MenuSystem: panelCovering = isAnyPanelOpen(...) || showStats (the shipped defect)  -> RED expected
 *   K2 MenuSystem publishes a constant false (pacing behind panels lost)                  -> RED expected
 *   K0 identity (a comment edit in panelState.js)                                        -> must SURVIVE
 */
describe('Show Stats is not a panel: F3 neither paces the canvas nor unmounts the governor', () => {
  it('MenuSystem publishes panelCovering = a panel is open, React-local panels included; F3 keeps the play pace', async () => {
    const React = (await import('react')).default;
    const { render, cleanup } = await import('@testing-library/react');
    const { MenuSystem } = await import('../../src/MenuSystem.jsx');
    const { useGameStore } = await import('../../src/store/useGameStore.jsx');
    const { governorSamples } = await import('../../src/render/tierGovernor.js');
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
    // The pace and the governor, fed what MenuSystem published with the readout up: the 60 cap holds and the monitor stays.
    const withStats = published({ showStats: true });
    const pace = paceFor({ frameCap: 60, titleCovering: false, panelCovering: withStats, unfocused: false, harness: false });
    expect(pace, 'Show Stats paced the canvas it is measuring').toEqual({ loop: 'demand', fps: 60, governor: true });
    expect(governorSamples(pace, 60), 'Show Stats unmounted the tier governor\'s monitor').toBe(true);
  });
});

describe('the tier governor judges only a rate the machine set', () => {
  // All eight combinations, each with its own answer: the governor runs exactly in play without a harness.
  it('off behind the title and under either harness; on in play, capped or Unlimited', () => {
    let checked = 0;
    for (const harness of [false, true]) {
      for (const titleCovering of [false, true]) {
        for (const frameCap of [60, 0]) {
          const { governor } = paceFor({ frameCap, titleCovering, harness });
          const why = harness ? 'the governor samples a harness' : titleCovering ? 'the governor samples the title\'s pace' : 'play is ungoverned';
          expect(governor, `${why} (${JSON.stringify({ frameCap, titleCovering, harness })})`).toBe(!harness && !titleCovering);
          checked += 1;
        }
      }
    }
    expect(checked, 'the combinations checked').toBe(8);
  });
});
