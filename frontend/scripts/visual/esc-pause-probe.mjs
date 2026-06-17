// esc-pause-probe.mjs (W1 Task 3) — LIVE-LOOK the ESC / boot / no-flash UX after deleting the legacy
// CRAFTY-RPG click-to-play overlay. Mirrors pov-probe.mjs (server-spawn + __craftyTest start hook +
// pointer-lock acquire), then presses Escape mid-game and asserts ESC opens the Settings (pause) panel
// rather than flashing the old slate-blue CRAFTY-RPG overlay or dumping to the title menu.
// Saves PNGs to /tmp/crafty-esc/. Expects: gameStarted=true, showSettings-after-ESC=true.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
const PORT = 4195, URL = `http://localhost:${PORT}`;
const OUT = '/tmp/crafty-esc';
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
  // acquire pointer lock (retry — headless flaky) so we are in the locked in-game state like a player
  let locked = false;
  for (let i = 0; i < 8 && !locked; i++) { await page.mouse.click(600 + i * 10, 400); await delay(300); locked = await page.evaluate(() => !!document.pointerLockElement); }
  console.log('[esc-probe] pointer-locked=' + locked);
  const shoot = async (name) => { await delay(500); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
  await shoot('1-in-game');                        // expect: HUD, NO CRAFTY-RPG overlay
  await page.keyboard.press('Escape');             // ESC mid-game (real browser: ESC releases pointer-lock)
  // Headless Chromium swallows ESC's native pointer-lock release, so the locked true->false transition
  // that App's ESC=pause handler keys off never fires from the keypress alone. Drive the unlock the way a
  // real browser's ESC does (document.exitPointerLock) so we exercise the SAME handler path a player hits.
  if (locked) { await page.evaluate(() => document.exitPointerLock && document.exitPointerLock()); }
  await delay(500);
  const paused = await page.evaluate(() => window.useGameStore.getState().showSettings);
  await shoot('2-after-esc');                       // expect: Settings (pause) panel, NOT title menu, NOT slate CRAFTY-RPG flash
  const started = await page.evaluate(() => window.useGameStore.getState().gameStarted);
  console.log('[esc-probe] gameStarted=' + started + ' showSettings-after-ESC=' + paused);
  if (!started || !paused) { console.error('[esc-probe] FAIL: gameStarted or ESC=pause not satisfied'); await browser.close(); done(1); }
  await browser.close(); done(0);
} catch (e) { console.error('ESC-PROBE ERROR:', e); done(1); }
