import { parse } from '@babel/parser';
import { loadTree, importOf, asFunction, plainParamBinding, paramAt, propagate } from './sourceFlow.js';

/**
 * The detector behind tests/scripts/store-setters-called.test.js, apart from it so a script can run it over another
 * tree (the red-first run reads the tree before lane L6 removed 13 setters). Reads the syntax tree: a comment or a template
 * text naming a setter is not a use.
 *
 * A use is a read of the setter as a member of the STORE, not of anything with a member of that name: `body.setTranslation`
 * is a Rapier body's method and keeps no store setter alive. What holds the store is followed from the store's own export
 * (tests/_support/sourceFlow.js says how a value is followed):
 *  - the hook: the `create(...)` export, imported anywhere under any name, or read as `<x>.useGameStore` (window's);
 *  - the state: `hook.getState()`, `hook()` with no selector, `get()` in the store, a selector's first parameter
 *    (`hook((s) => s.setX)`, `hook(useShallow(sel))`, `hook.subscribe(sel, ...)`), the first parameter of a `set(fn)` updater;
 *  - a function that returns the state: `hook.getState`, `get`, `() => hook.getState()`.
 * Each moves by alias, call argument, object-argument property and JSX prop, and a use is `state.setX`, `state?.setX`,
 * `state['setX']` or `const { setX } = state` (a selector or callee that destructures its state parameter included).
 */
export const STORE_FILE = 'src/store/useGameStore.jsx';
const PARSE = { sourceType: 'module', plugins: ['jsx'] };

/** The store's create(...) call path and the name it is exported as. */
function storeExport(mod) {
  for (const d of mod.declarators) {
    if (d.node.id.type !== 'Identifier') continue;
    let init = d.get('init');
    if (init.isCallExpression() && init.get('callee').isCallExpression()) init = init.get('callee'); // create()(fn), curried
    if (init.isCallExpression() && init.get('callee').isIdentifier({ name: 'create' })) {
      const call = d.get('init');
      return { name: d.node.id.name, binding: d.scope.getBinding(d.node.id.name), callback: call.get('arguments')[0] };
    }
  }
  throw new Error('the store has no `export const x = create((set, get) => ({ ... }))`');
}

/** The `set*` function members of the store's create((set, get) => ({ ... })) object: [{ name, line }]. */
function declaredSetters(storeText) {
  const program = parse(storeText, PARSE).program;
  let obj = null;
  const visit = (n) => {
    if (obj || !n || typeof n.type !== 'string') return;
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'create') {
      const fn = n.arguments[0];
      if (fn && fn.type === 'ArrowFunctionExpression' && fn.body.type === 'ObjectExpression') { obj = fn.body; return; }
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k.endsWith('Comments')) continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v);
    }
  };
  visit(program);
  if (!obj) throw new Error('the store has no create((set, get) => ({ ... })) object');
  const out = [];
  for (const p of obj.properties) {
    const isFnMember = p.type === 'ObjectMethod' || (p.type === 'ObjectProperty' && /^(Arrow)?FunctionExpression$/.test(p.value.type));
    const name = !p.computed && p.key?.type === 'Identifier' ? p.key.name : null;
    if (isFnMember && name && /^set[A-Z]/.test(name)) out.push({ name, line: p.loc.start.line });
  }
  return out;
}

const keyOf = (prop) => (prop.node.key.type === 'Identifier' ? prop.node.key.name : prop.node.key.value);

/** The setters the store declares that nothing in `tree` uses as a member of the store, with the tree's size for the denominator. */
export function deadSetters(tree, storeText) {
  const setters = declaredSetters(storeText);
  const names = new Set(setters.map((s) => s.name));
  const ctx = loadTree([...tree.filter((f) => f.file !== STORE_FILE), { file: STORE_FILE, text: storeText }]);
  const storeMod = ctx.mods.get(STORE_FILE);
  const exp = storeExport(storeMod);
  const kinds = new Map(); // binding -> 'hook' | 'state' | 'stateFn' | 'setFn'
  kinds.set(exp.binding, 'hook');
  const cb = exp.callback;
  if (cb?.isArrowFunctionExpression() || cb?.isFunctionExpression()) {
    const setB = plainParamBinding(cb, 0);
    const getB = plainParamBinding(cb, 1);
    if (setB) kinds.set(setB, 'setFn');
    if (getB) kinds.set(getB, 'stateFn');
  }
  for (const mod of ctx.mods.values()) {
    for (const b of Object.values(mod.program.scope.bindings)) {
      const imp = importOf(mod, b, ctx.fileSet);
      if (imp && imp.file === STORE_FILE && imp.name === exp.name) kinds.set(b, 'hook');
    }
  }

  const classify = (c, mod, path) => {
    if (!path?.node) return null;
    if (path.isIdentifier()) return kinds.get(path.scope.getBinding(path.node.name)) ?? null;
    if ((path.isMemberExpression() || path.isOptionalMemberExpression()) && !path.node.computed) {
      const prop = path.node.property.name;
      if (prop === exp.name) return 'hook';
      if (prop === 'getState' && classify(c, mod, path.get('object')) === 'hook') return 'stateFn';
      return null;
    }
    if (path.isCallExpression() || path.isOptionalCallExpression()) {
      const k = classify(c, mod, path.get('callee'));
      if (k === 'stateFn') return 'state';
      if (k === 'hook' && path.node.arguments.length === 0) return 'state';
      return null;
    }
    if (path.isArrowFunctionExpression() || path.isFunctionExpression()) {
      const body = path.get('body');
      if (!body.isBlockStatement()) return classify(c, mod, body) === 'state' ? 'stateFn' : null;
      const stmts = body.get('body');
      if (stmts.length === 1 && stmts[0].isReturnStatement()) return classify(c, mod, stmts[0].get('argument')) === 'state' ? 'stateFn' : null;
    }
    return null;
  };

  const used = new Set();
  const creditPattern = (pattern) => {
    for (const prop of pattern.get('properties')) if (prop.isObjectProperty() && !prop.node.computed && names.has(keyOf(prop))) used.add(keyOf(prop));
  };
  /** A selector or updater: its first parameter is the state. */
  const stateParam = (fn, setKind) => {
    if (!fn) return;
    const p = paramAt(fn, 0);
    if (p?.isIdentifier()) setKind(fn.scope.getBinding(p.node.name), 'state');
    else if (p?.isObjectPattern()) creditPattern(p);
  };
  const selectorOf = (c, mod, arg) => {
    if (arg?.isCallExpression()) return asFunction(c, mod, arg.get('arguments')[0]); // useShallow(sel)
    return asFunction(c, mod, arg);
  };
  propagate(ctx, classify, kinds, (c, mod, call, setKind) => {
    const callee = call.get('callee');
    const k = classify(c, mod, callee);
    const subscribe = (callee.isMemberExpression() && !callee.node.computed && callee.node.property.name === 'subscribe'
      && classify(c, mod, callee.get('object')) === 'hook');
    if (k === 'hook' || subscribe || k === 'setFn') stateParam(selectorOf(c, mod, call.get('arguments')[0]), setKind);
  });

  for (const mod of ctx.mods.values()) {
    for (const m of mod.members) {
      const p = m.node.property;
      const name = !m.node.computed && p.type === 'Identifier' ? p.name : (m.node.computed && p.type === 'StringLiteral' ? p.value : null);
      if (name && names.has(name) && classify(ctx, mod, m.get('object')) === 'state') used.add(name);
    }
    for (const d of mod.declarators) if (d.node.id.type === 'ObjectPattern' && classify(ctx, mod, d.get('init')) === 'state') creditPattern(d.get('id'));
  }
  const dead = setters.filter((s) => !used.has(s.name)).map((s) => s.name);
  const live = setters.filter((s) => used.has(s.name)).map((s) => s.name);
  return { setters: setters.map((s) => s.name), dead, live, files: tree.length };
}
