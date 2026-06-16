// LOOK probe (M2 #7 S2): force the rebuilt DeathScreen overlay + screenshot it. isAlive is a store field
// -> setState({isAlive:false}) mounts DeathScreen (HUD.jsx). VictoryOverlay shares the exact
// Panel/Button/RunStat structure (amber 'warn' vs red 'danger') so this validates both. Not part of the gate.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';

const PORT = 5198;
const URL = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = '/tmp/crafty-death';
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
  await page.evaluate(() => window.useGameStore.setState({ level: 4, nightCount: 3 }));
  await page.evaluate(() => window.useGameStore.setState({ isAlive: false }));
  await delay(900); // let the framer-motion entrance settle
  await page.screenshot({ path: `${OUT}/death-overlay.png` });
  console.log('shot death-overlay; isAlive =', await page.evaluate(() => window.useGameStore.getState().isAlive));
} catch (e) { console.error('DEATH-PROBE ERROR:', e); } finally {
  await browser.close();
  server.kill();
}
