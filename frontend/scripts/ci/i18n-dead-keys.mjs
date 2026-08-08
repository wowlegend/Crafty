// i18n-dead-keys.mjs — the COMMAND the next copy deletion is supposed to consume.
//
// The 2026-08-05 deletion of eleven keys was authorized by a hand-run bash pipeline: no test, no
// mutation proof, no denominator. It was wrong four times before it was right (an unescaped `.` matched
// `rarity-common`; a prefix match claimed `ui.level_short` as `ui.level`; the colour token
// `C.rarity.common` counted as a usage; and `ui.level` looked dead while being the fixture that proves
// interpolation). Every gate in this repo is RED-first and mutation-proven, and the ANALYSIS that
// authorized an IRREVERSIBLE change was the one thing that was not.
//
// So the judgment moved into `src/i18n/keyReachability.js`, which is pure and carries those four
// near-misses as regression fixtures, and this is its command-line face. Reachability is reported by
// KIND, because "not found by a grep of src/" silently merges five different states and three of them
// are alive.
//
// Read the DENOMINATOR, not the list: if `total` does not match the dictionary, the classifier saw a
// different corpus than you think it did, and its dead set is a claim about nothing.
import { readFileSync, globSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRINGS } from '../../src/i18n/strings.js';
import { classifyKeys, deadKeys, tallyKinds } from '../../src/i18n/keyReachability.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../..');

const read = (rel) => readFileSync(resolve(APP, rel), 'utf8');
const glob = (pattern) => globSync(pattern, { cwd: APP }).sort();
const isTestPath = (p) => /\.test\.jsx?$/.test(p);

export function report() {
  const keys = Object.keys(STRINGS.en);
  const srcAll = glob('src/**/*.{js,jsx}');
  // A colocated *.test.js under src/ is TEST corpus, not source. Counting it as source would mark every
  // test-only fixture "reachable" and hide exactly the case near-miss #4 was about.
  const srcOnly = srcAll.filter((p) => !isTestPath(p)).map(read);
  const tests = glob('tests/**/*.{js,jsx}').map(read).concat(srcAll.filter(isTestPath).map(read));
  const verdicts = classifyKeys(keys, srcOnly, tests);
  return {
    keys,
    verdicts,
    tally: tallyKinds(verdicts),
    dead: deadKeys(verdicts),
    srcFiles: srcOnly.length,
    testFiles: tests.length
  };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const r = report();
  const t = r.tally;
  console.log(`i18n reachability: ${r.keys.length} keys over ${r.srcFiles} src + ${r.testFiles} test files`);
  console.log(`  literal ${t.literal} · dynamic ${t.dynamic} · table ${t.table} · fixture ${t.fixture} · dead ${t.dead}`);
  if (Object.values(t).reduce((a, b) => a + b, 0) !== r.keys.length) {
    console.error('  DENOMINATOR MISMATCH — the kinds do not sum to the dictionary. Do not trust the list below.');
    process.exit(1);
  }
  if (r.dead.length === 0) {
    console.log('\n  no dead keys.');
  } else {
    console.log(`\n  DEAD (${r.dead.length}) — reached by no literal call, no dynamic prefix, no data table, no test:`);
    for (const k of r.dead) console.log(`    ${k}`);
    console.log('\n  Remove from BOTH locales in src/i18n/strings.js. A key here is safe by construction,');
    console.log('  not by inspection — which is the whole difference from the pipeline this replaces.');
  }
}
