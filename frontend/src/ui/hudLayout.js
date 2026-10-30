/**
 * hudLayout.js — where the HUD's pieces sit, by the viewport (DECISIONS 2026-10-29 item 90).
 *
 * Two touch layouts. TALL (an iPad either way up, a phone upright): the vitals under the quest line at the top left,
 * the dial, the minimap and the coin count down the right edge above the thumb cluster. SHORT (a phone on its side,
 * or any touch screen too short for the tall one): the thumb cluster's fans climb to within 73 px of the top at 390 px
 * (input/aspectWheel.js stacks the spell row above the Aspect row on the joystick's 13% anchor), so the right edge is the
 * fans', and the dial, the minimap and the coin count go to the top band beside the Pause; the vitals sit on the left
 * edge between the tray's opener and the joystick; the compass rises into the top band, as on a wide screen.
 *
 * The encounter (a target's nameplate over the boss bar, one column, so the two never meet) sits under the top centre's
 * lines: under the objective line where the compass has dropped below the top band (under 900 px wide), and on a phone
 * upright under the right column, which the vitals and the minimap leave no room beside.
 *
 * tests/e2e/hud-at-rest.spec.js reads every pair at 1280x800, 1180x820, 820x1180, 390x844 and 844x390.
 */
import { useSyncExternalStore } from 'react';
import { isTouchUIMode } from '../input/touchDevice';
import { FAN_ROW_ANCHOR_PCT, SPELL_ROW_BOTTOM, TOUCH_BTN } from '../input/aspectWheel';

/** The gap, px, the HUD leaves between two of its pieces, and between a piece and a touch control. */
export const HUD_GAP = 8;
/** Under this width the compass leaves the top band (ui/Compass.jsx), so the objective line and the encounter drop. */
export const MID_BELOW_W = 900;
/** Under this width the compass narrows and the hotbar scales (ui/GameHud.jsx). */
export const NARROW_BELOW_W = 640;

// The tall touch layout's pieces whose edges decide where it stops fitting.
/** The vitals' top on a tall touch screen: under the quest line and the objective line (top 104, 33 px tall). */
export const TOUCH_VITALS_TOP = 148;
/** The three slim bars (health, mana, ember: 14 px rows, ui/primitives/StatBar.jsx `slim`) and the two gaps between them. */
export const VITALS_MAX_H = 3 * 14 + 2 * 8;
/** The coin count's top on a tall touch screen (under the minimap) and its height (an 18 px icon beside the number). */
export const TOUCH_COINS_TOP = 332;
export const COINS_H = 20;
/** The tray's opener (ui/TouchControls.jsx) stands this far above the screen's middle, 46 px tall. */
const TRAY_OPENER_ABOVE_MID = 140;
const TRAY_OPENER_H = 46;

/**
 * PURE. Whether the tall touch layout fits a viewport `h` px tall: the coin count clears the stacked spell row (the right
 * fans' highest point), and the tray's opener on the left edge clears the vitals. Each falls through the other below
 * about 720 px; under that the short layout holds instead.
 */
export function tallTouchFits(h) {
  const fansTop = h * (1 - FAN_ROW_ANCHOR_PCT / 100) - (SPELL_ROW_BOTTOM + TOUCH_BTN);
  const trayTop = h / 2 - TRAY_OPENER_ABOVE_MID;
  return fansTop >= TOUCH_COINS_TOP + COINS_H + HUD_GAP && trayTop >= TOUCH_VITALS_TOP + VITALS_MAX_H + HUD_GAP;
}

/** The short layout's vitals: this far under the screen's middle, which leaves them 5 px under the tray's opener. */
export const SHORT_VITALS_TOP = `calc(50% - ${TRAY_OPENER_ABOVE_MID - TRAY_OPENER_H - 5}px)`;

/** The full touch hotbar (nine 48 px slots, 6 px apart), centred, clears the joystick (left 7%, 148 px wide:
 *  ui/TouchControlsSurface.jsx) at this width and wider, and the cast button (right 124 px, 64 px wide) from 872 px; a
 *  short screen narrower than this scales it as a phone does. */
const TOUCH_HOTBAR_PX = 9 * 48 + 8 * 6;
export const FULL_HOTBAR_MIN_W = Math.ceil(Math.max(
  (TOUCH_HOTBAR_PX / 2 + HUD_GAP + 148) / (0.5 - 0.07),
  TOUCH_HOTBAR_PX + 2 * (HUD_GAP + 124 + 64),
));

/** PURE. The layout for a viewport: { touch, short, band ('wide' | 'mid' | 'narrow'), compactHotbar }. */
export function hudMode(w, h, touch) {
  const band = w >= MID_BELOW_W ? 'wide' : w >= NARROW_BELOW_W ? 'mid' : 'narrow';
  const short = !!touch && !tallTouchFits(h);
  return { touch: !!touch, short, band, compactHotbar: !!touch && (band === 'narrow' || (short && w < FULL_HOTBAR_MIN_W)) };
}

/** PURE. The encounter column's top, px: under the top band's lines on a wide screen and on a short one (whose compass
 *  is in the top band), under the objective line on a mid one, under the right column on a narrow one. */
export function encounterTop(mode) {
  if (mode.short || mode.band === 'wide') return 96;
  return mode.band === 'mid' ? 144 : 384;
}

/** PURE. The boss bar's width: 450 px where there is room, else what is left between two 216 px side columns (the
 *  vitals or the joystick on the left, the minimap or the dodge on the right); on a narrow screen it keeps 82 px from
 *  each edge, clear of the spell and Aspect openers (right 26 px, 52 px wide). */
export function bossWidth(mode) {
  return mode.band === 'narrow' && !mode.short ? 'calc(100vw - 164px)' : 'min(450px, calc(100vw - 432px))';
}

const subscribe = (onChange) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};
const modes = new Map();
const snapshot = () => {
  const m = hudMode(window.innerWidth, window.innerHeight, isTouchUIMode());
  const key = `${m.touch}|${m.short}|${m.band}|${m.compactHotbar}`;
  if (!modes.has(key)) modes.set(key, m);
  return modes.get(key);
};

/** The layout for this window, re-rendering only when it changes (a resize or a rotation: a rare event, never a frame). */
export function useHudMode() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
