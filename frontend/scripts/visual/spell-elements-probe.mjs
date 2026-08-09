// spell-elements-probe.mjs — W2-T4 LIVE-LOOK for the per-element spell silhouettes.
// Drives the REAL game into capture mode (so the cast holds a deterministic frozen pose),
// then stages the FOUR deterministic casts (fireball / iceball / lightning / arcane) side by
// side along +X via the spawnDeterministicCast store seam — one full arc each (muzzle rune
// telegraph -> frozen mid-flight projectile head + per-element trail -> per-element impact).
// The four silhouettes stand in one frame so the DISTINCTNESS reads at a glance. Saves PNGs
// to /tmp/crafty-spell/. NOT part of the visual gate. Mirrors capture.mjs's launch recipe.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { serveVite } from './_serve.mjs';

const PORT = 5211;
const OUT = '/tmp/crafty-spell';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const { url, waitReady, shutdown } = serveVite(PORT);
let browser = null;
const done = async (c) => { await shutdown(browser); process.exit(c); };

try {
  await waitReady(120);
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.setViewport({ width: 1400, height: 800 });
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });
  await page.evaluate(() => window.__craftyTest.call('enterCapture', {}));
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
  await delay(1500);
  await page.evaluate(() => window.__craftyTest.call('start'));
  await delay(2500);

  // Stage the four deterministic casts side by side in the sky studio band (y~146, far +X,
  // clear of the stray closeup subjects). Camera front-on from +Z, pulled back to fit the row.
  await page.evaluate(() => {
    const store = window.useGameStore.getState();
    store.setHudHidden && store.setHudHidden(true);
    store.setCaptureStudio && store.setCaptureStudio(true);
    store.setDangerLevel && store.setDangerLevel(0);
    store.setTimeOfDay && store.setTimeOfDay(0.5);
    const OY = 146, OZ = -8, GAP = 7, BASE = 200;
    const els = ['fireball', 'iceball', 'lightning', 'arcane'];
    els.forEach((el, i) => {
      const ox = BASE + i * GAP;
      store.spawnDeterministicCast && store.spawnDeterministicCast({
        spellType: el,
        muzzle: [ox - 1.6, OY + 0.4, OZ],      // cast-start rune-circle, slightly left
        projectile: [ox, OY + 1.0, OZ],        // frozen mid-flight head (silhouette + trail)
        impact: [ox + 1.8, OY - 0.2, OZ],      // per-element impact, slightly right + below
        direction: [1, 0.1, 0],                // travelling left->right (+X), slight rise
      });
    });
    // re-pin the camera to frame the whole 4-element row centered on the band.
    window.__craftyTest.call('enterCapture', { camera: { position: [BASE + 10.5, OY + 1.4, OZ + 17], lookAt: [BASE + 10.5, OY + 0.8, OZ] } });
  });
  await delay(1200);
  await page.screenshot({ path: `${OUT}/spell-elements-row.png` });
  console.log('captured spell-elements-row -> ' + OUT + '/spell-elements-row.png');

  // Also a tighter per-element pass (one cast, camera close) for a clean silhouette read.
  // Each element is staged at a DISTINCT X (no clear-spell seam exists; in capture the clock
  // is frozen so a prior cast never expires — overlapping them at one X would smear hues).
  // The camera re-pins onto each element's lane, so each frame shows ONE clean cast.
  const els = ['fireball', 'iceball', 'lightning', 'arcane'];
  const LANE0 = 300, LANE_GAP = 12, OY = 146, OZ = -8;
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    await page.evaluate((spellType, idx, lane0, laneGap, oy, oz) => {
      const store = window.useGameStore.getState();
      const ox = lane0 + idx * laneGap;
      store.spawnDeterministicCast && store.spawnDeterministicCast({
        spellType,
        muzzle: [ox - 3.4, oy + 0.6, oz],      // cast-start rune-circle, left
        projectile: [ox, oy + 1.0, oz],        // frozen mid-flight head (silhouette + trail)
        impact: [ox + 3.4, oy + 1.2, oz],      // per-element impact, right
        direction: [1, 0.1, 0],
      });
      window.__craftyTest.call('enterCapture', { camera: { position: [ox, oy + 1.0, oz + 12.5], lookAt: [ox, oy + 1.0, oz] } });
    }, el, i, LANE0, LANE_GAP, OY, OZ);
    await delay(900);
    await page.screenshot({ path: `${OUT}/spell-${el}.png` });
    console.log('captured spell-' + el);
  }

  done(0);
} catch (e) {
  console.error('SPELL-PROBE ERROR:', e);
  done(1);
}
