// keyReachability.js — PURE classification of which i18n keys are actually reachable, and HOW.
//
// WHY THIS EXISTS. On 2026-08-05 eleven dead copy keys were deleted from both locales. The deletion
// itself was correct. The ANALYSIS that authorized it was a hand-run bash pipeline with no test, no
// mutation proof and no denominator guard — in a repo where every gate is RED-first and mutation-proven.
// The discipline was applied to the code and skipped for the DECISION, which is the irreversible half:
// a wrong gate goes red and you fix it, a wrong deletion ships and two translators never see the string
// again.
//
// That pipeline was wrong FOUR times before it was right, and each near-miss is now a fixture below:
//
//   1. `rarity.common` matched `rarity-common`      -- an unescaped `.` in a regex is "any character".
//   2. `ui.level` matched `ui.level_short`          -- a PREFIX match is not a key match.
//   3. `C.rarity.common` counted as a usage         -- that is a colour-token property path, not a key.
//   4. `ui.level` looked dead and is a TEST FIXTURE -- i18n.test.js uses it to prove interpolation.
//
// Reachability is not one bit, which is the deeper lesson: "unreferenced by a grep of src/" collapses
// five genuinely different states into one, and three of them are alive. So this reports a KIND per key
// and the caller decides what is safe to remove. Pure (strings in, verdicts out) so the four regressions
// above are unit-testable without a filesystem.

/** Escape a key for literal use inside a RegExp. Near-miss #1 lived exactly here. */
export const escapeKey = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A key is reached by a literal call when the source contains `t('key')` with THAT key and nothing
 * more — the closing quote is what makes it a whole-key match rather than a prefix (near-miss #2).
 */
export const literalCallRe = (key) => new RegExp(`(?<![A-Za-z0-9_$])t\\(\\s*['"\`]${escapeKey(key)}['"\`]`);

/**
 * A bare key in a data table: the key appears as a complete QUOTED string, but not through t(). The
 * quotes separate it from `C.rarity.common`, a property path that merely ends in the same characters
 * (near-miss #3), and the negative lookahead separates a USE from a DEFINITION (near-miss #5).
 *
 * `{ labelKey: 'ui.build' }` is a use -- the key sits on the value side.
 * `{ 'ui.level': 'Level {n}' }` is the dictionary DEFINING it, and counting that as a use is what made
 * the first version of this file vacuous: every key matched its own definition, so `dead` was
 * unreachable and the classifier would have blessed any deletion list handed to it. A rule beats
 * excluding strings.js by path, which would silently stop working the day the dictionary moves.
 */
export const bareKeyRe = (key) => new RegExp(`['"\`]${escapeKey(key)}['"\`](?!\\s*:)`);

/**
 * Comments are not code. `// 'ui.level' is the interpolation fixture` is a mention, and a mention kept
 * `ui.level` alive in the first run of this classifier against the real dictionary.
 */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"\`])\/\/.*$/, '$1'))
    .join('\n');
}

/**
 * Dynamic call sites, e.g. t(`spell.${s.spell}`). Returns the static PREFIXES, so `spell.fire` can be
 * recognised as reachable even though no literal names it. This is deliberately generous: a key wrongly
 * called reachable costs a translator one stale line, while a key wrongly called dead is unrecoverable
 * copy.
 */
export function dynamicPrefixes(sources) {
  const out = new Set();
  const re = /(?<![A-Za-z0-9_$])t\(\s*`([^`$]*)\$\{/g;
  for (const src of sources) for (const m of src.matchAll(re)) if (m[1]) out.add(m[1]);
  return [...out];
}

export const KINDS = Object.freeze(['literal', 'dynamic', 'table', 'fixture', 'dead']);

/**
 * Classify every key by HOW it is reached.
 *
 * @param {string[]} keys        dictionary keys (en)
 * @param {string[]} srcFiles    contents of src/**\/*.{js,jsx}
 * @param {string[]} testFiles   contents of the test corpus
 * @returns {Record<string, 'literal'|'dynamic'|'table'|'fixture'|'dead'>}
 */
export function classifyKeys(keys, srcFiles, testFiles = []) {
  const src = srcFiles.map(stripComments);
  const tests = testFiles.map(stripComments);
  const prefixes = dynamicPrefixes(src);
  const out = {};
  for (const key of keys) {
    const lit = literalCallRe(key);
    const bare = bareKeyRe(key);
    if (src.some((s) => lit.test(s))) out[key] = 'literal';
    else if (prefixes.some((p) => key.startsWith(p))) out[key] = 'dynamic';
    else if (src.some((s) => bare.test(s))) out[key] = 'table';
    else if (tests.some((s) => bare.test(s) || lit.test(s))) out[key] = 'fixture';
    else out[key] = 'dead';
  }
  return out;
}

/** Keys safe to delete: reached from nowhere, not even a test. */
export const deadKeys = (verdicts) => Object.keys(verdicts).filter((k) => verdicts[k] === 'dead').sort();

/** Count per kind — the DENOMINATOR the original pipeline never printed. */
export function tallyKinds(verdicts) {
  const t = Object.fromEntries(KINDS.map((k) => [k, 0]));
  for (const k of Object.keys(verdicts)) t[verdicts[k]]++;
  return t;
}
