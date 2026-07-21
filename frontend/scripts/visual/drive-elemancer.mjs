// One-shot judge driver for the elemancerShowcase card (M6 T4). Mirrors capture.mjs's
// proven launch/readiness recipe exactly; NOT part of the visual gate.
import puppeteer from 'puppeteer';
import { serveVite } from './_serve.mjs';

const PORT = 5199;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const { url, waitReady, shutdown } = serveVite(PORT);
let browser = null, code = 0;
try {
  await waitReady(120);
  browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 960 });
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });
  await page.evaluate(() => window.__craftyTest.call('enterCapture', {}));
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
  await delay(1500);
  await page.evaluate(() => window.__craftyTest.call('start'));
  await delay(3500);
  await page.evaluate(() => window.__craftyTest.call('elemancerShowcase'));
  await delay(2500);
  await page.screenshot({ path: '/Users/kz/Code/Crafty/.superpowers/s2b4-elemancer-refs/zones-card-1.png' });
  console.log('CAPTURED zones-card-1');
} catch (e) { console.error('DRIVE-ELEMANCER ERROR:', e); code = 1; }
finally { await shutdown(browser); }
process.exit(code);
