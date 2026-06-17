// magic-panel-probe.mjs (W1 Task 14) — LIVE-LOOK the M-key Magic panel after wiring the previously-dead
// MagicSystem (GamePanels.jsx) to the phantom showMagic surface. Mirrors esc-pause-probe.mjs (server-spawn +
// __craftyTest start hook + pointer-lock acquire), then presses 'm' mid-game and asserts the M key now opens
// the bold-flat "Magic Spells" panel (showMagic=true) rather than being an advertised-but-dead key.
// Saves PNGs to /tmp/crafty-magic/. Expects: gameStarted=true, showMagic-after-M=true, panel visible.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
const PORT = 4196, URL = `http://localhost:${PORT}`;
const OUT = '/tmp/crafty-magic';
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
  console.log('[magic-probe] pointer-locked=' + locked);
  const shoot = async (name) => { await delay(500); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
  await shoot('1-in-game'); // expect: HUD, NO Magic panel yet
  // Press 'm' the way a player does. The InputManager KeyM handler toggles showMagic AND calls
  // document.exitPointerLock() itself, so (unlike ESC) the keypress drives the full real path.
  await page.keyboard.press('m');
  await delay(600);
  const showMagic = await page.evaluate(() => window.useGameStore.getState().showMagic);
  await shoot('2-after-m'); // expect: bold-flat "Magic Spells" panel
  const started = await page.evaluate(() => window.useGameStore.getState().gameStarted);
  // Confirm the actual panel DOM rendered (the wired MagicSystem header text), not just the flag.
  const panelText = await page.evaluate(() => (document.body.innerText || '').includes('Magic Spells'));
  console.log('[magic-probe] gameStarted=' + started + ' showMagic-after-M=' + showMagic + ' panelTextVisible=' + panelText);
  if (!started || !showMagic || !panelText) { console.error('[magic-probe] FAIL: gameStarted/showMagic/panel not satisfied'); await browser.close(); done(1); }
  console.log('[magic-probe] PASS — M opens the Magic Spells panel');
  await browser.close(); done(0);
} catch (e) { console.error('MAGIC-PROBE ERROR:', e); done(1); }
