#!/usr/bin/env node
/**
 * lookbook.mjs — the PRODUCTION bundle on a REAL GPU with MOTION ON, at fixed places and times of day, in Chromium and
 * in WebKit at both iPad viewports. The acceptance surface for every looks move in the masterpiece programme
 * (docs/superpowers/plans/2026-10-27-crafty-masterpiece.md, "How a move counts as done" #2; plan
 * docs/superpowers/plans/2026-10-27-crafty-instruments.md).
 *
 * WHY NOT THE CAPTURE FRAMES. The 31 capture baselines are the REGRESSION oracle and stay so, but they cannot judge
 * looks: SwiftShader, the DEV server, and capture mode turns off weather, mobs, NPCs, particles and spawning and pins
 * the sun at noon. This shoots the build Vercel ships, with all of that running.
 *
 * WHAT IT DOES. Serves build/ with `vite preview` (scripts/visual/_serve.mjs, port allocated there). For Chromium it
 * first TRIES each launch candidate (_lookbook.mjs CHROMIUM_CANDIDATES) on about:blank and records every renderer
 * string, then uses the first whose renderer is hardware — never assumed: on a Mac the goal is ANGLE-on-Metal, and a
 * SwiftShader frame is refused as a real-GPU frame (exit 3) unless --allow-software. (Measured once, 2026-10-27, on an
 * M3 Max under macOS 27.0.1 with Playwright 1.64.1: new headless and new headless + --use-angle=metal both gave
 * "ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max ...)"; the headless shell gave SwiftShader. Re-read
 * lookbook.json `chromiumCandidates` rather than trusting this line on another machine.) Per target it opens
 * `/?lookbook=1` (the production seam, src/render/lookbookSeam.js), shoots the title, enters play (a real tap on Start
 * Adventure on the touch targets; the seam's play() on desktop, where headless Chromium refuses pointer lock), and for
 * each of four places pins the camera and shoots the programme's four times of day. The clock keeps running, so it
 * sets the time, lets the sky settle, sets it again and shoots, and records where the clock actually was.
 *
 * WHAT IT WRITES into --out: <target>/<place>-<cycle>.png and <target>/title.png, lookbook.json (per shot: requested
 * and actual cycle, input live, alive, tier, dpr in force, canvas size, GL renderer, console errors during the shot,
 * and a validity verdict naming what is wrong), and index.html, the contact sheet.
 *
 * An INSTRUMENT, not a gate: it judges no look. Exit 0 = every target measured · 3 = COULD NOT MEASURE (named).
 * Invalid shots (input not live, player dead, clock drifted) are recorded and flagged, not hidden and not fatal.
 *
 * BLIND SPOTS. macOS WebKit is not iPadOS (same engine and ANGLE-Metal path, not the same GPU, memory ceiling or
 * thermals): a defect seen here is real in WebKit; a clean frame does not clear the iPad. The camera is PINNED above
 * the scene (hero shots), not the player's eye. A pose does not pause the world (physics, mobs, weather, particles and
 * the clock run) but it does stop the Player's controller (movement and the KCC, the death branch, the void guard, the
 * beast / voidhand / imbue ticks), and PositionTracker publishes the posed CAMERA as store.playerPosition: mobs, allies
 * and chunk streaming see the camera, not the body (src/render/lookbookSeam.js). So mobs aim at the camera, a night
 * shot can kill the player: the shot is marked invalid and the store's own respawn() runs before the next. First-session onboarding toasts are
 * suppressed (crafty_onboarded) so they do not cover the frames.
 *
 * --hold <seconds> is the power scenario (scripts/dev/power-ab.sh): one Chromium page at 1280x800, entered into play
 * at spawn by clicking Start Adventure (plus the seam's play() where the build has the seam), held for N seconds; it
 * prints "LOOKBOOK HOLD READY" when play is entered and writes hold.json (tier timeline). --headed shows the window.
 *
 * Needs a production build: `npm run build` first.
 * Usage:  node scripts/visual/lookbook.mjs [--out <dir>] [--targets chromium-1280x800,webkit-1180x820,webkit-820x1180]
 *                                          [--allow-software]
 *         node scripts/visual/lookbook.mjs --hold <seconds> [--headed] [--out <dir>]
 *         either form takes [--build-dir <dir>] to serve a production build kept outside build/.
 */
import { chromium, webkit, devices } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { serveVite, probePort } from './_serve.mjs';
import {
  TARGETS, CHROMIUM_CANDIDATES, LOOKBOOK_PLACES, shotPlan, classifyRenderer, pickCandidate, shotVerdict, contactSheetHtml,
} from './_lookbook.mjs';

const PORT = probePort(import.meta.url);
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const flag = (k) => process.argv.includes(k);
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = resolve(arg('--out', `/tmp/crafty-lookbook-${STAMP}`));
const HOLD_S = Number(arg('--hold', 0));
const HEADED = flag('--headed');
const ALLOW_SOFTWARE = flag('--allow-software');
const WANT = arg('--targets', TARGETS.map((t) => t.id).join(',')).split(',');
// --build-dir: serve a production build kept outside build/ (the power A/B's other arm). Default: this app's build/.
const BUILD_DIR = resolve(arg('--build-dir', 'build'));
const LAUNCHERS = { chromium, webkit };

const TITLE_WAIT_MS = 8000; // the title diorama mounts lazily; ipad-probe waits the same
const WORLD_TIMEOUT_MS = 180000;
const WARMUP_MS = 5000; // shaders compile and the tier governor takes its first samples
const STREAM_MS = 6000; // chunks stream in around a newly posed camera (PositionTracker mirrors the camera)
const SETTLE_MS = 3000; // sky, fog and grade settle at a new time of day
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(join(BUILD_DIR, 'index.html'))) {
  console.error(`lookbook: COULD NOT MEASURE — no production build at ${join(BUILD_DIR, 'index.html')}. Run \`npm run build\` first.`);
  process.exit(3);
}
for (const id of WANT) {
  if (!TARGETS.some((t) => t.id === id)) {
    console.error(`lookbook: COULD NOT MEASURE — unknown target "${id}" (known: ${TARGETS.map((t) => t.id).join(', ')})`);
    process.exit(3);
  }
}
mkdirSync(OUT, { recursive: true });

const { url, waitReady, shutdown } = serveVite(PORT, { preview: true, outDir: BUILD_DIR });

// Anything we launch, we kill — on a throw (finally), and on Ctrl-C or power-ab.sh's TERM (these handlers).
let liveBrowser = null;
let stopping = false;
async function stopAll(code) {
  if (stopping) return;
  stopping = true;
  await liveBrowser?.close().catch(() => {});
  await shutdown(null);
  process.exit(code);
}
process.on('SIGINT', () => { console.error('lookbook: SIGINT — closing the browser and vite'); stopAll(130); });
process.on('SIGTERM', () => { console.error('lookbook: SIGTERM — closing the browser and vite'); stopAll(143); });

async function launch(engine, opts) {
  const b = await LAUNCHERS[engine].launch(opts);
  liveBrowser = b;
  return b;
}
async function close(b) {
  await b?.close().catch(() => {});
  if (liveBrowser === b) liveBrowser = null;
}

/** The GL renderer string of a fresh WebGL context on this page. */
const freshRenderer = (page) => page.evaluate(() => {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return 'no webgl2';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
});

/** Try every Chromium candidate; record each renderer; pick the first hardware one. */
async function resolveChromium() {
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

function contextOptions(target) {
  const o = { viewport: target.viewport, deviceScaleFactor: target.deviceScaleFactor };
  if (target.touch) Object.assign(o, { isMobile: true, hasTouch: true, userAgent: devices['iPad Pro 11'].userAgent });
  return o;
}

/** Before any page script: skip the first-session toasts; on touch, remove Pointer Lock as iOS has none. */
function initScript(touch) {
  try { localStorage.setItem('crafty_onboarded', '1'); } catch { /* storage blocked: toasts may show */ }
  if (touch) {
    delete Element.prototype.requestPointerLock;
    delete HTMLElement.prototype.requestPointerLock;
    try { Object.defineProperty(document, 'pointerLockElement', { get: () => null }); } catch { /* read-only */ }
    document.exitPointerLock = () => {};
  }
}

const info = (page) => page.evaluate(() => window.__craftyLookbook.info());

/** Hold the input gate live through the seam: two consecutive live reads 250 ms apart (tests/e2e/_boot.js). */
async function holdActive(page) {
  let held = 0, plays = 0;
  for (let i = 0; i < 40 && held < 2; i++) {
    const live = await page.evaluate(() => window.__craftyLookbook.info().active === true);
    if (live) held += 1;
    else { held = 0; plays += 1; await page.evaluate(() => window.__craftyLookbook.play()); }
    await delay(250);
  }
  return { held: held >= 2, plays };
}

async function shootTarget(target, launchOpts, launchId) {
  const report = { id: target.id, engine: target.engine, launch: launchId, renderer: null, gpu: 'unknown', entry: null,
    shots: [], notes: [], respawns: 0, console: {}, pageErrors: [] };
  const dir = join(OUT, target.id);
  mkdirSync(dir, { recursive: true });
  const b = await launch(target.engine, launchOpts);
  try {
    const page = await (await b.newContext(contextOptions(target))).newPage();
    const log = [];
    page.on('console', (m) => {
      if (m.type() !== 'error' && m.type() !== 'warning') return;
      const text = m.text().slice(0, 200);
      log.push({ t: Date.now(), type: m.type(), text });
      const key = `${m.type()}: ${text.slice(0, 120)}`;
      report.console[key] = (report.console[key] || 0) + 1;
    });
    page.on('pageerror', (e) => {
      const text = String(e.message).slice(0, 200);
      log.push({ t: Date.now(), type: 'pageerror', text });
      report.pageErrors.push(text);
    });
    await page.addInitScript(initScript, target.touch);
    await page.goto(`${url}/?lookbook=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const hasSeam = await page.waitForFunction(() => !!window.__craftyLookbook, null, { timeout: 30000 }).then(() => true, () => false);
    if (!hasSeam) {
      report.notes.push('COULD NOT MEASURE: this build has no lookbook seam (window.__craftyLookbook) — build from a commit with src/render/lookbookSeam.js');
      return report;
    }
    await delay(TITLE_WAIT_MS);
    await page.screenshot({ path: join(dir, 'title.png') });

    // Enter play the way this target's player does, where the harness allows it.
    if (target.touch) {
      const start = page.getByRole('button', { name: /Start Adventure/i });
      if ((await start.count()) > 0) { await start.first().tap(); report.entry = 'tap on Start Adventure'; }
      else report.notes.push('no Start Adventure button on the title; entered by the seam');
    }
    const built = await page.waitForFunction(() => window.__craftyLookbook.info().worldBuilt, null, { timeout: WORLD_TIMEOUT_MS, polling: 1000 })
      .then(() => true, () => false);
    if (!built) {
      await page.screenshot({ path: join(dir, 'world-timeout.png') });
      report.notes.push(`COULD NOT MEASURE: the world never built within ${WORLD_TIMEOUT_MS / 1000} s (isSpawnChunkLoaded)`);
      return report;
    }
    const hold = await holdActive(page);
    report.entry = [report.entry, hold.plays > 0 ? `seam play() x${hold.plays}` : null].filter(Boolean).join(' + ') || 'already live';
    if (!hold.held) {
      report.notes.push('COULD NOT MEASURE: the input gate never held live — every frame would show an overlay');
      return report;
    }
    await delay(WARMUP_MS);

    for (const place of LOOKBOOK_PLACES) {
      await page.evaluate((p) => window.__craftyLookbook.pose(p), { position: place.position, lookAt: place.lookAt });
      await delay(STREAM_MS);
      for (const shot of shotPlan([place])) {
        const t0 = Date.now(); // console errors from here to the screenshot belong to this shot
        const pre = await info(page);
        if (!pre.isAlive) {
          await page.evaluate(() => window.useGameStore?.getState?.().respawn?.());
          report.respawns += 1;
          await delay(1500);
        }
        await page.evaluate((c) => window.__craftyLookbook.setCycle(c), shot.cycle);
        await delay(SETTLE_MS);
        await page.evaluate(() => window.__craftyLookbook.play());
        await page.evaluate((c) => window.__craftyLookbook.setCycle(c), shot.cycle);
        await delay(400);
        const before = await info(page);
        await page.screenshot({ path: join(dir, shot.file) });
        const after = await info(page);
        const errs = log.filter((e) => e.t >= t0 && e.type !== 'warning');
        const v = shotVerdict({ cycle: shot.cycle, before, after });
        report.shots.push({
          ...shot, valid: v.valid, why: v.why, cycleAtShot: after.cycle, active: after.active, isAlive: after.isAlive,
          health: after.health, tier: after.tier, frameCap: after.frameCap, dpr: after.gl?.dpr ?? null,
          canvas: after.gl?.canvas ?? null, renderer: after.gl?.renderer ?? null, contextLosses: after.contextLosses,
          consoleErrors: errs.length, consoleSample: [...new Set(errs.map((e) => e.text))].slice(0, 5),
        });
        if (report.renderer === null && after.gl?.renderer) report.renderer = after.gl.renderer;
      }
    }
    await page.evaluate(() => window.__craftyLookbook.clear());
    report.gpu = classifyRenderer(report.renderer);
    if (/^apple gpu$/i.test(String(report.renderer).trim())) {
      report.notes.push('WebKit MASKS its renderer as "Apple GPU": hardware is inferred from WebKit\'s ANGLE-Metal path on macOS, not proven by this string');
    }
    return report;
  } finally {
    await close(b);
  }
}

/** The power scenario: one Chromium page entered into play at spawn and held. Works on builds without the seam. */
async function hold(launchOpts, launchId) {
  const out = { launch: launchId, headed: HEADED, seam: false, renderer: null, entry: null, timeline: [], notes: [] };
  const b = await launch('chromium', launchOpts);
  try {
    const page = await (await b.newContext(contextOptions(TARGETS[0]))).newPage();
    await page.addInitScript(initScript, false);
    await page.goto(`${url}/?lookbook=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => typeof window.useGameStore === 'function', null, { timeout: 60000 });
    out.seam = await page.evaluate(() => !!window.__craftyLookbook);
    out.renderer = await freshRenderer(page);
    const start = page.getByRole('button', { name: /Start Adventure/i });
    await start.first().waitFor({ timeout: 60000 }).catch(() => {});
    if ((await start.count()) > 0) { await start.first().click(); out.entry = 'click on Start Adventure'; }
    const built = await page.waitForFunction(() => window.useGameStore.getState().isSpawnChunkLoaded === true, null, { timeout: WORLD_TIMEOUT_MS, polling: 1000 })
      .then(() => true, () => false);
    if (!built) { out.notes.push(`COULD NOT MEASURE: the world never built within ${WORLD_TIMEOUT_MS / 1000} s`); return out; }
    if (out.seam) {
      const h = await holdActive(page);
      if (h.plays) out.entry = `${out.entry || 'no click'} + seam play() x${h.plays}`;
      if (!h.held) { out.notes.push('COULD NOT MEASURE: the input gate never held live'); return out; }
    } else {
      out.notes.push('this build has no lookbook seam: entered by the click alone; whether input is live is UNCHECKED');
    }
    console.log(`LOOKBOOK HOLD READY ${JSON.stringify({ renderer: out.renderer, gpu: classifyRenderer(out.renderer), seam: out.seam, entry: out.entry })}`);
    const t0 = Date.now();
    while (Date.now() - t0 < HOLD_S * 1000) {
      const s = await page.evaluate(() => {
        const g = window.useGameStore.getState();
        const lb = window.__craftyLookbook?.info?.();
        return { tier: g.qualityTier, isAlive: g.isAlive, active: lb ? lb.active : null, dpr: lb?.gl?.dpr ?? null };
      });
      out.timeline.push({ t: Math.round((Date.now() - t0) / 1000), ...s });
      await delay(Math.min(10000, Math.max(0, HOLD_S * 1000 - (Date.now() - t0))));
    }
    return out;
  } finally {
    await close(b);
  }
}

function buildIdentity() {
  const html = readFileSync(join(BUILD_DIR, 'index.html'), 'utf8');
  const chunk = (html.match(/assets\/(index-[\w-]+\.js)/) || [])[1] || null;
  let commit = null;
  try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
  // The commit is the CHECKOUT's at run time; with --build-dir the served build may come from another commit, so the
  // index chunk's content hash is the build's real identity.
  return { buildDir: BUILD_DIR, indexChunk: chunk, commitAtRun: commit };
}

let code = 0;
try {
  await waitReady();
  const report = { generatedAt: new Date().toISOString(), url, build: buildIdentity(), chromiumCandidates: null, targets: [] };

  let chromiumLaunch = null, chromiumLaunchId = null;
  if (HOLD_S > 0 || WANT.some((id) => id.startsWith('chromium'))) {
    if (HEADED) {
      chromiumLaunch = { channel: 'chromium', headless: false };
      chromiumLaunchId = 'headed';
    } else {
      const r = await resolveChromium();
      report.chromiumCandidates = r.results;
      console.log('Chromium launch candidates (renderer of a fresh context on about:blank):');
      for (const c of r.results) console.log(`  ${c.id.padEnd(20)} ${c.error ? `LAUNCH FAILED: ${c.error}` : `${c.gpu.padEnd(9)} ${c.renderer}`}`);
      if (r.chosen) { chromiumLaunch = r.chosen.launch; chromiumLaunchId = r.chosen.id; }
      else if (ALLOW_SOFTWARE) {
        const any = CHROMIUM_CANDIDATES.find((c) => r.results.find((x) => x.id === c.id && !x.error));
        if (any) { chromiumLaunch = any.launch; chromiumLaunchId = `${any.id} (SOFTWARE, --allow-software)`; }
      }
      console.log(`  -> ${chromiumLaunchId || 'NONE gives a hardware renderer'}`);
    }
  }

  if (HOLD_S > 0) {
    if (!chromiumLaunch) throw new Error('no Chromium launch gives a hardware renderer (pass --headed, or --allow-software to measure SwiftShader)');
    const h = await hold(chromiumLaunch, chromiumLaunchId);
    writeFileSync(join(OUT, 'hold.json'), JSON.stringify({ ...report, hold: h }, null, 2));
    for (const n of h.notes) console.log(`  ${n}`);
    console.log(`hold: ${join(OUT, 'hold.json')}`);
    if (h.notes.some((n) => n.startsWith('COULD NOT MEASURE'))) code = 3;
  } else {
    for (const id of WANT) {
      const target = TARGETS.find((t) => t.id === id);
      console.log(`\n── ${id} ─────────────────────────────`);
      let r;
      if (target.engine === 'chromium' && !chromiumLaunch) {
        r = { id, engine: 'chromium', renderer: null, gpu: 'unknown', shots: [], notes: [
          'COULD NOT MEASURE: no Chromium launch candidate gave the game a hardware renderer (see chromiumCandidates); pass --allow-software to shoot SwiftShader frames anyway, labelled'] };
      } else {
        const launchOpts = target.engine === 'chromium' ? chromiumLaunch : { headless: !HEADED };
        r = await shootTarget(target, launchOpts, target.engine === 'chromium' ? chromiumLaunchId : (HEADED ? 'headed' : 'headless'));
      }
      report.targets.push(r);
      const valid = r.shots.filter((s) => s.valid).length;
      console.log(`  GL renderer   ${r.renderer} (${r.gpu})`);
      console.log(`  entered by    ${r.entry}`);
      console.log(`  shots         ${valid}/${r.shots.length} valid (planned ${shotPlan().length})${r.respawns ? `, ${r.respawns} respawn(s)` : ''}`);
      for (const s of r.shots.filter((x) => !x.valid)) console.log(`    INVALID ${s.file}: ${s.why.join('; ')}`);
      const tiers = [...new Set(r.shots.map((s) => `${s.tier}@${s.dpr}`))];
      console.log(`  tier@dpr      ${tiers.join(', ') || '-'}`);
      console.log(`  page errors   ${r.pageErrors?.length ?? 0}`);
      const msgs = Object.entries(r.console || {}).sort((a, b) => b[1] - a[1]);
      console.log(`  console       ${msgs.length} distinct error/warning message(s)`);
      for (const [m, n] of msgs.slice(0, 8)) console.log(`    ${String(n).padStart(4)}x  ${m}`);
      for (const n of r.notes) console.log(`  ${n}`);
      if (r.notes.some((n) => n.startsWith('COULD NOT MEASURE'))) code = 3;
      if (target.engine === 'chromium' && r.gpu === 'software' && !ALLOW_SOFTWARE) {
        console.log('  COULD NOT MEASURE: the GAME\'s renderer is software although the about:blank probe said hardware');
        code = 3;
      }
    }
    writeFileSync(join(OUT, 'lookbook.json'), JSON.stringify(report, null, 2));
    writeFileSync(join(OUT, 'index.html'), contactSheetHtml(report));
    console.log(`\nframes + report: ${OUT}\ncontact sheet:   ${join(OUT, 'index.html')}`);
  }
} catch (e) {
  console.error(`lookbook: COULD NOT MEASURE — ${e.message}`);
  code = 3;
} finally {
  await liveBrowser?.close().catch(() => {});
  await shutdown(null);
}
process.exit(code);
