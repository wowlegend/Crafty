/**
 * aspectWheel.js — PURE math + registry for the touch Aspect-verb ring (STATUS §E-bis X1).
 *
 * WHY THIS EXISTS. `grep -cE "roar|grab|snare|imbue" src/ui/TouchControls*.jsx src/ui/touchTray.js` was
 * **0**: the four Aspect verbs — Wildheart roar, Voidhand grab, Soulbind snare, Elemancer imbue — had no
 * touch affordance at all. They are bound to R/V/X/Z and nothing else, so **the entire signature identity of
 * the game was desktop-only**. That breaks two coherence pillars at once: P1 ("four Aspects, each deep — the
 * signature") and P4 (the web/iPad/touch envelope), and P4 is one of only two HARD vetoes in the design system.
 *
 * NO NEW DOWNSTREAM PATH. The verbs are already in `inputState.INTENT_KEYS`, and `Components.jsx` consumes
 * them from the same boolean intents the keyboard writes (`setIntent('roar', true)` on keydown, `false` on
 * keyup). The ring writes those exact intents, so every transform state-machine downstream is untouched.
 *
 * DERIVED FROM `KEY_MAP`, NEVER RETYPED. `aspectHints.js` already takes this approach for the same reason:
 * a hand-copied verb/talent table drifts from the live binding the moment either moves, and this project has
 * paid for hand-copied tables repeatedly. If a verb is rebound or an Aspect renamed, this follows.
 *
 * Same purity contract as `touchMath.js` / `inputState.js` — no React, no DOM, no Three — so the ring's
 * geometry and its unlock-gating are unit-testable in node with zero GPU.
 */
import { KEY_MAP } from '../game/keyMap.js';

/**
 * The four Aspect verbs, in KEY_MAP order. A row qualifies when it is in the Aspects group AND carries both
 * a `verb` (the intent it writes) and a `talent` (the unlock that gates it).
 */
export const ASPECT_VERBS = KEY_MAP.filter((r) => r.group === 'Aspects' && r.verb && r.talent).map((r) => ({
  verb: r.verb,
  talent: r.talent,
  key: r.key,
  // "WILDHEART — roar" -> "WILDHEART". The label is for the ring glyph; the Aspect name is what a player
  // recognises, not the verb.
  aspect: String(r.label || '').split('—')[0].trim() || r.verb.toUpperCase(),
}));

/**
 * How long a tapped verb is held before release, in ms.
 *
 * The keyboard path holds the intent for as long as the key is down; a tap has no duration, so it is pulsed.
 * 120ms is comfortably longer than a frame at 30fps (33ms) so a state machine sampling once per frame cannot
 * miss the rising edge, and short enough that it reads as a tap rather than a hold.
 */
export const TAP_HOLD_MS = 120;

/**
 * Which Aspect verbs a player can actually use right now.
 *
 * GATED, NOT GREYED. The desktop path lets a locked verb through and fires a "denied" toast — reasonable
 * with a physical key you might press by accident. A ring is a menu the player chose to open, and offering a
 * sector that only ever refuses is a worse trade on a thumb-sized target than simply not offering it. A
 * player with nothing unlocked gets no ring at all, which is honest: there is nothing to show.
 *
 * @param {Record<string, number>|undefined} unlockedTalents store map talentId -> rank
 */
export function unlockedAspectVerbs(unlockedTalents) {
  const t = unlockedTalents || {};
  return ASPECT_VERBS.filter((a) => (t[a.talent] ?? 0) > 0);
}

/**
 * Evenly-spaced positions on a ring, in screen-space px offsets from its centre (+x right, +y DOWN).
 *
 * Starts at TOP (−y) and advances CLOCKWISE, which is what a ring menu reads as. Returned as offsets rather
 * than absolute coordinates so the caller owns anchoring — the ring hangs off a thumb-anchored button whose
 * position is a CSS `env(safe-area-inset-*)` expression this module must not know about.
 *
 * @returns {{x:number,y:number}[]} one entry per item, in input order
 */
/**
 * How far through a cooldown an ability is, as 0..1 of its wedge still to burn — or null when there is
 * nothing to draw (ready, absent, or a zero/º duration that would divide by zero).
 *
 * X2: touch had NO cooldown feedback of any kind. `HUD.jsx:590` gates `<AbilityBar>` behind
 * `!isTouchUIMode()` because its bottom-4 anchor lands inside the touch joystick/action band — so a touch
 * player could see nothing. That mattered less while the verbs were unreachable on touch at all (X1); the
 * moment the ring made them tappable, firing blind became the obvious next gap.
 *
 * Extracted rather than inlined because the caller writes it into a conic-gradient inside a rAF, where it
 * is untestable — this is the arithmetic that decides whether a player sees a wedge, and it can be wrong
 * (a NaN wedge renders as a full black disc over the glyph).
 *
 * @param {{ready?:boolean, remaining?:number, duration?:number}|null|undefined} cd
 * @returns {number|null}
 */
export function cooldownFraction(cd) {
  if (!cd || cd.ready || !(cd.duration > 0)) return null;
  const remaining = Number(cd.remaining);
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  return Math.min(1, Math.max(0, remaining / cd.duration));
}

/** True when ANY of `verbs` is mid-cooldown — the ring is shut most of the time, so the closed toggle
 *  has to carry the signal or the feedback is invisible exactly when it is needed. */
export function anyOnCooldown(abilityCooldowns, verbs) {
  const cds = abilityCooldowns || {};
  return (verbs || []).some((a) => cooldownFraction(cds[a.verb]) !== null);
}

// THE RING WAS THE WRONG SHAPE FOR THE CORNER IT WAS ANCHORED IN.
//
// `ringLayout` fanned items around a FULL circle from a control pinned to the bottom-right edge, so the
// item at angle 0 landed at `right: 26 - 78 = -52px` — a 52px button beginning exactly at the right edge
// of the viewport, with zero visible or tappable pixels. Measured in Chromium: the calc() is valid CSS,
// computed right is -52px, and getBoundingClientRect puts left at the viewport width. iceball, the second
// of four spells, was permanently unreachable on touch. env(safe-area-inset-right) is 0 on iPad and ~44px
// at most on iPhone landscape, so nothing rescued it.
//
// A quarter arc does not fix it either, and that is worth writing down so the next attempt does not go
// there: four 52px buttons need ~122px of separation at r=78, which is exactly what a FULL circle gives
// and what any 90deg arc cannot. Growing the radius to compensate pushes the top item off a landscape
// phone (~390px tall) instead. The corner simply does not have 360 degrees of room.
//
// So the geometry is a straight FAN ROW extending inward from the anchor. It cannot leave the viewport on
// either axis, adjacent items cannot overlap, it does not grow vertically into the other row's opener,
// and it lands along the natural sweep of the thumb that just tapped the opener.
export const TOUCH_BTN = 52;               // hit-target edge, px — the whole layout is expressed in these
export const FAN_STEP = TOUCH_BTN + 6;     // centre-to-centre; the +6 is the visible gutter between two
export const FAN_ANCHOR_RIGHT = 26;        // the opener's own right offset — item 0 sits directly on it
export const ASPECT_ROW_BOTTOM = 104;      // the Aspect opener's row
export const SPELL_ROW_BOTTOM = 182;       // the spell-picker row, one thumb-height above

/**
 * PURE. Offsets for `count` items fanning INWARD from a bottom-right-anchored opener.
 *
 * Consumers place items with `right: anchor - x` and `bottom: row - y`, so x must be NEGATIVE to move
 * leftward (inward) and y stays 0 — the row does not climb, which is what keeps it clear of the other
 * opener 78px above and off the top edge of a short landscape viewport.
 */
export function fanLayout(count, step = FAN_STEP) {
  if (!(count > 0) || !(step > 0)) return [];
  return Array.from({ length: count }, (_, i) => ({ x: -i * step, y: 0 }));
}

/**
 * The rendered position of one fan item. ONE definition, used by both touch layers.
 *
 * The offsets used to be spelled out eight times across the interactive layer and the glyph layer, which
 * is how a geometry bug can be true of the hit-target and invisible in the drawing, or the reverse. It is
 * also why the old gate could only assert that a glyph was in the jsdom document — there was no seam
 * carrying the number it needed to check. This is that seam.
 */
export function fanItemStyle(row, q) {
  const x = (q && q.x) || 0;
  const y = (q && q.y) || 0;
  return {
    right: `calc(env(safe-area-inset-right,0px) + ${FAN_ANCHOR_RIGHT - x}px)`,
    bottom: `calc(11% + ${row - y}px)`,
    width: TOUCH_BTN,
    height: TOUCH_BTN,
  };
}

/** The opener sits at the fan's origin — item 0 lands exactly on it, which is the affordance. */
export function fanOpenerStyle(row) {
  return fanItemStyle(row, { x: 0, y: 0 });
}

/**
 * The px offset of an item's OUTER (leftmost) edge from the right side of the viewport. The measurement
 * the whole finding is about: the old ring put this at 0 for item 1, i.e. entirely off-screen.
 */
export function fanItemInnerEdge(q) {
  return FAN_ANCHOR_RIGHT - ((q && q.x) || 0) + TOUCH_BTN;
}
