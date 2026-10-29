// notifications.js — the one notification channel's rules (the HUD lane's task script, decision 5). Every toast the
// game raises goes through the store's addNotification (QuestSystem's useQuestSystem publishes it): the quest and loot
// news, the dusk warning, the siege and dawn notices, the dragon's calls and an Aspect's first unlock. Two things are
// decided here, purely: what a notification says (a dictionary key renders through t() when it is SHOWN, so a toast reads
// in the language the player has now; a plain string shows as written), and whether it is shown at all (the same key
// inside one toast's life is the same news, and is dropped). A plain string is never dropped: the denial notices say why
// each press was refused, and a press the player repeats must answer each time.
import { STRINGS } from '../i18n/strings.js';
import { t as translate } from '../i18n/i18n.js';

/** How long a toast is on screen, ms; a repeat inside it is dropped (the dedupe window is one toast's life). */
export const TOAST_MS = 4000;

/** PURE. A notification from what a caller hands addNotification: a dictionary key (with `vars`) or a plain string. Its
 *  `dedupe` is `opts.key`, else the key; a plain string without `opts.key` has none. */
export function toNotification(message, type = 'info', opts = {}) {
  const isKey = typeof message === 'string' && Object.prototype.hasOwnProperty.call(STRINGS.en, message);
  const base = isKey ? { key: message, vars: opts.vars } : { text: String(message ?? '') };
  return { ...base, type, dedupe: opts.key ?? (isKey ? message : null) };
}

/** PURE. Whether a notification with `dedupe` may show at `now`, given `recent` (dedupe -> when one last showed). One
 *  with no dedupe key always shows. */
export const admits = (recent, dedupe, now, windowMs = TOAST_MS) => {
  if (dedupe == null) return true;
  const at = recent.get(dedupe);
  return at === undefined || now - at >= windowMs;
};

/** A notification's vars with every `{ key, vars }` value (a name: a boss, an item) translated by `t`. */
const shownVars = (vars, t) => (vars ? Object.fromEntries(Object.entries(vars).map(([k, v]) =>
  [k, v && typeof v === 'object' && typeof v.key === 'string' ? t(v.key, v.vars) : v])) : vars);

/** The words a notification shows: its key in the current language, its names in it too, else its text. */
export const notificationText = (n, t = translate) => (n.key ? t(n.key, shownVars(n.vars, t)) : n.text);
