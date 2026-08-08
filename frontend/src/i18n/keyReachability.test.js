import { describe, it, expect } from 'vitest';
import { classifyKeys, deadKeys, tallyKinds, dynamicPrefixes, escapeKey, KINDS } from './keyReachability.js';

// THE FOUR NEAR-MISSES ARE THE POINT OF THIS FILE.
//
// The bash pipeline that authorized deleting 22 lines of copy from both locales was wrong four times
// before it was right, and it carried no test, no mutation proof and no denominator. Each way it was
// wrong is a fixture here, so the classifier that replaces it cannot repeat any of them silently.

describe('near-miss 1: an unescaped dot in a regex matches ANY character', () => {
  it('rarity.common is NOT reached by the string "rarity-common"', () => {
    const v = classifyKeys(['rarity.common'], ["const cls = 'rarity-common';"]);
    expect(v['rarity.common']).toBe('dead');
  });
  it('escapeKey neutralises every regex metacharacter it can meet in a key', () => {
    expect(new RegExp(escapeKey('a.b')).test('a-b')).toBe(false);
    expect(new RegExp(escapeKey('a.b')).test('a.b')).toBe(true);
  });
});

describe('near-miss 2: a PREFIX match is not a key match', () => {
  it('ui.level is NOT reached by t("ui.level_short")', () => {
    const v = classifyKeys(['ui.level'], ["<span>{t('ui.level_short')}</span>"]);
    expect(v['ui.level']).toBe('dead');
  });
  it('...while the exact key still resolves', () => {
    const v = classifyKeys(['ui.level'], ["<span>{t('ui.level')}</span>"]);
    expect(v['ui.level']).toBe('literal');
  });
});

describe('near-miss 3: a property path is not a usage', () => {
  it('rarity.common is NOT reached by the colour token C.rarity.common', () => {
    const v = classifyKeys(['rarity.common'], ['const c = C.rarity.common;']);
    expect(v['rarity.common']).toBe('dead');
  });
  it('...but a genuine bare key in a data table IS a usage', () => {
    const v = classifyKeys(['rarity.common'], ["const TABLE = [{ label: 'rarity.common' }];"]);
    expect(v['rarity.common']).toBe('table');
  });
});

describe('near-miss 4: referenced only by a test is a FIXTURE, not dead', () => {
  it('ui.level is a fixture when only the test corpus names it', () => {
    const v = classifyKeys(['ui.level'], ['export const x = 1;'], ["expect(t('ui.level', { n: 3 }))"]);
    expect(v['ui.level']).toBe('fixture');
    expect(deadKeys(v)).toEqual([]);
  });
});

describe('dynamic prefixes keep template-built keys alive', () => {
  it('spell.fire is reachable through t(`spell.${s.spell}`)', () => {
    const v = classifyKeys(['spell.fire'], ['const el = t(`spell.${s.spell}`);']);
    expect(v['spell.fire']).toBe('dynamic');
  });
  it('extracts the static prefix, and nothing when there is no interpolation', () => {
    expect(dynamicPrefixes(['t(`spell.${x}`)'])).toEqual(['spell.']);
    expect(dynamicPrefixes(["t('spell.fire')"])).toEqual([]);
  });
  it('a DIFFERENT prefix does not rescue an unrelated key', () => {
    const v = classifyKeys(['ui.mana'], ['const el = t(`spell.${s.spell}`);']);
    expect(v['ui.mana']).toBe('dead');
  });
});

describe('the denominator the original pipeline never printed', () => {
  it('tallies every key into exactly one kind, and the kinds sum to the input', () => {
    const keys = ['a.lit', 'b.dyn', 'c.table', 'd.fix', 'e.dead'];
    const v = classifyKeys(
      keys,
      ["t('a.lit')", 't(`b.${x}`)', "const T = ['c.table'];"],
      ["expect(t('d.fix'))"]
    );
    const t = tallyKinds(v);
    expect(t).toEqual({ literal: 1, dynamic: 1, table: 1, fixture: 1, dead: 1 });
    expect(Object.values(t).reduce((a, b) => a + b, 0)).toBe(keys.length);
    expect(KINDS).toContain(v['e.dead']);
    expect(deadKeys(v)).toEqual(['e.dead']);
  });

  it('classification is total — no key is ever left unclassified', () => {
    const v = classifyKeys(['x.y', 'z.w'], [], []);
    expect(Object.keys(v)).toHaveLength(2);
    for (const k of Object.keys(v)) expect(KINDS).toContain(v[k]);
  });
});

describe('near-miss 5 (found by this classifier failing on the real dictionary)', () => {
  // The first version of this file classified every key as reachable and reported ZERO dead keys, which
  // looked like a clean bill of health. It was vacuous: the corpus included src/i18n/strings.js, so each
  // key matched its OWN DEFINITION -- `'ui.level': 'Level {n}'` is a quoted occurrence of `ui.level`.
  // A classifier that cannot return `dead` is not a classifier, and it would have blessed any deletion
  // list handed to it. Caught by checking a documented fact (ui.level is test-only) against the output.
  it('a key is NOT reachable merely because the dictionary defines it', () => {
    const dictionary = "export const STRINGS = { en: { 'ui.level': 'Level {n}' } };";
    const v = classifyKeys(['ui.level'], [dictionary], []);
    expect(v['ui.level']).toBe('dead');
  });

  it('a key is NOT reachable from a COMMENT that names it', () => {
    const v = classifyKeys(['ui.level'], ["// 'ui.level' is the interpolation fixture\nconst x = 1;"], []);
    expect(v['ui.level']).toBe('dead');
  });

  it('and a real data-table usage still counts', () => {
    const v = classifyKeys(['ui.build'], ["const TRAY = [{ labelKey: 'ui.build' }];"], []);
    expect(v['ui.build']).toBe('table');
  });
});
