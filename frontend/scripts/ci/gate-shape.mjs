#!/usr/bin/env node
/**
 * GATE-SHAPE LINT — mechanical proof that a "gate" is not decoration.
 *
 * WHY. 116 of the 136 files in tests/gates/ assert against SOURCE TEXT read with readFileSync rather than
 * executing the module. A whole-file substring assertion is satisfied by a COMMENT that happens to name the
 * symbol — so the gate stays green when the guarded code is deleted, as long as some comment still mentions it.
 *
 * This is not theoretical. On 2026-07-27 `input-abstraction-gates` asserted `/\bsetActive\b/` against the whole
 * of InputManager.jsx. The file carried a comment explaining WHY the setActive import must be kept. That comment
 * alone satisfied the gate: deleting the import still passed. The gate guarding the import was being held up by
 * the comment explaining the gate. A later audit hand-found seven more of the same shape.
 *
 * Hand-finding does not scale and does not block a push. This does.
 *
 * TWO deterministic checks. No model, no judgement:
 *
 *   A. COMMENT-SATISFIED ASSERTION (hard fail). For every gate that reads exactly ONE source file, each
 *      `toMatch(/re/)` pattern is run against that file twice — raw, and with every COMMENT range blanked
 *      (AST-derived, so string literals stay code). A pattern that matches raw but NOT blanked is satisfied
 *      only by a comment. It is not a gate.
 *
 *   B. SOURCE-GREP RATCHET. The population of gates that call readFileSync is frozen in
 *      tests/gates/.source-grep-ledger.json. A NEW one fails the push; the count may fall freely. This bounds
 *      the class while the conversion to behavioural gates proceeds, instead of letting it grow quietly.
 *
 * Usage: node scripts/ci/gate-shape.mjs            check; exit 1 on failure
 *        node scripts/ci/gate-shape.mjs --write     re-freeze the ratchet after REMOVING members
 *        node scripts/ci/gate-shape.mjs --verbose   also list every assertion checked
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../..');
const GATES = join(APP, 'tests/gates');
const LEDGER = join(GATES, '.source-grep-ledger.json');
const VERBOSE = process.argv.includes('--verbose');

const parseJs = (src) => {
  try {
    return parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true, ranges: true });
  } catch {
    return null;
  }
};

/** Replace every comment range with spaces, preserving offsets so nothing else shifts. */
function blankComments(src) {
  const ast = parseJs(src);
  if (!ast) return null;
  const chars = [...src];
  for (const c of ast.comments || []) {
    for (let i = c.start; i < c.end; i++) if (chars[i] !== '\n') chars[i] = ' ';
  }
  return chars.join('');
}

/**
 * Walk any AST node tree, invoking fn on every node.
 *
 * Deliberately does NOT descend into the `source` of an import/export. A gate typically IMPORTS the consts
 * it needs from one module while READING a different module's text — and conflating the two produces
 * confident false accusations. The first version of this script did exactly that: it saw
 * `import { SEA_LEVEL } from '../../src/world/oceanProfile.js'`, decided oceanProfile was the file under
 * test, and reported three assertions as comment-satisfied. They were real assertions against
 * terrain.worker.js; the strings only appeared in oceanProfile's comments by coincidence. Hand-checking one
 * finding is what caught it.
 */
function walk(node, fn) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, fn);
    return;
  }
  if (typeof node.type === 'string') fn(node);
  const skipSource = node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' ||
    node.type === 'ExportAllDeclaration' || node.type === 'ImportExpression';
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue;
    if (skipSource && k === 'source') continue;
    walk(node[k], fn);
  }
}

/** Collect (a) the src files this gate reads, and (b) its toMatch regex literals. */
function inspectGate(gateSrc) {
  const ast = parseJs(gateSrc);
  if (!ast) return null;
  const srcPaths = new Set();
  const patterns = [];
  walk(ast.program, (n) => {
    if (n.type === 'StringLiteral' && /(^|\/)src\/.+\.(js|jsx)$/.test(n.value)) {
      srcPaths.add(n.value.replace(/^.*?src\//, 'src/'));
    }
    if (
      n.type === 'CallExpression' &&
      n.callee?.type === 'MemberExpression' &&
      n.callee.property?.name === 'toMatch' &&
      n.arguments?.[0]?.type === 'RegExpLiteral'
    ) {
      patterns.push({ pattern: n.arguments[0].pattern, flags: n.arguments[0].flags, line: n.loc?.start.line });
    }
  });
  return { srcPaths: [...srcPaths], patterns };
}

const gateFiles = readdirSync(GATES)
  .filter((f) => /\.test\.jsx?$/.test(f))
  .sort();

const errors = [];
const sourceGrepGates = [];
let checked = 0;

for (const f of gateFiles) {
  const abs = join(GATES, f);
  const gateSrc = readFileSync(abs, 'utf8');
  if (/readFileSync/.test(gateSrc)) sourceGrepGates.push(`tests/gates/${f}`);

  const info = inspectGate(gateSrc);
  if (!info || info.patterns.length === 0) continue;
  // Only single-target gates can be attributed unambiguously. A gate reading several files could have its
  // pattern satisfied by any of them, and guessing which would produce false accusations.
  if (info.srcPaths.length !== 1) continue;

  const target = resolve(APP, info.srcPaths[0]);
  if (!existsSync(target)) continue;
  const raw = readFileSync(target, 'utf8');
  const blanked = blankComments(raw);
  if (blanked === null) continue;

  for (const p of info.patterns) {
    // Fresh RegExp per test: a /g/ pattern carries lastIndex between calls and would give a bogus result.
    const safeFlags = p.flags.replace(/[gy]/g, '');
    let hitRaw, hitBlank;
    try {
      hitRaw = new RegExp(p.pattern, safeFlags).test(raw);
      hitBlank = new RegExp(p.pattern, safeFlags).test(blanked);
    } catch {
      continue; // a pattern we cannot reconstruct is not something to accuse anyone over
    }
    checked++;
    if (VERBOSE) console.log(`  ${f}:${p.line}  /${p.pattern}/  raw=${hitRaw} code-only=${hitBlank}`);
    if (hitRaw && !hitBlank) {
      errors.push(
        `tests/gates/${f}:${p.line}\n` +
          `    /${p.pattern}/ matches ${info.srcPaths[0]} ONLY inside a comment.\n` +
          `    Delete the guarded code and this assertion still passes — it is not a gate.\n` +
          `    Fix: anchor it to the syntactic form (the import specifier, the call, the JSX element),\n` +
          `    or replace it with a behavioural test that imports the module and exercises it.`
      );
    }
  }
}

if (process.argv.includes('--write')) {
  writeFileSync(LEDGER, JSON.stringify({ _count: sourceGrepGates.length, gates: sourceGrepGates }, null, 2) + '\n');
  console.log(`gate-shape: froze ${sourceGrepGates.length} source-grep gates`);
  process.exit(0);
}

if (existsSync(LEDGER)) {
  const { gates: frozen } = JSON.parse(readFileSync(LEDGER, 'utf8'));
  const added = sourceGrepGates.filter((g) => !frozen.includes(g));
  if (added.length) {
    errors.push(
      `NEW source-grep gate(s) — this population may shrink, never grow:\n` +
        added.map((g) => `    ${g}`).join('\n') +
        `\n    A new gate should EXECUTE the module it guards, not regex its text.`
    );
  }
} else {
  console.error('gate-shape: no ledger — run with --write once to freeze the baseline.');
  process.exit(1);
}

if (errors.length) {
  console.error(`\n✖ gate-shape: ${errors.length} problem(s)\n`);
  for (const e of errors) console.error('  ' + e + '\n');
  process.exit(1);
}

console.log(
  `✓ gate-shape: ${checked} assertions verified against code-only source; ` +
    `${sourceGrepGates.length} source-grep gates (ratchet holding)`
);
