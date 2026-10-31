#!/usr/bin/env node
/**
 * ci-ok.mjs — the verdict of the `ci ok` job, the ONE status check main's branch protection requires.
 *
 * WHY ONE AGGREGATE (DECISIONS 2026-10-28 item 13(b)). Required checks are matched by job NAME. Requiring the
 * eight `e2e (playwright) N/8` names would block main the day the shard count changes, and requiring none of them
 * would let a red shard through. So every other job is a dependency of one job with a fixed name, and that job is
 * green only when each dependency is.
 *
 * THE RULE, per dependency (`needs.<id>.result`, from `toJSON(needs)`):
 *   success                      passes
 *   skipped                      passes ONLY for a job in SKIPPABLE_ON_DOCS, and only when the change-scope job
 *                                said exactly code=false, or certified=true with the certifying run named (a push to
 *                                main of a sha another run already passed). Anything else skipped fails: a skip with
 *                                no verdict behind it is a mis-wired `if`, and it would otherwise pass for ever.
 *   failure, cancelled, other    fails
 * plus three wiring checks, because an aggregate is only as complete as its `needs` list:
 *   - the change-scope job must be a dependency, must have SUCCEEDED, and must have said code true or false and
 *     certified true or false (true only beside a non-empty certified_by);
 *   - every job in ci.yml except this one must be a dependency (a job added and forgotten here would be ignored);
 *   - at least one dependency was read (R3a: an empty walk is a control failure, never a pass).
 *
 * WHY `if: always()` ON THE JOB, never `!cancelled()`: a SKIPPED job reports success to branch protection, so an
 * aggregate that skips when its run is cancelled would pass the required check on a sha nothing tested. Under
 * always() it runs, reads the cancelled dependencies, and fails.
 *
 * Mutation-Proof: tests/scripts/ci-required-check.test.js, each observed RED with scripts/dev/mutate.sh:
 *   K1 a skipped e2e passes without code=false              -> the mis-wired-skip case
 *   K2 plausible-wrong: `cancelled` counted as passing      -> the cancelled-shard case
 *   K3 the wiring check dropped (a job missing from needs)  -> the forgotten-job case
 *   K4 a garbage scope output read as code=true             -> the empty-scope-output case
 *   K5 the empty-needs denominator guard dropped            -> the empty-needs case
 *   K6 jobIds reads 4-space keys (steps) as jobs            -> the real-ci.yml job-list case
 *   identity (a comment edit) SURVIVED in the same batch.
 *
 *   node scripts/ci/ci-ok.mjs     reads NEEDS_JSON and ../.github/workflows/ci.yml; exit 0 = ok, 1 = not ok,
 *                                 3 = COULD NOT CHECK (no or unparseable NEEDS_JSON) — which fails the job too.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** This job's id in ci.yml, and the change-scope job's. */
export const SELF = 'ci-ok';
export const SCOPE_JOB = 'changes';
/** The jobs ci.yml skips on a docs-only or certified verdict (`if: needs.changes.outputs.code != 'false' && ...`): the browser job and the job that merges its shards' reach. */
export const SKIPPABLE_ON_DOCS = ['e2e', 'runtime-reach'];

/** PURE. The job ids of a workflow: the 2-space keys under the top-level `jobs:` key, until the next top-level key. */
export function jobIds(ymlText) {
  const ids = [];
  let inJobs = false;
  for (const line of String(ymlText).replace(/\r\n/g, '\n').split('\n')) {
    if (/^\S/.test(line) && !/^#/.test(line)) inJobs = /^jobs:\s*(#.*)?$/.test(line);
    else if (inJobs) {
      const m = /^ {2}([A-Za-z0-9_-]+):\s*(#.*)?$/.exec(line);
      if (m) ids.push(m[1]);
    }
  }
  return ids;
}

/** PURE. The verdict over `needs` (toJSON(needs)) and the job ids ci.yml declares. */
export function verdict(needs, jobs) {
  const lines = [];
  const bad = [];
  const ids = Object.keys(needs || {});
  if (ids.length === 0) return { ok: false, lines: ['ci ok: COULD NOT CHECK — no dependency was read (an empty needs context is a control failure, not a pass)'] };

  const missing = jobs.filter((j) => j !== SELF && !ids.includes(j));
  if (jobs.length === 0) bad.push('ci.yml declared no jobs this check could read, so its wiring is unknown');
  for (const j of missing) bad.push(`job "${j}" is in ci.yml but not in this job's needs — its result would be ignored`);

  const scopeJob = needs[SCOPE_JOB];
  const out = (scopeJob && scopeJob.outputs) || {};
  const code = out.code;
  const shaCert = out.certified;
  const by = out.certified_by;
  const scopeOk = !!scopeJob && scopeJob.result === 'success';
  if (!scopeJob) bad.push(`the change-scope job "${SCOPE_JOB}" is not a dependency`);
  else if (!scopeOk) bad.push(`the change-scope job concluded ${scopeJob.result}, so no skip can be justified`);
  else {
    if (code !== 'true' && code !== 'false') bad.push(`the change-scope job said code=${JSON.stringify(code)}, which is neither true nor false`);
    if (shaCert !== 'true' && shaCert !== 'false') bad.push(`the change-scope job said certified=${JSON.stringify(shaCert)}, which is neither true nor false`);
    else if (shaCert === 'true' && !by) bad.push('the change-scope job said certified=true and named no certifying run');
  }
  const docsOnly = scopeOk && code === 'false';
  const certifiedBy = scopeOk && shaCert === 'true' && by ? by : '';

  for (const id of ids) {
    const r = needs[id] && needs[id].result;
    if (r === 'success') { lines.push(`  ${id}: success`); continue; }
    if (r === 'skipped' && docsOnly && SKIPPABLE_ON_DOCS.includes(id)) { lines.push(`  ${id}: skipped — the change is docs only, against a certified base`); continue; }
    if (r === 'skipped' && certifiedBy && SKIPPABLE_ON_DOCS.includes(id)) { lines.push(`  ${id}: skipped — this exact sha passed \`ci ok\` in ${certifiedBy}`); continue; }
    const why = r === 'skipped' ? 'skipped without a docs-only or certified verdict behind it' : String(r);
    lines.push(`  ${id}: ${why}  <- NOT OK`);
    bad.push(`${id}: ${why}`);
  }

  const scopeWord = certifiedBy ? `certified by ${certifiedBy}` : docsOnly ? 'docs only' : `code=${code}`;
  const head = `ci ok: ${ids.length} dependencies read, ${jobs.filter((j) => j !== SELF).length} other job(s) in ci.yml; scope ${scopeWord}`;
  if (bad.length) return { ok: false, lines: [head, ...lines, `ci ok: FAILED — ${bad.length} problem(s):`, ...bad.map((b) => `  - ${b}`)] };
  const tail = certifiedBy ? `ci ok: every dependency passed or was skipped; this sha's verdict is the one ${certifiedBy} reached` : 'ci ok: every dependency passed, or was skipped because nothing it tests changed';
  return { ok: true, lines: [head, ...lines, tail] };
}

if (import.meta.main) {
  let needs;
  try {
    needs = JSON.parse(process.env.NEEDS_JSON || '');
  } catch {
    console.log('ci ok: COULD NOT CHECK — NEEDS_JSON is missing or not JSON');
    process.exit(3);
  }
  let yml = '';
  try {
    yml = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../.github/workflows/ci.yml'), 'utf8');
  } catch {
    yml = ''; // jobIds('') is [] and the verdict names it
  }
  const v = verdict(needs, jobIds(yml));
  for (const l of v.lines) console.log(l);
  process.exit(v.ok ? 0 : 1);
}
