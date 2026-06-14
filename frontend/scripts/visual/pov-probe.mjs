// pov-probe.mjs — drive the REAL game (non-capture) to the PLAYER'S EYE and screenshot what the player
// actually sees on the ground (the diorama capture camera looks from orbit, so it never shows this).
// Lets me visually inspect the in-game world myself. Saves PNGs to /tmp/crafty-pov/.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
const PORT = 4193, URL = `http://localhost:${PORT}`;
const OUT = '/tmp/crafty-pov';
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
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5)); // midday for clarity
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
  await delay(5000); // let terrain stream + player settle on the ground
  // acquire pointer lock (retry — headless flaky) so we can aim the camera like a player
  let locked = false;
  for (let i = 0; i < 8 && !locked; i++) { await page.mouse.click(600 + i * 10, 400); await delay(300); locked = await page.evaluate(() => !!document.pointerLockElement); }
  const shoot = async (name) => { await delay(600); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
  await shoot('pov-1-forward');
  await page.mouse.move(640, 400); await page.mouse.move(640, 520); await shoot('pov-2-look-down'); // tilt down to ground
  await page.mouse.move(640, 520); await page.mouse.move(1000, 480); await shoot('pov-3-pan-right');
  await page.keyboard.down('KeyW'); await delay(1500); await page.keyboard.up('KeyW'); await shoot('pov-4-after-walk');
  const p = await page.evaluate(() => { const s = window.useGameStore.getState(); const pp = s.playerPosition; return { locked: !!document.pointerLockElement, pos: pp && { x: +pp.x.toFixed(1), y: +pp.y.toFixed(1), z: +pp.z.toFixed(1) } }; });
  console.log('state:', JSON.stringify(p));
  await browser.close(); done(0);
} catch (e) { console.error('POV-PROBE ERROR:', e); done(1); }
