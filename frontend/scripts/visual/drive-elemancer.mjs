// One-shot judge driver for the elemancerShowcase card (M6 T4). Mirrors capture.mjs's
// proven launch/readiness recipe exactly; NOT part of the visual gate.
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

const PORT = 5199;
const URL = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url) {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await delay(250);
  }
  throw new Error('dev server did not start');
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--no-open'], { cwd: process.cwd(), stdio: 'ignore' });
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 960 });
  await waitForServer(URL);
  await page.goto(URL, { waitUntil: 'networkidle2' });
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
} finally {
  await browser.close();
  server.kill();
}
