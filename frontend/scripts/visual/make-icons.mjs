#!/usr/bin/env node
/**
 * make-icons.mjs — render the app icons from the game's own wordmark font and colour tokens.
 *
 * Each icon is the Lilita One "C" of the title wordmark, extruded one step in the deep gold, on the
 * ground colour, drawn on a 2D canvas in headless Chromium so the glyph comes from the font file the game
 * ships. The sizes, purposes and glyph radii come from ICONS in src/brand.js.
 *
 *   node scripts/visual/make-icons.mjs              write every icon into public/
 *   node scripts/visual/make-icons.mjs --out=<dir>  write them into <dir> instead
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { BRAND, ICONS } from '../../src/brand.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '../..');
const FONT = join(APP, 'public/fonts/lilita-one-v15-latin-regular.woff2');
const GLYPH = 'C';
// The extrusion depth as a share of the glyph height.
const DEPTH = 0.07;

/** Runs inside the page: draws one icon and returns it as a PNG data URL. */
async function drawIcon({ size, glyphRadius, fontUrl, ground, accent, accentDeep, glyph, depth }) {
  const face = new FontFace('Lilita One', `url(${fontUrl})`);
  await face.load();
  document.fonts.add(face);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, size, size);

  const inkBox = (px) => {
    ctx.font = `${px}px 'Lilita One'`;
    const m = ctx.measureText(glyph);
    const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    return { m, w, h, d: depth * h };
  };
  const probe = inkBox(1000);
  const halfDiagonal = Math.hypot((probe.w + probe.d) / 2, (probe.h + probe.d) / 2);
  const { m, w, h, d } = inkBox((1000 * glyphRadius * size) / halfDiagonal);

  const left = (size - (w + d)) / 2;
  const top = (size - (h + d)) / 2;
  const x = left + m.actualBoundingBoxLeft;
  const y = top + m.actualBoundingBoxAscent;
  const steps = Math.max(1, Math.ceil(d));
  ctx.fillStyle = accentDeep;
  for (let i = steps; i >= 1; i--) ctx.fillText(glyph, x + (i * d) / steps, y + (i * d) / steps);
  ctx.fillStyle = accent;
  ctx.fillText(glyph, x, y);
  return canvas.toDataURL('image/png');
}

async function main() {
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const outDir = outArg ? resolve(outArg.slice('--out='.length)) : join(APP, 'public');
  mkdirSync(outDir, { recursive: true });
  const fontUrl = `data:font/woff2;base64,${readFileSync(FONT).toString('base64')}`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    for (const icon of ICONS) {
      const dataUrl = await page.evaluate(drawIcon, {
        size: icon.size,
        glyphRadius: icon.glyphRadius,
        fontUrl,
        ground: BRAND.ground,
        accent: BRAND.accent,
        accentDeep: BRAND.accentDeep,
        glyph: GLYPH,
        depth: DEPTH,
      });
      const file = join(outDir, icon.file);
      writeFileSync(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
      console.log(`make-icons: wrote ${icon.file} (${icon.size}x${icon.size}, ${icon.purpose})`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
