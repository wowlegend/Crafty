// dayphase-probe.mjs — LOOK probe (M6 #10): the day-phase dial is capture-SUPPRESSED (returns null in
// capture), so the visual gate can't see it -> drive REAL play and screenshot it. Reuses touch-probe's
// proven cold-start path (iPhone viewport + remove Pointer-Lock so the touch enterPlay bridge fires), then
// forces the clock to day/dusk/night via setTimeOfDay and shoots the top-right dial. NOT a gate; the human
// eyeball + the static dayPhase unit tests are the contract. Writes to /tmp/crafty-dayphase/.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer, { KnownDevices } from 'puppeteer';

const PORT = 4195, URL = `http://localhost:${PORT}`;
const OUT = '/tmp/crafty-dayphase';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const done = (c) => { try { server.kill('SIGKILL'); } catch {} process.exit(c); };

try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(URL); if (r.ok) break; } catch {} await delay(250); }
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.emulate(KnownDevices['iPhone 13']);
  // WIDE touch viewport: keeps the touch enterPlay bridge (hasTouch) so we can reach real play headlessly,
  // but a roomy top-right so the dial's APPEARANCE is clearly visible (the 390px phone top-right is too
  // crowded to eyeball it; the real-phone crowding is a separate, already-observed placement finding).
  await page.setViewport({ width: 1280, height: 820, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(() => {
    delete Element.prototype.requestPointerLock;
    delete HTMLElement.prototype.requestPointerLock;
    try { Object.defineProperty(document, 'pointerLockElement', { get: () => null }); } catch {}
    document.exitPointerLock = () => {};
    // suppress the one-time onboarding goal toast (it occupies the top-right where the dial sits) so the
    // dial LOOK is unobscured -- a returning player doesn't see it anyway.
    try { localStorage.setItem('crafty_onboarded', '1'); } catch {}
  });
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });

  // enter play (touch cold-start path)
  let startHandle = null;
  for (let i = 0; i < 24 && !startHandle; i++) {
    await delay(250);
    const h = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find((el) => /start adventure/i.test(el.textContent || '')) || null);
    startHandle = h.asElement();
    if (!startHandle) await h.dispose();
  }
  let playable = false;
  for (let attempt = 0; attempt < 3 && !playable; attempt++) {
    if (startHandle) { try { await startHandle.tap(); } catch {} }
    for (let i = 0; i < 12 && !playable; i++) {
      await delay(250);
      const st = await page.evaluate(() => ({ action: !!document.querySelector('button[aria-label="Action"]'), tap: !!document.querySelector('button[aria-label="Tap to play"]') }));
      if (st.tap) { const r = await page.evaluate(() => { const b = document.querySelector('button[aria-label="Tap to play"]'); const x = b.getBoundingClientRect(); return { x: Math.round(x.x + x.width / 2), y: Math.round(x.y + x.height / 2) }; }); await page.touchscreen.tap(r.x, r.y); await delay(300); }
      playable = st.action || await page.evaluate(() => !!document.querySelector('button[aria-label="Action"]'));
    }
  }
  console.log('playable =', playable);
  if (!playable) { await browser.close(); done(2); }
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 12000 }).catch(() => {});
  await delay(7500); // let the one-time onboarding/goal toast auto-dismiss so the top-right dial is unobscured

  // Force each phase via setTimeOfDay (frac->gameTime+isDay) and shoot the dial.
  const shots = [
    { name: 'day-noon', frac: 0.5 },   // gameTime 600, isDay -> sun at top
    { name: 'dusk', frac: 0.45 },      // gameTime 540, isDay, halfFrac 0.9 -> DUSK warn, sun upper-right
    { name: 'night', frac: 0.0 },      // gameTime 0, night -> moon at bottom, NIGHT label
  ];
  for (const s of shots) {
    await page.evaluate((f) => window.useGameStore.getState().setTimeOfDay(f), s.frac);
    await delay(1400); // let the 1s dial interval apply
    const phase = await page.evaluate(() => { const st = window.useGameStore.getState(); return { gameTime: st.gameTime, isDay: st.isDay }; });
    await page.screenshot({ path: `${OUT}/dial-${s.name}.png` });
    // top-right CROP at full res so the ~60px dial is legible (the full-page shot downscales it too small)
    await page.screenshot({ path: `${OUT}/crop-${s.name}.png`, clip: { x: 1280 - 240, y: 0, width: 240, height: 180 } });
    console.log(`shot ${s.name}:`, JSON.stringify(phase));
  }
  await browser.close(); done(0);
} catch (e) { console.error('DAYPHASE-PROBE ERROR:', e); done(1); }
