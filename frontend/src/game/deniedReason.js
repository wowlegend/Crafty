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
    // An unlocked Aspect verb the ember bar cannot pay for (game/ember.js emberShort).
    case 'no-ember':
      return t('deny.noEmber');
    case 'aspect-locked':
      return `${ctx ? ctx + ' ' : ''}not yet unlocked — open Talents (U)`;
    // ctx = the block's display name. No key is named: the Crafting panel opens from a desktop key and a touch button.
    case 'no-block':
      return `No ${ctx || 'block'} left`;
    case 'no-block-craftable':
      return `No ${ctx || 'block'} left — craft more in Crafting`;
    default:
      return "You can't do that yet";
  }
}
