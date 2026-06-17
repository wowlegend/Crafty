// hands-probe.mjs — drive the REAL game (non-capture) to first-person and screenshot the FPV HANDS.
// The hands render off the pinned capture camera (the visual gate never sees them), so this probe is
// the LIVE-LOOK that validates the stylized gloved hands. Saves PNGs to /tmp/crafty-hands/.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
const PORT = 4198, URL = `http://localhost:${PORT}`, OUT = '/tmp/crafty-hands';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const done = (c) => { try { server.kill('SIGKILL'); } catch {} process.exit(c); };
try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(URL); if (r.ok) break; } catch {} await delay(250); }
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });
  await page.evaluate(() => window.__craftyTest.call('start'));
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5));
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
  await delay(5000);
  let locked = false;
  for (let i = 0; i < 8 && !locked; i++) { await page.mouse.click(600 + i * 10, 400); await delay(300); locked = await page.evaluate(() => !!document.pointerLockElement); }
  const shoot = async (name) => { await delay(600); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
  await page.mouse.move(640, 400); await page.mouse.move(640, 560); await shoot('hands-1-idle'); // tilt down to see the hands
  await page.keyboard.down('Digit1'); await page.keyboard.up('Digit1'); // select a spell -> wand hand
  await shoot('hands-2-spell');
  await page.mouse.down({ button: 'left' }); await delay(150); await shoot('hands-3-swing'); await page.mouse.up({ button: 'left' });
  await browser.close(); done(0);
} catch (e) { console.error('HANDS-PROBE ERROR:', e); done(1); }
