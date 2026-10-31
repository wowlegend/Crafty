import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSourceTree } from '../_support/primitiveCallSites.js';
import { ledgerDrift } from '../_support/ledgerDrift.js';
import { captureGuards } from '../_support/captureGuards.js';

/**
 * NO FILE GAINS A CAPTURE GUARD, AND NO GUARD READS THE FLAG AT MODULE SCOPE (deep audit 2026-10-30, lane L12;
 * AUDIT:ultra:ultra-player-world-10; DECISIONS 2026-10-31, the capture-guard ruling, and round 2).
 *
 * Capture mode freezes the world for the e2e specs and probes that call `enterCapture`, and it works by suppression:
 * guards on the capture flag turn things off. game-code.md said three things about them: add none, check the flag inside
 * the callback (capture is enabled after boot and boot length varies per process), and reset to a declared value rather
 * than return early. Nothing enforced any of the three, and five useFrame guards returned early (HurlSystem,
 * SquadAISystem, ElementZoneSystem, the far beacon, the Player loop). The ruling: the third is retired, because what it
 * protected was a run-independent frame for the pixel baselines, and that oracle retired (W1-H item 1, W2-B); the first
 * two stand and are enforced here.
 *
 *  - The count of GUARDS per file is in tests/scripts/capture-guards.ledger.json and may only fall, and the ledger is the
 *    count exactly (tests/_support/ledgerDrift.js): a file past its number, a file the ledger does not list, and a file
 *    under its number all fail. Lower the number in the commit that removes a guard; each one goes when its subject next
 *    moves (reset plan row 48).
 *  - A read of the flag at module scope happens at import, before anything has entered capture mode, and never sees it.
 *
 * A guard is one place the flag decides something, and the flag is followed by scope, not by name: an aliased import
 * (`isCaptureMode as frozenForCapture`), a local that holds it (`const isCaptureMode = useGameStore((s) => s.isCaptureMode)`,
 * whose every use is a guard), an arrow getter a `const` holds, and a parameter or prop it was passed into
 * (`initSettingsPersistence(store, isCaptureMode)` puts settingsPersist.js's two `isCapture()` guards in that file).
 * tests/_support/captureGuards.js says exactly what counts; it reads the syntax tree with scopes (@babel/parser,
 * @babel/traverse), so a comment or a string naming the function is not a guard. Not followed: the flag stored on an
 * object and read back (`sel.capture` after a selector returns `{ capture: s.isCaptureMode }`; the selector's read counts
 * once); a getter declared with `function` (counted once, where it reads the flag, not once per call); and a name that
 * arrives through a re-export (`export { isCaptureMode as frozen } from ...`, whose importers' reads count none). The
 * last two were measured by a reviewer's mutants, which stayed green (REVIEW:l12:capture-guard-getter-and-reexport-shapes);
 * neither shape is in src today.
 * SITED IN tests/scripts/ (the subject is the source's shape), not tests/gates/.
 *
 * Mutation-Proof: scripts/dev/mutate.sh, receipts in the commit.
 */
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('capture guards: no file gains one, none reads the flag at module scope', () => {
  const ledger = JSON.parse(readFileSync(resolve(APP, 'tests/scripts/capture-guards.ledger.json'), 'utf8')).sites;
  const tree = readSourceTree();
  const { perFile, moduleScope } = captureGuards(tree);
  const total = Object.values(perFile).reduce((a, b) => a + b, 0);

  it('the instrument sees: the tree, the guards and the ledger', () => {
    // Floors under the counts at round 2 (62 files, 133 guards), so a reader that found nothing cannot pass.
    expect(tree.length, 'the source tree came back short').toBeGreaterThan(350);
    expect(Object.keys(perFile).length, 'the scan found guards in almost no file').toBeGreaterThan(50);
    expect(total, 'the scan found almost no guards').toBeGreaterThan(120);
    expect(Object.keys(ledger).length, 'the ledger lists almost no file').toBeGreaterThan(50);
    // One of each form, in the files known to hold them.
    expect(perFile['src/world/Terrain.jsx'], 'Terrain.jsx holds eight calls of the imported function').toBeGreaterThanOrEqual(8);
    expect(perFile['src/world/bossSystem.js'], 'bossSystem.js reads the field off the store').toBeGreaterThanOrEqual(1);
    expect(perFile['src/GameScene.jsx'], "GameScene.jsx's local flag is used four times").toBeGreaterThanOrEqual(4);
    expect(perFile['src/game/settingsPersist.js'], 'settingsPersist.js guards on the function App passes it').toBeGreaterThanOrEqual(2);
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
    expect(moduleScope, 'the flag read at import: it is false then, whatever a spec does later').toEqual([]);
  });

  it('the ledger comparison names a file past its number, a file the ledger does not list, and a file under its number', () => {
    expect(ledgerDrift({ 'src/a.js': 3, 'src/b.js': 1, 'src/c.js': 2 }, { 'src/a.js': 3, 'src/c.js': 4 })).toEqual({
      over: ['src/b.js: 1 > 0'], slack: ['src/c.js: 2 < 4'], malformed: [],
    });
    expect(ledgerDrift({ 'src/a.js': 4 }, { 'src/a.js': 3 }).over).toEqual(['src/a.js: 4 > 3']);
    expect(ledgerDrift({}, { 'src/a.js': 3 }).slack, 'a listed file with none left').toEqual(['src/a.js: 0 < 3']);
    expect(ledgerDrift({ 'src/a.js': 2 }, { 'src/a.js': 3 }).slack, 'one under is slack').toEqual(['src/a.js: 2 < 3']);
  });

  it('the detector, on text it is handed, counts guards (not reads) under any alias, and ignores a comment, a string and a definition', () => {
    const text = [
      "import { isCaptureMode, isCaptureMode as frozen } from './devtest/captureMode';",
      '// isCaptureMode() in a comment is not a guard',
      "const s = 'isCaptureMode()';",
      'const atImport = isCaptureMode();',
      'export function f() { if (isCaptureMode()) return; }',
      'export const g = () => useGameStore.getState().isCaptureMode;',
      'export const h = () => mod?.isCaptureMode();',
      'class K { m() { return isCaptureMode(); } }',
      'export const notAGuard = () => other.isCaptureModeX;',
      'export function y() { const c = useGameStore((st) => st.isCaptureMode); if (c) a(); return c && b(); }',
      "export function z() { if (frozen() || typeof frozen !== 'function') return; }",
      'export function w() { const { isCaptureMode: cm } = useGameStore.getState(); return cm ? 1 : 2; }',
      'export function v() { const live = isCaptureMode; return live() ? 0 : 1; }',
      'export function u() { return <Physics paused={isCaptureMode()} />; }',
      'export function t() { if (g()) return; lib.setup({ frozen: isCaptureMode }); }',
    ].join('\n');
    const r = captureGuards([{ file: 'src/a.jsx', text }]);
    // 5 a call; 6 and 7 define getters (their calls are the guards); 8 a method's return; 10 a selector's local, used
    // twice; 11 the aliased import, two reads in one decision; 12 a destructured field; 13 an alias of the function; 14 a
    // library prop; 15 the getter's call and a hand-off into code this does not follow.
    expect(r.sites.map((x) => x.line)).toEqual([5, 8, 10, 10, 11, 12, 13, 14, 15, 15]);
    expect(r.perFile['src/a.jsx']).toBe(10);
    expect(r.moduleScope, 'the import-time read on line 4').toEqual(['src/a.jsx:4']);
  });

  it('the detector follows the function into a parameter it is passed to, and counts the guards where they are', () => {
    const tree2 = [
      { file: 'src/app.js', text: "import { isCaptureMode as cap } from './devtest/captureMode';\nimport { init } from './p.js';\nexport function boot(store) { init(store, cap); }" },
      { file: 'src/p.js', text: "export function init(store, isCapture) {\n  if (typeof isCapture === 'function' && isCapture()) return () => {};\n  return () => { if (isCapture()) return; };\n}" },
      { file: 'src/q.js', text: "import { isCaptureMode as frozenForCapture } from './devtest/captureMode.js';\nexport const atImport = frozenForCapture();" },
      { file: 'src/r.js', text: "import { isCaptureMode } from './devtest/captureMode.js';\nexport const frozen = () => isCaptureMode();" },
      { file: 'src/s.js', text: "import { frozen } from './r.js';\nexport function tick() { if (frozen()) return; }" },
    ];
    const r = captureGuards(tree2);
    expect(r.perFile, 'the hand-off and the getter are not guards; the uses are, in the files that have them').toEqual({ 'src/p.js': 2, 'src/s.js': 1 });
    expect(r.moduleScope, 'an aliased import read at import').toEqual(['src/q.js:2']);
  });
});
