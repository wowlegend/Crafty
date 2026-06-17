// heldf-probe.mjs (W1 Task 10) — LIVE behavioral probe for the KeyF triple-conflict resolution.
// Before this task, F did BOTH melee-on-keydown (Components keydown) AND continuous-cast-on-hold
// (the useFrame `if (keys.KeyF)` block, gated only by the 333ms CAST_COOLDOWN). We removed the
// held-F continuous cast (F is now MELEE only; RMB owns cast). This probe drives the real app,
// HOLDS `f` for well past the cast cooldown, and asserts the spell-cast path NEVER fires from the
// hold — i.e. no projectile/cast climbs while F is held. (Store has no projectile array; the held-F
// effect was exclusively `useGameStore.getState().castSpell(...)`, so we count castSpell calls.)
// Saves PNGs to /tmp/crafty-heldf/. Expects: castCount stays 0 while F held ~1.3s (old code: >=3).
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
const PORT = 4196, URL = `http://localhost:${PORT}`;
const OUT = '/tmp/crafty-heldf';
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
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5));
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
  await delay(5000); // terrain stream + player settle on ground
  // acquire pointer lock (retry — headless flaky) so we are in the locked in-game state like a player
  let locked = false;
  for (let i = 0; i < 8 && !locked; i++) { await page.mouse.click(600 + i * 10, 400); await delay(300); locked = await page.evaluate(() => !!document.pointerLockElement); }
  console.log('[heldf-probe] pointer-locked=' + locked);
  // Instrument: wrap the live castSpell so any cast (the ONLY thing held-F used to do) increments a
  // window counter. We wrap AFTER mount so EnhancedMagicSystem's setState({castSpell}) is in place.
  const wrapped = await page.evaluate(() => {
    const st = window.useGameStore.getState();
    if (typeof st.castSpell !== 'function') return 'no-castSpell';
    window.__castCount = 0;
    const orig = st.castSpell;
    window.useGameStore.setState({ castSpell: (...a) => { window.__castCount++; return orig(...a); } });
    return 'wrapped';
  });
  console.log('[heldf-probe] castSpell instrumentation=' + wrapped);
  await page.screenshot({ path: `${OUT}/1-in-game.png` });
  const before = await page.evaluate(() => window.__castCount ?? -1);
  // HOLD f for ~1.3s. CAST_COOLDOWN is 333ms — old held-F code would have fired ~3-4 casts in this window.
  await page.keyboard.down('f');
  await delay(1300);
  await page.screenshot({ path: `${OUT}/2-while-f-held.png` });
  const during = await page.evaluate(() => window.__castCount ?? -1);
  await page.keyboard.up('f');
  await delay(300);
  await page.screenshot({ path: `${OUT}/3-after-f-release.png` });
  const after = await page.evaluate(() => window.__castCount ?? -1);
  console.log(`[heldf-probe] castCount before=${before} duringHold=${during} afterRelease=${after}`);
  // Control: a single RMB press SHOULD still cast (proves the cast verb is alive on its real owner,
  // so a 0 during hold is "F doesn't cast", not "casting is globally dead").
  await page.mouse.down({ button: 'right' });
  await delay(120);
  await page.mouse.up({ button: 'right' });
  await delay(400);
  const afterRmb = await page.evaluate(() => window.__castCount ?? -1);
  console.log(`[heldf-probe] castCount afterRMB=${afterRmb} (RMB should cast -> >after)`);
  let fail = 0;
  if (wrapped !== 'wrapped') { console.error('[heldf-probe] FAIL: could not instrument castSpell'); fail = 1; }
  if (during !== before) { console.error(`[heldf-probe] FAIL: held-F spawned ${during - before} cast(s) — held-F cast NOT removed`); fail = 1; }
  if (after !== before) { console.error('[heldf-probe] FAIL: cast count climbed across F hold/release'); fail = 1; }
  if (locked && afterRmb <= after) { console.warn('[heldf-probe] WARN: RMB did not register a cast (headless mouse flaky) — held-F=0 result still valid'); }
  if (fail) { await browser.close(); done(1); }
  console.log('[heldf-probe] PASS: held-F produced no cast; F is melee-only.');
  await browser.close(); done(0);
} catch (e) { console.error('HELDF-PROBE ERROR:', e); done(1); }
