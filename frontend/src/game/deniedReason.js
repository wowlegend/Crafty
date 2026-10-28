// deniedReason.js — pure toast copy for the silent-denial paths (UX-legibility interleave, 2026-06-13).
// Pure `(kind[, ctx]) -> string` so the wiring sites stay thin and the copy is unit-pinned. The
// aspect-locked text TEACHES the unlock path (Talents / U) — the load-bearing legibility win for a
// fresh player who presses a not-yet-unlocked Aspect verb and used to get dead silence.
export function deniedReason(kind, ctx = '') {
  switch (kind) {
    case 'no-mana':
      return 'Not enough mana';
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
