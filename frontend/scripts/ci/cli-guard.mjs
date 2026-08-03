#!/usr/bin/env node
/**
 * CLI-GUARD — a script that EXPORTS must not run its CLI when someone imports it.
 *
 * THE DEFECT, WHICH BIT TWICE. `scripts/ci/i18n-adoption.mjs` and `scripts/visual/capture.mjs` both ran
 * their whole CLI body at module scope. The moment a test imported a seam from either, loading the test
 * file executed the tool: i18n-adoption's `process.exit(1)` killed the vitest worker DURING COLLECTION, so
 * the run reported **"1 failed | no tests"** — every assertion in the file skipped silently while the file
 * looked like it had caught something. capture.mjs was worse in kind: importing it spawned a browser and a
 * vite server as a side effect of `import`.
 *
 * A red that reports ZERO tests is the worst possible red, because it looks like a failure that was
 * detected rather than a suite that never ran.
 *
 * WHY A CHECKER AND NOT A SWEEP. The sweep was done 2026-08-03 and found nothing left to fix — six
 * exporting files under `scripts/`, five guarded, and `_serve.mjs` correctly needing none. But a snapshot
 * is not a ratchet: nothing stopped the NEXT script shipping without a guard, and this class had already
 * recurred once before anyone noticed. A rule names its enforcer or it is not a rule (LOOP-CHARTER §8).
 *
 * THE TEST IS DELIBERATELY NARROW. Flagged only when ALL THREE hold:
 *   1. the file has an `export` — so something can import it, which is the whole precondition;
 *   2. it has top-level EXECUTABLE statements — a bare expression, a branch, a loop, or a `const` whose
 *      initialiser is a call. Declarations of functions, classes and plain literals are inert and do not
 *      count, which is exactly why `_serve.mjs` (a pure helper) is correctly silent here;
 *   3. it has no `import.meta.url` / `process.argv[1]` guard anywhere.
 *
 * Anything looser flags harmless module setup and becomes noise, and noise is how a check gets switched
 * off — the same reasoning that made the i18n gate a ratchet rather than a zero-target.
 *
 *   node scripts/ci/cli-guard.mjs            check; exit 1 on an unguarded exporting script
 *   node scripts/ci/cli-guard.mjs --verbose  list every script and its verdict
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../..');
const SCRIPTS = join(APP, 'scripts');

/** Statement types that DO something when the module loads. Declarations are inert and omitted. */
const EXECUTABLE = new Set([
  'ExpressionStatement',
  'IfStatement',
  'ForStatement',
  'ForOfStatement',
  'ForInStatement',
  'WhileStatement',
  'DoWhileStatement',
  'SwitchStatement',
  'TryStatement',
  'ThrowStatement',
  'LabeledStatement',
]);

/** A `const x = f()` runs f at import; a `const x = {...}` or `= (a) => b` does not. */
const initIsCall = (node) =>
  node.type === 'VariableDeclaration' &&
  node.declarations.some((d) => d.init && (d.init.type === 'CallExpression' || d.init.type === 'AwaitExpression' || d.init.type === 'NewExpression'));

/**
 * A GUARD COMPARES; it does not merely mention. The first version of this test was a source-wide regex for
 * `import.meta.url`, which mutation-proofing caught as a FALSE NEGATIVE: `dirname(fileURLToPath(
 * import.meta.url))` is the ordinary way a script resolves its own directory, and i18n-adoption.mjs carries
 * it on line 52 quite apart from its real guard on line 133. Under the loose regex, a script with an export,
 * top-level work and only that path line scored as guarded — unflagged in exactly the shape this checker
 * exists to catch, which is worse than no checker because it also silences the reviewer.
 *
 * Line-scoped rather than whole-source, so the comparison and the mention have to occur together.
 */
const isGuardLine = (line) =>
  /process\.argv\[1\]/.test(line) || // the house idiom, and this token appears nowhere else in the repo
  /import\.meta\.main/.test(line) || // Node's native flag, for whenever the repo adopts it
  (/import\.meta\.url/.test(line) && /[=!]==/.test(line)); // any hand-rolled equality form

/** PURE: decide a single source file. Exported so the decision is testable without a filesystem. */
export function inspect(src) {
  let ast;
  try {
    ast = parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true, allowAwaitOutsideFunction: true });
  } catch {
    return null; // unparseable is not something to accuse anyone over
  }
  const body = ast.program.body;
  const hasExport = body.some((n) => n.type.startsWith('Export'));
  const topLevel = body.filter((n) => EXECUTABLE.has(n.type) || initIsCall(n));
  const hasGuard = src.split('\n').some(isGuardLine);
  return { hasExport, topLevelCount: topLevel.length, hasGuard, kinds: [...new Set(topLevel.map((n) => n.type))] };
}

export const needsGuard = (info) => !!info && info.hasExport && info.topLevelCount > 0 && !info.hasGuard;

function walkDir(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkDir(p, out);
    else if (/\.mjs$/.test(e.name)) out.push(p);
  }
  return out;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const offenders = [];
  let checked = 0;
  for (const abs of walkDir(SCRIPTS).sort()) {
    const info = inspect(readFileSync(abs, 'utf8'));
    if (!info) continue;
    checked++;
    const rel = relative(APP, abs);
    if (process.argv.includes('--verbose')) {
      console.log(`  ${rel}  export=${info.hasExport} topLevel=${info.topLevelCount} guard=${info.hasGuard}`);
    }
    if (needsGuard(info)) offenders.push({ rel, kinds: info.kinds });
  }
  if (offenders.length) {
    console.error(`\n✖ cli-guard: ${offenders.length} exporting script(s) run their CLI on import\n`);
    for (const o of offenders) {
      console.error(`  ${o.rel}\n      top-level: ${o.kinds.join(', ')}`);
    }
    console.error(
      `\n  Importing one of these EXECUTES it. When it happened to scripts/ci/i18n-adoption.mjs, its\n` +
        `  process.exit(1) killed the vitest worker during collection and the run reported "1 failed |\n` +
        `  no tests" — every assertion silently skipped. Wrap the CLI body:\n\n` +
        `      const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);\n` +
        `      if (isCli) { /* ...the CLI... */ }\n`,
    );
    process.exit(1);
  }
  console.log(`✓ cli-guard: ${checked} script(s) checked; every exporting one is import-safe`);
}
