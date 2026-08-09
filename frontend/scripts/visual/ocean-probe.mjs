// ocean-probe.mjs — clean (HUD-hidden) views of the OCEAN/COAST read for the ocean milestone. The
// committed states only show underwater (ocean-depth) or land (landmark); none show the surface/coast the
// way a player sees it. Drives the real game, hides the HUD (store.setHudHidden), pins the deterministic
// capture camera at coast/surface/underwater angles near the x≈-40 ocean, screenshots to /tmp/crafty-ocean/.
// Reusable across the milestone's slices (re-run after each water change to eyeball the result myself).
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { serveVite } from './_serve.mjs';
const PORT = 4196, URL = `http://localhost:${PORT}`, OUT = '/tmp/crafty-ocean';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
// Server lifecycle via the SHARED _serve.mjs, not a hand-rolled spawn. What that buys, concretely:
// this probe used to wait 60 x 250ms = 15s for vite and then FALL THROUGH SILENTLY, so when the box was
// loaded and vite needed ~20s to listen, the run failed 30s later as `Navigation timeout` pointing at the
// page -- when the truth was that no server ever came up. serveVite's waitReady THROWS
// `vite did not start on <port>`, with the budget set by the caller instead of baked into a loop bound.
// Same defect the capture harness had this morning: a fixed number standing in for a condition, and
// failing quietly enough to misattribute the cause.
const { waitReady, shutdown } = serveVite(PORT);
// Hygiene (charter §6.4): the browser closes in a `finally` so a throw AFTER launch can't leak it, and the
// server group is SIGKILLed there too. process.exit() skips pending finally blocks, so we exit AFTER it.
let browser = null, code = 0;
try {
  await waitReady(180); // 45s -- vite needs ~20s to listen on a loaded box, and quiet failure here is what misled the last three runs
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });
  await page.evaluate(() => window.__craftyTest.call('start'));
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
  await delay(1500);
  // W2-T7 de-island moved the coast out (threshold -0.15 -> -0.35): the -X shoreline now sits at
  // x~-90..-110, the deep basin at x~-120..-150 (was x~-40). These shots track the NEW coast.
  const shots = [
    { name: 'coast-overlook', cam: { position: [-30, 44, 22], lookAt: [-120, 27, -10] } }, // land -> beach -> open water
    { name: 'surface-skim',   cam: { position: [-82, 31, 26], lookAt: [-130, 28, -14] } }, // low over the surface
    { name: 'underwater',     cam: { position: [-100, 26, 20], lookAt: [-128, 10, -10] } }, // shore->deep ramp: depth tint
    { name: 'topdown-coast',  cam: { position: [-60, 78, 40], lookAt: [-110, 22, -6] } },  // high 3/4: coastline shape
  ];
  for (const s of shots) {
    // enterCapture freezes determinism + pins the camera; hide the HUD for a clean read (mirrors the studio cards).
    await page.evaluate((cam) => { window.__craftyTest.call('enterCapture', { timeOfDay: 0.5, camera: cam }); window.useGameStore.getState().setHudHidden(true); }, s.cam);
    await delay(2500);
    await page.screenshot({ path: `${OUT}/${s.name}.png` });
    console.log('shot', s.name);
  }
} catch (e) { console.error('OCEAN-PROBE ERROR:', e); code = 1; }
finally {
  // shared teardown: close() raced against a timeout then force-killed, plus the whole vite process GROUP
  await shutdown(browser);
}
process.exit(code);
