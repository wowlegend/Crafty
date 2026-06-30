import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { evaluateCaptureFreshness } from '../../src/devtest/captureFreshness.js';

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
const STATES = ['menu', 'explore-day', 'explore-night', 'boss-obsidian', 'character-closeup', 'boss-closeup', 'primitives-showcase-en', 'primitives-showcase-zh', 'inventory-open', 'achievements-open', 'spell-cast', 'spell-iceball', 'spell-lightning', 'spell-arcane', 'title-mascot', 'loot-showcase', 'hearth', 'biome-snow', 'ocean-depth', 'ocean-coast', 'landmark', 'mobile', 'mob-bestiary', 'progression-open'];
// v7-S3.5a: spell-iceball/lightning/arcane added — per-element frozen-cast frames so the per-element
// spell-VFX redesigns (S3.5 ice shards / S3.6 lightning wire / S3.7 arcane rune-wheel) are gated
// (previously only spell-cast=fireball was captured). Cast-isolation in spawnDeterministicCast keeps
// each frame to one element.
// 'mobile' (the touch-overlay frame) gate-blessed iter 137: lucide gold-glyph near-black buttons +
// joystick base ring + center crosshair; the colliding desktop HUD (minimap / XP bar / keyboard
// cheatsheet / left tool-column) is hidden on touch via isTouchUIMode. Joystick-ring crispness is a
// minor M2b refinement. The 17 desktop frames stay byte-identical (the touch gates are isTouchUIMode-off there).
const DIR = resolve(process.cwd(), 'tests/visual');
const THRESHOLD = 0.06; // max 6% of pixels may differ before a state is flagged

// FAIL-LOUD freshness gate (KEVIN-REVIEW-BATCH item #12): refuse to diff a STALE/partial/crashed
// capture. capture.mjs writes current/.capture-meta.json (complete:false at START, complete:true only
// at a clean end). Without this, an isolated diff-alone run silently passed on pre-failure frames left
// behind by a crashed/timed-out capture (the iter-105 mount-crash hid for ~4 iters; the 2026-06-28
// heavy-scene capture timeout was the same class). A deliberate diff-alone of a PRIOR good capture still
// passes (its sentinel is complete:true). Logic is unit-tested in src/devtest/captureFreshness.test.js.
describe('visual capture freshness (item #12 fail-loud)', () => {
  it('current/ comes from a fresh, complete, crash-free capture run', () => {
    const metaPath = resolve(DIR, 'current', '.capture-meta.json');
    const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : null;
    const pngInfo = {};
    for (const state of STATES) {
      const p = resolve(DIR, 'current', `${state}.png`);
      pngInfo[state] = existsSync(p) ? { exists: true, mtimeMs: statSync(p).mtimeMs } : { exists: false };
    }
    const { ok, reasons } = evaluateCaptureFreshness(meta, STATES, pngInfo);
    expect(ok, `STALE/incomplete capture -- run \`npm run visual:capture\` first:\n  - ${reasons.join('\n  - ')}`).toBe(true);
  });
});

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
