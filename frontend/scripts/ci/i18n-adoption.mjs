#!/usr/bin/env node
/**
 * i18n ADOPTION RATCHET.
 *
 * WHY: `tests/i18n/i18n.test.js` passes — 98 keys, `en` and `zh-CN` at full parity. It measures the
 * DICTIONARY. Meanwhile only 10 source files call `t()` while dozens of user-facing English strings are
 * hardcoded across the UI, five of them in files that import i18n and hardcode anyway. Switch the game to
 * zh-CN and you get a half-English interface behind a green gate. That is a Goodhart trophy: the metric is
 * satisfied and the product is not.
 *
 * A key-parity test can never catch this, because the strings it should be measuring were never keys.
 *
 * This measures the PRODUCT instead: it counts user-facing string literals that are NOT routed through
 * `t()`, per file, and freezes those counts in `.i18n-adoption-ledger.json`. A count may SHRINK freely
 * (that is the work). A count that GROWS, or a new file that appears with any hits, fails the gate.
 *
 * Deliberately a RATCHET and not a zero-target: there are ~100 existing occurrences, and a gate that
 * demands they all be fixed before it can go green would simply be disabled. A ratchet is enforceable on
 * day one and converges monotonically.
 *
 * Detection is intentionally conservative — it looks only where a false positive is cheap and a miss is
 * not: JSX text nodes and the four user-visible attributes. Anything already wrapped in {t(...)} or {`...`}
 * is invisible to it because those are expressions, not literals.
 *
 * KNOWN BLIND SPOT (found 2026-08-02 while wrapping SpellUpgradePanel, recorded rather than papered over):
 * INTERPOLATED copy is not detected. `<span>Requires Lv {requiredLevel}</span>` is plainly user-facing
 * English, but the candidate contains `{` and is rejected by the code-punctuation filter that kills false
 * positives from comparison operators. So the ledger UNDER-reports: it is a floor on the untranslated
 * copy, not a complete census.
 *
 * Not fixed here because it is not a detector problem. `t(key)` takes no parameters, so there is nowhere
 * for `{requiredLevel}` to go — flagging these would produce findings nobody can action. Closing it means
 * first giving t() interpolation (e.g. t('talent.requiresLevel', { level })), which is a real API change
 * with its own tests and both locales to update. Until then the ratchet governs the literals it can see,
 * and this comment is the record of what it cannot.
 *
 *   node scripts/ci/i18n-adoption.mjs           check; exit 1 if any count grew
 *   node scripts/ci/i18n-adoption.mjs --write    re-freeze after reducing (never to raise)
 *   node scripts/ci/i18n-adoption.mjs --list     print every occurrence with file:line
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../..');
const LEDGER = resolve(APP, 'tests/i18n/.i18n-adoption-ledger.json');

// User-visible attributes. `alt` and `placeholder` are included even though the codebase has few today —
// the point of a ratchet is to be in place BEFORE the first one is added.
const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];

// A literal is "user-facing" if it reads like prose: >=6 chars and containing a lowercase run. That
// excludes SCREAMING_CASE tokens, css class strings, single glyphs, and numeric labels.
const PROSE = /[a-z]{3}/;

const isProse = (s) => {
  const t = s.trim();
  if (t.length < 6) return false;
  if (!PROSE.test(t)) return false;
  if (/^[a-z-]+$/.test(t) && !t.includes(' ')) return false; // a lone css-ish token
  if (/^https?:|^\/|^#|^[\w.-]+\.(js|jsx|png|svg|json)$/i.test(t)) return false; // paths, urls, files
  // NOT PROSE — CODE. The JSX-text regex below looks for `>text<`, and a COMPARISON operator also
  // produces a `>`: `if (diff > 0) return <span ...>` yielded the "text node" `0) return `. That is a
  // false positive, and a ratchet that cries wolf is a ratchet people learn to bypass. Real shipped copy
  // starts with a letter and does not carry code punctuation.
  if (!/^[A-Za-z]/.test(t)) return false;
  if (/[(){};=]|=>|&&/.test(t)) return false;
  return true;
};

// DEV-ONLY surfaces are not product copy. DebugOverlay renders exclusively behind
// `import.meta.env.DEV` (App.jsx:802) and is tree-shaken out of the shipped bundle, so a player can
// never read it in any locale. Counting it inflated the ledger by 12 and would have sent someone
// translating strings that do not ship. `devtest/` is the same case by construction.
const DEV_ONLY = [/^src\/ui\/DebugOverlay\.jsx$/, /^src\/devtest\//];

export function scan() {
  const files = globSync('src/**/*.jsx', { cwd: APP })
    .filter((rel) => !DEV_ONLY.some((re) => re.test(rel)))
    .sort();
  const hits = {};
  for (const rel of files) {
    const src = readFileSync(resolve(APP, rel), 'utf8');
    const lines = src.split('\n');
    const found = [];
    lines.forEach((line, i) => {
      // Skip comment lines outright — a comment is not shipped copy.
      const bare = line.trim();
      if (bare.startsWith('//') || bare.startsWith('*') || bare.startsWith('/*')) return;

      for (const a of ATTRS) {
        const m = line.match(new RegExp(`${a}\\s*=\\s*"([^"{}]+)"`));
        if (m && isProse(m[1])) found.push({ line: i + 1, kind: a, text: m[1].trim() });
      }
      // JSX text node: >text< on one line, no braces or tags inside.
      const tx = line.match(/>([^<>{}\n]{6,})</);
      if (tx && isProse(tx[1])) found.push({ line: i + 1, kind: 'text', text: tx[1].trim() });
    });
    if (found.length) hits[rel] = found;
  }
  return hits;
}

const counts = (hits) => Object.fromEntries(Object.entries(hits).map(([f, v]) => [f, v.length]));

const hits = scan();
const now = counts(hits);
const total = Object.values(now).reduce((a, b) => a + b, 0);

if (process.argv.includes('--list')) {
  for (const [f, v] of Object.entries(hits)) for (const h of v) console.log(`${f}:${h.line}  [${h.kind}]  ${h.text}`);
  console.log(`\n${total} occurrences across ${Object.keys(now).length} files`);
  process.exit(0);
}

if (process.argv.includes('--write')) {
  writeFileSync(LEDGER, JSON.stringify({ _total: total, ...now }, null, 2) + '\n');
  console.log(`i18n-adoption: froze ${total} occurrences across ${Object.keys(now).length} files`);
  process.exit(0);
}

if (!existsSync(LEDGER)) {
  console.error('i18n-adoption: no ledger. Run with --write once to freeze the baseline.');
  process.exit(1);
}

const { _total: frozenTotal, ...frozen } = JSON.parse(readFileSync(LEDGER, 'utf8'));
const errors = [];
for (const [f, n] of Object.entries(now)) {
  const was = frozen[f];
  if (was === undefined) errors.push(`NEW FILE with ${n} hardcoded user-facing string(s): ${f}`);
  else if (n > was) errors.push(`${f}: hardcoded strings ${was} -> ${n} (+${n - was})`);
}

if (errors.length) {
  console.error('\n✖ i18n-adoption RATCHET broken — user-facing copy must go through t():\n');
  for (const e of errors) console.error('  ' + e);
  console.error(`\n  See the offenders:  node scripts/ci/i18n-adoption.mjs --list`);
  console.error(`  Add the key to src/i18n/strings.js (BOTH en and zh-CN) and wrap the literal in t().`);
  console.error(`  After REDUCING a count, re-freeze:  node scripts/ci/i18n-adoption.mjs --write\n`);
  process.exit(1);
}

const shrank = Object.entries(now).filter(([f, n]) => frozen[f] !== undefined && n < frozen[f]);
const gone = Object.keys(frozen).filter((f) => now[f] === undefined);
if (shrank.length || gone.length) {
  console.log(`✓ i18n-adoption: ${total} occurrences (was ${frozenTotal}) — improved, re-freeze with --write`);
} else {
  console.log(`✓ i18n-adoption: ${total} occurrences across ${Object.keys(now).length} files, none new`);
}
