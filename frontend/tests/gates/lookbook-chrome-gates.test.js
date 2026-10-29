import { describe, it, expect } from 'vitest';
import { chromeShare, chromeColoursFrom, CHROME_VARS, CHROME_TOLERANCE } from '../../scripts/visual/_lookbook.mjs';

/**
 * The HUD lane's acceptance number is a share of the screen in the chrome surface colours (plan
 * docs/superpowers/plans/2026-10-29-crafty-w2d-hud.md, decision 1). These drive the count over synthetic frames whose
 * answer is known by construction.
 *
 * NOT CHECKED HERE: that the lookbook reads the colours from the page and shoots the twin with the DOM hidden; the
 * probe's report records both (`chrome.colours`, `chrome.world`), and an opened frame pair shows the twin.
 */
const W = 100, H = 100;
const SKY = [120, 170, 220];
const PANEL = { name: '--ui-panel', rgb: [22, 33, 58] };
const SLOT = { name: '--ui-slot', rgb: [35, 52, 88] };

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
