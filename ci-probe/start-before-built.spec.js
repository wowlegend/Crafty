import { test, expect } from './_fixtures.js';
import { bootDev } from './_boot.js';
import { execSync } from 'node:child_process';

// A START CLICKED BEFORE THE WORLD IS BUILT: THE PAGE KEEPS ANSWERING, THE BROWSER STAYS BOUNDED AND THE WORLD BUILDS,
// UNDER THE POINTER-LOCK FLOOD (registry REVIEW:l10:music-e2e-title-hang; DECISIONS 2026-10-31 items 370-378).
//
// What it guards. The title's Start, clicked before the spawn chunk is built, enters play under App's world-building
// caption. Under the browser's own pointer lock, Chrome's headless shell on Linux streams raw pointer updates with no input
// at all (the page counted up to 9,400 a second on CI), and the page has to drain them. While the loading screen was a
// translucent (bg-black/90), backdrop-blurred layer with a spinning ring and a pulsing line over the live canvas, it could
// not: the page stopped answering, and the renderer and the browser process grew together, 10 to 44 MB/s each, to the
// runner's 16 GB, which is how CI runs 41203933423 and 41208277637 died with no message. With nothing covering the canvas
// the same flood was drained (runs 41247342006, 41248629909, 41250492755), so the screen is a still caption at its foot.
//
// How it measures. Every input the subject reads is set here, not inherited (gate-authoring class 12):
//  - the lock is the browser's, granted on a trusted gesture only (L10's probe form), and the click is a trusted mouse
//    click at the Start button's box with no actionability wait, as a player's click lands;
//  - the world stays unbuilt for HOLD_MS after the lock: the terrain worker's chunk meshes are held back from the page's
//    start, and HOLD_MS after the lock every held mesh is delivered in the order it came, before any later one, so play is
//    entered and stays with the world unbuilt on any machine (on CI the build otherwise outran or trailed the click);
//  - the flood is counted and must be there: each trusted pointermove adds the raw updates coalesced into it. The game
//    already listens for pointermove (R3F's canvas events), so the count adds no kind of listener the shipped page lacks
//    (a pointerrawupdate listener did: Chromium dispatches those only to a page that listens). A browser that grants no
//    lock, or streams no flood, leaves the page nothing to drain: INCONCLUSIVE, a printed skip on a workstation and a
//    FAILURE on CI (process.env.CI), so the gate cannot go dark there if CI's Chromium stops flooding.
// Then, from the click, a sample every 2 s, each one printed: a bounded page read (4 s) and the RSS of the browser process
// and of every Chromium process below this worker, from ps. It fails on any of five arms, all printed with their numbers:
//  - bound: the browser process grows more than BROWSER_GROWTH_MB over its value at the click;
//  - brake: all of them together grow more than ALL_BRAKE_MB (the drained runs' renderer rose 1 to 1.5 GB);
//  - answers: more than MAX_MISSED_READS bounded reads in a row go unanswered (the page stopped answering for a sustained
//    span, about 30 s; the old screen's stalled page answered 1 of 7 to 9);
//  - late: the browser process grows more than LATE_GROWTH_MB over the last LATE_SPAN_MS of the window, so a slow leak that
//    stays under the bound still fails;
//  - world: the spawn chunk is not built BUILD_BY_MS after the click.
// The bound and the brake stop the sampling the moment either is passed, and on any failure the renderer is crashed first
// through CDP, so a runner is not run out of memory with its log. Thresholds and the runs they were read from: DECISIONS
// 2026-10-31 item 378.
//
// WHAT IT DOES NOT CHECK: a player's real mouse (a moving mouse streams input too, at its own rate; this measures the
// headless shell's flood); the production build (the e2e suite runs the dev server); a real GPU (a Mac with ANGLE Metal,
// production build, the browser's lock, Start before the world was built: no flood, no growth, 3 of 3, DECISIONS item
// 372); and the renderer's and GPU process's own growth, held only by the brake on all of them together.

const HOLD_MS = 45000;
const WINDOW_MS = 90000;
const BUILD_BY_MS = 135000;
const READ_MS = 4000;
const SAMPLE_GAP_MS = 2000;
const BROWSER_GROWTH_MB = 600;
const ALL_BRAKE_MB = 4000;
const MAX_MISSED_READS = 4;
const LATE_SPAN_MS = 30000;
const LATE_GROWTH_MB = 100;
const FLOOD_MIN = 100;

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
  const s = { moves: 0, lockedAt: null, held: [], heldMax: 0, released: false };
  window.__sbb = s;
  addEventListener('pointermove', (e) => {
    if (e.isTrusted) s.moves += Math.max(1, typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents().length : 1);
  }, { capture: true, passive: true });
  document.addEventListener('pointerlockchange', () => {
    if (s.lockedAt !== null || !document.pointerLockElement) return;
    s.lockedAt = performance.now();
    // Released before the flush: messages are dispatched one task at a time, so none can arrive between the two lines and
    // every held mesh reaches the page in its order, ahead of any later one.
    setTimeout(() => { s.released = true; for (const [fn, self, e] of s.held.splice(0)) fn.call(self, e); }, holdMs);
  });
  const RealWorker = window.Worker;
  window.Worker = class HeldWorker extends RealWorker {
    addEventListener(type, fn, opts) {
      if (type !== 'message') return super.addEventListener(type, fn, opts);
      return super.addEventListener(type, (e) => {
        if (!s.released && e.data && e.data.type === 'chunk_mesh') { s.held.push([fn, this, e]); s.heldMax = Math.max(s.heldMax, s.held.length); return; }
        fn.call(this, e);
      }, opts);
    }
  };
}

const state = () => {
  const s = window.__sbb;
  const st = window.useGameStore.getState();
  return { moves: s.moves, lockedAt: s.lockedAt, heldMax: s.heldMax, lock: !!document.pointerLockElement,
    started: st.gameStarted, built: st.isSpawnChunkLoaded };
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

/** The browser process's growth over the window's last LATE_SPAN_MS: the highest sample there less the first one. */
function lateGrowth(samples, windowMs = WINDOW_MS, spanMs = LATE_SPAN_MS) {
  const late = samples.filter((x) => x.t >= windowMs - spanMs && x.t <= windowMs && x.browser != null);
  if (late.length < 2) return null;
  return Math.max(...late.map((x) => x.browser)) - late[0].browser;
}

test('a Start clicked before the world is built: the page keeps answering, the browser stays bounded and the world builds under the pointer-lock flood', async ({ page }) => {
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

  // Nothing is judged before the sampling ends: the lock and its pointerlockchange arrive after the click asynchronously,
  // and on a page that is falling behind a read can land before either, so an early verdict on them is a race (a SETUP
  // read there scored the stalled page COULD NOT CHECK on the runner, run 41249479316). It samples for the window, and on
  // past it only while the world is not built, up to BUILD_BY_MS.
  const samples = [];
  let reads = 0, answered = 0, missedRun = 0, longestMissed = 0, peak = before, allPeak = start0.all, last = null;
  let lockSeen = false, builtAt = null, stopped = null;
  for (;;) {
    const t = Date.now() - t0;
    if (t >= BUILD_BY_MS || (t >= WINDOW_MS && builtAt !== null)) break;
    const s = await read(page, state, READ_MS);
    reads += 1;
    const at = Date.now() - t0;
    if (s) {
      answered += 1; missedRun = 0; last = s; lockSeen ||= s.lock;
      if (s.built && builtAt === null) builtAt = at;
    } else { missedRun += 1; longestMissed = Math.max(longestMissed, missedRun); }
    const now = chromeMB();
    samples.push({ t: at, answered: !!s, browser: now.browser, all: now.all });
    peak = Math.max(peak, now.browser ?? 0);
    allPeak = Math.max(allPeak, now.all);
    console.log(`start-before-built sample ${(at / 1000).toFixed(1)} s: ${s ? 'answered' : 'missed'}, browser ${now.browser} MB `
      + `(${now.browser == null ? '?' : `+${now.browser - before}`}), all Chromium ${now.all} MB (+${now.all - start0.all})`
      + (s ? `, ${s.moves} pointer updates, lock ${s.lock ? 'held' : 'off'}, world ${s.built ? 'built' : 'not built'}` : ''));
    if (peak - before > BROWSER_GROWTH_MB) { stopped = 'bound'; break; }
    if (allPeak - start0.all > ALL_BRAKE_MB) { stopped = 'brake'; break; }
    await page.waitForTimeout(SAMPLE_GAP_MS);
  }
  const late = lateGrowth(samples);
  const arms = {
    bound: [peak - before <= BROWSER_GROWTH_MB, `browser +${peak - before} MB (at most ${BROWSER_GROWTH_MB})`],
    brake: [allPeak - start0.all <= ALL_BRAKE_MB, `all Chromium +${allPeak - start0.all} MB (at most ${ALL_BRAKE_MB})`],
    answers: [longestMissed <= MAX_MISSED_READS, `${answered}/${reads} reads answered, longest run missed ${longestMissed} (at most ${MAX_MISSED_READS})`],
    late: [stopped !== null || (late !== null && late <= LATE_GROWTH_MB),
      late === null ? `not reached (sampling ${stopped ? `stopped by the ${stopped}` : 'ended first'})` : `browser +${late} MB over the last ${LATE_SPAN_MS / 1000} s (at most ${LATE_GROWTH_MB})`],
    world: [builtAt !== null, builtAt === null ? `not built ${Math.round((Date.now() - t0) / 1000)} s after the click (by ${BUILD_BY_MS / 1000} s)` : `built ${Math.round(builtAt / 1000)} s after the click`],
  };
  const line = `start-before-built: ${Object.entries(arms).map(([k, [ok, why]]) => `${k} ${ok ? 'ok' : 'FAIL'} (${why})`).join('; ')}; `
    + `${last ? last.moves : '?'} pointer updates by the last answer, lock ${lockSeen ? 'held' : 'never seen'}`;
  console.log(line); // the denominator and every arm, every run
  const failing = (names) => names.filter((k) => !arms[k][0]).map((k) => `${k}: ${arms[k][1]}`);
  // A page that cannot drain keeps growing while Playwright waits to close it, and a runner that runs out of memory is shut
  // down with every log (L10's runs ended so): on any failure its renderer is crashed first, off its main thread, by CDP.
  const fail = async (message) => {
    const cdp = await page.context().newCDPSession(page).catch(() => null);
    if (cdp) await Promise.race([cdp.send('Page.crash').catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
    expect(false, message).toBe(true);
  };
  // The page's own arms first, so a stalled page fails, never skips: its last answer may predate the lock or the flood.
  const own = failing(['bound', 'brake', 'answers', 'late']);
  if (own.length) await fail(`the page did not drain the input it was sent: ${own.join('; ')}. ${line}`);
  const noFlood = !lockSeen ? 'this browser granted no pointer lock, so nothing streams the input the page must drain'
    : last.moves < FLOOD_MIN && answered / reads >= 0.9
      ? `the browser streamed ${last.moves} pointer updates under the lock (CI's headless shell streams thousands a second); nothing to drain` : null;
  if (noFlood) {
    // On CI the flood is the subject's input; a run without it measured nothing, and a skip there would keep `ci ok` green
    // for as long as CI's Chromium stopped flooding.
    expect(!process.env.CI, `INCONCLUSIVE on CI, which fails here so this gate cannot go dark: ${noFlood}. ${line}`).toBe(true);
    test.skip(true, `INCONCLUSIVE: ${noFlood}. ${line}`);
  }
  expect(last.started, `SETUP: the click did not start the game: ${line}`).toBe(true);
  // Cumulative in the page, so an answer however late reads it: the hold saw the lock and held chunk meshes back, so play
  // was entered with the world unbuilt (before the lock nothing is delivered).
  expect(last.lockedAt !== null && last.heldMax > 0, `SETUP: the hold never held a chunk mesh behind the lock: ${line}`).toBe(true);
  const world = failing(['world']);
  if (world.length) await fail(`the world did not build after the hold: ${world.join('; ')}. ${line}`);
});
