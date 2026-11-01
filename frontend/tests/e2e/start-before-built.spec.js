import { test, expect } from './_fixtures.js';
import { bootDev } from './_boot.js';
import { execSync } from 'node:child_process';

// A START CLICKED BEFORE THE WORLD IS BUILT KEEPS THE BROWSER'S MEMORY BOUNDED UNDER THE POINTER-LOCK FLOOD (registry
// REVIEW:l10:music-e2e-title-hang; DECISIONS 2026-10-31 items 370-376).
//
// What it guards. The title's Start, clicked before the spawn chunk is built, enters play under App's loading screen.
// Under the browser's own pointer lock, Chrome's headless shell on Linux streams raw pointer updates with no input at all
// (the page counted up to 9,400 a second on CI), and the page has to drain them. While the loading screen was a translucent
// (bg-black/90), backdrop-blurred layer with a spinning ring and a pulsing line over the live canvas, it could not: the
// page stopped answering, and the renderer and the browser process grew together, 10 to 44 MB/s each, to the runner's
// 16 GB, which is how CI runs 41203933423 and 41208277637 died with no message. With nothing covering the canvas the same
// flood was drained (runs 41247342006, 41248629909, 41250492755), so the screen is now a still caption at its foot.
//
// How it measures. Every input the subject reads is set here, not inherited (gate-authoring class 12):
//  - the lock is the browser's, granted on a trusted gesture only (L10's probe form), and the click is a trusted mouse
//    click at the Start button's box with no actionability wait, as a player's click lands;
//  - the world stays unbuilt for HOLD_MS after the lock: the terrain worker's chunk meshes are held back from the page's
//    start until then and delivered in order, so play is entered and stays with the world unbuilt on any machine (on
//    CI the build otherwise outran or trailed the click by chance);
//  - the flood is counted (pointerrawupdate) and must be there: a browser that streams none, or grants no lock, has
//    nothing for the page to drain, and the test reports itself INCONCLUSIVE (a printed skip), never green.
// Then, over WINDOW_MS from the lock: a bounded page read every 2 s, and the browser process's RSS from ps. It fails when
// the browser process grows more than BROWSER_GROWTH_MB (stopping the moment it does, so a runner is not run out of
// memory) or the page never answers. Read off CI with the hold: the screen as it was grew the browser 757 to 1,859 MB by
// 75 s (8 of 8) and kept growing, and the caption 88 to 545 MB (16 attempts, probes and this spec's own), most of them
// flat by then. A full-screen opaque, still screen sat inside the bound (186 to 659 MB, and its page fell behind in 2 of
// 6): this does not separate it, and it is not the shipped shape. The page's answers and whether the world built are
// printed, not judged: on CI's software renderer under the flood even the caption's page misses many 4 s reads, and in
// 1 of 12 of this spec's attempts it answered 1 of 8 for the whole window with the browser bounded.
//
// WHAT IT DOES NOT CHECK: a player's real mouse (a moving mouse streams input too, at its own rate; this measures the
// headless shell's flood); the production build (the e2e suite runs the dev server); a real GPU (a Mac with ANGLE Metal,
// production build, the browser's lock, Start before the world was built: no flood, no growth, 3 of 3, DECISIONS item
// 372); and the renderer's own growth, which in the drained probe runs still rose by 1 to 1.5 GB before it levelled
// off, and is held only by a 4 GB brake on all of the page's processes together (ALL_BRAKE_MB).

const HOLD_MS = 45000;
const WINDOW_MS = 90000;
const BROWSER_GROWTH_MB = 700;
// The brake on every Chromium process together: the drained runs' renderer rose 1 to 1.5 GB; a page that cannot drain
// grows the renderer too, and run 41253785118's E1 filled the runner's 16 GB before the browser alone passed the bound.
const ALL_BRAKE_MB = 4000;

function lockOnGestureOnly() {
  const real = HTMLCanvasElement.prototype.requestPointerLock;
  const GESTURES = new Set(['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'keydown', 'touchend']);
  HTMLCanvasElement.prototype.requestPointerLock = function gated(...args) {
    const ev = window.event;
    if (document.pointerLockElement === this || (ev && ev.isTrusted && GESTURES.has(ev.type))) return real.apply(this, args);
    setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0);
    return Promise.reject(new DOMException('pointer lock refused (e2e: no lock without a gesture)', 'NotAllowedError'));
  };
}

function holdTheWorld(holdMs) {
  const s = { raw: 0, lockedAt: null, held: [], heldMax: 0 };
  window.__sbb = s;
  addEventListener('pointerrawupdate', () => { s.raw += 1; }, { capture: true, passive: true });
  let until = Infinity;
  document.addEventListener('pointerlockchange', () => {
    if (until !== Infinity || !document.pointerLockElement) return;
    s.lockedAt = performance.now();
    until = s.lockedAt + holdMs;
    setTimeout(() => { for (const [fn, self, e] of s.held.splice(0)) fn.call(self, e); }, holdMs + 50);
  });
  const RealWorker = window.Worker;
  window.Worker = class HeldWorker extends RealWorker {
    addEventListener(type, fn, opts) {
      if (type !== 'message') return super.addEventListener(type, fn, opts);
      return super.addEventListener(type, (e) => {
        if (e.data && e.data.type === 'chunk_mesh' && performance.now() < until) { s.held.push([fn, this, e]); s.heldMax = Math.max(s.heldMax, s.held.length); return; }
        fn.call(this, e);
      }, opts);
    }
  };
}

const state = () => {
  const s = window.__sbb;
  const st = window.useGameStore.getState();
  return { raw: s.raw, lockedAt: s.lockedAt, heldMax: s.heldMax, lock: !!document.pointerLockElement,
    started: st.gameStarted, chunk: st.isSpawnChunkLoaded };
};

async function read(page, fn, ms) {
  let timer;
  const silent = new Promise((res) => { timer = setTimeout(() => res(null), ms); });
  try { return await Promise.race([page.evaluate(fn), silent]); } catch { return null; } finally { clearTimeout(timer); }
}

/** This test's Chromium processes below this worker, by RSS in MB: `browser` (the process with no --type) and `all`. */
function chromeMB() {
  const rows = execSync('ps -A -o pid=,ppid=,rss=,command=', { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n')
    .map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/)).filter(Boolean)
    .map((m) => ({ pid: +m[1], ppid: +m[2], rss: +m[3], cmd: m[4] }));
  const kids = new Map();
  for (const r of rows) { if (!kids.has(r.ppid)) kids.set(r.ppid, []); kids.get(r.ppid).push(r); }
  const found = [];
  const walk = (pid) => { for (const k of kids.get(pid) || []) { found.push(k); walk(k.pid); } };
  walk(process.pid);
  const chrome = found.filter((r) => /chrom|headless_shell/i.test(r.cmd));
  const browser = chrome.find((r) => !/--type=/.test(r.cmd));
  return { browser: browser ? Math.round(browser.rss / 1024) : null, all: Math.round(chrome.reduce((a, r) => a + r.rss, 0) / 1024) };
}

test('a Start clicked before the world is built: the browser stays bounded under the pointer-lock flood', async ({ page }) => {
  test.setTimeout(240000);
  await page.addInitScript(lockOnGestureOnly);
  await page.addInitScript(holdTheWorld, HOLD_MS);
  await bootDev(page);
  await page.waitForFunction(() => window.__craftyTest.list().includes('setQualityTier'), null, { timeout: 60000, polling: 250 });
  await page.evaluate(() => window.__craftyTest.call('setQualityTier', 'low')); // the suite's tier (tests/e2e/_boot.js)
  const start = page.getByTestId('title-start');
  await expect(start, 'SETUP: the title shows no Start').toBeVisible({ timeout: 60000 });
  const box = await start.boundingBox({ timeout: 30000 });
  expect(box, 'SETUP: the Start button has no box').not.toBeNull();
  const start0 = chromeMB();
  const before = start0.browser;
  expect(before, 'SETUP: ps found no browser process below this worker: the memory reading is blind').toBeGreaterThan(0);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const t0 = Date.now();

  // Nothing is judged before the window ends: the lock and its pointerlockchange arrive after the click asynchronously, and
  // on a page that is falling behind a read can land before either, so an early verdict on them is a race (a SETUP read
  // there scored the stalled page COULD NOT CHECK on the runner, run 41249479316).
  let reads = 0, answered = 0, silentRun = 0, longestSilence = 0, peak = before, allPeak = start0.all, last = null, lockSeen = false;
  while (Date.now() - t0 < WINDOW_MS) {
    const s = await read(page, state, 4000);
    reads += 1;
    if (s) {
      answered += 1; silentRun = 0; last = s; lockSeen ||= s.lock;
    } else { silentRun += 1; longestSilence = Math.max(longestSilence, silentRun); }
    const now = chromeMB();
    peak = Math.max(peak, now.browser ?? 0);
    allPeak = Math.max(allPeak, now.all);
    // Already over, or the page's processes together past the brake: stop before the runner runs out of memory.
    if (peak - before > BROWSER_GROWTH_MB || allPeak - start0.all > ALL_BRAKE_MB) break;
    await page.waitForTimeout(2000);
  }
  const line = `start-before-built: ${answered}/${reads} reads answered, longest silence ${longestSilence}, browser ${before} -> peak ${peak} MB, `
    + `all Chromium ${start0.all} -> ${allPeak} MB, `
    + `${last ? last.raw : '?'} raw pointer updates by the last answer, lock ${lockSeen ? 'held' : 'never seen'}, world ${last?.chunk ? 'built' : 'not built'}`;
  console.log(line); // the denominator, every run
  // A page that cannot drain keeps growing while Playwright waits to close it, and a runner that runs out of memory is shut
  // down with every log (L10's runs ended so): on any failure its renderer is crashed first, off its main thread, by CDP.
  const failing = async (verdicts) => {
    try { await verdicts(); } catch (e) {
      const cdp = await page.context().newCDPSession(page).catch(() => null);
      if (cdp) await Promise.race([cdp.send('Page.crash').catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
      throw e;
    }
  };
  // The bound first, so a stalled page fails, never skips: its last answer may predate the lock or the flood.
  await failing(async () => {
    expect(peak - before, `the browser process grew past ${BROWSER_GROWTH_MB} MB: the page did not drain the input it was sent: ${line}`).toBeLessThanOrEqual(BROWSER_GROWTH_MB);
    expect(allPeak - start0.all, `the page's processes grew past ${ALL_BRAKE_MB} MB together: ${line}`).toBeLessThanOrEqual(ALL_BRAKE_MB);
    expect(last, `the page never answered after the Start click: ${line}`).not.toBeNull();
  });
  test.skip(!lockSeen, `INCONCLUSIVE: this browser granted no pointer lock, so nothing streams the input the page must drain. ${line}`);
  // No flood: a page that answered nearly every read and counted under 100 (a Mac's browser lock streams none). A page that
  // counted under 100 while answering less fell behind before it could count; it is judged, not skipped.
  test.skip(last.raw < 100 && answered / reads >= 0.9, `INCONCLUSIVE: the browser streamed ${last.raw} raw pointer updates under the lock (CI's headless shell streams thousands a second); nothing to drain. ${line}`);
  await failing(async () => {
    expect(last.started, `SETUP: the click did not start the game: ${line}`).toBe(true);
    // Cumulative in the page, so an answer however late reads it: the hold saw the lock and held chunk meshes back, so play
    // was entered with the world unbuilt (before the lock nothing is delivered).
    expect(last.lockedAt !== null && last.heldMax > 0, `SETUP: the hold never held a chunk mesh behind the lock: ${line}`).toBe(true);
  });
});
