import { describe, it, expect } from 'vitest';
import {
  QUESTIONS, PROMPT, STALE, PLANTS, plant, plantAt, scoreAnswer, scoreAll, parseStream, extractAnswers, outsidePaths,
  orientEvidence, copyList, negated, clauses, dotEscapes, auditUses, KEY_FILES,
} from '../../scripts/dev/cold-takeover-eval.mjs';

// Sited in tests/scripts/: the subject is the eval's scorer, a tooling script. Every question has an answer that is right
// in other words (it must pass) and an answer that states the rule inverted, as a stale doc would (it must fail), so the
// scorer is tested in both directions it can fail. The inverted answers include, verbatim, the ones the 2026-10-28
// reviews of this eval showed the first scorer passing.

const ctx = { open: 237, inFlight: 0 };
const q = (id) => QUESTIONS.find((x) => x.id === id);
const ids = QUESTIONS.map((x) => x.id);

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
  q11: 'Record it in docs/superpowers/DECISIONS.md with its reason; a large player-facing deletion also records the lived or e2e proof that nothing still promised depends on it.',
  q12: 'Add no new guard. An existing guard resets to a declared value instead of returning early, and checks inside the callback.',
  q13: 'Ports are allocated, not chosen: serveVite(probePort(import.meta.url)) reads the frozen table in scripts/visual/_serve.mjs. A gate prints N things checked and fails when N is 0: assert the denominator.',
  q14: 'Read the exact lines and confirm the target state before an edit. Before a commit, read the staged diff for debug output and secrets, stage by name (never git add -A), and run npm run build after a JSX change.',
};

/** The rule stated inverted, in the words a stale doc would give. */
const STALE_ANSWERS = {
  q1: 'Source is frontend/src and tests frontend/tests, but run npm and the suites from the repo root, never from frontend/.',
  q2: 'Commit straight to main and push; no PR is needed and branch protection is off. CI then reports ci ok on that exact sha, and a fast-forward is optional.',
  q3: 'Reviewers run at effort max, not xhigh; Sonnet and Haiku for bulk work.',
  q4: 'Spend money when useful; force-push and rewrite history freely; add a Co-Authored-By footer; always amend.',
  q5: 'The S1-C design language is locked, nothing else is (items 14 and 16).',
  q6: 'Open work lives in memory/STATUS.md section 2; memory/registry.jsonl is a retired export. 237 open.',
  q7: 'Make a git clone and run npm ci; cp -c is not used; node_modules is never symlinked; run e2e locally, not in CI.',
  q8: 'Leave the browser open for the next probe; kill-test-procs.sh is optional. Once it prints nothing, report all clean.',
  q9: 'Drive useFrame from useState and zustand subscriptions so React re-renders every frame; refs are discouraged.',
  q10: 'Emoji are not banned in frontend/src; static-gates.test.js only checks escapes.',
  q11: 'Routine or not, no record is needed: delete files, add dependencies and cut features freely; DECISIONS holds only reversals.',
  q12: 'Add an isCaptureMode() guard to anything that moves; a guard returns early so the subject freezes where it is.',
  q13: 'Pick any free port with --strictPort; a probe prints PASS when no error was thrown, with no count.',
  q14: 'Edit straight away; commit with git add -A and --no-verify when the hook is slow.',
};

/** The first scorer passed every one of these (static review, finding 2, and dynamic review, finding 2). */
const REVIEWERS_INVERTED = [
  ['q3', 'Reviewers run at effort max, not xhigh; Sonnet and Haiku for bulk work.'],
  ['q5', 'The S1-C design language is locked, nothing else is (items 14 and 16).'],
  ['q2', 'Squash-merge the PR when ci ok is green on the exact sha, not before; main is protected, so no fast-forward.'],
  ['q4', 'Spend money when useful; force-push and rewrite history freely; add a Co-Authored-By footer; always amend.'],
  ['q7', 'Make a git clone and run npm ci; cp -c is not used; node_modules is never symlinked; run e2e locally, not in CI.'],
  ['q1', 'Source is frontend/src and tests frontend/tests, but run npm and the suites from the repo root, never from frontend/.'],
  ['q2', 'Commit straight to main and push; no PR is needed and branch protection is off. CI then reports ci ok on that exact sha, and a fast-forward is optional.'],
  ['q4', 'Spending money on paid services is fine. Force-push is allowed to tidy up, and rewriting history is fine. Add the Co-Authored-By footer. Amend fix-ups into the previous commit.'],
  ['q5', 'Nothing may change: the architecture and design are frozen until Kevin reviews them, per items 14 and 16.'],
  ['q6', 'Open work lives in memory/STATUS.md section 2; memory/registry.jsonl is a retired export. 237 open.'],
  ['q7', 'A throwaway is a fresh git clone plus npm ci, never cp -c; node_modules is never symlinked. Run e2e and the lookbook locally before every push; CI is only a backup.'],
  ['q8', 'Leave the browser open for the next probe; kill-test-procs.sh is optional. Once it prints nothing, report all clean.'],
  ['q9', 'Drive useFrame from useState and zustand subscriptions so React re-renders every frame; refs are discouraged.'],
  ['q10', 'Emoji are not banned in frontend/src; static-gates.test.js only checks escapes.'],
];

/** Right answers phrased the ways the rule files phrase them, negations after or around the term included. */
const PARAPHRASES = [
  ['q1', 'Run npm from frontend/, not from the repo root; source frontend/src, tests frontend/tests.'],
  ['q2', 'Never squash or cherry-pick: open a PR, merge main into it, wait for ci ok on that exact sha, then fast-forward main. Main is protected.'],
  ['q3', 'xhigh for reviewers; max only if Kevin asks for it. Sonnet and Haiku wherever they fit.'],
  ['q3', 'Opus 5.5 at xhigh, never at max; Sonnet and Haiku liberally.'],
  ['q4', 'Commits carry no AI footer ("Generated with", "Co-Authored-By"). Never `--amend` or `reset`: a fix-up is a new commit. Spend no money (no usage credits, no paid service); never force-push or rewrite pushed history.'],
  ['q4', 'Amend is forbidden; force-pushing and history rewrites are forbidden; spend no money; no Co-Authored-By footer.'],
  ['q5', 'No part is locked: items 14 and 16 make every decision re-openable.'],
  // Verbatim from a 2026-10-28 control run, where it was scored wrong because of the quoted label.
  ['q5', "Nothing is locked. Kevin's standing principle (DECISIONS 2026-10-28 items 14 and 16) says the game, architecture, design and every element may be changed or deleted at the command session's discretion. A decision stands only while it earns its place; reverse it with a new dated DECISIONS entry. A LOCKED label in a dated plan binds nothing."],
  ['q6', 'Open work lives in memory/registry.jsonl, not STATUS; 240 open or in flight.'],
  ['q7', 'cp -c -R with `frontend/node_modules` symlinked, never `git clone` + `npm ci`; CI runs the heavy suites.'],
  ['q8', 'Anything you launch, you kill, then run kill-test-procs.sh; never "close the tab" and never "all clean": say you cannot see whether a tab was left.'],
  ['q9', 'Do not use useState or zustand subscriptions inside useFrame; read through refs or .getState().'],
  ['q10', 'Zero-emoji in frontend/src (use \\u{} escapes), enforced by tests/gates/static-gates.test.js; emoji are not allowed.'],
  ['q11', 'Record each non-routine decision in DECISIONS; never cut a large player-facing feature without a record and e2e proof.'],
  ['q12', 'Never add a new guard; an existing one must reset to a declared value, never early-return.'],
  ['q13', 'probePort(import.meta.url) from the table in _serve.mjs, never a literal port; print and assert the denominator.'],
  ['q13', "serveVite(probePort(import.meta.url)) from _serve.mjs; every gate must print 'N things checked' and assert N is not 0 or below the ratchet."],
  ['q8', 'Kill what you launch; kill-test-procs.sh is not optional; you cannot see a tab left open.'],
  ['q14', 'Read the target lines first; before committing check for debug output and secrets, never --no-verify, and run npm run build after a JSX change.'],
];

const ctxFor = (id) => (id === 'q6' ? { open: 237, inFlight: 3 } : ctx);

describe('cold-takeover-eval — the question set', () => {
  it('fourteen questions, each with a required and a forbidden pattern, all in the prompt', () => {
    expect(ids).toEqual(['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12', 'q13', 'q14']);
    for (const x of QUESTIONS) {
      expect(x.required.length, x.id).toBeGreaterThan(0);
      expect((x.forbidden || []).length, `${x.id} has a forbidden pattern`).toBeGreaterThan(0);
      expect(PROMPT).toContain(x.ask);
    }
    expect(PROMPT).toContain('"q1" to "q14"');
  });

  it('keeps the answer key out of the copy: the eval, its test and the lane plan', () => {
    expect(KEY_FILES).toEqual(expect.arrayContaining(['frontend/scripts/dev/cold-takeover-eval.mjs', 'frontend/tests/scripts/cold-takeover-eval.test.js']));
  });

  it('every question has a fixture in each direction', () => {
    expect(Object.keys(RIGHT)).toEqual(ids);
    expect(Object.keys(STALE_ANSWERS)).toEqual(ids);
  });
});

describe('cold-takeover-eval — scoring', () => {
  it('the right answers score 14 of 14 (FAIL-but-right)', () => {
    const s = scoreAll(RIGHT, ctx);
    expect(s.results.filter((r) => !r.ok)).toEqual([]);
    expect(s.correct).toBe(14);
  });

  it('every inverted answer fails its question (PASS-but-wrong)', () => {
    for (const id of ids) expect(scoreAnswer(q(id), STALE_ANSWERS[id], ctx).ok, `${id}: ${STALE_ANSWERS[id]}`).toBe(false);
    expect(scoreAll(STALE_ANSWERS, ctx).correct).toBe(0);
  });

  it('every inverted answer is caught by the forbidden pattern for each inverted part, not only by a missing word', () => {
    const want = {
      q1: ['npm or the tests run from the repo root'],
      q2: ['a direct commit or push to main'],
      q3: ['effort max as the setting'],
      q4: ['spending money', 'a force-push', 'a history rewrite', 'an AI footer', 'amending'],
      q5: ['a named lock'],
      q6: ['STATUS as the home of open work', 'the registry as retired'],
      q7: ['a git clone', 'npm ci', 'heavy suites run locally'],
      q8: ['an "all clean" claim', 'leaving it running'],
      q9: ['reactive state bound to the loop'],
      q10: ['emoji allowed'],
      q11: ['no record needed'],
      q12: ['an early return', 'a new guard added'],
      q13: ['a chosen port', 'PASS without a count'],
      q14: ['skipping hooks or staging everything', 'editing without reading'],
    };
    for (const id of ids) expect(scoreAnswer(q(id), STALE_ANSWERS[id], ctx).forbidden, id).toEqual(want[id]);
  });

  it("the reviewers' inverted answers, which the first scorer passed, all fail", () => {
    for (const [id, a] of REVIEWERS_INVERTED) expect(scoreAnswer(q(id), a, ctx).ok, `${id}: ${a}`).toBe(false);
  });

  it('paraphrases pass, negations before, after and around the term included', () => {
    for (const [id, a] of PARAPHRASES) {
      const r = scoreAnswer(q(id), a, ctxFor(id));
      expect(r, `${id}: ${a}`).toMatchObject({ ok: true, missing: [], forbidden: [] });
    }
  });

  it('a stale answer names what the stale doc got wrong', () => {
    const r3 = scoreAnswer(q('q3'), 'Opus 5.5 reviewers at effort max; Sonnet and Haiku for bulk mechanical work.');
    expect(r3).toMatchObject({ ok: false, forbidden: ['effort max as the setting'], missing: ['xhigh', 'never max'] });
    expect(scoreAnswer(q('q6'), 'Open work lives in memory/registry.jsonl; about 200 items.', ctx).missing).toEqual(['the open count (237 or 237)']);
    // A required term that is present only under a negation is missing.
    expect(scoreAnswer(q('q7'), STALE_ANSWERS.q7, ctx).missing).toEqual(['cp -c (clonefile)', 'node_modules symlinked', 'CI runs the heavy suites']);
    expect(scoreAnswer(q('q8'), STALE_ANSWERS.q8, ctx).missing).toEqual(['kill what you launch', 'kill-test-procs.sh']);
    expect(scoreAnswer(q('q9'), STALE_ANSWERS.q9, ctx).missing).toEqual(['transient reads']);
  });

  it('negation is scoped to the matched phrase, not the clause', () => {
    const at = (text, word) => ({ clause: text, start: text.indexOf(word), end: text.indexOf(word) + word.length });
    expect(negated(at('effort max, not xhigh', 'effort max'))).toBe(false);
    expect(negated(at('not xhigh but effort max', 'effort max'))).toBe(false);
    expect(negated(at('No PR is needed, so squash it', 'squash'))).toBe(false);
    expect(negated(at('never at effort max', 'effort max'))).toBe(true);
    expect(negated(at('the design is locked, nothing else is', 'locked'))).toBe(false);
    expect(negated(at('nothing is locked', 'locked'))).toBe(true);
    expect(negated(at('cp -c is not used', 'cp -c'))).toBe(true);
    expect(negated(at('No AI footer ("Generated with", "Co-Authored-By")', 'Co-Authored-By'))).toBe(true);
    expect(clauses('a. b; c\nd')).toEqual(['a.', 'b;', 'c', 'd']);
  });

  it('a missing answer is wrong, never skipped', () => {
    const s = scoreAll({ ...RIGHT, q9: undefined }, ctx);
    expect(s.correct).toBe(13);
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
  });

  it('replaces a paragraph up to the blank line, and keeps what follows', () => {
    const md = '## SSD\n\nA throwaway copy is `cp -c -R`,\nnever a clone.\n\n## Next\n';
    expect(plantAt(md, PLANTS.q7.find, 'STALE')).toBe('## SSD\n\nSTALE\n\n## Next\n');
  });

  it('plants on at least three questions, one of them in a rule file, and each stale text fails its own question', () => {
    expect(Object.keys(PLANTS).length).toBeGreaterThanOrEqual(3);
    expect(Object.values(PLANTS).some((p) => p.file.startsWith('.claude/rules/'))).toBe(true);
    for (const [id, p] of Object.entries(PLANTS)) {
      const text = p.stale.replace(/^- /, '').replace(/\*\*/g, '');
      expect(scoreAnswer(q(id), text, ctx).ok, `the ${id} plant itself must fail ${id}`).toBe(false);
    }
  });
});

describe('cold-takeover-eval — orientation and the copy', () => {
  const use = (name, input, isError = false) => ({ name, input, isError });

  it('orientation is a successful orient run or a read of the cursor; anything else is not', () => {
    expect(orientEvidence([use('Bash', { command: 'cd frontend && npm run orient' })])).toHaveLength(1);
    expect(orientEvidence([use('Read', { file_path: '/c/repo/memory/ACTIVE_PLAN.md' })])).toHaveLength(1);
    expect(orientEvidence([use('Bash', { command: 'head -40 memory/ACTIVE_PLAN.md' })])).toHaveLength(1);
    expect(orientEvidence([use('Bash', { command: 'npm run orient' }, true)]), 'a denied run did not orient').toHaveLength(0);
    expect(orientEvidence([use('Bash', { command: 'npm run orient' }, null)]), 'a call with no result did not orient').toHaveLength(0);
    expect(orientEvidence([use('Grep', { pattern: 'orient', path: 'CLAUDE.md' }), use('Read', { file_path: '/c/repo/CLAUDE.md' })])).toHaveLength(0);
    expect(orientEvidence([use('Grep', { pattern: 'registry', path: '/c/repo/memory/ACTIVE_PLAN.md' })]), 'a search inside the cursor is not a read').toHaveLength(0);
    expect(orientEvidence([use('Bash', { command: 'grep -n orient CLAUDE.md' })]), 'a command that only names orient did not run it').toHaveLength(0);
    expect(orientEvidence([use('Bash', { command: 'cd frontend && node scripts/dev/orient.mjs' })])).toHaveLength(1);
  });

  it('the copy never carries a nested worktree, installed modules, git itself or the answer key', () => {
    const listed = [
      'CLAUDE.md', '.claude/rules/game-code.md', '.claude/worktrees/w2j-docs/frontend/scripts/dev/cold-takeover-eval.mjs',
      'frontend/node_modules/x/index.js', '.git/HEAD', ...KEY_FILES, 'memory/registry.jsonl', 'CLAUDE.md', '',
    ];
    expect(copyList(listed)).toEqual(['CLAUDE.md', '.claude/rules/game-code.md', 'memory/registry.jsonl']);
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

  it('flags an absolute path, a home-relative path or a `..` escape outside the copy, and passes one inside it', () => {
    const p = parseStream(stream);
    expect(outsidePaths(p.uses[0], ['/c/repo'])).toEqual([]);
    expect(outsidePaths(p.uses[1], ['/c/repo'])).toEqual(['/srv/real-checkout/CLAUDE.md']);
    expect(outsidePaths({ input: { command: 'cat ../../secret' } }, ['/c/repo'])).toHaveLength(1);
    expect(outsidePaths({ input: { command: 'cat ~/.claude/CLAUDE.md' } }, ['/c/repo'])).toEqual(['~/.claude/CLAUDE.md']);
    expect(outsidePaths({ input: { command: 'cat $HOME/.claude/CLAUDE.md' } }, ['/c/repo'])).toEqual(['$HOME/.claude/CLAUDE.md']);
    expect(outsidePaths({ input: { command: 'ls ${HOME}' } }, ['/c/repo'])).toEqual(['${HOME}']);
    expect(outsidePaths({ input: { file_path: '~/.claude/CLAUDE.md' } }, ['/c/repo'])).toEqual(['~/.claude/CLAUDE.md']);
    expect(outsidePaths({ input: { command: 'grep -rn "x~y" memory/STATUS.md' } }, ['/c/repo'])).toEqual([]);
  });

  it('a `..` that a relative cd into the copy covers stays inside; one that climbs higher is flagged', () => {
    const at = (command) => outsidePaths({ input: { command } }, ['/c/repo']);
    expect(at('cd frontend 2>/dev/null && npm run orient 2>&1 | tail -40; ls ../memory')).toEqual([]);
    expect(at('cd frontend && cat ../../x')).toEqual(['../../x (..)']);
    expect(at('cd .. && cat CLAUDE.md')).toEqual(['.. (..)']);
    expect(at('cat frontend/../../secret')).toEqual(['frontend/../../secret (..)']);
    expect(at('cat frontend/../memory/STATUS.md')).toEqual([]);
  });

  it('the Bash cwd carries between calls: a later `cd ..` from frontend/ is the copy root, a failed cd moves nothing', () => {
    const bash = (command, isError = false) => ({ name: 'Bash', input: { command }, isError });
    const run = [bash('cd frontend && npm run orient 2>&1 | head -60'), bash('cd .. && ls .claude/rules'), bash('sed -n 1,5p CLAUDE.md')];
    expect(auditUses(run, ['/c/repo'])).toEqual([]);
    const climbed = auditUses([...run, bash('cd .. && cat secret')], ['/c/repo']);
    expect(climbed.map((x) => x.hits)).toEqual([['.. (..)']]);
    const failed = auditUses([bash('cd frontend', true), bash('cd .. && ls')], ['/c/repo']);
    expect(failed.map((x) => x.hits)).toEqual([['.. (..)']]);
    expect(dotEscapes('cd frontend/scripts && ls ../../memory', 0)).toEqual({ escapes: [], depth: 2 });
  });
});
