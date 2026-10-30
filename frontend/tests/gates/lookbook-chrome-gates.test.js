import { describe, it, expect } from 'vitest';
import {
  chromeShare, chromeColoursFrom, CHROME_VARS, CHROME_TOLERANCE, chromeFootprint, framesMoved, FOOTPRINT_TOLERANCE,
  atRest, chromeSummaryLines, CHROME_BUDGET, footprintByRect,
} from '../../scripts/visual/_lookbook.mjs';

/**
 * The HUD lane's acceptance number is the chrome's FOOTPRINT: the share of an eye-level frame the HUD's own elements
 * change, read on a held page against a twin with them hidden (plan docs/superpowers/plans/2026-10-29-crafty-w2d-hud.md,
 * decision 1). The colour count is its second column. These drive both over synthetic frames whose answer is known by
 * construction, on the navy ladder and on the warm one, over a warm stone world that sits within the tolerance of the
 * warm tokens.
 *
 * NOT CHECKED HERE: that the lookbook holds the page still and hides the right elements in a browser; each shot records
 * `chrome.moved` (pixels changed between the first and last shot of the held page) and an opened frame shows the HUD.
 */
const W = 100, H = 100;
const SKY = [120, 170, 220];
const PANEL = { name: '--ui-panel', rgb: [22, 33, 58] };
const SLOT = { name: '--ui-slot', rgb: [35, 52, 88] };
// The warm ladder (theme/tokens.js after the re-key): panel, panel-raise, panel-frame, panel-inset.
const WARM = [
  { name: '--ui-panel', rgb: [42, 36, 32] }, { name: '--ui-panel-raise', rgb: [56, 48, 42] },
  { name: '--ui-panel-frame', rgb: [48, 41, 36] }, { name: '--ui-panel-inset', rgb: [24, 20, 17] },
];

/** A W x H RGBA frame filled with `bg`, then each `[x0, y0, x1, y1, rgb]` rectangle painted over it. */
function frame(bg, rects = []) {
  const buf = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let c = bg;
      for (const [x0, y0, x1, y1, rgb] of rects) if (x >= x0 && x < x1 && y >= y0 && y < y1) c = rgb;
      buf.set([c[0], c[1], c[2], 255], i);
    }
  }
  return buf;
}

describe('the chrome share of a frame', () => {
  it('a 10% rectangle in one surface colour reads 10%, and its pixels are counted under that colour', () => {
    const on = frame(SKY, [[0, 0, 100, 10, PANEL.rgb]]);
    const r = chromeShare(on, null, { width: W, height: H, colours: [PANEL, SLOT] });
    expect(r.checked, 'the denominator is every pixel of the frame').toBe(W * H);
    expect(r.share).toBeCloseTo(0.10, 6);
    expect(r.byColour).toEqual({ '--ui-panel': 1000, '--ui-slot': 0 });
  });

  it('5% in each of two surface colours reads 10%: every colour in the list is counted', () => {
    const on = frame(SKY, [[0, 0, 100, 5, PANEL.rgb], [0, 50, 100, 55, SLOT.rgb]]);
    const r = chromeShare(on, null, { width: W, height: H, colours: [PANEL, SLOT] });
    expect(r.share).toBeCloseTo(0.10, 6);
    expect(r.byColour).toEqual({ '--ui-panel': 500, '--ui-slot': 500 });
  });

  it('a pixel off a surface colour by the tolerance counts, and one past it does not', () => {
    const near = PANEL.rgb.map((v) => v + CHROME_TOLERANCE);
    const far = [PANEL.rgb[0], PANEL.rgb[1] + CHROME_TOLERANCE + 1, PANEL.rgb[2]];
    const on = frame(SKY, [[0, 0, 100, 4, near], [0, 4, 100, 10, far]]);
    const r = chromeShare(on, null, { width: W, height: H, colours: [PANEL] });
    expect(r.pixels).toBe(400);
  });

  it('a sky that sits on a surface colour in the HUD-hidden twin as well is the world, not chrome', () => {
    // A dusk sky band across the top fifth happens to be the panel colour; a real panel covers 8% lower down.
    const on = frame(SKY, [[0, 0, 100, 20, PANEL.rgb], [0, 60, 100, 68, PANEL.rgb]]);
    const off = frame(SKY, [[0, 0, 100, 20, PANEL.rgb]]);
    const r = chromeShare(on, off, { width: W, height: H, colours: [PANEL] });
    expect(r.world, 'the sky band was set aside').toBe(2000);
    expect(r.share).toBeCloseTo(0.08, 6);
  });

  it('refuses frames of the wrong size and an empty colour list, rather than reading 0', () => {
    const on = frame(SKY);
    expect(() => chromeShare(on.subarray(4), null, { width: W, height: H, colours: [PANEL] })).toThrow(RangeError);
    expect(() => chromeShare(on, null, { width: W, height: H, colours: [] })).toThrow(/no chrome colours/);
  });
});

describe('the chrome colours read from a page', () => {
  it('parses each variable cssVars.js writes, in order, and drops one that is missing or malformed', () => {
    const vars = Object.fromEntries(CHROME_VARS.map((v, k) => [v, ` ${k} ${k + 1} ${k + 2}`]));
    vars['--ui-well'] = '';
    vars['--ui-slot'] = '12 300 4';
    const out = chromeColoursFrom(vars);
    expect(out.map((c) => c.name)).toEqual(CHROME_VARS.filter((v) => v !== '--ui-well' && v !== '--ui-slot'));
    expect(out[0]).toEqual({ name: '--ui-ink', rgb: [0, 1, 2] });
  });
});

/** A warm grey stone texture: every pixel a deterministic step from the warm ladder's mid tones, so many sit within the
 *  colour count's tolerance of a warm token while none is interface. `bright` lifts every channel (a twin one shade off). */
function stone(bright = 0) {
  const buf = new Uint8Array(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    const k = (p * 2654435761) >>> 0;
    const base = [40 + (k % 20), 34 + ((k >>> 5) % 18), 30 + ((k >>> 10) % 16)];
    buf.set([base[0] + bright, base[1] + bright, base[2] + bright, 255], p * 4);
  }
  return buf;
}

/** `world` with `rgb` laid over the rows [y0, y1) at `alpha` (1: opaque), as a browser composites a panel. */
function over(world, rgb, y0, y1, alpha = 1) {
  const buf = world.slice();
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) buf[i + c] = Math.round(alpha * rgb[c] + (1 - alpha) * world[i + c]);
    }
  }
  return buf;
}

describe('the chrome footprint: the pixels the HUD changes, read without a palette', () => {
  it('a warm stone world with no chrome reads 0, where the colour count reads the stone as chrome', () => {
    const world = stone();
    const f = chromeFootprint(world, world, world, { width: W, height: H });
    expect(f.checked).toBe(W * H);
    expect(f.share).toBe(0);
    expect(f.touchShare).toBe(0);
    // The same frame through the colour count on the warm ladder, with a twin one shade brighter (a world that moved):
    // the stone is counted. This is the palette dependence the footprint does not have.
    const c = chromeShare(world, stone(1), { width: W, height: H, colours: WARM });
    expect(c.share, 'the colour count no longer reads the warm stone: this fixture lost its point').toBeGreaterThan(0.05);
  });

  it('a twin one shade off the frame (an encoder or compositor step) still reads 0', () => {
    const f = chromeFootprint(stone(), stone(1), null, { width: W, height: H });
    expect(f.share).toBe(0);
    expect(f.touchShare, 'no touch shot, no touch reading').toBeNull();
  });

  it('a 10% panel reads 10% over a world unlike it, and a little under over warm stone, on either ladder', () => {
    for (const rgb of [PANEL.rgb, WARM[0].rgb, WARM[1].rgb]) {
      const f = chromeFootprint(over(stone(), rgb, 0, 10), stone(), null, { width: W, height: H });
      // Each stone pixel the opaque panel lands on within the tolerance of its own colour reads unchanged: the footprint's
      // one blind spot, so the warm panels over warm stone read a little under 10%; never more.
      expect(f.share, `panel ${rgb}`).toBeLessThanOrEqual(0.10);
      expect(f.share, `panel ${rgb}`).toBeGreaterThan(0.09);
    }
    expect(chromeFootprint(over(stone(), PANEL.rgb, 0, 10), stone(), null, { width: W, height: H }).share).toBeCloseTo(0.10, 6);
  });

  it('a translucent panel at alpha 0.6 still counts, where the colour count misses its blend', () => {
    const on = over(stone(), WARM[0].rgb, 50, 60, 0.6);
    const f = chromeFootprint(on, stone(), null, { width: W, height: H });
    expect(f.share).toBeGreaterThan(0.09);
    expect(chromeShare(over(frame(SKY), PANEL.rgb, 50, 60, 0.6), frame(SKY), { width: W, height: H, colours: [PANEL] }).share,
      'the colour count reads a translucent navy panel over sky').toBe(0);
    expect(chromeFootprint(over(frame(SKY), PANEL.rgb, 50, 60, 0.6), frame(SKY), null, { width: W, height: H }).share).toBeCloseTo(0.10, 6);
  });

  it('a pixel changed in one channel alone counts past the tolerance and not at it, in each channel', () => {
    for (let ch = 0; ch < 3; ch++) {
      const base = frame([80, 80, 80]);
      const at = base.slice(), past = base.slice();
      for (let p = 0; p < 300; p++) at[p * 4 + ch] += FOOTPRINT_TOLERANCE;
      for (let p = 300; p < 700; p++) past[p * 4 + ch] += FOOTPRINT_TOLERANCE + 1;
      expect(chromeFootprint(at, base, null, { width: W, height: H }).pixels, `channel ${ch} at the tolerance`).toBe(0);
      expect(chromeFootprint(past, base, null, { width: W, height: H }).pixels, `channel ${ch} past it`).toBe(400);
    }
  });

  it('the touch layer is its own class: its scrim is not the HUD, and the HUD over it is', () => {
    const world = stone();
    const touchOnly = over(world, [0, 0, 0], 80, 100, 0.34); // the thumb-corner scrim
    const withHud = over(touchOnly, WARM[0].rgb, 0, 10); // a 10% panel above it
    const f = chromeFootprint(withHud, touchOnly, world, { width: W, height: H });
    expect(f.touchShare).toBeCloseTo(0.20, 6);
    expect(f.share).toBeLessThanOrEqual(0.10);
    expect(f.share).toBeGreaterThan(0.09);
    const none = chromeFootprint(touchOnly, touchOnly, world, { width: W, height: H });
    expect(none.share, 'a scrim alone is no HUD').toBe(0);
  });

  it('a held page that moved is seen, and frames of the wrong size are refused rather than read as 0', () => {
    expect(framesMoved(stone(), stone(), { width: W, height: H })).toBe(0);
    expect(framesMoved(stone(), over(stone(), SKY, 0, 3), { width: W, height: H })).toBe(300);
    expect(() => chromeFootprint(stone(), stone().subarray(4), null, { width: W, height: H })).toThrow(RangeError);
    expect(() => chromeFootprint(stone(), null, null, { width: W, height: H })).toThrow(RangeError);
  });
});

// THE BLIND SPOT, pinned: the footprint reads change, so a surface that changes the world under it by FOOTPRINT_TOLERANCE
// or less in every channel is not counted. Warm chrome over a warm world is where that happens: an opaque panel reads
// short of its area by every pixel it lands on within the tolerance of its own colour, and a faint translucent one reads
// nothing. The numbers are the fixture's, not the game's; what they pin is that the count is exactly the changed pixels.
describe('the footprint\'s blind spot: warm chrome over a world near its colour', () => {
  /** A world drawn from the warm panel's neighbourhood: each channel within 4 of --ui-panel's warm value. */
  function nearWarm() {
    const buf = new Uint8Array(W * H * 4);
    for (let p = 0; p < W * H; p++) {
      const k = (p * 2654435761) >>> 0;
      buf.set([WARM[0].rgb[0] - 4 + (k % 9), WARM[0].rgb[1] - 4 + ((k >>> 7) % 9), WARM[0].rgb[2] - 4 + ((k >>> 13) % 9), 255], p * 4);
    }
    return buf;
  }

  it('an opaque warm panel reads short of its 10% by exactly the pixels within the tolerance of its colour', () => {
    const world = nearWarm();
    let hidden = 0;
    for (let p = 0; p < W * 10; p++) {
      if ([0, 1, 2].every((c) => Math.abs(world[p * 4 + c] - WARM[0].rgb[c]) <= FOOTPRINT_TOLERANCE)) hidden++;
    }
    const f = chromeFootprint(over(world, WARM[0].rgb, 0, 10), world, null, { width: W, height: H });
    console.log(`blind spot: a 10% warm panel over warm stone reads ${(f.share * 100).toFixed(2)}% (${hidden} of 1000 pixels hidden)`);
    expect(hidden, 'SETUP: the fixture hides nothing, so it no longer pins the blind spot').toBeGreaterThan(100);
    expect(f.pixels).toBe(1000 - hidden);
    expect(f.share).toBeLessThan(0.09);
  });

  it('a translucent warm panel at alpha 0.15 reads nothing over warm stone, and its full area over a world unlike it', () => {
    const world = nearWarm();
    expect(chromeFootprint(over(world, WARM[0].rgb, 0, 10, 0.15), world, null, { width: W, height: H }).share).toBe(0);
    expect(chromeFootprint(over(frame(SKY), WARM[0].rgb, 0, 10, 0.15), frame(SKY), null, { width: W, height: H }).share).toBeCloseTo(0.10, 6);
  });
});

describe('where the footprint lies', () => {
  it('each counted pixel goes to the first surface whose padded box holds it, at the device scale; the rest is other', () => {
    // A 100x100 device frame at 2 device px per CSS px: a 10x10 CSS panel at (5, 5) is 20x20 device px at (10, 10).
    const { mask } = chromeFootprint(over(over(stone(), PANEL.rgb, 10, 30), PANEL.rgb, 90, 92), stone(), null, { width: W, height: H, keepMask: true });
    const by = footprintByRect(mask, { width: W, height: H, scale: 2, pad: 0, rects: [{ id: 'panel', x: 0, y: 5, right: 50, bottom: 15 }] });
    expect(by).toEqual({ panel: 0.2, other: 0.02 });
    expect(Object.keys(footprintByRect(mask, { width: W, height: H, scale: 2, pad: 0, rects: [
      { id: 'first', x: 0, y: 5, right: 50, bottom: 15 }, { id: 'second', x: 0, y: 0, right: 50, bottom: 50 }] }))).toEqual(['first', 'second']);
    expect(footprintByRect(mask, { width: W, height: H, scale: 2, pad: 1, rects: [{ id: 'panel', x: 0, y: 6, right: 50, bottom: 14 }] }).panel,
      'the pad reaches the rows a 1 CSS px shadow covers').toBeCloseTo(0.2, 6);
  });
});

describe('the colour count, the second column', () => {
  it('two coincident token colours count a pixel once, under the first', () => {
    const twin = [{ name: '--ui-panel', rgb: [42, 36, 32] }, { name: '--ui-panel-frame', rgb: [42, 36, 32] }];
    const r = chromeShare(frame(SKY, [[0, 0, 100, 10, [42, 36, 32]]]), null, { width: W, height: H, colours: twin });
    expect(r.share).toBeCloseTo(0.10, 6);
    expect(r.byColour).toEqual({ '--ui-panel': 1000, '--ui-panel-frame': 0 });
  });
});

describe('which eye frames are the HUD at rest, and what the run prints', () => {
  const shot = (share, extra = {}) => ({ valid: true, chrome: { share, colourShare: share / 2, touchShare: 0.03, toasts: 0, ...extra } });
  it('a frame with a toast up, an invalid frame and an unread one are set aside, and the summary says so', () => {
    expect(atRest(shot(0.05))).toBe(true);
    expect(atRest(shot(0.05, { toasts: 1 }))).toBe(false);
    expect(atRest({ ...shot(0.05), valid: false })).toBe(false);
    expect(atRest(shot(null, { why: 'moved' }))).toBe(false);
    const lines = chromeSummaryLines([shot(0.05), shot(0.09), shot(0.2, { toasts: 2 }), shot(null, { why: 'the page did not hold still' })]);
    expect(lines[0]).toMatch(/2 valid eye frame\(s\) at rest .*: footprint max 9\.00%, median 7\.00%; 1 over the 8% budget; 1 with a toast up and 1 unread set aside/);
    expect(lines[1]).toMatch(/chrome colour 2 frame\(s\): max 4\.50%/);
    expect(lines[2]).toMatch(/touch layer {3}2 frame\(s\): max 3\.00%/);
    expect(CHROME_BUDGET).toBe(0.08);
  });

  it('a frame with a target\'s nameplate up is the HUD at rest, counted in the footprint and named in the summary', () => {
    expect(atRest(shot(0.085, { target: true })), 'a nameplate up is set aside: the at-rest rule was widened').toBe(true);
    const lines = chromeSummaryLines([shot(0.05), shot(0.085, { target: true })]);
    expect(lines[0]).toMatch(/2 valid eye frame\(s\) at rest \(1 with a nameplate up, counted;/);
    expect(lines[0]).toMatch(/footprint max 8\.50%.*; 1 over the 8% budget/);
  });

  it('says how many frames drew the returning player\'s ember bar and coin count', () => {
    const purse = { ember: true, coins: true };
    const lines = chromeSummaryLines([shot(0.05, { purse }), shot(0.06, { purse: { ember: true, coins: false } }), shot(0.07)]);
    expect(lines[0]).toMatch(/3 valid eye frame\(s\) at rest \(0 with a nameplate up, counted; 1 with the ember bar and the coin count drawn\)/);
  });

  it('the nameplate twin has its own line, over the frames at rest, and a twin over the budget is counted there', () => {
    const lines = chromeSummaryLines([
      { ...shot(0.05), chromeTarget: { share: 0.081, toasts: 0 } }, { ...shot(0.06), chromeTarget: { share: 0.07, toasts: 0 } },
      { ...shot(0.07, { toasts: 1 }), chromeTarget: { share: 0.2, toasts: 1 } }]);
    expect(lines[1]).toMatch(/nameplate {5}2 frame\(s\) with a target's nameplate raised: footprint max 8\.10%, median 7\.55%; 1 over the budget/);
    expect(chromeSummaryLines([{ ...shot(0.05), chromeTarget: { share: null, why: 'moved', toasts: 0 } }])[1]).toMatch(/nameplate {5}NOT MEASURED/);
  });

  it('no frame at rest is NOT MEASURED, never a pass', () => {
    expect(chromeSummaryLines([shot(0.2, { toasts: 1 })])[0]).toMatch(/NOT MEASURED/);
  });
});
