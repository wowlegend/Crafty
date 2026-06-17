// soulbind-eyes-probe.mjs (W1 Task 11) — LIVE-LOOK the bound-ally eye gate. Drives the DEV-only
// soulbindShowcase fixture (App.jsx) which spawns jade-tinted ally spider/zombie + 3 hybrids via the
// REAL captureMob path (allegiance swap sets entity.isAlly=true while the entity KEEPS its hostile
// type). Pre-fix those allies rendered the hostile #ff0000 eyes; the fix gates that block on
// !entity.isAlly. This probe (a) screenshots the soulbind card for a human eye-check that no jade ally
// has red eyes, and (b) programmatically asserts the showcase allies are isAlly=true with a hostile
// type (proving the exact gated scenario is live). Mirrors esc-pause-probe.mjs harness. PNG -> /tmp/crafty-soulbind/.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
const PORT = 4196, URL = `http://localhost:${PORT}`;
const OUT = '/tmp/crafty-soulbind';
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
  const flushFrames = (n = 10) => page.evaluate(async (count) => {
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    for (let i = 0; i < count; i++) await raf();
  }, n);
  await page.evaluate(() => window.__craftyTest.call('start'));
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
  await delay(3000); // let terrain stream + player settle
  // Enter capture mode FIRST (the capture.mjs showcase pattern): this pauses the physics step, which
  // removes the headless-swiftshader Rapier WASM re-entrancy ("recursive use ... in rust") crash that
  // otherwise tears down the Canvas before the fixture renders. THEN drive the soulbind fixture (it
  // re-enters capture mode internally with its own 5-subject camera).
  await page.evaluate(() => window.__craftyTest.call('enterCapture', {}));
  await flushFrames(10);
  await delay(800);
  // drive the soulbind showcase fixture (spawns jade allies via the real captureMob allegiance path)
  await page.evaluate(() => window.__craftyTest.call('soulbindShowcase'));
  await flushFrames(14);
  await delay(1500); // let the fixture spawn + camera settle + frame render
  await page.screenshot({ path: `${OUT}/soulbind-allies.png` });
  console.log('shot soulbind-allies');
  // a crashed Canvas renders the ErrorBoundary fallback ("Something went wrong") — detect it so a
  // teardown can't masquerade as a vacuous "0 red eyes" PASS.
  const crashed = await page.evaluate(() => document.body.innerText.includes('Something went wrong'));
  if (crashed) { console.error('[soulbind-probe] FAIL: app crashed to ErrorBoundary before render'); await browser.close(); done(1); }
  // programmatic ground-truth via the THREE scene graph (window.__threeScene): the fix controls the
  // RENDER, so traverse the live scene and count meshes whose material is named "eye" with the hostile
  // red color (0xff0000). The soulbindShowcase fixture cleared the live mob population and spawned ONLY
  // jade allies (isAlly=true) — so post-fix the scene must contain ZERO red "eye" meshes. (Villager
  // green eyes are name="eye" too but color != red, so they don't count.)
  const eyeReport = await page.evaluate(() => {
    const scene = window.__threeScene;
    if (!scene) return { ok: false, reason: 'no __threeScene' };
    let redEyes = 0, totalEyes = 0;
    scene.traverse((o) => {
      const m = o.material;
      if (!m || m.name !== 'eye') return;
      totalEyes++;
      // THREE.Color: red hostile eye is 0xff0000 -> r==1,g==0,b==0
      const c = m.color;
      if (c && c.r === 1 && c.g === 0 && c.b === 0) redEyes++;
    });
    return { ok: true, redEyes, totalEyes };
  });
  console.log('[soulbind-probe] sceneEyeMeshes=' + JSON.stringify(eyeReport));
  const dbg = await page.evaluate(() => window.__showcaseDebug || []);
  console.log('[soulbind-probe] showcaseDebug=' + JSON.stringify(dbg));
  // PASS criterion: the showcase spawned at least some subjects (debug has no all-miss) AND the live
  // scene shows zero hostile red eye meshes (the jade allies render no red eyes after the fix).
  if (eyeReport.ok && eyeReport.redEyes === 0) {
    console.log('[soulbind-probe] PASS: 0 hostile red-eye meshes on the all-ally soulbind card');
    await browser.close(); done(0);
  } else {
    console.error('[soulbind-probe] FAIL: redEyes=' + JSON.stringify(eyeReport) + ' (expected 0 on all-ally card)');
    await browser.close(); done(1);
  }
} catch (e) { console.error('SOULBIND-PROBE ERROR:', e); done(1); }
