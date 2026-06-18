// spawn-legibility-probe.mjs — drive the REAL game (non-capture) to confirm the M-HUD.10 FarBeacon
// light-shafts are visible ON THE HORIZON FROM SPAWN (before walking to that chunk). The shrine beacon
// is cyan (#46E0FF), the Blight-Heart beacon is violet (#A24BFF). Because the beacon bearing isn't
// exposed to the page, we do a horizon-level YAW SWEEP (8 shots around the compass) so the tall additive
// shafts appear in whichever direction they lie. Saves PNGs to /tmp/crafty-spawn/. Model: pov-probe.mjs.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
const PORT = 4197, URL = `http://localhost:${PORT}`;
const OUT = '/tmp/crafty-spawn';
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
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5)); // midday so the additive shaft reads against bright sky
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
  await delay(5000); // let terrain stream + player settle on the ground (do NOT walk — beacon must show FROM SPAWN)
  // acquire pointer lock (retry — headless flaky) so we can aim the camera like a player
  let locked = false;
  for (let i = 0; i < 8 && !locked; i++) { await page.mouse.click(600 + i * 10, 400); await delay(300); locked = await page.evaluate(() => !!document.pointerLockElement); }
  const shoot = async (name) => { await delay(450); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
  // Yaw via DISPATCHED pointer-lock movement events: absolute page.mouse.move can't accumulate a net
  // rotation (a reset move cancels the prior delta), so the old sweep only turned once. Dispatching a
  // fixed movementX each step feeds the game's pointer-lock handler a consistent yaw delta -> a real,
  // guaranteed full revolution. ~16 steps × movementX 230 comfortably exceeds 360°.
  const turn = async (mx) => { await page.evaluate((d) => { document.dispatchEvent(new MouseEvent('mousemove', { movementX: d, movementY: 0, bubbles: true })); }, mx); };
  // tilt up to horizon level first (proven gentle mouse-based tilt; dispatched movementY over-tilted to ground)
  await page.mouse.move(640, 400); await page.mouse.move(640, 360);
  for (let k = 0; k < 16; k++) {
    await shoot(`sweep-${k}`);
    await turn(230);
  }
  const p = await page.evaluate(() => {
    const s = window.useGameStore.getState(); const pp = s.playerPosition;
    return { locked: !!document.pointerLockElement, spawnChunk: s.isSpawnChunkLoaded, pos: pp && { x: +pp.x.toFixed(1), y: +pp.y.toFixed(1), z: +pp.z.toFixed(1) } };
  });
  console.log('state:', JSON.stringify(p));
  await browser.close(); done(0);
} catch (e) { console.error('SPAWN-PROBE ERROR:', e); done(1); }
