import { parse } from '@babel/parser';

/**
 * The detector behind tests/scripts/store-setters-called.test.js, apart from it so a script can run it over another
 * tree (the red-first run reads the tree before lane L6 removed 13 setters). Reads the syntax tree: a comment or a template
 * text naming a setter is not a use.
 */
export const STORE_FILE = 'src/store/useGameStore.jsx';
const PARSE = { sourceType: 'module', plugins: ['jsx'] };
const SKIP = new Set(['loc', 'start', 'end', 'extra', 'range', 'leadingComments', 'trailingComments', 'innerComments']);

function walk(node, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const k of Object.keys(node)) {
    if (SKIP.has(k)) continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) walk(c, fn); } else if (v && typeof v.type === 'string') walk(v, fn);
  }
}

/** The `set*` function members of the store's create((set, get) => ({ ... })) object: [{ name, line }]. */
function declaredSetters(storeText) {
  const ast = parse(storeText, PARSE);
  let obj = null;
  walk(ast.program, (n) => {
    if (obj || n.type !== 'CallExpression' || n.callee.type !== 'Identifier' || n.callee.name !== 'create') return;
    const fn = n.arguments[0];
    if (fn && fn.type === 'ArrowFunctionExpression' && fn.body.type === 'ObjectExpression') obj = fn.body;
  });
  if (!obj) throw new Error('the store has no create((set, get) => ({ ... })) object');
  const out = [];
  for (const p of obj.properties) {
    const isFn = p.type === 'ObjectMethod' || (p.type === 'ObjectProperty' && /^(Arrow)?FunctionExpression$/.test(p.value.type));
    const name = !p.computed && p.key?.type === 'Identifier' ? p.key.name : null;
    if (isFn && name && /^set[A-Z]/.test(name)) out.push({ name, line: p.loc.start.line });
  }
  return out;
}

/**
 * How many times `name` is USED as the store's member in `text`: read off an object (`x.setX`, `x?.setX`, `x['setX']`) or
 * pulled out of one (`const { setX } = ...`). A bare identifier is not a use: a component's own `const [v, setX] = useState()`
 * would credit a dead store setter of the same name, and the store's members are never reached by a bare identifier.
 */
function usesOf(name, text) {
  const ast = parse(text, PARSE);
  let n = 0;
  walk(ast.program, (node) => {
    if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
      const p = node.property;
      if (!node.computed && p.type === 'Identifier' && p.name === name) n++;
      else if (node.computed && p.type === 'StringLiteral' && p.value === name) n++;
    } else if (node.type === 'ObjectPattern') {
      for (const prop of node.properties) {
        if (prop.type !== 'ObjectProperty' || prop.computed) continue;
        if ((prop.key.type === 'Identifier' && prop.key.name === name) || (prop.key.type === 'StringLiteral' && prop.key.value === name)) n++;
      }
    }
  });
  return n;
}

/** The setters the store declares that nothing in `tree` uses, with the tree's size for the denominator. */
export function deadSetters(tree, storeText) {
  const setters = declaredSetters(storeText);
  const parsed = tree.map(({ file, text }) => ({ file, ast: file === STORE_FILE ? null : text }));
  const dead = [];
  const live = [];
  for (const s of setters) {
    let uses = usesOf(s.name, storeText);
    for (const { ast: text } of parsed) {
      if (uses > 0) break;
      if (text !== null) uses += usesOf(s.name, text);
    }
    (uses === 0 ? dead : live).push(s.name);
  }
  return { setters: setters.map((s) => s.name), dead, live, files: tree.length };
}

