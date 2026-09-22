// _seamClosure.js — the ONE definition of "this module cannot reach a voxel edit".
//
// WHY A SHARED MODULE AND NOT THREE COPIES. beast / voidhand / elemancer each carried a hand-copied
// stencil of the same gate, and by 2026-09-22 they had already DIVERGED: beast's forbidden list was
// missing `update_block`, so `game/beasts.js` could have called it and stayed green. Three copies of an
// invariant are three chances to drift; this is one.
//
// WHY A CLOSURE AND NOT A GREP. The old gates read each gated file's own text. That answers "does THIS
// FILE spell a seam token", which is not the invariant — the invariant is that the Aspect's code cannot
// REACH a voxel edit, and reaching is transitive through imports. Measured 2026-09-22: the three pure
// modules import nothing relative (closure = 1, so grep and closure agreed there and the old gate was
// weak rather than wrong), but `Components.jsx` reaches 93 modules and `world/HurlSystem.jsx` reaches 34.
// Every one of those was ungated. A seam introduced two hops away was invisible.
//
// THE BOUNDARY, AND WHY IT IS NOT A WHITELIST. Exactly ONE module in every closure owns a voxel seam:
// `store/useGameStore.jsx`, at `setWorldBlocks` (the world-array setter) and the terrain worker's
// `postMessage`. It is reachable from essentially everything, so excluding it by name would be the
// carve-out shape that gate-authoring class 10 says is where the next defect lives. Instead the gate
// ASSERTS the exception: the number of seam-bearing modules in the closure must be exactly one and it
// must be that file. A seam appearing anywhere else in the 93 reds. A second seam appearing in the store
// reds. The exception is itself gated.
//
// BLIND SPOT, stated (R7): this reads static `import`/`import()` specifiers. A seam reached through a
// dynamic string, a global, or an injected callback is invisible to it — as is a voxel edit performed by
// a module nothing imports (a worker message handler, say). It proves unreachability through the import
// graph, not unreachability.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');

// The canonical seam set. A voxel edit re-meshes a whole chunk — the worst per-frame op in the engine —
// so an Aspect that promises zero re-mesh must not reach any of these.
export const SEAM = /setWorldBlocks|terrain\.worker|createChunk|setBlock|postMessage|update_block/;

// The one module permitted to own a seam, asserted rather than assumed. See the boundary note above.
export const SEAM_OWNER = 'store/useGameStore.jsx';

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function resolveSpec(fromFile, spec) {
  if (!spec.startsWith('.')) return null; // bare specifiers are node_modules; not our source
  const base = resolve(dirname(fromFile), spec);
  for (const c of [base, `${base}.js`, `${base}.jsx`, `${base}/index.js`, `${base}/index.jsx`]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

/** Every source file reachable from `entry` through static relative imports, including `entry`. */
export function importClosure(entry) {
  const start = resolve(SRC, entry);
  if (!existsSync(start)) throw new Error(`seam-closure: entry does not exist: ${entry}`);
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const code = readFileSync(f, 'utf8');
    for (const m of code.matchAll(/from\s+'([^']+)'|import\(\s*'([^']+)'\s*\)/g)) {
      const r = resolveSpec(f, m[1] || m[2]);
      if (r) stack.push(r);
    }
  }
  return [...seen];
}

/** The modules in `entry`'s closure that spell a seam token in CODE (comments stripped). */
export function seamBearers(entry) {
  return importClosure(entry)
    .filter((f) => SEAM.test(stripComments(readFileSync(f, 'utf8'))))
    .map((f) => f.slice(SRC.length + 1));
}

/**
 * THE POSITIVE CONTROL, and it is the reason this file exists at all.
 *
 * Every assertion these gates make is an ABSENCE. A single typo in SEAM — `setWorldBlokcs` — would leave
 * all twenty of them green forever, reporting a clean bill of health on a codebase nobody was checking.
 * A dead instrument and a real absence produce identical readings. So before any gate asserts that a
 * closure is clean, it proves in the same run that the detector can SEE each token it claims to watch.
 */
export function assertDetectorLive(expect) {
  const tokens = ['setWorldBlocks', 'terrain.worker', 'createChunk', 'setBlock', 'postMessage', 'update_block'];
  for (const t of tokens) {
    expect(SEAM.test(`foo.${t}(1)`), `SEAM cannot see "${t}" — the detector is dead`).toBe(true);
  }
  expect(tokens.length, 'the control must exercise every alternative in SEAM').toBe(SEAM.source.split('|').length);
  // and it must not fire on innocent code, or every gate reds for the wrong reason
  expect(SEAM.test('const x = mesh.position.set(1, 2, 3);'), 'SEAM false-positives on innocent code').toBe(false);
  return tokens.length;
}
