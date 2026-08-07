import { describe, it, expect } from 'vitest';
import { offenders, GATE_PATHS, TRAILER, touchesAssertions } from '../../scripts/ci/mutation-proof-trailer.mjs';

// The decision is a pure function so it can be tested without a repo, and so the SCOPE is pinned.
// Scope is the whole design here: too wide and the check becomes noise during a sweep, which is how a gate
// gets switched off; too narrow and it never fires. These fixtures are the contract.
const c = (over = {}) => ({ sha: 'abc1234', subject: 'test: a thing', message: 'test: a thing\n', added: [], ...over });

describe('mutation-proof trailer — scope', () => {
  it('flags a commit that ADDS a gate test with no trailer', () => {
    const bad = offenders([c({ added: ['frontend/tests/gates/new-gates.test.js'] })]);
    expect(bad).toHaveLength(1);
    expect(bad[0].gates).toEqual(['frontend/tests/gates/new-gates.test.js']);
  });

  it('flags a commit that ADDS a CI checker with no trailer', () => {
    expect(offenders([c({ added: ['frontend/scripts/ci/thing.mjs'] })])).toHaveLength(1);
  });

  it('passes once the trailer is present', () => {
    const message = 'test: a thing\n\nMutation-Proof: deleted the import -> gate RED ("not defined")\n';
    expect(offenders([c({ added: ['frontend/tests/gates/new-gates.test.js'], message })])).toEqual([]);
  });

  it('does NOT flag EDITING an existing gate — only adding one', () => {
    // `added` is populated from --diff-filter=A, so an edit contributes nothing. Demanding a trailer for
    // every tweak during a sweep is noise, and noise is how a check gets disabled.
    expect(offenders([c({ added: [] })])).toEqual([]);
  });

  it('does NOT flag ordinary source or non-gate tests', () => {
    const added = [
      'frontend/src/ui/GameHud.jsx',
      'frontend/tests/i18n/whatever.test.js',
      'frontend/tests/scripts/helper.test.js',
      'docs/superpowers/NOTES.md',
      'frontend/scripts/visual/probe.mjs',
    ];
    expect(offenders([c({ added })])).toEqual([]);
  });

  it('accepts the trailer anywhere in the body, case-insensitively', () => {
    for (const message of [
      'subject\n\nmutation-proof: broke X -> RED\n',
      'subject\n\nbody text\n\nMutation-Proof: broke X -> RED\nCo-something: y\n',
    ]) {
      expect(offenders([c({ added: ['frontend/tests/gates/g.test.js'], message })])).toEqual([]);
    }
  });

  it('rejects an EMPTY trailer — the point is stating the proof, not typing the word', () => {
    const message = 'subject\n\nMutation-Proof:\n';
    expect(offenders([c({ added: ['frontend/tests/gates/g.test.js'], message })])).toHaveLength(1);
    expect(TRAILER.test('Mutation-Proof:   ')).toBe(false);
  });

  it('reports every offending commit in a multi-commit push, not just the first', () => {
    const bad = offenders([
      c({ sha: 'aaa', added: ['frontend/tests/gates/one.test.js'] }),
      c({ sha: 'bbb', added: ['frontend/src/fine.js'] }),
      c({ sha: 'ccc', added: ['frontend/scripts/ci/two.mjs'] }),
    ]);
    expect(bad.map((x) => x.sha)).toEqual(['aaa', 'ccc']);
  });

  it('GATE_PATHS matches gate tests and ci checkers, and nothing else', () => {
    const hits = (f) => GATE_PATHS.some((re) => re.test(f));
    expect(hits('frontend/tests/gates/a.test.jsx')).toBe(true);
    expect(hits('frontend/scripts/ci/a.mjs')).toBe(true);
    expect(hits('frontend/tests/gates/README.md')).toBe(false);
    expect(hits('frontend/scripts/dev/a.mjs')).toBe(false);
  });
});

describe('mutation-proof trailer — assertion REWRITES (the hole, closed 2026-08-07)', () => {
  // `--diff-filter=A` alone meant that replacing a vacuous gate with another vacuous one demanded NO proof —
  // which is exactly where this rule failed twice (`91530be`, `03c4297`, both edits). These pin the widened
  // scope AND its limit: too wide and a rename sweep turns the check into noise, which is how gates die.
  const diff = (...lines) => lines.join('\n');

  it('flags a commit that REWRITES an existing gate\'s assertions with no trailer', () => {
    const bad = offenders([c({ rewrote: ['frontend/tests/gates/existing.test.js'] })]);
    expect(bad).toHaveLength(1);
    expect(bad[0].gates).toEqual(['frontend/tests/gates/existing.test.js']);
  });

  it('passes a rewrite once the trailer is present', () => {
    const message = 'subject\n\nMutation-Proof: broke X -> RED\n';
    expect(offenders([c({ rewrote: ['frontend/tests/gates/existing.test.js'], message })])).toEqual([]);
  });

  it('still ignores a rewrite of a NON-gate file', () => {
    expect(offenders([c({ rewrote: ['frontend/src/thing.js'] })])).toEqual([]);
  });

  it('treats a missing `rewrote` as empty, so an old-shaped commit object cannot throw', () => {
    const commit = { sha: 'a', subject: 's', message: 's\n', added: [] };
    expect(offenders([commit])).toEqual([]);
  });

  it('touchesAssertions: TRUE when an expect/assert line is added or removed', () => {
    expect(touchesAssertions(diff('@@ -1 +1 @@', '+  expect(x).toBe(3);'))).toBe(true);
    expect(touchesAssertions(diff('@@ -1 +0 @@', '-  expect(checked).toBeGreaterThan(0);'))).toBe(true);
    expect(touchesAssertions(diff('@@ -1 +1 @@', '+  errors.push(`stale`);'))).toBe(true);
    expect(touchesAssertions(diff('@@ -1 +1 @@', '+  process.exit(1);'))).toBe(true);
    expect(touchesAssertions(diff('@@ -1 +1 @@', '+  throw new Error("no");'))).toBe(true);
  });

  it('touchesAssertions: FALSE for the churn that must stay silent', () => {
    // A comment, an import reorder and a rename change nothing about what the gate can catch. If these fired,
    // every sweep would demand a trailer per file and the check would be switched off inside a day.
    expect(touchesAssertions(diff('@@ -1 +1 @@', '+// explain the import', '-// old comment'))).toBe(false);
    expect(touchesAssertions(diff('@@ -1 +1 @@', "+import { a } from './a.js';"))).toBe(false);
    expect(touchesAssertions(diff('@@ -1 +1 @@', '+  const renamed = buildFixture();'))).toBe(false);
    expect(touchesAssertions('')).toBe(false);
  });

  it('touchesAssertions: ignores the +++/--- file headers, which contain the path not the code', () => {
    // A file literally named `.../expect-something.test.js` appears in the header lines; counting those would
    // make the check fire on every rename of such a file.
    const header = diff('--- a/frontend/tests/gates/expect-toBe.test.js', '+++ b/frontend/tests/gates/expect-toBe.test.js');
    expect(touchesAssertions(header)).toBe(false);
  });
});
