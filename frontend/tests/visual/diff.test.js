import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

// NOTE: `spell-cast` (S1-D-M2) is captured + verified deterministic, but its baseline is
// INTENTIONALLY not committed by the implementer — it is the human eyeball + baseline gate
// for the spell VFX look (the whole point of the state). Until the controller baselines
// tests/visual/baseline/spell-cast.png, this one state reports missing-baseline (red); the
// EXISTING 10 stay green. Once baselined it diffs like the rest.
//
// NOTE: `mascot-a` / `mascot-b` / `mascot-c` (S1-D) are THROWAWAY direction mockups that
// the capture script ALSO produces (tests/visual/current/mascot-{a,b,c}.png), but they are
// DELIBERATELY OMITTED from STATES below so they are NOT asserted as regression baselines —
// 2 of the 3 get deleted once Kevin picks a direction. To prune later: delete the two
// unchosen mascot files in src/render/mascots/, drop their entries from the `showMascot`
// switch + the capture.mjs loop, and (if no longer needed) the studio + hook.
const STATES = ['menu', 'explore-day', 'explore-night', 'boss-obsidian', 'character-closeup', 'boss-closeup', 'primitives-showcase-en', 'primitives-showcase-zh', 'inventory-open', 'achievements-open', 'spell-cast'];
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
