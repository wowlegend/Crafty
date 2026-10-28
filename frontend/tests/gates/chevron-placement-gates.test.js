import { describe, it, expect } from 'vitest';
import { chevronPlacement, touchBottomInsetPx } from '../../src/game/windupChevrons.js';
import { VIEWPORTS } from './_touchViewports.js';

/**
 * THE WINDUP CHEVRON SITS ON A VALID EDGE BAND IN EVERY VIEWPORT WE SUPPORT, AND AT EVERY HEIGHT (plan
 * docs/superpowers/plans/2026-10-27-crafty-combat-stance.md, Task 6).
 *
 * WHY. The frame a chevron rides is the safe-area container inset by the HUD: 120 px at the top, 96 at the sides, and
 * on touch round(0.11 h) + 170 at the bottom (the joystick and the action cluster). That bottom inset exceeds half the
 * height below about 436 px, which is every landscape iPhone, so the frame's bottom edge rose ABOVE the screen centre and
 * every ray with a downward part clamped to length 0: a windup behind the player drew its chevron exactly on the
 * crosshair. src/game/windupChevrons.test.js pinned three sizes, all tall enough, and the touch e2e runs an iPad only.
 *
 * WHAT "VALID" MEANS HERE, per container and per angle (360 of them): the chevron's centre is ON the frame (one
 * coordinate on an edge, both inside it); its distance from the screen centre is at least 60 px along the axis it is
 * displaced on (the frame's edges stay 60 px clear of the crosshair and the imbue tell); and its 30 px box lies inside
 * the container. Every edge is reached by some angle (presence, so the zeros are earned). Where the plan's insets fit,
 * the frame IS the plan's, unchanged (no regression on an iPad). The containers: the 24 viewports of the touch-layout
 * matrix (./_touchViewports.js, shared with touch-layout-gates), each less its safe-area insets as the chevron layer's
 * own container is (ui/WindupChevrons.jsx), and a sweep of every whole-pixel height from 300 to 1400 at three widths.
 *
 * THE YARDSTICK IS LITERAL: 96 / 120 / 60 / 30 and the inset's 0.11 h + 170 are written here, not imported, so a mutant
 * of the module's constants cannot move the frame this gate measures against. Only the subject's own placement is read.
 *
 * WHAT THIS DOES NOT CHECK: that the chevron clears the touch CONTROLS. Below about 436 px the controls and the HUD fill
 * the bands the frame gives way into, so on a landscape phone a chevron near a lower corner can sit over (beneath,
 * z 38 under the overlay's 40, pointer-events none) the joystick or the action cluster. The crosshair is the one
 * place it may never be. On an iPad the chevrons clearing every control is tests/e2e/combat-touch.spec.js case 3.
 */

const SIDE = 96, TOP = 120, CLEAR = 60, HALF_BOX = 15, ANGLES = 360;
const touchInset = (h) => Math.round(0.11 * h) + 170;

/** The frame, from the literals: the plan's insets, each edge held CLEAR px from the centre. */
function frame(w, h) {
  const cx = w / 2, cy = h / 2;
  return {
    cx, cy,
    L: Math.min(SIDE, cx - CLEAR), R: Math.max(w - SIDE, cx + CLEAR),
    T: Math.min(TOP, cy - CLEAR), B: Math.max(h - touchInset(h), cy + CLEAR),
  };
}

/** Every angle in one container: the failures (as strings) and which edges were reached. */
function placeAll(name, w, h) {
  const f = frame(w, h);
  const bad = [];
  const edges = { top: 0, right: 0, bottom: 0, left: 0 };
  for (let i = 0; i < ANGLES; i++) {
    const deg = i - 180;
    const p = chevronPlacement((deg * Math.PI) / 180, w, h, touchBottomInsetPx(h));
    const at = `${name} ${deg}°: (${p.left.toFixed(1)}, ${p.top.toFixed(1)})`;
    if (!Number.isFinite(p.left) || !Number.isFinite(p.top)) { bad.push(`${at} not finite`); continue; }
    if (p.left < f.L - 0.5 || p.left > f.R + 0.5 || p.top < f.T - 0.5 || p.top > f.B + 0.5) bad.push(`${at} off the frame [${f.L}, ${f.R}] x [${f.T}, ${f.B}]`);
    const dL = Math.abs(p.left - f.L), dR = Math.abs(p.left - f.R), dT = Math.abs(p.top - f.T), dB = Math.abs(p.top - f.B);
    if (Math.min(dL, dR, dT, dB) > 0.5) bad.push(`${at} inside the frame, on no edge`);
    if (Math.max(Math.abs(p.left - f.cx), Math.abs(p.top - f.cy)) < CLEAR - 0.5) bad.push(`${at} within ${CLEAR} px of the centre (${f.cx}, ${f.cy})`);
    if (p.left - HALF_BOX < 0 || p.left + HALF_BOX > w || p.top - HALF_BOX < 0 || p.top + HALF_BOX > h) bad.push(`${at} box leaves the ${w}x${h} container`);
    if (dT <= 0.5) edges.top++;
    if (dR <= 0.5) edges.right++;
    if (dB <= 0.5) edges.bottom++;
    if (dL <= 0.5) edges.left++;
  }
  return { bad, edges, f };
}

const container = (v) => ({ w: v.w - v.insets.left - v.insets.right, h: v.h - v.insets.top - v.insets.bottom });

describe('windup chevron placement on touch: a valid edge band everywhere', () => {
  it('every viewport of the touch-layout matrix, 360 angles each', () => {
    expect(VIEWPORTS, 'the viewport matrix shrank').toHaveLength(24);
    const bad = [];
    let placed = 0, short = 0;
    for (const v of VIEWPORTS) {
      const { w, h } = container(v);
      const r = placeAll(v.name, w, h);
      bad.push(...r.bad);
      for (const [edge, n] of Object.entries(r.edges)) if (n === 0) bad.push(`${v.name}: no angle reached the ${edge} edge`);
      if (h - touchInset(h) < h / 2 + CLEAR) short++;
      placed += ANGLES;
    }
    console.info(`[chevron-placement] ${placed} placements over ${VIEWPORTS.length} viewports; ${short} too short for the touch inset; ${bad.length} invalid`);
    expect(placed).toBe(24 * ANGLES);
    // PRESENCE: the matrix holds viewports where the shipped frame put the bottom edge above the centre, so the zero
    // below is measured over the case the review found, not around it.
    expect(short, 'no viewport in the matrix is short enough to exercise the clearance').toBeGreaterThanOrEqual(8);
    expect(bad.slice(0, 12), `${bad.length} invalid placements`).toEqual([]);
  });

  it('every whole-pixel height from 300 to 1400, at a portrait, a phone-landscape and a tablet width', () => {
    const bad = [];
    let containers = 0;
    for (const w of [390, 900, 1400]) for (let h = 300; h <= 1400; h++) {
      const r = placeAll(`${w}x${h}`, w, h);
      bad.push(...r.bad);
      containers++;
    }
    console.info(`[chevron-placement] sweep: ${containers} containers x ${ANGLES} angles; ${bad.length} invalid`);
    expect(containers).toBe(3 * 1101);
    expect(bad.slice(0, 12), `${bad.length} invalid placements`).toEqual([]);
  });

  it('the review\'s case: a windup behind on an 844 x 372 landscape iPhone sits 60 px below the crosshair, not on it', () => {
    const p = chevronPlacement(Math.PI, 844, 372, touchBottomInsetPx(372));
    expect(p.left).toBeCloseTo(422, 6);
    expect(p.top, 'the chevron for a windup behind sat on the crosshair').toBeCloseTo(186 + 60, 6);
  });

  it('where the plan\'s insets fit, the frame is the plan\'s: behind is bottom-centre at h - (0.11 h + 170)', () => {
    let checked = 0;
    for (const v of VIEWPORTS.filter((x) => x.name.startsWith('iPad'))) {
      const { w, h } = container(v);
      const p = chevronPlacement(Math.PI, w, h, touchBottomInsetPx(h));
      expect(p.top, `${v.name}: the bottom edge moved where the inset fits`).toBeCloseTo(h - touchInset(h), 6);
      const up = chevronPlacement(0, w, h, touchBottomInsetPx(h));
      expect(up.top, `${v.name}: the top edge moved where the inset fits`).toBeCloseTo(TOP, 6);
      checked++;
    }
    expect(checked, 'the iPad half of the matrix shrank').toBe(10);
  });
});
