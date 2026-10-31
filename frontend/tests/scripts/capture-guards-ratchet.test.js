import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { readSourceTree } from '../_support/primitiveCallSites.js';
import { ledgerDrift } from '../_support/ledgerDrift.js';

/**
 * NO FILE GAINS A CAPTURE GUARD, AND NO GUARD READS THE FLAG AT MODULE SCOPE (deep audit 2026-10-30, lane L12;
 * AUDIT:ultra:ultra-player-world-10; DECISIONS 2026-10-31, the capture-guard ruling).
 *
 * Capture mode freezes the world for the e2e specs and probes that call `enterCapture`, and it works by suppression:
 * `isCaptureMode()` guards, 93 calls and 12 reads of a store's `isCaptureMode` in 60 files at the time of the ruling.
 * game-code.md said three things about them: add none, check the flag inside the callback (capture is enabled after
 * boot and boot length varies per process), and reset to a declared value rather than return early. Nothing enforced any
 * of the three, and five useFrame guards returned early (HurlSystem, SquadAISystem, ElementZoneSystem, the far beacon,
 * the Player loop). The ruling: the third is retired, because what it protected was a run-independent frame for the pixel
 * baselines, and that oracle retired (W1-H item 1, W2-B); the first two stand and are enforced here.
 *
 *  - The count of guard sites per file is in tests/scripts/capture-guards.ledger.json and may only fall, and the ledger
 *    is the count exactly (tests/_support/ledgerDrift.js): a file past its number, a file the ledger does not list, and
 *    a file under its number all fail. Lower the number in the commit that removes a guard; each one goes when its
 *    subject next moves (reset plan row 48).
 *  - A guard at module scope reads the flag at import, before anything has entered capture mode, and would never see it.
 *
 * It reads the syntax tree (@babel/parser): a comment or a string naming the function is not a guard. A guard site is a
 * call of `isCaptureMode()`, or a read of a member called `isCaptureMode` (the store's field, `x.isCaptureMode()`).
 * SITED IN tests/scripts/ (the subject is the source's shape), not tests/gates/.
 *
 * Mutation-Proof: scripts/dev/mutate.sh, receipts in the commit.
 */
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PARSE = { sourceType: 'module', plugins: ['jsx'] };
const SKIP = new Set(['loc', 'start', 'end', 'extra', 'range', 'leadingComments', 'trailingComments', 'innerComments']);
const FN = /Function|ClassMethod|ObjectMethod|ClassPrivateMethod/;

function walk(node, fn, parents = []) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, parents);
  const next = [...parents, node];
  for (const k of Object.keys(node)) {
    if (SKIP.has(k)) continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) walk(c, fn, next); } else if (v && typeof v.type === 'string') walk(v, fn, next);
  }
}

/** The guard sites in one file's text: { line, atModuleScope }. */
export function guardSites(text) {
  const out = [];
  walk(parse(text, PARSE).program, (n, parents) => {
    const call = n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'isCaptureMode';
    const member = (n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression') && !n.computed && n.property.type === 'Identifier' && n.property.name === 'isCaptureMode';
    if (call || member) out.push({ line: n.loc.start.line, atModuleScope: !parents.some((p) => FN.test(p.type)) });
  });
  return out;
}

describe('capture guards: no file gains one, none reads the flag at module scope', () => {
  const ledger = JSON.parse(readFileSync(resolve(APP, 'tests/scripts/capture-guards.ledger.json'), 'utf8')).sites;
  const tree = readSourceTree();
  const perFile = {};
  const moduleScope = [];
  for (const { file, text } of tree) {
    const sites = guardSites(text);
    if (sites.length) perFile[file] = sites.length;
    for (const s of sites) if (s.atModuleScope) moduleScope.push(`${file}:${s.line}`);
  }
  const total = Object.values(perFile).reduce((a, b) => a + b, 0);

  it('the instrument sees: the tree, the guards and the ledger', () => {
    // Floors under the counts at the ruling (60 files, 105 sites), so a reader that found nothing cannot pass.
    expect(tree.length, 'the source tree came back short').toBeGreaterThan(350);
    expect(Object.keys(perFile).length, 'the scan found guards in almost no file').toBeGreaterThan(50);
    expect(total, 'the scan found almost no guard sites').toBeGreaterThan(95);
    expect(Object.keys(ledger).length, 'the ledger lists almost no file').toBeGreaterThan(50);
    // One of each form, in the files known to hold them.
    expect(perFile['src/world/Terrain.jsx'], 'Terrain.jsx holds eight calls').toBeGreaterThanOrEqual(8);
    expect(perFile['src/world/bossSystem.js'], 'bossSystem.js reads the field off the store').toBeGreaterThanOrEqual(1);
  });

  it('no file holds more guards than the ledger allows, and no unlisted file holds one', () => {
    expect(ledgerDrift(perFile, ledger).over, 'files that gained a capture guard (the rule is: add none; lower the ledger when you remove one)').toEqual([]);
  });

  it('no file holds fewer than its number: the ledger falls when the count does', () => {
    const { slack, malformed } = ledgerDrift(perFile, ledger);
    expect(slack, 'the count fell and the ledger did not: write the lower number into capture-guards.ledger.json (remove an entry at 0)').toEqual([]);
    expect(malformed, 'ledger entries that are not a whole number of 1 or more').toEqual([]);
  });

  it('no guard reads the flag at module scope', () => {
    expect(moduleScope, 'isCaptureMode() evaluated at import: the flag is false then, whatever a spec does later').toEqual([]);
  });

  it('the ledger comparison names a file past its number, a file the ledger does not list, and a file under its number', () => {
    expect(ledgerDrift({ 'src/a.js': 3, 'src/b.js': 1, 'src/c.js': 2 }, { 'src/a.js': 3, 'src/c.js': 4 })).toEqual({
      over: ['src/b.js: 1 > 0'], slack: ['src/c.js: 2 < 4'], malformed: [],
    });
    expect(ledgerDrift({ 'src/a.js': 4 }, { 'src/a.js': 3 }).over).toEqual(['src/a.js: 4 > 3']);
    expect(ledgerDrift({}, { 'src/a.js': 3 }).slack, 'a listed file with none left').toEqual(['src/a.js: 0 < 3']);
    expect(ledgerDrift({ 'src/a.js': 2 }, { 'src/a.js': 3 }).slack, 'one under is slack').toEqual(['src/a.js: 2 < 3']);
  });

  it('the detector, on text it is handed, finds a call, a member read and a nested guard, and ignores a comment and a string', () => {
    const text = [
      "import { isCaptureMode } from '../devtest/captureMode';",
      "// isCaptureMode() in a comment is not a guard",
      "const s = 'isCaptureMode()';",
      'const atImport = isCaptureMode();',
      'export function f() { if (isCaptureMode()) return; }',
      'export const g = () => useGameStore.getState().isCaptureMode;',
      'export const h = () => mod?.isCaptureMode();',
      'class K { m() { return isCaptureMode(); } }',
      'export const notAGuard = () => other.isCaptureModeX;',
    ].join('\n');
    const sites = guardSites(text);
    expect(sites.map((x) => x.line)).toEqual([4, 5, 6, 7, 8]);
    expect(sites.filter((x) => x.atModuleScope).map((x) => x.line)).toEqual([4]);
  });
});
