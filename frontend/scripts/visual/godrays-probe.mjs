// godrays-probe.mjs — OI-03b: does GodRaysEffect actually COMPOSITE anything at postprocessing 6.39.5?
//
// WHY THIS EXISTS. `postprocessing` was pinned because 6.39.4 broke `GodRaysEffect` — it stopped
// compositing the sun entirely. The pin has since moved to 6.39.5 (now upstream `latest`) and nobody
// checked whether the regression went with it. Four files in this repo mention god rays and every one is
// about COST, QUALITY TIERS or the sun's ARC; not one asserts the effect renders. The most expensive
// visual knob in the game (`render/quality.js` calls its sample count exactly that) had nothing watching
// whether it does anything at all, which is precisely how the 6.39.4 break went unnoticed the first time.
//
// THE ORACLE, and why it is not "look at the sun". Aiming a camera at the sun is fragile — OI-02 records
// that `explore-day` shows no sun disc at its angle, so the frame that would answer this has to be hunted
// for. GodRays is a SCREEN-SPACE additive pass: if it composites, removing it changes the picture. So the
// question becomes a frame difference, which needs no aiming.
//
// AND THE THRESHOLD IS MEASURED, NOT INVENTED. Chromium does not guarantee deterministic rendering
// (playwright#22620, crbug 919955) and this repo has measured that directly. So the probe captures the
// SAME build twice to establish this run's own noise floor, then compares that against the with/without
// difference. The verdict is a RATIO of two things measured in the same session on the same machine —
// a hardcoded "must differ by N%" would be a constant pretending to be a control.
//
// WHY IT PATCHES SOURCE. The store's quality tier would work as a switch (`low` sets godRays:false) but
// it also changes AO, shadow map size, render distance, outlines and mote count — six confounds. Removing
// the one JSX element isolates the pass and renders exactly what shipping that change renders. Same
// trap-guarded, byte-verified-restore pattern as grass-swatch-probe.mjs.
//
// NOT A GATE. It needs a browser and ~90s. It prints a verdict and exits 0/1/3; wire it to CI if the
// answer ever needs to be continuous. Exit 3 = COULD NOT CHECK (the run never produced comparable
// frames), which must never be read as a pass.
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { PNG } from 'pngjs';
import { serveVite, probePort } from './_serve.mjs';

const PORT = probePort(import.meta.url);
const SRC = new URL('../../src/GameScene.jsx', import.meta.url).pathname;
const OUT = '/tmp/crafty-godrays';
const BAK = `${OUT}/GameScene.orig.jsx`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

// The one element. Anchored to the opening tag so the trap below fires if it is ever reformatted.
// The GUARD, not the element. An earlier version of this probe renamed the tag to `<GodRaysDISABLED`,
// which is an undefined component: React tore down the whole EffectComposer subtree, so the "without"
// frame had NO postprocessing at all rather than no GodRays. It read as a 9.59x effect and the giveaway
// was in the numbers — the SKY fell from 150.2 to 18.7 luminance, and removing a god-ray pass cannot
// darken the sky eightfold. Flipping the guard to `false &&` leaves every other pass mounted and
// disables exactly one, which is the comparison the question asks for.
const GODRAYS_GUARD = '{q.godRays && sunMesh && sunAboveHorizon && (';
const GODRAYS_GUARD_OFF = '{false && sunMesh && sunAboveHorizon && (';

/** Mean absolute per-channel difference between two PNGs, 0..255. Throws if the sizes disagree. */
function meanDiff(aPath, bPath) {
  const a = PNG.sync.read(readFileSync(aPath));
  const b = PNG.sync.read(readFileSync(bPath));
  if (a.width !== b.width || a.height !== b.height) throw new Error('frame sizes differ — not comparable');
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    sum += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
  }
  return sum / ((a.data.length / 4) * 3);
}

/** Mean absolute per-channel difference over a RECT of two PNGs. Localised effects vanish in a frame mean. */
function meanDiff2(aPath, bPath, x0, y0, x1, y1) {
  const a = PNG.sync.read(readFileSync(aPath));
  const b = PNG.sync.read(readFileSync(bPath));
  if (a.width !== b.width || a.height !== b.height) throw new Error('frame sizes differ — not comparable');
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * a.width + x) * 4;
    s += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    n += 3;
  }
  return s / n;
}

/** Mean luminance of a rect, for sanity-checking that the control is still the same scene. */
function meanLuma(path, x0, y0, x1, y1) {
  const p = PNG.sync.read(readFileSync(path));
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * p.width + x) * 4;
    s += 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
    n++;
  }
  return s / n;
}

const { url, waitReady, shutdown } = serveVite(PORT);
let browser = null;
let code = 0;
let patched = false;

const original = readFileSync(SRC, 'utf8');
if (original.split(GODRAYS_GUARD).length - 1 !== 1) {
  console.error(`✖ COULD NOT CHECK — the guard "${GODRAYS_GUARD}" does not appear exactly once in GameScene.jsx.`);
  console.error('  It was reformatted or duplicated. Fix the anchor; do NOT relax it to a bare token.');
  process.exit(3);
}
copyFileSync(SRC, BAK);

/** Boot the game to a sun-up, GodRays-eligible state and shoot a frame. */
async function shoot(page, name) {
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 30000 });
  await page.evaluate(() => window.__craftyTest.call('start'));
  // The store default tier is 'low', which sets godRays:false — without this the probe would compare two
  // frames that never had the effect and report a confident "it does nothing".
  await page.evaluate(() => window.useGameStore.getState().setQualityTier('high'));
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 20000 }).catch(() => {});
  // CAPTURE MODE, and it is the whole reason this probe is trustworthy.
  //
  // The first version drove the LIVE game and called two captures 30s apart a "noise floor". That is not
  // renderer noise, it is the scene MOVING: clouds, particles, mobs, weather and the day/night clock all
  // advance between shots. Measured, and the giveaway is that it is spatially structured — 0.74 mean abs
  // diff in far sky against 10.44 on the sun disc and ~4.9 in the shaft corridors. The drift was largest
  // in exactly the region the effect occupies, so it swamped the thing being measured and BOTH verdicts
  // the probe produced were unsound. `enterCapture` is the layer this repo already built to stop that:
  // 127 isCaptureMode() guards turn the moving parts off. An assertion must SET every variable it reads,
  // and scene animation was one this probe was inheriting.
  const engaged = await page.evaluate(() => window.__craftyTest.call('enterCapture', {}));
  if (!engaged) throw new Error('enterCapture acked but capture mode did not engage — refusing to report');
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.3)); // sun well above the horizon
  await delay(6000); // terrain stream + the composer settling
  const gated = await page.evaluate(() => {
    const s = window.useGameStore.getState();
    return { tier: s.qualityTier, sunUp: s.sunAboveHorizon };
  });
  await page.screenshot({ path: `${OUT}/${name}.png` });
  return gated;
}

try {
  await waitReady();
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.setViewport({ width: 1280, height: 800 });

  // 1+2: the same build twice -> this run's own noise floor.
  const g1 = await shoot(page, 'A1-godrays-on');
  const g2 = await shoot(page, 'A2-godrays-on-again');
  console.log(`  state: tier=${g1.tier} sunAboveHorizon=${g1.sunUp}`);
  if (g1.tier !== 'high' || g1.sunUp !== true) {
    console.error('✖ COULD NOT CHECK — the GodRays preconditions were never met (tier or horizon gate).');
    console.error('  A frame captured with the pass unmounted cannot answer whether the pass composites.');
    code = 3;
    throw new Error('preconditions');
  }

  // 3: the same build with the ONE element removed.
  writeFileSync(SRC, original.split(GODRAYS_GUARD).join(GODRAYS_GUARD_OFF), 'utf8');
  patched = true;
  const after = readFileSync(SRC, 'utf8');
  if (after.includes(GODRAYS_GUARD) || !after.includes(GODRAYS_GUARD_OFF)) throw new Error('patch did not take — refusing to report');
  await delay(2500); // vite HMR / reload
  await shoot(page, 'B-godrays-off');

  // ── THE VERDICT, rebuilt twice because the first two were unsound ───────────────────────────────
  //
  // v1 compared whole-frame means with a broken control (the patch made GodRays an undefined component,
  // so React tore down the whole EffectComposer and the "without" frame had NO postprocessing: sky fell
  // 150.2 -> 18.7). It reported 9.59x and "it works".
  //
  // v2 fixed the patch and reported 1.23x and "it is inert". Also unsound: the "noise floor" was two
  // captures of a LIVE game 30s apart, i.e. scene animation, and it was spatially structured — 0.74 in
  // far sky against 10.44 on the sun disc. The drift was largest exactly where the effect lives.
  //
  // v3 added capture mode, which works: far sky between two shots is 0.002, byte-stable. But the sun
  // disc still differed by 46.74 between them, because EVERY SHOT IS A FRESH BOOT and the player settles
  // in a slightly different place, moving the sun's screen position. Whole-frame means are therefore
  // dominated by where the camera landed, not by the pass.
  //
  // So the verdict is now built on a BOOT-IDENTITY CONTROL instead of an assumption. A patch of far sky
  // on the opposite side from the sun is a region GodRays cannot reach; if two frames agree there, they
  // are the same world seen from the same place and their differences elsewhere are attributable. If
  // they disagree, the boots diverged and the pair is NOT comparable — which exits 3, never 0. That is
  // the check whose absence made v2 and v3 confident about opposite conclusions.
  const region = (a, b, r) => meanDiff2(a, b, ...r);
  const SKY = [300, 60, 560, 220];          // opposite the sun; GodRays cannot reach it
  const CORRIDOR = [600, 420, 960, 700];    // down-left of the sun, where shafts fall
  const HALO = [860, 340, 1200, 570];

  const A1 = `${OUT}/A1-godrays-on.png`, A2 = `${OUT}/A2-godrays-on-again.png`, B = `${OUT}/B-godrays-off.png`;
  const bootAA = region(A1, A2, SKY);
  const bootAB = region(A1, B, SKY);
  console.log(`  boot identity (far sky)  A1~A2: ${bootAA.toFixed(3)}   A1~B: ${bootAB.toFixed(3)}  (want < 0.5)`);

  if (bootAB > 0.5) {
    console.error('✖ COULD NOT CHECK — the with/without pair did not boot to the same world state.');
    console.error('  Far sky, which GodRays cannot touch, differs between them, so any difference');
    console.error('  elsewhere is the camera, not the pass. Re-run; do not report a ratio from this.');
    code = 3;
    throw new Error('boots diverged');
  }

  const noiseC = bootAA > 0.5 ? null : region(A1, A2, CORRIDOR);
  const effC = region(A1, B, CORRIDOR);
  const effH = region(A1, B, HALO);
  console.log(`  shaft corridor   noise: ${noiseC === null ? 'n/a (A2 boot diverged)' : noiseC.toFixed(3)}   effect: ${effC.toFixed(3)}`);
  console.log(`  halo around sun                          effect: ${effH.toFixed(3)}`);
  console.log(`  sky luminance  on: ${meanLuma(A1, ...SKY).toFixed(1)}   off: ${meanLuma(B, ...SKY).toFixed(1)}\n`);

  // The comparison is against the BOOT-IDENTITY floor, which is what "these two frames are the same
  // scene" costs in this run. An effect an order of magnitude above it is the pass doing something.
  const floor = Math.max(bootAB, 0.05);
  if (effC > floor * 5) {
    console.log(`✅ GodRays COMPOSITES at postprocessing 6.39.5 — the shaft corridor moves ${(effC / floor).toFixed(0)}x`);
    console.log('   the boot-identity floor when the pass is removed. The 6.39.4 regression is NOT present.');
    console.log(`   It is a SMALL effect in absolute terms (${effC.toFixed(2)} mean abs channel diff over that`);
    console.log('   region) — real, localised, and invisible to any whole-frame statistic. Do not re-derive');
    console.log('   this with a frame mean; that is what produced two opposite wrong answers before.');
  } else {
    console.log('❌ GodRays appears INERT — the shaft corridor does not move when the pass is removed.');
    console.log('   That is the 6.39.4 signature. See OPEN-ITEMS OI-03b before trusting the pin.');
    code = 1;
  }
  console.log(`   frames: ${OUT}/  (open them — a ratio is not a look)`);
} catch (e) {
  if (code !== 3) { console.error('GODRAYS-PROBE ERROR:', e.message); code = code || 1; }
} finally {
  if (patched) {
    copyFileSync(BAK, SRC);
    const restored = readFileSync(SRC, 'utf8') === original;
    console.log(restored ? '  source restored byte-identical' : '  ⚠ RESTORE FAILED — GameScene.jsx is still patched');
    if (!restored) code = 1;
  }
  await shutdown(browser);
}
process.exit(code);
