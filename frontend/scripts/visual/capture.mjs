// Spawns `vite dev`, drives the app to known states via window.__craftyTest
// (DEV-only bridge), and screenshots each to tests/visual/<current|baseline>/<state>.png.
// Reachable states today: menu, explore-day, explore-night. The two danger states
// (dusk-danger, boss-obsidian) are added when S1-B introduces dangerLevel.
//
// Determinism: `enterCapture` flips the dev-only capture-determinism layer ON before any
// frame is taken — seeded decorative RNG, paused physics, a pinned follow-cam pose, and
// suppressed mob spawns — so each state renders byte-stable across runs (self-diff < 1%).
// Capture mode also suppresses the auto-pointer-lock, keeping the menu overlay visible
// until we explicitly `start`, so the `menu` frame is the real title screen.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..'); // frontend/
const isBaseline = process.argv.includes('--baseline');
const OUT = resolve(ROOT, 'tests/visual', isBaseline ? 'baseline' : 'current');
const PORT = 4178;
const URL = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await delay(250);
  }
  throw new Error('dev server did not start');
}

// Terrain chunks stream in asynchronously after `start`; capturing mid-stream yields a
// different partial-terrain frame each run. Poll the generated-chunk count until it stops
// growing (stable across consecutive polls) so the world is fully meshed before screenshot.
async function waitForStableTerrain(page, { interval = 300, stableFor = 3, max = 40 } = {}) {
  let last = -1;
  let stable = 0;
  for (let i = 0; i < max; i++) {
    const size = await page.evaluate(() => {
      const g = window.useGameStore.getState().getGeneratedChunks;
      return g ? g().size : -1;
    });
    if (size === last && size > 0) {
      if (++stable >= stableFor) return;
    } else {
      stable = 0;
      last = size;
    }
    await delay(interval);
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--no-open'], { cwd: ROOT, stdio: 'ignore' });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await waitForServer(URL);
    await page.goto(URL, { waitUntil: 'networkidle2' });
    await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });

    // Enter the capture-determinism layer BEFORE any frame: seeded RNG + paused
    // physics/clock + pinned camera + suppressed mobs + suppressed auto-pointer-lock.
    await page.evaluate(() => window.__craftyTest.call('enterCapture', {}));
    // Let the spawn chunk stream in (world builds) while the menu overlay stays up.
    await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
    await delay(1500);

    // menu (title screen — pointer still unlocked, auto-lock suppressed by capture mode)
    await page.screenshot({ path: resolve(OUT, 'menu.png') });
    console.log('captured menu');

    // explore-day: start (locks pointer, dismisses menu), wait for terrain to fully
    // stream + mesh (so the frame is byte-stable across runs), then force midday.
    await page.evaluate(() => window.__craftyTest.call('start'));
    await waitForStableTerrain(page);
    await delay(800);
    await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5));
    await delay(1500);
    await page.screenshot({ path: resolve(OUT, 'explore-day.png') });
    console.log('captured explore-day');

    // explore-night
    await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.0));
    await delay(1500);
    await page.screenshot({ path: resolve(OUT, 'explore-night.png') });
    console.log('captured explore-night');
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
