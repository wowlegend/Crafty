import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

// Per-state diff thresholds (fraction of pixels allowed to differ before a state is flagged).
//
// Calibrated against the EMPIRICAL clean-run noise floor of each state under the dev
// capture-determinism layer (seeded RNG + paused physics/clock + pinned camera + no film
// grain/shadows in capture mode). The menu is pure DOM/UI and is rock-stable (<0.5% cross-run).
// The in-world frames carry an IRREDUCIBLE SwiftShader cross-process rasterization noise on
// voxel block edges (anti-aliasing-class sub-pixel differences between separate browser
// launches) — every app-side source was eliminated (geometry/lights/chunks/camera are
// byte-identical across runs; same-session frames diff <0.1%), yet the bright daytime frame's
// block-edge AA still churns ~10-13%. The thresholds sit above each state's measured floor with
// margin, while staying FAR below the regression signal (a real change such as day->night diffs
// ~52% at pixelmatch threshold 0.1 — a >3x margin over the day gate), so the suite still goes
// RED on genuine visual regressions.
//   measured clean noise @ pixelmatch threshold 0.1:  menu ~0.4%   day ~14%   night ~6%
//   measured day->night SIGNAL @ same setting:        ~52%
const STATE_THRESHOLDS = {
  menu: 0.04,            // UI is deterministic; keep tight
  'explore-day': 0.18,   // bright voxel-edge AA noise floor ~13% + margin
  'explore-night': 0.10, // darker terrain hides edge AA; floor ~6% + margin
};
const STATES = Object.keys(STATE_THRESHOLDS);
const DIR = resolve(process.cwd(), 'tests/visual');

describe('visual regression', () => {
  for (const state of STATES) {
    const THRESHOLD = STATE_THRESHOLDS[state];
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
