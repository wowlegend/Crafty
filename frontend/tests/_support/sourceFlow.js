import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';

/**
 * Where a value goes in src, read off the syntax tree with scopes resolved (@babel/traverse), for the two checks that
 * must follow one: tests/scripts/store-setters-called.test.js (which reads are reads of the STORE) and
 * tests/scripts/capture-guards-ratchet.test.js (which reads are reads of the capture flag, under any alias).
 *
 * A name alone says nothing: `body.setTranslation` is a Rapier body's method, and `frozenForCapture()` is the capture flag
 * if it was imported as `isCaptureMode as frozenForCapture`. So both checks bind a name to its declaration (the scope
 * that declares it, as the language resolves it) and carry a value's kind through the four ways it moves here: an alias
 * (`const s = x`), a call argument into the callee's parameter, a property of an object argument into the callee's
 * destructured parameter, and a JSX prop into the component's destructured props. The callee or component is followed
 * when it is declared in the same file or imported from a relative path in the tree. What it does NOT follow: a value
 * stored on an object and read back (`ctx.getState()` after `{ getState }` is put on `ctx`), a function reached through
 * a member call, and anything outside `src/`.
 */
const traverse = traverseModule.default ?? traverseModule;
const PARSE = { sourceType: 'module', plugins: ['jsx'] };

/** Resolve a relative specifier from `from` against the tree's files, trying the extensionless forms Vite accepts. */
export function resolveImport(from, spec, fileSet) {
  if (typeof spec !== 'string' || !spec.startsWith('.')) return null;
  const base = from.split('/').slice(0, -1);
  for (const part of spec.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') base.pop();
    else base.push(part);
  }
  const p = base.join('/');
  for (const c of [p, `${p}.js`, `${p}.jsx`, `${p}/index.js`, `${p}/index.jsx`]) if (fileSet.has(c)) return c;
  return null;
}

const isFn = (p) => p && (p.isFunctionDeclaration() || p.isFunctionExpression() || p.isArrowFunctionExpression());

/** The function a binding names: a declaration, a const bound to one, or a const bound to `wrap(function ...)` (memo). */
function functionOfBinding(binding) {
  if (!binding) return null;
  const p = binding.path;
  if (p.isFunctionDeclaration()) return p;
  if (p.isVariableDeclarator()) {
    const init = p.get('init');
    if (isFn(init)) return init;
    if (init.isCallExpression()) {
      const a0 = init.get('arguments')[0];
      if (isFn(a0)) return a0;
    }
  }
  return null;
}

/** Parse each file once: its program path, its exports (name -> binding) and the paths the analyses visit. */
export function loadTree(tree) {
  const fileSet = new Set(tree.map((f) => f.file));
  const mods = new Map();
  for (const { file, text } of tree) {
    const mod = { file, program: null, exports: new Map(), declarators: [], calls: [], jsx: [], members: [], identifiers: [] };
    traverse(parse(text, PARSE), {
      Program(p) { mod.program = p; },
      VariableDeclarator(p) { mod.declarators.push(p); },
      'CallExpression|OptionalCallExpression'(p) { mod.calls.push(p); },
      JSXOpeningElement(p) { mod.jsx.push(p); },
      'MemberExpression|OptionalMemberExpression'(p) { mod.members.push(p); },
      Identifier(p) { mod.identifiers.push(p); },
    });
    const scope = mod.program.scope;
    for (const st of mod.program.get('body')) {
      if (st.isExportNamedDeclaration()) {
        const d = st.get('declaration');
        if (d.isFunctionDeclaration() && d.node.id) mod.exports.set(d.node.id.name, scope.getBinding(d.node.id.name));
        if (d.isVariableDeclaration()) for (const v of d.node.declarations) if (v.id.type === 'Identifier') mod.exports.set(v.id.name, scope.getBinding(v.id.name));
        for (const s of st.node.specifiers || []) if (s.type === 'ExportSpecifier' && !st.node.source) mod.exports.set(s.exported.name ?? s.exported.value, scope.getBinding(s.local.name));
      } else if (st.isExportDefaultDeclaration()) {
        const d = st.get('declaration');
        if (d.isFunctionDeclaration() && d.node.id) mod.exports.set('default', scope.getBinding(d.node.id.name));
        else if (d.isIdentifier()) mod.exports.set('default', scope.getBinding(d.node.name));
        else if (isFn(d)) mod.exports.set('default', { path: d, synthetic: true });
      }
    }
    mods.set(file, mod);
  }
  return { mods, fileSet };
}

/** The import a binding came from, resolved: { file, name } (name is 'default' or the imported name), or null. */
export function importOf(mod, binding, fileSet) {
  if (!binding || binding.kind !== 'module') return null;
  const spec = binding.path;
  const decl = spec.parentPath;
  if (!decl?.isImportDeclaration()) return null;
  const file = resolveImport(mod.file, decl.node.source.value, fileSet);
  if (!file) return null;
  if (spec.isImportDefaultSpecifier()) return { file, name: 'default' };
  if (spec.isImportSpecifier()) return { file, name: spec.node.imported.name ?? spec.node.imported.value };
  return { file, name: '*' };
}

/** The function an identifier path calls or mounts: one declared in its file, or an export of a file it imports. */
export function functionNamed(ctx, mod, path, name) {
  const binding = path.scope.getBinding(name);
  if (!binding) return null;
  const own = functionOfBinding(binding);
  if (own) return own;
  const imp = importOf(mod, binding, ctx.fileSet);
  if (!imp) return null;
  const target = ctx.mods.get(imp.file)?.exports.get(imp.name);
  if (!target) return null;
  return target.synthetic ? target.path : functionOfBinding(target);
}

/** A function value at `path`: inline, or an identifier bound to one (in this file or imported). */
export function asFunction(ctx, mod, path) {
  if (!path?.node) return null;
  if (isFn(path)) return path;
  if (path.isIdentifier()) return functionNamed(ctx, mod, path, path.node.name);
  return null;
}

/** The binding a parameter (or a destructured property of it) declares. */
function paramBinding(fnPath, param) {
  let p = param;
  if (p?.isAssignmentPattern()) p = p.get('left');
  return p?.isIdentifier() ? fnPath.scope.getBinding(p.node.name) : null;
}

/** The binding for property `key` of the function's destructured parameter at `index` (`function f({ key })`). */
export function destructuredParamBinding(fnPath, index, key) {
  let p = fnPath.get('params')[index];
  if (p?.isAssignmentPattern()) p = p.get('left');
  if (!p?.isObjectPattern()) return null;
  for (const prop of p.get('properties')) {
    if (!prop.isObjectProperty() || prop.node.computed) continue;
    const k = prop.node.key.type === 'Identifier' ? prop.node.key.name : prop.node.key.value;
    if (k === key) return paramBinding(fnPath, prop.get('value'));
  }
  return null;
}

/** The binding of the function's parameter at `index`, when it is a plain name. */
export function plainParamBinding(fnPath, index) {
  return paramBinding(fnPath, fnPath.get('params')[index]);
}

/** The function's parameter at `index` as a path (unwrapping a default), or null. */
export function paramAt(fnPath, index) {
  let p = fnPath.get('params')[index];
  if (p?.isAssignmentPattern()) p = p.get('left');
  return p?.node ? p : null;
}

/**
 * Carry kinds to a fixpoint. `classify(ctx, mod, path)` names the kind of the value at an expression path, or null;
 * `kinds` maps a binding to its kind. Each round: a declarator takes its init's kind; a call's argument gives its kind to
 * the callee's parameter, and an object argument's properties to its destructured parameter; a JSX prop gives its kind to
 * the component's destructured props. `extra(ctx, mod, call, setKind)` adds the analysis' own rules per call.
 */
export function propagate(ctx, classify, kinds, extra) {
  let changed = true;
  let rounds = 0;
  const setKind = (binding, k) => {
    if (binding && k && !kinds.has(binding)) { kinds.set(binding, k); changed = true; }
  };
  while (changed && rounds < 20) {
    changed = false;
    rounds++;
    for (const mod of ctx.mods.values()) {
      for (const d of mod.declarators) {
        if (d.node.id.type !== 'Identifier' || !d.node.init) continue;
        setKind(d.scope.getBinding(d.node.id.name), classify(ctx, mod, d.get('init')));
      }
      for (const c of mod.calls) {
        extra?.(ctx, mod, c, setKind);
        const callee = c.get('callee');
        if (!callee.isIdentifier()) continue;
        const fn = functionNamed(ctx, mod, callee, callee.node.name);
        if (!fn) continue;
        c.get('arguments').forEach((arg, i) => {
          const k = classify(ctx, mod, arg);
          if (k) setKind(plainParamBinding(fn, i), k);
          if (arg.isObjectExpression()) {
            for (const prop of arg.get('properties')) {
              if (!prop.isObjectProperty() || prop.node.computed) continue;
              const key = prop.node.key.type === 'Identifier' ? prop.node.key.name : prop.node.key.value;
              setKind(destructuredParamBinding(fn, i, key), classify(ctx, mod, prop.get('value')));
            }
          }
        });
      }
      for (const el of mod.jsx) {
        const name = el.get('name');
        if (!name.isJSXIdentifier()) continue;
        const fn = functionNamed(ctx, mod, el, name.node.name);
        if (!fn) continue;
        for (const attr of el.get('attributes')) {
          if (!attr.isJSXAttribute() || !attr.get('value').isJSXExpressionContainer()) continue;
          setKind(destructuredParamBinding(fn, 0, attr.node.name.name), classify(ctx, mod, attr.get('value.expression')));
        }
      }
    }
  }
  return rounds;
}
