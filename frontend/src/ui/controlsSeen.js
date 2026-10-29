// controlsSeen.js — what this browser profile has done with the controls (the HUD lane's task script, decision 7): whether
// it has opened the controls panel (H) once, and whether its first-run controls card has had its time on screen. Kept
// in localStorage beside the onboarding flag (`crafty_onboarded`), not in a save: it belongs to the person at this
// browser, not to a world. Storage can throw (a private window, blocked site data); then the card and the hint return
// each session.
const KEY = 'crafty_controls_seen';
const CARD_KEY = 'crafty_controls_card_done';

const read = (k) => { try { return globalThis.localStorage?.getItem(k) === '1'; } catch { return false; } };
const write = (k) => { try { globalThis.localStorage?.setItem(k, '1'); } catch { /* storage blocked: it returns next session */ } };

export const readControlsSeen = () => read(KEY);
export const writeControlsSeen = () => write(KEY);
export const readControlsCardDone = () => read(CARD_KEY);
export const writeControlsCardDone = () => write(CARD_KEY);
