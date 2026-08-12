// LOOK probe (M2 #7 S2): force the rebuilt DeathScreen overlay + screenshot it. isAlive is a store field
// -> setState({isAlive:false}) mounts DeathScreen (HUD.jsx). VictoryOverlay shares the exact
// Panel/Button/RunStat structure (amber 'warn' vs red 'danger') so this validates both. Not part of the gate.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { serveVite, probePort } from './_serve.mjs';

const PORT = probePort(import.meta.url);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = '/tmp/crafty-death';
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
  await page.evaluate(() => window.useGameStore.setState({ level: 4, nightCount: 3 }));
  await page.evaluate(() => window.useGameStore.setState({ isAlive: false }));
  await delay(900); // let the framer-motion entrance settle
  await page.screenshot({ path: `${OUT}/death-overlay.png` });
  console.log('shot death-overlay; isAlive =', await page.evaluate(() => window.useGameStore.getState().isAlive));
} catch (e) { console.error('DEATH-PROBE ERROR:', e); code = 1; }
finally { await shutdown(browser); }
process.exit(code);
