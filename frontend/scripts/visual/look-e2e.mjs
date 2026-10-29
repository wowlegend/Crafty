// look-e2e.mjs — the GATE that was missing when desktop mouse-look silently died: a real-browser
// proof that moving the mouse (under pointer lock) rotates the camera. The unit suite runs in capture
// mode (camera pinned, lock suppressed) and no e2e spec moves the mouse under lock and reads the camera,
// so ONLY this exercises live pointer-lock look.
// Run: `npm run test:look`. Exits non-zero if the camera does not rotate on mouse movement.
import { chromium } from '@playwright/test';
import { serveVite, probePort } from './_serve.mjs';

const PORT = probePort(import.meta.url);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const { url, waitReady, shutdown } = serveVite(PORT);
let browser = null, code = 0;

try {
  await waitReady();
  browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--use-angle=swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", null, { timeout: 25000 });
  await page.evaluate(() => window.__craftyTest.call('start'));
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", null, { timeout: 15000 }).catch(() => {});
  await delay(2500);
  await page.waitForFunction("!!window.__threeCamera", null, { timeout: 10000 });

  // 1) REAL pointer lock via a click gesture, then a real mouse move -> camera must rotate.
  await page.mouse.click(640, 400);
  await delay(300);
  const before = await page.evaluate(() => ({ locked: !!document.pointerLockElement, y: window.__threeCamera.rotation.y, x: window.__threeCamera.rotation.x }));
  await page.mouse.move(640, 400); await page.mouse.move(900, 430); await page.mouse.move(1100, 470);
  await delay(150);
  const after = await page.evaluate(() => ({ y: window.__threeCamera.rotation.y, x: window.__threeCamera.rotation.x }));
  const dyaw = Math.abs(after.y - before.y);
  const dpitch = Math.abs(after.x - before.x);

  const pass = before.locked && dyaw > 0.05;
  console.log(`[look-e2e] pointerLock=${before.locked} yawDelta=${dyaw.toFixed(3)} pitchDelta=${dpitch.toFixed(3)} -> ${pass ? 'PASS' : 'FAIL'}`);
  if (!pass) { console.error('[look-e2e] FAIL: mouse movement did not rotate the camera under pointer lock (the dead-camera regression).'); code = 1; }
} catch (e) { console.error('[look-e2e] ERROR:', e); code = 1; }
finally { await shutdown(browser); }
process.exit(code);
