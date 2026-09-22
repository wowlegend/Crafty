// ambient-floor-probe.mjs — L1: WHY do unlit faces go near-black, and does the ambient floor fix it?
//
// THE FINDING THIS EXISTS TO DIAGNOSE. Two independent subjects in this repo render at luminance ~10
// against neighbours at ~90: near-camera structures at a low sun (QUEUE L1) and the FPV gloves (B5
// partial, measured at rgb(16,3,40) with GLOVE_INK = #2A2A33). On a LOCKED bold-flat art direction a
// surface that goes near-black stops reading as a material and reads as a HOLE. Two subjects, one
// suspected cause — which is what makes it worth diagnosing rather than tuning each material.
//
// IT IS A CONTROLLED EXPERIMENT, NOT A LOOK. Tuning a hex until a screenshot looks better answers
// nothing about the mechanism and cannot tell "the ambient floor is too low" from "these materials are
// simply dark" from "they are in a shadow that no ambient reaches". So this varies ONE input across a
// ladder and measures TWO regions per step:
//
//   DARK   — a patch that rendered near-black, the subject
//   LIT    — a patch of sunlit ground, the CONTROL
//
// The discriminator is the RATIO, not the dark value. If raising ambient lifts both regions equally the
// knob is a global exposure and the contrast problem is untouched — the scene just gets brighter and the
// hole stays a hole relative to its surroundings. If the dark region lifts FASTER, the floor is the
// cause and raising it is the fix. Reporting only the dark value would make every step look like
// progress, which is exactly how a tuning session talks itself into shipping a washed-out scene.
//
// WHY IT PATCHES SOURCE. `ambientRef.current.intensity` is rewritten every frame from `MOOD_SCALARS` by
// Atmosphere's useFrame, so a runtime poke survives for less than one frame. Patching the constant is
// what the grass-swatch and godrays probes already do; restore is byte-verified.
//
// NOT A GATE. It prints a table and exits 0, or 3 when the render never produced comparable frames.
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { PNG } from 'pngjs';
import { serveVite, probePort } from './_serve.mjs';

const PORT = probePort(import.meta.url);
const SRC = new URL('../../src/render/mood.js', import.meta.url).pathname;
const OUT = '/tmp/crafty-ambient';
const BAK = `${OUT}/mood.orig.js`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

// The explore-mood ambient line. Anchored to the whole assignment so a reformat is COULD NOT CHECK
// rather than a silent no-op patch that would report "ambient does nothing".
const ANCHOR = /explore:\s*\{ ambientIntensity: ([\d.]+),/;
const LADDER = [0.90, 1.40, 2.00, 2.80]; // 0.90 is shipped; the rest are the experiment

// REGIONS ARE DERIVED FROM THE BASELINE FRAME, NOT HARDCODED, and that is a correction.
//
// The first version hardcoded two rects copied from the hands/godrays frames. Those probes render the
// LIVE game; this one renders capture mode, where the camera and world state differ — so the "dark"
// rect landed on a patch reading luminance 73.9, and the whole ladder measured something that was never
// the subject. An input the assertion reads and never sets: exactly the class this estate catalogued
// hours earlier. The ratio it produced was not wrong, it was about the wrong pixels.
//
// So the subject is FOUND in the baseline frame and then tracked at those same coordinates across the
// ladder, and the run refuses to report unless the found region is genuinely dark.
const TILE = 60;
const DARK_MAX = 30;   // the subject must actually be near-black, or there is nothing to diagnose
const UI_EXCLUDE = [   // HUD rects: UI does not respond to ambient at all, so it would be a dead control
  [0, 0, 320, 300],       // quests panel
  [0, 300, 110, 560],     // left verb rail
  [310, 600, 980, 800],   // hotbar + xp bar
  [1120, 560, 1280, 760], // minimap
  [0, 720, 220, 800],     // health/mana
  [1190, 0, 1280, 140],   // settings
];
const inUi = (x, y) => UI_EXCLUDE.some(([a, b, c, d]) => x + TILE > a && x < c && y + TILE > b && y < d);

/** Scan the WORLD area of a frame for the darkest and a mid-bright tile. */
function findRegions(path) {
  const p = PNG.sync.read(readFileSync(path));
  const tileLuma = (x, y) => {
    let s = 0, n = 0;
    for (let yy = y; yy < y + TILE && yy < p.height; yy++) for (let xx = x; xx < x + TILE && xx < p.width; xx++) {
      const i = (yy * p.width + xx) * 4;
      s += 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
      n++;
    }
    return s / n;
  };
  let dark = null, lit = null;
  for (let y = 120; y < p.height - TILE; y += 20) {
    for (let x = 0; x < p.width - TILE; x += 20) {
      if (inUi(x, y)) continue;
      const L = tileLuma(x, y);
      if (!dark || L < dark.L) dark = { x, y, L };
      // the control is a WELL-LIT WORLD tile, not the brightest thing on screen
      if (L > 80 && L < 160 && (!lit || L > lit.L)) lit = { x, y, L };
    }
  }
  return { dark, lit };
}

function meanLuma(path, [x0, y0, x1, y1]) {
  const p = PNG.sync.read(readFileSync(path));
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * p.width + x) * 4;
    s += 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
    n++;
  }
  return s / n;
}

const original = readFileSync(SRC, 'utf8');
if (!ANCHOR.test(original)) {
  console.error('COULD NOT CHECK - the explore ambientIntensity anchor is not in mood.js. Fix the anchor.');
  process.exit(3);
}
copyFileSync(SRC, BAK);

const { url, waitReady, shutdown } = serveVite(PORT);
let browser = null, code = 0, patched = false;

try {
  await waitReady();
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.setViewport({ width: 1280, height: 800 });

  const rows = [];
  const REGION = { dark: null, lit: null }; // found once, from the FIRST frame, then tracked
  for (const amb of LADDER) {
    writeFileSync(SRC, original.replace(ANCHOR, `explore:  { ambientIntensity: ${amb},`), 'utf8');
    patched = true;
    const check = readFileSync(SRC, 'utf8').match(ANCHOR);
    if (!check || Number(check[1]) !== amb) throw new Error(`patch did not take for ${amb} - refusing to report`);
    await delay(2500); // vite HMR

    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 30000 });
    await page.evaluate(() => window.__craftyTest.call('start'));
    await page.evaluate(() => window.useGameStore.getState().setQualityTier('high'));
    await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 20000 }).catch(() => {});
    const engaged = await page.evaluate(() => window.__craftyTest.call('enterCapture', {}));
    if (!engaged) throw new Error('enterCapture did not engage - frames would not be comparable');
    await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.3));
    await delay(6000);
    const f = `${OUT}/ambient-${String(amb).replace('.', '_')}.png`;
    await page.screenshot({ path: f });
    if (!REGION.dark) {
      const found = findRegions(f);
      if (!found.dark || found.dark.L > DARK_MAX) {
        console.error(`COULD NOT CHECK - the darkest world tile in the baseline frame reads ${found.dark ? found.dark.L.toFixed(1) : 'n/a'},`);
        console.error(`  above the ${DARK_MAX} threshold. There is no near-black subject in this frame to diagnose,`);
        console.error('  so any ratio computed here would be about the wrong pixels. Re-shoot, or widen the scan.');
        code = 3;
        throw new Error('no dark subject');
      }
      if (!found.lit) { console.error('COULD NOT CHECK - no well-lit WORLD tile found for the control.'); code = 3; throw new Error('no control'); }
      REGION.dark = [found.dark.x, found.dark.y, found.dark.x + TILE, found.dark.y + TILE];
      REGION.lit = [found.lit.x, found.lit.y, found.lit.x + TILE, found.lit.y + TILE];
      console.log(`  subject found: dark tile at ${found.dark.x},${found.dark.y} L=${found.dark.L.toFixed(1)}`);
      console.log(`  control:       lit  tile at ${found.lit.x},${found.lit.y} L=${found.lit.L.toFixed(1)}`);
    }
    rows.push({ amb, dark: meanLuma(f, REGION.dark), lit: meanLuma(f, REGION.lit) });
  }

  console.log('\n  ambient   DARK patch   LIT patch (control)   dark/lit ratio');
  for (const r of rows) {
    console.log(`  ${String(r.amb).padEnd(9)} ${r.dark.toFixed(1).padStart(10)} ${r.lit.toFixed(1).padStart(21)} ${(r.dark / r.lit).toFixed(3).padStart(16)}`);
  }
  const first = rows[0], last = rows[rows.length - 1];
  const ratioGain = (last.dark / last.lit) / (first.dark / first.lit);
  console.log(`\n  ratio change across the ladder: ${ratioGain.toFixed(2)}x`);
  if (ratioGain > 1.15) {
    console.log('  => THE AMBIENT FLOOR IS THE CAUSE. The dark patch lifts FASTER than the control,');
    console.log('     so raising it closes the hole rather than merely brightening the scene.');
  } else {
    console.log('  => AMBIENT IS A GLOBAL EXPOSURE HERE, NOT THE FIX. Both patches lift together, so the');
    console.log('     hole stays a hole relative to its surroundings and the scene just washes out.');
    console.log('     Look elsewhere: material base colours, a shadow the ambient term does not reach,');
    console.log('     or the tone curve. Do NOT ship an ambient bump on this evidence.');
  }
  console.log(`  frames: ${OUT}/  (open them - a ratio is not a look)`);
} catch (e) {
  console.error('AMBIENT-PROBE ERROR:', e.message);
  code = code || 1;
} finally {
  if (patched) {
    copyFileSync(BAK, SRC);
    const ok = readFileSync(SRC, 'utf8') === original;
    console.log(ok ? '  source restored byte-identical' : '  RESTORE FAILED - mood.js is still patched');
    if (!ok) code = 1;
  }
  await shutdown(browser);
}
process.exit(code);
