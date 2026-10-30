/**
 * hudLayout.js — where the HUD's pieces sit, by the viewport (DECISIONS 2026-10-29 item 90).
 *
 * Nothing covers the screen's centre, where the crosshair is: a CENTRE_BOX square there, and the gap around it.
 *
 * Three touch layouts. TALL (a touch screen 640 px wide or more and tall enough for it: an iPad either way up): the
 * vitals under the quest line at the top left, the dial, the minimap and the coin count down the right edge above the
 * thumb cluster, the encounter (a target's nameplate over the boss bar, one column) under the top centre's lines, the
 * toast stack under the coin count.
 * PHONE (an upright touch screen narrower than 640 px, or upright and too short for the tall layout): the encounter
 * column under the objective line with the toast stack in it under the boss bar, so the three never meet; the dial,
 * the minimap at 60% and the coin count down the right edge beside that column; the vitals on the left edge beside
 * the crosshair, narrow enough to clear it; the hotbar nearer the bottom, so its XP edge clears the cast button,
 * whose 9% anchor reaches it under 711 px tall.
 * SHORT (a touch screen wider than tall and too short for the tall layout: a phone on its side): the thumb cluster's
 * fans climb to within 73 px of the top at 390 px (input/aspectWheel.js stacks the spell row above the Aspect row on
 * the joystick's 13% anchor), so the right edge is the fans', and the dial, the minimap and the coin count go to the top
 * band beside the Pause; the vitals sit on the left edge between the tray's opener and the joystick; the compass rises
 * into the top band, as on a wide screen. The middle has 57 px above the crosshair and 91 below, so the nameplate sits
 * under the top band and the boss bar under the crosshair, the toast stack under the boss bar.
 *
 * tests/e2e/hud-at-rest.spec.js reads every pair, and the centre, at 1280x800, 1180x820, 820x1180, 390x844, 390x664,
 * 375x667 and 844x390.
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
/** The crosshair's keep-out: a square this many px on a side at the screen's centre. */
const CENTRE_BOX = 48;
/** A piece placed under the crosshair starts here: its box's lower edge and the gap. */
export const BELOW_CENTRE_TOP = `calc(50% + ${CENTRE_BOX / 2 + HUD_GAP}px)`;

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
 * about 720 px; under that the phone layout (upright) or the short one (on its side) holds instead.
 */
export function tallTouchFits(h) {
  const fansTop = h * (1 - FAN_ROW_ANCHOR_PCT / 100) - (SPELL_ROW_BOTTOM + TOUCH_BTN);
  const trayTop = h / 2 - TRAY_OPENER_ABOVE_MID;
  return fansTop >= TOUCH_COINS_TOP + COINS_H + HUD_GAP && trayTop >= TOUCH_VITALS_TOP + VITALS_MAX_H + HUD_GAP;
}

/** The short layout's vitals: this far under the screen's middle, which leaves them 5 px under the tray's opener. */
export const SHORT_VITALS_TOP = `calc(50% - ${TRAY_OPENER_ABOVE_MID - TRAY_OPENER_H - 5}px)`;

// The phone layout's right edge, under the dial (top 68 px, 72 px tall): the minimap at 60% (its 120 px disc without
// the coordinates line: 72 px) 8 px from the edge, the coin count under it.
/** The minimap's top on a phone, and its scale (the class in HUD.jsx PlacedMinimap is its literal). */
export const PHONE_MINIMAP_TOP = 68 + 72 + HUD_GAP;
const PHONE_MINIMAP_PX = 0.6 * 120;
/** The coin count's top on a phone: under the minimap. */
export const PHONE_COINS_TOP = PHONE_MINIMAP_TOP + PHONE_MINIMAP_PX + HUD_GAP;
/** What the phone's encounter column leaves clear on each side: the right edge's minimap and its 8 px margin, and the gap
 *  (the tray's opener on the left, 10 px in and 46 px wide, needs less). */
const PHONE_COLUMN_INSET = 8 + PHONE_MINIMAP_PX + HUD_GAP;
/** The encounter column's top under the objective line (top 104, 33 px tall), where the compass has left the top band. */
const UNDER_OBJECTIVE_TOP = 144;
/** The phone's vitals: 128 px wide (w-32) beside the crosshair, centred on its row; at 16 px from the left edge they
 *  clear the CENTRE_BOX and the gap on any screen 352 px wide or more. */
export const PHONE_VITALS_TOP = `calc(50% - ${VITALS_MAX_H / 2}px)`;

/** The full touch hotbar (nine 48 px slots, 6 px apart), centred, clears the joystick (left 7%, 148 px wide:
 *  ui/TouchControlsSurface.jsx) at this width and wider, and the cast button (right 124 px, 64 px wide) from 872 px; a
 *  short screen narrower than this scales it as a phone does. */
const TOUCH_HOTBAR_PX = 9 * 48 + 8 * 6;
export const FULL_HOTBAR_MIN_W = Math.ceil(Math.max(
  (TOUCH_HOTBAR_PX / 2 + HUD_GAP + 148) / (0.5 - 0.07),
  TOUCH_HOTBAR_PX + 2 * (HUD_GAP + 124 + 64),
));

/** PURE. The layout for a viewport: { touch, short, phone, band ('wide' | 'mid' | 'narrow'), compactHotbar }. On touch
 *  exactly one of tall (neither flag), `phone` and `short` holds. */
export function hudMode(w, h, touch) {
  const band = w >= MID_BELOW_W ? 'wide' : w >= NARROW_BELOW_W ? 'mid' : 'narrow';
  const t = !!touch;
  const fits = tallTouchFits(h);
  const phone = t && h >= w && (band === 'narrow' || !fits);
  const short = t && w > h && !fits;
  return { touch: t, short, phone, band, compactHotbar: t && (band === 'narrow' || ((short || phone) && w < FULL_HOTBAR_MIN_W)) };
}

/** PURE. The top of the encounter column (on a short screen, of the nameplate alone), px: under the top band's lines on a
 *  wide screen and on a short one (whose compass is in the top band), under the objective line elsewhere. */
export function encounterTop(mode) {
  return mode.short || mode.band === 'wide' ? 96 : UNDER_OBJECTIVE_TOP;
}

/** PURE. Whether the boss bar leaves the nameplate's column for its own under the crosshair (a short screen: the 57 px
 *  above the crosshair hold the nameplate and not the bar). */
export const bossBelowCentre = (mode) => mode.short;

/** PURE. Whether the toast stack joins the encounter column, under the boss bar (a phone, a short screen: the only band
 *  across the middle they leave clear), rather than standing at the right edge on its own. */
export const toastsInEncounter = (mode) => mode.short || mode.phone;

/** PURE. Whether the boss bar drops its phase line and its numbers (a phone or any narrow screen, and a short one, whose
 *  91 px under the crosshair hold the compact bar and not the full one). */
export const compactBoss = (mode) => mode.short || mode.phone || mode.band === 'narrow';

/** The boss bar's widest and narrowest, px. */
const BOSS_MAX_W = 450;
export const BOSS_MIN_W = 160;

/** PURE. What the boss bar leaves clear on each side, px: the phone's right column, else a 216 px side column (the vitals
 *  or the joystick on the left, the minimap or the dodge on the right); a narrow keyboard window keeps 82 px. */
function bossInset(mode) {
  if (mode.phone) return PHONE_COLUMN_INSET;
  return mode.band === 'narrow' && !mode.short ? 82 : 216;
}

/** PURE. The boss bar's width, px, in a viewport `w` px wide: what its CSS (bossWidth) computes there. */
export function bossWidthPx(mode, w) {
  return Math.max(BOSS_MIN_W, Math.min(BOSS_MAX_W, w - 2 * bossInset(mode)));
}

/** PURE. The boss bar's width as CSS, following the window's width live: never under BOSS_MIN_W, never over BOSS_MAX_W. */
export function bossWidth(mode) {
  return `clamp(${BOSS_MIN_W}px, calc(100vw - ${2 * bossInset(mode)}px), ${BOSS_MAX_W}px)`;
}

/** The toast stack's widest, px, and its width cap as CSS for where it stands (in the phone's column it keeps the
 *  column's insets). */
const TOAST_MAX_W = 320;
export const toastMaxWidth = (mode) => (mode.phone ? `min(${TOAST_MAX_W}px, calc(100vw - ${2 * PHONE_COLUMN_INSET}px))` : TOAST_MAX_W);

const subscribe = (onChange) => {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
};
const modes = new Map();
const snapshot = () => {
  const m = hudMode(window.innerWidth, window.innerHeight, isTouchUIMode());
  const key = `${m.touch}|${m.short}|${m.phone}|${m.band}|${m.compactHotbar}`;
  if (!modes.has(key)) modes.set(key, m);
  return modes.get(key);
};

/** The layout for this window, re-rendering only when it changes (a resize or a rotation: a rare event, never a frame). */
export function useHudMode() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
