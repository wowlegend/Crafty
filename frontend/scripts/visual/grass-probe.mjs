// LOOK probe (M4 #5): a GROUND-LEVEL capture over the spawn grass terrain to eyeball the revived
// wind-grass (the 20-state diorama cameras are too high to judge ground vegetation). Uses the capture
// determinism layer (enterCapture) + a low camera skimming the surface near the Hearth (~y56). Not a gate.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';

const PORT = 5196;
const URL = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = '/tmp/crafty-grass';
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
  // enter the deterministic capture layer, then a LOW camera skimming the grass terrain just off the spawn pad
  await page.evaluate(() => window.__craftyTest.call('enterCapture', {}));
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 20000 }).catch(() => {});
  await delay(1500);
  await page.evaluate(() => window.__craftyTest.call('start')); // dismiss the menu + enter play (like explore-day)
  await delay(2500); // let chunks stream + grass mount
  // now override to a LOW camera skimming the grass terrain just off the spawn pad
  await page.evaluate(() => window.__craftyTest.call('enterCapture', { camera: { position: [10, 60, 24], lookAt: [6, 55, 2] } }));
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5));
  await delay(1200);
  await page.screenshot({ path: `${OUT}/grass-ground.png` });
  console.log('shot grass-ground');
} catch (e) { console.error('GRASS-PROBE ERROR:', e); } finally {
  await browser.close();
  server.kill();
}
