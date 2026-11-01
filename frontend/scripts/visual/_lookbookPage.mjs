// _lookbookPage.mjs — the browser half the lookbook (lookbook.mjs) and the media pipeline (media.mjs) share: launching a
// Chromium that gives the game a hardware renderer, entering play and reading the production seam
// (src/render/lookbookSeam.js). One way to do each, so the media frames come from the same capture path as the lookbook
// frames. Each takes the Playwright page it acts on; nothing here launches or keeps a browser of its own, so the caller
// owns the lifecycle (_serve.mjs shutdown). Leading underscore: a helper, not a probe; it binds no port.
import { devices } from '@playwright/test';
import { CHROMIUM_CANDIDATES, LOOKBOOK_PLACES, CHROME_VARS, classifyRenderer, pickCandidate, handCount } from './_lookbook.mjs';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** The GL renderer string of a fresh WebGL context on this page. */
export const freshRenderer = (page) => page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return 'no webgl2';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});

/**
 * Try every Chromium candidate; record each renderer; pick the first hardware one. `launch(engine, opts)` and
 * `close(browser)` are the caller's, so its signal handlers can reach a browser this opens.
 */
export async function resolveChromium({ launch, close }) {
  const results = [];
  for (const cand of CHROMIUM_CANDIDATES) {
    let b = null;
    try {
      b = await launch('chromium', cand.launch);
      const page = await b.newPage();
      await page.goto('about:blank');
      const renderer = await freshRenderer(page);
      results.push({ id: cand.id, renderer, gpu: classifyRenderer(renderer) });
    } catch (e) {
      results.push({ id: cand.id, error: String(e.message || e).split('\n')[0] });
    } finally {
      await close(b);
    }
  }
  const chosen = pickCandidate(results);
  return { results, chosen: chosen ? CHROMIUM_CANDIDATES.find((c) => c.id === chosen.id) : null };
}

export function contextOptions(target) {
  const o = { viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor };
  if (target.touch) Object.assign(o, { isMobile: true, hasTouch: true, userAgent: devices['iPad Pro 11'].userAgent });
  return o;
}

/** Before any page script: skip the first-session toasts; for a returning player (the default) mark the controls panel
 *  opened, so the first-run controls card and its hint stay away, and for a first-session player (`firstSession`)
 *  clear both controls flags; on touch, remove Pointer Lock as iOS has none. */
export function initScript({ touch = false, firstSession = false } = {}) {
  try { localStorage.setItem('crafty_onboarded', '1'); } catch { /* storage blocked: toasts may show */ }
  try {
    if (firstSession) {
      localStorage.removeItem('crafty_controls_seen');
      localStorage.removeItem('crafty_controls_card_done');
    } else {
      localStorage.setItem('crafty_controls_seen', '1');
    }
  } catch { /* storage blocked: the controls card shows */ }
  if (touch) {
    delete Element.prototype.requestPointerLock;
    delete HTMLElement.prototype.requestPointerLock;
    delete Document.prototype.exitPointerLock;
    delete Document.prototype.pointerLockElement;
  }
}

export const info = (page) => page.evaluate(() => window.__craftyLookbook.info());
export const setCycle = (page, c) => page.evaluate((x) => window.__craftyLookbook.setCycle(x), c);
// Hostiles within this radius are removed before each eye shot and clip, so the frame is the world and not a mob at
// arm's length; farther ones stay in view. Each record says how many went.
const CLEAR_RADIUS_M = 12;
export const clearHostiles = (page, radius = CLEAR_RADIUS_M) => page.evaluate((r) => window.__craftyLookbook.clearHostiles({ radius: r }), radius);
export const play = (page) => page.evaluate(() => window.__craftyLookbook.play());
/** The vitals stack is on screen: the HUD a player sees, not merely mounted. */
export const hudOn = (page) => page.evaluate(() => {
  const r = document.querySelector('[data-testid="stat-stack"]')?.getBoundingClientRect();
  return !!(r && r.width > 0 && r.height > 0);
});

/** The page's chrome surface variables (_lookbook.mjs CHROME_VARS) as its root style holds them now. */
export const chromeVars = (page) => page.evaluate((names) => {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n)]));
}, CHROME_VARS);

/**
 * Hold the page still for the chrome footprint's shots (_lookbook.mjs chromeFootprint): the page's own
 * requestAnimationFrame is replaced by one that queues its callbacks, so the game canvas (R3F's loop and the frame cap
 * draw only from animation frames), the physics step and the HUD ticker stop and the canvas shows one rendered frame
 * until releaseFrames. The callbacks already registered run once and land in the queue; two native frames are waited so
 * they have. Screenshots do not need the page's animation frames (Playwright prepares a shot in its own world).
 */
export async function holdFrames(page) {
  await page.evaluate(() => {
    if (window.__lookbookHeld) return;
    const native = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const queue = new Map();
    let next = 0;
    window.__lookbookHeld = { native, nativeCancel, queue };
    window.requestAnimationFrame = (cb) => { next -= 1; queue.set(next, cb); return next; };
    window.cancelAnimationFrame = (id) => { if (id < 0) queue.delete(id); else nativeCancel(id); };
  });
  await nativeFrames(page);
}

/** Hand the page its animation frames back and run what was queued while it was held. */
export async function releaseFrames(page) {
  await page.evaluate(() => {
    const held = window.__lookbookHeld;
    if (!held) return;
    window.requestAnimationFrame = held.native;
    window.cancelAnimationFrame = held.nativeCancel;
    delete window.__lookbookHeld;
    for (const cb of held.queue.values()) held.native(cb);
  });
}

/** Two of the browser's own animation frames, whether or not the page's are held. */
const nativeFrames = (page) => page.evaluate(() => new Promise((r) => {
  const raf = window.__lookbookHeld?.native || window.requestAnimationFrame.bind(window);
  raf(() => raf(r));
}));

/** The touch layer's root (ui/TouchControls.jsx): marked in this lane's builds, else the parent of its pause button. */
const TOUCH_ROOT = '[data-touch-layer]';

/**
 * A twin of the current view for the chrome footprint, shot and then undone: `keep: 'touch'` hides the HUD's own
 * elements and shows the game canvas (the largest) and the touch layer; `keep: 'world'` shows the canvas alone. A touch
 * element hidden before the twin stays hidden in it. Returns the PNG and whether a touch layer was there to keep.
 */
export async function twinShot(page, keep) {
  const touch = await page.evaluate(({ keepTouch, touchSel }) => {
    const c = [...document.querySelectorAll('canvas')].sort((x, y) => y.width * y.height - x.width * x.height)[0];
    c?.setAttribute('data-lookbook-keep', '');
    const root = keepTouch
      ? (document.querySelector(touchSel) || document.querySelector('[data-testid="touch-pause"]')?.parentElement || null) : null;
    if (root) {
      root.setAttribute('data-lookbook-keep', '');
      for (const el of root.querySelectorAll('*')) if (getComputedStyle(el).visibility === 'hidden') el.setAttribute('data-lookbook-was-hidden', '');
    }
    const s = document.createElement('style');
    s.id = 'lookbook-twin';
    s.textContent = 'body * { visibility: hidden !important; } [data-lookbook-keep], [data-lookbook-keep] * { visibility: visible !important; }'
      + ' [data-lookbook-keep] [data-lookbook-was-hidden] { visibility: hidden !important; }';
    document.head.appendChild(s);
    return !!root;
  }, { keepTouch: keep === 'touch', touchSel: TOUCH_ROOT });
  try {
    await nativeFrames(page);
    return { png: await page.screenshot(), touch };
  } finally {
    await page.evaluate(() => {
      document.getElementById('lookbook-twin')?.remove();
      for (const el of document.querySelectorAll('[data-lookbook-keep], [data-lookbook-was-hidden]')) {
        el.removeAttribute('data-lookbook-keep');
        el.removeAttribute('data-lookbook-was-hidden');
      }
    });
    await nativeFrames(page);
  }
}

/** Respawn a dead player through the store; true when it did. */
export async function respawnIfDead(page, report) {
  if ((await info(page)).isAlive) return false;
  await page.evaluate(() => window.useGameStore?.getState?.().respawn?.());
  report.respawns += 1;
  await delay(1500);
  return true;
}

/** Where the body rests: two reads 500 ms apart within 5 cm (not falling, not respawning), or null after ~20 s. */
export async function restingBody(page) {
  let prev = null;
  for (let i = 0; i < 40; i++) {
    const b = (await info(page)).body;
    if (b && prev && Math.hypot(b[0] - prev[0], b[1] - prev[1], b[2] - prev[2]) < 0.05) return b;
    prev = b;
    await delay(500);
  }
  return null;
}

/**
 * The hands' node count (_lookbook.mjs handCount) with the hands hidden (posed) and back (cleared), measured in this
 * page: the eye verdict's baseline, because an older build hangs the hands on the camera beside its other children
 * (the audio listener), and the hands' own count varies by item.
 */
export async function handsBaseline(page) {
  const free = handCount(await info(page));
  const at = LOOKBOOK_PLACES[0];
  await page.evaluate((p) => window.__craftyLookbook.pose(p), { position: at.position, lookAt: at.lookAt });
  await delay(800);
  const hidden = handCount(await info(page));
  await page.evaluate(() => window.__craftyLookbook.clear());
  await delay(1200);
  const back = handCount(await info(page));
  return { free, hidden, back };
}

/** Hold the input gate live through the seam: two consecutive live reads 250 ms apart (tests/e2e/_boot.js). */
export async function holdActive(page) {
  let held = 0, plays = 0;
  for (let i = 0; i < 40 && held < 2; i++) {
    const live = await page.evaluate(() => window.__craftyLookbook.info().active === true);
    if (live) held += 1;
    else { held = 0; plays += 1; await page.evaluate(() => window.__craftyLookbook.play()); }
    await delay(250);
  }
  return { held: held >= 2, plays };
}
