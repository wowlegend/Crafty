import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { Panel } from '../../src/ui/primitives/Panel.jsx';
import { Button } from '../../src/ui/primitives/Button.jsx';
import { Toast } from '../../src/ui/primitives/Toast.jsx';
import { Slot } from '../../src/ui/primitives/Slot.jsx';
import { scanPrimitiveCallSites, readSourceTree, readStylesheet, STYLESHEET_ORDER, DYNAMIC } from '../_support/primitiveCallSites.js';

// A CALLER'S className MUST NOT FIGHT A PRIMITIVE'S NAMED DEFAULT.
//
// cn.js joins classes without resolving conflicts, so `<Panel className="bg-accent">` renders `bg-panel ... bg-accent`
// and the colour is decided by where each rule sits in the stylesheet, not by the caller. The primitives name every
// default a caller may replace (Panel bg/text/radius/shadow, Button text/size, Toast display/pad, Slot display); this
// gate fails when a call site reaches one of them through className instead.
//
// Decided by the cascade, not by class names. Each token's declarations come from Tailwind compiling the app's own
// stylesheet with the app's own config, and each default from rendering the real primitive. A className token X and a
// default D conflict when either holds:
//   COVERS  X alone gives the same computed values as D-then-X: X replaces D outright, so it belongs in the named prop
//           whichever rule happens to come later today.
//   LOSES   the stylesheet's real order gives different values from D-then-X: the caller's class is overridden.
// A narrower class the stylesheet places after the default (pt-4 beside py-1.5, ring-2 or a shadow colour beside a
// shadow size) is neither, so it passes.
//
// NOT checked, and printed below with counts: tokens behind a variant (hover:, md:) or important, which never compete
// with an unconditional default on equal terms; tokens no stylesheet rule defines; className parts the scanner cannot
// resolve; spread props; primitives used other than as a JSX element; defaults that are not named props; test files.

const require = createRequire(import.meta.url);
const twConfig = require('../../tailwind.config.cjs');

const PRIMITIVES = { Panel, Button, Toast, Slot };
const NAMED = { Panel: ['bg', 'text', 'radius', 'shadow'], Button: ['text', 'size'], Toast: ['display', 'pad'], Slot: ['display'] };
// The props each primitive reads to build its class list; a site's values for the unnamed ones pick which default
// the named prop supplies there (a ghost Button's text colour, a null size's absent padding).
const CLASS_PROPS = { Panel: ['variant', ...NAMED.Panel], Button: ['variant', ...NAMED.Button], Toast: ['status', ...NAMED.Toast], Slot: ['rarity', 'gear', 'selected', ...NAMED.Slot] };
const SENTINEL = '§named-prop-sentinel§';
// The population this gate was written against (133 call sites, 1,560 judged pairs, no primitive used as a value),
// less the honest deletions since: the HUD lane's toasts that now go through the notification stack (the survival
// banner, the boss banner, the Aspect hint's own toast), the hotbar's panel (its slots stand alone), and the coin count's
// and the target nameplate's panels (both now sit on the world), 115 sites after them, and 1,320 judged pairs.
const SITE_FLOOR = 115;
const PAIR_FLOOR = 1320;
const KNOWN_REFERENCES = [];

const tokensOf = (s) => String(s ?? '').split(/\s+/).filter(Boolean);
const renderClasses = (prim, props) => tokensOf(PRIMITIVES[prim].render(props, null).props.className);

/** The tokens a named prop puts on the element for these props: what disappears when the prop is replaced. */
function namedTokens(prim, props, name) {
  const replaced = new Set(renderClasses(prim, { ...props, [name]: SENTINEL }));
  return renderClasses(prim, props).filter((t) => !replaced.has(t));
}

// ---------- the cascade model ----------

// A shorthand becomes the longhands it sets, so `p-2` and `px-3` meet on padding-left. Each longhand takes the whole
// value: whether two rules meet, and which one is applied last, decide a conflict; the per-side value does not.
const SHORTHANDS = {
  padding: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  margin: ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  inset: ['top', 'right', 'bottom', 'left'],
  'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
  gap: ['row-gap', 'column-gap'],
  overflow: ['overflow-x', 'overflow-y'],
  background: ['background-color', 'background-image'],
};
const longhands = (prop, value) => (SHORTHANDS[prop] ?? [prop]).map((p) => [p, value]);

/** Unescapes a selector that is exactly one bare class; anything else (a pseudo, a combinator, a variant) is null. */
function bareClass(selector) {
  const s = selector.trim();
  if (!s.startsWith('.')) return null;
  let out = '';
  for (let i = 1; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') {
      const hex = /^[0-9a-fA-F]{1,6} ?/.exec(s.slice(i + 1));
      if (hex) { out += String.fromCodePoint(parseInt(hex[0], 16)); i += hex[0].length; } else { out += s[i + 1]; i++; }
    } else if (/[\s.:#[\]>+~*(),]/.test(ch)) return null;
    else out += ch;
  }
  return out;
}

/** token -> its bare rules, each { order, decls: [[prop, value]] }, from the compiled stylesheet. */
async function compileRules(css, tokens) {
  const config = { ...twConfig, content: [{ raw: [...tokens].join(' '), extension: 'html' }] };
  const { root } = await postcss([tailwindcss(config)]).process(css, { from: undefined });
  const rules = new Map();
  let order = 0;
  root.each((node) => {
    order++;
    if (node.type !== 'rule') return;
    const decls = [];
    node.each((d) => { if (d.type === 'decl') decls.push(...longhands(d.prop, d.value)); });
    for (const sel of node.selectors) {
      const tok = bareClass(sel);
      if (tok === null) continue;
      if (!rules.has(tok)) rules.set(tok, []);
      rules.get(tok).push({ order, decls });
    }
  });
  return rules;
}

function substituteVars(value, custom, depth = 0) {
  if (depth > 12) return value;
  let out = ''; let i = 0;
  while (i < value.length) {
    const at = value.indexOf('var(', i);
    if (at < 0) { out += value.slice(i); break; }
    out += value.slice(i, at);
    let d = 0; let j = at + 3;
    for (; j < value.length; j++) { if (value[j] === '(') d++; if (value[j] === ')' && --d === 0) break; }
    const inner = value.slice(at + 4, j);
    const comma = inner.indexOf(',');
    const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
    const fallback = comma < 0 ? null : inner.slice(comma + 1).trim();
    if (custom.has(name)) out += substituteVars(custom.get(name), custom, depth + 1);
    else if (fallback !== null) out += substituteVars(fallback, custom, depth + 1);
    else out += `var(${name})`;
    i = j + 1;
  }
  return out;
}

/** The standard properties after applying `rules` in sequence, with each var() resolved from the same rules. */
function computed(rules) {
  const set = new Map();
  for (const r of rules) for (const [p, v] of r.decls) set.set(p, v);
  const custom = new Map([...set].filter(([p]) => p.startsWith('--')));
  return JSON.stringify([...set].filter(([p]) => !p.startsWith('--')).map(([p, v]) => [p, substituteVars(v, custom)]).sort());
}

/** null when X does not fight D, else why it does. */
function judge(rules, d, x) {
  const D = rules.get(d); const X = rules.get(x);
  const intended = computed([...D, ...X]);
  if (computed(X) === intended) return 'COVERS';
  if (computed([...D, ...X].sort((a, b) => a.order - b.order)) !== intended) return 'LOSES';
  return null;
}

const isConditional = (t) => t.startsWith('!') || /^[^[]*:/.test(t);

/** Every (named default, className token) pair at every call site, judged. */
async function audit(sites, css) {
  const combos = [];
  for (const s of sites) for (const env of s.envs) {
    let propsList = [{}];
    for (const [k, vs] of Object.entries(env.props)) propsList = propsList.flatMap((p) => vs.map((v) => (v === undefined ? p : { ...p, [k]: v })));
    for (const props of propsList) for (const name of NAMED[s.prim]) {
      const defaults = namedTokens(s.prim, props, name);
      for (const cls of env.classNames) combos.push({ site: s, props, name, defaults, tokens: tokensOf(cls) });
    }
  }
  const all = new Set(combos.flatMap((c) => [...c.defaults, ...c.tokens]));
  const rules = await compileRules(css, all);
  const out = { conflicts: [], pairs: 0, combos: combos.length, noRule: new Set(), conditional: new Set(), dynamic: 0, deadDefaults: new Set() };
  for (const c of combos) for (const d of c.defaults) {
    if (!rules.has(d)) { out.deadDefaults.add(`${c.site.prim}.${c.name} -> ${d}`); continue; }
    for (const x of c.tokens) {
      if (x === d) continue;
      if (x.includes(DYNAMIC)) { out.dynamic++; continue; }
      if (isConditional(x)) { out.conditional.add(x); continue; }
      if (!rules.has(x)) { out.noRule.add(x); continue; }
      out.pairs++;
      const why = judge(rules, d, x);
      if (why) out.conflicts.push(`${c.site.file}:${c.site.line} <${c.site.prim}> className "${x}" ${why} the ${c.name} default "${d}" (props ${JSON.stringify(c.props)}): pass ${c.name}="..." instead`);
    }
  }
  out.conflicts = [...new Set(out.conflicts)];
  return out;
}

const synthetic = (jsx, prelude = '') => scanPrimitiveCallSites(
  [{ file: 'src/ui/SyntheticCallSites.jsx', text: `import { Panel, Button, Toast, Slot } from './primitives';\n${prelude}\nexport const X = () => (<>\n${jsx}\n</>);\n` }],
  CLASS_PROPS,
).sites;

describe('the instrument can see a conflict before it is trusted to report none', () => {
  let css;
  beforeAll(() => { css = readStylesheet().css; });

  it('every named prop of every primitive puts at least one token on the element, and each has a stylesheet rule', async () => {
    const sites = synthetic('<Panel /><Button /><Toast /><Slot />');
    const r = await audit(sites, css);
    for (const [prim, names] of Object.entries(NAMED)) for (const name of names) {
      expect(namedTokens(prim, {}, name), `${prim}.${name} supplies no class: renamed or unwired, so nothing could conflict with it`).not.toEqual([]);
    }
    expect([...r.deadDefaults]).toEqual([]);
  });

  it('flags a className that replaces each named default, and passes a refinement the stylesheet orders after it', async () => {
    const flagged = [
      ['<Panel className="bg-accent" />', 'bg', 'bg-accent'],
      ['<Panel className="text-text-inverse" />', 'text', 'text-text-inverse'],
      ['<Panel className="rounded-lg" />', 'radius', 'rounded-lg'],
      ['<Panel className="shadow-none" />', 'shadow', 'shadow-none'],
      ['<Panel variant="inset" className="bg-slot" />', 'bg', 'bg-slot'],
      ['<Button className="text-accent" />', 'text', 'text-accent'],
      ['<Button className="px-2" />', 'size', 'px-2'],
      ['<Button className="p-1" />', 'size', 'p-1'],
      ['<Button size="sm" className="text-lg" />', 'size', 'text-lg'],
      ['<Button className="gap-4" />', 'size', 'gap-4'],
      ['<Toast className="flex" />', 'display', 'flex'],
      ['<Toast className="py-3" />', 'pad', 'py-3'],
      ['<Slot className="flex" />', 'display', 'flex'],
      ['<Slot className="hidden" />', 'display', 'hidden'],
    ];
    for (const [jsx, name, token] of flagged) {
      const r = await audit(synthetic(jsx), css);
      expect(r.conflicts.some((c) => c.includes(`"${token}"`) && c.includes(`the ${name} default`)), `${jsx} should conflict on ${name}; got ${JSON.stringify(r.conflicts)}`).toBe(true);
    }
    const passed = [
      '<Panel bg="bg-accent" text="text-text-inverse" className="px-4 py-2 flex items-center gap-2 w-40" />',
      '<Panel className="rounded-t-lg ring-2 shadow-accent text-sm hover:bg-accent md:rounded-lg" />',
      '<Button className="pt-4 leading-tight w-full" />',
      '<Button size={null} className="px-2 py-1 text-xs gap-1" />',
      '<Button variant="ghost" text="text-accent" className="hover:text-accent-raise w-8" />',
      '<Toast display="flex" pad="p-3" className="w-full" />',
      '<Slot display="flex" className="w-12 h-12" />',
    ];
    for (const jsx of passed) {
      const r = await audit(synthetic(jsx), css);
      expect(r.conflicts, jsx).toEqual([]);
      expect(r.pairs, `${jsx} judged no pair at all`).toBeGreaterThan(0);
    }
  });

  it('flags a narrower class the stylesheet orders BEFORE the default, because there the default wins', async () => {
    const early = '.pad-top-early { padding-top: 9px }\n';
    const r = await audit(synthetic('<Button className="pad-top-early" />'), early + css);
    expect(r.conflicts.some((c) => c.includes('"pad-top-early" LOSES the size default "py-2"')), JSON.stringify(r.conflicts)).toBe(true);
    const late = await audit(synthetic('<Button className="pad-top-early" />'), css + '\n' + early);
    expect(late.conflicts).toEqual([]);
  });

  it('resolves conditions jointly and through a const, and reports what it cannot resolve', async () => {
    const sites = synthetic([
      '<Panel bg={on ? "bg-accent" : undefined} className={on ? "w-4" : "bg-slot"} />',
      '<Panel className={`p-2 ${dyn}`} />',
      '<Button {...rest} />',
      '<Button className={TONE} />',
    ].join('\n'), 'const TONE = "w-6 " + "text-accent";');
    const r = await audit(sites, css);
    expect(r.conflicts.length, JSON.stringify(r.conflicts)).toBe(2);
    expect(r.conflicts[0]).toMatch(/"bg-slot" COVERS the bg default "bg-panel"/);
    expect(r.conflicts[1]).toMatch(/"text-accent" COVERS the text default "text-text-inverse"/);
    expect(r.dynamic).toBeGreaterThan(0);
    expect(sites[1].unresolved.join()).toMatch(/identifier dyn/);
    expect(sites[2].spread).toBe(true);
  });
});

describe('no call site in src passes a className that fights a named default', () => {
  it('scans every call site and finds no conflict', async () => {
    const { css, found } = readStylesheet();
    expect(found.sort(), 'a .css file the cascade model does not read; add it to STYLESHEET_ORDER').toEqual([...STYLESHEET_ORDER].sort());
    const files = readSourceTree();
    const { sites, references, filesScanned } = scanPrimitiveCallSites(files, CLASS_PROPS);
    const r = await audit(sites, css);
    const byPrim = Object.fromEntries(Object.keys(NAMED).map((p) => [p, sites.filter((s) => s.prim === p).length]));
    const unresolved = sites.filter((s) => s.unresolved.length);
    const spread = sites.filter((s) => s.spread);
    const summary =
      `primitive-class-override: ${filesScanned} files, ${sites.length} call sites ${JSON.stringify(byPrim)}, ` +
      `${r.combos} prop/className combinations, ${r.pairs} (default, token) pairs judged, ${r.conflicts.length} conflicts | ` +
      `not judged: ${r.conditional.size} variant/important tokens, ${r.noRule.size} tokens with no stylesheet rule, ` +
      `${r.dynamic} dynamic parts, ${unresolved.length} sites with an unresolved attribute, ${spread.length} spread sites, ` +
      `${references.length} non-JSX references`;
    console.log(summary);
    for (const s of unresolved) console.log(`  unresolved ${s.file}:${s.line} <${s.prim}> ${s.unresolved.join('; ')}`);
    for (const s of spread) console.log(`  spread ${s.file}:${s.line} <${s.prim}>`);
    for (const ref of references) console.log(`  reference ${ref}`);
    console.log(`  not judged: variant/important ${[...r.conditional].join(' ')} | no rule ${[...r.noRule].join(' ')}`);
    expect(r.conflicts, summary).toEqual([]);
    expect([...r.deadDefaults], summary).toEqual([]);
    // A scan that stopped finding call sites would otherwise report zero conflicts over nothing.
    expect(sites.length, summary).toBeGreaterThanOrEqual(SITE_FLOOR);
    expect(r.pairs, summary).toBeGreaterThanOrEqual(PAIR_FLOOR);
    expect(references, 'a primitive used as a value is a call site this scan cannot read').toEqual(KNOWN_REFERENCES);
  });
});
