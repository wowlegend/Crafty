// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { setActive } from '../../src/input/inputState.js';
import { ASPECT_VERBS } from '../../src/input/aspectWheel.js';
import { SPELL_ORDER } from '../../src/input/spellPicker.js';
import { TRAY_PANELS } from '../../src/ui/touchTray.js';
import TouchControls from '../../src/ui/TouchControls.jsx';
import { GameUI } from '../../src/ui/GameHud.jsx';
import { vp, VIEWPORTS } from './_touchViewports.js';

// NO TWO TOUCH CONTROLS OVERLAP — a PROPERTY over every control the overlay renders, in every viewport below.
//
// WHY (review F1, 2026-10-27). Phase 0c showed the Aspect-ring opener to every touch player, and it sat on the centre
// of the jump button: a fresh player's jump tap opened the ring, and the next tap opened Talents with input off. No
// check could see it — jsdom has no layout, and every gate here asserted that a control EXISTS, never WHERE. The opener
// had overlapped the jump for every player with an Aspect unlocked since X1; 0c only widened who was hit.
//
// REVIEW ROUND 2. Raising the rows for F1 put the spell row's opener on the CENTRE of the HUD's Settings gear in Safari's
// landscape on an iPhone 14 / 15 Pro / SE, and this gate stayed green: it modelled the overlay alone, and the gear lives
// in the HUD (a z-20 layer UNDER the z-40 overlay, so a control over it takes every tap meant for Settings). The HUD's
// controls in the top band now join the universe, from a fixed table checked against the rendered GameUI (HUD_CONTROLS),
// and the spell row moves inward past the Pause where the stack does not fit (aspectWheel.js TOP_BAND_PX).
//
// WHAT IS MEASURED. The overlay is rendered for real, with EVERYTHING open at once (the tray, the Aspect ring and the
// spell ring are independent states, so a player can have all three open), ONCE PER VIEWPORT: the spell row's anchor
// depends on the viewport's height (input/useSpellAnchor.js reads window.innerHeight), so each viewport gets its own
// render. Every `[data-touch-btn]` it renders, plus the joystick base (the zone the drawn stick sends the thumb to),
// plus the HUD's top-band controls, is a control. Each overlay control's rectangle is computed from the EXACT style
// object React was handed — the CSS strings the browser will evaluate — by a small evaluator below that resolves calc() /
// env(safe-area-inset-*) / max() / min() / % against each viewport. jsdom cannot be used for that: its CSS parser
// rewrites `calc(env(...) + 26px)` into garbage and drops `max(env(...), 7%)` (measured), so the gate reads React's own
// props for each element (`__reactProps$…`) and fails SETUP, loudly, if React stops exposing them.
//
// ONLY WHAT THE EVALUATOR READS MAY POSITION A BOX (round 2, item 5). It reads width / height / left / right / top /
// bottom and nothing else, so a `transform`, `translate`, `margin*`, `inset` or `minWidth` on a control (or a stray key on
// its layer) would move or size a box this gate cannot see. Every style key on a control and on its layer must be in
// CONTROL_KEYS / LAYER_KEYS below, or the gate fails SETUP naming it. The inert keys are inert because box-sizing is
// border-box everywhere (Tailwind's preflight), so border and padding cannot change a box whose width and height are set.
//
// THE PROPERTY, per viewport: no two control rectangles intersect (touching edges is allowed), and every control lies
// inside the safe area. A NEW control joins the property automatically — the universe is whatever the overlay renders,
// and its size is asserted against the registries (so a control the gate cannot place is a red, not a skip).
//
// THE VIEWPORTS. Playwright's own device descriptors (Safari's measured visible viewport, browser chrome included) for
// every iPad and the iPhone classes, both orientations — a source this repo did not author — plus the full-screen
// `viewport-fit=cover` layout (index.html sets it) of a notched iPhone, where env() carries the real insets.
//
// KNOWN_OVERLAPS is the debt this gate inherited, NOT an exemption list: the measured set must EQUAL it, so a new
// overlap is red and a fixed one is red until its row is deleted (it may fall, never rise). Every row predates F1 or is
// arithmetic the layout cannot beat (each is explained where it is declared). F1's pair is not in it.
//
// Mutation-Proof: via scripts/dev/mutate.sh, 2026-10-27, one defect at a time, each observed RED unless marked:
//   L1 src/input/aspectWheel.js plausible-wrong: ASPECT_ROW_BOTTOM back at its old 104 px (onto the jump)
//   L1b src/input/aspectWheel.js plausible-wrong: the rows back on the action cluster's 11% anchor
//   L2 src/input/aspectWheel.js plausible-wrong: the fan's item 0 back on its opener (`-i * step`)
//   L3 src/input/aspectWheel.js plausible-wrong: SPELL_ROW_BOTTOM 207, one pixel into the Aspect row
//   L6 src/ui/TouchControls.jsx: the jump hit-target moved up onto the Aspect opener (11% + 150 px)
//   L5 src/ui/TouchControls.jsx: a new control no registry counts
//   L7 src/ui/TouchControlsSurface.jsx: the joystick zone unmarked (the gate would stop measuring it)
//   L4 this file: the evaluator resolves every env() inset to 0
//   L0 identity (a comment edit in src/input/aspectWheel.js) SURVIVED, as it must.
// Review round 2 (items 1 and 5; 14 tests), each observed RED unless marked:
//   L8 src/input/aspectWheel.js: SPELL_SHORT_SHIFT 0 — the spell row back on the gear (the regression itself)
//   L9 plausible-wrong: SPELL_SHORT_SHIFT 80, 4 px into the Pause
//   L10 plausible-wrong: TOP_BAND_PX 56, the band measured to the Pause alone — caught ONLY by the height sweep (no named
//       viewport lies in the 2 px it opens), and by src/input/aspectWheel.test.js's boundary
//   L11 spellRowStacks always true   L12 spellRowStacks always false (portraits move, a 320 px fan leaves the screen)
//   L13 src/ui/TouchControls.jsx: the spell opener's hit-target ignores the anchor
//   L17 / L17b src/ui/TouchControlsSurface.jsx: the spell opener's / fan's glyphs ignore the anchor (the glyph check)
//   L14 a transform on the jump's hit-target   L15 a margin on the cast's   L16 a transform on the overlay layer
//   L18 src/ui/GameHud.jsx: the gear grows to 48 px   L19 its row moves to top-2   L20 a margin class on the gear
//   L0 identity (a comment edit in src/input/aspectWheel.js) SURVIVED, as it must.
//
// BLIND SPOTS, stated: this is geometry, not hit-testing — stacking order, pointer-events and a real browser's CSS
// engine are tests/e2e/touch-hold.spec.js's "every control owns its own centre". Of the HUD it models only the
// interactive controls of the top-right band (on touch: the Settings gear; the coin and XP readouts, the quest toasts and
// the minimap there are pointer-events none). It does not model the top-left quest tracker (interactive, but sized by its
// content, so no fixed rectangle can be honest about it), the hotbar, the on-screen keyboard, or Safari's toolbar
// animating mid-play. The glyph layer is checked only for the spell row (its glyphs must sit on its hit-targets, since
// both now read one viewport-dependent anchor); the action / cast / jump / dodge glyphs are drawn at their own (larger)
// rectangles and are not checked here.

vi.mock('../../src/input/touchDevice', async (orig) => ({
  ...(await orig()),
  isTouchDevice: () => true,
  isTouchUIMode: () => true,
}));

// ---------------------------------------------------------------------------------------------------------------------
// The CSS length evaluator: exactly the grammar the overlay's inline styles use, and nothing it does not (an unknown
// token throws, so a style the gate cannot read is a failure, never a 0).
// ---------------------------------------------------------------------------------------------------------------------
function tokenize(src) {
  const out = [];
  const re = /\s*(?:(-?\d*\.?\d+)(px|%)?|([a-z-]+)|([()+\-*/,]))/gy;
  let m;
  let at = 0;
  while (at < src.length) {
    re.lastIndex = at;
    m = re.exec(src);
    if (!m || m[0].length === 0) {
      if (/^\s*$/.test(src.slice(at))) break;
      throw new Error(`unreadable CSS at "${src.slice(at)}" in "${src}"`);
    }
    at = re.lastIndex;
    if (m[1] !== undefined) out.push({ k: 'num', v: Number(m[1]), unit: m[2] || '' });
    else if (m[3] !== undefined) out.push({ k: 'id', v: m[3] });
    else out.push({ k: 'op', v: m[4] });
  }
  return out;
}

/** Resolve a CSS length to px. `axis` is the containing block's size along the property (width for left/right/width). */
export function cssPx(value, axis, insets) {
  if (typeof value === 'number') return value; // React appends px to a bare number on these properties
  const toks = tokenize(String(value));
  let i = 0;
  const peek = () => toks[i];
  const take = (v) => {
    const t = toks[i];
    if (!t || (v !== undefined && t.v !== v)) throw new Error(`expected "${v}" at token ${i} in "${value}"`);
    i += 1;
    return t;
  };
  const expr = () => {
    let a = term();
    while (peek() && (peek().v === '+' || peek().v === '-')) {
      const op = take().v;
      const b = term();
      a = op === '+' ? a + b : a - b;
    }
    return a;
  };
  const term = () => {
    let a = factor();
    while (peek() && (peek().v === '*' || peek().v === '/')) {
      const op = take().v;
      const b = factor();
      a = op === '*' ? a * b : a / b;
    }
    return a;
  };
  const args = () => {
    take('(');
    const list = [expr()];
    while (peek() && peek().v === ',') { take(','); list.push(expr()); }
    take(')');
    return list;
  };
  const factor = () => {
    const t = take();
    if (t.k === 'num') return t.unit === '%' ? (t.v / 100) * axis : t.v;
    if (t.v === '(') { const v = expr(); take(')'); return v; }
    if (t.v === 'calc') return args()[0];
    if (t.v === 'max') return Math.max(...args());
    if (t.v === 'min') return Math.min(...args());
    if (t.v === 'env') {
      take('(');
      const name = take();
      const side = /^safe-area-inset-(top|right|bottom|left)$/.exec(name.v);
      if (!side) throw new Error(`unknown env() "${name.v}" in "${value}"`);
      if (peek() && peek().v === ',') { take(','); expr(); } // the fallback: the viewport below always supplies a value
      take(')');
      return insets[side[1]];
    }
    throw new Error(`unknown CSS token "${t.v}" in "${value}"`);
  };
  const v = expr();
  if (i !== toks.length) throw new Error(`trailing CSS in "${value}"`);
  if (!Number.isFinite(v)) throw new Error(`non-finite length from "${value}"`);
  return v;
}

/** The viewport rectangle of an absolutely positioned box in a fixed, inset:0 layer: {x0,y0,x1,y1} in px. */
export function rectOf(style, vp) {
  const { w: W, h: H, insets } = vp;
  if (style.width === undefined || style.height === undefined) throw new Error(`no width/height in ${JSON.stringify(style)}`);
  const w = cssPx(style.width, W, insets);
  const h = cssPx(style.height, H, insets);
  let x0;
  if (style.left !== undefined) x0 = cssPx(style.left, W, insets);
  else if (style.right !== undefined) x0 = W - cssPx(style.right, W, insets) - w;
  else throw new Error(`no left/right in ${JSON.stringify(style)}`);
  let y0;
  if (style.top !== undefined) y0 = cssPx(style.top, H, insets);
  else if (style.bottom !== undefined) y0 = H - cssPx(style.bottom, H, insets) - h;
  else throw new Error(`no top/bottom in ${JSON.stringify(style)}`);
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}

const intersects = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

// ---------------------------------------------------------------------------------------------------------------------
// The viewports
// ---------------------------------------------------------------------------------------------------------------------
// The matrix itself lives in ./_touchViewports.js, shared with chevron-placement-gates (the windup chevrons' frame).

// The debt, measured 2026-10-27 on the F1 layout. Each row is `viewport :: control x control` with its cause; the
// measured set must EQUAL the rows, so a new overlap is red and a fixed one is red until its row is deleted.
//   TRAY  pre-existing: the tray column (left edge, rows at 50% - 84px + 56px*i) runs down into the joystick base
//         (13% from the bottom, 148px) on every phone. Neither moved for F1; the zone was simply never measured.
//   SE    pre-existing: on a 320px-wide phone the cast and dodge columns reach the joystick base.
//   (SHORT — the spell row meeting the Pause on a ~340 px landscape — was six rows here. Round 2 deleted them: the spell
//         row now moves inward past the Pause where the stack does not fit, and none remains.)
//   FAN   introduced, accepted: on a 320px-wide phone the fan's last sector reaches the tray column when the tray and a
//         ring are open together. The fan now starts one step inward so its opener stays a toggle (F4): 26px + 5 x
//         58px - 6px = 310px of a 320px width.
const KNOWN_OVERLAPS = [
  ['iPhone 14 :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone 14 cover landscape :: joystick x touch-tray-build', 'TRAY'],
  ['iPhone 14 cover landscape :: joystick x touch-tray-talk', 'TRAY'],
  ['iPhone 14 cover landscape :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone 14 landscape :: joystick x touch-tray-build', 'TRAY'],
  ['iPhone 14 landscape :: joystick x touch-tray-talk', 'TRAY'],
  ['iPhone 14 landscape :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone 15 Pro :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone 15 Pro Max :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone 15 Pro Max cover landscape :: joystick x touch-tray-build', 'TRAY'],
  ['iPhone 15 Pro Max cover landscape :: joystick x touch-tray-talk', 'TRAY'],
  ['iPhone 15 Pro Max cover landscape :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone 15 Pro Max landscape :: joystick x touch-tray-build', 'TRAY'],
  ['iPhone 15 Pro Max landscape :: joystick x touch-tray-talk', 'TRAY'],
  ['iPhone 15 Pro Max landscape :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone 15 Pro landscape :: joystick x touch-tray-build', 'TRAY'],
  ['iPhone 15 Pro landscape :: joystick x touch-tray-talk', 'TRAY'],
  ['iPhone 15 Pro landscape :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone SE (3rd gen) :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone SE (3rd gen) landscape :: joystick x touch-tray-build', 'TRAY'],
  ['iPhone SE (3rd gen) landscape :: joystick x touch-tray-talk', 'TRAY'],
  ['iPhone SE (3rd gen) landscape :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone SE :: joystick x touch-cast', 'SE'],
  ['iPhone SE :: joystick x touch-dodge', 'SE'],
  ['iPhone SE :: joystick x touch-tray-build', 'TRAY'],
  ['iPhone SE :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone SE :: touch-aspect-imbue x touch-tray-build', 'FAN'],
  ['iPhone SE :: touch-aspect-imbue x touch-tray-talk', 'FAN'],
  ['iPhone SE :: touch-spell-arcane x touch-tray-talk', 'FAN'],
  ['iPhone SE :: touch-spell-arcane x touch-tray-inventory', 'FAN'],
  ['iPhone SE landscape :: joystick x touch-tray-build', 'TRAY'],
  ['iPhone SE landscape :: joystick x touch-tray-talk', 'TRAY'],
  ['iPhone SE landscape :: joystick x touch-tray-magic', 'TRAY'],
];

// The safe-area debt, measured the same way: the overlay's own controls have none. These rows are the HUD's: GameHud's top
// row is placed with top-4 / right-4 and no env() inset, so under viewport-fit=cover the Settings gear sits 16 px from
// the edge, inside the notch's inset (47 / 59 px). Pre-existing, outside this overlay; may fall, never rise.
const KNOWN_OUTSIDE = [
  'iPhone 14 cover :: hud-settings',
  'iPhone 14 cover landscape :: hud-settings',
  'iPhone 15 Pro Max cover :: hud-settings',
  'iPhone 15 Pro Max cover landscape :: hud-settings',
];

// ---------------------------------------------------------------------------------------------------------------------
// The HUD's interactive controls in the top band (round 2). The HUD is Tailwind classes, not inline styles, so each one's
// rectangle is a FIXED TABLE here — and the table is checked against the rendered GameUI before it is used: a listed
// class missing from the control or its row, another class that could move or size it, or the control no longer the last
// of its row, fails SETUP rather than measure a gear that has moved. Tailwind's spacing scale at a 16 px root: 4 = 16 px.
// ---------------------------------------------------------------------------------------------------------------------
const HUD_CONTROLS = [
  {
    // GameHud.jsx: the last control of the top row (`absolute top-4 left-4 right-4 flex justify-end items-start`), so
    // its top is the row's (16 px) and its right edge the row's (16 px); `w-[42px] h-[42px]`.
    name: 'hud-settings',
    own: ['w-[42px]', 'h-[42px]'],
    row: ['absolute', 'top-4', 'left-4', 'right-4', 'flex', 'justify-end', 'items-start'],
    style: { position: 'absolute', top: 16, right: 16, width: 42, height: 42 },
  },
];
const HUD_STATE = {
  selectedBlock: null, inventory: { blocks: {} },
  setSelectedBlock: () => {}, setShowSettings: () => {}, setShowInventory: () => {}, setShowForge: () => {},
  setShowMagic: () => {}, setShowBuildingTools: () => {},
};
// A class that could move or size a box: margins, sizes, offsets, translates, position. Padding is not one (border-box).
const MOVERS = /^-?(?:m[trblxy]?|w|h|min-w|min-h|max-w|max-h|size|translate-[xy]|top|right|bottom|left|inset(?:-[xy])?)-|^(?:absolute|relative|fixed|sticky)$/;
const classesOf = (el) => new Set(String((el && el.className) || '').split(/\s+/).filter(Boolean));

/** The HUD's top-band controls as [{ name, style }], each checked against the rendered GameUI. */
function hudControls() {
  render(<GameUI gameState={HUD_STATE} />);
  const out = [];
  for (const c of HUD_CONTROLS) {
    const el = screen.queryByTestId(c.name);
    if (!el) throw new Error(`SETUP: GameUI rendered no [data-testid="${c.name}"] — the HUD table is stale`);
    const wrap = el.parentElement;
    const row = wrap && wrap.parentElement;
    const root = row && row.parentElement;
    const wrong = [
      ...c.own.filter((k) => !classesOf(el).has(k)).map((k) => `${c.name} lacks ${k}`),
      ...c.row.filter((k) => !classesOf(row).has(k)).map((k) => `its row lacks ${k}`),
      ...['absolute', 'inset-0'].filter((k) => !classesOf(root).has(k)).map((k) => `the HUD root lacks ${k}`),
      ...[...classesOf(el)].filter((k) => MOVERS.test(k) && !c.own.includes(k)).map((k) => `${c.name} carries ${k}`),
      ...[...classesOf(wrap)].filter((k) => MOVERS.test(k)).map((k) => `its wrapper carries ${k}`),
    ];
    if (!row || row.lastElementChild !== wrap || wrap.lastElementChild !== el) wrong.push(`${c.name} is not the last control of its row, so its right edge is not the row's`);
    if (wrong.length) throw new Error(`SETUP: the HUD table no longer matches GameHud.jsx — ${wrong.join('; ')}`);
    out.push({ name: c.name, style: c.style });
  }
  cleanup();
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// The universe: render the overlay with everything open and read each control's own style object
// ---------------------------------------------------------------------------------------------------------------------
const reactProps = (el) => {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  if (!key) throw new Error('SETUP: React no longer exposes __reactProps$ on DOM nodes — the gate cannot read the style it measures');
  return el[key];
};
const nameOf = (el) => el.getAttribute('data-testid') || el.getAttribute('data-touch-zone') || `aria:${el.getAttribute('aria-label')}`;

// The style keys a control and its layer may carry (round 2, item 5): what the evaluator reads, plus keys that cannot move
// or size a box. Anything else is a SETUP failure naming the key.
const GEOMETRY_KEYS = ['width', 'height', 'left', 'right', 'top', 'bottom'];
const CONTROL_KEYS = new Set([...GEOMETRY_KEYS, 'position', 'background', 'border', 'borderRadius', 'boxShadow', 'opacity',
  'pointerEvents', 'padding']);
const LAYER_KEYS = new Set(['position', 'inset', 'zIndex', 'pointerEvents', 'touchAction', 'WebkitUserSelect', 'userSelect',
  'WebkitTouchCallout']);
function assertReadable(who, style, allowed) {
  for (const k of Object.keys(style)) {
    if (!allowed.has(k)) {
      throw new Error(`SETUP: ${who} carries style "${k}", which the evaluator does not model — it could move or size the box `
        + 'this gate measures. Model it in rectOf, or list it as inert if it cannot.');
    }
  }
}

// The viewport the overlay renders into: input/useSpellAnchor.js reads window.innerHeight.
function setViewport(v) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: v.w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: v.h });
}

// The spell row's glyphs and their hit-targets: both read one viewport-dependent anchor, so the two layers must agree.
const SPELL_GLYPH_PAIRS = [['touch-spells', 'touch-spells-glyph'], ...SPELL_ORDER.map((id) => [`touch-spell-${id}`, `spell-glyph-${id}`])];

/** Every control of the live overlay rendered into `v`, everything open: { controls: [{ name, style }], glyphDrift }. */
function renderUniverse(v) {
  setViewport(v);
  useGameStore.setState({ unlockedTalents: {} });
  setActive(true);
  render(<TouchControls isWorldBuilt />);
  fireEvent.pointerUp(screen.getByTestId('touch-panels'));
  fireEvent.pointerUp(screen.getByTestId('touch-aspects'));
  fireEvent.pointerUp(screen.getByTestId('touch-spells'));
  const controls = [];
  for (const el of document.querySelectorAll('[data-touch-btn], [data-touch-zone]')) {
    const style = reactProps(el).style || {};
    // THE COORDINATE FRAME: each control must be positioned by a fixed, inset:0 layer, or its numbers mean something
    // else. (The hit-targets are children of the overlay root; the joystick base of the glyph surface's root.)
    const parentStyle = reactProps(el.parentElement).style || {};
    if (parentStyle.position !== 'fixed' || !(parentStyle.inset === 0 || parentStyle.inset === '0')) {
      throw new Error(`SETUP: ${nameOf(el)} is not positioned by a fixed inset:0 layer (${JSON.stringify(parentStyle)})`);
    }
    if (style.position !== 'absolute') throw new Error(`SETUP: ${nameOf(el)} is not position:absolute (${style.position})`);
    assertReadable(nameOf(el), style, CONTROL_KEYS);
    assertReadable(`the layer of ${nameOf(el)}`, parentStyle, LAYER_KEYS);
    controls.push({ name: nameOf(el), style });
  }
  const glyphDrift = [];
  for (const [hitId, glyphId] of SPELL_GLYPH_PAIRS) {
    const hitStyle = reactProps(screen.getByTestId(hitId)).style;
    const glyphStyle = reactProps(screen.getByTestId(glyphId)).style;
    for (const k of GEOMETRY_KEYS) if (hitStyle[k] !== glyphStyle[k]) glyphDrift.push(`${v.name} :: ${glyphId}.${k} ${glyphStyle[k]} vs ${hitStyle[k]}`);
  }
  cleanup();
  setActive(false);
  return { controls, glyphDrift };
}

/** Every viewport's universe: the overlay rendered into it, plus the HUD's top band. */
function renderAll(viewports, hud) {
  return viewports.map((v) => {
    const { controls, glyphDrift } = renderUniverse(v);
    return { v, controls: [...controls, ...hud], glyphDrift };
  });
}

/** The overlaps (`viewport :: a x b`, names sorted) and the out-of-safe-area controls, over every viewport's universe. */
function measure(universes) {
  const overlaps = [];
  const outside = [];
  let pairs = 0;
  for (const { v, controls } of universes) {
    const rects = controls.map((c) => ({ name: c.name, r: rectOf(c.style, v) }));
    for (const { name, r } of rects) {
      const safe = { x0: v.insets.left, y0: v.insets.top, x1: v.w - v.insets.right, y1: v.h - v.insets.bottom };
      if (r.x0 < safe.x0 || r.y0 < safe.y0 || r.x1 > safe.x1 || r.y1 > safe.y1) outside.push(`${v.name} :: ${name}`);
    }
    for (let a = 0; a < rects.length; a++) {
      for (let b = a + 1; b < rects.length; b++) {
        pairs += 1;
        if (intersects(rects[a].r, rects[b].r)) {
          const [p, q] = [rects[a].name, rects[b].name].sort();
          overlaps.push(`${v.name} :: ${p} x ${q}`);
        }
      }
    }
  }
  return { overlaps: overlaps.sort(), outside: outside.sort(), pairs };
}

const ORIGINAL_VIEWPORT = { name: 'jsdom default', w: window.innerWidth, h: window.innerHeight };
afterEach(() => {
  cleanup();
  setActive(false);
});
afterAll(() => setViewport(ORIGINAL_VIEWPORT));

describe('the evaluator reads the overlay\'s CSS as a browser would', () => {
  const v = { w: 1000, h: 800, insets: { top: 7, right: 11, bottom: 13, left: 17 } };
  it('resolves every form the overlay uses — px, %, calc, env(), max(), a bare number', () => {
    expect(cssPx(52, 1000, v.insets)).toBe(52);
    expect(cssPx('11%', 800, v.insets)).toBeCloseTo(88, 9);
    expect(cssPx('calc(11% + 96px)', 800, v.insets)).toBeCloseTo(184, 9);
    expect(cssPx('calc(50% - 84px + 112px)', 800, v.insets)).toBeCloseTo(428, 9);
    expect(cssPx('calc(env(safe-area-inset-right,0px) + 26px)', 1000, v.insets)).toBe(37);
    expect(cssPx('calc(env(safe-area-inset-top,0px) + 10px)', 800, v.insets)).toBe(17);
    expect(cssPx('max(env(safe-area-inset-left,0px), 7%)', 1000, v.insets)).toBeCloseTo(70, 9); // 7% beats 17 px
    expect(cssPx('max(env(safe-area-inset-left,0px), 7%)', 200, v.insets)).toBe(17); // the inset beats 14 px
  });
  it('places a right/bottom box and a left/top box in viewport coordinates', () => {
    expect(rectOf({ right: 'calc(env(safe-area-inset-right,0px) + 26px)', bottom: '11%', width: 84, height: 84 }, v))
      .toEqual({ x0: 1000 - 37 - 84, y0: 800 - 88 - 84, x1: 1000 - 37, y1: 800 - 88 });
    expect(rectOf({ top: 'calc(50% - 140px)', left: 'calc(env(safe-area-inset-left,0px) + 10px)', width: 46, height: 46 }, v))
      .toEqual({ x0: 27, y0: 260, x1: 73, y1: 306 });
  });
  it('refuses what it cannot read rather than calling it 0', () => {
    expect(() => cssPx('calc(1vh + 2px)', 800, v.insets)).toThrow();
    expect(() => cssPx('env(keyboard-inset-height)', 800, v.insets)).toThrow();
    expect(() => rectOf({ right: 0, bottom: 0, width: 10 }, v)).toThrow();
  });
  it('touching edges is not an overlap; one shared pixel is', () => {
    expect(intersects({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 10, y0: 0, x1: 20, y1: 10 })).toBe(false);
    expect(intersects({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 9, y0: 9, x1: 20, y1: 20 })).toBe(true);
  });
});

describe('F1 — no two touch controls overlap, in any viewport', () => {
  let universes;
  let hud;
  beforeAll(() => {
    hud = hudControls();
    universes = renderAll(VIEWPORTS, hud);
  });

  it('the universe is every control the overlay renders with everything open, plus the HUD\'s top band — in every viewport', () => {
    // pause, action, cast, jump, dodge, the tray toggle, the Aspect opener, the spell opener; each tray row; each
    // Aspect sector; each spell sector; the joystick base; and the HUD's top-band controls.
    const expected = 8 + TRAY_PANELS.length + ASPECT_VERBS.length + SPELL_ORDER.length + 1 + HUD_CONTROLS.length;
    expect(universes, 'not every viewport was rendered').toHaveLength(VIEWPORTS.length);
    for (const { v, controls } of universes) {
      const names = controls.map((c) => c.name);
      for (const must of ['touch-jump', 'touch-aspects', 'touch-spells', 'touch-pause', 'joystick', 'hud-settings']) {
        expect(names, `${v.name}: ${must} is missing from the universe`).toContain(must);
      }
      expect(names).not.toContain('touch-tap-to-play'); // input is live: it is not a control here
      expect(controls, `${v.name}: the universe holds ${controls.length} controls: ${names.join(', ')}`).toHaveLength(expected);
      expect(new Set(names).size, `${v.name}: two controls share a name — the overlap report would be ambiguous`).toBe(expected);
    }
  });

  it('PRESENCE: the instrument sees an overlap when there is one (two copies of the jump)', () => {
    const jump = universes[0].controls.find((c) => c.name === 'touch-jump');
    const { overlaps, pairs } = measure(VIEWPORTS.map((v) => ({ v, controls: [jump, { ...jump, name: 'jump-copy' }] })));
    expect(pairs).toBe(VIEWPORTS.length);
    expect(overlaps).toHaveLength(VIEWPORTS.length);
  });

  it('no two controls intersect in any viewport, beyond the declared debt (which may fall, never rise)', () => {
    const { overlaps, pairs } = measure(universes);
    const n = universes[0].controls.length;
    // THE DENOMINATOR, printed and asserted: a loop that enumerated nothing would report a clean pass.
    console.info(`[touch-layout] ${pairs} control pairs checked (${n} controls x ${VIEWPORTS.length} viewports, one render each); ${overlaps.length} overlap, ${KNOWN_OVERLAPS.length} declared`);
    expect(VIEWPORTS, 'the viewport matrix shrank').toHaveLength(24);
    expect(pairs, 'the gate checked no pair at all').toBeGreaterThan(0);
    expect(pairs, 'not every pair was measured in every viewport').toBe(VIEWPORTS.length * (n * (n - 1)) / 2);
    expect(overlaps, `${overlaps.length} overlapping pairs over ${pairs} checked (${n} controls x ${VIEWPORTS.length} viewports)`)
      .toEqual(KNOWN_OVERLAPS.map(([row]) => row).sort());
  });

  // ROUND 2: the regression this gate could not see. Nothing may sit over the HUD's Settings gear (a tap there would open
  // the overlay control instead of Settings) or over the Pause — in any viewport, with no debt row to hide behind.
  it('no control sits over the HUD\'s Settings gear or the Pause, in any viewport', () => {
    const { overlaps } = measure(universes);
    expect(overlaps.filter((row) => /hud-settings|touch-pause/.test(row))).toEqual([]);
  });

  it('PRESENCE: the matrix places the spell row both ways — on the edge where the stack fits, inward of the Pause where it does not', () => {
    const placed = { edge: [], inward: [] };
    for (const { v, controls } of universes) {
      const r = rectOf(controls.find((c) => c.name === 'touch-spells').style, v);
      const pauseInner = v.w - 64 - 46; // TouchControls' Pause: right 64, 46 px wide
      if (r.x1 === v.w - v.insets.right - 26) placed.edge.push(v.name);
      else if (r.x1 <= pauseInner) placed.inward.push(v.name);
      else throw new Error(`${v.name}: the spell opener is neither on the edge nor inward of the Pause (x1 ${r.x1})`);
    }
    expect(placed.inward, 'no viewport exercised the short-landscape placement — the switch is untested here').not.toEqual([]);
    expect(placed.edge, 'no viewport exercised the stacked placement').not.toEqual([]);
    expect(placed.inward.every((name) => /landscape/.test(name)), `a portrait viewport moved the spell row: ${placed.inward}`).toBe(true);
  });

  it('the spell row\'s glyphs sit exactly on its hit-targets, in every viewport (both layers read one anchor)', () => {
    const compared = universes.length * SPELL_GLYPH_PAIRS.length;
    expect(compared, 'no glyph was compared').toBe(VIEWPORTS.length * (1 + SPELL_ORDER.length));
    expect(universes.flatMap((u) => u.glyphDrift)).toEqual([]);
  });

  it('F1 itself is in no viewport, and the debt touches no iPad — the device this game is built for', () => {
    const { overlaps } = measure(universes);
    // Every pair the review named: the opener and the jump, and any ring sector on the jump or the dodge.
    const f1 = overlaps.filter((row) => /touch-aspect/.test(row) && /touch-(jump|dodge)\b/.test(row));
    expect(f1).toEqual([]);
    expect(overlaps.filter((row) => row.startsWith('iPad'))).toEqual([]);
    expect(VIEWPORTS.filter((v) => v.name.startsWith('iPad')), 'the iPad half of the matrix shrank').toHaveLength(10);
  });

  it('no opener is covered by a sector of its own ring (F4: the opener must stay a toggle)', () => {
    const { overlaps } = measure(universes);
    expect(overlaps.filter((row) => /touch-aspect-\w+ x touch-aspects|touch-spell-\w+ x touch-spells/.test(row))).toEqual([]);
  });

  it('every control lies inside the safe area of every viewport — the overlay\'s all do; the HUD\'s debt is declared', () => {
    const { outside } = measure(universes);
    expect(outside).toEqual([...KNOWN_OUTSIDE].sort());
  });
});

// The switch between the two placements is a threshold on the height, and the named viewports land either side of it
// without touching it. So every whole-pixel height from 300 to 480 is rendered at a landscape width: the spell row and
// the top band must never meet, and both must stay inside the viewport, on either side of the switch and at it.
describe('round 2 — the spell row and the top band, swept across every height from 300 to 480 px', () => {
  // DECLARED LIMIT, measured by this sweep: the column is 13% + 266 px tall, so below 306 px of height it does not fit at
  // all — the ASPECT row (its top 0.87H - 208 px) reaches the band, and the spell row (its top 0.87H - 266 px) leaves the
  // top of the screen. No viewport in the matrix is that short — the shortest, Safari on an iPhone SE in landscape, is
  // 320. It may fall, never rise: nothing at all at or above the floor, and below it only those two.
  const ASPECT_ROW_FLOOR_PX = 306;

  it('no height puts the spell row on the Settings gear or the Pause, or off the screen (181 of 181)', () => {
    const hud = hudControls();
    const sweep = [];
    for (let h = 300; h <= 480; h++) sweep.push(vp(`sweep 900x${h}`, 900, h));
    const universes = renderAll(sweep, hud);
    const { overlaps, outside } = measure(universes);
    const band = /hud-settings|touch-pause/;
    const spellRow = /touch-spell/;
    const heightOf = (row) => Number(/^sweep 900x(\d+) ::/.exec(row)[1]);
    const touching = overlaps.filter((row) => band.test(row) || spellRow.test(row));
    console.info(`[touch-layout] sweep: ${universes.length} heights; ${touching.length} band / spell-row overlaps, all below ${ASPECT_ROW_FLOOR_PX} px`);
    expect(universes, 'the sweep rendered no viewport').toHaveLength(181);
    expect(touching.filter((row) => spellRow.test(row)), 'the spell row met something').toEqual([]);
    expect(touching.filter((row) => heightOf(row) >= ASPECT_ROW_FLOOR_PX), 'the top band met something at a supported height').toEqual([]);
    expect(touching.filter((row) => !/touch-aspect/.test(row)), 'below the floor, something other than the Aspect row met the band').toEqual([]);
    // PRESENCE: the same sweep sees the band being met (by the Aspect row, below its floor), so its zeros above are earned.
    expect(touching.length, 'the sweep saw no overlap with the band at any height — the instrument may be blind').toBeGreaterThan(0);
    const offScreen = outside.filter((row) => spellRow.test(row));
    expect(offScreen.filter((row) => heightOf(row) >= ASPECT_ROW_FLOOR_PX), 'the spell row left the screen at a supported height').toEqual([]);
    expect(outside.filter((row) => !spellRow.test(row)), 'something other than the spell row left the screen').toEqual([]);
    // Its own budget, not the suite's 20 s: 181 full renders took 5.9 s alone and 20.8-22.6 s in a pre-commit full suite
    // at load 100-165 (2026-10-28), which failed the commit with every assertion green. The sweep stays exhaustive.
  }, 90_000);
});
