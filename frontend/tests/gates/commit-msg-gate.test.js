import { describe, it, expect } from 'vitest';
import { owedProof, stripComments } from '../../scripts/ci/commit-msg-gate.mjs';

// Behavioural: exercises the decision function directly, so gate-shape's source-grep ratchet does not rise.
// SCOPE is the design here, exactly as in the pre-push twin — too wide and a sweep turns the check into
// noise (which is how a gate gets switched off), too narrow and it never fires.

const PROOF = 'subject\n\nMutation-Proof: deleted the assert -> RED ("0 checked")\n';

describe('commit-msg gate — what owes a proof', () => {
  it('a NEW gate test owes one', () => {
    const r = owedProof({ added: ['frontend/tests/gates/new.test.js'] });
    expect(r.owes).toBe(true);
    expect(r.satisfied).toBe(false);
    expect(r.newGates).toEqual(['frontend/tests/gates/new.test.js']);
  });

  it('a NEW ci checker owes one', () => {
    expect(owedProof({ added: ['frontend/scripts/ci/thing.mjs'] }).owes).toBe(true);
  });

  it('an ASSERTION REWRITE of an existing gate owes one — the hole this closes', () => {
    const r = owedProof({ assertionEdits: ['frontend/tests/gates/existing.test.js'] });
    expect(r.owes).toBe(true);
    expect(r.rewritten).toEqual(['frontend/tests/gates/existing.test.js']);
  });

  it('the trailer satisfies it', () => {
    expect(owedProof({ added: ['frontend/tests/gates/n.test.js'], message: PROOF }).satisfied).toBe(true);
    expect(owedProof({ assertionEdits: ['frontend/tests/gates/e.test.js'], message: PROOF }).satisfied).toBe(true);
  });

  it('an EMPTY trailer does not — the point is stating the proof, not typing the word', () => {
    expect(owedProof({ added: ['frontend/tests/gates/n.test.js'], message: 'subject\n\nMutation-Proof:\n' }).satisfied).toBe(false);
  });

  it('NON-gate files owe nothing, however many there are', () => {
    const r = owedProof({ added: ['frontend/src/a.js', 'docs/b.md'], assertionEdits: ['frontend/src/c.js'] });
    expect(r.owes).toBe(false);
    expect(r.satisfied).toBe(true);
  });

  it('a commit with NOTHING staged owes nothing', () => {
    expect(owedProof({}).owes).toBe(false);
  });

  it('ignores a trailer that only appears in a COMMENT line', () => {
    // git's template comments are stripped before the message is recorded, so a "Mutation-Proof:" sitting
    // in the commented help text must NOT satisfy the gate — it never reaches the commit.
    const commented = 'subject\n\n# Mutation-Proof: this is git template help, not my claim\n';
    expect(owedProof({ added: ['frontend/tests/gates/n.test.js'], message: commented }).satisfied).toBe(false);
  });

  it('stripComments removes only leading-# lines, never body text containing #', () => {
    expect(stripComments('a\n# c\nb #not-a-comment\n')).toBe('a\nb #not-a-comment\n');
  });
});
