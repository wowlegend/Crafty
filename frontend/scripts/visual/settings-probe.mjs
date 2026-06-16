// LOOK probe (M3 #3): force the SettingsPanel open + screenshot it. showSettings is a store field ->
// setState({showSettings:true}) mounts the panel (MenuSystem). Sets a non-default juiceIntensity so the
// new Feedback Intensity slider reads a mid value. Not part of the gate. Reusable for M3 settings slices.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';

const PORT = 5197;
const URL = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = '/tmp/crafty-settings';
mkdirSync(OUT, { recursive: true });

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--no-open'], { cwd: process.cwd(), stdio: 'ignore' });
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 860 });
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  for (let i = 0; i < 120; i++) { try { const r = await fetch(URL); if (r.ok) break; } catch {} await delay(250); }
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });
  await page.evaluate(() => window.__craftyTest.call('start'));
  await delay(2500);
  await page.evaluate(() => window.useGameStore.setState({ juiceIntensity: 0.6, showSettings: true }));
  await delay(700);
  await page.screenshot({ path: `${OUT}/settings.png` });
  console.log('shot settings; showSettings =', await page.evaluate(() => window.useGameStore.getState().showSettings));
} catch (e) { console.error('SETTINGS-PROBE ERROR:', e); } finally {
  await browser.close();
  server.kill();
}
