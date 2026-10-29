// look-e2e.mjs — the GATE that was missing when desktop mouse-look silently died: a real-browser
// proof that moving the mouse (under pointer lock) rotates the camera. The unit suite runs in capture
// mode (camera pinned, lock suppressed) and no e2e spec moves the mouse under lock and reads the camera,
// so ONLY this exercises live pointer-lock look.
// Run: `npm run test:look`. Exit 0: a real lock was granted and the mouse turned the camera. Exit 2: eight clicks got no
// lock (one click did not, on a loaded Mac, 2026-10-29; pov-probe's eight did), so the lock is stood in (_probe.mjs) and
// only "a mouse moved while a lock is held turns the camera" is checked; acquiring the lock on the canvas is NOT.
// Exit 1: the camera did not turn.
import { chromium } from '@playwright/test';
import { serveVite, probePort } from './_serve.mjs';
import { standInPointerLock } from './_probe.mjs';

const PORT = probePort(import.meta.url);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const { url, waitReady, shutdown } = serveVite(PORT);
let browser = null, code = 0;

try {
  await waitReady();
  browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--use-angle=swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE.ERROR:', m.text().slice(0, 240)); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", null, { timeout: 25000 });
  await page.evaluate(() => window.__craftyTest.call('start'));
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", null, { timeout: 15000 }).catch(() => {});
  await delay(2500);
  // A camera that never appears is named with the state around it, so a page that never built its GL canvas does not
  // read as a dead mouse-look.
  if (!(await page.waitForFunction("!!window.__threeCamera", null, { timeout: 30000 }).then(() => true, () => false))) {
    const st = await page.evaluate(() => ({
      canvases: document.querySelectorAll('canvas').length,
      webgl2: [...document.querySelectorAll('canvas')].map((c) => !!c.getContext('webgl2')),
      spawnChunkLoaded: window.useGameStore?.getState?.().isSpawnChunkLoaded ?? null,
    }));
    throw new Error(`COULD NOT CHECK — no window.__threeCamera after 30 s (${JSON.stringify(st)})`);
  }

  // 1) REAL pointer lock via a click gesture, then a real mouse move -> camera must rotate.
  for (let i = 0; i < 8 && !(await page.evaluate(() => !!document.pointerLockElement)); i++) {
    await page.mouse.click(600 + i * 10, 400);
    await delay(300);
  }
  const lock = await page.evaluate(standInPointerLock); // 'held' when the click got a real lock
  const before = await page.evaluate(() => ({ locked: !!document.pointerLockElement, y: window.__threeCamera.rotation.y, x: window.__threeCamera.rotation.x }));
  await page.mouse.move(640, 400); await page.mouse.move(900, 430); await page.mouse.move(1100, 470);
  await delay(150);
  const after = await page.evaluate(() => ({ y: window.__threeCamera.rotation.y, x: window.__threeCamera.rotation.x }));
  const dyaw = Math.abs(after.y - before.y);
  const dpitch = Math.abs(after.x - before.x);

  const turned = before.locked && dyaw > 0.05;
  const verdict = !turned ? 'FAIL' : lock === 'held' ? 'PASS' : 'PARTIAL (lock stood in; acquiring it is not checked)';
  console.log(`[look-e2e] pointerLock=${lock} yawDelta=${dyaw.toFixed(3)} pitchDelta=${dpitch.toFixed(3)} -> ${verdict}`);
  if (!turned) { console.error('[look-e2e] FAIL: mouse movement did not rotate the camera under pointer lock (the dead-camera regression).'); code = 1; }
  else if (lock !== 'held') code = 2;
} catch (e) { console.error('[look-e2e] ERROR:', e); code = 1; }
finally { await shutdown(browser); }
process.exit(code);
