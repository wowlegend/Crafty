import { describe, it, expect } from 'vitest';
import {
  hudMode, tallTouchFits, encounterTop, bossWidth, FULL_HOTBAR_MIN_W, VITALS_MAX_H, TOUCH_VITALS_TOP, TOUCH_COINS_TOP,
  COINS_H, HUD_GAP,
} from '../../src/ui/hudLayout.js';
import { FAN_ROW_ANCHOR_PCT, SPELL_ROW_BOTTOM, TOUCH_BTN } from '../../src/input/aspectWheel.js';

/**
 * WHICH LAYOUT EACH SCREEN GETS (src/ui/hudLayout.js). tests/e2e/hud-at-rest.spec.js reads every rect pair in a browser
 * at the five viewports below, on CI; this pins the decisions those reads depend on, so a constant moved here (a phone
 * on its side put back in the tall layout, an iPad sent to the short one) goes red at commit time, before CI.
 *
 * The tall layout's limit is recomputed here from the touch controls' own constants (input/aspectWheel.js) and the
 * tray's opener (ui/TouchControls.jsx: top 50% - 140 px, 46 px tall), not read back from the function under test.
 *
 * NOT CHECKED HERE: where anything lands (jsdom has no layout; the e2e reads the rects), and viewports other than these.
 */
const VIEWPORTS = [
  { name: 'desktop 1280x800', w: 1280, h: 800, touch: false, short: false, band: 'wide', top: 96, compact: false },
  { name: 'iPad 1180x820', w: 1180, h: 820, touch: true, short: false, band: 'wide', top: 96, compact: false },
  { name: 'iPad 820x1180', w: 820, h: 1180, touch: true, short: false, band: 'mid', top: 144, compact: false },
  { name: 'phone 390x844', w: 390, h: 844, touch: true, short: false, band: 'narrow', top: 384, compact: true },
  { name: 'phone on its side 844x390', w: 844, h: 390, touch: true, short: true, band: 'mid', top: 96, compact: true },
];

describe('the HUD layout for each measured viewport', () => {
  it.each(VIEWPORTS)('$name', (v) => {
    const m = hudMode(v.w, v.h, v.touch);
    expect(m, v.name).toEqual({ touch: v.touch, short: v.short, band: v.band, compactHotbar: v.compact });
    expect(encounterTop(m)).toBe(v.top);
    expect(bossWidth(m)).toBe(v.band === 'narrow' ? 'calc(100vw - 164px)' : 'min(450px, calc(100vw - 432px))');
  });

  it('a keyboard is never short, however short the window', () => {
    expect(hudMode(844, 390, false).short).toBe(false);
    expect(hudMode(844, 390, false).compactHotbar).toBe(false);
  });
});

describe('where the tall touch layout stops fitting', () => {
  // Independently of tallTouchFits: the stacked spell row's top and the tray opener's top, in px from the top.
  const fansTop = (h) => h - h * (FAN_ROW_ANCHOR_PCT / 100) - SPELL_ROW_BOTTOM - TOUCH_BTN;
  const trayTop = (h) => h / 2 - 140;
  const fits = (h) => fansTop(h) - (TOUCH_COINS_TOP + COINS_H) >= HUD_GAP && trayTop(h) - (TOUCH_VITALS_TOP + VITALS_MAX_H) >= HUD_GAP;

  it('agrees with the arithmetic at every height from 300 to 1400 px, and once it fits it fits for every taller screen', () => {
    let checked = 0, first = null;
    for (let h = 300; h <= 1400; h++) {
      expect(tallTouchFits(h), `${h} px`).toBe(fits(h));
      if (first === null && tallTouchFits(h)) first = h;
      if (first !== null) expect(tallTouchFits(h), `${h} px, taller than ${first}`).toBe(true);
      checked++;
    }
    expect(checked).toBe(1101);
    expect(first, 'the tall layout fits nowhere, or everywhere').toBeGreaterThan(390);
    expect(first).toBeLessThan(820);
  });
});

describe('the touch hotbar\'s full width', () => {
  // The nine 48 px slots and their 6 px gaps, centred; the joystick at left 7% and 148 px wide; the cast button 124 px
  // from the right and 64 px wide (ui/TouchControlsSurface.jsx).
  const clears = (w) => w / 2 - 240 - HUD_GAP >= 0.07 * w + 148 && w / 2 + 240 + HUD_GAP <= w - 124 - 64;
  it('clears the joystick and the cast button from FULL_HOTBAR_MIN_W, and not one px narrower', () => {
    expect(clears(FULL_HOTBAR_MIN_W)).toBe(true);
    expect(clears(FULL_HOTBAR_MIN_W - 1)).toBe(false);
    expect(clears(844), 'a phone on its side has no room for the full bar, which is why it takes the compact one').toBe(false);
  });
});
