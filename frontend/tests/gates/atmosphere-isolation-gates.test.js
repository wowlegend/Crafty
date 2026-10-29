import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sourceTexts } from './_srcWalk.js';

// S1-D-M3 follow-up: STUDIO-FIXTURE MOTE ISOLATION.
//
// The always-on warm `<LightMotes>` cloud (a camera-following 46m box) is the explore-scene
// atmosphere signature. It belongs in the IN-WORLD capture frames (explore-day/night,
// boss-obsidian, inventory/achievements-over-world). It must NOT bleed into the three
// SKY-STUDIO subject cards (character-closeup / boss-closeup / spell-cast), which stage a
// frozen hero at y~140 against a clean sky backdrop — there the motes drift across the
// subject and add ~0.25% non-signal noise to the gate.
//
// Fix = declarative identity (coding-overlay "Tell, Don't Ask"): a dedicated `captureStudio`
// store flag the studio-card hooks SET, gating <LightMotes> off — NOT inferring from camera
// position, and NOT piggybacking on `hudHidden` (which is about the HUD, not the scene).
//
// These gates are STATIC (source text) so they run GPU-free in CI; pixels are read on eye-level
// lookbook frames.

const SRC = resolve(process.cwd(), 'src');
const store = () => readFileSync(resolve(SRC, 'store', 'useGameStore.jsx'), 'utf8');
const gameScene = () => readFileSync(resolve(SRC, 'GameScene.jsx'), 'utf8');
const app = () => readFileSync(resolve(SRC, 'App.jsx'), 'utf8');

describe('S1-D-M3 studio-fixture mote isolation', () => {
  it('store defines a captureStudio flag (default false) + its setter', () => {
    const src = store();
    expect(src, 'captureStudio must default to false').toMatch(/captureStudio:\s*false/);
    expect(src, 'setCaptureStudio setter must exist').toMatch(/setCaptureStudio:\s*\(/);
  });

  it('GameScene reads captureStudio from the store (reactive mount toggle)', () => {
    expect(gameScene(), 'GameScene must subscribe to captureStudio')
      .toMatch(/captureStudio\s*=\s*useGameStore\(\s*\(?s\)?\s*=>\s*s\.captureStudio\s*\)/);
  });

  it('LightMotes is suppressed in studio-card captures (gated on !captureStudio)', () => {
    // The mount must be guarded so motes do not render in the sky-studio subject cards.
    expect(gameScene(), '<LightMotes> must be gated behind !captureStudio')
      .toMatch(/!captureStudio\s*&&\s*<LightMotes/);
  });

  it('the three sky-studio closeup hooks declare captureStudio=true', () => {
    const src = app();
    // Each studio-card hook must mark itself a studio shot (not infer it downstream).
    for (const hook of ['spawnCharacterCloseup', 'spawnBossCloseup', 'spawnSpellCast']) {
      const start = src.indexOf(hook);
      expect(start, `${hook} hook must exist`).toBeGreaterThan(-1);
      const block = src.slice(start, start + 1400);
      expect(block, `${hook} must call setCaptureStudio(true)`)
        .toMatch(/setCaptureStudio\(true\)/);
    }
  });

  it('in-world modal captures + exitCapture reset captureStudio=false (motes return)', () => {
    const src = app();
    // openModal (inventory) + openAchievements stage a modal OVER the explore world ->
    // motes belong there, so the studio flag must be cleared; exitCapture restores gameplay.
    for (const hook of ['openModal', 'openAchievements', 'exitCapture']) {
      const start = src.indexOf(`registerTestHook('${hook}'`);
      expect(start, `${hook} hook must exist`).toBeGreaterThan(-1);
      const block = src.slice(start, start + 700);
      expect(block, `${hook} must call setCaptureStudio(false)`)
        .toMatch(/setCaptureStudio\(false\)/);
    }
  });
});

// THE SKY READERS. <Atmosphere> resolves ONE sky frame per frame (render/mood.js sampleMood, at the clock's cycle) and
// publishes a copy (publishSkyFrame -> skyFrameRef); every other reader reads that copy. A second caller of sampleMood
// re-samples with no cycle and so sees the noon frame whatever the hour (a sun billboard at the noon bearing all night).
//   (a) apart from its definition in render/mood.js, exactly one file calls `sampleMood(`, and it is Atmosphere;
//   (b) no file contains `uFresnelDay` (the coast lane's coast-first night gate on its Fresnel; it would be dead weight,
//       and wrong, once night is the clock's and not mood 1);
//   (c) render/Ocean.jsx reads neither `moodRef` nor `sunDirRef` (it reads the frame), and a `uSunColor` there pairs
//       with a `glowColor` read (the glint takes the frame's glow, never a held constant).
// Each holds on `main` in BOTH landing orders of the light and coast lanes, so it binds whichever commits after it.
// Every assertion runs on COMMENT-STRIPPED code (_srcWalk.strip): GameScene.jsx carries a comment naming
// `sampleMood(moodRef)`, and a comment must neither satisfy the presence half nor trip the absence half.
//
// BLIND SPOT: this is source shape. That the readers then DRAW from the frame is the e2e's (tests/e2e/light-script).
describe('the sky readers: one resolved frame, read by everyone (light-colour plan Task 3b)', () => {
  const texts = sourceTexts();
  const of = (file) => texts.find((t) => t.file === file);

  it('walks the real source population', () => {
    console.log(`[sky-readers] ${texts.length} source files under src/ (comment-stripped); Ocean.jsx contains uSunColor: ${/\buSunColor\b/.test(of('render/Ocean.jsx')?.code ?? '')}`);
    expect(texts.length).toBeGreaterThanOrEqual(250);
    expect(of('render/Atmosphere.jsx'), 'SETUP: Atmosphere.jsx not in the walk').toBeDefined();
    expect(of('render/mood.js'), 'SETUP: mood.js not in the walk').toBeDefined();
    expect(of('render/Ocean.jsx'), 'SETUP: Ocean.jsx not in the walk').toBeDefined();
  });

  it('(a) only render/Atmosphere.jsx calls sampleMood( — every other reader reads skyFrameRef', () => {
    const callers = texts.filter((t) => t.file !== 'render/mood.js' && /\bsampleMood\s*\(/.test(t.code)).map((t) => t.file);
    expect(callers, `sampleMood( callers outside mood.js: ${callers.join(', ') || 'none'}`).toEqual(['render/Atmosphere.jsx']);
  });

  it('(b) no file under src/ contains uFresnelDay', () => {
    expect(texts.filter((t) => /\buFresnelDay\b/.test(t.code)).map((t) => t.file)).toEqual([]);
  });

  it('(c) Ocean.jsx reads the frame: no moodRef, no sunDirRef, and a uSunColor pairs with glowColor', () => {
    const ocean = of('render/Ocean.jsx').code;
    expect(/\bmoodRef\b/.test(ocean), 'Ocean.jsx reads moodRef').toBe(false);
    expect(/\bsunDirRef\b/.test(ocean), 'Ocean.jsx reads sunDirRef').toBe(false);
    if (/\buSunColor\b/.test(ocean)) expect(/\bglowColor\b/.test(ocean), 'Ocean.jsx has a uSunColor and no glowColor read').toBe(true);
  });
});

describe('W2-T1 hemisphere bounce light', () => {
  it('W2-T1 Atmosphere mounts a mood-driven hemisphereLight', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/render/Atmosphere.jsx'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toMatch(/<hemisphereLight ref=\{hemiRef\}/);
    // 2026-10-27: the sky and ground colours and the intensity are written by game/lightning.js hemiWithFlash (the
    // lightning flash is added there as white sky light); what it writes is lightning-gates' behavioural cases. This
    // pins that the mood's sky, ground and intensity are what Atmosphere hands it, in that order.
    expect(code, 'the hemisphere is not driven from the mood').toMatch(
      /hemiWithFlash\(hemiRef\.current, m\.hemiSky, m\.hemiGround, m\.hemiIntensity, lightningFlashRef\.current, _flashColor\)/,
    );
  });
});
