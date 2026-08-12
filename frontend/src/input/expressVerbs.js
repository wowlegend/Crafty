/**
 * expressVerbs.js — the key -> combat-verb router for the "express" bindings.
 *
 * F casts the selected spell, T melees (Kevin, 2026-06-28: magic is the marquee feature, so the prime
 * key gets it). Both are express shortcuts layered on the contextual mouse router in verbRouter.js —
 * LMB mine/melee, RMB cast/place — and both gate on the same active+alive precondition every live verb
 * in this game gates on.
 *
 * WHY IT IS A MODULE. The binding lived as two inline `if (e.code === ...)` blocks inside a 1380-line
 * component's keydown closure, so the only thing that could reach it was a WINDOWED SOURCE REGEX:
 *
 *     /code === 'KeyF'\)\s*\{[\s\S]{0,120}triggerSpellCast\(\)/
 *
 * That asserts two tokens appear within 120 characters of each other. It is satisfied by a commented-out
 * call, and it breaks on a reformat, a longer guard, or an added comment — so it reports on the shape of
 * the file rather than on which verb a key fires, and its own comment admits the window is tuned to stop
 * one block bleeding into the next. Meanwhile the thing worth protecting is a mapping with exactly one
 * dangerous confusion in it (F firing melee instead of cast), and a mapping is a function.
 *
 * Deliberately NOT merged with verbRouter.js: that router answers "what does a click mean HERE", which
 * depends on aim, targets and distance. This is a fixed key->verb table with a liveness precondition.
 * Two different questions; one file each.
 */

/** The express bindings. Adding a row here is the whole cost of a new express verb. */
export const EXPRESS_VERBS = Object.freeze({
  KeyF: 'cast',
  KeyT: 'melee',
});

/**
 * PURE. Which express verb, if any, this key fires right now.
 *
 * @param {string} code            KeyboardEvent.code
 * @param {{active?: boolean, isAlive?: boolean}} ctx  the same liveness gate every live verb uses
 * @returns {'cast'|'melee'|null}
 */
export function routeExpressVerb(code, ctx) {
  const verb = EXPRESS_VERBS[code];
  if (!verb) return null;
  // Dead or input-inactive means no verb at all — NOT a verb the caller is trusted to discard. Returning
  // the verb here and gating at the call site is how a second call site ends up forgetting to gate.
  if (!ctx || !ctx.active || !ctx.isAlive) return null;
  return verb;
}
