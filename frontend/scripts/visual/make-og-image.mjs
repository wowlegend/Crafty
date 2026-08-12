#!/usr/bin/env node
/**
 * make-og-image.mjs — build public/og-image.png, the social share card.
 *
 * WHY THIS EXISTS. index.html pointed og:image and twitter:image at `/favicon.svg`. Two independent
 * reasons that renders a blank preview everywhere: social scrapers (Facebook, X, LinkedIn, Discord,
 * Slack) do not rasterise SVG, and a root-relative path has no host to resolve against when a scraper
 * fetches the tag out of the document. So every share of this game showed a title, a description, and an
 * empty grey box.
 *
 * The source is the committed `menu` visual baseline — the real title screen, wordmark and all, which is
 * both the most representative frame and the one that cannot drift from what ships without the visual
 * gate noticing. Regenerating from a baseline rather than hand-exporting means the card follows the game.
 *
 * NEAREST-NEIGHBOUR resampling, deliberately. This is a voxel game with hard-edged bold-flat UI; a
 * smoothing filter would soften exactly the edges that carry the art direction. It also keeps this script
 * dependency-free beyond pngjs, which the visual gate already uses.
 *
 *   node scripts/visual/make-og-image.mjs         write public/og-image.png
 *   node scripts/visual/make-og-image.mjs --check exit 1 if the file is missing or the wrong size
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../..');

/** The size every scraper documents: 1200x630, i.e. 1.91:1. */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export const SOURCE = resolve(APP, 'tests/visual/baseline/menu.png');
export const TARGET = resolve(APP, 'public/og-image.png');

/**
 * PURE: the centre crop of `(sw, sh)` that matches the target aspect ratio.
 * Returns {x, y, w, h} in source pixels.
 */
export function centreCrop(sw, sh, targetW = OG_WIDTH, targetH = OG_HEIGHT) {
  const targetAspect = targetW / targetH;
  let w = sw;
  let h = Math.round(sw / targetAspect);
  if (h > sh) {                      // source is too short — crop width instead
    h = sh;
    w = Math.round(sh * targetAspect);
  }
  return { x: Math.floor((sw - w) / 2), y: Math.floor((sh - h) / 2), w, h };
}

/** Crop then nearest-neighbour scale, into a fresh PNG. */
export function buildCard(src, targetW = OG_WIDTH, targetH = OG_HEIGHT) {
  const { x: cx, y: cy, w: cw, h: ch } = centreCrop(src.width, src.height, targetW, targetH);
  const out = new PNG({ width: targetW, height: targetH });
  for (let y = 0; y < targetH; y++) {
    const sy = cy + Math.min(ch - 1, Math.floor((y * ch) / targetH));
    for (let x = 0; x < targetW; x++) {
      const sx = cx + Math.min(cw - 1, Math.floor((x * cw) / targetW));
      const s = (sy * src.width + sx) << 2;
      const d = (y * targetW + x) << 2;
      out.data[d] = src.data[s];
      out.data[d + 1] = src.data[s + 1];
      out.data[d + 2] = src.data[s + 2];
      out.data[d + 3] = 255;         // scrapers reject alpha; flatten it
    }
  }
  return out;
}

// CLI at the bottom and guarded, so importing the seams above does not run the tool (cli-guard).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  if (process.argv.includes('--check')) {
    if (!existsSync(TARGET)) {
      console.error(`make-og-image: ${TARGET} is missing — run this script without --check`);
      process.exit(1);
    }
    const png = PNG.sync.read(readFileSync(TARGET));
    if (png.width !== OG_WIDTH || png.height !== OG_HEIGHT) {
      console.error(`make-og-image: og-image.png is ${png.width}x${png.height}, expected ${OG_WIDTH}x${OG_HEIGHT}`);
      process.exit(1);
    }
    console.log(`✓ make-og-image: og-image.png is ${png.width}x${png.height}`);
    process.exit(0);
  }
  const src = PNG.sync.read(readFileSync(SOURCE));
  const out = buildCard(src);
  writeFileSync(TARGET, PNG.sync.write(out));
  console.log(`✓ make-og-image: ${SOURCE.replace(APP + '/', '')} ${src.width}x${src.height} -> og-image.png ${out.width}x${out.height}`);
}
