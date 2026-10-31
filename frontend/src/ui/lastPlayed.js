// When a world was last saved in play, for the title's Continue: "5 minutes ago", "yesterday", "3 days ago" in the UI
// locale (Intl.RelativeTimeFormat, so zh-CN reads "5分钟前" and "昨天"); MenuSystem wraps it in menu.lastPlayed.

const STEPS = [
  ['minute', 60 * 1000, 60],
  ['hour', 60 * 60 * 1000, 24],
  ['day', 24 * 60 * 60 * 1000, 30],
  ['month', 30 * 24 * 60 * 60 * 1000, 12],
];
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * @param {string|null|undefined} savedAt an ISO time (the save index's `saved_at`)
 * @param {number} now epoch ms
 * @param {string} locale 'en' or 'zh-CN'
 * @returns {string|null} null for a save with no time, or one this browser cannot read
 */
export function lastPlayedText(savedAt, now, locale) {
  const at = typeof savedAt === 'string' ? Date.parse(savedAt) : NaN;
  if (!Number.isFinite(at)) return null;
  const ago = Math.max(0, now - at);
  const rtf = new Intl.RelativeTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en', { numeric: 'auto' });
  if (ago < STEPS[0][1]) return rtf.format(0, 'minute');
  for (const [unit, ms, limit] of STEPS) {
    const n = Math.floor(ago / ms);
    if (n < limit) return rtf.format(-n, unit);
  }
  return rtf.format(-Math.floor(ago / YEAR_MS), 'year');
}
