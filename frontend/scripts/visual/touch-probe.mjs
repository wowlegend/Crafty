// touch-probe.mjs — VERIFY-BEFORE-ASSERT the iPad/iPhone touch controls on a real touch viewport, the
// FULL real-player path from the title screen. The headless visual harness uses a desktop PINNED camera
// and never exercises touch — the exact blind spot that hid the dead mouse-look. This emulates iPhone 13
// AND removes the Pointer-Lock API (iOS Safari has no pointer lock), then plays the game the way a real
// player does: tap "Start Adventure" → the world must become PLAYABLE (no lock to fall back on) → drive
// the LEFT (move) + RIGHT (look) zones with real touch and assert the player moves + camera rotates.
// Screenshots the touch HUD to /tmp/crafty-touch/ so I can LOOK at it. Exit 0 only if every check passes.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer, { KnownDevices } from 'puppeteer';

const PORT = 4194, URL = `http://localhost:${PORT}`;
const OUT = '/tmp/crafty-touch';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const done = (c) => { try { server.kill('SIGKILL'); } catch {} process.exit(c); };
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`); };

try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(URL); if (r.ok) break; } catch {} await delay(250); }
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.emulate(KnownDevices['iPhone 13']);   // touch + mobile viewport + iOS UA → isTouchDevice() true
  // iOS Safari has NO Pointer Lock. Remove it so the probe can't accidentally pass via a desktop-only path.
  await page.evaluateOnNewDocument(() => {
    delete Element.prototype.requestPointerLock;
    delete HTMLElement.prototype.requestPointerLock;
    try { Object.defineProperty(document, 'pointerLockElement', { get: () => null }); } catch {}
    document.exitPointerLock = () => {};
  });
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });

  // 0) precondition — touch emulated + NO pointer lock (faithful iOS)
  const env = await page.evaluate(() => ({ mtp: navigator.maxTouchPoints, coarse: matchMedia('(any-pointer: coarse)').matches, noLock: !document.body.requestPointerLock, w: innerWidth, h: innerHeight }));
  check('touch emulated + pointer-lock removed (iOS-faithful)', (env.mtp > 0 || env.coarse) && env.noLock, JSON.stringify(env));
  await page.screenshot({ path: `${OUT}/touch-0-title.png` });

  // 1) REAL ENTRY — tap the title-screen "Start Adventure" button (the only cold-start path a player has).
  //    The title button mounts via framer-motion (delay ~0.9s), so poll a moment for it to appear.
  let startBtn = null;
  for (let i = 0; i < 24 && !startBtn; i++) {
    await delay(250);
    startBtn = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => /start adventure/i.test(el.textContent || ''));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
  }
  check('title screen shows "Start Adventure"', !!startBtn, startBtn ? `@${startBtn.x},${startBtn.y}` : 'no Start Adventure button found');
  if (startBtn) await page.touchscreen.tap(startBtn.x, startBtn.y);

  // 2) THE BUG GATE — after tapping Start Adventure the game must become PLAYABLE on touch (active gate
  //    open). On touch there is no pointer-lock to set `active`, so menu→play must be bridged some other
  //    way. We detect playable = the in-game Action verb button exists (renders only when active) OR the
  //    Tap-to-Play overlay appears (the explicit second-tap activation). Poll up to 8s for world build.
  let playable = false, tapToPlay = false;
  for (let i = 0; i < 32 && !playable; i++) {
    await delay(250);
    const st = await page.evaluate(() => ({
      action: !!document.querySelector('button[aria-label="Action"]'),
      tap: !!document.querySelector('button[aria-label="Tap to play"]'),
      menu: [...document.querySelectorAll('button')].some((el) => /start adventure/i.test(el.textContent || '')),
    }));
    tapToPlay = st.tap;
    if (st.tap) { // explicit Tap-to-Play activation gesture — tap it (the designed touch entry)
      const r = await page.evaluate(() => { const b = document.querySelector('button[aria-label="Tap to play"]'); const x = b.getBoundingClientRect(); return { x: Math.round(x.x + x.width / 2), y: Math.round(x.y + x.height / 2) }; });
      await page.touchscreen.tap(r.x, r.y); await delay(300);
    }
    playable = await page.evaluate(() => !!document.querySelector('button[aria-label="Action"]'));
  }
  check('Start Adventure leads to a PLAYABLE touch game (menu→play bridged)', playable, playable ? (tapToPlay ? 'via Tap-to-Play overlay' : 'menu dismissed straight to play') : 'STUCK on title — touch cold-start is DEAD');
  await page.screenshot({ path: `${OUT}/touch-1-after-start.png` });

  if (!playable) { // can't test the surface if we can't even enter — report and bail
    console.log('\nTOUCH CHECKS FAILED (cold-start blocked) — screenshots in ' + OUT);
    await browser.close(); done(2);
  }

  // 3) MOVE — LEFT-zone joystick drag = walk. Intent persists once set, so hold it while the player moves.
  const W = env.w, H = env.h;
  const snap = () => page.evaluate(() => {
    const s = window.useGameStore.getState();
    const p = s.playerPosition; const c = s.gameCamera; // gameCamera is the exact camera touch-look mutates
    return { pos: p ? { x: +p.x.toFixed(2), z: +p.z.toFixed(2) } : null, yaw: c ? +c.rotation.y.toFixed(3) : null };
  });
  const before = await snap();
  await page.touchscreen.touchStart(W * 0.25, H * 0.62);
  await page.touchscreen.touchMove(W * 0.25, H * 0.40);
  await page.touchscreen.touchMove(W * 0.25, H * 0.38);
  await delay(1500);
  const moved = await snap();
  await page.touchscreen.touchEnd();
  const moveDelta = before.pos && moved.pos ? Math.hypot(moved.pos.x - before.pos.x, moved.pos.z - before.pos.z) : 0;
  check('LEFT-zone joystick moves the player', moveDelta > 0.5, `Δpos=${moveDelta.toFixed(2)}`);

  // 4) LOOK — RIGHT-zone drag rotates the camera (delta-based; a few moves accumulate yaw).
  const lookBefore = await snap();
  await page.touchscreen.touchStart(W * 0.72, H * 0.5);
  for (let i = 1; i <= 7; i++) { await page.touchscreen.touchMove(W * 0.72 + i * 16, H * 0.5); await delay(50); }
  await delay(150);
  const looked = await snap();
  await page.touchscreen.touchEnd();
  const yawDelta = lookBefore.yaw != null && looked.yaw != null ? Math.abs(looked.yaw - lookBefore.yaw) : 0;
  check('RIGHT-zone drag rotates the camera', yawDelta > 0.03, `Δyaw=${yawDelta.toFixed(3)}`);
  await page.screenshot({ path: `${OUT}/touch-2-playing.png` });

  // 5) VERB — the Action hit-area taps without throwing (performVerb smoke)
  let verbOk = false;
  const actionBtn = await page.$('button[aria-label="Action"]');
  if (actionBtn) { try { await actionBtn.tap(); verbOk = true; } catch { verbOk = false; } }
  check('Action verb button taps without error', verbOk, '');
  await page.screenshot({ path: `${OUT}/touch-3-final.png` });

  const allOk = results.every((r) => r.ok);
  console.log(`\n${allOk ? 'ALL TOUCH CHECKS PASS' : 'TOUCH CHECKS FAILED'} — screenshots in ${OUT}`);
  await browser.close(); done(allOk ? 0 : 2);
} catch (e) { console.error('TOUCH-PROBE ERROR:', e); done(1); }
