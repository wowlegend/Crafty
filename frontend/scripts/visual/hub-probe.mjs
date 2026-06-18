// hub-probe.mjs — drive the REAL game (non-capture) to the Hearth and screenshot the frontier-outpost
// buildings (forge/stall/watchtower/cabin) from the player POV, sweeping a full 360deg tilted slightly
// DOWN so each building's BASE meets the ground in frame (the key check: do they sit flush on the grade
// or float over the lower grass beyond the plinth?). Saves /tmp/crafty-hub/hub-*.png. Model: spawn-legibility-probe.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
const PORT = 4195, URL = `http://localhost:${PORT}`;
const OUT = '/tmp/crafty-hub';
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
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5)); // midday
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
  await delay(5000); // let the Hearth chunks stream + player settle on the pad
  let locked = false;
  for (let i = 0; i < 8 && !locked; i++) { await page.mouse.click(600 + i * 10, 400); await delay(300); locked = await page.evaluate(() => !!document.pointerLockElement); }
  const shoot = async (name) => { await delay(450); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
  const turn = async (mx) => { await page.evaluate((d) => { document.dispatchEvent(new MouseEvent('mousemove', { movementX: d, movementY: 0, bubbles: true })); }, mx); };
  // tilt DOWN a bit so building bases + ground contact are in frame (mouse tilt is proven; dispatched movementY over-tilts)
  await page.mouse.move(640, 400); await page.mouse.move(640, 470);
  for (let k = 0; k < 12; k++) {
    await shoot(`hub-${k}`);
    await turn(300); // ~30deg/step * 12 > full circle
  }
  const p = await page.evaluate(() => { const pp = window.useGameStore.getState().playerPosition; return { pos: pp && { x: +pp.x.toFixed(1), y: +pp.y.toFixed(1), z: +pp.z.toFixed(1) } }; });
  console.log('state:', JSON.stringify(p));
  await browser.close(); done(0);
} catch (e) { console.error('HUB-PROBE ERROR:', e); done(1); }
