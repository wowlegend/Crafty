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
 * WHY A RECEIPT AND NOT THE SUITE. 21 Playwright specs take ~20 minutes with `workers: 1` (the suite is
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

/** The verdict, separated from I/O so the selftest can drive it on synthetic inputs. */
export function verdict(current, stamp) {
  // R3a — a zero-file walk means the globs stopped matching, which would make every future run "fresh"
  // forever. That is a control failure, not a pass.
  if (current.files === 0) {
    return { code: 3, line: 'e2e-freshness: COULD NOT CHECK — 0 observed files. The scan matched nothing; this is a control failure, not a pass.' };
  }
  if (!stamp) {
    return {
      code: 0,
      line:
        `e2e-freshness: no stamp (${current.files} files observed, tree ${current.id}).\n` +
        '  Fresh clone or first run — NOT refusing. Record one with:\n' +
        '    cd frontend && npm run test:e2e && node scripts/ci/e2e-freshness.mjs --record',
    };
  }
  if (stamp.treeId !== current.id) {
    return {
      code: 1,
      line:
        `e2e-freshness: STALE. The last green E2E run was against tree ${stamp.treeId}; this tree is ${current.id}.\n` +
        `  ${current.files} files observed under ${OBSERVED.join(', ')} — one of them changed since that run.\n` +
        '  E2E is CI-only, so nothing else in this push path can see an E2E regression. Run it:\n' +
        '    cd frontend && npm run test:e2e && node scripts/ci/e2e-freshness.mjs --record',
    };
  }
  return { code: 0, line: `e2e-freshness: fresh (tree ${current.id}, ${current.files} files, green at ${stamp.at})` };
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
  const v = verdict(current, stamp);
  console.log(v.line);
  process.exit(v.code);
}
