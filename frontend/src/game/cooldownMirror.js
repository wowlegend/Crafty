// Pure HUD model for the ability-bar cooldown sweeps. The 4 Aspect SMs (voidhand/soulbind/beast)
// expose `cooldownUntil` in game-clock seconds; the dodge ref uses lastDodgeTime + cooldown. This
// maps them to a JSON-safe {readyAt,duration,remaining,ready} per slot so the HUD never reads the
// component-local refs directly (Game-Loop-Isolation: Components.jsx mirrors this into the store).
import { GRAB_COOLDOWN_SEC } from './voidhand.js';
import { SNARE_COOLDOWN_SEC } from './soulbind.js';
import { COOLDOWN_SEC as ROAR_COOLDOWN_SEC } from './beastTransform.js';

function slot(now, cooldownUntil, duration, owned) {
  if (!owned) return null;
  const readyAt = cooldownUntil || 0;
  const remaining = Math.max(0, readyAt - now);
  return { readyAt, duration, remaining, ready: remaining <= 0 };
}
export function buildCooldownMirror({ now, voidhand, soulbind, beast, dodge, owned = {} }) {
  return {
    grab: slot(now, voidhand?.cooldownUntil, GRAB_COOLDOWN_SEC, owned.grab),
    snare: slot(now, soulbind?.cooldownUntil, SNARE_COOLDOWN_SEC, owned.snare),
    roar: slot(now, beast?.cooldownUntil, ROAR_COOLDOWN_SEC, owned.roar),
    imbue: slot(now, 0, 1.0, owned.imbue), // ELEMANCER imbue has no SM cooldownUntil; resource-gated only
    dodge: (() => {
      const readyAt = (dodge?.lastDodgeTime || 0) + (dodge?.cooldown || 0.8);
      const remaining = Math.max(0, readyAt - now);
      return { readyAt, duration: dodge?.cooldown || 0.8, remaining, ready: remaining <= 0 };
    })(),
  };
}
