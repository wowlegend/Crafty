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
 * Adventure on the touch targets; the seam's play() on desktop, where headless Chromium refuses pointer lock), then
 * shoots three sets (--sets, default all three), in this order:
 *   eye    stands the player at the Hearth and turns their head to three bearings at each of the four times: the
 *          player's own eye, with the first-person hands and the HUD on (_lookbook.mjs EYE_HEADINGS). Before each eye
 *          shot and each clip, hostiles within 12 m of the eye are removed (the seam's clearHostiles, recorded as
 *          `cleared`): left alone, they hold melee range at the Hearth and the frame is a mob at arm's length;
 *   clips  Chromium only: holds W for 4 s from the Hearth at each time, a real key through the browser's input
 *          pipeline, recorded with Playwright's screencast and encoded to mp4 with ffmpeg;
 *   hero   for each of four places, pins the camera above it and shoots the programme's four times of day;
 *   material  (opt-in, not in the default) stands the player in front of a grass hill's side and a tree trunk found
 *          in the live mesh near the Hearth (_lookbook.mjs findMaterialSights) and looks at each, at each time.
 * The clock keeps running, so before each shot it sets the time, lets the sky settle, sets it again and shoots, and
 * records where the clock actually was. Every shot and clip also records timer-query ms per pass over its window
 * (src/render/passTimer.js, EXT_disjoint_timer_query_webgl2: Chromium only; WebKit says it cannot time). Those are not
 * established as GPU execution times: the window check (_lookbook.mjs passSummary, `plausible`) can only refute them.
 *
 * WHAT IT WRITES into --out: <target>/<place>-<cycle>.png, <target>/eye-<bearing>-<cycle>.png,
 * <target>/walk-<cycle>.mp4 and <target>/title.png, lookbook.json (per shot: requested and actual cycle, input live,
 * alive, tier, dpr in force, canvas size, GL renderer, console errors during the shot, post-pass ms, and a validity
 * verdict naming what is wrong; per eye shot also the bearing faced, the eye and body positions, hands and HUD; per
 * clip the distance walked and the game's frame count), and index.html, the contact sheet.
 *
 * An INSTRUMENT, not a gate: it judges no look. Exit 0 = every target measured · 3 = COULD NOT MEASURE (named).
 * Invalid shots (input not live, player dead, clock drifted) are recorded and flagged, not hidden and not fatal.
 *
 * BLIND SPOTS. macOS WebKit is not iPadOS (same engine and ANGLE-Metal path, not the same GPU, memory ceiling or
 * thermals): a defect seen here is real in WebKit; a clean frame does not clear the iPad. Hero shots PIN the camera
 * above the scene; only the eye set and the clips are the player's eye. A pose does not pause the world (physics, mobs, weather, particles and
 * the clock run) but it does stop the Player's controller (movement and the KCC, the death branch, the void guard, the
 * beast / voidhand / imbue ticks), and PositionTracker publishes the posed CAMERA as store.playerPosition: mobs, allies
 * and chunk streaming see the camera, not the body (src/render/lookbookSeam.js). So mobs aim at the camera, a night
 * shot can kill the player: the shot is marked invalid and the store's own respawn() runs before the next. First-session onboarding toasts are
 * suppressed (crafty_onboarded) so they do not cover the frames.
 *
 * --hold <seconds> is the power scenario (scripts/dev/power-ab.sh): one Chromium page at 1280x800, entered at spawn by
 * clicking Start Adventure and nothing else, in every build — never through the seam, which the A/B's baseline build
 * lacks — held for N seconds. A click the browser refused a pointer lock (Playwright's headless shell always does) is
 * followed by a page-level lock stand-in that opens the input gate through the game's own listener (`lock`: held,
 * stood-in), because a started game with a dead gate is paused and holds its world. Whether play is live is read the
 * same seam-free way in every build (`inPlay`); an arm not in play says so. It prints "LOOKBOOK HOLD READY" (renderer,
 * seam, entry, lock, inPlay, headed) and writes hold.json (tier and mob timeline, `worldMoved`, `partial: false`, the
 * seconds held). A hold stopped by a signal or an error writes what it had, marked `partial: true` with `stoppedBy`.
 * --headed shows the window.
 *
 * Needs a production build: `npm run build` first.
 * Usage:  node scripts/visual/lookbook.mjs [--out <dir>] [--targets chromium-1280x800,webkit-1180x820,webkit-820x1180]
 *                                          [--sets hero,eye,clips] [--cycles 0.02,0.25,0.5,0.75] [--allow-software]
 *         node scripts/visual/lookbook.mjs --hold <seconds> [--headed] [--out <dir>]
 *         either form takes [--build-dir <dir>] to serve a production build kept outside build/.
 */
import { chromium, webkit, devices } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { serveVite, probePort } from './_serve.mjs';
import { standInPointerLock, playLiveReading } from './_probe.mjs';
import {
  TARGETS, CHROMIUM_CANDIDATES, LOOKBOOK_PLACES, EYE_HEADINGS, EYE_PITCH, shotPlan, eyeShotPlan, clipPlan, classifyRenderer,
  pickCandidate, shotVerdict, eyeShotVerdict, clipVerdict, passSummary, contactSheetHtml, parseCycles, indexChunkOf,
  servedBuildProblem, MATERIAL_SIGHT_KINDS, MATERIAL_STAND_M, MATERIAL_MIN_M, materialShotPlan, findMaterialSights, aimAt,
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
const SETS_KNOWN = ['hero', 'eye', 'clips', 'material'];
const SETS = arg('--sets', 'hero,eye,clips').split(',');
// --cycles: the times to shoot (dawn-origin fractions), for a before/after at hours the programme's four do not cover.
let CYCLES;
try {
  CYCLES = parseCycles(arg('--cycles', null));
} catch (e) {
  console.error(`lookbook: COULD NOT MEASURE — ${e.message}`);
  process.exit(3);
}
// --build-dir: serve a production build kept outside build/ (the power A/B's other arm). Default: this app's build/.
const BUILD_DIR = resolve(arg('--build-dir', 'build'));
const LAUNCHERS = { chromium, webkit };

const TITLE_WAIT_MS = 8000; // the title diorama mounts lazily; ipad-probe waits the same
const WORLD_TIMEOUT_MS = 180000;
const WARMUP_MS = 5000; // shaders compile and the tier governor takes its first samples
const STREAM_MS = 6000; // chunks stream in around a newly posed camera (PositionTracker mirrors the camera)
const SETTLE_MS = 3000; // sky, fog and grade settle at a new time of day
const EYE_FRAME_MS = 1000; // a new bearing: the HUD compass redraws, and the pass timer gathers about a second of frames
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(join(BUILD_DIR, 'index.html'))) {
  console.error(`lookbook: COULD NOT MEASURE — no production build at ${join(BUILD_DIR, 'index.html')}. Run \`npm run build\` first.`);
  process.exit(3);
}
for (const s of SETS) {
  if (!SETS_KNOWN.includes(s)) {
    console.error(`lookbook: COULD NOT MEASURE — unknown set "${s}" (known: ${SETS_KNOWN.join(', ')})`);
    process.exit(3);
  }
}
for (const id of WANT) {
  if (!TARGETS.some((t) => t.id === id)) {
    console.error(`lookbook: COULD NOT MEASURE — unknown target "${id}" (known: ${TARGETS.map((t) => t.id).join(', ')})`);
    process.exit(3);
  }
}
mkdirSync(OUT, { recursive: true });

const { url, waitReady, shutdown } = serveVite(PORT, { preview: true, outDir: BUILD_DIR });

// Anything we launch, we kill — on a throw (finally), and on Ctrl-C, power-ab.sh's TERM or a closed terminal (these
// handlers). They own the order: close the browser (under shutdown()'s 8 s timeout), kill the vite group, exit.
// Playwright's own signal handlers are switched off at every launch (OWN_SIGNALS) because, while a browser is open,
// its SIGINT handler closes the browser and calls process.exit(130) itself, ahead of the `await` here — which is how
// Ctrl-C left `vite preview` on the port (review of PR #23, item 2; scripts/dev/lookbook-signal-check.mjs --case int
// reproduced it). _serve.mjs now kills the vite group on ANY process exit as well, so a second signal while stopping
// exits at once without leaving it. Check this file's lifecycle with that script after changing it.
const OWN_SIGNALS = Object.freeze({ handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false });
let liveBrowser = null;
let stopping = false;

// The --hold record, at module scope so a signal can write what the hold has so far (review of PR #23, item 1: the
// TERM handler used to exit without writing anything, so every power-ab.sh arm, which TERMed the driver before its
// hold ended, lost the tier timeline). `partial: true` with `stoppedBy` names a hold that did not run out.
let holdBase = null; // the report header (generatedAt, url, build, chromiumCandidates)
let holdOut = null; // hold()'s record, filled as the hold goes
let holdT0 = null; // when the hold loop started (ms)
let holdT1 = null; // when it ran out (ms); null while it runs — a signal measures to the moment it lands
function writeHold({ partial, stoppedBy }) {
  const heldS = holdT0 === null ? 0 : Math.round(((holdT1 ?? Date.now()) - holdT0) / 1000);
  const path = join(OUT, 'hold.json');
  writeFileSync(path, JSON.stringify({ ...holdBase, hold: { ...holdOut, partial, stoppedBy, requestedS: HOLD_S, heldS } }, null, 2));
  return { path, heldS };
}

async function stopAll(code, signal) {
  if (stopping) process.exit(code);
  stopping = true;
  console.error(`lookbook: ${signal} — closing the browser and vite`);
  if (HOLD_S > 0) {
    // Before anything async: the record must not depend on the browser closing cleanly.
    try {
      const { path, heldS } = writeHold({ partial: true, stoppedBy: signal });
      console.error(`hold: PARTIAL — stopped by ${signal} after ${heldS} s of ${HOLD_S}: ${path}`);
    } catch (e) {
      console.error(`hold: could not write the partial record — ${e.message}`);
    }
  }
  await shutdown(liveBrowser);
  process.exit(code);
}
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  process.on(signal, () => { stopAll(code, signal); });
}

async function launch(engine, opts) {
  const b = await LAUNCHERS[engine].launch({ ...opts, ...OWN_SIGNALS });
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
// A failed timer load is recorded on the shot, never fatal to the run.
const passTimes = (page, opts = {}) => page.evaluate((o) => window.__craftyLookbook.passTimes(o), opts)
  .catch((e) => ({ installed: false, reason: `passTimes threw: ${String(e.message).split('\n')[0]}` }));
const setCycle = (page, c) => page.evaluate((x) => window.__craftyLookbook.setCycle(x), c);
// Hostiles within this radius are removed before each eye shot and clip, so the frame is the world and not a mob at
// arm's length; farther ones stay in view. Each record says how many went.
const CLEAR_RADIUS_M = 12;
const clearHostiles = (page) => page.evaluate((radius) => window.__craftyLookbook.clearHostiles({ radius }), CLEAR_RADIUS_M);
const play = (page) => page.evaluate(() => window.__craftyLookbook.play());
/** The vitals stack is on screen: the HUD a player sees, not merely mounted. */
const hudOn = (page) => page.evaluate(() => {
  const r = document.querySelector('[data-testid="stat-stack"]')?.getBoundingClientRect();
  return !!(r && r.width > 0 && r.height > 0);
});

async function respawnIfDead(page, report) {
  if ((await info(page)).isAlive) return;
  await page.evaluate(() => window.useGameStore?.getState?.().respawn?.());
  report.respawns += 1;
  await delay(1500);
}

/** Where the body rests: two reads 500 ms apart within 5 cm (not falling, not respawning), or null after ~20 s. */
async function restingBody(page) {
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
 * The camera's node count with the hands hidden (posed) and back (cleared), measured in this page: the eye verdict's
 * baseline, because the camera carries other children (the audio listener) and the hands' own count varies by item.
 */
async function handsBaseline(page) {
  const free = (await info(page)).cameraNodes;
  const at = LOOKBOOK_PLACES[0];
  await page.evaluate((p) => window.__craftyLookbook.pose(p), { position: at.position, lookAt: at.lookAt });
  await delay(800);
  const hidden = (await info(page)).cameraNodes;
  await page.evaluate(() => window.__craftyLookbook.clear());
  await delay(1200);
  const back = (await info(page)).cameraNodes;
  return { free, hidden, back };
}

/**
 * webm -> mp4 (H.264, yuv420p, faststart), cut to `fromS`..`fromS + forS` (the span the key was held: the recording
 * starts before the key goes down and stops after it comes up), then ffprobe's frame count and duration. The webm
 * goes on success.
 */
function encodeClip(webm, mp4, { fromS, forS }) {
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-ss', fromS.toFixed(3), '-t', forS.toFixed(3), '-an',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', mp4],
    { stdio: ['ignore', 'ignore', 'pipe'] });
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries',
      'stream=nb_read_frames,width,height,avg_frame_rate:format=duration', '-of', 'json', mp4], { encoding: 'utf8' }));
    const st = probe.streams?.[0] || {};
    rmSync(webm, { force: true });
    return { file: basename(mp4), frames: Number(st.nb_read_frames), size: [st.width, st.height], fps: st.avg_frame_rate,
      durationS: Number(probe.format?.duration) };
  } catch (e) {
    return { file: basename(webm), frames: NaN, error: `ffmpeg/ffprobe: ${String(e.stderr || e.message).split('\n')[0]}` };
  }
}

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
    shots: [], eye: [], clips: [], material: [], sights: null, stand: null, hands: null, notes: [], respawns: 0, console: {},
    pageErrors: [] };
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
    // The first call loads and installs the pass timer; the composer is instrumented on its next frame.
    await passTimes(page);
    await delay(500);

    /** What every shot records, read from the seam's info() just after it. */
    const facts = (after, t0, pt) => {
      const errs = log.filter((e) => e.t >= t0 && e.type !== 'warning');
      if (report.renderer === null && after.gl?.renderer) report.renderer = after.gl.renderer;
      return {
        cycleAtShot: after.cycle, active: after.active, isAlive: after.isAlive,
        health: after.health, tier: after.tier, frameCap: after.frameCap, dpr: after.gl?.dpr ?? null,
        canvas: after.gl?.canvas ?? null, renderer: after.gl?.renderer ?? null, contextLosses: after.contextLosses,
        consoleErrors: errs.length, consoleSample: [...new Set(errs.map((e) => e.text))].slice(0, 5),
        passMs: passSummary(pt, after.gl?.canvas),
      };
    };

    // The eye set and the clips go first: after the hero set's night shots, the night's mobs crowd the player at the
    // Hearth and the eye frames show a mob at arm's length instead of the world.
    if (SETS.includes('eye') || SETS.includes('material') || (SETS.includes('clips') && target.engine === 'chromium')) {
      report.hands = await handsBaseline(page);
      await respawnIfDead(page, report);
      report.stand = await restingBody(page);
      if (!report.stand) report.notes.push('COULD NOT MEASURE eye level or clips: the player never came to rest (falling or respawning)');
    }
    const standAndLook = async (heading) => {
      await page.evaluate((p) => window.__craftyLookbook.stand(p), { position: report.stand });
      return page.evaluate((h) => window.__craftyLookbook.look(h), { heading, pitch: EYE_PITCH });
    };

    let lastCycle = null;
    for (const shot of SETS.includes('eye') && report.stand ? eyeShotPlan(EYE_HEADINGS, CYCLES) : []) {
      const t0 = Date.now();
      await respawnIfDead(page, report);
      await standAndLook(shot.heading);
      if (shot.cycle !== lastCycle) {
        await setCycle(page, shot.cycle);
        await delay(SETTLE_MS);
        lastCycle = shot.cycle;
      }
      const cleared = await clearHostiles(page);
      await play(page);
      await setCycle(page, shot.cycle);
      await passTimes(page, { reset: true });
      await delay(EYE_FRAME_MS);
      const before = await info(page);
      const hud = await hudOn(page);
      await page.screenshot({ path: join(dir, shot.file) });
      const after = await info(page);
      const pt = await passTimes(page);
      const v = eyeShotVerdict({ cycle: shot.cycle, heading: shot.heading, stand: report.stand, before, after, handsBaseline: report.hands?.hidden, hud });
      report.eye.push({ ...shot, valid: v.valid, why: v.why, ...facts(after, t0, pt), hud, heading: shot.heading,
        headingAtShot: after.heading, pitch: after.pitch, eye: after.eye, body: after.body, cameraNodes: after.cameraNodes,
        hostiles: after.hostiles, cleared,
        eyeAboveBody: after.eye && after.body ? Math.round((after.eye[1] - after.body[1]) * 1000) / 1000 : null });
    }

    for (const clip of SETS.includes('clips') && target.engine === 'chromium' && report.stand ? clipPlan(CYCLES) : []) {
      await respawnIfDead(page, report);
      await standAndLook(clip.heading);
      await setCycle(page, clip.cycle);
      await delay(SETTLE_MS);
      await play(page);
      await setCycle(page, clip.cycle);
      await delay(300);
      const cleared = await clearHostiles(page);
      await passTimes(page, { reset: true });
      const start = await info(page);
      const webm = join(dir, clip.file.replace(/\.mp4$/, '.webm'));
      await page.screencast.start({ path: webm, size: target.viewport });
      const t0 = Date.now(); // the key goes down as the recording starts; stop() lands well after the key comes up
      await page.keyboard.down('KeyW');
      await delay(clip.ms);
      await page.keyboard.up('KeyW');
      const heldMs = Date.now() - t0;
      await page.screencast.stop();
      const end = await info(page);
      const passMs = passSummary(await passTimes(page), end.gl?.canvas);
      const video = encodeClip(webm, join(dir, clip.file), { fromS: 0, forS: heldMs / 1000 });
      const v = clipVerdict({ cycle: clip.cycle, heading: clip.heading, stand: report.stand, start, end, frames: video.frames });
      if (video.error) v.why.push(video.error);
      report.clips.push({ ...clip, file: video.file, valid: v.why.length === 0, why: v.why, movedM: v.movedM, heldMs, cleared,
        frames: video.frames, durationS: video.durationS, videoSize: video.size, videoFps: video.fps,
        // Composer renders in the window: the game's own frame count while walking, which the video's is not.
        gameFrames: passMs.frames ?? null,
        start: { body: start.body, cycle: start.cycle, heading: start.heading, hostiles: start.hostiles },
        end: { body: end.body, cycle: end.cycle, heading: end.heading, isAlive: end.isAlive, hostiles: end.hostiles },
        passMs });
    }

    if (SETS.includes('material') && report.stand) {
      report.sights = await page.evaluate(findMaterialSights, { from: report.stand, standM: MATERIAL_STAND_M, minM: MATERIAL_MIN_M });
      for (const kind of MATERIAL_SIGHT_KINDS) {
        if (!report.sights[kind]) report.notes.push(`COULD NOT MEASURE the ${kind} sight: none in the loaded mesh near the Hearth`);
      }
    }
    let lastMaterialCycle = null;
    for (const shot of report.sights ? materialShotPlan(MATERIAL_SIGHT_KINDS.filter((k) => report.sights[k]), CYCLES) : []) {
      const t0 = Date.now();
      const sight = report.sights[shot.kind];
      await respawnIfDead(page, report);
      // Dropped a little above its ground, the body settles onto it; the verdict compares where it came to rest.
      await page.evaluate((p) => window.__craftyLookbook.stand(p), { position: [sight.stand[0], sight.ground + 1.5, sight.stand[2]] });
      const rest = await restingBody(page);
      const aim = aimAt((await info(page)).eye, sight.target);
      await page.evaluate((a) => window.__craftyLookbook.look(a), { heading: aim.heading, pitch: aim.pitch });
      if (shot.cycle !== lastMaterialCycle) {
        await setCycle(page, shot.cycle);
        await delay(SETTLE_MS);
        lastMaterialCycle = shot.cycle;
      }
      const cleared = await clearHostiles(page);
      await play(page);
      await setCycle(page, shot.cycle);
      await passTimes(page, { reset: true });
      await delay(EYE_FRAME_MS);
      const before = await info(page);
      const hud = await hudOn(page);
      await page.screenshot({ path: join(dir, shot.file) });
      const after = await info(page);
      const pt = await passTimes(page);
      const v = eyeShotVerdict({ cycle: shot.cycle, heading: aim.heading, stand: [sight.stand[0], sight.ground, sight.stand[2]], before, after,
        handsBaseline: report.hands?.hidden, hud });
      if (!rest) v.why.push('the body never came to rest at the sight');
      report.material.push({ ...shot, valid: v.valid && !!rest, why: v.why, ...facts(after, t0, pt), hud, sight, aim, rest,
        headingAtShot: after.heading, pitch: after.pitch, eye: after.eye, body: after.body, cameraNodes: after.cameraNodes,
        hostiles: after.hostiles, cleared });
    }

    for (const place of SETS.includes('hero') ? LOOKBOOK_PLACES : []) {
      await page.evaluate((p) => window.__craftyLookbook.pose(p), { position: place.position, lookAt: place.lookAt });
      await delay(STREAM_MS);
      for (const shot of shotPlan([place], CYCLES)) {
        const t0 = Date.now(); // console errors from here to the screenshot belong to this shot
        await respawnIfDead(page, report);
        await setCycle(page, shot.cycle);
        await delay(SETTLE_MS);
        await play(page);
        await setCycle(page, shot.cycle);
        await passTimes(page, { reset: true });
        await delay(400);
        const before = await info(page);
        await page.screenshot({ path: join(dir, shot.file) });
        const after = await info(page);
        const pt = await passTimes(page);
        const v = shotVerdict({ cycle: shot.cycle, before, after });
        report.shots.push({ ...shot, valid: v.valid, why: v.why, ...facts(after, t0, pt) });
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

/** Whether the page holds pointer lock: two consecutive reads 250 ms apart, within ~10 s. */
async function pointerLockHeld(page, tries = 40) {
  let held = 0;
  for (let i = 0; i < tries && held < 2; i++) {
    held = (await page.evaluate(() => !!document.pointerLockElement)) ? held + 1 : 0;
    if (held < 2) await delay(250);
  }
  return held >= 2;
}

/** Did the world run during the hold: a mob moved between two samples, or the count of mobs changed (one spawned or
 *  died). A world with no mobs that never gains one reads false, which a held world and an empty one share. */
function worldMovedOver(timeline) {
  const first = timeline[0];
  return !!first && timeline.some((s) => s.moved > 0 || s.mobs !== first.mobs);
}

/** The power scenario: one Chromium page entered by the click alone at spawn, and held. Any build, seam or none. */
async function hold(launchOpts, launchId) {
  const out = { launch: launchId, headed: HEADED, seam: false, renderer: null, entry: null, timeline: [], notes: [] };
  holdOut = out;
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
    // ONE ENTRY FOR EVERY BUILD (review of PR #23, item 3). The A/B's baseline arm is a build from before the seam, so
    // it can enter play only by the click. Making input live through the seam in the other arm measured two different
    // states wherever the click did not lock the pointer (Playwright's headless shell never does). So no build's seam is
    // used here. A click the browser refused a lock is followed by the page-level stand-in (_probe.mjs
    // standInPointerLock), which opens the gate through every build's own lock listener: a started game whose gate stays
    // dead is PAUSED and holds its world (the real pause), so without it the arm would measure a frozen world in a build
    // with the pause and a running one in a build without it. Whether play is live is then read seam-free
    // (playLiveReading), and the lock that got it there is recorded: power-summary.mjs compares only arms whose scenario
    // matches, and refuses any arm not in play.
    if (!out.entry) out.notes.push('no Start Adventure button on the title: not entered at all');
    out.lock = (await pointerLockHeld(page)) ? 'held' : await page.evaluate(standInPointerLock);
    let live = 0;
    for (let i = 0; i < 40 && live < 2; i++) {
      const r = await page.evaluate(playLiveReading);
      live = r.started && r.alive && !r.pauseSurface ? live + 1 : 0;
      if (live < 2) await delay(250);
    }
    out.inPlay = live >= 2 && (out.lock === 'held' || out.lock === 'stood-in');
    if (out.lock === 'stood-in') {
      out.notes.push(`the click was not granted a pointer lock (${HEADED ? 'was the window in front?' : `headless, launch ${launchId}`}), so the page stood one in: the game's own listener opened the input gate. The cursor stays visible; nothing the world simulates reads it.`);
    }
    if (!out.inPlay) {
      out.notes.push(`NOT IN PLAY: lock ${out.lock}, ${JSON.stringify(await page.evaluate(playLiveReading))}. A started game with its input gate dead is paused, and from the real pause on (game/worldClock.js) its world is held: this arm measures no game, and power-summary.mjs refuses it.`);
    }
    console.log(`LOOKBOOK HOLD READY ${JSON.stringify({ renderer: out.renderer, gpu: classifyRenderer(out.renderer), seam: out.seam, entry: out.entry, lock: out.lock, inPlay: out.inPlay, headed: HEADED })}`);
    const t0 = Date.now();
    holdT0 = t0;
    while (Date.now() - t0 < HOLD_S * 1000) {
      // Seam-free reads, the same in every build: the store (exposed by every build) and the page itself. The pixel
      // ratio in force is the game canvas's backing width over its CSS width (the largest canvas on the page).
      // `mobs` and `moved` read whether the world ran at all, through the store's minimap mirror of the mobs (every
      // build writes it): how many there are, and how many stood somewhere else at the previous sample.
      const s = await page.evaluate(() => {
        const g = window.useGameStore.getState();
        const c = [...document.querySelectorAll('canvas')].sort((x, y) => y.width * y.height - x.width * x.height)[0];
        const mobs = (g.mobEntities || []).filter((m) => m && m.position);
        const prev = window.__lookbookHoldMobs || new Map();
        let moved = 0;
        for (const m of mobs) {
          const p = prev.get(m.id);
          if (p && Math.hypot(m.position[0] - p[0], m.position[2] - p[2]) > 0.01) moved += 1;
        }
        window.__lookbookHoldMobs = new Map(mobs.map((m) => [m.id, m.position]));
        return { tier: g.qualityTier, isAlive: g.isAlive, pointerLocked: !!document.pointerLockElement,
          dpr: c && c.clientWidth ? Math.round((c.width / c.clientWidth) * 100) / 100 : null, mobs: mobs.length, moved };
      });
      out.timeline.push({ t: Math.round((Date.now() - t0) / 1000), ...s });
      await delay(Math.min(10000, Math.max(0, HOLD_S * 1000 - (Date.now() - t0))));
    }
    holdT1 = Date.now(); // the hold ran out here; closing the browser afterwards is not part of it
    out.worldMoved = worldMovedOver(out.timeline);
    return out;
  } finally {
    await close(b);
  }
}

/** Throws, naming the cause, unless the port serves BUILD_DIR's build (_lookbook.mjs servedBuildProblem). */
async function assertServedBuild() {
  const expected = indexChunkOf(readFileSync(join(BUILD_DIR, 'index.html'), 'utf8'));
  let html = null;
  try { html = await (await fetch(url)).text(); } catch (e) { throw new Error(`the server on ${url} did not answer: ${e.message}`); }
  const problem = servedBuildProblem(html, expected);
  if (problem) throw new Error(problem);
}

function buildIdentity() {
  const html = readFileSync(join(BUILD_DIR, 'index.html'), 'utf8');
  const chunk = indexChunkOf(html);
  let commit = null;
  try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
  // The commit is the CHECKOUT's at run time; with --build-dir the served build may come from another commit, so the
  // index chunk's content hash is the build's real identity.
  return { buildDir: BUILD_DIR, indexChunk: chunk, commitAtRun: commit };
}

let code = 0;
try {
  await waitReady();
  await assertServedBuild();
  const report = { generatedAt: new Date().toISOString(), url, build: buildIdentity(), sets: SETS, chromiumCandidates: null, targets: [] };
  holdBase = report;

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
    writeHold({ partial: false, stoppedBy: null });
    for (const n of h.notes) console.log(`  ${n}`);
    const last = h.timeline[h.timeline.length - 1];
    console.log(`  world over the hold: ${h.worldMoved ? 'moving' : 'still'} (${h.timeline.length} samples; mobs ${h.timeline[0]?.mobs ?? '-'} -> ${last?.mobs ?? '-'}; moved per sample ${h.timeline.map((s) => s.moved).join(',')})`);
    console.log(`hold: ${join(OUT, 'hold.json')}`);
    if (h.notes.some((n) => n.startsWith('COULD NOT MEASURE'))) code = 3;
  } else {
    for (const id of WANT) {
      const target = TARGETS.find((t) => t.id === id);
      console.log(`\n── ${id} ─────────────────────────────`);
      await assertServedBuild();
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
      console.log(`  shots         ${valid}/${r.shots.length} valid (planned ${SETS.includes('hero') ? shotPlan(LOOKBOOK_PLACES, CYCLES).length : 0})${r.respawns ? `, ${r.respawns} respawn(s)` : ''}`);
      for (const s of r.shots.filter((x) => !x.valid)) console.log(`    INVALID ${s.file}: ${s.why.join('; ')}`);
      if (r.eye) {
        console.log(`  eye level     ${r.eye.filter((s) => s.valid).length}/${r.eye.length} valid (planned ${SETS.includes('eye') ? eyeShotPlan(EYE_HEADINGS, CYCLES).length : 0}); stand ${JSON.stringify(r.stand)}; hands ${JSON.stringify(r.hands)}`);
        for (const s of r.eye.filter((x) => !x.valid)) console.log(`    INVALID ${s.file}: ${s.why.join('; ')}`);
      }
      if (r.clips?.length) {
        console.log(`  clips         ${r.clips.filter((c) => c.valid).length}/${r.clips.length} valid`);
        for (const c of r.clips) console.log(`    ${c.file}: walked ${Number(c.movedM).toFixed(2)} m, ${c.frames} video / ${c.gameFrames} game frames${c.valid ? '' : `, INVALID: ${c.why.join('; ')}`}`);
      }
      const all = [...r.shots, ...(r.eye || []), ...(r.clips || [])].map((s) => s.passMs);
      const timed = all.filter((p) => p?.postMs != null);
      const implausible = timed.filter((p) => !p.plausible).length;
      const why = [...new Set(all.filter((p) => p?.postMs == null).map((p) => p?.reason).filter(Boolean))];
      console.log(`  post-pass ms  ${timed.length}/${all.length} shot(s) and clip(s) timed, ${implausible} of them IMPLAUSIBLE (more GPU ms than the window lasted)${why.length ? `; untimed: ${why.join('; ')}` : ''}`);
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
  // A hold that died part-way still leaves what it had, marked partial, like a signalled one.
  if (HOLD_S > 0 && holdOut) {
    try { writeHold({ partial: true, stoppedBy: `error: ${String(e.message).split('\n')[0]}` }); } catch { /* the error above is the report */ }
  }
} finally {
  await shutdown(liveBrowser);
}
process.exit(code);
