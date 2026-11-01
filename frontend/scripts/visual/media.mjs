#!/usr/bin/env node
/**
 * media.mjs — every image that shows Crafty outside the game, from ONE declared shot table (_media.mjs MEDIA_SHOTS):
 * the README hero, the og card a shared link shows, the GitHub social preview and the release stills.
 *
 * WHAT IT SHOOTS. A production bundle it builds itself (`vite build` into a scratch folder) from a tree that is clean
 * outside the media outputs, served by `vite preview`, in a Chromium that gives the game a hardware renderer, through
 * the lookbook's production seam (src/render/lookbookSeam.js) and its page helpers (_lookbookPage.mjs): one capture path
 * for looks and for media. The HUD is seen on screen, then hidden with the store's own switch (setHudHidden); the
 * first-person hands stay on. Each shot is checked by _media.mjs mediaShotVerdict (clock, liveness, tier high, hardware
 * renderer, HUD hidden after it was seen, hands mounted, body stood, bearing held, the pose pinned, no mob within 3 m of
 * the eye read from the ECS through the seam's mobs(), a fight's hostile in range) and shot once more when it fails.
 * Only valid frames are written.
 *
 * WHAT IT WRITES. Each frame is a lossless PNG master at device scale 2 (kept in --work). ImageMagick downsamples it and
 * encodes the JPEGs to their byte targets (jpeg:extent) and the og card, composed in the same browser from ogCardHtml,
 * to a palette PNG. Then docs/media/media.json: per file its shot, purpose, time of day, the provenance runProvenance
 * allows (the commit the bundle was built from, or none), the bundle's index chunk and content identity (buildIdentity:
 * every file it serves but the run's own outputs),
 * the renderer read from the game's own WebGL context, the tier, the size, the bytes and their sha256; entries for shots
 * this run did not shoot are kept, entries for shots the table no longer declares are dropped.
 * tests/scripts/media.test.js checks the committed files against it on every run.
 *
 * --build-dir <dir> serves a bundle built elsewhere instead, for trying a recipe: its files are stamped with no sha
 * and an unknown tree, so the committed-media check refuses them.
 *
 * Needs ImageMagick's `magick` on PATH.
 * Usage:  node scripts/visual/media.mjs [--only hero,og] [--build-dir <dir>] [--work <dir>]
 * Exit 0 = every requested shot written · 1 = a shot was invalid twice (named; the valid ones are written), or the
 *      tree changed while the bundle built · 3 = COULD NOT SHOOT (named: a dirty tree, a failed build, no magick, no
 *      hardware renderer, a port serving another build, the HUD never seen, a dead mob feed).
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serveVite, probePort } from './_serve.mjs';
import { profileSeed } from './_profile.mjs';
import { aimAt, indexChunkOf, servedBuildProblem } from './_lookbook.mjs';
import {
  resolveChromium, initScript, info, setCycle, clearHostiles, play, hudOn, respawnIfDead, restingBody, handsBaseline, holdActive,
} from './_lookbookPage.mjs';
import {
  MEDIA_SHOTS, MEDIA_TIMES, MEDIA_MANIFEST, POSE_CLEAR_M, shotTableProblems, mediaShotVerdict, mobFeed, fightTarget, posePlace, mergeManifest, ogCardHtml,
  dirtyOutsideOutputs, runProvenance, buildIdentity, filesUnder, sha256Hex, jpegEncodeArgv, pngPaletteArgv, imageSize,
} from './_media.mjs';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT = resolve(APP, '..');
const PORT = probePort(import.meta.url);
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const HANDED_BUILD = arg('--build-dir', null);
const WORK = resolve(arg('--work', join(tmpdir(), `crafty-media-${new Date().toISOString().replace(/[:.]/g, '-')}`)));
const ONLY = arg('--only', null)?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;

// The game draws its canvas at its own pixel budget's ratio (render/pixelBudget.js: about 1.6 to 1.75 at these sizes on
// the high tier, recorded per file as `dpr`), so a frame is supersampled by that ratio, not by 2. The master is taken
// at device scale 2 so the browser only ever scales the canvas up, and magick does the one downsample.
const DEVICE_SCALE = 2;
const BUILD_TIMEOUT_MS = 600000;
const WORLD_TIMEOUT_MS = 180000;
const WARMUP_MS = 5000; // shaders compile and the tier governor takes its first samples
const RESIZE_MS = 1500; // the canvas and the composer reallocate after a viewport change
const STREAM_MS = 6000; // chunks stream in around a newly posed camera (PositionTracker mirrors the camera)
const SETTLE_MS = 3000; // sky, fog and grade settle at a new time of day
const FRAME_MS = 1200;
const CAST_MS = 180; // the fireball has left the hand and is still in frame
const PALETTE_STEPS = [256, 224, 192, 160, 128];
// Playwright's own signal handlers close the browser and exit ahead of ours (lookbook.mjs OWN_SIGNALS); ours own the order.
const OWN_SIGNALS = Object.freeze({ handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (x, n = 4) => Math.round(x * 10 ** n) / 10 ** n;

class CouldNotShoot extends Error {}

function magick(argv) {
  return execFileSync('magick', argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const mobsNow = (page) => page.evaluate(() => window.__craftyLookbook.mobs());

/** Frame one shot and take its master. Returns { shot, verdict, master, after, heading, target, waitedS, mobs }. */
async function shootOnce(page, shot, ctx, attempt) {
  const { stand, hands, report, hudSeenOn } = ctx;
  const [w, h] = shot.size;
  const vp = page.viewportSize();
  if (vp.width !== w || vp.height !== h) {
    await page.setViewportSize({ width: w, height: h });
    await delay(RESIZE_MS);
  }
  const cycle = MEDIA_TIMES[shot.time];
  const r = shot.recipe;
  let heading = r.heading ?? null;
  let target = null;
  let search = null;
  let waitedS = 0;
  if (r.kind === 'pose') {
    const place = posePlace(r);
    await respawnIfDead(page, report);
    await page.evaluate((p) => window.__craftyLookbook.pose(p), place);
    await setCycle(page, cycle);
    await delay(STREAM_MS);
    await page.evaluate((radius) => window.__craftyLookbook.clearHostiles({ radius }), POSE_CLEAR_M);
    await play(page);
    await setCycle(page, cycle);
    await delay(FRAME_MS);
  } else {
    await page.evaluate(() => window.__craftyLookbook.clear());
    await respawnIfDead(page, report);
    await page.evaluate((p) => window.__craftyLookbook.stand(p), { position: stand });
    await setCycle(page, cycle);
    if (r.kind === 'eye') {
      await page.evaluate((p) => window.__craftyLookbook.look(p), { heading: r.heading, pitch: r.pitch });
      await delay(SETTLE_MS);
      await clearHostiles(page);
      await play(page);
      await page.evaluate((p) => window.__craftyLookbook.stand(p), { position: stand });
      await page.evaluate((p) => window.__craftyLookbook.look(p), { heading: r.heading, pitch: r.pitch });
      await setCycle(page, cycle);
      await delay(FRAME_MS);
    } else {
      // The fight: wait for the night's own hostiles (the seam cannot spawn one), turn to the nearest in range, cast.
      await delay(SETTLE_MS);
      const t0 = Date.now();
      while (Date.now() - t0 < r.waitS * 1000) {
        await respawnIfDead(page, report);
        await page.evaluate((p) => window.__craftyLookbook.stand(p), { position: stand });
        await setCycle(page, cycle);
        search = fightTarget(await mobsNow(page), (await info(page)).eye, r);
        if (!search.checked) break;
        target = search.target;
        if (target) break;
        await delay(1000);
      }
      waitedS = Math.round((Date.now() - t0) / 1000);
      if (target) {
        const eye = (await info(page)).eye;
        const aim = aimAt(eye, [target.position[0], target.position[1] + 0.9, target.position[2]]);
        heading = aim.heading;
        await play(page);
        await page.evaluate((p) => window.__craftyLookbook.look(p), { heading: aim.heading, pitch: Math.max(-80, Math.min(80, aim.pitch)) });
        await page.keyboard.press('KeyF'); // a real key through the browser's input pipeline: the cast
        await delay(CAST_MS);
      }
    }
  }
  const before = await info(page);
  const hudVisible = await hudOn(page);
  const list = await mobsNow(page);
  const png = await page.screenshot({ type: 'png' });
  const after = await info(page);
  const master = join(WORK, `${shot.name}-${attempt}.png`);
  writeFileSync(master, png);
  const mobs = mobFeed(list, before.eye);
  const verdict = mediaShotVerdict({ shot, before, after, stand, heading, handsHidden: hands.hidden, hudSeenOn, hudVisible, mobs, search });
  return { shot, verdict, master, after, heading, target, waitedS, mobs };
}

/** The og card: the master under the ink scrim and the wordmark, composed in this browser, then a palette PNG under
 *  its byte target. Returns the palette size used. */
async function writeOgCard(context, r, out) {
  const [w, h] = r.shot.size;
  const font = (f) => `data:font/woff2;base64,${readFileSync(join(APP, 'public/fonts', f)).toString('base64')}`;
  const frameFile = join(WORK, 'og-frame.png');
  writeFileSync(frameFile, readFileSync(r.master));
  const master = imageSize(readFileSync(frameFile));
  const cardHtml = join(WORK, 'og-card.html');
  writeFileSync(cardHtml, ogCardHtml({ frame: 'og-frame.png', wordmarkFont: font('lilita-one-v15-latin-regular.woff2'),
    textFont: font('space-grotesk-v16-latin-regular.woff2'), width: w, height: h }));
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(pathToFileURL(cardHtml).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const fonts = await page.evaluate(() => [document.fonts.check('100px "Lilita One"'), document.fonts.check('30px "Space Grotesk"')]);
    if (!fonts.every(Boolean)) throw new Error(`the og card's fonts did not load (Lilita One ${fonts[0]}, Space Grotesk ${fonts[1]})`);
    const img = await page.evaluate(() => {
      const el = document.querySelector('img.frame');
      return el ? { complete: el.complete, width: el.naturalWidth, height: el.naturalHeight } : null;
    });
    if (!img?.complete || img.width !== master?.width || img.height !== master?.height) {
      throw new Error(`the og card's frame did not load as the master (${JSON.stringify(img)}, master ${master?.width}x${master?.height})`);
    }
    const card = join(WORK, 'og-card.png');
    writeFileSync(card, await page.screenshot({ type: 'png' }));
    for (const colors of PALETTE_STEPS) {
      magick(pngPaletteArgv(card, out, { width: w, height: h, colors }));
      if (readFileSync(out).length <= r.shot.targetBytes) return { colors };
    }
    throw new Error(`the og card is over ${r.shot.targetBytes} bytes even at ${PALETTE_STEPS.at(-1)} colours`);
  } finally {
    await page.close();
  }
}

/** Build the bundle this run shoots, or take the one it was handed. Returns { buildDir, provenance }. */
function prepareBuild(git, fail) {
  const headBefore = git(['rev-parse', 'HEAD']).trim();
  const porcelainBefore = git(['status', '--porcelain']);
  if (HANDED_BUILD) {
    const buildDir = resolve(APP, HANDED_BUILD);
    return { buildDir, provenance: runProvenance({ ownBuild: false, headBefore, headAfter: headBefore, porcelainBefore, porcelainAfter: porcelainBefore }) };
  }
  const dirty = dirtyOutsideOutputs(porcelainBefore);
  if (dirty.length) fail(`the tree is dirty outside the media outputs (${dirty.slice(0, 5).join(', ')}): commit first, so the sha names what is built`);
  const buildDir = join(WORK, 'build');
  console.log(`building ${headBefore.slice(0, 8)} into ${buildDir}`);
  try {
    execFileSync('npx', ['vite', 'build', '--outDir', buildDir, '--emptyOutDir'], { cwd: APP, stdio: ['ignore', 'ignore', 'pipe'], timeout: BUILD_TIMEOUT_MS });
  } catch (e) {
    fail(`the production build failed: ${String(e.stderr || e.message).split('\n').slice(0, 5).join(' | ')}`);
  }
  const provenance = runProvenance({
    ownBuild: true, headBefore, headAfter: git(['rev-parse', 'HEAD']).trim(), porcelainBefore, porcelainAfter: git(['status', '--porcelain']),
  });
  return { buildDir, provenance };
}

async function main() {
  const fail = (msg) => { throw new CouldNotShoot(msg); };
  const unknown = (ONLY || []).filter((n) => !MEDIA_SHOTS.some((s) => s.name === n));
  if (unknown.length) fail(`--only names no shot in the table: ${unknown.join(', ')}`);
  const plan = ONLY ? MEDIA_SHOTS.filter((s) => ONLY.includes(s.name)) : MEDIA_SHOTS;
  const table = shotTableProblems();
  if (table.length) fail(`the shot table is malformed:\n  ${table.join('\n  ')}`);
  try { magick(['-version']); } catch { fail('ImageMagick (magick) is not on PATH'); }
  const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  mkdirSync(WORK, { recursive: true });
  const { buildDir, provenance } = prepareBuild(git, fail);
  if (!existsSync(join(buildDir, 'index.html'))) fail(`no production build at ${buildDir}`);
  const build = indexChunkOf(readFileSync(join(buildDir, 'index.html'), 'utf8'));
  const buildId = buildIdentity(filesUnder(buildDir).map((p) => ({ path: p, sha256: sha256Hex(readFileSync(join(buildDir, p))) })));
  console.log(`bundle ${build}, identity ${buildId.slice(0, 16)}; provenance: ${provenance.sha ? `${provenance.sha} (${provenance.provenance})` : provenance.provenance}`);

  const { url, waitReady, shutdown } = serveVite(PORT, { cwd: APP, preview: true, outDir: buildDir });
  let live = null;
  let stopping = false;
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
    process.on(signal, async () => {
      if (stopping) process.exit(code);
      stopping = true;
      console.error(`media: ${signal}, closing the browser and vite`);
      await shutdown(live);
      process.exit(code);
    });
  }
  let code = 0;
  try {
    await waitReady();
    const problem = servedBuildProblem(await (await fetch(url)).text(), build);
    if (problem) fail(problem);
    const { results: candidates, chosen } = await resolveChromium({
      launch: async (engine, opts) => { live = await chromium.launch({ ...opts, ...OWN_SIGNALS }); return live; },
      close: async (b) => { await b?.close().catch(() => {}); if (live === b) live = null; },
    });
    console.log('Chromium launch candidates (renderer of a fresh context on about:blank):');
    for (const c of candidates) console.log(`  ${c.id.padEnd(20)} ${c.error ? `LAUNCH FAILED: ${c.error}` : `${c.gpu.padEnd(9)} ${c.renderer}`}`);
    if (!chosen) fail('no Chromium candidate gives the game a hardware renderer; a software frame is never shipped as media');
    live = await chromium.launch({ ...chosen.launch, ...OWN_SIGNALS });
    const [w0, h0] = plan[0].size;
    const context = await live.newContext({ viewport: { width: w0, height: h0 }, deviceScaleFactor: DEVICE_SCALE });
    const page = await context.newPage();
    let pageErrors = 0;
    page.on('pageerror', () => { pageErrors += 1; });
    await page.addInitScript(initScript, { touch: false, seed: profileSeed('returning') });
    await page.goto(`${url}/?lookbook=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const hasSeam = await page.waitForFunction(() => typeof window.__craftyLookbook?.mobs === 'function', null, { timeout: 30000 }).then(() => true, () => false);
    if (!hasSeam) fail('this build has no lookbook seam with mobs() (window.__craftyLookbook)');
    const built = await page.waitForFunction(() => window.__craftyLookbook.info().worldBuilt, null, { timeout: WORLD_TIMEOUT_MS, polling: 1000 })
      .then(() => true, () => false);
    if (!built) fail(`the world never built within ${WORLD_TIMEOUT_MS / 1000} s`);
    if (!(await holdActive(page)).held) fail('the input gate never held live; every frame would show an overlay');
    await delay(WARMUP_MS);
    const hudSeenOn = await hudOn(page);
    if (!hudSeenOn) fail('the HUD\'s vitals stack ([data-testid="stat-stack"]) is not on screen in play, so its absence in a frame would prove nothing');
    await page.evaluate(() => window.useGameStore.getState().setHudHidden(true));
    const report = { respawns: 0 };
    const hands = await handsBaseline(page);
    await respawnIfDead(page, report);
    const stand = await restingBody(page);
    if (!stand) fail('the player never came to rest at the Hearth');
    const feed = mobFeed(await mobsNow(page), (await info(page)).eye);
    if (!feed.checked) fail(feed.why);
    console.log(`stand ${JSON.stringify(stand.map((v) => round(v, 2)))}; hands ${JSON.stringify(hands)}; mob feed ${feed.named} named NPCs, nearest ${feed.nearestM?.toFixed(1)} m`);

    const shots = [];
    for (const shot of plan) {
      let r = null;
      for (let attempt = 1; attempt <= 2 && !r?.verdict.valid; attempt++) {
        r = await shootOnce(page, shot, { stand, hands, report, hudSeenOn }, attempt);
        const extra = r.target ? `; ${r.target.type} at ${r.target.distance.toFixed(1)} m after ${r.waitedS} s` : (shot.recipe.kind === 'fight' ? `; no hostile in range after ${r.waitedS} s` : '');
        const near = r.mobs.checked ? (r.mobs.nearestM == null ? 'none' : `${r.mobs.nearestType} ${r.mobs.nearestM.toFixed(1)} m`) : 'NOT READ';
        console.log(`  ${shot.name.padEnd(15)} try ${attempt}: ${r.verdict.valid ? 'valid' : `INVALID (${r.verdict.why.join('; ')})`}; clock ${round(r.after.cycle)}, tier ${r.after.tier}, nearest mob ${near}${extra}`);
      }
      shots.push(r);
    }
    await page.evaluate(() => window.__craftyLookbook.clear());

    const fresh = [];
    for (const r of shots.filter((x) => x.verdict.valid)) {
      const out = join(ROOT, r.shot.out);
      mkdirSync(dirname(out), { recursive: true });
      let encoding;
      if (r.shot.format === 'png') encoding = await writeOgCard(context, r, out);
      else {
        magick(jpegEncodeArgv(r.master, out, { width: r.shot.size[0], height: r.shot.size[1], targetBytes: r.shot.targetBytes }));
        encoding = { quality: Number(magick(['identify', '-format', '%Q', out]).trim()) };
      }
      const bytes = readFileSync(out);
      const size = imageSize(bytes);
      fresh.push({
        file: r.shot.out, shot: r.shot.name, purpose: r.shot.purpose, time: r.shot.time, cycle: MEDIA_TIMES[r.shot.time],
        cycleAtShot: round(r.after.cycle), sha: provenance.sha, dirty: provenance.dirty, provenance: provenance.provenance, build, buildId,
        renderer: r.after.gl?.renderer ?? null, tier: r.after.tier, dpr: r.after.gl?.dpr ?? null, width: size?.width, height: size?.height,
        bytes: bytes.length, sha256: sha256Hex(bytes), format: size?.format, ...encoding,
        nearestMob: r.mobs.nearestM == null ? null : { kind: r.mobs.nearestType, m: round(r.mobs.nearestM, 1) },
        recipe: r.target ? { ...r.shot.recipe, target: r.target.type, targetM: round(r.target.distance, 1), heading: round(r.heading, 1) } : r.shot.recipe,
      });
      console.log(`  wrote ${r.shot.out}: ${size?.width}x${size?.height}, ${bytes.length} bytes, ${JSON.stringify(encoding)}`);
    }
    const manifestPath = join(ROOT, MEDIA_MANIFEST);
    const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
    writeFileSync(manifestPath, `${JSON.stringify(mergeManifest(previous, fresh), null, 2)}\n`);
    const invalid = shots.filter((x) => !x.verdict.valid);
    console.log(`\nshots: ${plan.length} planned, ${fresh.length} written, ${invalid.length} invalid twice${invalid.length ? ` (${invalid.map((x) => x.shot.name).join(', ')})` : ''}; respawns ${report.respawns}; page errors ${pageErrors}`);
    console.log(`masters: ${WORK}\nmanifest: ${MEDIA_MANIFEST}${provenance.sha ? '' : `\nNO SHA STAMPED: ${provenance.provenance}`}`);
    if (invalid.some((x) => x.verdict.couldNotCheck)) code = 3;
    else if (invalid.some((x) => !x.shot.optional) || (!HANDED_BUILD && !provenance.sha)) code = 1;
  } catch (e) {
    code = e instanceof CouldNotShoot ? 3 : 1;
    console.error(`media: ${code === 3 ? 'COULD NOT SHOOT' : 'FAILED'} — ${e.message}`);
  } finally {
    await shutdown(live);
  }
  return code;
}

if (import.meta.main) {
  process.exit(await main());
}
