// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// THE HUD AT REST (the HUD lane's task script, decision 3): the desktop side rail is gone and the level card is folded
// into a 4 px XP edge along the hotbar's top with the level beside it, on desktop and touch alike (the touch level
// readout went with it). The rail's three panels keep their keys on desktop (E, M, B: keyMap.test) and their buttons in
// the touch tray.
//
// NOT CHECKED HERE: where anything lands on screen (jsdom has no layout). tests/e2e/hud-at-rest.spec.js reads the rects
// in a browser at 1280x800, both iPad sizes and 390x844.
vi.mock('../../src/input/touchDevice', () => ({ isTouchUIMode: vi.fn(() => false), isTouchDevice: vi.fn(() => false) }));
import { isTouchUIMode } from '../../src/input/touchDevice';
import { GameUI } from '../../src/ui/GameHud.jsx';
import { TRAY_PANELS } from '../../src/ui/touchTray.js';
import { PANEL_GROUPS } from '../../src/ui/panelGroups.js';
import { HOTBAR_BLOCKS } from '../../src/world/Blocks';

const HUD_STATE = {
  selectedBlock: null, inventory: { blocks: {} },
  setSelectedBlock: () => {}, setShowSettings: () => {}, setShowInventory: () => {}, setShowForge: () => {},
  setShowMagic: () => {}, setShowBuildingTools: () => {},
};
afterEach(cleanup);

describe('no side rail', () => {
  it.each([['desktop', false], ['touch', true]])('on %s the HUD offers Settings and the hotbar, and no panel rail', (_n, touch) => {
    isTouchUIMode.mockReturnValue(touch);
    render(<GameUI gameState={HUD_STATE} level={1} xpProgress={0} />);
    // Presence first: the same render shows the controls it is meant to.
    expect(screen.getByTestId('hud-settings')).toBeTruthy();
    expect(document.querySelectorAll('[data-hotbar-block]').length).toBe(HOTBAR_BLOCKS.length);
    const buttons = [...document.querySelectorAll('button')];
    const rail = buttons.filter((b) => !b.hasAttribute('data-hotbar-block') && b.getAttribute('data-testid') !== 'hud-settings');
    expect(rail.map((b) => b.getAttribute('aria-label') || b.textContent), 'a button beside Settings and the hotbar: the rail is back').toEqual([]);
  });

  it('the rail\'s three panels are still a tap away on touch: gear and spells in Character, and Build', () => {
    expect(TRAY_PANELS.map((r) => r.show).filter(Boolean)).toEqual(expect.arrayContaining(['showInventory', 'showBuildingTools']));
    expect(PANEL_GROUPS.character.map((tab) => tab.flag)).toEqual(expect.arrayContaining(['showInventory', 'showMagic']));
  });
});

describe('the level and XP ride the hotbar', () => {
  it.each([[0, '0%'], [50, '50%'], [100, '100%'], [140, '100%'], [-5, '0%'], [undefined, '0%']])(
    'xpProgress %s fills the edge to %s, with the level beside it', (xp, width) => {
      render(<GameUI gameState={HUD_STATE} level={7} xpProgress={xp} />);
      expect(screen.getByTestId('hotbar-xp').style.width).toBe(width);
      expect(screen.getByTestId('hotbar-level').textContent).toBe('Lv 7');
    });

  it('on touch too: one XP edge, the touch readout folded in', () => {
    isTouchUIMode.mockReturnValue(true);
    render(<GameUI gameState={HUD_STATE} level={3} xpProgress={42} />);
    expect(screen.getAllByTestId('hotbar-xp')).toHaveLength(1);
    expect(screen.getByTestId('hotbar-xp').style.width).toBe('42%');
  });
});
