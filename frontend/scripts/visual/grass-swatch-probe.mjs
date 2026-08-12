// S9 OWNER TASTE CALL — render the grass colour ladder for Kevin to pick from.
//
// WHY A PROBE AND NOT THE GATE. The 31 gated capture states put their cameras 20-30m above the ground
// (capture.mjs: y 62-82 looking at y 51-70), where a 0.7m tuft is a few pixels. S8 measured 3.119%
// against baseline with ZERO of 31 frames over the 6% threshold — the gate would have passed it whether
// or not the feature worked. A colour decision cannot be made from frames that cannot resolve the thing
// being coloured, so this uses the ground-level camera from grass-probe.mjs.
//
// WHY IT PATCHES SOURCE INSTEAD OF POKING THE MATERIAL AT RUNTIME. `grassMaterial` is a module-level
// singleton with an onBeforeCompile patch and a pinned program cache key; reaching it through the scene
// graph to mutate `.color` would exercise a path the game never takes, which is how a probe ends up
// reporting on something the player will never see. Patching the source and reloading renders exactly
// what shipping that colour renders. The patch is trap-guarded and byte-verified on restore.
//
// NOT A GATE. Nothing here asserts. Its output is one image, for a human, to make one decision.
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';

import puppeteer from 'puppeteer';
import { PNG } from 'pngjs';
import { serveVite, probePort } from './_serve.mjs';

const PORT = probePort(import.meta.url);
const SRC = new URL('../../src/OptimizedGrassSystem.jsx', import.meta.url).pathname;
const OUT = '/tmp/crafty-grass-swatch';
const BAK = `${OUT}/OptimizedGrassSystem.orig.jsx`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

// The ladder. A is the CURRENT colour and exists as the control — a ladder with no control cannot show
// whether anything improved. The ground it sits on is (86,124,53) = #567C35, a yellow-green; A is a
// blue-green, which is the mismatch this decision is about.
const SWATCHES = [
  { id: 'A', hex: '#4a7c59', note: 'CURRENT — blue-green, fights the yellow-green ground' },
  { id: 'B', hex: '#5E8A3E', note: 'spec recommendation — yellow-green, same family as the ground' },
  { id: 'C', hex: '#6F9C4A', note: 'one step brighter/warmer yellow-green' }
];
const MOODS = [
  { id: 'day', t: 0.5 },
  { id: 'night', t: 0.92 }
];

const original = readFileSync(SRC, 'utf8');
copyFileSync(SRC, BAK);
const restore = () => {
  writeFileSync(SRC, original);
  const ok = readFileSync(SRC, 'utf8') === original;
  console.log(ok ? 'RESTORE: byte-identical' : 'RESTORE: MISMATCH -- INSPECT');
};
process.on('exit', restore);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

let code = 0;
try {
  for (const sw of SWATCHES) {
    const re = /(new THREE\.MeshLambertMaterial\(\{\s*\n\s*color: )'#[0-9a-fA-F]{6}'/;
    const patched = original.replace(re, `$1'${sw.hex}'`);
    // Assert the RESULT, not that the text changed. "patched !== original" is false for whichever
    // swatch happens to equal the current colour, so it needs an exemption — and an exemption keyed to
    // a hardcoded hex goes stale the moment the shipped colour moves, at which point the control
    // silently stops being verified. Checking that the declaration now names the intended colour has
    // no such hole.
    const declared = patched.match(/new THREE\.MeshLambertMaterial\(\{\s*\n\s*color: '(#[0-9a-fA-F]{6})'/);
    if (!declared || declared[1].toLowerCase() !== sw.hex.toLowerCase()) {
      throw new Error(`swatch ${sw.id}: material colour is ${declared ? declared[1] : 'UNREADABLE'}, expected ${sw.hex}`);
    }
    writeFileSync(SRC, patched);

    const { url, waitReady, shutdown } = serveVite(PORT);
    let browser = null;
    try {
      await waitReady(120);
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader']
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 860 });
      page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
      await page.goto(url, { waitUntil: 'networkidle2' });
      await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });
      await page.evaluate(() => window.__craftyTest.call('enterCapture', {}));
      await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 20000 }).catch(() => {});
      await delay(1500);
      await page.evaluate(() => window.__craftyTest.call('start'));
      await delay(2500);
      await page.evaluate(() => window.__craftyTest.call('enterCapture', { camera: { position: [10, 60, 24], lookAt: [6, 55, 2] } }));
      for (const m of MOODS) {
        await page.evaluate((t) => window.__craftyTest.call('setTimeOfDay', t), m.t);
        await delay(1500);
        await page.screenshot({ path: `${OUT}/${sw.id}-${m.id}.png` });
        console.log(`shot ${sw.id}-${m.id}  ${sw.hex}`);
      }
    } finally {
      await shutdown(browser);
    }
  }

  // Compose the ladder into ONE image: rows = swatch, cols = mood. A decision made by flipping between
  // six files is a decision made from memory; side by side it is made from the pixels.
  const grid = SWATCHES.map((sw) => MOODS.map((m) => PNG.sync.read(readFileSync(`${OUT}/${sw.id}-${m.id}.png`))));
  const CW = 640;
  const CH = 430;
  const sheet = new PNG({ width: CW * MOODS.length, height: CH * SWATCHES.length });
  grid.forEach((row, r) =>
    row.forEach((img, c) => {
      for (let y = 0; y < CH; y++) {
        for (let x = 0; x < CW; x++) {
          const si = (img.width * (y * 2) + x * 2) << 2; // 2x downsample
          const di = (sheet.width * (r * CH + y) + c * CW + x) << 2;
          sheet.data[di] = img.data[si];
          sheet.data[di + 1] = img.data[si + 1];
          sheet.data[di + 2] = img.data[si + 2];
          sheet.data[di + 3] = 255;
        }
      }
    })
  );
  writeFileSync(`${OUT}/ladder.png`, PNG.sync.write(sheet));
  console.log(`\nladder.png  rows top->bottom: ${SWATCHES.map((s) => `${s.id} ${s.hex}`).join(' | ')}`);
  console.log(`            cols left->right:  ${MOODS.map((m) => m.id).join(' | ')}`);
  for (const s of SWATCHES) console.log(`  ${s.id} ${s.hex} — ${s.note}`);
} catch (e) {
  console.error('SWATCH-PROBE ERROR:', e);
  code = 1;
}
process.exit(code); // the `exit` handler above restores the source and reports byte-identity
