// LOOK probe (M3 #3): force the SettingsPanel open + screenshot it. showSettings is a store field ->
// setState({showSettings:true}) mounts the panel (MenuSystem). Sets a non-default juiceIntensity so the
// new Feedback Intensity slider reads a mid value. Not part of the gate. Reusable for M3 settings slices.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { serveVite, probePort } from './_serve.mjs';

const PORT = probePort(import.meta.url);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = '/tmp/crafty-settings';
mkdirSync(OUT, { recursive: true });

const { url, waitReady, shutdown } = serveVite(PORT);
let browser = null, code = 0;
try {
  await waitReady(120);
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 860 });
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });
  await page.evaluate(() => window.__craftyTest.call('start'));
  await delay(2500);
  await page.evaluate(() => window.useGameStore.setState({ juiceIntensity: 0.6, showSettings: true }));
  await delay(700);
  await page.screenshot({ path: `${OUT}/settings.png` });
  console.log('shot settings; showSettings =', await page.evaluate(() => window.useGameStore.getState().showSettings));
} catch (e) { console.error('SETTINGS-PROBE ERROR:', e); code = 1; }
finally { await shutdown(browser); }
process.exit(code);
