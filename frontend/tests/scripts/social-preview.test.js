import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { OG_WIDTH, OG_HEIGHT, centreCrop, buildCard } from '../../scripts/visual/make-og-image.mjs';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const html = readFileSync(resolve(APP, 'index.html'), 'utf8');
const CARD = resolve(APP, 'public/og-image.png');

// THE SHARE PREVIEW WAS BLANK EVERYWHERE.
//
// og:image and twitter:image pointed at `/favicon.svg`. Two independent reasons that renders nothing:
// no major scraper (Facebook, X, LinkedIn, Discord, Slack) rasterises SVG, and a ROOT-RELATIVE path has
// no host to resolve against when the tag is fetched out of the document by a crawler. Every share of
// this game showed a title, a description, and an empty box.
//
// Both failure modes are cheap to assert and impossible to notice by looking at the site, which is
// exactly the kind of thing that stays broken: nothing in the app is wrong, and the only symptom lives
// in someone else's chat client.
const metaContent = (attr, name) => {
  const m = html.match(new RegExp(`<meta\\s+${attr}="${name}"\\s+content="([^"]*)"`));
  return m ? m[1] : null;
};

describe('social preview tags point at something a scraper can actually render', () => {
  it('declares both image tags at all', () => {
    for (const [attr, name] of [['property', 'og:image'], ['name', 'twitter:image']]) {
      expect(metaContent(attr, name), `${name} is not declared — the assertions below would be vacuous`).toBeTruthy();
    }
  });

  it('neither image is an SVG', () => {
    for (const [attr, name] of [['property', 'og:image'], ['name', 'twitter:image']]) {
      const v = metaContent(attr, name);
      expect(v.endsWith('.svg'), `${name} is an SVG (${v}); scrapers do not rasterise SVG, so the card is blank`).toBe(false);
      expect(v, `${name} is not a raster image`).toMatch(/\.(png|jpe?g)$/);
    }
  });

  it('both images are ABSOLUTE URLs, not root-relative paths', () => {
    // The half that is easy to miss: a correct PNG at `/og-image.png` is still blank, because the crawler
    // has no base URL for it.
    for (const [attr, name] of [['property', 'og:image'], ['name', 'twitter:image']]) {
      const v = metaContent(attr, name);
      expect(v.startsWith('http'), `${name} is "${v}" — a crawler has no host to resolve that against`).toBe(true);
      expect(() => new URL(v), `${name} is not a parseable URL`).not.toThrow();
    }
  });

  it('twitter:card is summary_large_image, matching the 1.91:1 card being supplied', () => {
    // `summary` renders a small SQUARE thumbnail; feeding it a 1200x630 image crops the middle out.
    expect(metaContent('name', 'twitter:card')).toBe('summary_large_image');
  });

  it('the declared dimensions agree with the file that actually ships', () => {
    // A width/height tag that disagrees with the bytes makes some scrapers letterbox or reject it — and
    // this is the assertion that catches a hand-edited tag or a regenerated card at a different size.
    expect(existsSync(CARD), 'public/og-image.png is missing — run node scripts/visual/make-og-image.mjs').toBe(true);
    const png = PNG.sync.read(readFileSync(CARD));
    expect(png.width).toBe(OG_WIDTH);
    expect(png.height).toBe(OG_HEIGHT);
    expect(metaContent('property', 'og:image:width')).toBe(String(png.width));
    expect(metaContent('property', 'og:image:height')).toBe(String(png.height));
  });

  it('the card is a real image, not a blank rectangle', () => {
    // The presence case. A generator that silently wrote an empty buffer would satisfy every dimension
    // assertion above while shipping the same blank preview the tags used to.
    const png = PNG.sync.read(readFileSync(CARD));
    const colours = new Set();
    for (let i = 0; i < png.data.length; i += 4 * 997) {   // a coprime stride, so the sample is spread
      colours.add(`${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`);
    }
    expect(colours.size, 'the card is a single flat colour — it is blank').toBeGreaterThan(20);
    expect(png.data.length).toBe(OG_WIDTH * OG_HEIGHT * 4);
  });

  it('every pixel is opaque — scrapers composite alpha onto unpredictable backgrounds', () => {
    const png = PNG.sync.read(readFileSync(CARD));
    let transparent = 0;
    for (let i = 3; i < png.data.length; i += 4) if (png.data[i] !== 255) transparent++;
    expect(transparent, `${transparent} pixels carry alpha`).toBe(0);
  });

  it('an alt text is supplied for both, since a preview is read aloud by some clients', () => {
    expect(metaContent('property', 'og:image:alt')?.length).toBeGreaterThan(20);
    expect(metaContent('name', 'twitter:image:alt')?.length).toBeGreaterThan(20);
  });
});

describe('the card generator itself', () => {
  it('centre-crops to the target aspect without ever exceeding the source', () => {
    const c = centreCrop(1280, 800);
    expect(c.w).toBeLessThanOrEqual(1280);
    expect(c.h).toBeLessThanOrEqual(800);
    expect(c.w / c.h).toBeCloseTo(OG_WIDTH / OG_HEIGHT, 2);
    // Centred, not top-left anchored — the wordmark lives in the middle of the title screen.
    expect(c.x).toBe(Math.floor((1280 - c.w) / 2));
    expect(c.y).toBe(Math.floor((800 - c.h) / 2));
  });

  it('handles a source that is too SHORT rather than too tall', () => {
    // The other branch. A 1000x200 source cannot give 1.91:1 by cropping height, so width must go.
    const c = centreCrop(1000, 200);
    expect(c.h).toBe(200);
    expect(c.w).toBeLessThan(1000);
    expect(c.w / c.h).toBeCloseTo(OG_WIDTH / OG_HEIGHT, 2);
  });

  it('produces exactly the target size from any source size', () => {
    for (const [w, h] of [[1280, 800], [640, 480], [2000, 500]]) {
      const src = new PNG({ width: w, height: h });
      src.data.fill(120);
      const out = buildCard(src);
      expect(out.width, `${w}x${h} source`).toBe(OG_WIDTH);
      expect(out.height, `${w}x${h} source`).toBe(OG_HEIGHT);
    }
  });
});
