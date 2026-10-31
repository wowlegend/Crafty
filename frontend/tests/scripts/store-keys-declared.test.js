import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { readSourceTree } from '../_support/primitiveCallSites.js';
import { SETTINGS_DEFAULTS } from '../../src/game/settingsPersist.js';

/**
 * EVERY KEY WRITTEN TO THE STORE IS DECLARED IN IT (deep audit 2026-10-30, lane L3; AUDIT:debt:three-call-channels-dead-wires).
 *
 * A key set with setState but absent from the store's initial state is invisible to getInitialState(), so a new world
 * (startNewWorld builds from it) and a failed boot (worldBoot.js replaces the state with it) keep the old value, and its
 * callers guard it with `?.()`, so a missing publisher is a silent no-op. `shrineReached` was one: the HUD objective
 * read it, and nothing reset it. The count of such keys is 0 and stays 0.
 *
 * SITED IN tests/scripts/, not tests/gates/: the subject is the source's shape (which keys the code writes), so the
 * check must read source by its nature, and gate-shape freezes the source-reading population in tests/gates/. It does
 * not grep: every file under src is parsed with @babel/parser and the writes are read from the syntax tree, so a comment
 * or a string naming a key cannot satisfy or trip it. A store write is a call of `<x>.setState(...)` (not `this.`, which
 * is a React class component's own state), a bare `setState(...)` (an injected store setter, input/primaryInput.js),
 * or `set(...)` inside the store's create(). Its keys are an object literal's, an updater's returned literals, or both
 * branches of a conditional. Anything else is UNRESOLVED and must be one of the two sites this file resolves by their
 * own tables; a new one turns this red until it is written as a literal or resolved here.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, receipts in the commit.
 */
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const STORE_FILE = 'src/store/useGameStore.jsx';
const PARSE = { sourceType: 'module', plugins: ['jsx'] };
const SKIP = new Set(['loc', 'start', 'end', 'extra', 'range', 'leadingComments', 'trailingComments', 'innerComments']);

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

const keyName = (p) => (p.computed ? null : p.key.type === 'Identifier' ? p.key.name : p.key.type === 'StringLiteral' ? p.key.value : null);

/** The keys the store's create() object declares. */
export function declaredKeys(storeText) {
  const ast = parse(storeText, PARSE);
  let obj = null;
  walk(ast.program, (n) => {
    if (obj || n.type !== 'CallExpression' || n.callee.type !== 'Identifier' || n.callee.name !== 'create') return;
    const fn = n.arguments[0];
    if (fn && fn.type === 'ArrowFunctionExpression' && fn.body.type === 'ObjectExpression') obj = fn.body;
  });
  if (!obj) throw new Error('the store has no create((set, get) => ({ ... })) object');
  const keys = new Set();
  for (const p of obj.properties) {
    const k = p.type === 'ObjectProperty' || p.type === 'ObjectMethod' ? keyName(p) : null;
    if (k === null) throw new Error(`the store's object holds a member this check cannot name (line ${p.loc.start.line})`);
    keys.add(k);
  }
  return keys;
}

// The returned object literals of an updater, not counting returns inside functions nested in it.
function returnedValues(fn) {
  if (fn.body.type !== 'BlockStatement') return [fn.body];
  const out = [];
  walk(fn.body, (n, parents) => {
    if (n.type !== 'ReturnStatement') return;
    const nested = parents.some((p) => p !== fn.body && /Function/.test(p.type));
    if (!nested) out.push(n.argument);
  });
  return out;
}

// A `const name = { ... }` in the function around the call, and every `Object.assign(name, { ... })` in it: the patch a
// reducer builds up before it calls set(name) (store buyForgeOffer). Null when the name is bound any other way.
function builtPatch(name, parents) {
  const fn = [...parents].reverse().find((p) => /Function/.test(p.type));
  if (!fn) return null;
  let init = null;
  const assigned = [];
  walk(fn.body, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === name) init = n.init;
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.name === 'Object'
      && n.callee.property.name === 'assign' && n.arguments[0]?.type === 'Identifier' && n.arguments[0].name === name) {
      assigned.push(...n.arguments.slice(1));
    }
  });
  return init && init.type === 'ObjectExpression' ? [init, ...assigned] : null;
}

/**
 * The keys `node` writes, into `into`; what cannot be named, into `unresolved`. `scope` carries the updater's state
 * parameter (returning it unchanged writes nothing) and the call's ancestors (for a patch built in the reducer).
 */
function keysOf(node, into, unresolved, scope) {
  if (!node) { unresolved.push(null); return; }
  if (node.type === 'ObjectExpression') {
    for (const p of node.properties) {
      if (p.type === 'SpreadElement') { keysOf(p.argument, into, unresolved, scope); continue; }
      const k = p.type === 'ObjectProperty' ? keyName(p) : null;
      if (k === null) unresolved.push(p); else into.push(k);
    }
  } else if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
    const param = node.params[0]?.type === 'Identifier' ? node.params[0].name : null;
    for (const r of returnedValues(node)) keysOf(r, into, unresolved, { ...scope, param });
  } else if (node.type === 'ConditionalExpression') {
    keysOf(node.consequent, into, unresolved, scope);
    keysOf(node.alternate, into, unresolved, scope);
  } else if (node.type === 'Identifier' && node.name === scope.param) {
    // The updater hands the state back unchanged: no key written.
  } else if (node.type === 'Identifier' && builtPatch(node.name, scope.parents)) {
    for (const part of builtPatch(node.name, scope.parents)) keysOf(part, into, unresolved, scope);
  } else {
    unresolved.push(node);
  }
}

/**
 * Every store write in one file: { line, keys, unresolved: [source text] }.
 * @param {string} file the path relative to the app dir
 * @param {string} text the file's source
 */
export function storeWrites(file, text) {
  const ast = parse(text, PARSE);
  const sites = [];
  walk(ast.program, (n, parents) => {
    if (n.type !== 'CallExpression') return;
    const c = n.callee;
    const isMember = c.type === 'MemberExpression' && !c.computed && c.property.name === 'setState' && c.object.type !== 'ThisExpression';
    const isBare = c.type === 'Identifier' && c.name === 'setState';
    const isStoreSet = file === STORE_FILE && c.type === 'Identifier' && c.name === 'set';
    if (!isMember && !isBare && !isStoreSet) return;
    const keys = [];
    const unresolved = [];
    keysOf(n.arguments[0], keys, unresolved, { param: null, parents });
    sites.push({ line: n.loc.start.line, keys, unresolved: unresolved.map((u) => (u ? text.slice(u.start, u.end) : '<no argument>')) });
  });
  return sites;
}

// The two writes whose keys are not a literal, each resolved by its own table: the settings hydrate writes only keys
// SETTINGS_DEFAULTS names (game/settingsPersist.js sanitizeSettings), and a failed boot replaces the state with the
// store's own initial state, which is the declared set by construction.
const RESOLVED_BY_TABLE = Object.freeze({
  'src/game/settingsPersist.js|loaded': () => Object.keys(SETTINGS_DEFAULTS),
  'src/game/worldBoot.js|store.getInitialState()': (declared) => [...declared],
});

function audit(tree, declared) {
  const undeclared = [];
  const unknown = [];
  let sites = 0;
  let written = 0;
  const seen = new Set();
  for (const { file, text } of tree) {
    for (const site of storeWrites(file, text)) {
      sites++;
      const keys = [...site.keys];
      for (const u of site.unresolved) {
        const table = RESOLVED_BY_TABLE[`${file}|${u}`];
        if (table) keys.push(...table(declared)); else unknown.push(`${file}:${site.line} ${u}`);
      }
      for (const k of keys) {
        written++;
        seen.add(k);
        if (!declared.has(k)) undeclared.push(`${k} (${file}:${site.line})`);
      }
    }
  }
  return { undeclared, unknown, sites, written, seen };
}

describe('every key written to the store is declared in its initial state', () => {
  const declared = declaredKeys(readFileSync(resolve(APP, STORE_FILE), 'utf8'));
  const tree = readSourceTree();
  const result = audit(tree, declared);

  it('the instrument sees: the store, the source tree and the writes in both', () => {
    // Floors under the counts at 8579918e (255 declared keys, 408 files, 190 write sites, 554 keys written).
    expect(declared.size, 'the store declares almost nothing: the create() object was not found whole').toBeGreaterThan(200);
    expect(tree.length, 'the source tree came back short').toBeGreaterThan(300);
    expect(result.sites, 'the scan found almost no store writes').toBeGreaterThan(150);
    expect(result.written, 'the scan read almost no keys').toBeGreaterThan(400);
    // A write inside the store (set), one outside it (useGameStore.setState in a system) and one through an injected
    // setter (input/primaryInput.js), each seen.
    expect(result.seen.has('bossHealth'), 'the store\'s own set() writes were not read').toBe(true);
    expect(result.seen.has('debugChunks'), 'a system\'s useGameStore.setState writes were not read').toBe(true);
    expect(result.seen.has('pressPrimary'), 'an injected setState\'s writes were not read').toBe(true);
    // And each table resolved: every settings dial reached the count.
    expect(Object.keys(SETTINGS_DEFAULTS).filter((k) => !result.seen.has(k)), 'the settings hydrate was not resolved').toEqual([]);
  });

  it('a write the check cannot read is not let through', () => {
    expect(result.unknown, 'store writes whose keys this check cannot name: write them as a literal').toEqual([]);
  });

  it('no key is written that the store does not declare', () => {
    expect(result.undeclared, 'keys written with setState that useGameStore.jsx never declares').toEqual([]);
  });

  it('the detector, on a file it is handed, names an undeclared key, an updater\'s keys and an unreadable write', () => {
    const fixture = [
      'useGameStore.setState({ bossHealth: 1, notAKey: 2 });',
      'useGameStore.setState((s) => (s.x ? { alsoNot: 1 } : { bossActive: true }));',
      'store.setState(patch);',
      'this.setState({ classState: 1 });',
      '// useGameStore.setState({ inAComment: 1 });',
      'useGameStore.setState((s) => (s.ok ? s : { ...(s.y ? { spreadNot: 1 } : {}), ...other }));',
      'function f() { const p = { coins: 1 }; Object.assign(p, { builtNot: 2 }); setState(p); }',
      "const t = 'useGameStore.setState({ inAString: 1 })';",
    ].join('\n');
    const r = audit([{ file: 'src/fixture.js', text: fixture }], declared);
    expect(r.undeclared).toEqual([
      'notAKey (src/fixture.js:1)', 'alsoNot (src/fixture.js:2)', 'spreadNot (src/fixture.js:6)', 'builtNot (src/fixture.js:7)',
    ]);
    expect(r.unknown).toEqual(['src/fixture.js:3 patch', 'src/fixture.js:6 other']);
    expect(r.sites).toBe(5);
  });
});
