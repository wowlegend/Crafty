// notifications.js — the one notification channel's rules (the HUD lane's task script, decision 5). Every toast the
// game raises goes through the store's addNotification (QuestSystem's useQuestSystem publishes it), and two things are
// decided here, purely: what a notification says (a dictionary key renders through t() when it is SHOWN, so a toast reads
// in the language the player has now; a plain string shows as written), and whether it is shown at all (the same key, or
// the same text, inside one toast's life is the same news, and is dropped).
import { STRINGS } from '../i18n/strings.js';
import { t as translate } from '../i18n/i18n.js';

/** How long a toast is on screen, and the window inside which a repeat is dropped, ms. */
export const TOAST_MS = 4000;
export const DEDUPE_MS = TOAST_MS;

/** PURE. A notification from what a caller hands addNotification: a dictionary key (with `vars`) or a plain string. Its
 *  `dedupe` is `opts.key`, else the key or the text itself. */
export function toNotification(message, type = 'info', opts = {}) {
  const isKey = typeof message === 'string' && Object.prototype.hasOwnProperty.call(STRINGS.en, message);
  const base = isKey ? { key: message, vars: opts.vars } : { text: String(message ?? '') };
  return { ...base, type, dedupe: opts.key ?? (isKey ? message : base.text) };
}

/** PURE. Whether a notification with `dedupe` may show at `now`, given `recent` (dedupe -> when one last showed). */
export const admits = (recent, dedupe, now, windowMs = DEDUPE_MS) => {
  const at = recent.get(dedupe);
  return at === undefined || now - at >= windowMs;
};

/** The words a notification shows: its key in the current language, else its text. */
export const notificationText = (n, t = translate) => (n.key ? t(n.key, n.vars) : n.text);
