import { loadTree, functionNamed, plainParamBinding, destructuredParamBinding, propagate } from './sourceFlow.js';

/**
 * The detector behind tests/scripts/capture-guards-ratchet.test.js: the capture GUARDS in src, per file, and the reads of
 * the flag at module scope.
 *
 * The flag is followed by scope, not by name (tests/_support/sourceFlow.js): the function is `isCaptureMode` as declared in
 * devtest/captureMode.js or imported under any local name, a namespace's `x.isCaptureMode`, a getter that returns the flag,
 * and a parameter or prop it was passed into; the value is a call of the function, a read of a store's `isCaptureMode`
 * field (`state.isCaptureMode`, `{ isCaptureMode: c } = state`), a selector call that returns it
 * (`useGameStore((s) => s.isCaptureMode)`), and any name bound to one of those.
 *
 * A GUARD is one place the flag decides something: an expression that reads it, with the operators around it (`!`, `&&`,
 * `||`, `===`, `typeof`) taken as one, so `typeof isCapture === 'function' && isCapture()` is one guard and
 * `paused={isCaptureMode}` is another. Not a guard: the definition of a name that holds the flag (the guards are that
 * name's uses), and a hand-off into a parameter or prop this follows (the guards are counted where it is used). A hand-off
 * into code it cannot follow (a library component's prop, an unresolved callee) counts as a guard where it leaves.
 */
const FLAG = 'isCaptureMode';
const CHAIN = new Set(['LogicalExpression', 'UnaryExpression', 'BinaryExpression']);

const memberName = (m) => (!m.node.computed ? m.node.property.name : (m.node.property.type === 'StringLiteral' ? m.node.property.value : null));
const isCalleeOf = (path) => (path.parentPath?.isCallExpression() || path.parentPath?.isOptionalCallExpression()) && path.parentPath.node.callee === path.node;

/** The expression a function returns: an arrow's expression body, or the one return of a block body. */
function returned(fnPath) {
  const body = fnPath.get('body');
  if (!body.isBlockStatement()) return body;
  const stmts = body.get('body');
  return stmts.length === 1 && stmts[0].isReturnStatement() ? stmts[0].get('argument') : null;
}

/** The guard a read belongs to: climb the operators around it, so one decision is one guard. */
function guardOf(path) {
  let p = isCalleeOf(path) ? path.parentPath : path;
  for (;;) {
    const parent = p.parentPath;
    if (!parent) return p;
    if (CHAIN.has(parent.node.type)) { p = parent; continue; }
    return p;
  }
}

/** @returns {{ perFile: Record<string, number>, sites: Array<{file: string, line: number}>, moduleScope: string[] }} */
export function captureGuards(tree) {
  const ctx = loadTree(tree);
  const kinds = new Map(); // binding -> 'flagFn' | 'flag'
  for (const mod of ctx.mods.values()) {
    for (const b of Object.values(mod.program.scope.bindings)) {
      if (b.path.isFunctionDeclaration() && b.identifier.name === FLAG) kinds.set(b, 'flagFn');
      if (b.kind === 'module' && b.path.isImportSpecifier() && (b.path.node.imported.name ?? b.path.node.imported.value) === FLAG) kinds.set(b, 'flagFn');
    }
    // `const { isCaptureMode: c } = ...` binds the flag whatever the object is: the field's name is the flag's.
    for (const d of mod.declarators) {
      if (d.node.id.type !== 'ObjectPattern') continue;
      for (const prop of d.get('id.properties')) {
        if (prop.isObjectProperty() && !prop.node.computed && (prop.node.key.name ?? prop.node.key.value) === FLAG && prop.get('value').isIdentifier()) {
          kinds.set(d.scope.getBinding(prop.node.value.name), 'flag');
        }
      }
    }
  }
  const classify = (c, mod, path) => {
    if (!path?.node) return null;
    if (path.isIdentifier()) return kinds.get(path.scope.getBinding(path.node.name)) ?? null;
    if (path.isMemberExpression() || path.isOptionalMemberExpression()) return memberName(path) === FLAG ? (isCalleeOf(path) ? 'flagFn' : 'flag') : null;
    if (path.isCallExpression() || path.isOptionalCallExpression()) {
      if (classify(c, mod, path.get('callee')) === 'flagFn') return 'flag';
      const a0 = path.get('arguments')[0];
      if ((a0?.isArrowFunctionExpression() || a0?.isFunctionExpression()) && classify(c, mod, returned(a0)) === 'flag') return 'flag'; // a selector
      return null;
    }
    if (path.isArrowFunctionExpression() || path.isFunctionExpression()) return classify(c, mod, returned(path)) === 'flag' ? 'flagFn' : null;
    return null;
  };
  propagate(ctx, classify, kinds);

  const perFile = {};
  const sites = [];
  const moduleScope = [];
  for (const mod of ctx.mods.values()) {
    const definitions = new Set(); // reads that define a name holding the flag: its uses are the guards
    for (const d of mod.declarators) {
      const init = d.get('init');
      if (!init.node) continue;
      if (d.node.id.type === 'ObjectPattern') {
        for (const prop of d.get('id.properties')) if (prop.isObjectProperty() && (prop.node.key.name ?? prop.node.key.value) === FLAG) definitions.add(prop.node.key);
        continue;
      }
      if (!kinds.has(d.scope.getBinding(d.node.id.name))) continue;
      // `= isCaptureMode()`, `= state.isCaptureMode`: the init itself. `= useGameStore((s) => s.isCaptureMode)`: the
      // selector's returned read. `= () => isCaptureMode()`: a getter's returned read (its calls are the guards).
      definitions.add(init.node);
      const fn = init.isCallExpression() ? init.get('arguments')[0] : init;
      if ((fn?.isArrowFunctionExpression() || fn?.isFunctionExpression()) && returned(fn)?.node) definitions.add(returned(fn).node);
    }
    /** A reference handed into a parameter, an object-argument property or a prop that this follows. */
    const followedHandOff = (path) => {
      const parent = path.parentPath;
      if (parent.isVariableDeclarator() && parent.node.init === path.node && parent.node.id.type === 'Identifier') return true;
      const callOf = (p, argNode) => ((p.isCallExpression() || p.isOptionalCallExpression()) && p.node.arguments.includes(argNode) ? p : null);
      let call = callOf(parent, path.node);
      if (call && call.get('callee').isIdentifier()) {
        const fn = functionNamed(ctx, mod, call.get('callee'), call.node.callee.name);
        if (fn && plainParamBinding(fn, call.node.arguments.indexOf(path.node))) return true;
      }
      if (parent.isObjectProperty() && parent.node.value === path.node && !parent.node.computed) {
        const obj = parent.parentPath;
        call = obj && callOf(obj.parentPath, obj.node);
        if (call && call.get('callee').isIdentifier()) {
          const fn = functionNamed(ctx, mod, call.get('callee'), call.node.callee.name);
          const key = parent.node.key.name ?? parent.node.key.value;
          if (fn && destructuredParamBinding(fn, call.node.arguments.indexOf(obj.node), key)) return true;
        }
      }
      if (parent.isJSXExpressionContainer() && parent.parentPath.isJSXAttribute()) {
        const el = parent.parentPath.parentPath;
        const name = el.get('name');
        const fn = name.isJSXIdentifier() && functionNamed(ctx, mod, el, name.node.name);
        if (fn && destructuredParamBinding(fn, 0, parent.parentPath.node.name.name)) return true;
      }
      return false;
    };
    const guards = new Set();
    const read = (path, isEvaluation) => {
      if (isEvaluation && !path.getFunctionParent()) moduleScope.push(`${mod.file}:${path.node.loc.start.line}`);
      if (definitions.has(path.node) || (isCalleeOf(path) && definitions.has(path.parentPath.node))) return;
      guards.add(guardOf(path).node);
    };
    for (const id of mod.identifiers) {
      if (!id.isReferencedIdentifier()) continue;
      const k = kinds.get(id.scope.getBinding(id.node.name));
      if (!k) continue;
      if (k === 'flagFn' && isCalleeOf(id)) { read(id, true); continue; }
      if (followedHandOff(id)) continue;
      read(id, false);
    }
    for (const m of mod.members) {
      if (memberName(m) !== FLAG) continue;
      if (!isCalleeOf(m) && followedHandOff(m)) continue;
      read(m, true);
    }
    for (const d of mod.declarators) {
      if (d.node.id.type !== 'ObjectPattern') continue;
      for (const prop of d.get('id.properties')) {
        if (prop.isObjectProperty() && (prop.node.key.name ?? prop.node.key.value) === FLAG && !d.getFunctionParent()) moduleScope.push(`${mod.file}:${prop.node.loc.start.line}`);
      }
    }
    for (const g of guards) sites.push({ file: mod.file, line: g.loc.start.line });
    if (guards.size) perFile[mod.file] = guards.size;
  }
  sites.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  return { perFile, sites, moduleScope: [...new Set(moduleScope)].sort() };
}
