import { describe, it, expect } from 'vitest';
import { verdict, readBaseCi, jobTimedOut, E2E_TIMEOUT_MIN, OBSERVED } from '../../scripts/ci/e2e-freshness.mjs';

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
  const gh = (run, e2eJobs) => (cmd) => (cmd.includes('run list') ? run : cmd.includes('run view') ? e2eJobs : '');
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
  it('a shard cancelled after running its WHOLE timeout timed out: the base is red (run 35830093253)', () => {
    const real = `completed,success,${T0},2026-09-23T07:21:15Z completed,cancelled,${T0},2026-09-23T07:32:50Z completed,success,${T0},2026-09-23T07:24:12Z`;
    expect(readBaseCi(gh('35830093253|completed|cancelled|37d030a', real), 25).state).toBe('failure');
    // the SAME shard cancelled three minutes in — a superseded run — is still no verdict
    expect(readBaseCi(gh('35830093253|completed|cancelled|37d030a', done('success', 'cancelled', 'success')), 25).state).toBe(null);
  });

  it('jobTimedOut: a cancel within 30 s of the limit timed out; one short of that, or any other conclusion, did not', () => {
    const job = (c, end) => ['completed', c, T0, end];
    expect(jobTimedOut(job('cancelled', '2026-09-23T07:32:09Z'), 25)).toBe(true); // 24m30s
    expect(jobTimedOut(job('cancelled', '2026-09-23T07:31:39Z'), 25)).toBe(false); // 24m00s
    expect(jobTimedOut(job('success', '2026-09-23T07:40:00Z'), 25)).toBe(false);
    expect(jobTimedOut(job('cancelled', 'null'), 25), 'a job with no end time').toBe(false);
    expect(jobTimedOut(job('cancelled', '2026-09-23T07:40:00Z'), null), 'no limit read: nothing inferred').toBe(false);
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
