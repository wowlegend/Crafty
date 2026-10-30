// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { MenuSystem } from '../../src/MenuSystem.jsx';
import { isTouchDevice } from '../../src/input/touchDevice';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { STRINGS } from '../../src/i18n/strings.js';

/**
 * The title's keyboard hint strip is for keyboards: a touch device has no WASD, Space or T. The title renders on
 * desktop with the strip and on touch without it.
 *
 * The device is set the way a browser reports it (navigator.maxTouchPoints with PointerEvent present), and the real
 * isTouchDevice() reads it: the predicate is not mocked, so a gate on the wrong predicate, or none, is seen here.
 * Each render first shows the title itself is up (Start Adventure), so an absence is never read off an empty screen.
 *
 * BLIND SPOT: jsdom, not WebKit. That a real iPad reports maxTouchPoints > 0 is the browser's; the live check is
 * WebKit at 820x1180 on the deployed title.
 */
const NOOP = () => {};
const QUEST_STUB = { achievements: [], unlockedAchievements: [], stats: {}, quests: [] };
const PANELS_CLOSED = {
  showInventory: false, showForge: false, showMagic: false, showBuildingTools: false,
  showSettings: false, showChestInterface: false, showTradingInterface: false,
  showWorldManager: false, showCredits: false, showQuestLog: false,
};
const HINT_KEYS = ['hint.wasdMove', 'hint.spaceJump', 'hint.fCast', 'hint.spells14', 'hint.tMelee'];
const HINTS = HINT_KEYS.map((k) => STRINGS.en[k]);

function titleProps() {
  return {
    showAchievements: false, setShowAchievements: NOOP,
    showSpellUpgrades: false, setShowSpellUpgrades: NOOP,
    showStats: false, setShowStats: NOOP,
    isPointerLocked: false, setIsPointerLocked: NOOP,
    questSystem: QUEST_STUB,
    gameState: { ...PANELS_CLOSED, gameStarted: false, isAlive: true, requestPointerLock: NOOP },
  };
}

/** The device as a browser reports it: touch points, with PointerEvent present so isTouchDevice reads them. */
function deviceWithTouchPoints(n) {
  if (!window.PointerEvent) window.PointerEvent = class PointerEvent extends MouseEvent {};
  Object.defineProperty(navigator, 'maxTouchPoints', { value: n, configurable: true });
}

function renderTitle() {
  render(createElement(MenuSystem, titleProps()));
  expect(screen.getByRole('button', { name: /start adventure/i }), 'the title is not up: every absence below would be vacuous')
    .toBeTruthy();
}

beforeEach(() => {
  useGameStore.setState({ ...PANELS_CLOSED, gameStarted: false, isAlive: true });
});
afterEach(() => { cleanup(); });

describe('the title hint strip shows on desktop and not on touch', () => {
  it('the five hints are the strings the strip prints', () => {
    expect(HINTS.filter(Boolean)).toHaveLength(5);
    expect(HINTS.join(' ')).toMatch(/WASD/);
    expect(HINTS.join(' ')).toMatch(/Space/);
    expect(HINTS.join(' ')).toMatch(/T Melee/);
  });

  it('desktop first: the strip is up, with WASD, Space and T Melee', () => {
    deviceWithTouchPoints(0);
    expect(isTouchDevice(), 'SETUP: a 0-touch-point device reads as touch').toBe(false);
    renderTitle();
    const strip = screen.getByTestId('title-hint-strip');
    const shown = HINTS.filter((h) => strip.textContent.includes(h));
    expect(shown, `hints on the desktop strip: ${shown.join(', ')}`).toEqual(HINTS);
  });

  it('then touch: no strip, and no WASD, Space or T Melee anywhere on the title', () => {
    deviceWithTouchPoints(5);
    expect(isTouchDevice(), 'SETUP: a 5-touch-point device does not read as touch').toBe(true);
    renderTitle();
    expect(screen.queryByTestId('title-hint-strip'), 'the keyboard hint strip renders on a touch device').toBeNull();
    const text = document.body.textContent;
    const leaked = HINTS.filter((h) => text.includes(h));
    expect(leaked, `keyboard hints on the touch title: ${leaked.join(', ')}`).toEqual([]);
  });
});

describe('the title tagline names what the game has', () => {
  // Mara's Forge is where things are made (DECISIONS 2026-10-29 item 60), so the tagline says Forge, in the player's
  // locale.
  afterEach(() => { useGameStore.setState({ locale: 'en' }); });

  it('reads Forge, not Craft, in en and zh-CN', () => {
    deviceWithTouchPoints(0);
    renderTitle();
    expect(screen.getByTestId('title-tagline').textContent).toBe('Build • Forge • Cast Spells • Explore');
    cleanup();
    useGameStore.setState({ locale: 'zh-CN' });
    render(createElement(MenuSystem, titleProps()));
    expect(screen.getByTestId('title-tagline').textContent).toBe('建造 • 锻造 • 施法 • 探索');
  });
});
