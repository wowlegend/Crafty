import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'node:fs';
import { STRINGS } from '../../src/i18n/strings.js';
import { classifyKeys, tallyKinds, deadKeys } from '../../src/i18n/keyReachability.js';

// EVERY t() CALL SITE RESOLVES TO A REAL KEY.
//
// t() is designed to fall back to returning the key itself when it misses — `t('totally.missing.key')`
// gives back the string 'totally.missing.key', which is the right behaviour for a translation layer
// (better a key on screen than a crash). The cost is that a TYPO is completely silent: write
// t('panel.gearhint') against a dictionary holding 'panel.gearHint' and the player reads the literal
// text "panel.gearhint" in the settings panel, while the whole suite stays green.
//
// Nothing checked this. The adoption sweep is converting ~109 hardcoded strings into t() calls across
// a dozen files — every one of them a chance to mistype a key that no existing test can see. The sibling
// i18n.test.js proves the two dictionaries agree with each other, and adoption.test.js proves the copy
// is being routed through t() at all; neither ever asks whether the key being passed exists.
//
// Only STATIC keys can be checked. t(someVariable) and t(`ui.${x}`) are skipped by construction — the
// regex requires a quoted literal — so this is a floor, not a proof of total coverage.
const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../..');
const ALL_SRC = globSync('src/**/*.{js,jsx}', { cwd: APP }).sort();
const IS_TEST = (p) => /\.test\.jsx?$/.test(p);
// A colocated *.test.js under src/ is TEST corpus, not source — counting it as source would mark every
// test-only fixture reachable and hide the exact case near-miss #4 exists for.
const SRC_FILES = ALL_SRC.filter((p) => !IS_TEST(p));
const TEST_FILES = globSync('tests/**/*.{js,jsx}', { cwd: APP }).sort().concat(ALL_SRC.filter(IS_TEST));

// `t('key')` / `t("key")`, with a preceding non-identifier char so `someOtherT('x')` cannot match.
const CALL = /(?<![A-Za-z0-9_$])t\(\s*['"]([^'"]+)['"]/g;

function callSites() {
  const out = [];
  // SRC_FILES excludes colocated *.test.js. A fixture like t('ui.level_short') inside a test is not a
  // UI call site, and counting it as one made this assertion fail the moment a test about key
  // resolution existed — the gate was reading its own fixtures as production usage.
  for (const rel of SRC_FILES) {
    const src = readFileSync(resolve(APP, rel), 'utf8');
    src.split('\n').forEach((line, i) => {
      const bare = line.trim();
      if (bare.startsWith('//') || bare.startsWith('*') || bare.startsWith('/*')) return;
      for (const m of line.matchAll(CALL)) out.push({ file: rel, line: i + 1, key: m[1] });
    });
  }
  return out;
}

describe('i18n key resolution', () => {
  const sites = callSites();

  it('finds the t() call sites at all (guards against a regex that quietly matches nothing)', () => {
    // Without this, a broken CALL regex would make every assertion below vacuously true.
    expect(sites.length).toBeGreaterThan(40);
  });

  it('every static t() key exists in the en dictionary', () => {
    const missing = sites
      .filter((s) => !(s.key in STRINGS.en))
      .map((s) => `${s.file}:${s.line}  t('${s.key}')`);
    expect(
      missing,
      `These call sites pass a key the dictionary does not define. t() falls back to returning the key,\n` +
        `so each of these renders its own key as UI text. Add it to BOTH locales in src/i18n/strings.js.`
    ).toEqual([]);
  });

  it('every static t() key is also translated in zh-CN', () => {
    const missing = sites
      .filter((s) => s.key in STRINGS.en && !(s.key in STRINGS['zh-CN']))
      .map((s) => `${s.file}:${s.line}  t('${s.key}')`);
    expect(missing, 'a key reachable from the UI is English-only').toEqual([]);
  });

  it('classifies every key by HOW it is reached — no bare unreachable COUNT', () => {
    // REPLACED the "<= 10 unreachable" ceiling 2026-08-08. That cap was the last trace of the ungated
    // analysis: it collapsed five genuinely different states into one number, so the only way to read it
    // was "10 keys are suspicious, go grep". Reachability now comes from the pure classifier in
    // src/i18n/keyReachability.js, which carries all five near-misses of the original bash pipeline as
    // regression fixtures — including the one this classifier itself shipped with, where every key
    // matched its own dictionary definition and `dead` was unreachable.
    const src = SRC_FILES.map((f) => readFileSync(resolve(APP, f), 'utf8'));
    const tests = TEST_FILES.map((f) => readFileSync(resolve(APP, f), 'utf8'));
    const verdicts = classifyKeys(Object.keys(STRINGS.en), src, tests);
    const tally = tallyKinds(verdicts);

    // DENOMINATOR: the kinds must account for every key, or the verdicts describe a different corpus.
    expect(Object.values(tally).reduce((a, b) => a + b, 0)).toBe(Object.keys(STRINGS.en).length);
    expect(src.length, 'the classifier saw no source files').toBeGreaterThan(200);

    // The gate is that NOTHING is dead. A dead key is copy two translators maintain for no one, and it
    // is now safe to delete BY CONSTRUCTION: `node scripts/ci/i18n-dead-keys.mjs` prints the set.
    expect(
      deadKeys(verdicts),
      'unreachable copy — confirm with `node scripts/ci/i18n-dead-keys.mjs`, then remove from BOTH locales'
    ).toEqual([]);
  });

  it('the classifier can still SEE a dead key (a gate that cannot fail is not a gate)', () => {
    // The exact defect this file shipped with for one commit: with the dictionary in the corpus every
    // key matched its own definition, the dead set was permanently empty, and the assertion above would
    // have passed over any amount of dead copy.
    const v = classifyKeys(['totally.unused'], ["export const x = 1;"], []);
    expect(deadKeys(v)).toEqual(['totally.unused']);
  });
});
