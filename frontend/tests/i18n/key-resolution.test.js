import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'node:fs';
import { STRINGS } from '../../src/i18n/strings.js';

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

// `t('key')` / `t("key")`, with a preceding non-identifier char so `someOtherT('x')` cannot match.
const CALL = /(?<![A-Za-z0-9_$])t\(\s*['"]([^'"]+)['"]/g;

function callSites() {
  const out = [];
  for (const rel of globSync('src/**/*.{js,jsx}', { cwd: APP }).sort()) {
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

  it('caps the keys no STATIC call site reaches', () => {
    // NOT a dead-copy count, and it must not be read as one. `PrimitivesShowcase.jsx:206` does
    // t(`spell.${s.spell}`), so all four spell.* keys are live while being invisible here — the regex
    // above only sees quoted literals. Several of the 22 are that case.
    //
    // It is still worth a ceiling: a key that no call site reaches statically OR dynamically is dead
    // weight two translators have to maintain, and the number has no business drifting upward without
    // someone noticing. Frozen at the measured value rather than a comfortable round one — a ceiling
    // set above the real count is a gate that permits exactly what it claims to prevent.
    const used = new Set(sites.map((s) => s.key));
    const unused = Object.keys(STRINGS.en).filter((k) => !used.has(k));
    expect(unused.length, `keys unreachable by static analysis:\n  ${unused.join('\n  ')}`).toBeLessThanOrEqual(22);
  });
});
