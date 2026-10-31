import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  registryCounts, registryLines, registryView, cursorSummary, mainLine, productionNote, parseWorktrees, ciVerdict, prLine, liveProduction,
} from '../../scripts/dev/orient.mjs';

// Sited in tests/scripts/: the subject is a tooling script. The pure parts are driven with fixtures whose answers are
// known by construction; the last case EXECUTES the CLI in a tree with no git and no `gh`, where it must still print.

const row = (state, owner = 'command session') => JSON.stringify({ id: `x-${Math.random()}`, state, owner });

describe('orient — registry counts', () => {
  it('counts each state and the open rows by owner, and counts a bad line instead of throwing', () => {
    const text = [row('open'), row('open', 'Kevin'), row('in-flight'), row('closed'), row('closed'), 'not json', ''].join('\n');
    expect(registryCounts(text)).toEqual({
      rows: 5, open: 2, inFlight: 1, closed: 2, other: 0, bad: 1, openByOwner: { 'command session': 1, Kevin: 1 },
      lanes: 0, work: 3, workByKind: { '?': 3 }, workBySeverity: { '?': 3 }, waitingOnKevin: 1, triage: 0, triageOverdue: 0,
      orphans: 3, staleBacklog: 0,
    });
  });

  // v2 rows: lanes are rows, so the open work, its orphans and the triage and backlog clocks come from the same file.
  const v2 = [
    { id: 'L', kind: 'lane', state: 'open', title: 'a lane', severity: 'HIGH' },
    { id: 'C', kind: 'lane', state: 'closed', title: 'a landed lane' },
    { id: 'LANE:triage', kind: 'lane', state: 'open', title: 'triage' },
    { id: 'LANE:backlog', kind: 'lane', state: 'open', title: 'backlog' },
    { id: 'a', kind: 'bug', severity: 'HIGH', state: 'open', lane: 'L', owner: 'Kevin', title: 'a bug' },
    { id: 'b', kind: 'debt', severity: 'LOW', state: 'open', lane: 'C', title: 'an orphan' },
    { id: 'c', kind: 'flake', severity: 'MED', state: 'in-flight', lane: 'LANE:triage', opened: '2026-10-20', title: 'in triage 11 days' },
    { id: 'd', kind: 'instrument', severity: 'LOW', state: 'open', lane: 'LANE:backlog', updated: '2026-08-01', title: 'stale' },
    { id: 'e', kind: 'feature', severity: 'HIGH', state: 'closed', lane: 'L', title: 'done' },
    { id: 'f', kind: 'debt', severity: 'LOW', state: 'open', lane: 'a', title: 'names a row that is not a lane' },
  ].map((r) => JSON.stringify(r)).join('\n');

  it('v2: the open work by kind and severity, what waits on Kevin, triage overdue, orphans and stale backlog', () => {
    const c = registryCounts(v2, { today: '2026-10-31' });
    expect(c).toMatchObject({
      lanes: 3, work: 5, workByKind: { bug: 1, debt: 2, flake: 1, instrument: 1 }, workBySeverity: { HIGH: 1, MED: 1, LOW: 3 },
      waitingOnKevin: 1, triage: 1, triageOverdue: 1, orphans: 2, staleBacklog: 1,
    });
    expect(registryCounts(v2)).toMatchObject({ triageOverdue: 0, staleBacklog: 0 });
    expect(registryLines(c)).toEqual([
      'registry    memory/registry.jsonl: 10 rows: 7 open (? 6, Kevin 1), 1 in flight, 2 closed',
      '            open work: 5 rows in 3 lanes; debt 2, bug 1, flake 1, instrument 1; HIGH 1, MED 1, LOW 3',
      '            waiting on Kevin 1; triage 1 (1 overdue); orphans 2; backlog rows not updated in 60 days 1',
    ]);
  });

  it('v2: --registry groups the open work, the most severe group first and HIGH first inside it, naming each lane', () => {
    expect(registryView(v2, 'lane')).toEqual([
      'registry by lane: 5 open work rows in 5 groups, the most severe first',
      '', 'L (1): a lane [open]', '  HIGH    a  a bug',
      '', 'LANE:triage (1): triage [open]', '  MED     c [in flight]  in triage 11 days',
      '', 'C (1): a landed lane [closed]', '  LOW     b  an orphan',
      '', 'LANE:backlog (1): backlog [open]', '  LOW     d  stale',
      '', 'a (1): NOT A LANE ROW', '  LOW     f  names a row that is not a lane',
    ]);
    expect(registryView(v2, 'kind')[0]).toBe('registry by kind: 5 open work rows in 4 groups, the most severe first');
    expect(registryView(v2, 'owner')).toContain('Kevin (1)');
    expect(() => registryView(v2, 'severity')).toThrow(/one of lane, kind, area, owner/);
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
    expect(out).toContain('open work: 1 rows in 0 lanes');
    const view = execFileSync(process.execPath, [resolve('scripts/dev/orient.mjs'), `--root=${root}`, '--registry', 'owner'], { encoding: 'utf8' });
    expect(view).toContain('registry by owner: 1 open work rows in 1 groups');
  });
});
