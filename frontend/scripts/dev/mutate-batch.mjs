#!/usr/bin/env node
/**
 * mutate-batch.mjs — run a LIST of mutants through scripts/dev/mutate.sh, the identity mutant FIRST, and print
 * the denominator and the `Mutation-Proof:` lines a commit needs.
 *
 *   node scripts/dev/mutate-batch.mjs <mutants.json>
 *
 *   mutants.json: [{ "subject", "spec", "expect", "label", "old", "new", "env"? }, ...]
 *     subject  the file mutate.sh rewrites (relative to frontend/, or absolute)
 *     spec     the vitest spec that must go RED
 *     expect   the spec's test count — REQUIRED: without it mutate.sh cannot tell a survivor from a spec that
 *              collected nothing (refute F10)
 *     old/new  the unique anchor and its replacement
 *     env      extra environment for the mutate.sh child (e.g. HARNESS_SETTINGS pointing at a scratch copy)
 *
 *   exit 0  every real mutant RED, and every identity mutant SURVIVED
 *   exit 1  a real mutant SURVIVED — the gate has a hole (this wins over everything below: a flaky harness can
 *           only manufacture false REDs, never a false green, so a survivor is real whatever else happened)
 *   exit 3  COULD NOT CHECK — an identity mutant went RED (the run measures flakiness, so no kill counts), a
 *           result was [3], the list is empty, or this is not a linked worktree
 *
 * THE IDENTITY MUTANT. One per distinct (subject, spec, env), run before any real mutant: it changes bytes and
 * nothing the spec can observe, so it must SURVIVE. If it goes RED the batch stops there — every kill after it
 * would measure the harness, not the gate. Chosen by file type, because an appended comment is not inert
 * everywhere: JSON has no comment syntax, so a `.json` subject is re-indented instead (still valid, same
 * value). An unknown type gets no identity mutant and the batch is COULD NOT CHECK, never a guess.
 *
 * WHERE IT REFUSES TO RUN. mutate.sh rewrites the subject IN PLACE. In the main checkout that is the tree a live
 * session runs under, so both the caller's directory and this script's own tree must be LINKED worktrees
 * (`git rev-parse --git-dir` differs from `--git-common-dir`). And a subject that IS a live settings file
 * (`.claude/settings.json`, `.claude/settings.local.json`) is refused outright: mutate a scratch copy and point
 * the check at it through `env`.
 *
 * WHAT IT DOES NOT CHECK: whether a mutant is PLAUSIBLE-WRONG rather than a deletion (sufficiency, not just
 * necessity) — that is the author's choice of `old`/`new`, and only a reader can judge it.
 */
import { readFileSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { resolve, dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../..');
const MUTATE = join(HERE, 'mutate.sh');

/** process.env with every GIT_* removed (tests/scripts/_isolatedGit.js has the reason), plus `extra`. */
const scrubbedEnv = (extra = {}) => {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return { ...env, ...extra };
};

const LIVE_SETTINGS = /(^|\/)\.claude\/settings(\.local)?\.json$/;

/** Parse and validate a mutants list. Throws naming the mutant and the field. */
export function parseMutants(json) {
  const list = JSON.parse(json);
  if (!Array.isArray(list)) throw new Error('the mutants file must hold a JSON array');
  return list.map((m, i) => {
    const where = `mutant ${i}${m && typeof m.label === 'string' ? ` (${m.label})` : ''}`;
    if (!m || typeof m !== 'object') throw new Error(`${where}: not an object`);
    for (const k of ['subject', 'spec', 'label', 'old']) {
      if (typeof m[k] !== 'string' || m[k] === '') throw new Error(`${where}: "${k}" must be a non-empty string`);
    }
    if (typeof m.new !== 'string') throw new Error(`${where}: "new" must be a string (empty deletes the anchor)`);
    if (!Number.isInteger(m.expect) || m.expect < 1) {
      throw new Error(`${where}: "expect" (the spec's test count) is required — without it a spec that collected nothing reads as a verdict`);
    }
    if (m.env !== undefined && (typeof m.env !== 'object' || m.env === null || Object.values(m.env).some((v) => typeof v !== 'string'))) {
      throw new Error(`${where}: "env" must map names to strings`);
    }
    if (LIVE_SETTINGS.test(m.subject.replaceAll('\\', '/'))) {
      throw new Error(`${where}: ${m.subject} is a LIVE harness file — mutate a scratch copy and pass its path in "env"`);
    }
    const out = { subject: m.subject, spec: m.spec, expect: m.expect, label: m.label, old: m.old, new: m.new };
    if (m.env !== undefined) out.env = m.env;
    return out;
  });
}

const CODE_EXT = new Set(['.js', '.mjs', '.jsx', '.cjs']);
const withLine = (text, line) => text + (text === '' || text.endsWith('\n') ? '' : '\n') + line + '\n';

/** The bytes-change-behaviour-does-not mutation for this file type, or null (COULD NOT CHECK). */
export function identityMutant(subjectPath, text) {
  const ext = extname(subjectPath).toLowerCase();
  if (ext === '.json') {
    const value = JSON.parse(text);
    const three = JSON.stringify(value, null, 3) + '\n';
    return three !== text ? three : JSON.stringify(value, null, 4) + '\n';
  }
  if (ext === '.md') return text + '\n';
  if (CODE_EXT.has(ext)) return withLine(text, '// identity mutant');
  if (ext === '.sh' || (ext === '' && /^#![^\n]*\b(ba|da|z|k)?sh\b/.test(text))) return withLine(text, '# identity mutant');
  return null;
}

/** Fold results into counts, the denominator line, the trailer lines and the exit code. */
export function summarize(results) {
  const real = results.filter((r) => !r.identity);
  const ids = results.filter((r) => r.identity);
  const red = real.filter((r) => r.code === 0).length;
  const survived = real.filter((r) => r.code === 1).length;
  const couldNotCheck = real.length - red - survived;
  const identitySurvived = ids.length > 0 && ids.every((r) => r.code === 1);
  const line = `${real.length} mutants: ${red} RED · ${survived} SURVIVED · ${couldNotCheck} COULD NOT CHECK`;
  const trailer = real
    .filter((r) => r.code === 0)
    .map((r) => `Mutation-Proof: ${r.label} -> RED${r.spec ? ` (${r.spec})` : ''}; restored -> green`);
  let code = 0;
  if (survived > 0) code = 1;
  else if (real.length === 0 || !identitySurvived || couldNotCheck > 0) code = 3;
  return { red, survived, couldNotCheck, identitySurvived, line, trailer, code };
}

/** Is `dir` inside a LINKED worktree? A main checkout, a plain directory and a git failure all say no. */
export function inLinkedWorktree(dir) {
  try {
    const [gitDir, common] = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir'], {
      cwd: dir,
      encoding: 'utf8',
      env: scrubbedEnv(),
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .trim()
      .split('\n');
    return Boolean(gitDir) && Boolean(common) && gitDir !== common;
  } catch {
    return false;
  }
}

/** One mutate.sh run: 0 RED, 1 SURVIVED, 3 anything else. */
function runOne(m) {
  const r = spawnSync('bash', [MUTATE, m.subject, m.spec, String(m.expect), m.label, m.old, m.new], {
    cwd: APP,
    env: scrubbedEnv(m.env),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.error) return 3;
  return r.status === 0 ? 0 : r.status === 1 ? 1 : 3;
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node scripts/dev/mutate-batch.mjs <mutants.json>');
    process.exit(3);
  }
  for (const [where, dir] of [['the current directory', process.cwd()], ['this script\'s tree', APP]]) {
    if (!inLinkedWorktree(dir)) {
      console.error(`mutate-batch: COULD NOT CHECK — ${where} (${dir}) is not a linked worktree. mutate.sh rewrites the subject in place; run mutants in a lane, never in the checkout a live session runs from.`);
      process.exit(3);
    }
  }
  let mutants;
  try {
    mutants = parseMutants(readFileSync(resolve(file), 'utf8'));
  } catch (e) {
    console.error(`mutate-batch: COULD NOT CHECK — ${e.message}`);
    process.exit(3);
  }
  if (mutants.length === 0) {
    console.error('mutate-batch: COULD NOT CHECK — the mutants list is empty');
    process.exit(3);
  }

  const results = [];
  const controls = new Map();
  for (const m of mutants) {
    const key = JSON.stringify([m.subject, m.spec, m.env ?? {}]);
    if (!controls.has(key)) controls.set(key, m);
  }
  for (const m of controls.values()) {
    const label = `identity mutant (${m.subject} x ${m.spec})`;
    let text;
    let mutated = null;
    try {
      text = readFileSync(resolve(APP, m.subject), 'utf8');
      mutated = identityMutant(m.subject, text);
    } catch {
      mutated = null;
    }
    if (mutated === null) {
      console.log(`  [3] ${label} — no identity mutant for this file type (or it could not be read)`);
      results.push({ label, code: 3, identity: true });
      continue;
    }
    results.push({ label, code: runOne({ ...m, label, old: text, new: mutated }), identity: true, spec: m.spec });
  }
  const s0 = summarize(results);
  if (!s0.identitySurvived) {
    console.log('\nmutate-batch: an identity mutant did not SURVIVE — the harness reds on a no-op, so no kill would count. Stopped before the real mutants.');
    process.exit(3);
  }
  for (const m of mutants) results.push({ label: m.label, code: runOne(m), identity: false, spec: m.spec });

  const s = summarize(results);
  console.log(`\n${s.line}`);
  console.log(`identity: ${s.identitySurvived ? 'SURVIVED (the control holds)' : 'RED — the batch is void'}`);
  if (s.trailer.length) console.log(`\n${s.trailer.join('\n')}`);
  process.exit(s.code);
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) main();
