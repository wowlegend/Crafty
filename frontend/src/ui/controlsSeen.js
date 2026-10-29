// controlsSeen.js — whether this browser profile has opened the controls panel (H) once. Until it has, the HUD shows
// the controls card and an "H Controls" hint at the hotbar's edge (the HUD lane's task script, decision 7). Kept in
// localStorage beside the onboarding flag (`crafty_onboarded`), not in a save: it belongs to the person at this browser,
// not to a world. Storage can throw (a private window, blocked site data); then the hint shows each session.
const KEY = 'crafty_controls_seen';

export function readControlsSeen() {
  try { return globalThis.localStorage?.getItem(KEY) === '1'; } catch { return false; }
}

export function writeControlsSeen() {
  try { globalThis.localStorage?.setItem(KEY, '1'); } catch { /* storage blocked: the hint returns next session */ }
}
