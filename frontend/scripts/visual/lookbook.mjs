#!/usr/bin/env node
/**
 * lookbook.mjs — the PRODUCTION bundle on a REAL GPU with MOTION ON, at fixed places and times of day, in Chromium and
 * in WebKit at both iPad viewports. The acceptance surface for every looks move in the masterpiece programme
 * (docs/superpowers/plans/2026-10-27-crafty-masterpiece.md, "How a move counts as done" #2; plan
 * docs/superpowers/plans/2026-10-27-crafty-instruments.md).
 *
 * WHY NOT CAPTURE MODE. Capture frames cannot judge looks: SwiftShader, the DEV server, and capture mode turns off
 * weather, mobs, NPCs, particles and spawning and pins the sun at noon. That is why the capture oracle was retired
 * (DECISIONS 2026-10-28 W1-H item 1) and this is the look acceptance surface. It shoots the build Vercel ships, with
 * all of that running.
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
 *   hud    (opt-in) the HUD lane's poses (_lookbookHud.mjs): HOME and Mara a few degrees apart on the compass, label
 *          boxes read for overlap; the dusk warning in English, then after a night in zh-CN, each frame shot with the
 *          toast up and its box read against the day-phase dial's.
 *   dragon (opt-in) the dragon arena (_lookbook.mjs DRAGON_ARENA): the Shadow Dragon woken over the Blight Heart lair
 *          by the seam's dragon(), held in each pose it knows, framed from the lair's bearing toward the spawn, at each
 *          time; it waits for the lair's chunks to stream in under a camera hung over it (STREAM_DRAGON_MS at most).
 *   self   (opt-in) what the player sees of their own body: each beast form at the steady eye, the light string, the
 *          cast and the heavy charge held at their apex by the seam, and the hands beside the Hearth's brazier at
 *          midnight (shootSelf).
 * Every eye shot also records its CHROME footprint (_lookbook.mjs chromeFootprint): on a page held still, the pixels
 * the HUD's own elements change (against a twin with them hidden), the touch layer's apart, and the colour count as a
 * second column. A frame with a toast up is not at rest and is set aside (_lookbook.mjs atRest).
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
 * beast / voidhand / imbue ticks), and PositionTracker publishes the posed CAMERA as store.playerPosition: allies, the
 * spawner and chunk streaming see the camera, not the body (src/render/lookbookSeam.js), while the mobs' senses read
 * the body. So a night shot can kill the player: the shot is marked invalid and the store's own respawn() runs before the next. First-session onboarding toasts are
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
 * --passes is the whole-frame differential (plan docs/superpowers/plans/2026-10-28-crafty-w2i-passes.md): one Chromium
 * page at Kevin's window (_lookbook.mjs PASS_TARGET), the player stood at the Hearth, and at each of PASS_TIMES every
 * arm of PASS_ARMS switched off and on through the seam (passesOff) in interleaved repetitions (passWindowPlan), each
 * window timed in the timer's whole-frame mode: `q`, one query per composer.render, and `w`, the synced wall clock. A
 * window is valid only at tier high, alive, input live, with the clock where it was set, the body on the block's stand
 * facing its heading (a respawn or a drift is stood back before the next window) and the chain showing exactly the
 * arm's effects off (_lookbook.mjs passWindowWhy); an instrument short of samples is dropped from its window, not the
 * window. A game renderer that is not hardware stops the run (COULD NOT MEASURE), since the GPU utilization would read
 * an idle device; --allow-software lets a SwiftShader run through, and its U then admits no instrument. Then before/after frames (PASS_LOOK_PAIRS). No block starts while the 1-minute load is over
 * PASS_MAX_LOAD. It writes passes.json (every window, raw) and the frames, and prints each arm's differential and
 * verdict (passVerdict).
 *
 * Needs a production build: `npm run build` first.
 * Usage:  node scripts/visual/lookbook.mjs [--out <dir>] [--targets chromium-1280x800,webkit-1180x820,webkit-820x1180]
 *                                          [--sets hero,eye,clips] [--cycles 0.02,0.25,0.5,0.75] [--allow-software]
 *         node scripts/visual/lookbook.mjs --hold <seconds> [--headed] [--out <dir>]
 *         node scripts/visual/lookbook.mjs --passes [--reps N] [--arms godrays+sun,bloom] [--times noon,golden] [--out <dir>]
 *         either form takes [--build-dir <dir>] to serve a production build kept outside build/.
 */
import { chromium, webkit } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { serveVite, probePort } from './_serve.mjs';
import { standInPointerLock, playLiveReading } from './_probe.mjs';
import {
  freshRenderer, resolveChromium, contextOptions, initScript, info, setCycle, clearHostiles, play, hudOn, respawnIfDead,
  restingBody, handsBaseline, holdActive, chromeVars, holdFrames, releaseFrames, twinShot,
} from './_lookbookPage.mjs';
import {
  TARGETS, CHROMIUM_CANDIDATES, LOOKBOOK_PLACES, EYE_HEADINGS, EYE_PITCH, shotPlan, eyeShotPlan, clipPlan, classifyRenderer,
  shotVerdict, eyeShotVerdict, clipVerdict, passSummary, contactSheetHtml, parseCycles, indexChunkOf,
  servedBuildProblem, PASS_ARMS, PASS_TIMES, PASS_REPS, PASS_TARGET, PASS_LOOK_PAIRS, PASS_MAX_LOAD,
  passWindowPlan, windowMedian, passDifferential, passVerdict, admittedInstruments, PASS_CONTROL, parseGpuUtil, gpuMsPerFrame,
  altDifferential, PASS_ALT_SKIP_MS, windowReadings, passWindowWhy, poseWhy, passRendererProblem, checkoutState, medianOf,
  targetSummaryLines,
  MATERIAL_SIGHT_KINDS, MATERIAL_STAND_M, MATERIAL_MIN_M, materialShotPlan, findMaterialSights, aimAt,
  HAND_MASK, HANDS_HEADING, handPixelStats, facing, handCount, CYCLE_TOLERANCE, chromeShare, chromeColoursFrom,
  chromeFootprint, framesMoved, HELD_MOVED_MAX, footprintByRect,
  DRAGON_ARENA, dragonStreamPose, dragonSightPoints, pickDragonView, dragonShotPlan, dragonShotVerdict,
} from './_lookbook.mjs';
import { PNG } from 'pngjs';
import { shootHudSet } from './_lookbookHud.mjs';
import { BLOCK_ID } from '../../src/world/blockIds.js';

const PORT = probePort(import.meta.url);
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const flag = (k) => process.argv.includes(k);
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = resolve(arg('--out', `/tmp/crafty-lookbook-${STAMP}`));
const HOLD_S = Number(arg('--hold', 0));
const PASSES = flag('--passes');
const PASS_REPS_RUN = Number(arg('--reps', PASS_REPS));
// --alt: the fast alternation instead of the windowed differential (altWindow), in --alt-reps windows per arm.
const PASS_ALT = flag('--alt');
const PASS_ALT_REPS = Number(arg('--alt-reps', 2));
const PASS_ARMS_RUN = (() => {
  const want = arg('--arms', null);
  return want ? PASS_ARMS.filter((a) => want.split(',').includes(a.id)) : PASS_ARMS;
})();
const PASS_TIMES_RUN = (() => {
  const want = arg('--times', null);
  return want ? PASS_TIMES.filter((t) => want.split(',').includes(t.id)) : PASS_TIMES;
})();
const HEADED = flag('--headed');
// --first-session: the player's first session (no controls flags). Each eye frame is then shot as the game has it (the
// first-run card folded to the H hint once it has had its 30 s on screen) and again with the card up, as in the first
// 30 s of play (`chromeCard`).
const FIRST_SESSION = flag('--first-session');
const ALLOW_SOFTWARE = flag('--allow-software');
const WANT = arg('--targets', TARGETS.map((t) => t.id).join(',')).split(',');
const SETS_KNOWN = ['hero', 'eye', 'clips', 'material', 'hands', 'hud', 'self', 'dragon'];
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
const STREAM_DRAGON_MS = 90000; // the lair is 1 km from the spawn: its chunks stream in under the posed camera
const DRAGON_CLEAR_M = 40; // hostiles cleared around the arena camera, so the frame is the dragon and not the lair's mobs
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Shoot an eye frame to `path` and read its chrome (_lookbook.mjs chromeFootprint): with the page held still
 * (holdFrames), the frame, its twin with the HUD's own elements hidden, its canvas-only twin and the frame again; the
 * footprint is read only when the first and last shots agree, so nothing that moved between them is counted as HUD. The
 * colour count (chromeShare, the second column) reads the same frame against the canvas-only twin in the surface
 * colours the page defines at that moment. The toast count is read on the held page, where the shot was.
 */
// The HUD's surfaces the footprint is attributed to, in this order (a pixel goes to the first whose box holds it).
const HUD_RECT_IDS = ['controls-card', 'controls-hint', 'notification-stack', 'target-frame', 'hotbar-xp-row', 'hotbar', 'quest-tracker',
  'hud-compass', 'objective-tracker', 'stat-stack', 'radial-minimap', 'day-phase-dial', 'hud-settings', 'coin-readout'];
// The eye set's player: ember banked and coins in the purse, as any player past the first day has.
const RETURNING_PURSE = { ember: 40, coins: 120 };
// The nameplate twin's target: a hostile at two thirds of its health (ui/TargetFrame.jsx draws its name, its numbers and
// its health line).
const NAMEPLATE = { id: -1, type: 'duskhound', name: 'duskhound', health: 40, maxHealth: 60, isAlly: false };

// `plate`: raise that target's nameplate on the held page before the shots. The aim cone's mirror (Components.jsx, every
// 150 ms of the Player loop) cannot clear it there, since the page's animation frames are held; it clears it once they
// are handed back.
async function shootWithChrome(page, path, { plate = null } = {}) {
  await holdFrames(page);
  let pngs, touch, toasts, target, drawn, vars, rects;
  try {
    if (plate) {
      await page.evaluate((t) => window.useGameStore.setState({ targetEntity: t }), plate);
      await page.waitForFunction(() => !!document.querySelector('[data-testid="target-frame"]'), null, { timeout: 3000, polling: 50 });
    }
    const on = await page.screenshot({ path });
    const hudOff = await twinShot(page, 'touch');
    const world = await twinShot(page, 'world');
    const again = await page.screenshot();
    touch = hudOff.touch;
    rects = await page.evaluate((ids) => ids.map((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      const r = el?.getBoundingClientRect();
      return r && r.width > 0 ? { id, x: r.x, y: r.y, right: r.right, bottom: r.bottom } : null;
    }).filter(Boolean), HUD_RECT_IDS);
    toasts = await page.evaluate(() => (document.querySelector('[data-testid="notification-stack"]')
      || document.querySelector('.absolute.top-20.right-4.space-y-2'))?.children.length ?? 0);
    target = await page.evaluate(() => !!document.querySelector('[data-testid="target-frame"]'));
    drawn = await page.evaluate(() => ({ ember: !!document.querySelector('[data-testid="ember-bar"]'),
      coins: !!document.querySelector('[data-testid="coin-readout"]') }));
    vars = await chromeVars(page);
    pngs = [on, hudOff.png, world.png, again].map((x) => PNG.sync.read(x));
  } finally {
    if (plate) await page.evaluate(() => window.useGameStore.setState({ targetEntity: null }));
    await releaseFrames(page);
  }
  const [on, hudOff, world, again] = pngs;
  const size = { width: on.width, height: on.height };
  const moved = framesMoved(on.data, again.data, size);
  const chrome = { toasts, target, moved, touchLayer: touch, purse: drawn };
  if (moved > HELD_MOVED_MAX * on.width * on.height) {
    Object.assign(chrome, { share: null, why: `the page did not hold still: ${moved} px changed between the first and last shot` });
  } else {
    const f = chromeFootprint(on.data, hudOff.data, touch ? world.data : null, { ...size, keepMask: true });
    const scale = on.width / (await page.evaluate(() => window.innerWidth));
    Object.assign(chrome, { share: Math.round(f.share * 10000) / 10000, pixels: f.pixels, checked: f.checked,
      touchShare: f.touchShare === null ? null : Math.round(f.touchShare * 10000) / 10000,
      byElement: footprintByRect(f.mask, { ...size, rects, scale }) });
  }
  const colours = chromeColoursFrom(vars);
  if (colours.length) {
    const c = chromeShare(on.data, world.data, { ...size, colours });
    Object.assign(chrome, { colourShare: Math.round(c.share * 10000) / 10000, colourWorld: c.world, byColour: c.byColour,
      colours: colours.map((x) => `${x.name} ${x.rgb.join(' ')}`) });
  }
  return chrome;
}

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

// A failed timer load is recorded on the shot, never fatal to the run.
const passTimes = (page, opts = {}) => page.evaluate((o) => window.__craftyLookbook.passTimes(o), opts)
  .catch((e) => ({ installed: false, reason: `passTimes threw: ${String(e.message).split('\n')[0]}` }));

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

// THE SELF SET: what the player sees of their own body, as stills the seam holds (render/lookbookSeam.js form,
// handPose and the eye pose). Each beast form at the steady eye (the body + EYE_HEIGHT_M, no bob) under an eye pose,
// which keeps the hands and stops the beast state machine that would end a form it did not start; the body rests where
// the human capsule rests, so the world sits up to 0.3 m off where that form's capsule would put it, and the beast
// against the eye is exact. The light string's three steps at their apex and near their end, the cast at its peak and
// the full heavy charge, held in place of the clock. The hands beside the Hearth's brazier at midnight.
const SELF_FORMS = Object.freeze(['fire', 'ice', 'lightning', 'arcane']);
const SELF_FORM_CYCLES = Object.freeze([0.3, 0.75]);
const SELF_POSE_CYCLE = 0.3;
const SELF_POSES = Object.freeze([
  ['rest', null],
  ['swing1-apex', { kind: 'swing', step: 1, t: 0.5 }], ['swing1-end', { kind: 'swing', step: 1, t: 0.9 }],
  ['swing2-apex', { kind: 'swing', step: 2, t: 0.5 }], ['swing2-end', { kind: 'swing', step: 2, t: 0.9 }],
  ['finisher-apex', { kind: 'swing', step: 3, t: 0.5 }], ['finisher-end', { kind: 'swing', step: 3, t: 0.9 }],
  ['cast', { kind: 'cast', t: 0.5 }], ['charge', { kind: 'charge', level: 1 }],
]);
const EYE_OVER_BODY_M = 0.67; // combat/swingOrigin.js EYE_HEIGHT_M, the steady eye
// The Hearth's brazier (world/Terrain.jsx HomeAnchorRender, at the origin; its fire at bearing 135 from the stand, 1.4 m
// off): the player faces it low on the right (110), with it beside them (45) and behind their right shoulder (345).
const BRAZIER_XZ = Object.freeze([2.4, 2.4]);
const BRAZIER_STAND_XZ = Object.freeze([1.0, 1.0]);
const BRAZIER_HEADINGS = Object.freeze([110, 45, 345]);
const BRAZIER_CYCLE = 0.75;

async function shootSelf(page, report, dir, target) {
  const lb = (verb, arg) => page.evaluate(([v, a]) => window.__craftyLookbook[v](a), [verb, arg]);
  const shoot = async (file, extra) => {
    await clearHostiles(page);
    await play(page);
    const a = await info(page);
    await page.screenshot({ path: join(dir, file) });
    const row = { file, cycle: a.cycle, form: a.form, handPose: a.handPose, eye: a.eye, body: a.body, heading: a.heading,
      pitch: a.pitch, handNodes: a.handNodes, isAlive: a.isAlive, active: a.active, tier: a.tier, ...extra };
    report.self.push(row);
    console.log(`lookbook self ${target.id} ${file}: cycle ${a.cycle?.toFixed(3)} form ${a.form} hands ${a.handNodes} `
      + `eye-body ${a.eye && a.body ? (a.eye[1] - a.body[1]).toFixed(3) : '?'}${a.isAlive ? '' : ' DEAD'}`);
    return row;
  };
  const standFacing = async (position, heading) => {
    await respawnIfDead(page, report);
    await lb('stand', { position });
    return lb('look', { heading, pitch: 0 });
  };

  if (target.engine === 'chromium') {
    for (const c of SELF_FORM_CYCLES) {
      await standFacing(report.stand, HANDS_HEADING);
      await setCycle(page, c);
      await delay(SETTLE_MS);
      const at = await info(page);
      const eye = [at.body[0], at.body[1] + EYE_OVER_BODY_M, at.body[2]];
      const f = facing(at.heading, 0);
      await lb('pose', { position: eye, lookAt: [eye[0] + f[0] * 10, eye[1], eye[2] + f[2] * 10], hands: true });
      // The roar's reveal at its hold (game/transformCam.js: 4.5 m behind the body, 2.2 m over its centre, looking at
      // 0.6 m over it): what the first person hides must still draw from there.
      const reveal = { position: [at.body[0] - f[0] * 4.5, at.body[1] + 2.2, at.body[2] - f[2] * 4.5], lookAt: [at.body[0], at.body[1] + 0.6, at.body[2]] };
      for (const el of SELF_FORMS) {
        await lb('form', el);
        await setCycle(page, c);
        await delay(EYE_FRAME_MS + 600); // past the entrance pop and the burst (game/beastMorph.js MORPH_SEC, BURST_SEC)
        await shoot(`self-form-${el}-${c.toFixed(2)}.png`, { kind: 'form' });
        if (c === SELF_FORM_CYCLES[0]) {
          await lb('pose', reveal);
          await delay(EYE_FRAME_MS);
          await shoot(`self-reveal-${el}-${c.toFixed(2)}.png`, { kind: 'reveal' });
          await lb('pose', { position: eye, lookAt: [eye[0] + f[0] * 10, eye[1], eye[2] + f[2] * 10], hands: true });
        }
        await lb('form', null);
      }
      await lb('clear');
    }
  }

  await standFacing(report.stand, HANDS_HEADING);
  await setCycle(page, SELF_POSE_CYCLE);
  await delay(SETTLE_MS);
  for (const [name, p] of SELF_POSES) {
    await lb('handPose', p);
    await setCycle(page, SELF_POSE_CYCLE);
    await delay(600);
    await shoot(`self-pose-${name}-${SELF_POSE_CYCLE.toFixed(2)}.png`, { kind: 'pose' });
  }
  await lb('handPose', null);

  if (target.engine === 'chromium') {
    const off = BRAZIER_STAND_XZ.map((v, i) => BRAZIER_XZ[i] - v);
    await standFacing([off[0], report.stand[1] + 0.2, off[1]], BRAZIER_HEADINGS[0]);
    await setCycle(page, BRAZIER_CYCLE);
    await delay(SETTLE_MS);
    for (const heading of BRAZIER_HEADINGS) {
      await lb('look', { heading, pitch: 0 });
      await setCycle(page, BRAZIER_CYCLE);
      await delay(EYE_FRAME_MS);
      await shoot(`self-brazier-${heading}-${BRAZIER_CYCLE.toFixed(2)}.png`, { kind: 'brazier' });
    }
  }
}

/** The dragon arena (--sets dragon): wake the dragon over the lair once its ground is loaded, then each pose at each
 *  time, the camera framed on it (_lookbook.mjs dragonCameraPose). Each frame's verdict also requires the dragon up and
 *  held in the pose it names (dragonShotVerdict). */
async function shootDragon(page, report, dir, facts) {
  await page.evaluate((p) => window.__craftyLookbook.pose(p), dragonStreamPose());
  const until = Date.now() + STREAM_DRAGON_MS;
  let woke = null;
  let refusal = null;
  while (!woke && Date.now() < until) {
    const r = await page.evaluate(() => {
      try { return { woke: window.__craftyLookbook.dragon({ pose: 'rest' }) }; } catch (e) { return { why: String(e.message) }; }
    });
    woke = r.woke ?? null;
    refusal = r.why ?? null;
    if (!woke) await delay(1000);
  }
  if (!woke) {
    report.notes.push(`COULD NOT MEASURE the dragon arena: dragon() refused for ${STREAM_DRAGON_MS / 1000} s (${refusal})`);
    return;
  }
  report.dragonAt = woke.position;
  for (const shot of dragonShotPlan(undefined, CYCLES)) {
    const t0 = Date.now();
    await respawnIfDead(page, report);
    await page.evaluate((p) => window.__craftyLookbook.dragon(p), { pose: shot.pose, position: woke.position });
    // A camera whose sight line to the dragon clears the ground (_lookbook.mjs pickDragonView): the lair's ground is
    // hilly, and a column between the two filled a whole frame with one black block.
    const points = dragonSightPoints(woke.position);
    const heights = await page.evaluate((pts) => pts.map(([x, z]) => window.__craftyLookbook.groundAt({ x, z })), points);
    const ground = new Map(points.map(([x, z], i) => [`${x},${z}`, heights[i]]));
    const view = pickDragonView(woke.position, (x, z) => ground.get(`${x},${z}`) ?? null);
    report.dragonView = { turnDeg: Math.round((view.turn * 180) / Math.PI), clear: view.clear, camera: view.pose.position };
    await page.evaluate((p) => window.__craftyLookbook.pose(p), view.pose);
    await page.evaluate((radius) => window.__craftyLookbook.clearHostiles({ radius }), DRAGON_CLEAR_M);
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
    // What the scene holds under the dragon's group, read from the live scene graph (GameScene publishes the scene):
    // the seam's info() says the fight is on, not that its chunk mounted anything.
    const scene = await page.evaluate(() => {
      const g = window.__threeScene?.getObjectByName('crafty:dragon-chunk');
      if (!g) return { inScene: false };
      let meshes = 0;
      g.traverseVisible((o) => { if (o.isMesh) meshes += 1; });
      const body = g.children[0];
      return { inScene: true, meshes, at: body ? body.getWorldPosition(body.position.clone()).toArray() : null,
        camera: window.__threeCamera?.position.toArray() ?? null };
    });
    const v = dragonShotVerdict({ pose: shot.pose, cycle: shot.cycle, before, after, scene, sightClear: report.dragonView.clear });
    report.dragon.push({ ...shot, place: DRAGON_ARENA.id, valid: v.valid, why: v.why, dragonState: after.dragon, scene, ...facts(after, t0, pt) });
    console.log(`lookbook dragon ${report.id} ${shot.file}: ${v.valid ? 'valid' : `INVALID ${v.why.join('; ')}`}`);
  }
  await page.evaluate(() => window.__craftyLookbook.dragon({ pose: null }));
}

async function shootTarget(target, launchOpts, launchId) {
  const report = { id: target.id, engine: target.engine, launch: launchId, renderer: null, gpu: 'unknown', entry: null,
    shots: [], eye: [], clips: [], material: [], handShots: [], self: [], dragon: [], pointBlank: null, sights: null, stand: null, hands: null, notes: [],
    respawns: 0, console: {},
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
    await page.addInitScript(initScript, { touch: target.touch, firstSession: FIRST_SESSION });
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
    if (SETS.includes('eye') || SETS.includes('material') || SETS.includes('hands') || SETS.includes('self') || (SETS.includes('clips') && target.engine === 'chromium')) {
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
      // At rest is unhurt: a wound draws the low-health vignette and the damage flash over the whole frame, which are
      // not the HUD at rest; the store's own fields restore it.
      const healed = await page.evaluate(() => {
        const st = window.useGameStore.getState();
        if (!(st.maxHealth > 0) || st.playerHealth >= st.maxHealth) return false;
        window.useGameStore.setState({ playerHealth: st.maxHealth });
        return true;
      });
      // A returning player carries ember and coins, so the ember bar and the coin count are drawn (each hides at zero:
      // ui/EmberBar.jsx, HUD.jsx CoinReadout). Set to the same values for every frame, after clearHostiles, whose kills
      // bank ember. A first session (--first-session) gets them too, so its numbers bound a new player's from above.
      await page.evaluate((purse) => window.useGameStore.setState(purse), RETURNING_PURSE);
      await play(page);
      await setCycle(page, shot.cycle);
      await passTimes(page, { reset: true });
      await delay(EYE_FRAME_MS);
      const before = await info(page);
      const hud = await hudOn(page);
      const chrome = await shootWithChrome(page, join(dir, shot.file));
      const after = await info(page);
      const pt = await passTimes(page);
      // The twins are shot after the frame's own readings, so their extra seconds do not move the frame's clock: the
      // nameplate twin, then on a first session the card-up twin.
      const chromeTarget = await shootWithChrome(page, join(dir, shot.file.replace(/\.png$/, '-target.png')), { plate: NAMEPLATE });
      let chromeCard;
      if (FIRST_SESSION) {
        await page.evaluate(() => window.useGameStore.setState({ controlsCardDone: false, controlsCardMs: 0 }));
        await delay(600);
        chromeCard = await shootWithChrome(page, join(dir, shot.file.replace(/\.png$/, '-card.png')));
        chromeCard.card = await page.evaluate(() => !!document.querySelector('[data-testid="controls-card"]'));
        await page.evaluate(() => window.useGameStore.setState({ controlsCardDone: true }));
      }
      const v = eyeShotVerdict({ cycle: shot.cycle, heading: shot.heading, stand: report.stand, before, after, handsBaseline: report.hands?.hidden, hud });
      report.eye.push({ ...shot, valid: v.valid, why: v.why, ...facts(after, t0, pt), hud, chrome, chromeTarget, chromeCard, healed, heading: shot.heading,
        headingAtShot: after.heading, pitch: after.pitch, eye: after.eye, body: after.body, cameraNodes: after.cameraNodes,
        hostiles: after.hostiles, cleared,
        eyeAboveBody: after.eye && after.body ? Math.round((after.eye[1] - after.body[1]) * 1000) / 1000 : null });
    }

    // THE HANDS SET (_lookbook.mjs handPixelStats): the eye with the hands, then two frames through a pose at the same
    // eye and direction, which hides them. The pose twin must face where the eye did, or the pair is refused.
    const shootHands = async (label, cycle) => {
      const t0 = Date.now();
      await clearHostiles(page);
      await play(page);
      await setCycle(page, cycle);
      await delay(EYE_FRAME_MS);
      const a = await info(page);
      if (report.renderer === null && a.gl?.renderer) report.renderer = a.gl.renderer;
      const onBuf = await page.screenshot();
      const f = facing(a.heading, a.pitch ?? 0);
      const at = [a.eye[0] + f[0] * 10, a.eye[1] + f[1] * 10, a.eye[2] + f[2] * 10];
      await page.evaluate((p) => window.__craftyLookbook.pose(p), { position: a.eye, lookAt: at });
      await delay(800);
      const offBuf = await page.screenshot();
      const b = await info(page);
      await delay(400);
      const off2Buf = await page.screenshot();
      await page.evaluate(() => window.__craftyLookbook.clear());
      await delay(1200);
      const [on, off, off2] = [onBuf, offBuf, off2Buf].map((x) => PNG.sync.read(x));
      const stats = handPixelStats(on.data, off.data, off2.data, { width: on.width, height: on.height });
      const why = [];
      if (!a.isAlive) why.push('player dead');
      if (Math.abs((a.cycle ?? NaN) - cycle) > CYCLE_TOLERANCE) why.push(`clock at ${a.cycle}, asked ${cycle}`);
      const turn = Math.abs((((b.heading - a.heading) % 360) + 540) % 360 - 180);
      if (!(turn <= 0.5)) why.push(`pose twin faced ${b.heading}, the eye ${a.heading}`);
      if (Number.isFinite(a.pitch) && Number.isFinite(b.pitch) && Math.abs(a.pitch - b.pitch) > 0.5) why.push(`pose twin pitch ${b.pitch}, the eye ${a.pitch}`);
      const hidden = report.hands?.hidden;
      if (!(handCount(a) > hidden)) why.push(`hands not mounted at the eye (${handCount(a)} nodes; ${hidden} hidden)`);
      if (!(handCount(b) <= hidden)) why.push(`hands still mounted in the pose twin (${handCount(b)} nodes)`);
      if (stats.share < HAND_MASK.minShare) why.push(`COULD NOT MEASURE: ${stats.pixels} hand pixels, under ${HAND_MASK.minShare * 100}% of the frame`);
      writeFileSync(join(dir, `hands-${label}.png`), onBuf);
      writeFileSync(join(dir, `hands-${label}-hidden.png`), offBuf);
      const errs = log.filter((e) => e.t >= t0 && e.type !== 'warning');
      const shot = { label, cycle, cycleAtShot: a.cycle, heading: a.heading, pitch: a.pitch, twinHeading: b.heading,
        eye: a.eye, body: a.body, eyeAboveBody: a.eye && a.body ? Math.round((a.eye[1] - a.body[1]) * 1000) / 1000 : null,
        handNodes: handCount(a), twinHandNodes: handCount(b), size: [on.width, on.height], valid: why.length === 0, why,
        consoleErrors: errs.length, ...stats };
      report.handShots.push(shot);
      const n = (v) => (v == null ? '?' : v.toFixed(1));
      console.log(`lookbook hands ${target.id} ${label}: ${stats.pixels} px (${(stats.share * 100).toFixed(1)}%, ${stats.unstable} unstable) `
        + `mean ${n(stats.meanLuma)} median ${stats.medianLuma ?? '?'} rgb ${stats.meanRGB ? stats.meanRGB.map((x) => x.toFixed(0)).join('/') : '?'} `
        + `L/R ${stats.left}/${stats.right}${why.length ? ` INVALID: ${why.join('; ')}` : ''}`);
      return shot;
    };

    for (const c of SETS.includes('hands') && report.stand ? CYCLES : []) {
      await respawnIfDead(page, report);
      await page.evaluate((p) => window.__craftyLookbook.stand(p), { position: report.stand });
      await page.evaluate((h) => window.__craftyLookbook.look(h), { heading: HANDS_HEADING, pitch: 0 });
      await setCycle(page, c);
      await delay(SETTLE_MS);
      await shootHands(c.toFixed(2), c);
    }

    // POINT BLANK: the hands at a wall. The player is stood at the trunk sight (at least three blocks tall, so the
    // controller cannot step onto it, as it steps up a turf wall's terraces), shot there, then walks into the trunk
    // with a real W key until the controller stops them, and is shot again facing it. Then the turf-wall sight from its
    // stand, the frame W2-K's dark polygon was seen in.
    if (SETS.includes('hands') && report.stand && target.engine === 'chromium') {
      const sights = report.sights ?? await page.evaluate(findMaterialSights, { from: report.stand, standM: MATERIAL_STAND_M, minM: MATERIAL_MIN_M,
        ids: { grass: BLOCK_ID.grass, dirt: BLOCK_ID.dirt, wood: BLOCK_ID.wood } });
      const sight = sights.trunk;
      if (sights['turf-wall']) {
        const turf = sights['turf-wall'];
        await respawnIfDead(page, report);
        await page.evaluate((p) => window.__craftyLookbook.stand(p), { position: [turf.stand[0], turf.ground + 1.5, turf.stand[2]] });
        await restingBody(page);
        const aim = aimAt((await info(page)).eye, turf.target);
        await page.evaluate((h) => window.__craftyLookbook.look(h), { heading: aim.heading, pitch: 0 });
        await setCycle(page, CYCLES[0]);
        await delay(SETTLE_MS);
        await shootHands('turf-wall', CYCLES[0]);
      }
      if (!sight) {
        report.notes.push('COULD NOT MEASURE point blank: no trunk sight in the loaded mesh near the Hearth');
      } else {
        const c = CYCLES[0];
        await respawnIfDead(page, report);
        await page.evaluate((p) => window.__craftyLookbook.stand(p), { position: [sight.stand[0], sight.ground + 1.5, sight.stand[2]] });
        const rest = await restingBody(page);
        const aim = aimAt((await info(page)).eye, sight.target);
        await page.evaluate((h) => window.__craftyLookbook.look(h), { heading: aim.heading, pitch: 0 });
        await setCycle(page, c);
        await delay(SETTLE_MS);
        const far = await shootHands('wall-far', c);
        await play(page);
        await page.keyboard.down('KeyW');
        await delay(700);
        await page.keyboard.up('KeyW');
        const near = await restingBody(page);
        await page.evaluate((h) => window.__craftyLookbook.look(h), { heading: aim.heading, pitch: 0 });
        const close = await shootHands('wall-near', c);
        // The body's horizontal distance from the face plane, along the face's outward normal.
        const faceM = near ? (near[0] - sight.target[0]) * sight.normal[0] + (near[2] - sight.target[2]) * sight.normal[2] : null;
        const climbedM = rest && near ? near[1] - rest[1] : null;
        const atWall = faceM != null && faceM >= 0 && faceM <= 1 && climbedM != null && Math.abs(climbedM) < 0.5;
        if (!atWall) close.why.push(`not at the wall: body ${faceM?.toFixed(2)} m from the face, climbed ${climbedM?.toFixed(2)} m`);
        close.valid = close.why.length === 0;
        report.pointBlank = { sight, rest, near, faceM, climbedM, atWall, ratio: far.pixels > 0 ? close.pixels / far.pixels : null };
        console.log(`lookbook hands ${target.id} point blank: body ${faceM == null ? '?' : faceM.toFixed(2)} m from the face, `
          + `climbed ${report.pointBlank.climbedM?.toFixed(2)} m, hand pixels near/far ${close.pixels}/${far.pixels} = ${report.pointBlank.ratio?.toFixed(2)}`);
      }
    }

    if (SETS.includes('self') && report.stand) await shootSelf(page, report, dir, target);

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
      report.sights = await page.evaluate(findMaterialSights, { from: report.stand, standM: MATERIAL_STAND_M, minM: MATERIAL_MIN_M,
        ids: { grass: BLOCK_ID.grass, dirt: BLOCK_ID.dirt, wood: BLOCK_ID.wood } });
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

    // THE HUD SET (_lookbookHud.mjs): HOME and Mara a few degrees apart on the compass; the dusk warning in English and
    // in Chinese. Opt-in (`--sets hud`); it moves the player, so it runs after every set that stands at the Hearth.
    if (SETS.includes('hud') && report.stand) {
      await respawnIfDead(page, report);
      report.hud = await shootHudSet(page, dir, { prep: async () => { await clearHostiles(page); await play(page); },
        home: async () => { await standAndLook(EYE_HEADINGS[1]); } });
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
    if (SETS.includes('dragon')) await shootDragon(page, report, dir, facts);
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
    await page.addInitScript(initScript, { touch: false });
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
      // `mobs` and `moved` read whether the world ran at all: how many mobs there are, and how many stood somewhere
      // else at the previous sample. A build with the seam's read-only mob list (mobList, with ids) is read through it;
      // an older build, which kept a store mirror of the mobs (`mobEntities`) and may predate the list's ids, through that.
      const s = await page.evaluate(() => {
        const g = window.useGameStore.getState();
        const c = [...document.querySelectorAll('canvas')].sort((x, y) => y.width * y.height - x.width * x.height)[0];
        const seamMobs = window.__craftyLookbook?.mobs?.();
        const listed = Array.isArray(seamMobs) && seamMobs.every((m) => m.id != null) ? seamMobs : null;
        const mobs = (listed || g.mobEntities || []).filter((m) => m && m.position);
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

const PASS_SWITCH_MS = 800; // a pass switched: the merged pass recompiles and a few frames run before the window opens
const PASS_WINDOW_MS = 1500; // one window: about 90 frames at 60 fps
const PASS_CLEAR_M = 24; // hostiles cleared this far out before each window, so no fight runs through the block
const PASS_LOAD_WAIT_MS = 20 * 60 * 1000;

/** Wait (up to 20 min) until the 1-minute load is at most PASS_MAX_LOAD; returns the load and the seconds waited. */
async function loadBelowCap() {
  const t0 = Date.now();
  while (os.loadavg()[0] > PASS_MAX_LOAD && Date.now() - t0 < PASS_LOAD_WAIT_MS) await delay(15000);
  const load = os.loadavg()[0];
  return { load: Math.round(load * 100) / 100, waitedS: Math.round((Date.now() - t0) / 1000), ok: load <= PASS_MAX_LOAD };
}

const PASS_UTIL_MS = 2500; // the free-running window the GPU's utilization is read over
const PASS_UTIL_EVERY_MS = 200;

/** One `ioreg` read of the GPU's PerformanceStatistics (no root), or null. */
function readGpuUtil() {
  try {
    return parseGpuUtil(execFileSync('ioreg', ['-r', '-d', '1', '-w', '0', '-c', 'IOAccelerator'], { encoding: 'utf8', timeout: 2000 }));
  } catch {
    return null;
  }
}

/** The report's context on the game canvas, or null. */
const gameContext = (r, canvas) => (r?.contexts || []).find((c) => c.canvas && canvas && c.canvas[0] === canvas[0] && c.canvas[1] === canvas[1]) || null;

/** The driver's GPU utilization sampled over PASS_UTIL_MS while the page runs free (the timer counting frames only). */
async function utilWindow(page, canvasOf) {
  await passTimes(page, { mode: 'count', reset: true });
  const t0 = Date.now();
  const samples = [];
  while (Date.now() - t0 < PASS_UTIL_MS) {
    samples.push({ t: Date.now() - t0, util: readGpuUtil() });
    await delay(PASS_UTIL_EVERY_MS);
  }
  const r = await passTimes(page);
  const ctx = gameContext(r, canvasOf());
  const g = gpuMsPerFrame(samples, { frames: ctx?.frames, windowMs: ctx?.windowMs });
  return { u: g?.ms ?? null, uPct: g?.pct ?? null, uN: g?.n ?? 0, uFrames: ctx?.frames ?? null, uWindowMs: ctx?.windowMs ?? null,
    uSamples: samples.map((s) => [s.t, s.util?.device ?? null, s.util?.renderer ?? null, s.util?.tiler ?? null]) };
}

/**
 * Put the player back on the block's pose ({ stand, heading }) when a respawn or anything else moved them off it, so
 * every window of a block measures one view. Returns whether it had to.
 */
async function standBack(page, report, pose) {
  const respawned = await respawnIfDead(page, report);
  if (!respawned && poseWhy(await info(page), pose).length === 0) return false;
  await page.evaluate((p) => window.__craftyLookbook.stand(p), { position: pose.stand });
  await page.evaluate((h) => window.__craftyLookbook.look(h), { heading: pose.heading, pitch: 0 });
  await delay(SETTLE_MS);
  return true;
}

/** One measured window: the arm's passes off (or none), then (in frame mode) the GPU's utilization running free, then
 *  the timer in `mode` over PASS_WINDOW_MS. */
async function passWindow(page, report, { cycle, off, mode, pose }) {
  const stoodBack = await standBack(page, report, pose);
  await setCycle(page, cycle);
  await page.evaluate((radius) => window.__craftyLookbook.clearHostiles({ radius }), PASS_CLEAR_M);
  await play(page);
  const applied = await page.evaluate((o) => window.__craftyLookbook.passesOff(o), off);
  await delay(PASS_SWITCH_MS);
  let util = {};
  if (mode === 'frame') {
    const gl = (await info(page)).gl;
    util = await utilWindow(page, () => gl?.canvas);
    // The utilization window ran the clock about 3 s on; set it back so the timed window starts at the asked time and
    // the whole window stays within CYCLE_TOLERANCE of it (4.8 s of the 480 s day).
    await setCycle(page, cycle);
  }
  await passTimes(page, { mode, reset: true });
  await delay(PASS_WINDOW_MS);
  const r = await passTimes(page);
  const i = await info(page);
  const canvas = i.gl?.canvas;
  const ctx = gameContext(r, canvas);
  const q = windowMedian(r, 'frame', canvas), w = windowMedian(r, 'frame:wall', canvas);
  const why = passWindowWhy({ cycle, pose, at: i, chain: ctx?.chain, expectEffects: i.passesOff?.effects });
  if (!ctx) why.push('no composer on the game canvas');
  const readings = mode === 'frame' ? windowReadings({ q, w, util }) : { q: null, w: null, u: null, dropped: [] };
  return {
    applied, ...util, q: readings.q, w: readings.w, u: readings.u, dropped: readings.dropped, nQ: q?.n ?? 0, nW: w?.n ?? 0,
    frames: ctx?.frames ?? null, windowMs: ctx?.windowMs ?? null, disjoint: ctx?.disjoint ?? null, chain: ctx?.chain ?? null,
    segments: mode === 'segments' ? passSummary(r, canvas) : undefined,
    tier: i.tier, dpr: i.gl?.dpr ?? null, canvas, cycleAt: i.cycle, frameCap: i.frameCap, body: i.body, heading: i.heading,
    stoodBack, load: Math.round(os.loadavg()[0] * 100) / 100, valid: why.length === 0, why,
  };
}

const PASS_ALT_HALVES = 10;
const PASS_ALT_HALF_MS = 1500;
const PASS_ALT_EVERY_MS = 150;

/** The fast alternation (--alt): the arm off and on every PASS_ALT_HALF_MS through one window, the GPU's utilization
 *  read through each half, and each half's own frame count over the same post-lag span and its own window check
 *  (_lookbook.mjs altDifferential). */
async function altWindow(page, report, { cycle, off, pose }) {
  const stoodBack = await standBack(page, report, pose);
  await page.evaluate((radius) => window.__craftyLookbook.clearHostiles({ radius }), PASS_CLEAR_M);
  await play(page);
  await passTimes(page, { mode: 'count', reset: true });
  const halves = [];
  for (let i = 0; i < PASS_ALT_HALVES; i++) {
    const state = i % 2 === 0 ? 'on' : 'off';
    await setCycle(page, cycle);
    await page.evaluate((o) => window.__craftyLookbook.passesOff(o), state === 'off' ? off : []);
    const t0 = Date.now();
    const samples = [];
    let counting = false;
    while (Date.now() - t0 < PASS_ALT_HALF_MS) {
      const t = Date.now() - t0;
      // The frame count restarts where the utilization readings start counting, so both cover one span.
      if (!counting && t >= PASS_ALT_SKIP_MS) { await passTimes(page, { reset: true }); counting = true; }
      samples.push({ t, util: readGpuUtil() });
      await delay(PASS_ALT_EVERY_MS);
    }
    const r = await passTimes(page);
    const at = await info(page);
    const ctx = gameContext(r, at.gl?.canvas);
    const why = passWindowWhy({ cycle, pose, at, chain: ctx?.chain, expectEffects: at.passesOff?.effects });
    if (!ctx) why.push('no composer on the game canvas');
    if (!counting) why.push('the half ended before the lag did');
    halves.push({ state, samples, frames: ctx?.frames ?? null, windowMs: ctx?.windowMs ?? null, why,
      tier: at.tier, isAlive: at.isAlive, active: at.active, cycleAt: at.cycle });
  }
  const d = altDifferential(halves);
  return {
    d, stoodBack, load: Math.round(os.loadavg()[0] * 100) / 100,
    valid: d.dropped.length === 0, why: d.dropped,
    halves: halves.map((h) => ({ state: h.state, frames: h.frames, windowMs: h.windowMs, why: h.why, tier: h.tier,
      isAlive: h.isAlive, active: h.active, cycleAt: h.cycleAt, device: h.samples.map((s) => [s.t, s.util?.device ?? null]) })),
  };
}

/** The whole-frame differential (--passes): see the header. */
async function measurePasses(launchOpts, launchId) {
  const out = { target: PASS_TARGET, launch: launchId, renderer: null, stand: null, tierAtWarmup: null, respawns: 0,
    reps: PASS_REPS_RUN, arms: PASS_ARMS_RUN, blocks: [], looks: [], notes: [], pageErrors: [] };
  const report = out; // respawnIfDead counts on `.respawns`
  const dir = join(OUT, 'frames');
  mkdirSync(dir, { recursive: true });
  const b = await launch('chromium', launchOpts);
  try {
    const page = await (await b.newContext(contextOptions(PASS_TARGET))).newPage();
    page.on('pageerror', (e) => out.pageErrors.push(String(e.message).slice(0, 200)));
    await page.addInitScript(initScript, { touch: false });
    await page.goto(`${url}/?lookbook=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    if (!(await page.waitForFunction(() => !!window.__craftyLookbook?.passesOff, null, { timeout: 30000 }).then(() => true, () => false))) {
      out.notes.push('COULD NOT MEASURE: this build has no passesOff on its lookbook seam');
      return out;
    }
    await delay(TITLE_WAIT_MS);
    const built = await page.waitForFunction(() => window.__craftyLookbook.info().worldBuilt, null, { timeout: WORLD_TIMEOUT_MS, polling: 1000 })
      .then(() => true, () => false);
    if (!built) { out.notes.push('COULD NOT MEASURE: the world never built'); return out; }
    if (!(await holdActive(page)).held) { out.notes.push('COULD NOT MEASURE: the input gate never held live'); return out; }
    await delay(WARMUP_MS);
    const warm = await info(page);
    out.renderer = warm.gl?.renderer ?? null;
    out.tierAtWarmup = warm.tier;
    const rendererProblem = passRendererProblem(out.renderer, { allowSoftware: ALLOW_SOFTWARE });
    if (rendererProblem) { out.notes.push(`COULD NOT MEASURE: ${rendererProblem}`); return out; }
    if (warm.tier !== 'high') {
      // The tier this machine selects (render/quality.js selectTier) and holds while the frame rate does.
      await page.evaluate(() => window.useGameStore.getState().setQualityTier('high'));
      out.notes.push(`the governor had the tier at ${warm.tier} after warm-up; set to high`);
      await delay(SETTLE_MS);
    }
    await passTimes(page);
    await respawnIfDead(page, report);
    out.stand = await restingBody(page);
    if (!out.stand) { out.notes.push('COULD NOT MEASURE: the player never came to rest'); return out; }
    const face = async (time) => {
      await setCycle(page, time.cycle);
      await delay(SETTLE_MS);
      const sun = (await info(page)).sun;
      const heading = time.face === 'sun' && sun ? Math.round(sun.heading) : 0;
      await page.evaluate((p) => window.__craftyLookbook.stand(p), { position: out.stand });
      await page.evaluate((h) => window.__craftyLookbook.look(h), { heading, pitch: 0 });
      await setCycle(page, time.cycle);
      await delay(SETTLE_MS);
      return { heading, sun };
    };
    for (const time of PASS_TIMES_RUN) {
      const gate = await loadBelowCap();
      if (!gate.ok) { out.notes.push(`COULD NOT MEASURE ${time.id}: the load stayed at ${gate.load} for ${gate.waitedS} s`); continue; }
      const { heading, sun } = await face(time);
      const pose = { stand: out.stand, heading };
      const block = { time: time.id, cycle: time.cycle, heading, sun, loadAtStart: gate.load, waitedS: gate.waitedS,
        startedAt: new Date().toISOString(), segments: [], windows: [] };
      console.log(`  ${time.id} (cycle ${time.cycle}, facing ${heading}, sun ${sun ? `${Math.round(sun.heading)} at ${sun.elevationDeg.toFixed(1)} deg` : '?'}), load ${gate.load}`);
      if (PASS_ALT) {
        block.alt = [];
        for (let rep = 0; rep < PASS_ALT_REPS; rep++) {
          for (const arm of [...PASS_ARMS_RUN, PASS_CONTROL]) block.alt.push({ arm: arm.id, rep, ...(await altWindow(page, report, { cycle: time.cycle, off: arm.off, pose })) });
        }
        await page.evaluate(() => window.__craftyLookbook.passesOff([]));
        block.endedAt = new Date().toISOString();
        block.loadAtEnd = Math.round(os.loadavg()[0] * 100) / 100;
        for (const arm of [...PASS_ARMS_RUN, PASS_CONTROL]) {
          const runs = block.alt.filter((x) => x.arm === arm.id);
          // A half the window check refused is already out of its pairs (altDifferential).
          const d = runs.flatMap((x) => x.d.u.values);
          const dropped = runs.flatMap((x) => x.d.dropped);
          const f = (x) => (x == null || !Number.isFinite(x) ? '-' : x.toFixed(2));
          console.log(`    alt ${arm.id.padEnd(12)} dU ${f(medianOf(d))} [${f(Math.min(...d))}..${f(Math.max(...d))}] (${d.filter((x) => x > 0).length}/${d.length} +) of ${f(medianOf(runs.map((x) => x.d.onU).filter((x) => x !== null)))}${dropped.length ? `; ${dropped.length} half(s) dropped: ${dropped.slice(0, 3).join(' | ')}` : ''}`);
        }
        out.blocks.push(block);
        writeFileSync(join(OUT, 'passes.json'), JSON.stringify({ ...passBase, passes: out }, null, 2));
        continue;
      }
      // The segments check: segment mode, everything on, each beside a whole-frame window, three times.
      for (let i = 0; i < 3; i++) {
        const seg = await passWindow(page, report, { cycle: time.cycle, off: [], mode: 'segments', pose });
        const whole = await passWindow(page, report, { cycle: time.cycle, off: [], mode: 'frame', pose });
        block.segments.push({ segments: seg, whole });
      }
      for (const w of passWindowPlan([...PASS_ARMS_RUN, PASS_CONTROL], PASS_REPS_RUN)) {
        block.windows.push({ ...w, ...(await passWindow(page, report, { cycle: time.cycle, off: w.off, mode: 'frame', pose })) });
      }
      await page.evaluate(() => window.__craftyLookbook.passesOff([]));
      block.endedAt = new Date().toISOString();
      block.loadAtEnd = Math.round(os.loadavg()[0] * 100) / 100;
      // Q cannot be GPU execution time in a window where it outlasts the synced wall clock that brackets it.
      block.qOverW = block.windows.filter((x) => Number.isFinite(x.q) && Number.isFinite(x.w) && x.q > x.w).length;
      block.admitted = admittedInstruments(passDifferential(block.windows, PASS_CONTROL.id), { qOverW: block.qOverW });
      const invalid = block.windows.filter((x) => !x.valid);
      console.log(`    instruments admitted by the control: ${JSON.stringify(block.admitted)}; windows with Q > W: ${block.qOverW} of ${block.windows.length}; invalid windows ${invalid.length}${invalid.length ? ` (${[...new Set(invalid.flatMap((x) => x.why))].slice(0, 4).join('; ')})` : ''}`);
      block.verdicts = [...PASS_ARMS_RUN, PASS_CONTROL].map((a) => {
        const d = passDifferential(block.windows, a.id);
        return { arm: a.id, ...d, verdict: passVerdict(d, block.admitted) };
      });
      for (const v of block.verdicts) {
        const f = (x) => (x == null ? '-' : x.toFixed(2));
        console.log(`    ${v.arm.padEnd(12)} dU ${f(v.u.median)} [${f(v.u.min)}..${f(v.u.max)}] (${v.u.positive}/${v.u.n} +) of ${f(v.onU)}  dQ ${f(v.q.median)} [${f(v.q.min)}..${f(v.q.max)}] of ${f(v.onQ)}  dW ${f(v.w.median)} [${f(v.w.min)}..${f(v.w.max)}] of ${f(v.onW)}  ${v.verdict.material ? 'MATERIAL' : `not material: ${v.verdict.why.join('; ')}`}`);
      }
      out.blocks.push(block);
      writeFileSync(join(OUT, 'passes.json'), JSON.stringify({ ...passBase, passes: out }, null, 2));
    }
    // The look pairs, after the measurement so no screenshot falls inside a window.
    for (const pair of PASS_ALT ? [] : PASS_LOOK_PAIRS) {
      const time = PASS_TIMES.find((t) => t.id === pair.time);
      const arm = PASS_ARMS.find((a) => a.id === pair.arm);
      if (!PASS_TIMES_RUN.includes(time)) continue;
      const { heading } = await face({ ...time, face: pair.face });
      for (const state of ['on', 'off']) {
        await respawnIfDead(page, report);
        await setCycle(page, time.cycle);
        await page.evaluate((radius) => window.__craftyLookbook.clearHostiles({ radius }), PASS_CLEAR_M);
        await play(page);
        await page.evaluate((o) => window.__craftyLookbook.passesOff(o), state === 'off' ? arm.off : []);
        await delay(PASS_SWITCH_MS + 700);
        const file = `${pair.time}-${String(heading).padStart(3, '0')}-${pair.arm.replace('+', '-')}-${state}.jpg`;
        await page.screenshot({ path: join(dir, file), type: 'jpeg', quality: 86, scale: 'css' });
        const i = await info(page);
        out.looks.push({ ...pair, heading, state, file: `frames/${file}`, cycleAt: i.cycle, tier: i.tier, isAlive: i.isAlive, active: i.active });
      }
    }
    await page.evaluate(() => window.__craftyLookbook.passesOff([]));
    return out;
  } finally {
    await close(b);
  }
}
let passBase = null;

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
  const git = (args) => { try { return execFileSync('git', args, { encoding: 'utf8' }); } catch { return null; } };
  // The commit is the CHECKOUT's at run time, marked dirty with the paths that differ from it, since a probe edited
  // after the commit is not the probe that commit names. With --build-dir the served build may come from another
  // commit, so the index chunk's content hash is the build's real identity.
  return { buildDir: BUILD_DIR, indexChunk: chunk, ...checkoutState(git(['rev-parse', '--short', 'HEAD']), git(['status', '--porcelain'])) };
}

let code = 0;
try {
  await waitReady();
  await assertServedBuild();
  const report = { generatedAt: new Date().toISOString(), url, build: buildIdentity(), sets: SETS, chromiumCandidates: null, targets: [] };
  holdBase = report;
  passBase = report;

  let chromiumLaunch = null, chromiumLaunchId = null;
  if (PASSES || HOLD_S > 0 || WANT.some((id) => id.startsWith('chromium'))) {
    if (HEADED) {
      chromiumLaunch = { channel: 'chromium', headless: false };
      chromiumLaunchId = 'headed';
    } else {
      const r = await resolveChromium({ launch, close });
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

  if (PASSES) {
    if (!chromiumLaunch) throw new Error('no Chromium launch gives a hardware renderer (pass --allow-software to measure SwiftShader)');
    report.loadAtStart = Math.round(os.loadavg()[0] * 100) / 100;
    const r = await measurePasses(chromiumLaunch, chromiumLaunchId);
    report.loadAtEnd = Math.round(os.loadavg()[0] * 100) / 100;
    writeFileSync(join(OUT, 'passes.json'), JSON.stringify({ ...report, passes: r }, null, 2));
    console.log(`  GL renderer   ${r.renderer} (${classifyRenderer(r.renderer)}); tier at warm-up ${r.tierAtWarmup}; respawns ${r.respawns}; page errors ${r.pageErrors.length}`);
    for (const n of r.notes) console.log(`  ${n}`);
    console.log(`passes: ${join(OUT, 'passes.json')}`);
    if (r.notes.some((n) => n.startsWith('COULD NOT MEASURE')) || r.blocks.length === 0) code = 3;
  } else if (HOLD_S > 0) {
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
      console.log(`  GL renderer   ${r.renderer} (${r.gpu})`);
      console.log(`  entered by    ${r.entry}`);
      for (const line of targetSummaryLines(r, {
        hero: SETS.includes('hero') ? shotPlan(LOOKBOOK_PLACES, CYCLES).length : 0,
        eye: SETS.includes('eye') ? eyeShotPlan(EYE_HEADINGS, CYCLES).length : 0,
        material: SETS.includes('material') ? materialShotPlan(MATERIAL_SIGHT_KINDS, CYCLES).length : 0,
        dragon: SETS.includes('dragon') ? dragonShotPlan(undefined, CYCLES).length : 0,
      })) console.log(line);
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
