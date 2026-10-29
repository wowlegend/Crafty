import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { registryCounts, cursorSummary, mainLine, productionNote, parseWorktrees, ciVerdict, prLine, liveProduction } from '../../scripts/dev/orient.mjs';

// Sited in tests/scripts/: the subject is a tooling script. The pure parts are driven with fixtures whose answers are
// known by construction; the last case EXECUTES the CLI in a tree with no git and no `gh`, where it must still print.

const row = (state, owner = 'command session') => JSON.stringify({ id: `x-${Math.random()}`, state, owner });

describe('orient — registry counts', () => {
  it('counts each state and the open rows by owner, and counts a bad line instead of throwing', () => {
    const text = [row('open'), row('open', 'Kevin'), row('in-flight'), row('closed'), row('closed'), 'not json', ''].join('\n');
    expect(registryCounts(text)).toEqual({
      rows: 5, open: 2, inFlight: 1, closed: 2, other: 0, bad: 1, openByOwner: { 'command session': 1, Kevin: 1 },
    });
  });
});

describe('orient — the cursor', () => {
  it('prints the heading, every task-table row and the whole Next paragraph, and no preamble prose', () => {
    const md = [
      'preamble', '## CURSOR — today', '', 'A long paragraph of prose', 'that wraps.', '',
      '| # | Task | State |', '|---|---|---|', '| T6 | first | open |', '| T7 | second | PARTIAL |', '',
      '**Next:** land the open PRs', 'in readiness order.', '', 'trailing prose',
    ].join('\n');
    expect(cursorSummary(md)).toEqual([
      '## CURSOR — today', '| # | Task | State |', '| T6 | first | open |', '| T7 | second | PARTIAL |',
      '**Next:** land the open PRs', 'in readiness order.',
    ]);
    expect(cursorSummary('no heading at all')).toEqual([]);
    expect(cursorSummary('## C\nno table, no next\n')).toEqual(['## C']);
  });
});

describe('orient — main as GitHub has it, and drift', () => {
  const A = 'a'.repeat(40);
  const B = 'b'.repeat(40);
  it('names GitHub\'s main and says when the local refs match it', () => {
    expect(mainLine({ remote: A, tracking: A, local: A })).toBe('main        aaaaaaaaaa on GitHub; the local refs match');
  });
  it('flags a stale origin/main and a stale local main as drift', () => {
    expect(mainLine({ remote: A, tracking: B, local: A })).toBe('main        aaaaaaaaaa on GitHub; DRIFT: local origin/main is bbbbbbbbbb, run git fetch');
    expect(mainLine({ remote: A, tracking: A, local: B })).toBe('main        aaaaaaaaaa on GitHub; DRIFT: local main is bbbbbbbbbb');
    expect(mainLine({ remote: A, tracking: null, local: null })).toBe('main        aaaaaaaaaa on GitHub; DRIFT: no local origin/main');
  });
  it('without GitHub, says the local ref may be stale rather than presenting it as main', () => {
    expect(mainLine({ remote: null, tracking: B, why: 'git timed out' })).toBe("main        GitHub's main not read (git timed out); the local origin/main bbbbbbbbbb may be stale");
  });
  it('production is main, or the drift between them is named', () => {
    expect(productionNote(A, A)).toBe('; this is main');
    expect(productionNote(B, A)).toBe('; DRIFT: main is aaaaaaaaaa, so its deploy is pending, failed or not triggered');
    expect(productionNote(null, A)).toBe('');
  });
});

describe('orient — worktrees', () => {
  it('parses the porcelain list, a detached tree included', () => {
    const porcelain = 'worktree /r\nHEAD aaa\nbranch refs/heads/main\n\nworktree /r/.claude/worktrees/x\nHEAD bbb\nbranch refs/heads/feat/x\n\nworktree /r/d\nHEAD ccc\ndetached\n';
    expect(parseWorktrees(porcelain)).toEqual([
      { path: '/r', branch: 'main', head: 'aaa' },
      { path: '/r/.claude/worktrees/x', branch: 'feat/x', head: 'bbb' },
      { path: '/r/d', branch: null, head: 'ccc' },
    ]);
  });
});

describe('orient — the CI verdict: only `success` is green', () => {
  const r = (id, status, conclusion, createdAt, headSha = 's1') => ({ databaseId: id, status, conclusion, createdAt, headSha, url: `u${id}` });

  it('green on a completed success, and the newest completed run decides', () => {
    expect(ciVerdict([r(1, 'completed', 'failure', '2026-10-28T01'), r(2, 'completed', 'success', '2026-10-28T02')], 's1').green).toBe(true);
    expect(ciVerdict([r(1, 'completed', 'success', '2026-10-28T01'), r(2, 'completed', 'failure', '2026-10-28T02')], 's1').green).toBe(false);
  });

  it('cancelled, timed_out, skipped and no run are all NOT GREEN', () => {
    for (const c of ['cancelled', 'timed_out', 'skipped', 'neutral', null]) {
      const v = ciVerdict([r(1, 'completed', c, '2026-10-28T01')], 's1');
      expect(v.green, String(c)).toBe(false);
      expect(v.text.startsWith('NOT GREEN'), String(c)).toBe(true);
    }
    expect(ciVerdict([], 's1')).toEqual({ green: false, text: 'NOT GREEN: no ci.yml run on this sha' });
    expect(ciVerdict([r(1, 'completed', 'success', '2026-10-28T01', 'other')], 's1').green, 'a run on another sha').toBe(false);
  });

  it('a run still in progress is not green, and a newer pending run is named beside an older verdict', () => {
    expect(ciVerdict([r(1, 'in_progress', null, '2026-10-28T01')], 's1').green).toBe(false);
    const v = ciVerdict([r(1, 'completed', 'success', '2026-10-28T01'), r(2, 'queued', null, '2026-10-28T02')], 's1');
    expect(v.green).toBe(true);
    expect(v.text).toContain('a newer run 2 is queued');
  });
});

describe('orient — PRs and the live deployment', () => {
  it('reads the `ci ok` check from the rollup, pending and absent included', () => {
    const pr = (rollup) => ({ number: 7, title: 'T', headRefName: 'b', statusCheckRollup: rollup });
    expect(prLine(pr([{ name: 'gates', conclusion: 'SUCCESS', status: 'COMPLETED' }, { name: 'ci ok', conclusion: 'FAILURE', status: 'COMPLETED' }]))).toBe('#7 T (b) ci ok: failure');
    expect(prLine(pr([{ name: 'ci ok', status: 'IN_PROGRESS' }]))).toBe('#7 T (b) ci ok: in_progress');
    expect(prLine(pr([]))).toBe('#7 T (b) ci ok: no check yet');
  });

  it('the live sha is the newest deployment whose status is success', () => {
    expect(liveProduction([{ sha: 'new', state: 'failure' }, { sha: 'old', state: 'success', createdAt: 't' }])).toEqual({ sha: 'old', at: 't', url: undefined });
    expect(liveProduction([{ sha: 'x', state: 'pending' }])).toBe(null);
  });
});

describe('orient — the CLI never crashes', () => {
  it('in a tree with no git and no gh on PATH it prints why, the cursor and the registry, and exits 0', () => {
    const root = mkdtempSync(join(tmpdir(), 'orient-'));
    mkdirSync(join(root, 'memory'));
    writeFileSync(join(root, 'memory/ACTIVE_PLAN.md'), '## CURSOR — fixture\nprose\n\n| T1 | a task | open |\n\n**Next:** the thing\n');
    writeFileSync(join(root, 'memory/registry.jsonl'), `${row('open')}\n${row('closed')}\n`);
    const out = execFileSync(process.execPath, [resolve('scripts/dev/orient.mjs'), `--root=${root}`], {
      encoding: 'utf8',
      env: { PATH: '/nonexistent', HOME: root },
    });
    expect(out).toContain('not a git checkout here');
    expect(out).toContain('production  unknown');
    expect(out).toContain('  ## CURSOR — fixture\n  | T1 | a task | open |\n  **Next:** the thing');
    expect(out).toContain('2 rows: 1 open (command session 1), 0 in flight, 1 closed');
  });
});
