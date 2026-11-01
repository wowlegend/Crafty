// _profile.mjs — who the player is when a harness opens the game: the one table of what each profile writes into the
// page's localStorage before any of the page's own scripts run (first-minute D11; DECISIONS 2026-11-01 (W3-A PR C)
// item 481). The e2e fixture (tests/e2e/_fixtures.js), the lookbook and the media pipeline (_lookbookPage.mjs
// initScript) and the First Night probe (first-night.mjs) all seed through it. Leading underscore: a helper, not a
// probe; it binds no port.
//
//   returning  the onboarding flag a first session writes once its world is built (App.jsx), so the goal-loop toasts,
//              and whatever first-session beat the game adds later, stay out of a run about something else.
//   fresh      nothing: a browser that never ran the game. A Playwright context starts with empty storage, so writing
//              nothing IS the fresh profile, and a fresh page that reloads keeps what the game itself wrote, as a
//              player's would.

export const PROFILES = Object.freeze({
  returning: Object.freeze({ crafty_onboarded: '1' }),
  fresh: Object.freeze({}),
});

/** The profile a harness plays as unless it names one. */
export const DEFAULT_PROFILE = 'returning';

/** The storage writes for profile `name`. Throws on a name the table does not hold, naming the ones it does. */
export function profileSeed(name) {
  if (!Object.hasOwn(PROFILES, name)) {
    throw new TypeError(`_profile: unknown profile ${JSON.stringify(name)}; the profiles are ${Object.keys(PROFILES).sort().join(', ')}`);
  }
  return PROFILES[name];
}

/** IN THE PAGE, before its scripts (`page.addInitScript(seedStorage, profileSeed(name))`): write every key of `seed`.
 *  Self-contained, because Playwright serialises it into the page. */
export function seedStorage(seed) {
  for (const [key, value] of Object.entries(seed || {})) {
    try { localStorage.setItem(key, value); } catch { /* storage blocked: the page plays as a fresh profile */ }
  }
}
