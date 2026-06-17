import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

// S1-D states (all SIGNED OFF + baselined 2026-06-02): `spell-cast` (M1/M2 spell-VFX spine +
// cast-arc, re-baselined after the #1 premium-energy polish), `title-mascot` (the chosen
// "Crafty Hero" brand-face studio frame — direction B; the A/C mockups were deleted; gem-glow
// boosted per Kevin), and `menu` (now embeds a live mini-canvas of the Crafty Hero, so it
// legitimately changed — re-baselined with the mascot). All asserted as regression baselines below.
// `loot-showcase` (S2-A-M4b / closes the M3c eyeball gap) is a NEW deterministic gate state:
// four rarity drop-beams side by side in a sky studio, frozen byte-stable in capture. It asserts
// a regression baseline below.
//
// The M4b forced-tier frames -- `explore-day-med`, `explore-day-low`, `explore-night-low` -- are
// captured + baselined (deterministic), but are INTENTIONALLY omitted from STATES (the same
// pattern title-mascot used) so they do NOT yet assert a regression baseline: Kevin ratifies the
// med/low look before they are gate-blessed (promoted into STATES). They are self-consistent on
// re-capture; their committed PNGs are the review artifacts.
const STATES = ['menu', 'explore-day', 'explore-night', 'boss-obsidian', 'character-closeup', 'boss-closeup', 'primitives-showcase-en', 'primitives-showcase-zh', 'inventory-open', 'achievements-open', 'spell-cast', 'title-mascot', 'loot-showcase', 'hearth', 'biome-snow', 'ocean-depth', 'ocean-coast', 'landmark', 'mobile', 'mob-bestiary', 'progression-open'];
// 'mobile' (the touch-overlay frame) gate-blessed iter 137: lucide gold-glyph near-black buttons +
// joystick base ring + center crosshair; the colliding desktop HUD (minimap / XP bar / keyboard
// cheatsheet / left tool-column) is hidden on touch via isTouchUIMode. Joystick-ring crispness is a
// minor M2b refinement. The 17 desktop frames stay byte-identical (the touch gates are isTouchUIMode-off there).
const DIR = resolve(process.cwd(), 'tests/visual');
const THRESHOLD = 0.06; // max 6% of pixels may differ before a state is flagged

describe('visual regression', () => {
  for (const state of STATES) {
    it(`${state} matches baseline within ${THRESHOLD * 100}%`, () => {
      const basePath = resolve(DIR, 'baseline', `${state}.png`);
      const curPath = resolve(DIR, 'current', `${state}.png`);
      expect(existsSync(basePath), `missing baseline ${state}`).toBe(true);
      expect(existsSync(curPath), `missing current ${state} — run npm run visual:capture first`).toBe(true);
      const base = PNG.sync.read(readFileSync(basePath));
      const cur = PNG.sync.read(readFileSync(curPath));
      expect(cur.width, 'width').toBe(base.width);
      expect(cur.height, 'height').toBe(base.height);
      const diff = pixelmatch(base.data, cur.data, null, base.width, base.height, { threshold: 0.1 });
      const ratio = diff / (base.width * base.height);
      expect(ratio, `${state} differs ${(ratio * 100).toFixed(2)}%`).toBeLessThan(THRESHOLD);
    });
  }
});
