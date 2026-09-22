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
const GODRAYS_TAG = '<GodRays sun={sunMesh}';

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

const { url, waitReady, shutdown } = serveVite(PORT);
let browser = null;
let code = 0;
let patched = false;

const original = readFileSync(SRC, 'utf8');
if (!original.includes(GODRAYS_TAG)) {
  console.error(`✖ COULD NOT CHECK — the anchor "${GODRAYS_TAG}" is not in GameScene.jsx.`);
  console.error('  The element was renamed or reformatted. Fix the anchor; do NOT relax it to a bare token.');
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
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.3)); // sun well above the horizon
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 20000 }).catch(() => {});
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
  writeFileSync(SRC, original.split(GODRAYS_TAG).join('<GodRaysDISABLED sun={sunMesh}'), 'utf8');
  patched = true;
  if (readFileSync(SRC, 'utf8').includes(GODRAYS_TAG)) throw new Error('patch did not take — refusing to report');
  await delay(2500); // vite HMR / reload
  await shoot(page, 'B-godrays-off');

  const noise = meanDiff(`${OUT}/A1-godrays-on.png`, `${OUT}/A2-godrays-on-again.png`);
  const effect = meanDiff(`${OUT}/A1-godrays-on.png`, `${OUT}/B-godrays-off.png`);
  const ratio = noise > 0 ? effect / noise : Infinity;

  console.log(`\n  run noise floor (same build, twice) : ${noise.toFixed(4)} mean abs channel diff`);
  console.log(`  GodRays on vs off                   : ${effect.toFixed(4)}`);
  console.log(`  ratio                               : ${ratio === Infinity ? 'inf (byte-identical reruns)' : ratio.toFixed(2)}x\n`);

  if (effect > noise * 3 && effect > 0.05) {
    console.log('✅ GodRays COMPOSITES at postprocessing 6.39.5 — removing it changes the frame far beyond');
    console.log('   this run\'s own rerun noise. The 6.39.4 regression is not present on the shipped pin.');
  } else {
    console.log('❌ GodRays appears INERT — removing it changes the frame no more than re-running it does.');
    console.log('   That is the 6.39.4 signature. Do NOT treat the pin as safe; see OPEN-ITEMS OI-03b.');
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
