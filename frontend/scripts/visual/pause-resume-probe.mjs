// pause-resume-probe.mjs — LIVED proof for Kevin's 2026-08-05 report: "press ESC to bring up the
// menus, then ESC to quit it -> unable to move, the character remains frozen, and dies from a mob."
//
// WHY A NEW PROBE, given esc-pause-probe.mjs exists: that one presses ESC exactly ONCE, and at its
// line 54 it substitutes document.exitPointerLock() for the native ESC. Per MDN (Element.requestPointerLock,
// accessed 2026-08-05) that substitution is the ONE path that does NOT trigger the browser's refusal:
//   "If calling requestPointerLock() immediately after releasing the pointer lock via the default unlock
//    gesture (instead of through an exitPointerLock() call), the call will fail, even if a transient
//    activation is available."
// So the existing probe is green over precisely the half of the flow the bug lives in. This one covers
// the SECOND ESC and the refusal.
//
// Headless Chromium swallows ESC's native pointer-lock release, so the refusal cannot be produced by
// pressing a key here. It is INJECTED instead — requestPointerLock is replaced by one that fires
// pointerlockerror, which is exactly what the browser itself does on this path. The injection models a
// documented browser behaviour; it does not invent one.
//
// Exit 0 only if every check passes. Screenshots to /tmp/crafty-pause/.
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { serveVite } from './_serve.mjs';

const PORT = 4198;
const OUT = '/tmp/crafty-pause';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const { url, waitReady, shutdown } = serveVite(PORT);
let browser = null;
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`);
};

/** Hold a movement key and report how far the camera actually travelled. */
async function moveDistance(page, ms = 700) {
  const before = await page.evaluate(() => {
    const c = window.useGameStore.getState().gameCamera;
    return c ? { x: c.position.x, y: c.position.y, z: c.position.z } : null;
  });
  await page.keyboard.down('KeyW');
  await delay(ms);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => {
    const c = window.useGameStore.getState().gameCamera;
    return c ? { x: c.position.x, y: c.position.y, z: c.position.z } : null;
  });
  if (!before || !after) return null;
  return Math.hypot(after.x - before.x, after.z - before.z);
}

try {
  await waitReady();
  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForFunction(
    "typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()",
    { timeout: 25000 },
  );
  await page.evaluate(() => window.__craftyTest.call('start'));
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5));
  await page.waitForFunction('window.useGameStore.getState().isSpawnChunkLoaded === true', { timeout: 15000 }).catch(() => {});
  await delay(5000); // terrain streams in and the player settles on the ground

  // Enter play the way a player does — a real click, which is what grants pointer lock.
  let locked = false;
  for (let i = 0; i < 8 && !locked; i++) {
    await page.mouse.click(600 + i * 10, 400);
    await delay(300);
    locked = await page.evaluate(() => !!document.pointerLockElement);
  }
  check('pointer lock acquired by a real click (the baseline play state)', locked, `locked=${locked}`);
  if (!locked) { console.error('cannot probe the pause cycle without a baseline lock'); throw new Error('no baseline lock'); }

  // 1) BASELINE — the player can move. Without this the "frozen" check below proves nothing:
  //    a probe that never moved in the first place reports a freeze either way.
  //    Retried: the first attempt can land while the player is still falling onto freshly-streamed
  //    terrain, and a probe that reports "cannot move" for that reason is measuring the wrong thing.
  let baseline = 0;
  for (let i = 0; i < 4 && !(baseline > 0.5); i++) {
    if (i) await delay(2000);
    baseline = (await moveDistance(page)) ?? 0;
    if (!(baseline > 0.5)) {
      const diag = await page.evaluate(() => {
        const s = window.useGameStore.getState();
        const rb = s.playerRigidBodyRef && s.playerRigidBodyRef.current;
        const t = rb && rb.translation ? rb.translation() : null;
        return { lock: !!document.pointerLockElement, isAlive: s.isAlive, gameStarted: s.gameStarted, hasRb: !!rb, y: t ? +t.y.toFixed(2) : null };
      });
      console.log(`   [baseline attempt ${i + 1}] dist=${baseline.toFixed(2)} ${JSON.stringify(diag)}`);
    }
  }
  check('BASELINE: holding W moves the player', baseline > 0.5, `dist=${baseline.toFixed(2)}`);
  await page.screenshot({ path: `${OUT}/1-playing.png` });

  // 2) FIRST ESC — the browser releases the lock and the pause menu opens.
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.exitPointerLock && document.exitPointerLock()); // headless swallows the native release
  await delay(600);
  const paused = await page.evaluate(() => window.useGameStore.getState().showSettings);
  check('FIRST ESC opens the pause menu', paused === true, `showSettings=${paused}`);
  await page.screenshot({ path: `${OUT}/2-paused.png` });

  // 3) INJECT THE DOCUMENTED REFUSAL, then press ESC a second time — "press esc to quit it".
  await page.evaluate(() => {
    window.__realRPL = HTMLCanvasElement.prototype.requestPointerLock;
    HTMLCanvasElement.prototype.requestPointerLock = function () {
      document.dispatchEvent(new Event('pointerlockerror')); // what Chrome does after the default unlock gesture
    };
  });
  await page.keyboard.press('Escape');
  await delay(800);

  const stranded = await page.evaluate(() => {
    const s = window.useGameStore.getState();
    return {
      showSettings: s.showSettings,
      gameStarted: s.gameStarted,
      isAlive: s.isAlive,
      lockEl: !!document.pointerLockElement,
      overlay: !!document.querySelector('[data-testid="resume-overlay"]'),
      // Is the overlay the topmost DOM surface at screen centre? Guards against a HUD panel covering the
      // resume control. NOTE the blind spot: elementFromPoint skips pointer-events:none nodes, so this
      // cannot see a non-interactive HUD element painted on top — and it says nothing at all about the
      // WebGL canvas beneath (mob nametags are drawn in-scene, so the scrim dims them rather than hiding
      // them, which is correct). The frame in /tmp/crafty-pause is the authority on what it LOOKS like.
      topAtCentre: (() => {
        const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        if (!el) return 'none';
        const ov = document.querySelector('[data-testid="resume-overlay"]');
        if (ov && (el === ov || ov.contains(el))) return 'overlay';
        return `${el.tagName}.${el.className || ''}`.slice(0, 80);
      })(),
    };
  });
  check('SECOND ESC closes the pause menu and the relock is REFUSED',
    stranded.showSettings === false && stranded.lockEl === false,
    JSON.stringify(stranded));

  // 4) THE BUG / THE FIX. Input is genuinely dead here — that is not the defect, the browser really has
  //    taken the mouse back. The defect was that NOTHING said so and nothing offered a way out.
  const frozen = await moveDistance(page);
  check('input is dead in this state (the freeze Kevin hit)', frozen !== null && frozen < 0.5, `dist=${frozen?.toFixed(2)}`);
  check('THE FIX: a resume overlay is on screen offering a way back', stranded.overlay === true, `overlay=${stranded.overlay}`);
  check('the overlay is the TOPMOST surface at screen centre (nothing paints through it)',
    stranded.topAtCentre === 'overlay', `top=${stranded.topAtCentre}`);
  await page.screenshot({ path: `${OUT}/3-stranded-with-overlay.png` });

  // 5) RECOVERY — restore the real API (a fresh click IS accepted by a real browser) and click the overlay.
  await page.evaluate(() => { HTMLCanvasElement.prototype.requestPointerLock = window.__realRPL; });
  const btn = await page.$('[data-testid="resume-button"]');
  check('the overlay offers a labelled resume control', !!btn);
  if (btn) await btn.click();
  await delay(800);
  const relocked = await page.evaluate(() => !!document.pointerLockElement);
  check('clicking RESUME restores pointer lock', relocked, `locked=${relocked}`);

  const recovered = await moveDistance(page);
  check('the player can move again after resuming', recovered !== null && recovered > 0.5, `dist=${recovered?.toFixed(2)}`);
  await page.screenshot({ path: `${OUT}/4-recovered.png` });

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`\nPAUSE/RESUME CHECKS FAILED (${failed.length}) — screenshots in ${OUT}`);
    await shutdown(browser);
    process.exit(1);
  }
  console.log(`\nall ${results.length} pause/resume checks passed — screenshots in ${OUT}`);
  await shutdown(browser);
  process.exit(0);
} catch (e) {
  console.error('PAUSE-RESUME-PROBE ERROR:', e);
  await shutdown(browser);
  process.exit(1);
}
