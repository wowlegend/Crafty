// nightStrings.js — the night chunk's own lines, and how they join the game's string tables (i18n/strings.js), which t()
// and tIn() read at the call. It lives in the night chunk, its only caller, so the boot chunk pays nothing for it
// (DECISIONS 2026-11-01 (W3-A PR C) items 498 and 533). tests/i18n/key-resolution.test.js merges this table before it
// resolves the t() calls, so a key that lives only here resolves there as it will in the game.
import { STRINGS } from '../i18n/strings.js';
import { LOCALES } from '../i18n/i18n.js';

/**
 * The night's lines, en and zh-CN together, merged when the chunk installs (night/night.js). The units that speak add
 * theirs here (D2's kindle, R1's lend, D3's dawn). A line a player can need before the chunk arrives (it is fetched once
 * the world is built) belongs in i18n/strings.js instead, or its caller awaits night/nightLoader.js loadNight() first,
 * since t() of a key not yet merged shows the key itself.
 */
export const NIGHT_STRINGS = { en: {}, 'zh-CN': {} };

/**
 * Add `tables` (en and zh-CN with the same keys) to the game's tables, or throw, so a line never ships in one language
 * only. A key the tables already hold keeps its text: the same text is skipped (a chunk loaded again), a different one
 * throws. Nothing is added unless every key passes. Returns the keys added.
 */
export function mergeStrings(tables) {
  const [en, zh] = LOCALES.map((loc) => tables[loc] || {});
  const keys = Object.keys(en);
  const bad = [...Object.keys(zh), ...keys].filter((k) => !(k in en && k in zh)
    || (k in STRINGS.en && (STRINGS.en[k] !== en[k] || STRINGS['zh-CN'][k] !== zh[k])));
  if (bad.length) throw new Error(`mergeStrings: unpaired or clashing keys ${bad}`);
  const added = keys.filter((k) => !(k in STRINGS.en));
  for (const k of added) {
    STRINGS.en[k] = en[k];
    STRINGS['zh-CN'][k] = zh[k];
  }
  return added;
}
