import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { scan } from '../../scripts/ci/i18n-adoption.mjs';

// ADOPTION, not parity. The sibling i18n.test.js proves `en` and `zh-CN` cover the same 98 keys — and it
// passed happily while 109 user-facing strings sat hardcoded across 23 files, five of them in files that
// import i18n and hardcode anyway. A player switching to zh-CN gets a half-English UI behind a green gate.
// That is the metric measuring the dictionary instead of the product, and no key-parity test can ever catch
// it, because the strings it should measure were never keys.
//
// This is a RATCHET, deliberately, not a zero-target: 109 pre-existing occurrences cannot be fixed in one
// commit, and a gate demanding that would be switched off within a day. Counts may shrink freely; a count
// that grows, or a new file appearing with any hits, fails. It is enforceable today and converges one
// commit at a time.
const LEDGER = resolve(__dirname, '.i18n-adoption-ledger.json');

describe('i18n adoption ratchet', () => {
  const { _total: frozenTotal, ...frozen } = JSON.parse(readFileSync(LEDGER, 'utf8'));
  const hits = scan();
  const now = Object.fromEntries(Object.entries(hits).map(([f, v]) => [f, v.length]));

  it('no file gained a hardcoded user-facing string', () => {
    const grew = Object.entries(now)
      .filter(([f, n]) => frozen[f] !== undefined && n > frozen[f])
      .map(([f, n]) => `${f}: ${frozen[f]} -> ${n}`);
    expect(
      grew,
      `User-facing copy must go through t(). Add the key to src/i18n/strings.js (BOTH en and zh-CN),\n` +
        `wrap the literal, then re-freeze: node scripts/ci/i18n-adoption.mjs --write\n` +
        `Inspect: node scripts/ci/i18n-adoption.mjs --list`
    ).toEqual([]);
  });

  it('no new file appeared with hardcoded user-facing strings', () => {
    const novel = Object.keys(now).filter((f) => frozen[f] === undefined);
    expect(novel, 'a NEW file is shipping untranslatable copy').toEqual([]);
  });

  it('the ledger is a ceiling that only ever falls', () => {
    const total = Object.values(now).reduce((a, b) => a + b, 0);
    expect(total, `total hardcoded strings must not exceed the frozen ${frozenTotal}`).toBeLessThanOrEqual(
      frozenTotal
    );
  });
});
