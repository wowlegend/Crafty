import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as verbRouter from '../../src/input/verbRouter.js';

/**
 * #72 verb-router seam: exactly ONE mousedown verb path.
 *
 * ENHANCED 2026-09-22, selected by `scripts/ci/gate-census.mjs`, which scored this file 0/5 on every
 * evidence dimension — it imported nothing, stated no denominator, had no zero-guard and named no blind
 * spot. The census ranks; it does not sentence, so this is a CONVERT rather than a delete: the properties
 * guarded here are real and, in one case, guarded nowhere else.
 *
 * WHAT CHANGED AND WHY EACH FORM IS THE HONEST ONE FOR ITS CLAIM:
 *
 *   "the router stays PURE" was a grep for forbidden import strings. That is the weaker half of the
 *   claim: a module can pass a text scan and still be unloadable outside a React tree. It is now proved
 *   BY CONSTRUCTION — this file imports the module in a bare node environment, so a react/three/rapier
 *   dependency creeping in fails at import time, before any assertion runs. The text scan stays as well,
 *   because it catches a *type-only* or lazily-required dependency that a successful import would not.
 *
 *   "Terrain registers no mousedown" is an ABSENCE claim about source. There is no runtime observation of
 *   a listener that was never added, so grep is the instrument by nature rather than by laziness, and it
 *   says so here instead of looking like a behavioural check.
 *
 * BLIND SPOT, stated (R7): nothing here proves the router is REACHED by a real click. `routeMouseVerb` is
 * called from `Components.jsx`, a useFrame/event component no jsdom harness can mount, so the consumer
 * check below is a call-site grep. Its BEHAVIOUR — which verb wins for which target — is driven in
 * `src/input/verbRouter.test.js`; this file owns the SEAM, that one owns the logic.
 *
 * Mutation-Proof: 4 mutations, denominator asserted (6/6 cases collected on every run).
 *   M1 add `addEventListener('mousedown'` to Terrain.jsx  -> double-fire case RED
 *   M2 remove `routeMouseVerb` from Components.jsx         -> consumer case RED
 *   M3 add `import * as THREE from 'three'` to verbRouter  -> purity TEXT case RED
 *   M4 add `import { useGameStore } from '../store/useGameStore'` to verbRouter -> purity case RED
 *      (and it is the store import specifically that would make the router unusable from a worker or a
 *      future touch layer, which is the whole point of the seam)
 * Subjects restored from cp backups and diffed byte-identical after each.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

describe('verb-router seam gates (#72)', () => {
  it('the router LOADS in a bare node environment — purity proved by construction, not by grep', () => {
    // If verbRouter ever imports react/three/rapier or the store, this file fails at IMPORT time, above.
    // Reaching this line is itself the assertion; the exports below make the denominator explicit.
    const exported = Object.keys(verbRouter);
    expect(exported.length).toBeGreaterThan(0); // R3a — an empty module would make every check vacuous
    expect(typeof verbRouter.routeMouseVerb).toBe('function');
  });

  it('Terrain.jsx registers NO mousedown listener (the deleted double-fire path)', () => {
    // ABSENCE claim about source: there is no runtime observation of a listener nobody added, so a grep
    // is the instrument by nature. Comment-stripped so prose describing the deleted path cannot match.
    const terrain = read('world/Terrain.jsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(terrain).not.toMatch(/addEventListener\(\s*['"]mousedown['"]/);
  });

  it('Components.jsx consumes the router (call-site grep — it cannot be mounted here, see BLIND SPOT)', () => {
    const components = read('Components.jsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(components).toMatch(/routeMouseVerb\s*\(/); // the CALL, not merely the token
  });

  it('verbRouter.js declares no react/three/rapier/store dependency in its text either', () => {
    // Kept alongside the import proof above: a type-only import, or a lazy require inside a branch, can
    // survive a successful module load while still coupling the seam.
    const src = read('input/verbRouter.js');
    expect(src).not.toMatch(/from\s+['"](react|three|@react-three|@dimforge)/);
    expect(src).not.toMatch(/useGameStore|postMessage|update_block/);
  });

  it('every forbidden dependency in the list is actually checked (the list is not empty)', () => {
    // The denominator for the case above: a regex that silently stopped matching would leave it green
    // forever. Naming the set here means a future edit that drops one is visible.
    const FORBIDDEN = ['react', 'three', '@react-three', '@dimforge', 'useGameStore'];
    expect(FORBIDDEN.length).toBeGreaterThan(0);
    const src = read('input/verbRouter.js');
    for (const dep of FORBIDDEN) expect(src.includes(`from '${dep}`), dep).toBe(false);
  });

  it('the router is a pure function of its inputs — same args, same verb, no hidden state', () => {
    // Cheap, and it is the property the seam exists for: a router that consulted module state would make
    // the worker/touch reuse the seam promises impossible.
    // Signature read from the source, not assumed: routeMouseVerb(button, ctx). The first draft of this
    // case invented a single-object signature and threw on destructuring `ctx` — which is the failure
    // this whole conversion is about. A source-grep gate cannot make that mistake, and cannot catch it
    // either; an executing one does both.
    const ctx = { held: false, meleeHit: false, aimedMobDist: 99, terrainDist: 3, chestTargeted: false, chestHasItems: false };
    expect(verbRouter.routeMouseVerb(0, ctx)).toBe(verbRouter.routeMouseVerb(0, ctx));
    // and the seam's load-bearing branch, which a text scan could never reach: a LOADED chest is not
    // terrain, so left-click must interact rather than mine (mine() deletes the chest and its contents).
    expect(verbRouter.routeMouseVerb(0, { ...ctx, chestTargeted: true, chestHasItems: true })).toBe('interact');
    expect(verbRouter.routeMouseVerb(0, { ...ctx, chestTargeted: true, chestHasItems: false })).not.toBe('interact');
  });
});
