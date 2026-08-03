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

export function ringLayout(count, radius) {
  if (!(count > 0) || !(radius > 0)) return [];
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count; // -90deg = top
    // `|| 0` normalises NEGATIVE ZERO away: cos(pi) rounds to -0, which is a legal but useless offset that
    // makes assertions read `-0` and diffs read as changes. -0 is falsy, so this maps it to 0 and leaves
    // every real value alone.
    return { x: Math.round(Math.cos(angle) * radius) || 0, y: Math.round(Math.sin(angle) * radius) || 0 };
  });
}
