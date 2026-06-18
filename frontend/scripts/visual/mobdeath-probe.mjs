// mobdeath-probe.mjs -- W2-T5 LIVE-LOOK for the hue-preserving mob DEATH burst.
// Drives the REAL game into capture mode (so the kill holds a deterministic frozen pose),
// then forces a lethal hit on a GREEN zombie via the killMobShowcase hook. The frame must show:
//   - a GREEN spark soul-burst rising upward (hue PRESERVED -- NOT a white/black puff),
//   - a t=0 hot flash at the burst centre,
//   - a fading ground-ring decal in the mob's colour.
// Saves PNGs to /tmp/crafty-mobdeath/. NOT part of the visual gate (death is transient). Mirrors
// capture.mjs's launch recipe + spell-elements-probe.mjs's hook-driving sequence.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';

const PORT = 5212;
const URL = `http://localhost:${PORT}`;
const OUT = '/tmp/crafty-mobdeath';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

async function waitForServer(url) {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await delay(250);
  }
  throw new Error('dev server did not start');
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--no-open'], { cwd: process.cwd(), stdio: 'ignore' });
const done = (c) => { try { server.kill('SIGKILL'); } catch {} process.exit(c); };

try {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.setViewport({ width: 1280, height: 860 });
  await waitForServer(URL);
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });
  await page.evaluate(() => window.__craftyTest.call('enterCapture', {}));
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
  await delay(1500);
  await page.evaluate(() => window.__craftyTest.call('start'));
  await delay(2500);

  // NIGHT (default): the real gameplay backdrop for a kill -- a dark sky lets the GREEN additive
  // spark burst survive (the honest hue-preservation read). Force the lethal hit + frame it.
  await page.evaluate(() => window.__craftyTest.call('killMobShowcase'));
  await delay(1000); // let the burst + flash + decal settle into the frozen pose
  await page.screenshot({ path: `${OUT}/mobdeath-green-zombie-night.png` });
  console.log('captured mobdeath-green-zombie-night -> ' + OUT + '/mobdeath-green-zombie-night.png');

  // DAY contrast card: the bright midday sky desaturates the additive burst (worst case).
  await page.evaluate(() => window.__craftyTest.call('killMobShowcase', { day: true }));
  await delay(1000);
  await page.screenshot({ path: `${OUT}/mobdeath-green-zombie-day.png` });
  console.log('captured mobdeath-green-zombie-day -> ' + OUT + '/mobdeath-green-zombie-day.png');
  console.log('hooks available:', await page.evaluate(() => window.__craftyTest.list().filter((n) => /kill|death/i.test(n))));

  await browser.close();
  done(0);
} catch (e) {
  console.error('MOBDEATH-PROBE ERROR:', e);
  done(1);
}
