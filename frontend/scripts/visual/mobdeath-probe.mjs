// mobdeath-probe.mjs -- W2-T5 LIVE-LOOK for the hue-preserving mob DEATH burst.
// Drives the REAL game into capture mode (so the kill holds a deterministic frozen pose),
// then forces a lethal hit on a GREEN zombie via the killMobShowcase hook. The frame must show:
//   - a GREEN spark soul-burst rising upward (hue PRESERVED -- NOT a white/black puff),
//   - a t=0 hot flash at the burst centre,
//   - a fading ground-ring decal in the mob's colour.
// Saves PNGs to /tmp/crafty-mobdeath/. NOT part of the visual gate (death is transient). Mirrors
// capture.mjs's launch recipe + spell-elements-probe.mjs's hook-driving sequence.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { serveVite, probePort } from './_serve.mjs';

const PORT = probePort(import.meta.url);
const OUT = '/tmp/crafty-mobdeath';
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
  await page.setViewport({ width: 1280, height: 860 });
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });
  await page.evaluate(() => window.__craftyTest.call('enterCapture', {}));
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
  await delay(1500);
  await page.evaluate(() => window.__craftyTest.call('start'));
  await delay(2500);

  // NIGHT (default): the real gameplay backdrop for a kill -- a dark sky lets the GREEN additive
  // spark burst survive (the honest hue-preservation read). Force the lethal hit + frame it.
  await page.evaluate(() => window.__craftyTest.call('killMobShowcase'));
  await delay(1000); // let the burst + flash + decal settle into the frozen pose
  await page.screenshot({ path: `${OUT}/mobdeath-green-zombie-night.png` });
  console.log('captured mobdeath-green-zombie-night -> ' + OUT + '/mobdeath-green-zombie-night.png');

  // DAY contrast card: the bright midday sky desaturates the additive burst (worst case).
  await page.evaluate(() => window.__craftyTest.call('killMobShowcase', { day: true }));
  await delay(1000);
  await page.screenshot({ path: `${OUT}/mobdeath-green-zombie-day.png` });
  console.log('captured mobdeath-green-zombie-day -> ' + OUT + '/mobdeath-green-zombie-day.png');
  console.log('hooks available:', await page.evaluate(() => window.__craftyTest.list().filter((n) => /kill|death/i.test(n))));

  done(0);
} catch (e) {
  console.error('MOBDEATH-PROBE ERROR:', e);
  done(1);
}
