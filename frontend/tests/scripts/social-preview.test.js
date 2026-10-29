import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { OG_CARD, MEDIA_MANIFEST, MEDIA_SHOTS, sha256Hex } from '../../scripts/visual/_media.mjs';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT = resolve(APP, '..');
const html = readFileSync(resolve(APP, 'index.html'), 'utf8');
const CARD = resolve(ROOT, OG_CARD.file);
const OG_WIDTH = OG_CARD.width;
const OG_HEIGHT = OG_CARD.height;

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
    expect(existsSync(CARD), 'public/og-image.png is missing — run node scripts/visual/media.mjs --only og').toBe(true);
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

describe('the iPad home-screen icon', () => {
  // iOS takes only a PNG apple-touch-icon; an SVG one is ignored and the home screen gets no real icon.
  it('apple-touch-icon names a 180x180 opaque PNG that ships', () => {
    const links = [...html.matchAll(/<link\s+rel="apple-touch-icon"[^>]*\shref="([^"]+)"/g)].map((m) => m[1]);
    expect(links, 'expected exactly one apple-touch-icon link').toHaveLength(1);
    const href = links[0];
    expect(href).toMatch(/\.png$/);
    const file = resolve(APP, 'public', href.replace(/^\//, ''));
    expect(existsSync(file), `${href} is linked but public/ has no such file`).toBe(true);
    const png = PNG.sync.read(readFileSync(file));
    expect([png.width, png.height]).toEqual([180, 180]);
    let transparent = 0;
    for (let i = 3; i < png.data.length; i += 4) if (png.data[i] !== 255) transparent++;
    expect(transparent, 'iOS fills transparent pixels with black').toBe(0);
  });
});

describe('the card\'s source is the media pipeline', () => {
  // The card is shot by scripts/visual/media.mjs (its `og` shot) and recorded in docs/media/media.json. These ask
  // whether the file that ships IS that output: a card regenerated by any other path, or re-encoded after the shoot,
  // keeps its size and passes every check above, and fails here on its bytes.
  const manifest = JSON.parse(readFileSync(resolve(ROOT, MEDIA_MANIFEST), 'utf8'));
  const entry = manifest.files.find((e) => e.file === OG_CARD.file);

  it('media.json records the card as the table\'s og shot', () => {
    const og = MEDIA_SHOTS.find((s) => s.purpose === 'og');
    expect(entry, `${MEDIA_MANIFEST} has no entry for ${OG_CARD.file}`).toBeTruthy();
    expect(entry.shot).toBe(og.name);
    expect(og.out).toBe(OG_CARD.file);
  });

  it('the shipped card has the bytes and the size the shoot recorded, and the tags state that size', () => {
    const bytes = readFileSync(CARD);
    expect(entry.sha256, `${MEDIA_MANIFEST} records no sha256 for the card`).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(bytes), 'og-image.png differs from the file the shoot wrote').toBe(entry.sha256);
    expect(bytes.length).toBe(entry.bytes);
    const png = PNG.sync.read(bytes);
    expect([png.width, png.height]).toEqual([entry.width, entry.height]);
    expect(metaContent('property', 'og:image:width')).toBe(String(entry.width));
    expect(metaContent('property', 'og:image:height')).toBe(String(entry.height));
  });
});
