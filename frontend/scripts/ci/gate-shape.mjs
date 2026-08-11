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
import { ratchetDiff } from './_gate-ratchet.mjs';
import { resolve, dirname, join, relative } from 'node:path';
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

/**
 * True for `expect(x).not.toMatch(...)` — and for `.resolves.not.`, `.rejects.not.`, so the whole member
 * chain is walked rather than just the immediate parent.
 *
 * POLARITY MATTERS, and missing it produced this script's second false accusation. Check A asks "does this
 * pattern match only a comment?", which is a question about a pattern that is REQUIRED to be present. A
 * negated assertion requires the opposite: `expect(climate).not.toMatch(/n\s*\*\s*40/)` says the stale
 * hand-copied formula must be ABSENT from climate.js. Reading it as positive, the script found the pattern
 * in a nearby comment in heightAt.js — a file that assertion says nothing about — and reported a gate that
 * is doing its job exactly right.
 *
 * Negated assertions have a real vacuity failure of their own (one whose pattern can never match anything
 * anywhere always passes), but it is a different check and cannot be answered by blanking comments.
 */
function isNegated(callee) {
  let node = callee?.object;
  while (node?.type === 'MemberExpression') {
    if (node.property?.name === 'not') return true;
    node = node.object;
  }
  return false;
}

/**
 * Turn a string literal from a gate into the repo-relative src/ file it names, or null.
 *
 * THE ORIGINAL VERSION REQUIRED THE LITERAL TO CONTAIN `src/`, AND THAT EXEMPTED 49 OF THE 116 SOURCE-GREP
 * GATES — 42% of the population this script exists to police. Most gates do not write the prefix. They
 * define a helper once:
 *
 *     const SRC  = resolve(HERE, '../../src');
 *     const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
 *     const panels = read('ui/GamePanels.jsx');
 *
 * so the literal is `ui/GamePanels.jsx` and the prefix only ever exists in the helper. The script found no
 * target, skipped the file, and reported a clean run over gates it had never opened — `settings-a11y-gates`
 * among them, which was sitting on a comment-satisfied assertion the whole time.
 *
 * Resolution is by EXISTENCE, not by pattern: a candidate counts only if the file is really there under
 * src/. Guessing is what produced the earlier oceanProfile false accusations, and a path that resolves to
 * a real file is not a guess.
 */
function resolveTarget(value) {
  if (!/\.(js|jsx|mjs)$/.test(value)) return null;
  // Tried relative to src/ first (the overwhelmingly common case), then to the app root, which is how
  // gates reach scripts/ and tests/. Existence decides; nothing is inferred from shape.
  for (const c of [join('src', value), value]) {
    const abs = resolve(APP, c);
    if (abs.startsWith(APP) && existsSync(abs) && !abs.endsWith('/')) return relative(APP, abs);
  }
  return null;
}

/**
 * Gates rarely hand a whole path to one literal. They compose it:
 *
 *     readFileSync(resolve(SRC, 'render', 'spellVfx.jsx'))
 *     readFileSync(resolve(SRC, '..', 'scripts', 'visual', 'capture.mjs'))
 *
 * so no single literal is a path and the per-literal resolver above finds nothing. This rebuilds the path
 * from the trailing string arguments of a resolve()/join() call.
 *
 * COMPLETENESS IS A CORRECTNESS REQUIREMENT HERE, NOT A NICETY. Check A concludes "comment-satisfied" from
 * a pattern matching NO target's code — so a target that is missed cannot exonerate an assertion, and the
 * script accuses a gate that is working. That is precisely what happened on the first run of the widened
 * version: spell-vfx-gates:154 asserts against scripts/visual/capture.mjs, where `spell-cast` is a real
 * state name in real code, and it was reported as satisfied by a comment in EnhancedMagicSystem.jsx —
 * a file that assertion is not about. Same shape as the oceanProfile false accusations this script's
 * walk() already carries a warning about. Twice now, so it is the failure mode to design against.
 */
function composedPaths(ast) {
  const out = new Set();
  walk(ast.program, (n) => {
    if (n.type !== 'CallExpression') return;
    const name = n.callee?.name || n.callee?.property?.name;
    if (name !== 'resolve' && name !== 'join') return;
    const parts = n.arguments.filter((a) => a.type === 'StringLiteral').map((a) => a.value);
    if (parts.length === 0) return;
    const p = resolveTarget(parts.join('/'));
    if (p) out.add(p);
  });
  return out;
}

/** Collect (a) the src files this gate reads, and (b) its POSITIVE toMatch regex literals. */
function inspectGate(gateSrc) {
  const ast = parseJs(gateSrc);
  if (!ast) return null;
  const srcPaths = new Set();
  const patterns = [];
  walk(ast.program, (n) => {
    if (n.type === 'StringLiteral') {
      const p = resolveTarget(n.value);
      if (p) srcPaths.add(p);
    }
    if (
      n.type === 'CallExpression' &&
      n.callee?.type === 'MemberExpression' &&
      n.callee.property?.name === 'toMatch' &&
      n.arguments?.[0]?.type === 'RegExpLiteral' &&
      !isNegated(n.callee)
    ) {
      patterns.push({ pattern: n.arguments[0].pattern, flags: n.arguments[0].flags, line: n.loc?.start.line });
    }
  });
  for (const p of composedPaths(ast)) srcPaths.add(p);
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

  // MULTI-TARGET GATES ARE CHECKED TOO. The first version bailed on any gate reading more than one source
  // file, reasoning that a pattern could be satisfied by any of them and guessing which would produce false
  // accusations. The reasoning was right and the conclusion was too strong: it exempted a large class, and
  // `settings-a11y-gates` — which reads five files — sat inside it holding an assertion that a COMMENT
  // satisfied. Found by hand on 2026-08-02, during the i18n sweep that made it vacuous.
  //
  // Attribution is not actually required. A pattern that matches the raw text of at least one target and
  // matches the comment-blanked text of NONE of them is comment-satisfied whichever file the author meant.
  // That is decidable, and it is the same rule the single-target case was already applying — just not
  // specialised to one file. So there is no separate code path and no guessing.
  const targets = info.srcPaths
    .map((rel) => ({ rel, abs: resolve(APP, rel) }))
    .filter((t) => existsSync(t.abs))
    .map((t) => ({ ...t, raw: readFileSync(t.abs, 'utf8') }))
    .map((t) => ({ ...t, blanked: blankComments(t.raw) }))
    .filter((t) => t.blanked !== null);
  if (targets.length === 0) continue;

  for (const p of info.patterns) {
    // Fresh RegExp per test: a /g/ pattern carries lastIndex between calls and would give a bogus result.
    const safeFlags = p.flags.replace(/[gy]/g, '');
    let rawHits, blankHits;
    try {
      const re = () => new RegExp(p.pattern, safeFlags);
      rawHits = targets.filter((t) => re().test(t.raw));
      blankHits = targets.filter((t) => re().test(t.blanked));
    } catch {
      continue; // a pattern we cannot reconstruct is not something to accuse anyone over
    }
    checked++;
    if (VERBOSE) {
      console.log(`  ${f}:${p.line}  /${p.pattern}/  raw=${rawHits.length}/${targets.length} code-only=${blankHits.length}`);
    }
    if (rawHits.length > 0 && blankHits.length === 0) {
      const where = rawHits.map((t) => t.rel).join(', ');
      errors.push(
        `tests/gates/${f}:${p.line}\n` +
          `    /${p.pattern}/ matches ${where} ONLY inside a comment` +
          (targets.length > 1 ? ` (and no other file this gate reads matches it in code either).\n` : `.\n`) +
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
  const { added, stale } = ratchetDiff(frozen, sourceGrepGates);
  if (added.length) {
    errors.push(
      `NEW source-grep gate(s) — this population may shrink, never grow:\n` +
        added.map((g) => `    ${g}`).join('\n') +
        `\n    A new gate should EXECUTE the module it guards, not regex its text.`
    );
  }
  // A FALL IS GOOD NEWS THAT STILL HAS TO BE RECORDED. Until this existed the check ran in one
  // direction only, so a frozen entry with no live counterpart was invisible: the ledger listed
  // `aspect-hint-gate.test.js` long after that gate became behavioural (and was renamed to `.test.jsx`),
  // and this script printed "115 source-grep gates (ratchet holding)" against a frozen _count of 116.
  // The miscount is the smaller half. A stale entry is a FREE SLOT — a brand-new source-grep gate at
  // that exact path passes `frozen.includes()` and is admitted by the gate built to refuse it.
  if (stale.length) {
    errors.push(
      `STALE ledger entry(s) — frozen, but no longer reading source:\n` +
        stale.map((g) => `    ${g}`).join('\n') +
        `\n    This is the ratchet WORKING (a gate went behavioural, or was renamed). Record the fall:\n` +
        `    node scripts/ci/gate-shape.mjs --write\n` +
        `    Leaving it is not cosmetic: each stale path is a slot a new source-grep gate can occupy unchallenged.`
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
