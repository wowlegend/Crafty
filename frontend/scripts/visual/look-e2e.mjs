// look-e2e.mjs — the GATE that was missing when desktop mouse-look silently died: a real-browser
// proof that moving the mouse (under pointer lock) rotates the camera. The unit suite + visual gate
// run in capture mode (camera pinned, lock suppressed), so ONLY this exercises live pointer-lock look.
// Run: `npm run test:look`. Exits non-zero if the camera does not rotate on mouse movement.
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer';

const PORT = 4191;
const URL = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
// detached: vite runs in its OWN process group so the finally can SIGKILL the whole group; a plain
// server.kill() only reaps the npx wrapper and ORPHANS the vite child holding :4191 (hygiene, charter §6.4).
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
let browser = null, code = 0;

try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(URL); if (r.ok) break; } catch {} await delay(250); }
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });
  await page.evaluate(() => window.__craftyTest.call('start'));
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
  await delay(2500);
  await page.waitForFunction("!!window.__threeCamera", { timeout: 10000 });

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
finally {
  if (browser) { try { await browser.close(); } catch {} }
  // kill the whole vite process GROUP (npx wrapper + its forked child); fall back to a plain kill.
  try { process.kill(-server.pid, 'SIGKILL'); } catch { try { server.kill('SIGKILL'); } catch {} }
}
process.exit(code);
