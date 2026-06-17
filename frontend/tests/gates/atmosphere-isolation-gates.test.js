import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
// These gates are STATIC (source text) so they run GPU-free in CI; the puppeteer visual
// gate covers the pixels (explore frames unchanged; the 3 studio frames lose the motes).

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

describe('W2-T1 hemisphere bounce light', () => {
  it('W2-T1 Atmosphere mounts a mood-driven hemisphereLight', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/render/Atmosphere.jsx'), 'utf8');
    expect(src).toMatch(/hemisphereLight/);
    expect(src).toMatch(/groundColor/);
  });
});
