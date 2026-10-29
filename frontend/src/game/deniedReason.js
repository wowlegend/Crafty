// deniedReason.js — pure toast copy for the silent-denial paths (UX-legibility interleave, 2026-06-13).
// `(kind[, ctx]) -> string` so the wiring sites stay thin and the copy is unit-pinned; a kind routed through t()
// reads the store's locale, and the rest are English until they are routed too. The
// aspect-locked text TEACHES the unlock path (Talents / U) — the load-bearing legibility win for a
// fresh player who presses a not-yet-unlocked Aspect verb and used to get dead silence.
import { t } from '../i18n/i18n.js';

export function deniedReason(kind, ctx = '') {
  switch (kind) {
    case 'no-mana':
      return 'Not enough mana';
    // An unlocked Aspect verb the ember bar cannot pay for: an Aspect reducer's 'short' or 'unpaid' (Components.jsx).
    case 'no-ember':
      return t('deny.noEmber');
    case 'aspect-locked':
      return `${ctx ? ctx + ' ' : ''}not yet unlocked — open Talents (U)`;
    // ctx = the block's display name. No key is named: Mara's Forge opens from G on a keyboard and Talk on touch.
    case 'no-block':
      return `No ${ctx || 'block'} left`;
    case 'no-block-forge':
      return `No ${ctx || 'block'} left — Mara's Forge makes more`;
    // The talk verb (input/talk.js) with no villager and no chest in reach.
    case 'no-talk':
      return 'Nobody near enough to talk to';
    default:
      return "You can't do that yet";
  }
}
