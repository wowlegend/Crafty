import { describe, it, expect } from 'vitest';
import {
  hudMode, tallTouchFits, encounterTop, bossWidth, bossWidthPx, bossBelowCentre, toastsInEncounter, compactBoss,
  FULL_HOTBAR_MIN_W, VITALS_MAX_H, TOUCH_VITALS_TOP, TOUCH_COINS_TOP, COINS_H, HUD_GAP, BOSS_MIN_W,
} from '../../src/ui/hudLayout.js';
import { FAN_ROW_ANCHOR_PCT, SPELL_ROW_BOTTOM, TOUCH_BTN } from '../../src/input/aspectWheel.js';

/**
 * WHICH LAYOUT EACH SCREEN GETS (src/ui/hudLayout.js). tests/e2e/hud-at-rest.spec.js reads every rect pair, and the box
 * at the screen's centre, in a browser at the seven viewports below, on CI; this pins the decisions those reads depend
 * on, so a rule moved here (a phone on its side put back in the tall layout, an upright phone sent to the short one, an
 * iPad sent to either) goes red at commit time, before CI.
 *
 * The tall layout's limit is recomputed here from the touch controls' own constants (input/aspectWheel.js) and the
 * tray's opener (ui/TouchControls.jsx: top 50% - 140 px, 46 px tall), not read back from the function under test. The
 * boss bar's widths are the ones the e2e's boss rect reads at each viewport.
 *
 * NOT CHECKED HERE: where anything lands (jsdom has no layout; the e2e reads the rects), and viewports other than these.
 */
const VIEWPORTS = [
  { name: 'desktop 1280x800', w: 1280, h: 800, touch: false, layout: 'tall', band: 'wide', top: 96, compact: false, boss: 450 },
  { name: 'iPad 1180x820', w: 1180, h: 820, touch: true, layout: 'tall', band: 'wide', top: 96, compact: false, boss: 450 },
  { name: 'iPad 820x1180', w: 820, h: 1180, touch: true, layout: 'tall', band: 'mid', top: 144, compact: false, boss: 388 },
  { name: 'phone 390x844', w: 390, h: 844, touch: true, layout: 'phone', band: 'narrow', top: 144, compact: true, boss: 214 },
  { name: 'phone 390x664 (iPhone 14, Safari)', w: 390, h: 664, touch: true, layout: 'phone', band: 'narrow', top: 144, compact: true, boss: 214 },
  { name: 'phone 375x667 (iPhone SE)', w: 375, h: 667, touch: true, layout: 'phone', band: 'narrow', top: 144, compact: true, boss: 199 },
  { name: 'phone on its side 844x390', w: 844, h: 390, touch: true, layout: 'short', band: 'mid', top: 96, compact: true, boss: 412 },
];

describe('the HUD layout for each measured viewport', () => {
  it.each(VIEWPORTS)('$name', (v) => {
    const m = hudMode(v.w, v.h, v.touch);
    expect(m, v.name).toEqual({ touch: v.touch, short: v.layout === 'short', phone: v.layout === 'phone', band: v.band, compactHotbar: v.compact });
    expect(encounterTop(m)).toBe(v.top);
    expect(bossWidthPx(m, v.w), 'the boss bar\'s width').toBe(v.boss);
    expect(bossBelowCentre(m), 'the boss bar under the crosshair').toBe(v.layout === 'short');
    expect(toastsInEncounter(m), 'the toast stack in the encounter column').toBe(v.layout !== 'tall');
    expect(compactBoss(m), 'the compact boss bar').toBe(v.layout !== 'tall');
  });

  it('a keyboard is never short or a phone, however small the window', () => {
    for (const [w, h] of [[844, 390], [390, 664]]) {
      expect(hudMode(w, h, false), `${w}x${h}`).toMatchObject({ short: false, phone: false, compactHotbar: false });
    }
  });
});

describe('every touch screen gets exactly one layout, chosen by its shape', () => {
  it('upright and narrow or too short for the tall layout: a phone; wider than tall and too short: short; else tall', () => {
    let checked = 0;
    for (let w = 320; w <= 1400; w += 20) {
      for (let h = 300; h <= 1400; h += 20) {
        const m = hudMode(w, h, true);
        const fits = (h / 2 - 140) - (TOUCH_VITALS_TOP + VITALS_MAX_H) >= HUD_GAP
          && h - h * (FAN_ROW_ANCHOR_PCT / 100) - SPELL_ROW_BOTTOM - TOUCH_BTN - (TOUCH_COINS_TOP + COINS_H) >= HUD_GAP;
        const want = h >= w ? (w < 640 || !fits ? 'phone' : 'tall') : (fits ? 'tall' : 'short');
        const got = m.phone && m.short ? 'both' : m.phone ? 'phone' : m.short ? 'short' : 'tall';
        expect(got, `${w}x${h}`).toBe(want);
        checked++;
      }
    }
    expect(checked).toBe(55 * 56);
  });

  it('the boss bar\'s width is never under its floor, however narrow the screen', () => {
    let checked = 0;
    for (let w = 240; w <= 1400; w += 4) {
      for (const touch of [false, true]) {
        for (const h of [390, 664, 844]) {
          expect(bossWidthPx(hudMode(w, h, touch), w), `${w}x${h}${touch ? ' touch' : ''}`).toBeGreaterThanOrEqual(BOSS_MIN_W);
          checked++;
        }
      }
    }
    expect(checked).toBe(291 * 6);
    expect(bossWidth(hudMode(390, 664, true)), 'the CSS a phone renders').toBe('clamp(160px, calc(100vw - 176px), 450px)');
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
