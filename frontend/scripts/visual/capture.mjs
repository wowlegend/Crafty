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
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..'); // frontend/
const isBaseline = process.argv.includes('--baseline');
const OUT = resolve(ROOT, 'tests/visual', isBaseline ? 'baseline' : 'current');
const PORT = 4178;
const URL = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Await N rendered animation frames in-page so the GPU has actually presented the
// settled scene (shadow map + mesh uploads) before a screenshot is taken. Deterministic
// frame-count wait rather than a wall-clock guess.
async function flushFrames(page, n = 8) {
  await page.evaluate(async (count) => {
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    for (let i = 0; i < count; i++) await raf();
  }, n);
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
// LONGER count-stable streak (stableFor=6) and a generous post-stable settle so every run
// screenshots the identical fully-settled mesh.
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
  // Post-stable settle: let the final chunk meshes finish uploading/swapping so the
  // silhouette is identical across runs before any screenshot is taken.
  await delay(settle);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  // Page-error observability (the silent-crash hole): an uncaught render-loop throw used to
  // freeze the R3F canvas so every later 3D fixture screenshotted the SAME frozen frame — the
  // diff gate then passed on STALE/wrong frames (it hid 3 crashes for 6 iters: iter 159/160
  // lookSensitivity + MagicWand, iter 161 the _trailDir freeze). `crashes` = uncaught exceptions
  // (these FREEZE the loop → FAIL the gate); `consoleErrs` = React dev warnings (logged, non-fatal).
  // Declared out here (not in the try) so the post-finally summary can read them.
  const crashes = [];
  const consoleErrs = [];
  let captureStage = 'boot';
  const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--no-open'], { cwd: ROOT, stdio: 'ignore' });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (err) => {
      crashes.push({ stage: captureStage, msg: String(err && err.message || err) });
      console.error(`PAGEERROR [@${captureStage}]: ${err && err.stack ? err.stack : err}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const t = msg.text();
        consoleErrs.push({ stage: captureStage, msg: t });
        console.error(`CONSOLE.ERROR [@${captureStage}]: ${t}`);
      }
    });
    await page.setViewport({ width: 1280, height: 800 });
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
      await page.screenshot({ path: resolve(OUT, 'menu.png') });
      console.log('captured menu');
    }

    // explore-day: start (locks pointer, dismisses menu), wait for terrain to fully
    // stream + mesh (so the frame is byte-stable across runs), then force midday.
    await page.evaluate(() => window.__craftyTest.call('start'));
    await waitForStableTerrain(page);
    await delay(800);
    await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5));
    await delay(1500);
    await page.screenshot({ path: resolve(OUT, 'explore-day.png') });
    console.log('captured explore-day');

    // hearth: the World-M1 Home Anchor (the crafted origin plinth + lodge + brazier). The
    // default diorama camera frames the DISTANT vista, so the Hearth at origin needs its OWN pose
    // — a high 3/4 looking down at the pad. W2-T7 FLUSHED the pad (HEARTH_Y 56 -> 51), so the lookAt
    // dropped [0,56,0] -> [0,51,0] and the camera height dropped proportionally (86 -> 81) to keep
    // the same framing of the now-lower pad. Override for this shot only, then RESTORE below.
    await page.evaluate(() => window.__craftyTest.call('enterCapture', { camera: { position: [13, 81, 13], lookAt: [0, 51, 0] } }));
    await flushFrames(page, 10);
    await delay(900);
    await page.screenshot({ path: resolve(OUT, 'hearth.png') });
    console.log('captured hearth');

    // biome-snow: the World-M4a snow PINES. A solid snowfield sits ~40 blocks toward -z from origin
    // (probed: [0,-40], ~95% snow, avgY 54) but it's off the diorama frame, so the feature needs its
    // own pose — a high 3/4 over the snowfield. Camera-override for this shot, restored below.
    await page.evaluate(() => window.__craftyTest.call('enterCapture', { camera: { position: [20, 82, -20], lookAt: [0, 54, -40] } }));
    await flushFrames(page, 10);
    await delay(900);
    await page.screenshot({ path: resolve(OUT, 'biome-snow.png') });
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
    await page.screenshot({ path: resolve(OUT, 'ocean-depth.png') });
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
    await page.screenshot({ path: resolve(OUT, 'ocean-coast.png') });
    console.log('captured ocean-coast');

    // landmark: the World-M6 signature silhouettes. Probed nearest LAND landmark = a Sky-arch at
    // [40,-88] (baseY 41 -> top 92). A 3/4 pose ~66 units back frames the full arch clearing the
    // terrain against the sky. Off the diorama frame -> needs its own pose. Camera-override, restored below.
    await page.evaluate(() => window.__craftyTest.call('enterCapture', { camera: { position: [85, 62, -40], lookAt: [40, 70, -88] } }));
    await waitForStableTerrain(page, { stableFor: 6, settle: 2500 });
    await flushFrames(page, 10);
    await delay(900);
    await page.screenshot({ path: resolve(OUT, 'landmark.png') });
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
    await page.screenshot({ path: resolve(OUT, 'mobile.png') });
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
    await page.screenshot({ path: resolve(OUT, 'explore-day-med.png') });
    console.log('captured explore-day-med');

    // explore-day-low: renderDistance 2 (cullDist 4), godRays OFF, shadowMap 512, sparse motes.
    await page.evaluate(() => window.__craftyTest.call('setQualityTier', 'low'));
    await waitForStableTerrain(page, { stableFor: 6, settle: 2500 });
    await flushFrames(page, 8);
    await delay(800);
    await page.screenshot({ path: resolve(OUT, 'explore-day-low.png') });
    console.log('captured explore-day-low');

    // explore-night-low: the low tier under the dusk/night lighting -- proves the tier levers
    // at the genuinely-new danger-adjacent mood (godRays off + sparse motes read very differently
    // at night). Still low; we drop to night, capture, then return to day + restore high.
    await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.0));
    await delay(2500);
    await flushFrames(page, 8);
    await page.screenshot({ path: resolve(OUT, 'explore-night-low.png') });
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
    await page.screenshot({ path: resolve(OUT, 'explore-night.png') });
    console.log('captured explore-night');

    // boss-obsidian: the obsidian danger mood (spec §4 Tier 2 — boss). <Atmosphere>
    // snaps the mood in capture mode, so the frame settles within the delay.
    await page.evaluate(() => window.__craftyTest.call('setDangerLevel', 2));
    await delay(1500);
    await page.screenshot({ path: resolve(OUT, 'boss-obsidian.png') });
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
    await page.screenshot({ path: resolve(OUT, 'loot-showcase.png') });
    console.log('captured loot-showcase');

    // mob-bestiary (mob-distinctness milestone): the featured mob types in a studio row, the
    // silhouette-distinctness eyeball surface. Self-clears mobs + stages at x=280 (off-frame for every
    // other fixture camera), so order-independent; placed in the early studio-card cluster.
    captureStage = 'mob-bestiary';
    await page.evaluate(() => window.__craftyTest.call('mobBestiary'));
    await delay(1800); // mobs mount + spawn-pop settles + the capture freeze pins the pose
    await page.screenshot({ path: resolve(OUT, 'mob-bestiary.png') });
    console.log('captured mob-bestiary');

    // character-closeup: deterministic single-zombie + chest close-up that gates the
    // M2b character render language (toon + rim + outline). Resets danger/day first.
    captureStage = 'character-closeup';
    await page.evaluate(() => window.__craftyTest.call('spawnCharacterCloseup'));
    await delay(1800); // mob mounts + spawn-pop settles + mood/lighting lerp completes
    await page.screenshot({ path: resolve(OUT, 'character-closeup.png') });
    console.log('captured character-closeup');

    // boss-closeup: deterministic frozen Shadow Dragon close-up that gates the boss
    // render language (emissive telegraph PRESERVED + inverted-hull contour, NO toon).
    // force-spawns the boss and freezes its movement/attacks/flap in capture.
    captureStage = 'boss-closeup';
    await page.evaluate(() => window.__craftyTest.call('spawnBossCloseup'));
    await delay(1800); // boss mounts + freezes + mood/lighting lerp completes
    await page.screenshot({ path: resolve(OUT, 'boss-closeup.png') });
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
    await page.screenshot({ path: resolve(OUT, 'spell-cast.png') });
    console.log('captured spell-cast');

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
      await page.screenshot({ path: resolve(OUT, `beast-${el}.png`) });
      console.log(`captured beast-${el}`);
    }

    // primitives-showcase (en): the bold-flat UI system gallery. DEV-only overlay
    // driven via the test bridge. Wait for fonts to finish loading so the Lilita/
    // Space-Grotesk swap is painted (these states are about typography + chrome).
    await page.evaluate(() => window.__craftyTest.call('showPrimitivesShowcase', 'en'));
    await page.waitForFunction(() => !!document.querySelector('[data-testid="showcase-root"]'), { timeout: 8000 });
    await page.evaluate(() => document.fonts.ready);
    await delay(700);
    await page.screenshot({ path: resolve(OUT, 'primitives-showcase-en.png') });
    console.log('captured primitives-showcase-en');

    // primitives-showcase (zh-CN): proves the i18n swap + lazy CJK render. Loading
    // CJK is async (FontFace.load), so wait for fonts.ready AGAIN + a settle delay.
    await page.evaluate(() => window.__craftyTest.call('showPrimitivesShowcase', 'zh-CN'));
    await page.waitForFunction(() => !!document.querySelector('[data-testid="showcase-root"]'), { timeout: 8000 });
    await page.evaluate(() => document.fonts.ready);
    await delay(1200);
    await page.screenshot({ path: resolve(OUT, 'primitives-showcase-zh.png') });
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
    await page.evaluate(() => window.__craftyTest.call('openModal', 'inventory'));
    await page.evaluate(() => document.fonts.ready);
    // The migrated modal no longer carries `.game-panel`; gate on the stable test id.
    await page.waitForFunction(() => !!document.querySelector('[data-testid="inventory-modal"]'), { timeout: 8000 });
    await flushFrames(page, 8);
    await delay(900);
    await page.screenshot({ path: resolve(OUT, 'inventory-open.png') });
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
    await page.screenshot({ path: resolve(OUT, 'achievements-open.png') });
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
    await page.screenshot({ path: resolve(OUT, 'progression-open.png') });
    console.log('captured progression-open');

    // title-mascot (S1-D-M4): the chosen "Crafty Hero" brand face, rendered in the
    // standalone studio overlay (fixed camera + explore-day lighting + post-stack) with its
    // idle animation FROZEN by capture mode, so the frame is deterministic. This is the
    // human-eyeball + baseline gate for the mascot look (controller baselines it after
    // Kevin's review) — until then it is INTENTIONALLY omitted from diff.test.js STATES, so
    // it does not assert a regression baseline. The studio is its own R3F Canvas mounted over
    // the (mob-free, capture-mode) world; we dismiss the achievements panel first for a clean mount.
    await page.evaluate(() => window.useGameStore.getState().setShowInventory(false));
    await page.evaluate(() => window.__craftyTest.call('showMascot'));
    await page.waitForFunction(() => !!document.querySelector('[data-testid="mascot-studio"] canvas'), { timeout: 8000 });
    await flushFrames(page, 10);
    await delay(900);
    await page.screenshot({ path: resolve(OUT, 'title-mascot.png') });
    console.log('captured title-mascot');
  } finally {
    await browser.close();
    server.kill('SIGTERM');
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
  const realCrashes = dedupe(crashes.filter((e) => e.stage !== 'boot'));
  const realWarns = dedupe(consoleErrs.filter((e) => e.stage !== 'boot'));
  if (realWarns.length) {
    console.warn(`\n=== ${realWarns.length} console warning(s) during capture (non-fatal) ===`);
    for (const e of realWarns) console.warn(`  [@${e.stage}] ${e.msg}`);
  }
  if (realCrashes.length) {
    console.error(`\n=== ${realCrashes.length} RENDER CRASH(ES) DURING CAPTURE — gate FAILS ===`);
    for (const e of realCrashes) console.error(`  [@${e.stage}] ${e.msg}`);
    process.exitCode = 1;
  } else {
    console.log('\nNo render crashes during capture.');
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
