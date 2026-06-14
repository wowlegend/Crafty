// ocean-probe.mjs — clean (HUD-hidden) views of the OCEAN/COAST read for the ocean milestone. The
// committed states only show underwater (ocean-depth) or land (landmark); none show the surface/coast the
// way a player sees it. Drives the real game, hides the HUD (store.setHudHidden), pins the deterministic
// capture camera at coast/surface/underwater angles near the x≈-40 ocean, screenshots to /tmp/crafty-ocean/.
// Reusable across the milestone's slices (re-run after each water change to eyeball the result myself).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
const PORT = 4196, URL = `http://localhost:${PORT}`, OUT = '/tmp/crafty-ocean';
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
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
  await delay(1500);
  const shots = [
    { name: 'coast-overlook', cam: { position: [20, 42, 20], lookAt: [-55, 27, -10] } },  // land -> beach -> open water
    { name: 'surface-skim',   cam: { position: [-22, 31, 26], lookAt: [-60, 28, -14] } },  // low over the surface
    { name: 'underwater',     cam: { position: [-40, 22, 12], lookAt: [-46, 11, -10] } },  // below sea level: depth tint
    { name: 'topdown-coast',  cam: { position: [-12, 72, 34], lookAt: [-46, 18, -20] } },  // high 3/4: coastline shape
  ];
  for (const s of shots) {
    // enterCapture freezes determinism + pins the camera; hide the HUD for a clean read (mirrors the studio cards).
    await page.evaluate((cam) => { window.__craftyTest.call('enterCapture', { timeOfDay: 0.5, camera: cam }); window.useGameStore.getState().setHudHidden(true); }, s.cam);
    await delay(2500);
    await page.screenshot({ path: `${OUT}/${s.name}.png` });
    console.log('shot', s.name);
  }
  await browser.close(); done(0);
} catch (e) { console.error('OCEAN-PROBE ERROR:', e); done(1); }
