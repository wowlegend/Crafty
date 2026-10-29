import { describe, it, expect } from 'vitest';
import { QUESTIONS, PROMPT, STALE, plant, scoreAnswer, scoreAll, parseStream, extractAnswers, outsidePaths, KEY_FILES } from '../../scripts/dev/cold-takeover-eval.mjs';

// Sited in tests/scripts/: the subject is the eval's scorer, a tooling script. The answer fixtures below are written to
// be right in other words (FAIL-but-right) and wrong in the words of a stale doc (PASS-but-wrong), so the scorer is
// tested on both directions it can fail.

const ctx = { open: 237, inFlight: 0 };
const q = (id) => QUESTIONS.find((x) => x.id === id);

const RIGHT = {
  q1: 'Source is in frontend/src, tests in frontend/tests (plus colocated *.test.js in src); run npm from frontend/.',
  q2: 'Each lane is a PR. Merge main into the branch, push it, and when `ci ok` passes on that exact sha, fast-forward main to it. Branch protection requires ci ok on main; no force pushes.',
  q3: 'Reviewers and verifiers: Opus 5.5 at effort xhigh, never max unless Kevin asks. Use Sonnet 5.5 and Haiku 5.5 liberally, with an explicit effort, never low.',
  q4: 'Spend no money; never force-push or rewrite pushed history. No AI "Generated with" or Co-Authored-By footer. Never amend: fix-ups are new commits.',
  q5: 'Nothing is locked (DECISIONS 2026-10-28 items 14 and 16); a decision stands while it earns its place.',
  q6: 'memory/registry.jsonl; 237 rows are open.',
  q7: 'A throwaway copy is cp -c -R of the worktree with frontend/node_modules symlinked, never git clone + npm ci. No local e2e or lookbook unless a look question needs a GPU; CI runs the heavy suites.',
  q8: 'Kill what you launch and sweep with sh frontend/scripts/dev/kill-test-procs.sh. You cannot see whether a tab was left, so never say "all clean".',
  q9: 'Never bind reactive React state (useState, zustand subscriptions) to useFrame or Rapier; read through refs, getState() or miniplex queries.',
  q10: 'No emoji in frontend/src; tests/gates/static-gates.test.js enforces it.',
};

describe('cold-takeover-eval — the question set', () => {
  it('asks ten questions, nine of them directives, each with at least one required pattern', () => {
    expect(QUESTIONS).toHaveLength(10);
    for (const x of QUESTIONS) expect(x.required.length, x.id).toBeGreaterThan(0);
    for (const x of QUESTIONS) expect(PROMPT).toContain(x.ask);
    expect(PROMPT).toContain('"q1" to "q10"');
  });

  it('keeps the answer key out of the copy: the eval, its test and the lane plan', () => {
    expect(KEY_FILES).toEqual(expect.arrayContaining(['frontend/scripts/dev/cold-takeover-eval.mjs', 'frontend/tests/scripts/cold-takeover-eval.test.js']));
  });
});

describe('cold-takeover-eval — scoring', () => {
  it('the right answers, in plain words, score 10 of 10 (FAIL-but-right)', () => {
    const s = scoreAll(RIGHT, ctx);
    expect(s.results.filter((r) => !r.ok)).toEqual([]);
    expect(s.correct).toBe(10);
  });

  it('paraphrases still pass: "max only if Kevin asks", "no part is locked", the count with in-flight rows', () => {
    expect(scoreAnswer(q('q3'), 'xhigh for reviewers; max only if Kevin asks for it. Sonnet and Haiku wherever they fit.').ok).toBe(true);
    expect(scoreAnswer(q('q5'), 'No part is locked: items 14 and 16 make every decision re-openable.').ok).toBe(true);
    expect(scoreAnswer(q('q6'), 'memory/registry.jsonl, 240 open or in flight', { open: 237, inFlight: 3 }).ok).toBe(true);
  });

  it('a stale answer fails on what the stale doc says (PASS-but-wrong)', () => {
    const r3 = scoreAnswer(q('q3'), 'Opus 5.5 reviewers at effort max; Sonnet and Haiku for bulk mechanical work.');
    expect(r3.ok).toBe(false);
    expect(r3.forbidden).toEqual(['effort max as the setting']);
    expect(r3.missing).toEqual(['xhigh', 'never max']);
    expect(scoreAnswer(q('q5'), 'The S1-C design language is locked; items 14 and 16 do not apply to it.').forbidden).toEqual(['a named lock']);
    expect(scoreAnswer(q('q2'), 'Open a PR; when ci ok is green on the exact sha, squash-merge it on GitHub (main is protected). Fast-forward is not used.').forbidden)
      .toEqual(['a squash merge as the route']);
    expect(scoreAnswer(q('q6'), 'Open work lives in memory/registry.jsonl; about 200 items.', ctx).missing).toEqual(['the open count (237 or 237)']);
  });

  it('a missing answer is wrong, never skipped', () => {
    const s = scoreAll({ ...RIGHT, q9: undefined }, ctx);
    expect(s.correct).toBe(9);
    expect(scoreAll(null, ctx).correct).toBe(0);
  });
});

describe('cold-takeover-eval — the planted control', () => {
  it('replaces the whole reviewer-effort bullet with the stale line, and refuses to plant nothing', () => {
    const md = '# X\n- **Models and effort for Crafty.** Reviewers run at xhigh,\n  never max; Sonnet and Haiku liberally.\n- **Next.** kept\n';
    const out = plant(md);
    expect(out).toBe(`# X\n${STALE}\n- **Next.** kept\n`);
    expect(out).not.toMatch(/xhigh/);
    expect(() => plant('# no such directive\n')).toThrow(/plant nothing/);
    expect(scoreAnswer(q('q3'), STALE.replace(/^- \*\*Models and effort\.\*\* /, '')).ok, 'the stale line itself must fail q3').toBe(false);
  });
});

describe('cold-takeover-eval — reading the transcript', () => {
  const stream = [
    JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-sonnet-5-5' }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }, { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/c/repo/memory/STATUS.md' } }] } }),
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'cat /srv/real-checkout/CLAUDE.md' } }] } }),
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't2', content: 'denied', is_error: true }] } }),
    'not json',
    JSON.stringify({ type: 'result', result: 'Done.\n```json\n{"q1": "a {braced} answer", "q2": "b"}\n```' }),
  ].join('\n');

  it('counts every tool call, keeps its error flag, and reads the served model and the final text', () => {
    const p = parseStream(stream);
    expect(p.uses.map((u) => [u.name, u.isError])).toEqual([['Read', false], ['Bash', true]]);
    expect(p.model).toBe('claude-sonnet-5-5');
    expect(extractAnswers(p.finalText)).toEqual({ q1: 'a {braced} answer', q2: 'b' });
    expect(extractAnswers('no json here')).toBe(null);
  });

  it('flags an absolute path or a `..` escape outside the copy, and passes one inside it', () => {
    const p = parseStream(stream);
    expect(outsidePaths(p.uses[0], ['/c/repo'])).toEqual([]);
    expect(outsidePaths(p.uses[1], ['/c/repo'])).toEqual(['/srv/real-checkout/CLAUDE.md']);
    expect(outsidePaths({ input: { command: 'cat ../../secret' } }, ['/c/repo'])).toHaveLength(1);
  });
});
