import { describe, it, expect } from 'vitest';
import {
  hudMode, tallTouchFits, encounterTop, bossWidth, bossWidthPx, bossBelowCentre, toastsInEncounter, compactBoss,
  bossCallLines, tallToastPlace, toastMaxWidth, TOUCH_TOAST_TOP, TOAST_LINES,
  FULL_HOTBAR_MIN_W, VITALS_MAX_H, TOUCH_VITALS_TOP, TOUCH_COINS_TOP, COINS_H, HUD_GAP, BOSS_MIN_W,
} from '../../src/ui/hudLayout.js';
import { FAN_ROW_ANCHOR_PCT, FAN_ANCHOR_RIGHT, SPELL_ROW_BOTTOM, ASPECT_ROW_BOTTOM, TOUCH_BTN } from '../../src/input/aspectWheel.js';

/**
 * WHICH LAYOUT EACH SCREEN GETS (src/ui/hudLayout.js). tests/e2e/hud-at-rest.spec.js reads every rect pair, and the box
 * at the screen's centre, in a browser at the eight viewports below, on CI; this pins the decisions those reads depend
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
  { name: 'desktop 1024x768', w: 1024, h: 768, touch: false, layout: 'tall', band: 'wide', top: 96, compact: false, boss: 450 },
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
    if (v.layout !== 'tall') expect(bossCallLines(m), 'the lines the boss bar\'s line holds').toBe(v.layout === 'short' ? 1 : 3);
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

describe('the tall touch layout\'s toast stack stops above the touch controls under it', () => {
  // Independently of hudLayout: the hit targets in ui/TouchControls.jsx (right offset and width, bottom as a share of the
  // height plus px, height) and the right fans' openers (input/aspectWheel.js), as boxes in a w x h viewport; a toast at
  // `lines` lines of its 14 px type (line height 1.2, tailwind.config.cjs) inside 8 px of padding and a 4 px border
  // (ui/primitives/Toast.jsx), the stack 320 px wide with 8 px between toasts (QuestSystem.jsx NotificationStack).
  const box = (w, h, right, width, bottomPct, bottomPx, height) => {
    const bottom = h - (bottomPct / 100) * h - bottomPx;
    return { x: w - right - width, right: w - right, y: bottom - height, bottom };
  };
  const controls = (w, h) => ({
    jump: box(w, h, 40, 60, 11, 96, 60),
    dodge: box(w, h, 124, 60, 9, 86, 60),
    action: box(w, h, 26, 84, 11, 0, 84),
    cast: box(w, h, 124, 64, 9, 0, 64),
    spells: box(w, h, FAN_ANCHOR_RIGHT, TOUCH_BTN, FAN_ROW_ANCHOR_PCT, SPELL_ROW_BOTTOM, TOUCH_BTN),
    aspects: box(w, h, FAN_ANCHOR_RIGHT, TOUCH_BTN, FAN_ROW_ANCHOR_PCT, ASPECT_ROW_BOTTOM, TOUCH_BTN),
  });
  const toastH = (lines) => 2 * 8 + 2 * 4 + lines * 14 * 1.2;
  const meets = (a, b) => !(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y);

  it('a full stack meets no touch control at any tall touch viewport it is placed for, and each iPad holds two toasts', () => {
    let checked = 0;
    for (let w = 640; w <= 1400; w += 10) {
      for (let h = 600; h <= 1400; h += 10) {
        const m = hudMode(w, h, true);
        if (m.phone || m.short) continue;
        // On its side from 860 px wide, upright from 720 px wide and 830 px tall; nearer square the screen's centre enters
        // the stack's column, or the spell opener its first toast (NOT CHECKED here: registry REVIEW:w2d:toast-square-tall).
        if (w > h ? w < 860 : (w < 720 || h < 830)) continue;
        const { right, slots } = tallToastPlace(w, h);
        expect(slots, `${w}x${h}: no toast at all`).toBeGreaterThanOrEqual(1);
        const stack = { x: w - right - 320, right: w - right, y: TOUCH_TOAST_TOP, bottom: TOUCH_TOAST_TOP + slots * toastH(TOAST_LINES) + (slots - 1) * 8 };
        expect(stack.x, `${w}x${h}: the stack leaves the screen`).toBeGreaterThanOrEqual(0);
        const hit = Object.entries(controls(w, h)).filter(([, c]) => meets(stack, c)).map(([id]) => id);
        expect(hit, `${w}x${h}: ${slots} toasts at ${right} px from the right meet`).toEqual([]);
        checked++;
      }
    }
    console.log(`tall toast stack: ${checked} tall touch viewports checked; 1180x820 ${JSON.stringify(tallToastPlace(1180, 820))}, 820x1180 ${JSON.stringify(tallToastPlace(820, 1180))}`);
    expect(checked).toBe(4604);
    expect(tallToastPlace(1180, 820).slots, 'the landscape iPad holds two toasts').toBeGreaterThanOrEqual(2);
    expect(tallToastPlace(820, 1180).slots, 'the upright iPad holds two toasts').toBeGreaterThanOrEqual(2);
  });
});

describe('the keyboard\'s toast stack beside the boss bar', () => {
  // Independently of hudLayout's arithmetic for the stack: the boss bar centred at the width bossWidthPx gives (the width
  // the e2e reads), its top 96 px (144 under 900 px wide) and every reading of it taller than 20 px; the stack's right
  // edge 16 px from the window's and its top 164 px (QuestSystem.jsx NotificationStack). The stack's top lies in the
  // bar's band at every keyboard width, whatever the nameplate above the bar adds, so the two clear only side by side.
  // NOT CHECKED HERE: a keyboard window under 640 px wide, where the bar leaves 58 px beside it (registry
  // REVIEW:w2d:toast-narrow-keyboard); the stack's height (registry REVIEW:w2d:toast-desktop-count).
  it('with the bar up the stack stands clear of it at every keyboard width from 640 to 1920 px; with the bar down it keeps 320 px', () => {
    let checked = 0, narrowest = Infinity;
    const met = [];
    for (let w = 640; w <= 1920; w++) {
      const m = hudMode(w, 768, false);
      expect(encounterTop(m), `SETUP: ${w} px, the bar's top`).toBeLessThan(164);
      const barRight = (w + bossWidthPx(m, w)) / 2;
      const up = toastMaxWidth(m, w, true);
      const gap = (w - 16 - up) - barRight;
      if (gap < HUD_GAP) met.push(`${w} px: ${up} px wide, ${Math.round(HUD_GAP - gap)} px into the bar's gap`);
      // The narrowest the HUD draws a panel of words: the boss bar's own floor.
      expect(up, `${w} px: the stack narrowed past reading`).toBeGreaterThanOrEqual(160);
      expect(toastMaxWidth(m, w, false), `${w} px with the bar down`).toBe(320);
      narrowest = Math.min(narrowest, up);
      checked++;
    }
    const at1024 = toastMaxWidth(hudMode(1024, 768, false), 1024, true);
    console.log(`keyboard toast stack: ${checked} widths with the bar up; meets the bar at ${met.length}; narrowest ${narrowest} px; 1024 px: ${at1024} px wide`);
    expect(checked).toBe(1281);
    expect(met.length, `the stack meets the boss bar at ${met.length} of ${checked} widths: ${met.slice(0, 2).join('; ')} ... ${met.slice(-1)}`).toBe(0);
  });
});
