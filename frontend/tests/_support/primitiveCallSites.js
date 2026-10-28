import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

/**
 * Where the className-override gate gets its CALL SITES and its STYLESHEET.
 *
 * This lives outside tests/gates/ for the reason hudCallSites.js gives: reading source to build a denominator is a
 * different act from asserting on source text. The gate decides every conflict by rendering the real primitive and
 * cascading the rules Tailwind compiles from the app's own stylesheet; the text read here only says which call sites
 * exist and which values each attribute can take.
 *
 * Resolved statically: string and template literals, ternaries and `&&` (enumerated jointly, so two attributes driven
 * by the same condition are never paired across branches), `||` / `??` (both sides), `+` concatenation, and an
 * identifier bound by a `const` in the same file. Everything else is reported, never dropped: a template
 * interpolation becomes the token DYNAMIC, an unresolvable class-driving prop falls back to every literal value that
 * prop takes anywhere in the tree, and a primitive used other than as a JSX element is listed as a reference.
 */
const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = join(APP, 'src');
const PRIMITIVES_DIR = join(SRC, 'ui', 'primitives');

export const DYNAMIC = '§DYNAMIC§';
const MAX_ENVS = 64;

/** Every non-test .js/.jsx file under src, as { file (relative to the app dir), text }. */
export function readSourceTree(dir = SRC, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) readSourceTree(full, out);
    else if (/\.jsx?$/.test(name) && !name.includes('.test.')) out.push({ file: relative(APP, full), text: readFileSync(full, 'utf8') });
  }
  return out;
}

// The order index.jsx imports them (index.css, then fonts.css), then App.css, which App.jsx imports after.
export const STYLESHEET_ORDER = ['src/index.css', 'src/theme/fonts.css', 'src/App.css'];

/** The app's stylesheet sources in import order, plus every .css file under src so the gate can see a new one. */
export function readStylesheet() {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.css')) found.push(relative(APP, full));
    }
  };
  walk(SRC);
  return { css: STYLESHEET_ORDER.map((p) => readFileSync(join(APP, p), 'utf8')).join('\n'), found };
}

function primitiveModule(fromFile, source) {
  if (!source.startsWith('.')) return null;
  const target = resolve(APP, dirname(fromFile), source).replace(/\.jsx?$/, '');
  if (target === PRIMITIVES_DIR || target === join(PRIMITIVES_DIR, 'index')) return '*';
  if (dirname(target) === PRIMITIVES_DIR) return target.slice(PRIMITIVES_DIR.length + 1);
  return null;
}

const SKIP_KEYS = new Set(['loc', 'start', 'end', 'extra', 'range', 'leadingComments', 'trailingComments', 'innerComments']);
function walk(node, parent, key, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, parent, key);
  for (const k of Object.keys(node)) {
    if (SKIP_KEYS.has(k)) continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, node, k, fn); }
    else if (v && typeof v.type === 'string') walk(v, node, k, fn);
  }
}

function values(node, ctx, env, depth = 0) {
  if (!node) return { vals: [undefined], unknown: [] };
  if (depth > 12) return { vals: [undefined], unknown: ['nesting too deep'] };
  const key = (n) => ctx.text.slice(n.start, n.end);
  const next = (n, e = env) => values(n, ctx, e, depth + 1);
  switch (node.type) {
    case 'StringLiteral': case 'NumericLiteral': case 'BooleanLiteral': return { vals: [node.value], unknown: [] };
    case 'NullLiteral': return { vals: [null], unknown: [] };
    case 'JSXExpressionContainer': return next(node.expression);
    case 'JSXEmptyExpression': return { vals: [undefined], unknown: [] };
    case 'TemplateLiteral': {
      let acc = ['']; const unknown = [];
      node.quasis.forEach((q, i) => {
        acc = acc.map((a) => a + q.value.cooked);
        if (i < node.expressions.length) {
          const r = next(node.expressions[i]);
          const parts = r.unknown.length ? [` ${DYNAMIC} `] : r.vals.map((v) => (v == null || v === false ? '' : String(v)));
          unknown.push(...r.unknown);
          acc = acc.flatMap((a) => parts.map((p) => a + p)).slice(0, 256);
        }
      });
      return { vals: acc, unknown };
    }
    case 'ConditionalExpression': {
      const k = key(node.test);
      if (k in env) return next(env[k] ? node.consequent : node.alternate);
      const a = next(node.consequent), b = next(node.alternate);
      return { vals: [...a.vals, ...b.vals], unknown: [...a.unknown, ...b.unknown] };
    }
    case 'LogicalExpression': {
      const r = next(node.right);
      if (node.operator === '&&') {
        const k = key(node.left);
        if (k in env) return env[k] ? r : { vals: [false], unknown: [] };
        return { vals: [false, ...r.vals], unknown: r.unknown };
      }
      const l = next(node.left);
      return { vals: [...l.vals, ...r.vals], unknown: [...l.unknown, ...r.unknown] };
    }
    case 'BinaryExpression': {
      if (node.operator !== '+') return { vals: [undefined], unknown: [`operator ${node.operator}`] };
      const l = next(node.left), r = next(node.right);
      return { vals: l.vals.flatMap((a) => r.vals.map((b) => `${a ?? ''}${b ?? ''}`)).slice(0, 256), unknown: [...l.unknown, ...r.unknown] };
    }
    case 'Identifier': {
      if (node.name === 'undefined') return { vals: [undefined], unknown: [] };
      const inits = ctx.consts.get(node.name);
      if (!inits) return { vals: [undefined], unknown: [`identifier ${node.name}`] };
      const rs = inits.map((n) => next(n, {}));
      return { vals: rs.flatMap((r) => r.vals), unknown: rs.flatMap((r) => r.unknown) };
    }
    default: return { vals: [undefined], unknown: [`${node.type} ${key(node).slice(0, 60)}`] };
  }
}

/**
 * Every JSX call site of a primitive in `files` ({ file, text }[]), for the primitives named in `attrsByPrimitive`
 * (primitive -> the class-driving attribute names to resolve; className is always resolved).
 *
 * Returns { sites, references, filesScanned }. A site is { file, line, prim, spread, envs, unresolved }; each env is
 * one joint assignment of the conditions its attributes test: { props: { name: values[] }, classNames: string[] }.
 */
export function scanPrimitiveCallSites(files, attrsByPrimitive) {
  const wanted = new Set(Object.keys(attrsByPrimitive));
  const sites = [];
  const references = [];
  let filesScanned = 0;
  for (const { file, text } of files) {
    filesScanned++;
    const ast = parse(text, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true });
    const local = new Map();
    const namespaces = new Set();
    const consts = new Map();
    for (const st of ast.program.body) {
      if (st.type !== 'ImportDeclaration') continue;
      const mod = primitiveModule(file, st.source.value);
      if (!mod) continue;
      for (const s of st.specifiers) {
        if (s.type === 'ImportNamespaceSpecifier' && mod === '*') namespaces.add(s.local.name);
        else if (s.type === 'ImportSpecifier' && wanted.has(s.imported.name) && (mod === '*' || mod === s.imported.name)) local.set(s.local.name, s.imported.name);
      }
    }
    if (!local.size && !namespaces.size) continue;
    walk(ast.program, null, null, (n) => {
      if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
        if (!consts.has(n.id.name)) consts.set(n.id.name, []);
        consts.get(n.id.name).push(n.init);
      }
    });
    const ctx = { text, consts };
    walk(ast.program, null, null, (n, parent, key) => {
      if (n.type === 'Identifier' && local.has(n.name)) {
        const isImport = parent && (parent.type === 'ImportSpecifier');
        const isPropertyName = parent && !parent.computed && ((parent.type === 'MemberExpression' && key === 'property') || (parent.type === 'ObjectProperty' && key === 'key' && !parent.shorthand));
        if (!isImport && !isPropertyName) references.push(`${file}:${n.loc.start.line} ${n.name} used as a value`);
        return;
      }
      if (n.type !== 'JSXOpeningElement') return;
      let prim = null;
      if (n.name.type === 'JSXIdentifier') prim = local.get(n.name.name) ?? null;
      else if (n.name.type === 'JSXMemberExpression' && n.name.object.type === 'JSXIdentifier' && namespaces.has(n.name.object.name) && wanted.has(n.name.property.name)) prim = n.name.property.name;
      if (!prim) return;
      const names = [...attrsByPrimitive[prim], 'className'];
      const attrs = new Map();
      let spread = false;
      for (const a of n.attributes) {
        if (a.type === 'JSXSpreadAttribute') { spread = true; continue; }
        if (a.name.type === 'JSXIdentifier' && names.includes(a.name.name)) attrs.set(a.name.name, a);
      }
      const tests = new Set();
      for (const a of attrs.values()) {
        if (!a.value) continue;
        walk(a.value, null, null, (q) => {
          if (q.type === 'ConditionalExpression') tests.add(text.slice(q.test.start, q.test.end));
          if (q.type === 'LogicalExpression' && q.operator === '&&') tests.add(text.slice(q.left.start, q.left.end));
        });
      }
      let envs = [{}];
      for (const t of tests) {
        if (envs.length * 2 > MAX_ENVS) break;
        envs = envs.flatMap((e) => [{ ...e, [t]: true }, { ...e, [t]: false }]);
      }
      const unresolved = new Set();
      const siteEnvs = envs.map((env) => {
        const props = {};
        let classNames = [''];
        for (const name of names) {
          const a = attrs.get(name);
          let r;
          if (!a) r = { vals: [undefined], unknown: [] };
          else if (!a.value) r = { vals: [true], unknown: [] };
          else r = values(a.value, ctx, env);
          for (const u of r.unknown) unresolved.add(`${name}: ${u}`);
          if (name === 'className') classNames = [...new Set(r.vals.map((v) => (typeof v === 'string' ? v : '')))];
          else props[name] = r.unknown.length ? null : [...new Set(r.vals)];
        }
        return { props, classNames };
      });
      sites.push({ file, line: n.loc.start.line, prim, spread, envs: siteEnvs, unresolved: [...unresolved] });
    });
  }
  // An unresolvable class-driving prop takes every literal value that prop has at any site, plus its default.
  const domain = new Map();
  for (const s of sites) for (const e of s.envs) for (const [k, vs] of Object.entries(e.props)) {
    if (!vs) continue;
    const id = `${s.prim}.${k}`;
    if (!domain.has(id)) domain.set(id, new Set([undefined]));
    for (const v of vs) domain.get(id).add(v);
  }
  for (const s of sites) for (const e of s.envs) for (const [k, vs] of Object.entries(e.props)) {
    if (!vs) e.props[k] = [...(domain.get(`${s.prim}.${k}`) ?? [undefined])];
  }
  return { sites, references, filesScanned };
}
