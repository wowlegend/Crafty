import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verdict, readBaseCi, readCommitCi, sameAppCommits, scrubGitEnv, readTreeCi, needsTreeCi, mainMovesFrom, jobTimedOut, parseE2eTimeout, receiptVerdict, runPreconditions, portInUse, E2E_TIMEOUT_MIN, OBSERVED } from '../../scripts/ci/e2e-freshness.mjs';

/**
 * THE GATE THAT ASKED FOR IMPOSSIBLE EVIDENCE, and what replaced it.
 *
 * v1 refused any push whose observed tree differed from the last LOCALLY recorded green e2e run. But
 * `ci/pipeline.sh` declares e2e CI-only — too slow for any local tier — and the receipt could only be
 * written locally. Worse, it cannot be fixed by having CI write the receipt: **CI cannot have run e2e on
 * an unpushed tree.** The gate demanded evidence that can only exist AFTER the act it gates.
 *
 * That is a goal defect, not a plumbing one, and it showed up in practice the same day: the local run it
 * demanded went RED with four failures, three of them `Test timeout` / `Execution context was destroyed`
 * on a machine at load 126 — evidence about the box, not the build.
 *
 * The goal restated to something achievable: **never silently lose an e2e regression.** Three tiers —
 * a local receipt short-circuits; otherwise refuse to STACK onto a base CI has already called red;
 * otherwise allow loudly and say CI owns this tree's verdict.
 *
 * Mutation-Proof: 5 mutations, denominator asserted (7/7 cases collected on every run).
 *   M1 tier-1 accepts ANY stamp, not one matching this tree -> fast-path case RED (a stale receipt would
 *      silently vouch for a tree it never saw — the original defect, inverted)
 *   M2 base 'failure' no longer blocks                        -> stacking case RED
 *   M3 unknown base blocks (fail-closed)                      -> unknown-base case RED (a push path that
 *      breaks when GitHub is unreachable teaches --no-verify; R5 says choose and say which)
 *   M4 zero-file walk returns 0 instead of 3                  -> control case RED
 *   M5 readBaseCi rethrows instead of degrading to unknown    -> degrade case RED
 *   M6 plausible-wrong: the RUN conclusion again (the 8202ec59 false refusal) -> non-e2e-red case RED
 *   M7 plausible-wrong: one green shard makes the base green   -> any-shard case RED
 *   M8 no e2e job observed reads as green                     -> no-job case RED
 *   T1 the duration ignored: any cancel reads as a timeout    -> superseded-cancel case RED
 *   T2 plausible-wrong: the limit read as SECONDS              -> superseded-cancel case RED
 *   T3 the timeout inference not wired into readBaseCi         -> run-35830093253 case RED
 *   T4 plausible-wrong: the FIRST timeout-minutes in ci.yml (the 20-minute gates job) -> the read-limit case RED
 *   T5 the 30 s slack widened to 90                           -> the 24m00s boundary RED
 *   A1 the annotation ignored (duration decides always)        -> the R9.6 superseded-late case RED
 *   A2 plausible-wrong: any annotation text counts as a timeout -> the R9.6 superseded-late case RED
 *   A3 the CRLF normalisation dropped -> SURVIVED first (the only CRLF case had a comment on the e2e line, which
 *      absorbs the \r); RED on the added CRLF-without-comment case
 *   A4 plausible-wrong: the e2e line must end at the colon (no comment) -> the comment case RED
 *   R1 receiptVerdict ignores a tree that changed during the run -> the mid-run case RED
 *   R2 plausible-wrong: a killed run (status null) records -> the red-suite case RED
 * Live, not a fixture: against the real gh output the gate now reads base 37d030a as RED (it read UNKNOWN before).
 *   M9 plausible-wrong: a pending shard ignored (only finished shards read)  -> in-progress case RED
 *   M9b plausible-wrong: the RUN's status gates the verdict                  -> other-job-running case RED
 *   M10 a timed-out shard read as unknown (fail open)          -> timed-out case RED
 */
const CUR = { id: 'abc', files: 468 };

describe('e2e-freshness verdict', () => {
  it('a zero-file walk is a control failure, not a pass', () => {
    const v = verdict({ id: 'abc', files: 0 }, null, { state: null });
    expect(v.code).toBe(3);
    expect(v.line).toMatch(/COULD NOT CHECK/);
  });

  it('TIER 1: a local receipt for THIS tree settles it outright', () => {
    expect(verdict(CUR, { treeId: 'abc', at: 't' }, { state: null }).code).toBe(0);
  });

  it('TIER 1 does NOT accept a receipt for a DIFFERENT tree', () => {
    // The original defect inverted: a stale receipt must never vouch for a tree it never saw.
    const v = verdict(CUR, { treeId: 'a-different-tree', at: 't' }, { state: 'success' });
    expect(v.line).not.toMatch(/^e2e-freshness: fresh/);
  });

  it('TIER 2: refuses to STACK an unverified change onto a base CI called RED', () => {
    const v = verdict(CUR, null, { state: 'failure', sha: '1234567' });
    expect(v.code).toBe(1);
    expect(v.line).toMatch(/BASE's e2e is RED/);
    expect(v.line).toMatch(/1234567/); // names WHICH run, so the claim is checkable
  });

  it('TIER 3: allows on a green base, naming that CI owns this tree\'s verdict', () => {
    const v = verdict(CUR, null, { state: 'success', sha: '89abcde' });
    expect(v.code).toBe(0);
    expect(v.line).toMatch(/NO e2e verdict yet/);
    expect(v.line).toMatch(/CI decides this one/);
  });

  it('TIER 3: fails OPEN when the base state cannot be read, and SAYS it is failing open', () => {
    // R5 — chosen deliberately: a push path that breaks when GitHub is unreachable teaches --no-verify.
    const v = verdict(CUR, null, { state: null });
    expect(v.code).toBe(0);
    expect(v.line).toMatch(/UNKNOWN/);
    expect(v.line).toMatch(/failing OPEN by design/); // the choice is stated, not silent
  });

  it('readBaseCi degrades to unknown instead of throwing into the push path', () => {
    expect(readBaseCi(() => { throw new Error('gh: command not found'); })).toEqual({ state: null });
    expect(readBaseCi(() => 'null null null')).toEqual({ state: null });
    expect(OBSERVED.length).toBeGreaterThan(0); // R3a — the observed set must not be empty
  });
});

// THE BASE STATE IS THE E2E VERDICT, NOT THE RUN'S. 2026-09-22: CI went red on 8202ec59 because knip flagged
// two OS binaries; all three e2e shards on that run PASSED. The gate read the RUN conclusion, called the
// base's e2e red, and refused a one-line knip fix unless 20 minutes of e2e were re-run locally on a loaded
// machine — for a tree whose src/ and tests/e2e/ CI had just passed. A knip failure cannot hide an e2e
// regression (they are separate jobs with separate conclusions); only a red E2E job can.
describe('readBaseCi — the base e2e verdict, read from the e2e jobs', () => {
  // A fake gh, in the wire format readBaseCi asks for: the run list answers `id|status|conclusion|sha`, the
  // job query one `status,conclusion,startedAt,completedAt` per e2e job. A still-running run prints an EMPTY conclusion, which is
  // why the fields are `|`-separated: split on whitespace, "123  abc1234" shifted the sha into the conclusion.
  // `notes` answers the annotations query (a cancelled shard's GitHub annotations); a function may throw (offline).
  const gh = (run, e2eJobs, notes = '') => (cmd) => {
    if (cmd.includes('run list')) return run;
    if (cmd.includes('run view')) return e2eJobs;
    if (cmd.includes('annotations')) return typeof notes === 'function' ? notes(cmd) : notes;
    return '';
  };
  const T0 = '2026-09-23T07:07:39Z', T3 = '2026-09-23T07:10:39Z';
  const done = (...cs) => cs.map((c) => `completed,${c},${T0},${T3}`).join(' ');

  it('a run red on a NON-e2e job, with every e2e shard green, is an e2e-green base', () => {
    expect(readBaseCi(gh('35801779905|completed|failure|8202ec5', done('success', 'success', 'success'))))
      .toEqual({ state: 'success', sha: '8202ec5', run: 'failure' });
  });

  it('any e2e shard red makes the base red — a TIMED-OUT shard included', () => {
    expect(readBaseCi(gh('1|completed|failure|abc1234', done('success', 'failure', 'success'))).state).toBe('failure');
    expect(readBaseCi(gh('1|completed|failure|abc1234', done('success', 'timed_out', 'success'))).state).toBe('failure');
  });

  it('a run with NO e2e job observed is unknown (fail open), never green', () => {
    expect(readBaseCi(gh('1|completed|success|abc1234', '')).state).toBe(null);
  });

  it('a cancelled e2e shard is unknown, not a verdict', () => {
    expect(readBaseCi(gh('1|completed|cancelled|abc1234', done('success', 'cancelled', 'success'))).state).toBe(null);
  });

  // A JOB TIMEOUT CONCLUDES `cancelled`. Run 35830093253: shard 2 went red on perfect-dodge, then hit its 25-minute
  // limit — cancelled at 07:32:50 after starting 07:07:39 — and this gate read the base as UNKNOWN and failed open.
  // GitHub's annotations on that shard, verbatim (gh api .../check-runs/107080443383/annotations, 2026-09-23).
  const TIMED_OUT = 'The job has exceeded the maximum execution time of 25m0s The operation was canceled.';
  const SUPERSEDED = 'The operation was canceled.';
  const real = `completed,success,${T0},2026-09-23T07:21:15Z,1 completed,cancelled,${T0},2026-09-23T07:32:50Z,107080443383 completed,success,${T0},2026-09-23T07:24:12Z,3`;
  it('a shard GitHub stopped at its limit is red (run 35830093253, by its annotation)', () => {
    expect(readBaseCi(gh('35830093253|completed|cancelled|37d030a', real, TIMED_OUT), 25).state).toBe('failure');
  });
  it('R9.6: a shard SUPERSEDED within 30 s of the limit is no verdict — the annotation, not the duration, decides', () => {
    const late = `completed,success,${T0},${T3},1 completed,cancelled,${T0},2026-09-23T07:32:20Z,2 completed,success,${T0},${T3},3`; // 24m41s
    expect(readBaseCi(gh('9|completed|cancelled|abc1234', late, SUPERSEDED), 25).state).toBe(null);
  });
  it('annotations unreadable (offline): the duration decides, erring RED; a short cancel stays unknown', () => {
    const offline = () => { throw new Error('gh: network'); };
    expect(readBaseCi(gh('35830093253|completed|cancelled|37d030a', real, offline), 25).state).toBe('failure');
    expect(readBaseCi(gh('9|completed|cancelled|abc1234', done('success', 'cancelled', 'success'), offline), 25).state).toBe(null);
  });

  it('jobTimedOut, by the duration (no annotations): within 30 s of the limit timed out; short of that, or any other conclusion, did not', () => {
    const job = (c, end) => ['completed', c, T0, end, '7'];
    expect(jobTimedOut(job('cancelled', '2026-09-23T07:32:09Z'), 25)).toBe(true); // 24m30s
    expect(jobTimedOut(job('cancelled', '2026-09-23T07:31:39Z'), 25)).toBe(false); // 24m00s
    expect(jobTimedOut(job('success', '2026-09-23T07:40:00Z'), 25)).toBe(false);
    expect(jobTimedOut(job('cancelled', 'null'), 25), 'a job with no end time').toBe(false);
    expect(jobTimedOut(job('cancelled', '2026-09-23T07:40:00Z'), null), 'no limit read: nothing inferred').toBe(false);
  });

  it('parseE2eTimeout: the e2e job only, a trailing comment on its line allowed, CRLF normalised (R9.6)', () => {
    const yml = 'jobs:\n  gates:\n    timeout-minutes: 20\n  e2e: # sharded\n    name: e2e\n    timeout-minutes: 25\n  docs:\n    timeout-minutes: 5\n';
    expect(parseE2eTimeout(yml)).toBe(25);
    expect(parseE2eTimeout(yml.replace(/\n/g, '\r\n')), 'a CRLF file').toBe(25);
    // ...and WITHOUT the comment: there `[^\n]*` cannot absorb the \r, so this is the case CRLF actually breaks (A3
    // survived the comment-only version above).
    expect(parseE2eTimeout(yml.replace('  e2e: # sharded', '  e2e:').replace(/\n/g, '\r\n')), 'a CRLF file, no comment').toBe(25);
    expect(parseE2eTimeout(yml.replace('  e2e: # sharded', '  e2e:')), 'no comment').toBe(25);
    expect(parseE2eTimeout('jobs:\n  gates:\n    timeout-minutes: 20\n'), 'no e2e job').toBe(null);
    expect(parseE2eTimeout('jobs:\n  e2e:\n    name: e2e\n  docs:\n    timeout-minutes: 5\n'), "not the NEXT job's limit").toBe(null);
  });

  it('the limit is READ from ci.yml — the e2e job\'s timeout-minutes, a positive integer (R3a: null would infer nothing)', () => {
    expect(Number.isInteger(E2E_TIMEOUT_MIN) && E2E_TIMEOUT_MIN > 0, `E2E_TIMEOUT_MIN = ${E2E_TIMEOUT_MIN}`).toBe(true);
    expect(E2E_TIMEOUT_MIN, 'the e2e job, not the 20-minute gates job or the 5-minute docs job').not.toBe(20);
    expect(E2E_TIMEOUT_MIN).not.toBe(5);
  });

  it('an e2e shard still RUNNING means no verdict yet — even when the shards that finished are green', () => {
    // Review 2026-09-22: with one shard green and two pending, the pending ones printed "" and were
    // filtered out, and the base read green before its verdict existed.
    const r = readBaseCi(gh('35803592408|in_progress||927b219', `completed,success,${T0},${T3} in_progress,,${T0}, in_progress,,${T0},`));
    expect(r.state).toBe(null);
    expect(r.sha).toBe('927b219');
  });

  it('every e2e shard finished green while ANOTHER job still runs: the e2e verdict exists, and it is green', () => {
    expect(readBaseCi(gh('2|in_progress||abc1234', done('success', 'success', 'success'))).state).toBe('success');
  });

  it('the refusal still fires for a base whose e2e is red', () => {
    const v = verdict(CUR, null, readBaseCi(gh('1|completed|failure|1234567', done('failure', 'success', 'success'))));
    expect(v.code).toBe(1);
  });
});

describe('receiptVerdict — a run is recorded for the tree it STARTED on, and only if it did not change', () => {
  const T = (id) => ({ id, files: 490 });
  it('green and unchanged: recorded', () => {
    expect(receiptVerdict(T('a1'), T('a1'), 0).ok).toBe(true);
  });
  it('the tree changed during the run (a spec added mid-run, never collected): refused, even though the suite passed', () => {
    const v = receiptVerdict(T('a1'), T('b2'), 0);
    expect(v.ok).toBe(false);
    expect(v.line).toMatch(/CHANGED during the run/);
  });
  it('a red suite is never recorded, changed or not — and reads STALE (1)', () => {
    const v = receiptVerdict(T('a1'), T('a1'), 1);
    expect(v.ok).toBe(false);
    expect(v.code, 'a red suite must read as a verdict on the tree').toBe(1);
  });
  // ultrareview 2026-10-27: spawnSync reports a run killed by a signal, or never spawned, as status null. That is no
  // verdict on the tree, so it is COULD NOT CHECK (3) — it used to exit 1, which the header defines as STALE.
  it('a run that never finished (status null) is COULD NOT CHECK (3), not STALE', () => {
    const v = receiptVerdict(T('a1'), T('a1'), null);
    expect(v.ok, 'a killed run (status null)').toBe(false);
    expect(v.code, 'a killed run read as a verdict on the tree').toBe(3);
  });
});

// ultrareview 2026-10-27, CONFIRMED live: on macOS vite binds `localhost` to [::1] only (the e2e vite listened on
// [::1]:4179, nothing on 127.0.0.1), and the IPv4-only probe reported that port free. Real sockets, not a fake.
describe('portInUse — a server on EITHER loopback address is busy', () => {
  const listen = (host) =>
    new Promise((res, rej) => {
      const srv = createServer();
      srv.once('error', rej);
      srv.listen(0, host, () => res(srv));
    });
  const close = (srv) => new Promise((res) => srv.close(res));
  it('sees a server listening on 127.0.0.1 (presence control)', async () => {
    const srv = await listen('127.0.0.1');
    try { expect(await portInUse(srv.address().port)).toBe(true); } finally { await close(srv); }
  });
  it('sees a server listening on [::1] ONLY — the case the IPv4 probe missed', async () => {
    const srv = await listen('::1');
    try {
      expect(await portInUse(srv.address().port), 'a [::1]-only vite read as a free port').toBe(true);
    } finally { await close(srv); }
  });
  it('a closed port is free', async () => {
    const srv = await listen('127.0.0.1');
    const { port } = srv.address();
    await close(srv);
    expect(await portInUse(port)).toBe(false);
  });
});

// Review #8 finding 3 (2026-09-26). Mutation-Proof (mutate.sh), each observed RED: P1 the argument check dropped ->
// "a partial run certified the tree"; P2 plausible-wrong: the busy port only warned (ok: true) -> "a reused server".
describe('runPreconditions — a --run certifies only a full run against a server it started', () => {
  it('refuses any argument: one spec cannot certify the tree', () => {
    const r = runPreconditions({ extra: ['tests/e2e/frame-cap.spec.js'], portBusy: false, port: 4179 });
    expect(r.ok, 'a partial run certified the tree').toBe(false);
    expect(r.line).toMatch(/takes no arguments/);
  });
  it('refuses when a server already listens on the e2e port (it would be reused)', () => {
    const r = runPreconditions({ extra: [], portBusy: true, port: 4179 });
    expect(r.ok, 'a reused server').toBe(false);
    expect(r.line).toMatch(/4179/);
  });
  it('a full run on a free port may certify', () => {
    expect(runPreconditions({ extra: [], portBusy: false, port: 4179 }).ok).toBe(true);
  });
});

// 2026-10-27: three local receipt runs failed on the operator's machine load (0.5 fps software rendering; swapping at a
// load of 118-159), none on code. Two refinements, both narrower than "trust the laptop": (1b) CI's own e2e verdict on
// the EXACT commit is a receipt, and (2) the red-base refusal guards MAIN only — a branch push is judged by its own
// CI — while unknown refs stay strict.
describe('tier 1b and the main-only red-base rule', () => {
  const T = { id: 'tree1', files: 490 };
  const RED = { state: 'failure', sha: '57c45ae' };
  it('a red base still refuses a push that moves main, and one whose refs are unknown (strict)', () => {
    expect(verdict(T, null, RED, { mainMoves: true }).code).toBe(1);
    expect(verdict(T, null, RED, { mainMoves: null }).code, 'unknown refs must stay strict').toBe(1);
    expect(verdict(T, null, RED).code, 'no push info at all must stay strict').toBe(1);
  });
  it('a red base lets a push through that moves only other branches, and says CI on the branch decides', () => {
    const v = verdict(T, null, RED, { mainMoves: false });
    expect(v.code).toBe(0);
    expect(v.line).toMatch(/does not move main/);
  });
  it('CI green on the exact commit is a receipt, even onto a red base and moving main', () => {
    const v = verdict(T, null, RED, { mainMoves: true, commitCi: { state: 'success', run: '123' } });
    expect(v.code).toBe(0);
    expect(v.line).toMatch(/fresh by CI.*123/);
  });
  it('a commit CI did NOT pass is no receipt (presence control: the same push without it is refused)', () => {
    expect(verdict(T, null, RED, { mainMoves: true, commitCi: { state: null } }).code).toBe(1);
  });
  // LOW, review 2026-10-27: the tier-1b walk costs up to 40 git reads and a gh round trip per commit, and it can change
  // the outcome in one case only. The property, over every combination verdict() can see: wherever CI green on the
  // tree changes the exit code, the walk must run; and without a local receipt, wherever the walk runs, it can.
  it('needsTreeCi: the walk runs exactly where CI\'s verdict on the tree can change the exit code', () => {
    const RED = { state: 'failure' };
    expect(needsTreeCi(RED, true)).toBe(true);
    expect(needsTreeCi(RED, null), 'unknown refs are strict, so a CI green can still let main move').toBe(true);
    expect(needsTreeCi(RED, false), 'a branch push exits 0 on a red base anyway').toBe(false);
    expect(needsTreeCi({ state: 'success' }, true), 'a green base exits 0 anyway').toBe(false);
    expect(needsTreeCi({ state: null }, true), 'an unknown base fails open anyway').toBe(false);
    expect(needsTreeCi(undefined, true)).toBe(false);
    let checked = 0;
    for (const base of [RED, { state: 'success' }, { state: null }]) {
      for (const mainMoves of [true, false, null]) {
        for (const stamp of [null, { treeId: 'tree1', at: 't' }]) {
          const T = { id: 'tree1', files: 490 };
          const changes = verdict(T, stamp, base, { mainMoves, commitCi: { state: 'success', run: '1' } }).code
            !== verdict(T, stamp, base, { mainMoves, commitCi: { state: null } }).code;
          const at = `base ${base.state}, mainMoves ${mainMoves}, stamp ${Boolean(stamp)}`;
          if (changes) expect(needsTreeCi(base, mainMoves), `${at}: CI green changes the outcome, yet the walk is skipped`).toBe(true);
          if (!stamp) expect(changes, `${at}: the walk runs where it cannot change the outcome`).toBe(needsTreeCi(base, mainMoves));
          checked += 1;
        }
      }
    }
    expect(checked).toBe(18);
  });

  it('mainMovesFrom reads the hook refs: main -> true, branches only -> false, none -> null', () => {
    expect(mainMovesFrom(' refs/heads/main')).toBe(true);
    expect(mainMovesFrom('refs/heads/land/x refs/heads/main')).toBe(true);
    expect(mainMovesFrom(' refs/heads/feat/a refs/heads/land/x')).toBe(false);
    expect(mainMovesFrom('')).toBe(null);
    expect(mainMovesFrom(undefined)).toBe(null);
  });
  // A fake gh serving `runs` — [{ id, sha, event, jobs }], NEWEST FIRST as gh lists them — that honours what it is
  // asked: `run list` filters by --commit and stops at --limit, and answers a field only when --json requested it
  // (gh's --jq sees nothing else, so an unrequested field reads null); `run view <id>` answers that run's jobs. Any
  // other command throws. The line format mirrors the --jq expression; the real-repository test below runs real jq.
  const job = (c) => `completed,${c},2026-10-27T00:00:00Z,2026-10-27T00:10:00Z,9`;
  const GREEN = `${job('success')} ${job('success')}`;
  const REDJOBS = `${job('failure')} ${job('success')}`;
  const RUNNING = `${job('success')} in_progress,,2026-10-27T00:00:00Z,,9`;
  const fakeGh = (runs) => (cmd) => {
    let m = /^gh run list --workflow=ci\.yml --commit (\S+) --limit (\d+) --json (\S+) /.exec(cmd);
    if (m) {
      const fields = m[3].split(',');
      const f = (r, k) => (fields.includes(k) ? r[k === 'databaseId' ? 'id' : k] : null);
      return runs.filter((r) => r.sha === m[1]).slice(0, Number(m[2])).map((r) => `${f(r, 'databaseId')}|${f(r, 'event')}`).join('\n');
    }
    m = /^gh run view (\S+) --json jobs /.exec(cmd);
    if (m) {
      const run = runs.find((r) => String(r.id) === m[1]);
      if (!run) throw new Error(`no run ${m[1]}`);
      return run.jobs;
    }
    throw new Error(`fakeGh: unexpected command: ${cmd}`);
  };
  const run = (id, sha, jobs, event = 'push') => ({ id, sha, event, jobs });

  // HIGH, review 2026-10-27: a newer RED on the same content is newer evidence than an older green. Within one commit
  // the newest run with a verdict decides, exactly as the walk across commits does (readTreeCi).
  it('readCommitCi: the NEWEST push/dispatch run with an e2e verdict decides — green or red', () => {
    expect(readCommitCi(fakeGh([run(12, 'a', GREEN), run(11, 'a', REDJOBS)]), 'a')).toEqual({ state: 'success', run: '12' });
    expect(readCommitCi(fakeGh([run(12, 'a', REDJOBS), run(11, 'a', GREEN)]), 'a'), 'a red re-run outranks the green before it')
      .toEqual({ state: 'failure', run: '12' });
    expect(readCommitCi(fakeGh([run(13, 'a', RUNNING), run(11, 'a', GREEN)]), 'a'), 'a run with no verdict yet is passed over')
      .toEqual({ state: 'success', run: '11' });
    expect(readCommitCi(fakeGh([run(13, 'a', '')]), 'a'), 'a run with no e2e jobs is no verdict').toEqual({ state: null });
    expect(readCommitCi(fakeGh([run(12, 'b', GREEN)]), 'a'), 'another commit\'s run').toEqual({ state: null });
    expect(readCommitCi(fakeGh([]), '')).toEqual({ state: null });
  });

  // MED, review 2026-10-27: a pull_request run checks out GitHub's MERGE ref — the head merged into the base as it
  // stood — so its verdict is about a tree no commit here has. Only push and workflow_dispatch runs test the commit.
  it('readCommitCi: a pull_request run is never a verdict on the commit; push and workflow_dispatch are', () => {
    expect(readCommitCi(fakeGh([run(14, 'a', GREEN, 'pull_request')]), 'a'), 'a green PR run').toEqual({ state: null });
    expect(readCommitCi(fakeGh([run(14, 'a', GREEN, 'pull_request'), run(11, 'a', REDJOBS)]), 'a'), 'the PR run is skipped, not decisive')
      .toEqual({ state: 'failure', run: '11' });
    expect(readCommitCi(fakeGh([run(15, 'a', GREEN, 'workflow_dispatch')]), 'a')).toEqual({ state: 'success', run: '15' });
    expect(readCommitCi(fakeGh([run(16, 'a', GREEN, 'push')]), 'a')).toEqual({ state: 'success', run: '16' });
  });

  it('readTreeCi [D, C red, A green]: the walk STOPS at C — a newer red on the same identity is no receipt', () => {
    const gh = fakeGh([run(31, 'C', REDJOBS), run(21, 'A', GREEN)]);
    const ci = readTreeCi(gh, ['D', 'C', 'A']);
    expect(ci).toEqual({ state: 'failure', run: '31', sha: 'C', exact: false });
    expect(verdict({ id: 'x', files: 3 }, null, { state: 'failure' }, { commitCi: ci, mainMoves: true }).code, 'red is not a receipt: the base rules apply').toBe(1);
    expect(readTreeCi(fakeGh([run(21, 'A', GREEN)]), ['D', 'C', 'A']), 'presence control: with no red on C, A\'s green IS borrowed')
      .toEqual({ state: 'success', run: '21', sha: 'A', exact: false });
  });

  // A fake git that HONOURS what it is asked (review 2026-10-27: the previous fake answered every rev-list with its
  // whole table and ignored the ref and --max-count, so mutants of both survived). rev-list walks `history` from the
  // named rev (HEAD is its first entry) and stops at --max-count; rev-parse answers each `<sha>:<path>` from `ids`
  // and FAILS, as git does (exit 128), when the commit or the path is unknown. Any other command throws, so a changed
  // command reads as a failure, never as the old answer.
  const CI = '.github/workflows/ci.yml';
  const pair = (app, yml = 'Y') => ({ frontend: app, [CI]: yml });
  const fakeGit = (ids, history = Object.keys(ids)) => (cmd) => {
    let m = /^git rev-list --max-count=(\d+) (\S+)$/.exec(cmd);
    if (m) {
      const start = m[2] === 'HEAD' ? 0 : history.indexOf(m[2]);
      if (start < 0) throw new Error(`fatal: bad revision '${m[2]}'`);
      return `${history.slice(start, start + Number(m[1])).join('\n')}\n`;
    }
    m = /^git rev-parse((?: [^\s:]+:\S+)+)$/.exec(cmd);
    if (m) {
      return `${m[1].trim().split(' ').map((spec) => {
        const at = spec.indexOf(':');
        const id = ids[spec.slice(0, at)]?.[spec.slice(at + 1)];
        if (id === undefined) throw new Error(`fatal: path '${spec.slice(at + 1)}' does not exist in '${spec.slice(0, at)}'`);
        return id;
      }).join('\n')}\n`;
    }
    throw new Error(`fakeGit: unexpected command: ${cmd}`);
  };

  // Commits h (HEAD), p, q, r, s newest first. h, p and r share the pair (T, Y); q changed the app; s, the OLDEST,
  // changed it too, so a reference identity taken from anywhere but HEAD reads differently.
  const HIST = { h: pair('T'), p: pair('T'), q: pair('U'), r: pair('T'), s: pair('U') };

  it('sameAppCommits: HEAD plus every ancestor whose (frontend tree, ci.yml blob) pair equals HEAD\'s', () => {
    expect(sameAppCommits(fakeGit(HIST))).toEqual(['h', 'p', 'r']);
    expect(sameAppCommits(fakeGit({ h: pair('T'), p: pair('U') })), 'HEAD changed the app: only HEAD itself').toEqual(['h']);
    expect(sameAppCommits(() => { throw new Error('no git'); }), 'degrades, never throws').toEqual([]);
  });

  // HIGH, review 2026-10-27: the e2e job is DEFINED in ci.yml (its shards, --grep-invert, node, browser), so a commit
  // that changed only ci.yml ran a different e2e over the same app. The identity is the pair, compared together.
  it('a ci.yml-only difference is a different identity: that commit is not borrowed from', () => {
    const ids = { h: pair('T', 'Y'), p: pair('T', 'Z'), r: pair('T', 'Y') };
    expect(sameAppCommits(fakeGit(ids)), 'p ran e2e under a different ci.yml').toEqual(['h', 'r']);
  });

  it('an ancestor whose identity cannot be read is left out; the others are still compared', () => {
    const ids = { h: pair('T'), p: { frontend: 'T' }, r: pair('T') }; // p has no ci.yml: rev-parse fails for it
    expect(sameAppCommits(fakeGit(ids))).toEqual(['h', 'r']);
  });

  it('HEAD\'s identity unreadable: HEAD alone — its own CI verdict needs no comparison, and nothing is borrowed', () => {
    expect(sameAppCommits(fakeGit({ h: { frontend: 'T' }, p: pair('T') }))).toEqual(['h']);
  });

  it('the walk is HEAD\'s history, at most `max` commits', () => {
    const ids = { h: pair('T'), p: pair('T'), q: pair('T'), r: pair('T') };
    expect(sameAppCommits(fakeGit(ids), 3)).toEqual(['h', 'p', 'q']);
    expect(sameAppCommits(fakeGit(ids)), 'the default reaches past four').toEqual(['h', 'p', 'q', 'r']);
  });

  it('scrubGitEnv drops the five variables that pick a repository over the cwd, keeps the rest, and copies', () => {
    const env = { PATH: '/bin', HOME: '/h', GIT_DIR: 'd', GIT_WORK_TREE: 'w', GIT_INDEX_FILE: 'i', GIT_OBJECT_DIRECTORY: 'o', GIT_COMMON_DIR: 'c', GIT_AUTHOR_NAME: 'a' };
    expect(scrubGitEnv(env)).toEqual({ PATH: '/bin', HOME: '/h', GIT_AUTHOR_NAME: 'a' });
    expect(env.GIT_DIR, 'the caller\'s env is not edited').toBe('d');
  });

  it('readTreeCi: the first commit with a verdict decides, and the verdict line names a borrowed verdict as borrowed', () => {
    const gh = fakeGh([run(22, 'r', GREEN), run(21, 'p', GREEN)]);
    const ci = readTreeCi(gh, ['h', 'p', 'r']);
    expect(ci).toEqual({ state: 'success', run: '21', sha: 'p', exact: false });
    const v = verdict({ id: 'x', files: 3 }, null, { state: 'failure' }, { commitCi: ci, mainMoves: true });
    expect(v.code).toBe(0);
    expect(v.line).toMatch(/run 21's e2e jobs all passed on p, whose frontend\/ tree and ci\.yml are byte-identical/);
    expect(readTreeCi(gh, ['h']), 'HEAD alone, no run on it: no verdict, the base rules apply').toEqual({ state: null });
    const exact = readTreeCi(fakeGh([run(31, 'h', GREEN, 'workflow_dispatch')]), ['h']);
    expect(exact).toEqual({ state: 'success', run: '31', sha: 'h', exact: true });
    expect(verdict({ id: 'x', files: 3 }, null, { state: 'failure' }, { commitCi: exact, mainMoves: true }).line).toMatch(/on this exact commit$/);
  });
});

// ─── THE CLI ITSELF, IN A REAL REPOSITORY ──────────────────────────────────────────────────────────────────────────
// Every fake above answers what its author believed git and gh do; the review's ref/flag mutants survived exactly
// there. This runs the CLI from frontend/ — a copy of the subject read at test time, so a mutant applies — in a git
// repository built in a temp dir, with a stub `gh` first on PATH that serves fixture runs through the real `jq`, so
// the --json field lists and --jq expressions run as written (jq ships on the ubuntu-24.04 runner and in macOS).
// History, oldest first (S, B2, E, F, C, D are siblings off B):
//   A   frontend/ + ci.yml            push run on main, e2e GREEN
//   B   docs only, on A               no run   -> borrows A's green                                    exit 0
//   C   frontend change, on B         one pull_request run, GREEN (it tested the merge ref, not C)    exit 1
//   D   ci.yml only, on B             no run   -> same app as A, a different e2e job                  exit 1
//   E   docs only, on B               workflow_dispatch, e2e RED
//   F   docs only, on E               no run   -> the newest verdict on its identity is E's red       exit 1
//   S   frontend change, on B         workflow_dispatch, e2e GREEN (a side branch)
//   M   B2 (docs, on B) merged with S, --no-ff  -> M's pair is S's: borrows S                       exit 0
// The base (main's newest run) is RED and the push moves main unless a case says otherwise. Fixtures write only under
// the temp root they create, removed afterwards; every git call runs with the caller's GIT_* removed (a hook exports
// GIT_DIR and GIT_INDEX_FILE, and this suite runs inside the pre-commit hook) and no global or system config.
describe('the CLI, run from frontend/ in a real repository against a stub gh', () => {
  const SUBJECT = fileURLToPath(new URL('../../scripts/ci/e2e-freshness.mjs', import.meta.url));
  const CLEAN = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  const ENV = { ...CLEAN, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
  let TMP, ROOT, BIN, FIXTURE, LOG, DECOY;
  const sha = {};
  let tick = 0;
  const git = (cwd, ...args) => {
    const date = `2026-01-01T00:${String(tick).padStart(2, '0')}:00Z`;
    return execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', ...args], {
      cwd, env: { ...ENV, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  };
  const commit = (name, files) => {
    for (const [p, body] of Object.entries(files)) {
      mkdirSync(dirname(join(ROOT, p)), { recursive: true });
      writeFileSync(join(ROOT, p), body);
    }
    tick += 1;
    git(ROOT, 'add', '-A');
    git(ROOT, 'commit', '-q', '-m', name);
    sha[name] = git(ROOT, 'rev-parse', 'HEAD');
  };
  const at = (name) => git(ROOT, 'checkout', '-q', '--detach', sha[name]);
  const YML = (shards) => `jobs:\n  e2e:\n    name: e2e ${shards}\n    timeout-minutes: 25\n`;

  // The stub: `gh run list` filters by --branch and --commit, stops at --limit (gh's default is 20) and keeps only
  // the --json fields; `gh run view <id>` answers that run's jobs; the --jq expression runs through real jq -r (gh
  // prints a string result raw). Anything else exits 1, as gh does on an error. Every call is logged.
  const STUB = `
import { readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const args = process.argv.slice(2);
appendFileSync(process.env.GH_STUB_LOG, args.join(' ') + '\\n');
const fx = JSON.parse(readFileSync(process.env.GH_STUB_FIXTURE, 'utf8'));
const opt = (name) => {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name) return args[i + 1];
    if (args[i].startsWith(name + '=')) return args[i].slice(name.length + 1);
  }
  return undefined;
};
const pick = (o) => Object.fromEntries(opt('--json').split(',').map((f) => [f, o[f] ?? null]));
const emit = (data) => {
  const json = JSON.stringify(data);
  process.stdout.write(opt('--jq') ? execFileSync('jq', ['-r', opt('--jq')], { input: json, encoding: 'utf8' }) : json + '\\n');
};
if (args[0] === 'run' && args[1] === 'list' && opt('--workflow') === 'ci.yml') {
  let runs = fx.runs;
  if (opt('--branch')) runs = runs.filter((r) => r.headBranch === opt('--branch'));
  if (opt('--commit')) runs = runs.filter((r) => r.headSha === opt('--commit'));
  emit(runs.slice(0, Number(opt('--limit') ?? 20)).map(pick));
} else if (args[0] === 'run' && args[1] === 'view' && fx.runs.some((r) => String(r.databaseId) === args[2])) {
  emit(pick({ jobs: fx.runs.find((r) => String(r.databaseId) === args[2]).jobs }));
} else {
  process.stderr.write('stub gh: not served: ' + args.join(' ') + '\\n');
  process.exit(1);
}
`;
  const jobs = (c) => [1, 2].map((n) => ({
    name: `e2e (playwright) ${n}/6`, status: 'completed', conclusion: c, databaseId: 100 + n,
    startedAt: '2026-01-01T01:00:00Z', completedAt: '2026-01-01T01:10:00Z',
  }));
  const ghRun = (databaseId, event, headBranch, headSha, c) => ({ databaseId, event, headBranch, headSha, status: 'completed', conclusion: c, jobs: jobs(c) });
  const runs = (base) => [ // newest first, as gh lists them
    ghRun(9001, 'push', 'main', 'f'.repeat(40), base === 'red' ? 'failure' : 'success'),
    ghRun(8001, 'pull_request', 'feat/c', sha.C, 'success'),
    ghRun(7001, 'workflow_dispatch', 'side', sha.S, 'success'),
    ghRun(6001, 'workflow_dispatch', 'e', sha.E, 'failure'),
    ghRun(5001, 'push', 'main', sha.A, 'success'),
  ];

  const cli = (name, { base = 'red', refs = ' refs/heads/main', env = {} } = {}) => {
    at(name);
    writeFileSync(FIXTURE, JSON.stringify({ runs: runs(base) }));
    writeFileSync(LOG, '');
    const r = spawnSync(process.execPath, ['scripts/ci/e2e-freshness.mjs'], {
      cwd: join(ROOT, 'frontend'),
      env: { ...ENV, PATH: `${BIN}${delimiter}${process.env.PATH}`, GH_STUB_FIXTURE: FIXTURE, GH_STUB_LOG: LOG, E2E_PUSH_REFS: refs, ...env },
      encoding: 'utf8',
      timeout: 60_000,
    });
    return { code: r.status, out: `${r.stdout}${r.stderr}`, gh: readFileSync(LOG, 'utf8') };
  };
  const short = (name) => sha[name].slice(0, 8);

  beforeAll(() => {
    execFileSync('jq', ['--version'], { stdio: 'ignore' }); // the stub needs real jq; absent, this fails here, by name
    TMP = mkdtempSync(join(tmpdir(), 'e2e-freshness-'));
    ROOT = join(TMP, 'repo');
    BIN = join(TMP, 'bin');
    FIXTURE = join(TMP, 'runs.json');
    LOG = join(TMP, 'gh.log');
    mkdirSync(ROOT);
    mkdirSync(BIN);
    writeFileSync(join(TMP, 'gh-stub.mjs'), STUB);
    writeFileSync(join(BIN, 'gh'), `#!/bin/sh\nexec "${process.execPath}" "${join(TMP, 'gh-stub.mjs')}" "$@"\n`);
    chmodSync(join(BIN, 'gh'), 0o755);
    git(ROOT, 'init', '-q', '-b', 'main');
    commit('A', {
      'frontend/scripts/ci/e2e-freshness.mjs': readFileSync(SUBJECT, 'utf8'),
      'frontend/src/app.js': 'export const v = 1;\n',
      '.github/workflows/ci.yml': YML(6),
      'docs/notes.md': 'a\n',
    });
    commit('B', { 'docs/notes.md': 'b\n' });
    commit('C', { 'frontend/src/app.js': 'export const v = 2;\n' });
    at('B'); commit('D', { '.github/workflows/ci.yml': YML(3) });
    at('B'); commit('E', { 'docs/notes.md': 'e\n' }); commit('F', { 'docs/notes.md': 'f\n' });
    at('B'); commit('S', { 'frontend/src/app.js': 'export const v = 3;\n' });
    at('B'); commit('B2', { 'docs/notes.md': 'b2\n' });
    tick += 1;
    git(ROOT, 'merge', '-q', '--no-ff', '-m', 'M', sha.S);
    sha.M = git(ROOT, 'rev-parse', 'HEAD');
    // A second repository, for the GIT_DIR case: one docs commit, no frontend/, no runs.
    DECOY = join(TMP, 'decoy');
    mkdirSync(DECOY);
    git(DECOY, 'init', '-q', '-b', 'main');
    writeFileSync(join(DECOY, 'x.md'), 'x\n');
    git(DECOY, 'add', '-A');
    git(DECOY, 'commit', '-q', '-m', 'decoy');
  }, 120_000);
  afterAll(() => {
    if (TMP) rmSync(TMP, { recursive: true, force: true });
  });

  it('the fixture is what it claims: nine commits, M\'s pair equal to S\'s and to no other', () => {
    expect(Object.keys(sha)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'S', 'B2', 'M']);
    const pair = (n) => git(ROOT, 'rev-parse', `${sha[n]}:frontend`, `${sha[n]}:.github/workflows/ci.yml`);
    expect(pair('M')).toBe(pair('S'));
    expect(pair('B')).toBe(pair('A'));
    expect(['A', 'C', 'D', 'B2'].map(pair).filter((p) => p === pair('M'))).toEqual([]);
  });

  it('B, docs only on A: borrows A\'s green, naming the run and the commit', () => {
    const r = cli('B');
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain(`fresh by CI — run 5001's e2e jobs all passed on ${short('A')}, whose frontend/ tree and ci.yml are byte-identical`);
  });

  it('C, an app change with only a green pull_request run: no receipt, the red base refuses', () => {
    const r = cli('C');
    expect(r.code, r.out).toBe(1);
    expect(r.out).toMatch(/BASE's e2e is RED/);
    expect(r.gh, 'presence control: the walk DID ask CI about C').toContain(`--commit ${sha.C}`);
  });

  it('D, a ci.yml-only change: not borrowed from A, whose app is the same', () => {
    const r = cli('D');
    expect(r.code, r.out).toBe(1);
  });

  it('F, docs only on E: the walk stops at E\'s red and never reaches A\'s green', () => {
    const r = cli('F');
    expect(r.code, r.out).toBe(1);
    expect(r.gh, 'the walk reached E').toContain(`--commit ${sha.E}`);
    expect(r.gh, 'and went no further').not.toContain(`--commit ${sha.A}`);
  });

  it('M, a merge whose pair is its side branch\'s: borrows S\'s workflow_dispatch green', () => {
    const r = cli('M');
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain(`run 7001's e2e jobs all passed on ${short('S')}`);
  });

  it('an inherited GIT_DIR / GIT_WORK_TREE naming another repository changes nothing: the cwd decides', () => {
    const r = cli('B', { env: { GIT_DIR: join(DECOY, '.git'), GIT_WORK_TREE: DECOY } });
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain(`on ${short('A')}`);
  });

  it('the walk is skipped where it cannot change the outcome: a green base, or a push that does not move main', () => {
    const green = cli('C', { base: 'green' });
    expect(green.code, green.out).toBe(0);
    expect(green.gh, 'the base was read').toContain('--branch main');
    expect(green.gh, 'a green base: no commit lookup').not.toContain('--commit');
    const branch = cli('C', { refs: ' refs/heads/feat/x' });
    expect(branch.code, branch.out).toBe(0);
    expect(branch.gh, 'a branch push on a red base: no commit lookup').not.toContain('--commit');
  });
});
