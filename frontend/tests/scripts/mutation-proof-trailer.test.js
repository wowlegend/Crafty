import { describe, it, expect } from 'vitest';
import { offenders, GATE_PATHS, TRAILER } from '../../scripts/ci/mutation-proof-trailer.mjs';

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
