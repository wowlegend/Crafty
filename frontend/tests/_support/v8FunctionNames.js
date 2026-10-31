import { parse } from '@babel/parser';

/**
 * The names V8's coverage gives a file's functions, read off its source: what scripts/ci/runtime-reach.mjs's MUST_REACH
 * entries must match (tests/scripts/runtime-reach-merge.test.js). V8 names a function by its declaration or a named
 * function expression, and infers a name from the const, the property or the assignment it is the value of; anything else
 * (`memo(() => ...)`, an argument) reports as ''. Checked against V8 itself with node:inspector's precise coverage
 * (Node 24, 2026-10-31): `const A = () => {}` reports "A", `{ m: () => {} }` "m", `wrap(() => {})` "".
 */
const PARSE = { sourceType: 'module', plugins: ['jsx'] };
const SKIP = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments']);
const FN = /^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|ObjectMethod|ClassMethod)$/;

function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const k of Object.keys(node)) {
    if (SKIP.has(k)) continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) walk(c, visit, node); } else if (v && typeof v.type === 'string') walk(v, visit, node);
  }
}

/** Every function in `text` with the name V8 reports for it: [{ name, line }] ('' for an anonymous one). */
export function v8FunctionNames(text) {
  const out = [];
  walk(parse(text, PARSE).program, (n, parent) => {
    if (!FN.test(n.type)) return;
    let name = n.id?.name ?? null;
    if (!name && (n.type === 'ObjectMethod' || n.type === 'ClassMethod') && !n.computed && n.key?.type === 'Identifier') name = n.key.name;
    if (!name && parent?.type === 'VariableDeclarator' && parent.init === n && parent.id.type === 'Identifier') name = parent.id.name;
    if (!name && parent?.type === 'ObjectProperty' && parent.value === n && !parent.computed && parent.key.type === 'Identifier') name = parent.key.name;
    if (!name && parent?.type === 'AssignmentExpression' && parent.right === n && parent.left.type === 'Identifier') name = parent.left.name;
    out.push({ name: name ?? '', line: n.loc.start.line });
  });
  return out;
}

/** Every name `text` declares: consts and lets, functions (declared or named expressions), classes and imports. */
export function declaredNames(text) {
  const out = [];
  walk(parse(text, PARSE).program, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') out.push(n.id.name);
    else if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ClassDeclaration') && n.id) out.push(n.id.name);
    else if (n.type === 'ImportSpecifier' || n.type === 'ImportDefaultSpecifier' || n.type === 'ImportNamespaceSpecifier') out.push(n.local.name);
  });
  return out;
}
