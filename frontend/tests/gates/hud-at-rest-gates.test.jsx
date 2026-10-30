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
import { createRequire } from 'node:module';
import resolveConfig from 'tailwindcss/resolveConfig';
import { isTouchUIMode } from '../../src/input/touchDevice';
import { GameUI } from '../../src/ui/GameHud.jsx';
import { Vitals } from '../../src/HUD.jsx';
import { HUD_GAP } from '../../src/ui/hudLayout.js';
import { TRAY_PANELS } from '../../src/ui/touchTray.js';
import { HOTBAR_BLOCKS } from '../../src/world/Blocks';

const theme = resolveConfig(createRequire(import.meta.url)('../../tailwind.config.cjs')).theme;

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

  it('the rail\'s three panels are still a tap away on touch', () => {
    expect(TRAY_PANELS.map((r) => r.show).filter(Boolean)).toEqual(expect.arrayContaining(['showInventory', 'showMagic', 'showBuildingTools']));
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

// The desktop vitals lift above the XP edge below the width where the centred hotbar would reach them (HUD.jsx Vitals):
// the hotbar's width plus, on each side, the stack's width, its margin and HUD_GAP. Recomputed here from the classes the
// two components RENDER, through the app's own Tailwind theme, so a slot, a gap or the stack resized without the
// breakpoint (or the reverse) is red.
describe('the desktop vitals lift exactly where the hotbar would reach them', () => {
  const px = (token, scale) => {
    const v = /\[(\d+(?:\.\d+)?)px\]$/.exec(token)?.[1] ?? theme[scale][token.replace(/^-?[a-z]+-/, '')];
    if (v == null) throw new Error(`SETUP: ${token} is not in the theme's ${scale}`);
    return String(v).endsWith('rem') ? parseFloat(v) * 16 : parseFloat(v);
  };
  const one = (cls, re, what) => {
    const hits = cls.split(/\s+/).filter((t) => re.test(t));
    if (hits.length !== 1) throw new Error(`SETUP: ${what}: ${hits.length} tokens in "${cls}"`);
    return hits[0];
  };

  it('under the hotbar width plus the stack, its margin and a gap on each side, and nowhere else', () => {
    isTouchUIMode.mockReturnValue(false);
    render(<GameUI gameState={HUD_STATE} level={1} xpProgress={0} />);
    const slots = [...document.querySelectorAll('[data-hotbar-block]')];
    expect(slots.length, 'SETUP: no hotbar slots').toBe(HOTBAR_BLOCKS.length);
    const slotPx = px(one(slots[0].className, /^w-/, 'slot width'), 'width');
    expect(slots.every((s) => px(one(s.className, /^w-/, 'slot width'), 'width') === slotPx), 'the slots differ in width').toBe(true);
    const gapPx = px(one(slots[0].parentElement.className, /^gap-/, 'slot gap'), 'gap');
    const hotbarPx = slots.length * slotPx + (slots.length - 1) * gapPx;

    render(<Vitals gameSystems={{ playerHealth: 80, maxHealth: 100, mana: 50, maxMana: 100 }} />);
    const stack = screen.getByTestId('stat-stack').className;
    const stackPx = px(one(stack, /^w-/, 'stack width'), 'width');
    const marginPx = px(one(stack, /^left-/, 'stack margin'), 'inset');
    const lift = /^max-\[(\d+)px\]:bottom-/.exec(one(stack, /^max-\[\d+px\]:bottom-/, 'the lift'))[1];

    console.log(`vitals lift: hotbar ${hotbarPx} px (${slots.length} x ${slotPx} + ${slots.length - 1} x ${gapPx}), stack ${stackPx}, margin ${marginPx}, gap ${HUD_GAP}; lift below ${lift} px`);
    expect(hotbarPx, 'SETUP: the keyboard hotbar is not the 408 px DECISIONS item 99 measured').toBe(408);
    expect(Number(lift)).toBe(hotbarPx + 2 * (stackPx + marginPx + HUD_GAP));
  });
});
