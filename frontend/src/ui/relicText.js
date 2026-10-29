// relicText.js — a relic's change in words at a given tier. The amount comes from foldVerbMods, the fold every verb site
// reads (game/verbMods.js), so the words and the game cannot disagree as tiers or modifiers change.
import { relicByName } from '../game/relics.js';
import { foldVerbMods, VERB_BASE } from '../game/verbMods.js';

/** Roman numerals for the tiers a relic can reach (game/relics.js RELIC_MAX_TIER). */
export const TIER_NUMERAL = Object.freeze(['', 'I', 'II', 'III']);

// Each verb's string key, and the amounts English writes as a word ("one more", "twice"), which take their own key.
const WORDS = Object.freeze({
  roar: { all: 'relic.roar' },
  grab: { all: 'relic.grab', 1: 'relic.grab.one' },
  snare: { all: 'relic.snare', 2: 'relic.snare.two' },
  imbue: { all: 'relic.imbue', 1: 'relic.imbue.one' },
});

/** What relic `name` does at `tier`, through `t`; '' for a name no relic has. */
export function relicEffectText(t, name, tier) {
  const relic = relicByName(name);
  const words = relic && WORDS[relic.verb];
  if (!words) return '';
  const { key } = relic.mod;
  const at = foldVerbMods({}, name, tier)[key];
  // The snare's aim reads as a multiple of its base arc; every other verb as the amount the relic adds.
  const n = Math.round(key === 'snareArc' ? at / VERB_BASE.snareArc : at - VERB_BASE[key]);
  return t(words[n] || words.all, { n });
}
