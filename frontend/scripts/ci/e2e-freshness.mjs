#!/usr/bin/env node
/**
 * e2e-freshness.mjs — the E2E suite is CI-only, and that is how a green local push broke it.
 *
 * WHAT HAPPENED, 2026-09-22. A change to the damage model (the global damage lockout becoming
 * per-attacker) was proven against 3,241 unit tests, lint, build and every gate the pre-push hook runs.
 * It broke `tests/e2e/soft-death-protections.spec.js`, which asserts the cooldown, because E2E runs in
 * `.github/workflows/ci.yml` and in NO local chokepoint. The author could not have seen it. CI mailed
 * about it afterwards.
 *
 * WHY A RECEIPT AND NOT THE SUITE. The Playwright specs take ~20 minutes with `workers: 1` (the suite is
 * serialized because the specs share in-page game state). Putting that in every push makes the hook
 * something people bypass, and a bypassed gate is worth less than no gate. So this asserts the SUITE WAS
 * RUN GREEN AGAINST THIS SOURCE TREE — a receipt — and lets CI run the real thing.
 *
 * THE TREE ID IS THE POINT. A timestamp would answer "recently", which is not the question; the question
 * is "against THIS code". The stamp records a hash of the files E2E can actually observe —
 * `frontend/src/**` and `frontend/tests/e2e/**` — so editing a doc does not invalidate it and editing a
 * store action does. That makes the receipt falsifiable rather than decorative.
 *
 * FAIL-CLOSED on a stale stamp, OPEN on a missing one, and the asymmetry is deliberate: a missing stamp
 * is a fresh clone or a first run (refusing there teaches people to bypass), while a stale stamp is the
 * exact condition that produced the failure this exists to stop. Both print; a silent skip is
 * byte-identical to a pass.
 *
 * Mutation-Proof: appended one line to src/game/mobDamage.js (an observed file) -> STALE, exit 1,
 * printing the two tree ids. Reverting that single line returned it to fresh on the SAME stamp, which
 * proves it is content-keyed and not mtime-keyed. Controls in the same run: a newline appended to
 * memory/ROADMAP.md left it FRESH (the scope really is scoped), and deleting the stamp exits 0 with
 * guidance rather than refusing. An empty observed-file walk exits 3, never 0.
 *
 * Record a pass:  npm run test:e2e && node scripts/ci/e2e-freshness.mjs --record
 * Exit: 0 = fresh, or absent-and-warned · 1 = STALE · 3 = COULD NOT CHECK.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { join, resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const APP = resolve(HERE, '../..');
export const STAMP = resolve(APP, 'tests/e2e/.last-green.json');

/** The trees E2E can observe. A change anywhere else cannot invalidate an E2E result. */
export const OBSERVED = ['src', 'tests/e2e'];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx?|mjs|json)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** PURE-ish: a stable id for everything E2E can see. Content-hashed, not mtime — a checkout touches
 *  mtimes without changing behaviour, and that would expire every stamp on every clone. */
export function treeId(app = APP) {
  const files = OBSERVED.flatMap((d) => walk(resolve(app, d))).sort();
  const h = createHash('sha256');
  for (const f of files) {
    h.update(relative(app, f));
    h.update(readFileSync(f));
  }
  return { id: h.digest('hex').slice(0, 16), files: files.length };
}

/**
 * THE VERDICT — reframed 2026-09-22, because the first version demanded proof that cannot exist.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────
 * THE CIRCULARITY I SHIPPED
 *
 * v1 refused any push whose observed tree differed from the last LOCALLY recorded green e2e run. But
 * `ci/pipeline.sh` declares e2e CI-only — "too slow for any local tier (~20 min, workers: 1), so the push
 * tier asserts the receipt" — and the receipt could only be written by a local run. So every `src/` change
 * forced a twenty-minute local run of a suite the pipeline itself says belongs in CI.
 *
 * And it cannot be fixed by teaching CI to write the receipt: **CI cannot have run e2e on an unpushed
 * tree.** The gate asked for evidence that can only exist AFTER the act it gates. That is not a plumbing
 * bug, it is a goal that cannot be satisfied — the shape GF-L1 is supposed to catch before building.
 *
 * Proven in practice the same day: the local run it demanded went RED with four failures, three of them
 * `Test timeout` / `Execution context was destroyed` on a machine at load 126. A perf spec timing out
 * while the run itself holds 3.3 cores is evidence about the box, not the build.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT THE GATE IS ACTUALLY FOR, restated
 *
 * The defect it was built for: a damage-model change broke `soft-death-protections`, which only the
 * workflow runs, so the author could not have seen it. The goal is **never silently lose an e2e
 * regression** — not "prove green before pushing", which is impossible here.
 *
 * Achievable version, in three tiers:
 *
 *   1. A LOCAL RECEIPT for this exact tree still short-circuits everything. If someone did run the suite
 *      green on this tree, nothing more is owed. Kept as a fast path, no longer the only path.
 *   2. Otherwise the base matters: **do not stack an unverified change onto a tree CI has already called
 *      RED.** That is the condition under which a regression actually goes missing — the next red run is
 *      attributed to the known breakage and the new one rides in behind it.
 *   3. Otherwise ALLOW, loudly, naming that this tree's e2e verdict belongs to CI and has not been given
 *      yet. An honest "unverified, CI decides" beats a gate people learn to bypass.
 *
 * Fail-OPEN when the base state cannot be read (no `gh`, no network, no remote): a push path that breaks
 * when GitHub is unreachable teaches `--no-verify`, and R5 says choose the direction deliberately and say
 * which. The one thing that still fails CLOSED is a base CI run that is KNOWN red.
 *
 * @param {{id:string,files:number}} current  the observed tree
 * @param {object|null} stamp                 the local green receipt, if any
 * @param {{state:string|null, sha?:string}} [base]  CI conclusion for the push base; state null = unknown
 */
export function verdict(current, stamp, base = { state: null }) {
  // R3a — a zero-file walk means the globs stopped matching, which would make every future run "fresh"
  // forever. That is a control failure, not a pass.
  if (current.files === 0) {
    return { code: 3, line: 'e2e-freshness: COULD NOT CHECK — 0 observed files. The scan matched nothing; this is a control failure, not a pass.' };
  }

  // TIER 1 — a local receipt for THIS tree settles it outright.
  if (stamp && stamp.treeId === current.id) {
    return { code: 0, line: `e2e-freshness: fresh (tree ${current.id}, ${current.files} files, green at ${stamp.at})` };
  }

  // TIER 2 — refuse to stack onto a base CI has already called red.
  if (base && base.state === 'failure') {
    return {
      code: 1,
      line:
        `e2e-freshness: the push BASE's e2e is RED on CI${base.sha ? ` (${base.sha})` : ''}, and this tree has no local green receipt.\n` +
        '  Stacking an unverified change onto a known-broken base is how a regression goes missing: the\n' +
        '  next red run gets attributed to the breakage already there. Fix the base, or record a local\n' +
        '  green for this tree:\n' +
        '    cd frontend && npm run test:e2e && node scripts/ci/e2e-freshness.mjs --record',
    };
  }

  // TIER 3 — allow, and say plainly what is and is not known.
  const runNote = base && base.run && base.run !== base.state ? `; the run itself concluded ${base.run}, on a non-e2e job` : '';
  const why = base && base.state === 'success' ? `base CI e2e is green${base.sha ? ` (${base.sha})` : ''}${runNote}`
    : 'base CI state UNKNOWN (no gh, no network, or no runs yet) — failing OPEN by design';
  return {
    code: 0,
    line:
      `e2e-freshness: this tree has NO e2e verdict yet — ${why}.\n` +
      `  ${current.files} files observed under ${OBSERVED.join(', ')}; e2e is CI-only, so CI decides this one.\n` +
      '  Watch it: gh run list --workflow=ci.yml --branch main --limit 1\n' +
      '  To settle it locally instead (~20 min, and a loaded machine will produce timeouts that are about\n' +
      '  the machine): npm run test:e2e && node scripts/ci/e2e-freshness.mjs --record',
  };
}

/** The e2e job's `timeout-minutes`, read from the workflow: the job block runs from `  e2e:` to the next job at the
 *  same indent. Null when it cannot be read — and then no timeout is inferred (a cancel stays unknown). */
/** PURE: the e2e job's `timeout-minutes` from ci.yml's text, or null. The job block runs from `  e2e:` (a trailing
 *  comment allowed) to the next job at the same indent; CRLF line ends are normalised first (R9.6 — a re-saved CRLF
 *  file made this null, which silently turned the timeout inference back off). */
export function parseE2eTimeout(ymlText) {
  const yml = String(ymlText).replace(/\r\n/g, '\n');
  const head = /\n {2}e2e:[ \t]*(#[^\n]*)?\n/.exec(yml);
  if (!head) return null;
  const rest = yml.slice(head.index + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:/);
  const m = /\n {4}timeout-minutes: (\d+)/.exec(next < 0 ? rest : rest.slice(0, next + 1));
  return m ? Number(m[1]) : null;
}

/** The e2e job's `timeout-minutes`, read from the workflow — null when it cannot be read. */
export const E2E_TIMEOUT_MIN = (() => {
  try {
    return parseE2eTimeout(readFileSync(resolve(APP, '../.github/workflows/ci.yml'), 'utf8'));
  } catch {
    return null;
  }
})();

/** GitHub's own words on a job it stopped at its limit — the check-run annotation of run 35830093253's red shard. */
export const TIMEOUT_ANNOTATION = /exceeded the maximum execution time/i;

/**
 * Did this e2e job — [status, conclusion, startedAt, completedAt, id] — TIME OUT? GitHub concludes a job timeout as
 * `cancelled`, exactly like a run superseded by `cancel-in-progress`. The VERDICT is GitHub's annotation on the job
 * (`annotations`, the joined messages): it names the timeout, and a superseded job's says "The operation was
 * canceled." When the annotations cannot be read (null), the duration decides — a cancel within 30 s of the limit —
 * which errs toward RED, the safe side of a stacking rule (R9.6: a supersede in the last 30 s read as a timeout).
 */
export function jobTimedOut([, c, start, end], timeoutMin = E2E_TIMEOUT_MIN, annotations = null) {
  if (c !== 'cancelled') return false;
  if (annotations != null) return TIMEOUT_ANNOTATION.test(annotations);
  if (!(timeoutMin > 0)) return false;
  const ms = Date.parse(end) - Date.parse(start);
  return Number.isFinite(ms) && ms >= (timeoutMin * 60 - 30) * 1000;
}

/**
 * Read the push base's E2E verdict — the conclusions of the base run's e2e JOBS, not the run's.
 *
 * The run's conclusion was read here until 2026-09-22, when a run red on knip alone (two OS binaries
 * flagged; all three e2e shards green) made this gate refuse a one-line knip fix unless 20 minutes of e2e
 * were re-run locally. A knip, lint or build failure cannot hide an e2e regression — those are separate
 * jobs with separate conclusions — so the stacking rule's question is only ever the e2e jobs' answer.
 *   - every e2e job 'success'       -> 'success'
 *   - any e2e job 'failure' or 'timed_out', or 'cancelled' after running its whole timeout -> 'failure'
 *   - any e2e job not yet completed -> null (its verdict does not exist yet, whatever the finished shards say).
 *     The RUN's status is not the question either: every e2e shard can finish while knip still runs.
 *   - none observed, or any other   -> null (unknown; fail open, loudly — a shard cancelled SHORT is no verdict)
 * A JOB TIMEOUT CONCLUDES `cancelled`, not `timed_out` (ci.yml's own e2e comment says so). This read only `timed_out`,
 * so run 35830093253 — shard 2 red on perfect-dodge, then cut off at its 25-minute limit (07:07:39 -> 07:32:50) —
 * read as UNKNOWN and the gate failed OPEN onto a base CI had called red. Only the DURATION tells a timeout from a
 * superseded run, so the job query carries start and end, and `jobTimedOut` compares them to ci.yml's limit.
 * `run` carries the run's own conclusion so the printed line can say what it was.
 * Network + gh, so it is isolated here and always degrades to `{state:null}` — never throws into the push path.
 */
export function readBaseCi(exec, timeoutMin = E2E_TIMEOUT_MIN) {
  try {
    // `|`-separated, because a still-running run has an EMPTY conclusion: split on whitespace, the sha slid
    // into the conclusion field and the base's status was never read at all (review 2026-09-22).
    const out = exec('gh run list --workflow=ci.yml --branch main --limit 1 --json databaseId,status,conclusion,headSha --jq \'.[0] | "\\(.databaseId)|\\(.status)|\\(.conclusion)|\\(.headSha[0:7])"\'');
    const [id, status, conclusion, sha] = String(out).trim().split('|');
    if (!id || id === 'null') return { state: null };
    const run = status === 'completed' ? conclusion : status; // what to SAY about the run; not the verdict
    // `,`-separated: the timestamps carry `:`.
    const jobs = exec(`gh run view ${id} --json jobs --jq '[.jobs[] | select(.name | test("^e2e")) | "\\(.status),\\(.conclusion),\\(.startedAt),\\(.completedAt),\\(.databaseId)"] | join(" ")'`);
    const e2e = String(jobs).trim().split(/\s+/).filter(Boolean).map((j) => j.split(','));
    let state = null;
    // A cancelled shard's annotations say whether GitHub stopped it at its limit; unreadable -> null -> the duration.
    const notes = (j) => {
      if (j[1] !== 'cancelled' || !j[4]) return null;
      try {
        return String(exec(`gh api repos/{owner}/{repo}/check-runs/${j[4]}/annotations --jq '[.[].message] | join(" ")'`));
      } catch {
        return null;
      }
    };
    if (e2e.some((j) => j[1] === 'failure' || j[1] === 'timed_out' || jobTimedOut(j, timeoutMin, notes(j)))) state = 'failure'; // a timeout is a red shard
    else if (e2e.length > 0 && e2e.every(([st, c]) => st === 'completed' && c === 'success')) state = 'success';
    return { state, sha, run };
  } catch {
    return { state: null }; // no gh, no network, not a repo with runs — unknown, and that is allowed
  }
}

if (process.argv[1] && resolve(process.argv[1]).endsWith('e2e-freshness.mjs')) {
  const current = treeId();
  if (process.argv.includes('--record')) {
    writeFileSync(STAMP, `${JSON.stringify({ treeId: current.id, files: current.files, at: new Date().toISOString() }, null, 2)}\n`);
    console.log(`e2e-freshness: recorded green for tree ${current.id} (${current.files} files)`);
    process.exit(0);
  }
  let stamp = null;
  try {
    stamp = JSON.parse(readFileSync(STAMP, 'utf8'));
  } catch {
    /* absent */
  }
  const v = verdict(current, stamp, readBaseCi((cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })));
  console.log(v.line);
  process.exit(v.code);
}
