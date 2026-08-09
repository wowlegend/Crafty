// Spawns `vite dev`, drives the app to known states via window.__craftyTest
// (DEV-only bridge), and screenshots each to tests/visual/<current|baseline>/<state>.png.
// Reachable states today: menu, explore-day, explore-night (dusk), boss-obsidian,
// character-closeup, boss-closeup.
// Per spec §4, dusk IS the everyday night, so `explore-night` already covers the dusk
// state; `boss-obsidian` (Tier 2) is the genuinely new danger mood.
//
// Determinism: `enterCapture` flips the dev-only capture-determinism layer ON before any
// frame is taken — seeded decorative RNG, paused physics, a pinned follow-cam pose, and
// suppressed mob spawns — so each state renders byte-stable across runs (self-diff < 1%).
// Capture mode also suppresses the auto-pointer-lock, keeping the menu overlay visible
// until we explicitly `start`, so the `menu` frame is the real title screen.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { assertSubjectOnScreen, waitForStableFrame } from './_probe.mjs';
import { ELEMENT_COLOR } from '../../src/render/beastAvatarParts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..'); // frontend/
const isBaseline = process.argv.includes('--baseline');
const OUT = resolve(ROOT, 'tests/visual', isBaseline ? 'baseline' : 'current');
// FAIL-LOUD sentinel (item #12): invalidated to complete:false at capture START, re-written
// complete:true ONLY at a clean (crash-free) end -> diff.test.js refuses to run on a stale/partial/
// crashed capture instead of silently diffing pre-failure frames. See src/devtest/captureFreshness.js.
const META = resolve(OUT, '.capture-meta.json');
const PORT = 4178;
const URL = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Await N rendered animation frames in-page so the GPU has actually presented the
// settled scene (shadow map + mesh uploads) before a screenshot is taken. Deterministic
// frame-count wait rather than a wall-clock guess.
async function flushFrames(page, n = 8) {
  // DO NOT "FIX" A HANG HERE BY RACING THIS AGAINST A setTimeout. If rAF is not firing, the renderer is
  // not presenting anything, so a wall-clock fallback would let the run continue and screenshot blank or
  // stale frames — a GREEN visual gate over pictures of nothing, which is worse than the hang. The bounded
  // check is assertBrowserProducesFrames() below, which aborts the run instead of degrading it.
  await page.evaluate(async (count) => {
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    for (let i = 0; i < count; i++) await raf();
  }, n);
}

/**
 * PREFLIGHT: can this browser produce a frame at all?
 *
 * On 2026-08-02 the gate failed for hours with `ProtocolError: Runtime.callFunctionOn timed out` and no
 * other output, and was misdiagnosed three times — as machine load, then as a code regression, then as a
 * broken Chrome install. It was none of those. Chrome launched, ran JS, and created a WebGL 2.0 context
 * happily; what was dead was FRAME PRODUCTION. requestAnimationFrame fired 0 times in 2s, and
 * Page.captureScreenshot hung on a two-line data: URL with no app involved, under every combination of
 * --use-angle=swiftshader / --disable-gpu / --disable-gpu-compositing / --in-process-gpu / --single-process
 * / old headless. An OS-level compositor problem, cured by a reboot, not by anything in this repo.
 *
 * The cost was never the outage — it was that the failure was ILLEGIBLE. flushFrames() awaits rAF inside a
 * page.evaluate, so a dead rAF means that evaluate never returns and puppeteer's DEFAULT 180s
 * protocolTimeout eventually reports a generic CDP timeout, pointing at nothing. Three minutes of silence
 * then a stack trace into puppeteer internals.
 *
 * This asks the question directly, in under two seconds, before any state is captured. It cannot itself
 * hang: the in-page promise carries a setTimeout escape hatch, and setTimeout keeps working when rAF does
 * not (that asymmetry is exactly what made the diagnosis possible).
 *
 * The bar is deliberately the weakest one that still detects total death — ONE frame. Anything stricter
 * would risk blocking a capture on a merely slow machine, which is the failure mode this file has already
 * been bitten by twice.
 */
export async function assertBrowserProducesFrames(page) {
  const frames = await page.evaluate(
    () =>
      new Promise((res) => {
        let n = 0;
        const stop = Date.now() + 1200;
        const tick = () => {
          n++;
          if (Date.now() < stop) requestAnimationFrame(tick);
          else res(n);
        };
        requestAnimationFrame(tick);
        setTimeout(() => res(n), 1800); // ALWAYS resolves, even if rAF never fires
      })
  );
  if (frames === 0) {
    throw new Error(
      'CAPTURE ABORTED — this browser is not producing frames.\n' +
        '    requestAnimationFrame fired 0 times in 1.2s, so nothing renders and every screenshot would be\n' +
        '    blank or stale. This is an ENVIRONMENT fault, not a code regression: it reproduces on a bare\n' +
        '    data: URL with no app loaded.\n' +
        '    Confirm with:  node -e "import(\'puppeteer\').then(async p=>{const b=await p.launch({headless:true});' +
        'const g=await b.newPage();await g.goto(\'data:text/html,hi\');console.log(await g.screenshot({encoding:\'base64\'}).then(s=>s.length).catch(e=>\'HANG\'));await b.close()})"\n' +
        '    A REBOOT is the known fix. Reinstalling Chrome for Testing does not help — the binary runs JS\n' +
        '    and creates WebGL contexts fine; it is the compositor that is wedged.'
    );
  }
  return frames;
}

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
  try { const r = await fetch(url); if (r.ok) return; } catch {}
    await delay(250);
  }
  throw new Error('dev server did not start');
}

// Terrain chunks stream in asynchronously after `start`; capturing mid-stream yields a
// different partial-terrain frame each run. Poll the generated-chunk count until it stops
// growing (stable across consecutive polls) so the world is fully meshed before screenshot.
//
// NOTE: chunk COUNT stabilizing is necessary but NOT sufficient — the meshes for the last
// chunks keep building/swapping in for a beat after the count freezes, so a ridge silhouette
// against the sky can still differ run-to-run (~0.4% self-diff). We therefore require a
// LONGER count-stable streak (stableFor=6) and then WAIT ON THE FRAME ITSELF (below).

/**
 * Take a gated frame — but only once the frame has actually stopped changing.
 *
 * WHY EVERY SHOT AND NOT JUST AFTER THE TERRAIN WAIT. `c472533` replaced a fixed `delay(2500)` with a
 * condition and took `explore-day`'s run-to-run self-diff from 1.646% to 0.083%. A RESIDUAL stayed at
 * 0.201% after S9, above the < 0.15% that slice's plan set, and cropping the diff found the same
 * mechanism one layer down: run 1 carried a distant tree canopy run 2 lacked. The stability check lived
 * inside `waitForStableTerrain`, but every state then moves the camera and sleeps ~900ms before its
 * screenshot — and a chunk landing in THAT gap is unguarded. The wait was in the right shape and the
 * wrong place.
 *
 * There were 27 individual `page.screenshot` call sites (producing 31 gated frames -- two of them loop
 * over the elements) and no shared helper, which is why the guard could
 * be in the file and still not cover the moment that matters. One door now, so a new state cannot be
 * added that silently skips it (asserted by tests/scripts/capture-preflight.test.js).
 */
// Module scope so `shot` can reach them: a per-shot GL check has to record into the same bucket the
// end-of-run summary reads, and `shot` is the one door every gated frame goes through.
const fatalGl = [];
const FATAL_GL_RE = /THREE\.WebGLProgram: Shader Error|WebGL context lost|CONTEXT_LOST_WEBGL|Error linking program|shader compilation/i;
let captureStage = 'boot';

async function shot(page, name) {
  await waitForStableFrame(page, { needStable: 2, interval: 200, max: 25, floor: 120 });
  // A LOST CONTEXT IS A BLANK OBJECT, NOT A BLANK FRAME — so it can sit far under the 6% gate and pass.
  // Checked at the one door every gated frame passes through, immediately before the pixels are written,
  // because a context lost after the previous shot and before this one belongs to THIS frame.
  const lost = await page.evaluate(() => (window.__glLost || []).slice()).catch(() => []);
  if (lost.length) {
    fatalGl.push({ stage: captureStage, msg: `WebGL context lost on [${lost.join(', ')}] before ${name}` });
    await page.evaluate(() => { window.__glLost = []; }).catch(() => {});
  }
  await page.screenshot({ path: resolve(OUT, name) });
}

async function waitForStableTerrain(page, { interval = 300, stableFor = 6, max = 60, settle = 2500 } = {}) {
  let last = -1;
  let stable = 0;
  for (let i = 0; i < max; i++) {
    const size = await page.evaluate(() => {
      const g = window.useGameStore.getState().getGeneratedChunks;
      return g ? g().size : -1;
    });
    if (size === last && size > 0) {
      if (++stable >= stableFor) break;
    } else {
      stable = 0;
      last = size;
    }
    await delay(interval);
  }
  // Post-stable settle: let the final chunk meshes finish uploading/swapping so the silhouette is
  // identical across runs. `settle` is now a CEILING on how long that is allowed to take, not the
  // duration itself — the frame comparator decides when it is actually done.
  await waitForStableFrame(page, { max: Math.ceil(settle / 250) + 24 });
}

async function main() {
  // states whose SUBJECT was absent -> skipped frames. Collected so the run can fail at the END
  // without aborting the other 27 states or a re-baseline mid-flight.
  const subjectFailures = [];
  mkdirSync(OUT, { recursive: true });
  // Invalidate the freshness sentinel up front: if this run crashes / times out / is aborted, the
  // sentinel stays complete:false so an isolated `diff.test.js` run FAILS LOUD on the stale frames
  // (the iter-105 hole). Re-written complete:true at the clean end below.
  const runStartedAt = Date.now();
  writeFileSync(META, JSON.stringify({ startedAt: runStartedAt, complete: false }));
  // Page-error observability (the silent-crash hole): an uncaught render-loop throw used to
  // freeze the R3F canvas so every later 3D fixture screenshotted the SAME frozen frame — the
  // diff gate then passed on STALE/wrong frames (it hid 3 crashes for 6 iters: iter 159/160
  // lookSensitivity + MagicWand, iter 161 the _trailDir freeze). `crashes` = uncaught exceptions
  // (these FREEZE the loop → FAIL the gate); `consoleErrs` = React dev warnings (logged, non-fatal).
  // Declared out here (not in the try) so the post-finally summary can read them.
  const crashes = [];
  const consoleErrs = [];
  // `fatalGl` / `FATAL_GL_RE` / `captureStage` live at module scope (above `shot`) — a THIRD bucket, and
  // the one nothing caught. A shader that fails to LINK renders nothing for that object; a lost context
  // renders nothing at all. Either sits far under the 6% gate on most frames, so today it is a green gate
  // plus a printed warning nobody reads. These are fatal by definition: the frame does not depict the scene.
  fatalGl.length = 0;
  captureStage = 'boot';
  // detached: the vite child runs in its OWN process group so the finally can SIGKILL the whole group
  // (process.kill(-pid)). A plain server.kill() only reaps the `npx` wrapper and ORPHANS the vite child.
  const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--no-open'], { cwd: ROOT, stdio: 'ignore', detached: true });
  // `headless: true` — NOT the legacy `'new'`. The installed puppeteer types declare
  // `headless?: boolean | 'shell'`; `'new'` is off-contract and survives only via an internal
  // `headless === 'shell' ? ... : '--headless=new'` ternary. If that is ever tightened to
  // `headless === true ? ...`, `'new'` silently routes to OLD headless — a real pixel-shifting change
  // that would land as a mass baseline break with no error to explain it.
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  try {
    const page = await browser.newPage();
    // Catch context loss WITHOUT touching getContext(). Probing a canvas with getContext() would CREATE
    // a context on any canvas that lacks one, perturbing the very thing being measured. `webglcontextlost`
    // does not bubble, but the CAPTURE phase runs window -> document -> target, so a capture-phase
    // listener on document sees it. Installed before navigation so nothing is missed during boot.
    await page.evaluateOnNewDocument(() => {
      window.__glLost = [];
      document.addEventListener('webglcontextlost', (e) => {
        const el = e.target;
        window.__glLost.push(
          (el && (el.getAttribute?.('data-testid') || el.id || el.className)) || 'canvas'
        );
      }, true);
    });
    page.on('pageerror', (err) => {
      crashes.push({ stage: captureStage, msg: String(err && err.message || err) });
      console.error(`PAGEERROR [@${captureStage}]: ${err && err.stack ? err.stack : err}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const t = msg.text();
        consoleErrs.push({ stage: captureStage, msg: t });
        if (FATAL_GL_RE.test(t)) fatalGl.push({ stage: captureStage, msg: t });
        console.error(`CONSOLE.ERROR [@${captureStage}]: ${t}`);
      }
    });
    await page.setViewport({ width: 1280, height: 800 });
    // Before anything else: prove the browser can present a frame. Cheap (<2s), and it converts a silent
    // 180s CDP timeout into a named cause. Runs on the default about:blank, so a failure here is provably
    // about the BROWSER and not about this app.
    const preflightFrames = await assertBrowserProducesFrames(page);
    console.log(`preflight: browser produced ${preflightFrames} frames in 1.2s`);
    await waitForServer(URL);
    await page.goto(URL, { waitUntil: 'networkidle2' });
    await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });

    // Enter the capture-determinism layer BEFORE any frame: seeded RNG + paused
    // physics/clock + pinned camera + suppressed mobs + suppressed auto-pointer-lock.
    await page.evaluate(() => window.__craftyTest.call('enterCapture', {}));
    // Let the spawn chunk stream in (world builds) while the menu overlay stays up.
    await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
    await delay(1500);

    // menu (title screen — pointer still unlocked, auto-lock suppressed by capture mode).
    // The title now hosts a full-bleed live 3D Hearth diorama VISTA (W2 — lazy chunk + WebGL),
    // which replaced the old fixed-size 2D-canvas TitleMascot lockup. Wait for the DIORAMA canvas
    // to actually mount + present a settled (capture-frozen) frame so `menu.png` is deterministic
    // and never screenshots the empty Suspense fallback.
    // The WebGL canvas inits slowly; under heavy machine load even 45s can flake. Make it
    // NON-FATAL (graceful degradation): if it times out, SKIP menu.png (keep the last-good frame) and
    // CONTINUE the run so the other states + any re-baseline still capture, instead of aborting everything.
    let menuMascotOk = true;
    await page.waitForFunction(() => !!document.querySelector('[data-testid="title-diorama"] canvas'), { timeout: 45000 })
      .catch(() => { menuMascotOk = false; console.warn('WARN: menu diorama canvas not ready in 45s -> skipping menu.png (kept last-good), continuing'); });
    if (menuMascotOk) {
      await flushFrames(page, 10);
      await delay(900);
      await shot(page, 'menu.png');
      console.log('captured menu');
    }

    // explore-day: start (locks pointer, dismisses menu), wait for terrain to fully
    // stream + mesh (so the frame is byte-stable across runs), then force midday.
    await page.evaluate(() => window.__craftyTest.call('start'));
    await waitForStableTerrain(page);
    await delay(800);
    // Place the player DETERMINISTICALLY before anything is shot. Without this the body freezes wherever
    // its spawn-settle happened to be when `enterCapture` landed — 100 (never ran) / 120 (SPAWN_FREEZE_Y)
    // / ~53 (settled) were all observed on the SAME code, and every position-dependent state inherited
    // that. Retry a few times: the ground probe needs origin chunks, and the hook says so rather than
    // guessing. Loud on failure — a silent skip here re-creates the exact class of bug this fixes.
    // Retry while the ground probe warms up (it needs streamed origin chunks), then FORCE the documented
    // SPAWN_FALLBACK_Y landing on the last attempt. Forcing matters: giving up left the player at whatever
    // transform it happened to hold, and two runs then agreed on it by accident — determinism by shared
    // failure, which reads exactly like success in the diff. A fallback that is TAKEN is deterministic; a
    // fallback that is never reached is a coin toss.
    let settled = null;
    for (let i = 0; i < 12; i++) {
      if (i) await delay(500);
      const force = i === 11; // last attempt: take the fallback rather than give up
      settled = await page.evaluate((f) => window.__craftyTest.call('settlePlayerToGround', { force: f }), force);
      if (settled && settled.retry) continue;
      break;
    }
    if (!settled || settled === false) console.warn('WARN: settlePlayerToGround could not run (no player body) -> position NON-DETERMINISTIC this run');
    else if (settled.retry) console.warn(`WARN: settle still unresolved after 12 tries -> ${settled.reason} (physicsY=${settled.physicsY}, probe=${settled.probeAvailable}, blocks=${settled.blocks}) -> position NON-DETERMINISTIC`);
    else if (!settled.visual) console.warn(`WARN: physics settled at y=${settled.y} but the VISUAL anchor was missing -> backdrop NOT deterministic`);
    else console.log(`player settled at y=${settled.y} via ${settled.source} (physics + visual)`);
    await flushFrames(page, 4);
    await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5));
    await delay(1500);
    await shot(page, 'explore-day.png');
    console.log('captured explore-day');

    // hearth: the World-M1 Home Anchor (the crafted origin plinth + lodge + brazier). The
    // default diorama camera frames the DISTANT vista, so the Hearth at origin needs its OWN pose
    // — a high 3/4 looking down at the pad. W2-T7 FLUSHED the pad (HEARTH_Y 56 -> 51), so the lookAt
    // dropped [0,56,0] -> [0,51,0] and the camera height dropped proportionally (86 -> 81) to keep
    // the same framing of the now-lower pad. Override for this shot only, then RESTORE below.
    await page.evaluate(() => window.__craftyTest.call('enterCapture', { camera: { position: [13, 81, 13], lookAt: [0, 51, 0] } }));
    await flushFrames(page, 10);
    await delay(900);
    await shot(page, 'hearth.png');
    console.log('captured hearth');

    // biome-snow: the World-M4a snow PINES. A solid snowfield sits ~40 blocks toward -z from origin
    // (probed: [0,-40], ~95% snow, avgY 54) but it's off the diorama frame, so the feature needs its
    // own pose — a high 3/4 over the snowfield. Camera-override for this shot, restored below.
    await page.evaluate(() => window.__craftyTest.call('enterCapture', { camera: { position: [20, 82, -20], lookAt: [0, 54, -40] } }));
    await flushFrames(page, 10);
    await delay(900);
    await shot(page, 'biome-snow.png');
    console.log('captured biome-snow');

    // ocean-depth: the World-M5a water depth-tint. The tint shades water by world-Y, so it's
    // INVISIBLE on the flat top surface (all at SEA_LEVEL) — it reads underwater + at shore faces.
    // W2-T7 de-island pushed the coast out (threshold -0.15 -> -0.35), so the old x-40 basin is now
    // LAND. Re-probed the new shore->deep RAMP at x-100..-128 (seabed drops y29 -> y9): an underwater
    // pose looking DOWN the slope shows the seabed receding into the deepening navy depth-tint with the
    // Gerstner surface above. (The far flat basin at x-135 reads as a featureless sandy flat — the ramp
    // is where the depth gradient actually reads.)
    await page.evaluate(() => window.__craftyTest.call('enterCapture', { camera: { position: [-100, 26, 20], lookAt: [-128, 10, -10] } }));
    await flushFrames(page, 10);
    await delay(900);
    await shot(page, 'ocean-depth.png');
    console.log('captured ocean-depth');

    // ocean-coast: pixel-gates the ocean S1-S3 SURFACE work (shore FOAM + the shallow-teal -> deep-navy
    // top-surface depth grade) that ocean-depth (an underwater pose) and the other cameras never frame.
    // W2-T7 de-island moved the coast out: the -X shoreline now sits at x~-90..-110 (foam onset x-80,
    // deep basin x-120+). A high 3/4 over that NEW shoreline shows the foam line at the coast + the
    // shallow->deep grade from above. Camera-override, restored below (before the downstream diorama states).
    await page.evaluate(() => window.__craftyTest.call('enterCapture', { camera: { position: [-60, 78, 40], lookAt: [-110, 22, -6] } }));
    await waitForStableTerrain(page, { stableFor: 6, settle: 2500 });
    await flushFrames(page, 10);
    await delay(900);
    await shot(page, 'ocean-coast.png');
    console.log('captured ocean-coast');

    // landmark: the World-M6 signature silhouettes. Probed nearest LAND landmark = a Sky-arch at
    // [40,-88] (baseY 41 -> top 92). A 3/4 pose ~66 units back frames the full arch clearing the
    // terrain against the sky. Off the diorama frame -> needs its own pose. Camera-override, restored below.
    await page.evaluate(() => window.__craftyTest.call('enterCapture', { camera: { position: [85, 62, -40], lookAt: [40, 70, -88] } }));
    await waitForStableTerrain(page, { stableFor: 6, settle: 2500 });
    await flushFrames(page, 10);
    await delay(900);
    await shot(page, 'landmark.png');
    console.log('captured landmark');
    // restore the default diorama pose for the downstream world states (explore tiers, night, studio cards)
    await page.evaluate(() => window.__craftyTest.call('enterCapture', { camera: { position: [0, 70, 24], lookAt: [0, 64, -66] } }));
    await flushFrames(page, 6);

    // === mobile (touch overlay) — the FIRST baseline that renders the touch UI (M2) ===
    // showTouch opts the overlay IN under capture (default-off keeps the 17 other frames null); a
    // phone-portrait viewport frames the S1-C thumb cluster over the diorama world. Restore the
    // 1280x800 viewport + showTouch:false afterward so the downstream tier/night/studio frames match.
    await page.setViewport({ width: 402, height: 874, deviceScaleFactor: 2 });
    await page.evaluate(() => window.__craftyTest.call('enterCapture', { showTouch: true }));
    await flushFrames(page, 8);
    await delay(400);
    await shot(page, 'mobile.png');
    console.log('captured mobile');
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluate(() => window.__craftyTest.call('enterCapture', { showTouch: false, camera: { position: [0, 70, 24], lookAt: [0, 64, -66] } }));
    await flushFrames(page, 6);

    // === S2-A-M4b: forced MED / LOW tier baselines (Kevin ratifies before gate-blessing) ===
    // The same explore-day world (already fully streamed at the forced `high` tier above), now
    // RE-RENDERED at the med + low quality tiers so the M4a tier levers are eyeball-able. Forcing
    // the tier DOWN reactively re-renders the cheap-to-expensive toggles (godRays on->off at low,
    // godRaySamples 100->60 at med, shadowMapSize 2048->1024->512, AO, bloomMipmap, moteCount) AND
    // shrinks the streamed world: Terrain's 150ms chunk loop reads renderDistance transiently and
    // CULLS chunks beyond `renderDistance+2`, so the rendered terrain visibly contracts at the
    // lower tiers (high cullDist 6 -> med 5 -> low 4). Capture mode freezes RNG/clocks/physics, so
    // each forced-tier frame is byte-stable. These are NEW gate states; the existing high-tier
    // explore-day frame above is untouched. We RESTORE `high` + re-settle before explore-night so
    // the existing high-tier world states downstream are byte-identical to their baselines.
    //
    // explore-day-med: renderDistance 3 (cullDist 5), godRays @60 samples, shadowMap 1024.
    await page.evaluate(() => window.__craftyTest.call('setQualityTier', 'med'));
    await waitForStableTerrain(page, { stableFor: 6, settle: 2500 });
    await flushFrames(page, 8);
    await delay(800);
    await shot(page, 'explore-day-med.png');
    console.log('captured explore-day-med');

    // explore-day-low: renderDistance 2 (cullDist 4), godRays OFF, shadowMap 512, sparse motes.
    await page.evaluate(() => window.__craftyTest.call('setQualityTier', 'low'));
    await waitForStableTerrain(page, { stableFor: 6, settle: 2500 });
    await flushFrames(page, 8);
    await delay(800);
    await shot(page, 'explore-day-low.png');
    console.log('captured explore-day-low');

    // explore-night-low: the low tier under the dusk/night lighting -- proves the tier levers
    // at the genuinely-new danger-adjacent mood (godRays off + sparse motes read very differently
    // at night). Still low; we drop to night, capture, then return to day + restore high.
    await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.0));
    await delay(2500);
    await flushFrames(page, 8);
    await shot(page, 'explore-night-low.png');
    console.log('captured explore-night-low');

    // RESTORE the forced `high` tier + midday + re-settle the full (re-streamed) chunk set so the
    // downstream high-tier world states (explore-night, boss-obsidian, the studio cards) render
    // byte-identical to their EXISTING baselines. The chunk loop re-requests the culled chunks.
    await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5));
    await page.evaluate(() => window.__craftyTest.call('setQualityTier', 'high'));
    await waitForStableTerrain(page, { stableFor: 6, settle: 3000 });
    await delay(800);

    // explore-night. Longer settle + an explicit multi-frame flush so the directional
    // shadow map + per-chunk terrain meshes are fully rendered before the screenshot.
    // (Chunk SET / camera / player are already deterministic; the residual flake is a
    // low-frequency GPU shadow/mesh-upload settle race on the horizon silhouette under
    // the software-GL renderer — extra settled frames eliminate it.)
    await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.0));
    await delay(2500);
    await flushFrames(page, 8);
    await shot(page, 'explore-night.png');
    console.log('captured explore-night');

    // boss-obsidian: the obsidian danger mood (spec §4 Tier 2 — boss). <Atmosphere>
    // snaps the mood in capture mode, so the frame settles within the delay.
    await page.evaluate(() => window.__craftyTest.call('setDangerLevel', 2));
    await delay(1500);
    await shot(page, 'boss-obsidian.png');
    console.log('captured boss-obsidian');

    // loot-showcase (S2-A-M4b / closes the M3c eyeball gap): FOUR loot drops (one per rarity) in a
    // sky studio, each with the iter-163 rarity AURA glow-shell. Capture freezes the bob/spin + the
    // LootSystem physics/magnet/collection loop so the frame is byte-stable.
    // ORDER (iter-164 fix): run BEFORE the character-closeup / boss-closeup / spell-cast / beast
    // fixtures. Those spawn PERSISTENT entities (notably a force-spawned frozen dragon) that a
    // studio-card hook cannot despawn (the boss `bossActive` is component-local useState), and the
    // leftover boss leaked a stray cube into this frame's bottom edge. Run early — after only the
    // world/explore/danger-mood fixtures, which spawn nothing persistent (proven clean by an
    // isolation probe) — and the card is clean. The 4 drops at x=80 then sit >=38 units off-axis
    // from every later fixture camera (boss x=40, spell x=120, beasts at player x=0) and 90 units
    // above the in-world beast frames, so they don't leak forward either.
    captureStage = 'loot-showcase';
    await page.evaluate(() => window.__craftyTest.call('lootShowcase'));
    await flushFrames(page, 8);
    await delay(1200); // drops inject into the frozen world + settle into their pinned pose
    await shot(page, 'loot-showcase.png');
    console.log('captured loot-showcase');

    // mob-bestiary (mob-distinctness milestone): the featured mob types in a studio row, the
    // silhouette-distinctness eyeball surface. Self-clears mobs + stages at x=280 (off-frame for every
    // other fixture camera), so order-independent; placed in the early studio-card cluster.
    captureStage = 'mob-bestiary';
    await page.evaluate(() => window.__craftyTest.call('mobBestiary'));
    await delay(1800); // mobs mount + spawn-pop settles + the capture freeze pins the pose
    await shot(page, 'mob-bestiary.png');
    console.log('captured mob-bestiary');

    // character-closeup: deterministic single-zombie + chest close-up that gates the
    // M2b character render language (toon + rim + outline). Resets danger/day first.
    captureStage = 'character-closeup';
    await page.evaluate(() => window.__craftyTest.call('spawnCharacterCloseup'));
    await delay(1800); // mob mounts + spawn-pop settles + mood/lighting lerp completes
    await shot(page, 'character-closeup.png');
    console.log('captured character-closeup');

    // boss-closeup: deterministic frozen Shadow Dragon close-up that gates the boss
    // render language (emissive telegraph PRESERVED + inverted-hull contour, NO toon).
    // force-spawns the boss and freezes its movement/attacks/flap in capture.
    captureStage = 'boss-closeup';
    await page.evaluate(() => window.__craftyTest.call('spawnBossCloseup'));
    await delay(1800); // boss mounts + freezes + mood/lighting lerp completes
    await shot(page, 'boss-closeup.png');
    console.log('captured boss-closeup');

    // spell-cast (S1-D-M2): a deterministic FROZEN fireball cast in the sky studio that
    // gates + reveals the spell VFX look — rune-circle telegraph + mid-flight projectile
    // with its stretch-trail + a seeded GPU spark spray/shockwave at the impact point.
    // The magic clock is frozen in capture so the cast holds its placed pose; the seeded
    // spark burst + the GPUSparkSystem capture-phase fix make the spray render at uTime=0.
    captureStage = 'spell-cast';
    await page.evaluate(() => window.__craftyTest.call('spawnSpellCast'));
    await flushFrames(page, 8);
    await delay(1200); // cast injects + telegraph/projectile/sparks settle into the frozen pose
    await shot(page, 'spell-cast.png');
    console.log('captured spell-cast');

    // v7-S3.5a: the OTHER 3 elements each get their own frozen cast frame so the per-element
    // shape redesigns (ice shard cluster / lightning wire / arcane rune-wheel) are visually GATED
    // (spell-cast above is fireball-only). The deterministic cast now clears prior casts (isolation),
    // so each frame shows exactly one element's telegraph + projectile + impact.
    for (const el of ['iceball', 'lightning', 'arcane']) {
      captureStage = `spell-${el}`;
      await page.evaluate((s) => window.__craftyTest.call('spawnSpellCast', s), el);
      await flushFrames(page, 8);
      await delay(1200);
      await shot(page, `spell-${el}.png`);
      console.log(`captured spell-${el}`);
    }

    // S2-B1-M7d: the WILDHEART beast TRANSFORM reveal -- the LEAD (comet/fire) beast IN-WORLD (real
    // sky+terrain, captureStudio:false, NOT a studio card) at a third-person reveal angle, so the
    // ③·5 silhouette + glow is judged in its TRUE context. Player is settled on terrain by now.
    // M7d/M8: the 4-beast ROSTER (distinct silhouettes: fire=winged warrior, ice=horned quadruped brute,
    // lightning=avian raptor, arcane=blocky construct) -- IN-WORLD third-person reveals for review.
    for (const el of ['fire', 'ice', 'lightning', 'arcane']) {
      captureStage = `beast-${el}`;
      await page.evaluate((element) => window.__craftyTest.call('spawnBeastTransform', element), el);
      await flushFrames(page, 8);
      await delay(1000); // beast re-mounts + the camera settles into the frozen reveal pose
      // RE-FRAME from where the avatar ACTUALLY rendered, now that it exists. spawnBeastTransform could
      // only guess: it triggers the mount and frames in the same synchronous block, before React has run.
      // Framing off the guess passed at load ~5 and failed at load ~17 with no source change.
      const framedAt = await page.evaluate((element) => window.__craftyTest.call('frameBeastReveal', element), el);
      if (framedAt === false) console.warn(`WARN: beast-${el} — the avatar group never mounted; keeping the provisional framing`);
      else console.log(`  beast-${el} framed at ${JSON.stringify(framedAt)}`);
      await flushFrames(page, 4);
      // REFUSE to write a beast frame with no beast in it. A fixed delay cannot express "the subject is
      // actually there": at load ~30 this exact code produced a beast-less frame, and the byte-comparison
      // gate blessed four such baselines for weeks. Palette comes from beastAvatarParts, not re-typed here.
      // NON-FATAL, same graceful-degradation shape as the menu diorama above: SKIP the frame (keep the
      // last-good one) and CONTINUE, so one broken subject cannot block the other 27 states or a
      // re-baseline. The run still exits NON-ZERO at the end — silence is what shipped four empty
      // baselines, so this must be loud and it must fail the run; it just must not abort it.
      const pal = ELEMENT_COLOR[el];
      let beastOk = true;
      await assertSubjectOnScreen(page, {
        palette: [pal.body.slice(1).toLowerCase(), pal.glow.slice(1).toLowerCase(), pal.core.slice(1).toLowerCase()],
        label: `beast-${el}`,
        minOnScreen: 4,
      }).catch((e) => { beastOk = false; subjectFailures.push(String(e.message).split('\n')[0]); console.warn(`WARN: ${e.message}`); });
      if (!beastOk) { console.warn(`  -> SKIPPING beast-${el}.png (kept last-good) and continuing`); continue; }
      await shot(page, `beast-${el}.png`);
      console.log(`captured beast-${el}`);
    }

    // primitives-showcase (en): the bold-flat UI system gallery. DEV-only overlay
    // driven via the test bridge. Wait for fonts to finish loading so the Lilita/
    // Space-Grotesk swap is painted (these states are about typography + chrome).
    await page.evaluate(() => window.__craftyTest.call('showPrimitivesShowcase', 'en'));
    await page.waitForFunction(() => !!document.querySelector('[data-testid="showcase-root"]'), { timeout: 8000 });
    await page.evaluate(() => document.fonts.ready);
    await delay(700);
    await shot(page, 'primitives-showcase-en.png');
    console.log('captured primitives-showcase-en');

    // primitives-showcase (zh-CN): proves the i18n swap + lazy CJK render. Loading
    // CJK is async (FontFace.load), so wait for fonts.ready AGAIN + a settle delay.
    await page.evaluate(() => window.__craftyTest.call('showPrimitivesShowcase', 'zh-CN'));
    await page.waitForFunction(() => !!document.querySelector('[data-testid="showcase-root"]'), { timeout: 8000 });
    await page.evaluate(() => document.fonts.ready);
    await delay(1200);
    await shot(page, 'primitives-showcase-zh.png');
    console.log('captured primitives-showcase-zh');

    // inventory-open: the migrated bold-flat Inventory modal over the world. The world
    // is already built (`start` ran for explore-day). Dismiss the showcase overlay +
    // restore HUD/locale/danger to a clean explore state, then open the inventory. The
    // inventory's starting items are fixed, so this is deterministic.
    await page.evaluate(() => {
      const s = window.useGameStore.getState();
      s.setShowcaseView(false);
      s.setLocale('en');
      s.setHudHidden(false);
    });
    await page.evaluate(() => window.__craftyTest.call('setDangerLevel', 0));
    await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5));
    // PIN day directly: setTimeOfDay only FLIPS isDay on a half-cycle crossing, so after the night
    // frames above (setTimeOfDay 0.0) it could leave isDay=false -> the panel backgrounds rendered
    // NIGHT non-deterministically (a green-confetti-grade flake: same code, day one run / night another).
    // The panel baselines are bright-day, so pin isDay=true outright before the inventory/achievements/
    // progression captures (mood is snapped in capture -> the day grade applies immediately).
    await page.evaluate(() => window.useGameStore.setState({ isDay: true }));
    await page.evaluate(() => window.__craftyTest.call('openModal', 'inventory'));
    await page.evaluate(() => document.fonts.ready);
    // The migrated modal no longer carries `.game-panel`; gate on the stable test id.
    await page.waitForFunction(() => !!document.querySelector('[data-testid="inventory-modal"]'), { timeout: 8000 });
    await flushFrames(page, 8);
    await delay(900);
    // DETERMINISM (panel frames): the day/night world BEHIND these translucent panels is the
    // regression-IRRELEVANT part, and its sky/mood proved non-deterministic across runs (the panel
    // backdrop rendered day on some runs, night on others -> phantom 11-33% diffs that flake the gate
    // regardless of any setTimeOfDay/isDay pin). The panel UI is the actual regression target, so hide
    // the 3D canvas for the 3 panel shots -> a deterministic solid backdrop. The DOM HUD (hotbar/quests/
    // coins) is unaffected (it's not in the canvas). Restored after progression-open below.
    await page.evaluate(() => { const c = document.querySelector('canvas'); if (c) c.style.visibility = 'hidden'; });
    await flushFrames(page, 2);
    await shot(page, 'inventory-open.png');
    console.log('captured inventory-open');

    // achievements-open: the migrated bold-flat Achievements panel over the world.
    // Dismiss the inventory first, then open Achievements via the DEV bridge.
    // `showAchievements` is useState inside useInputManager (not the store), so the
    // `openAchievements` hook drives the local setter. Achievement/stat values are
    // fixed at a clean explore state, so this is deterministic.
    await page.evaluate(() => window.useGameStore.getState().setShowInventory(false));
    await page.evaluate(() => window.__craftyTest.call('openAchievements'));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => !!document.querySelector('[data-testid="achievements-panel"]'), { timeout: 8000 });
    await flushFrames(page, 8);
    await delay(900);
    await shot(page, 'achievements-open.png');
    console.log('captured achievements-open');

    // progression-open (#51): the talents + Spell Mastery progression panel (the U key). The openModal
    // hook closes the sibling panels first. Deterministic (default spellLevels all-1s, getPlayerLevel fixed).
    await page.evaluate(() => window.__craftyTest.call('openModal', 'spellUpgrades'));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => !!document.querySelector('[data-testid="progression-panel"]'), { timeout: 8000 });
    // the panel is tall (talents + the new Spell Mastery section); scroll the modal to the bottom so the
    // Spell Mastery rows are in-frame for the baseline (the talent grid above has its own coverage).
    await page.evaluate(() => { const p = document.querySelector('[data-testid="progression-panel"]'); const sc = p && p.closest('.overflow-y-auto'); if (sc) sc.scrollTop = sc.scrollHeight; });
    await flushFrames(page, 8);
    await delay(900);
    await shot(page, 'progression-open.png');
    console.log('captured progression-open');
    // restore the 3D canvas for the subsequent world-dependent fixtures (title-mascot et al.).
    await page.evaluate(() => { const c = document.querySelector('canvas'); if (c) c.style.visibility = 'visible'; });
    await flushFrames(page, 2);

    // title-mascot (S1-D-M4): the chosen "Crafty Hero" brand face, rendered in the standalone studio
    // overlay (fixed camera + explore-day lighting + post-stack). Its idle is RESET to MASCOT_REST under
    // capture rather than frozen — and because the studio mounts the mascot with capture ALREADY on, its
    // useFrame returns the rest pose on frame 1 and the declared JSX values stand. That is why this frame
    // measures 0.0000% run-to-run while `menu`, whose diorama mounts BEFORE capture, does not.
    //
    // IT IS A GATED FRAME. Three comments here used to claim it was "INTENTIONALLY omitted from
    // diff.test.js STATES"; it entered STATES in 63dda2b8 (2026-06-02), before those words were written.
    //
    // NON-FATAL (graceful degradation, mirrors the menu diorama): it mounts a FRESH R3F Canvas at the very
    // end of a long software-GL session where the renderer is most context-pressured — the one spot that
    // historically threw a puppeteer ProtocolError and hung the whole run. Longer mount wait (8s -> 20s,
    // matching the late-session slowness), and if the canvas doesn't mount or the shot throws, SKIP
    // title-mascot.png (keeping the last-good copy) and fall through to the CLEAN end so the remaining
    // gated frames still land and the freshness sentinel validates. The SKIP is deliberate and visible;
    // what is no longer swallowed is the crash EVIDENCE (see the realCrashes filter below).
    captureStage = 'title-mascot';
    try {
      await page.evaluate(() => window.useGameStore.getState().setShowInventory(false));
      await page.evaluate(() => window.__craftyTest.call('showMascot'));
      await page.waitForFunction(() => !!document.querySelector('[data-testid="mascot-studio"] canvas'), { timeout: 20000 });
      await flushFrames(page, 10);
      await delay(900);
      await shot(page, 'title-mascot.png');
      console.log('captured title-mascot');
    } catch (e) {
      console.warn(`WARN: title-mascot capture failed (${e && e.message || e}) -> skipping title-mascot.png (a GATED frame; its last-good copy is kept), continuing to clean end`);
    }
  } finally {
    // A GPU-context-lost / crashed headless Chrome can leave browser.close() hanging on an unanswered CDP
    // command forever (the observed "title-mascot hang"). Race close() against an 8s timeout (cleared when
    // close settles, so no timer lingers), then force-kill the browser process as a backstop.
    await new Promise((res) => {
      const t = setTimeout(res, 8000);
      browser.close().then(() => { clearTimeout(t); res(); }).catch(() => { clearTimeout(t); res(); });
    });
    try { const proc = browser.process(); if (proc && !proc.killed) proc.kill('SIGKILL'); } catch {}
    // Kill the whole vite process GROUP (npx wrapper + its forked vite child); server.kill() alone only
    // reaps the npx wrapper and ORPHANS the vite child holding :4178.
    try { process.kill(-server.pid, 'SIGKILL'); } catch { try { server.kill('SIGKILL'); } catch {} }
  }
  // Benign @boot noise (favicon 404, pre-server ERR_CONNECTION_REFUSED) is NOT a render crash.
  // An uncaught exception during an actual capture STAGE freezes the R3F loop → later frames are
  // stale → the diff gate would silently pass on wrong frames. FAIL LOUD (non-zero exit) so the
  // loop treats it as broken-main, never as a clean capture. (The iter-161 _trailDir lesson.)
  const dedupe = (arr) => {
    const seen = new Set(); const out = [];
    for (const e of arr) { const k = `${e.stage}::${e.msg}`; if (!seen.has(k)) { seen.add(k); out.push(e); } }
    return out;
  };
  // THE 'title-mascot' EXCLUSION IS GONE, AND ITS PREMISE WAS FALSE THE DAY IT WAS WRITTEN.
  //
  // It read: "it's the ungated final state (not a diff.test.js STATE) ... cannot corrupt the 23 gated
  // frames". Both halves were wrong. `title-mascot` entered diff.test.js STATES in 63dda2b8 (2026-06-02);
  // this comment was authored in 75191ef (2026-07-20), seven weeks LATER. And there are 31 gated frames,
  // not 23. So a pageerror during that stage was discarded, the sentinel still wrote complete:true /
  // crashes:0, and a gated frame produced by a crashed render loop was diffed as clean.
  //
  // The graceful-degradation behaviour it was reaching for still exists and is the right shape: the
  // try/catch around the title-mascot shot SKIPS the png and continues to a clean end. That is a
  // deliberate, visible skip. Silently swallowing the crash EVIDENCE is a different thing, and it is the
  // repo's signature defect — a report of PASS over input the instrument never examined.
  const realCrashes = dedupe(crashes.filter((e) => e.stage !== 'boot'));
  const realWarns = dedupe(consoleErrs.filter((e) => e.stage !== 'boot'));
  // GL FATALS ARE FILTERED BY NEITHER EXCLUSION — not by 'boot', not by 'title-mascot'.
  //
  // The boot exclusion exists for favicon 404s and pre-server connection refusals, which are noise. A
  // shader that fails to link at boot is not noise: `captureStage` is still 'boot' for the FIRST 13 of
  // the 31 gated frames (it is only reassigned at 9 points, and every `shot()` call before the first
  // reassignment runs under 'boot'). Excluding 'boot' here would make this check dead in exactly the
  // window where most gated frames are taken.
  const realFatalGl = dedupe(fatalGl);
  if (realWarns.length) {
    console.warn(`\n=== ${realWarns.length} console warning(s) during capture (non-fatal) ===`);
    for (const e of realWarns) console.warn(`  [@${e.stage}] ${e.msg}`);
  }
  if (realFatalGl.length) {
    console.error(`\n=== ${realFatalGl.length} FATAL GL ERROR(S) DURING CAPTURE — gate FAILS ===`);
    console.error('  A failed shader link renders NOTHING for that object and a lost context renders');
    console.error('  nothing at all. Both sit far under the 6% threshold, so without this the run is a');
    console.error('  green gate over frames that do not depict the scene.');
    for (const e of realFatalGl) console.error(`  [@${e.stage}] ${e.msg}`);
    process.exitCode = 1;
    writeFileSync(META, JSON.stringify({ startedAt: runStartedAt, finishedAt: Date.now(), complete: false, crashes: realCrashes.length, fatalGl: realFatalGl.length }));
    return;
  }
  if (realCrashes.length) {
    console.error(`\n=== ${realCrashes.length} RENDER CRASH(ES) DURING CAPTURE — gate FAILS ===`);
    for (const e of realCrashes) console.error(`  [@${e.stage}] ${e.msg}`);
    process.exitCode = 1;
    // leave the sentinel INVALID (complete:false) so even an isolated diff run fails loud.
    writeFileSync(META, JSON.stringify({ startedAt: runStartedAt, finishedAt: Date.now(), complete: false, crashes: realCrashes.length }));
  } else {
    console.log('\nNo render crashes during capture.');
    if (subjectFailures.length) {
      console.error(`\n\u2718 capture: ${subjectFailures.length} state(s) had NO SUBJECT and were SKIPPED:`);
      for (const f of subjectFailures) console.error(`    ${f}`);
      console.error('  Those PNGs are the previous run\'s. A byte-comparison would pass them forever.\n');
      process.exitCode = 1;
    }
    // validate the sentinel: this run produced a complete, crash-free set of fresh current/ frames.
    writeFileSync(META, JSON.stringify({ startedAt: runStartedAt, finishedAt: Date.now(), complete: true, crashes: 0 }));
  }
}
// RUN ONLY AS A CLI. Without this guard, `import`ing anything from this file launches a browser and spawns
// a vite server as a side effect of loading it — the same defect found in scripts/ci/i18n-adoption.mjs
// earlier today, where it killed a vitest worker during collection and made a test file report
// "1 failed | no tests" while every assertion in it silently skipped.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
