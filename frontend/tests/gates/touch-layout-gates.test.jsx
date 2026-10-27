// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { setActive } from '../../src/input/inputState.js';
import { ASPECT_VERBS } from '../../src/input/aspectWheel.js';
import { SPELL_ORDER } from '../../src/input/spellPicker.js';
import { TRAY_PANELS } from '../../src/ui/touchTray.js';
import TouchControls from '../../src/ui/TouchControls.jsx';

// NO TWO TOUCH CONTROLS OVERLAP — a PROPERTY over every control the overlay renders, in every viewport below.
//
// WHY (review F1, 2026-10-27). Phase 0c showed the Aspect-ring opener to every touch player, and it sat on the centre
// of the jump button: a fresh player's jump tap opened the ring, and the next tap opened Talents with input off. No
// check could see it — jsdom has no layout, and every gate here asserted that a control EXISTS, never WHERE. The opener
// had overlapped the jump for every player with an Aspect unlocked since X1; 0c only widened who was hit.
//
// WHAT IS MEASURED. The overlay is rendered for real, with EVERYTHING open at once (the tray, the Aspect ring and the
// spell ring are independent states, so a player can have all three open). Every `[data-touch-btn]` it renders, plus
// the joystick base (the zone the drawn stick sends the thumb to), is a control. Each control's rectangle is computed
// from the EXACT style object React was handed — the CSS strings the browser will evaluate — by a small evaluator below
// that resolves calc() / env(safe-area-inset-*) / max() / % against each viewport. jsdom cannot be used for that: its
// CSS parser rewrites `calc(env(...) + 26px)` into garbage and drops `max(env(...), 7%)` (measured), so the gate reads
// React's own props for each element (`__reactProps$…`) and fails SETUP, loudly, if React stops exposing them.
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
//
// BLIND SPOTS, stated: this is geometry, not hit-testing — stacking order, pointer-events and a real browser's CSS
// engine are tests/e2e/touch-hold.spec.js's "every control owns its own centre". It does not model the HUD outside the
// overlay (the settings gear, the hotbar, the minimap), the on-screen keyboard, or Safari's toolbar animating mid-play.
// The glyph layer is not in the universe: the fans share fanItemStyle with their hit-targets, but the action / cast /
// jump / dodge glyphs are drawn at their own (larger) rectangles and are not checked here.

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
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const vp = (name, w, h, insets = NO_INSETS) => ({ name, w, h, insets });
// Playwright 1.x device descriptors (node_modules/playwright-core, read 2026-10-27): Safari's visible viewport.
const VIEWPORTS = [
  vp('iPad Pro 11', 834, 1194), vp('iPad Pro 11 landscape', 1194, 834),
  vp('iPad (gen 7)', 810, 1080), vp('iPad (gen 7) landscape', 1080, 810),
  vp('iPad (gen 11)', 656, 944), vp('iPad (gen 11) landscape', 944, 656),
  vp('iPad Mini', 768, 1024), vp('iPad Mini landscape', 1024, 768),
  // iPad Air / iPad (10th gen) full screen (a home-screen launch, no Safari chrome): the 820 x 1180 CSS viewport the
  // masterpiece plan names for Kevin's device. Not a Playwright descriptor; the iPad Air 11" screen in CSS px.
  vp('iPad Air full screen', 820, 1180), vp('iPad Air full screen landscape', 1180, 820),
  vp('iPhone SE', 320, 568), vp('iPhone SE landscape', 568, 320),
  vp('iPhone SE (3rd gen)', 375, 667), vp('iPhone SE (3rd gen) landscape', 667, 375),
  vp('iPhone 14', 390, 664), vp('iPhone 14 landscape', 750, 340),
  vp('iPhone 15 Pro', 393, 659), vp('iPhone 15 Pro landscape', 734, 343),
  vp('iPhone 15 Pro Max', 430, 739), vp('iPhone 15 Pro Max landscape', 814, 380),
  // Full screen under viewport-fit=cover (a home-screen launch): the notch and home indicator as env() insets.
  vp('iPhone 14 cover', 390, 844, { top: 47, right: 0, bottom: 34, left: 0 }),
  vp('iPhone 14 cover landscape', 844, 390, { top: 0, right: 47, bottom: 21, left: 47 }),
  vp('iPhone 15 Pro Max cover', 430, 932, { top: 59, right: 0, bottom: 34, left: 0 }),
  vp('iPhone 15 Pro Max cover landscape', 932, 430, { top: 0, right: 59, bottom: 21, left: 59 }),
];

// The debt, measured 2026-10-27 on the F1 layout. Each row is `viewport :: control x control` with its cause; the
// measured set must EQUAL the rows, so a new overlap is red and a fixed one is red until its row is deleted.
//   TRAY  pre-existing: the tray column (left edge, rows at 50% - 84px + 56px*i) runs down into the joystick base
//         (13% from the bottom, 148px) on every phone. Neither moved for F1; the zone was simply never measured.
//   SE    pre-existing: on a 320px-wide phone the cast and dodge columns reach the joystick base.
//   SHORT arithmetic: the right column is taller than a ~340px landscape. Its top (13% + 266px for the spell row, plus
//         the 56px band the Pause control holds) exceeds H below H ~ 370px, so the spell row meets Pause: Safari's
//         visible landscape viewport on an iPhone 14 / 15 Pro / SE. At 340 and 343 it is new — the old layout fitted
//         there only by stacking the Aspect row ON the jump (F1 itself); at 320 the old layout had it too.
//   FAN   introduced, accepted: on a 320px-wide phone the fan's last sector reaches the tray column when the tray and a
//         ring are open together. The fan now starts one step inward so its opener stays a toggle (F4): 26px + 5 x
//         58px - 6px = 310px of a 320px width.
const KNOWN_OVERLAPS = [
  ['iPhone 14 :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone 14 cover landscape :: joystick x touch-tray-build', 'TRAY'],
  ['iPhone 14 cover landscape :: joystick x touch-tray-craft', 'TRAY'],
  ['iPhone 14 cover landscape :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone 14 landscape :: joystick x touch-tray-build', 'TRAY'],
  ['iPhone 14 landscape :: joystick x touch-tray-craft', 'TRAY'],
  ['iPhone 14 landscape :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone 14 landscape :: touch-pause x touch-spell-fireball', 'SHORT'],
  ['iPhone 14 landscape :: touch-pause x touch-spells', 'SHORT'],
  ['iPhone 15 Pro :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone 15 Pro Max :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone 15 Pro Max cover landscape :: joystick x touch-tray-build', 'TRAY'],
  ['iPhone 15 Pro Max cover landscape :: joystick x touch-tray-craft', 'TRAY'],
  ['iPhone 15 Pro Max cover landscape :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone 15 Pro Max landscape :: joystick x touch-tray-build', 'TRAY'],
  ['iPhone 15 Pro Max landscape :: joystick x touch-tray-craft', 'TRAY'],
  ['iPhone 15 Pro Max landscape :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone 15 Pro landscape :: joystick x touch-tray-build', 'TRAY'],
  ['iPhone 15 Pro landscape :: joystick x touch-tray-craft', 'TRAY'],
  ['iPhone 15 Pro landscape :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone 15 Pro landscape :: touch-pause x touch-spell-fireball', 'SHORT'],
  ['iPhone 15 Pro landscape :: touch-pause x touch-spells', 'SHORT'],
  ['iPhone SE (3rd gen) :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone SE (3rd gen) landscape :: joystick x touch-tray-build', 'TRAY'],
  ['iPhone SE (3rd gen) landscape :: joystick x touch-tray-craft', 'TRAY'],
  ['iPhone SE (3rd gen) landscape :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone SE :: joystick x touch-cast', 'SE'],
  ['iPhone SE :: joystick x touch-dodge', 'SE'],
  ['iPhone SE :: joystick x touch-tray-build', 'TRAY'],
  ['iPhone SE :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone SE :: touch-aspect-imbue x touch-tray-build', 'FAN'],
  ['iPhone SE :: touch-aspect-imbue x touch-tray-craft', 'FAN'],
  ['iPhone SE :: touch-spell-arcane x touch-tray-craft', 'FAN'],
  ['iPhone SE :: touch-spell-arcane x touch-tray-inventory', 'FAN'],
  ['iPhone SE landscape :: joystick x touch-tray-build', 'TRAY'],
  ['iPhone SE landscape :: joystick x touch-tray-craft', 'TRAY'],
  ['iPhone SE landscape :: joystick x touch-tray-magic', 'TRAY'],
  ['iPhone SE landscape :: touch-pause x touch-spell-fireball', 'SHORT'],
  ['iPhone SE landscape :: touch-pause x touch-spells', 'SHORT'],
];

// ---------------------------------------------------------------------------------------------------------------------
// The universe: render the overlay with everything open and read each control's own style object
// ---------------------------------------------------------------------------------------------------------------------
const reactProps = (el) => {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  if (!key) throw new Error('SETUP: React no longer exposes __reactProps$ on DOM nodes — the gate cannot read the style it measures');
  return el[key];
};
const nameOf = (el) => el.getAttribute('data-testid') || el.getAttribute('data-touch-zone') || `aria:${el.getAttribute('aria-label')}`;

/** Every control of the live overlay, everything open: [{ name, style }]. */
function renderUniverse() {
  useGameStore.setState({ unlockedTalents: {} });
  setActive(true);
  render(<TouchControls isWorldBuilt />);
  fireEvent.pointerUp(screen.getByTestId('touch-panels'));
  fireEvent.pointerUp(screen.getByTestId('touch-aspects'));
  fireEvent.pointerUp(screen.getByTestId('touch-spells'));
  const controls = [];
  for (const el of document.querySelectorAll('[data-touch-btn], [data-touch-zone]')) {
    const props = reactProps(el);
    // THE COORDINATE FRAME: each control must be positioned by a fixed, inset:0 layer, or its numbers mean something
    // else. (The hit-targets are children of the overlay root; the joystick base of the glyph surface's root.)
    const parentStyle = reactProps(el.parentElement).style || {};
    if (parentStyle.position !== 'fixed' || !(parentStyle.inset === 0 || parentStyle.inset === '0')) {
      throw new Error(`SETUP: ${nameOf(el)} is not positioned by a fixed inset:0 layer (${JSON.stringify(parentStyle)})`);
    }
    controls.push({ name: nameOf(el), style: props.style || {} });
  }
  return controls;
}

/** The overlaps (`viewport :: a x b`, names sorted) and the out-of-safe-area controls, over every viewport. */
function measure(controls) {
  const overlaps = [];
  const outside = [];
  let pairs = 0;
  for (const v of VIEWPORTS) {
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

afterEach(() => {
  cleanup();
  setActive(false);
});

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
  let controls;
  beforeAll(() => {
    controls = renderUniverse();
    cleanup();
  });

  it('the universe is every control the overlay renders with everything open — counted against the registries', () => {
    // pause, action, cast, jump, dodge, the tray toggle, the Aspect opener, the spell opener; each tray row; each
    // Aspect sector; each spell sector; and the joystick base.
    const expected = 8 + TRAY_PANELS.length + ASPECT_VERBS.length + SPELL_ORDER.length + 1;
    expect(controls.map((c) => c.name)).toContain('touch-jump');
    expect(controls.map((c) => c.name)).toContain('touch-aspects');
    expect(controls.map((c) => c.name)).toContain('joystick');
    expect(controls.map((c) => c.name)).not.toContain('touch-tap-to-play'); // input is live: it is not a control here
    expect(controls, `the overlay rendered ${controls.length} controls: ${controls.map((c) => c.name).join(', ')}`).toHaveLength(expected);
    expect(new Set(controls.map((c) => c.name)).size, 'two controls share a name — the overlap report would be ambiguous').toBe(expected);
  });

  it('PRESENCE: the instrument sees an overlap when there is one (two copies of the jump)', () => {
    const jump = controls.find((c) => c.name === 'touch-jump');
    const { overlaps, pairs } = measure([jump, { ...jump, name: 'jump-copy' }]);
    expect(pairs).toBe(VIEWPORTS.length);
    expect(overlaps).toHaveLength(VIEWPORTS.length);
  });

  it('no two controls intersect in any viewport, beyond the declared debt (which may fall, never rise)', () => {
    const { overlaps, pairs } = measure(controls);
    const n = controls.length;
    // THE DENOMINATOR, printed and asserted: a loop that enumerated nothing would report a clean pass.
    console.info(`[touch-layout] ${pairs} control pairs checked (${n} controls x ${VIEWPORTS.length} viewports); ${overlaps.length} overlap, ${KNOWN_OVERLAPS.length} declared`);
    expect(VIEWPORTS, 'the viewport matrix shrank').toHaveLength(24);
    expect(pairs, 'the gate checked no pair at all').toBeGreaterThan(0);
    expect(pairs, 'not every pair was measured in every viewport').toBe(VIEWPORTS.length * (n * (n - 1)) / 2);
    expect(overlaps, `${overlaps.length} overlapping pairs over ${pairs} checked (${n} controls x ${VIEWPORTS.length} viewports)`)
      .toEqual(KNOWN_OVERLAPS.map(([row]) => row).sort());
  });

  it('F1 itself is in no viewport, and the debt touches no iPad — the device this game is built for', () => {
    const { overlaps } = measure(controls);
    // Every pair the review named: the opener and the jump, and any ring sector on the jump or the dodge.
    const f1 = overlaps.filter((row) => /touch-aspect/.test(row) && /touch-(jump|dodge)\b/.test(row));
    expect(f1).toEqual([]);
    expect(overlaps.filter((row) => row.startsWith('iPad'))).toEqual([]);
    expect(VIEWPORTS.filter((v) => v.name.startsWith('iPad')), 'the iPad half of the matrix shrank').toHaveLength(10);
  });

  it('no opener is covered by a sector of its own ring (F4: the opener must stay a toggle)', () => {
    const { overlaps } = measure(controls);
    expect(overlaps.filter((row) => /touch-aspect-\w+ x touch-aspects|touch-spell-\w+ x touch-spells/.test(row))).toEqual([]);
  });

  it('every control lies inside the safe area of every viewport', () => {
    const { outside } = measure(controls);
    expect(outside).toEqual([]);
  });
});
