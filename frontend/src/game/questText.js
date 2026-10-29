// questText.js — what a quest says, in a locale. A hunt (a quest with a `mobType`) names its creature by the word on
// that creature's nametag: the locale's `mob.<type>.<form>` noun, whose English is MOB_TYPES[type].displayName
// (src/i18n/strings.js), with the count in the plural form the locale's rules pick. Its title is `quest.<id>.title`.
// Every other quest keeps the text it was authored with. A hunt's text is built from its id and mob key alone, never
// from the words a save carried, so a hunt saved under an older name reads the current one.
// Pure: `t(key, vars)` translates in `locale`, the caller's pairing (useT() and the store's locale, or i18n's tIn).
import { MOB_TYPES } from './mobTypes.js';

/** The plural form `count` takes in `locale`: 'one' or 'other' (a locale's other categories read as 'other'). */
export function pluralForm(locale, count) {
  return new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other';
}

/** The creature `type` named in `locale` for `count` of them; a type the registry lacks reads as itself. */
export function mobNoun(t, locale, type, count) {
  if (!Object.prototype.hasOwnProperty.call(MOB_TYPES, type)) return String(type);
  return t(`mob.${type}.${pluralForm(locale, count)}`);
}

const isHunt = (quest) => !!quest && typeof quest.mobType === 'string' && quest.mobType.length > 0;

/** A quest's title in `locale`. */
export function questTitle(t, locale, quest) {
  if (!isHunt(quest)) return quest?.title ?? '';
  // t() hands back the key it cannot find; a hunt with no title of its own keeps the one it was authored with.
  const title = t(`quest.${quest.id}.title`, { mob: mobNoun(t, locale, quest.mobType, 1) });
  return title === `quest.${quest.id}.title` ? (quest.title ?? '') : title;
}

/** A quest's objective in `locale`: a hunt's from its count and its creature, any other quest's as authored. */
export function questDescription(t, locale, quest) {
  if (!isHunt(quest)) return quest?.description ?? '';
  return t('quest.defeatType', { count: quest.target, mob: mobNoun(t, locale, quest.mobType, quest.target) });
}
