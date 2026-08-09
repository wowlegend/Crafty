import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { evaluateCaptureFreshness } from '../../src/devtest/captureFreshness.js';
import { VISUAL_STATES } from '../../src/devtest/visualStates.js';

// S1-D states (all SIGNED OFF + baselined 2026-06-02): `spell-cast` (M1/M2 spell-VFX spine +
// cast-arc, re-baselined after the #1 premium-energy polish), `title-mascot` (the chosen
// "Crafty Hero" brand-face studio frame — direction B; the A/C mockups were deleted; gem-glow
// boosted per Kevin), and `menu` (now embeds a live mini-canvas of the Crafty Hero, so it
// legitimately changed — re-baselined with the mascot). All asserted as regression baselines below.
// `loot-showcase` (S2-A-M4b / closes the M3c eyeball gap) is a NEW deterministic gate state:
// four rarity drop-beams side by side in a sky studio, frozen byte-stable in capture. It asserts
// a regression baseline below.
//
// ALL 31 CAPTURED STATES NOW ASSERT (2026-08-02). Until today, 7 of the 31 were captured AND baselined
// but absent from STATES, so they asserted nothing — 23% of the gate's apparent coverage was decorative.
// Capture is not a gate. The seven were:
//   1-3. `explore-day-med`, `explore-day-low`, `explore-night-low` — the M4b forced-tier frames, held
//        from 2026-06-22 pending ratification of the med/low look.
//   4-7. `beast-fire`, `beast-ice`, `beast-lightning`, `beast-arcane` — the WILDHEART roster, committed
//        2026-06-17 by 2e0317fc as "review artifacts" and never promoted. No hold was ever recorded for
//        these; they were simply forgotten, which is how a 3-frame documented exception silently became 7.
// All were deterministic and self-consistent on re-capture, and all diffed clean against their committed
// baselines, so promotion costs nothing and buys 7 real regression gates.
//
// PROMOTION IS NOT AESTHETIC APPROVAL. A baseline says "do not let this change WITHOUT NOTICING"; it does
// not say the look is final. If the med/low tiers or the beast silhouettes are later re-art-directed, the
// gate goes red, the frames are reviewed, and they are re-baselined — which is the process working, not an
// obstacle. Holding a frame OUT of STATES to preserve the option of changing it later buys nothing: it was
// already changeable, just unguarded.
// The list now lives in src/devtest/visualStates.js so a GATE can reconcile it against the baselines
// that actually exist on disk. As a literal in this file nothing could compare it against reality, which
// is how seven baselined frames sat outside it for weeks asserting nothing.
const STATES = VISUAL_STATES;
// v7-S3.5a: spell-iceball/lightning/arcane added — per-element frozen-cast frames so the per-element
// spell-VFX redesigns (S3.5 ice shards / S3.6 lightning wire / S3.7 arcane rune-wheel) are gated
// (previously only spell-cast=fireball was captured). Cast-isolation in spawnDeterministicCast keeps
// each frame to one element.
// 'mobile' (the touch-overlay frame) gate-blessed iter 137: lucide gold-glyph near-black buttons +
// joystick base ring + center crosshair; the colliding desktop HUD (minimap / XP bar / keyboard
// cheatsheet / left tool-column) is hidden on touch via isTouchUIMode. Joystick-ring crispness is a
// minor M2b refinement. The 17 desktop frames stay byte-identical (the touch gates are isTouchUIMode-off there).
const DIR = resolve(process.cwd(), 'tests/visual');
const DIFF_DIR = resolve(DIR, 'diff'); // transient failure artifacts; gitignored alongside current/
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

      // WRITE THE DIFF IMAGE WHEN — AND ONLY WHEN — THE FRAME IS RED.
      //
      // Every diagnosis in the 2026-08 determinism investigation required cropping the two PNGs by hand
      // in an out-of-band script, because a bare percentage cannot say WHAT moved. The one time it was
      // guessed instead of cropped, the guess was wrong three times running. This makes the artifact a
      // by-product of the failure rather than a thing someone has to think to produce.
      //
      // TWO-PASS on purpose: pass 1 passes `null` for the output buffer, so the ordinary green path
      // allocates nothing (31 frames x 1MP x 4 bytes is not free). Only a red frame pays for a buffer.
      //
      // mkdirSync FIRST: writeFileSync does NOT create parent directories. Without this the write
      // ENOENTs and REPLACES the failure it exists to explain with a filesystem error — the diagnostic
      // would destroy the diagnosis.
      let diffPath = null;
      if (ratio >= THRESHOLD) {
        mkdirSync(DIFF_DIR, { recursive: true });
        const out = new PNG({ width: base.width, height: base.height });
        const again = pixelmatch(base.data, cur.data, out.data, base.width, base.height, {
          threshold: 0.1,      // identical to pass 1 — the artifact must describe the number that failed
          alpha: 0.35,         // faded original underneath, so the diff is readable in context
          diffMask: false,
          diffColorAlt: [0, 255, 0], // green where CURRENT is darker than baseline; red where lighter
        });
        // pixelmatch increments its counter outside every `if (output)` guard, so the two passes cannot
        // legitimately disagree. If they ever do, the image is not describing the failure and is worse
        // than no image at all.
        expect(again, 'the diff image does not match the ratio that failed').toBe(diff);
        diffPath = resolve(DIFF_DIR, `${state}.png`);
        writeFileSync(diffPath, PNG.sync.write(out));
      }
      // A bare percentage is not a diagnosis, and on 2026-08-02 it actively misled: `landmark` failed at
      // 6.29% then 6.27% with ZERO source changes, which reads exactly like a renderer regression from the
      // dependency bump in the same window. Opening the two PNGs took one minute and showed the real cause
      // — the capture had caught a dynamic rain storm mid-run, toast and all. So the failure now says where
      // to look FIRST, because the number cannot distinguish "the render changed" from "the scene did".
      expect(
        ratio,
        `${state} differs ${(ratio * 100).toFixed(2)}% (threshold ${THRESHOLD * 100}%).\n` +
          `  LOOK AT THE FRAMES BEFORE DIAGNOSING — the percentage cannot tell you WHAT moved:\n` +
          `    baseline: tests/visual/${'baseline'}/${state}.png\n` +
          `    current:  tests/visual/${'current'}/${state}.png\n` +
          `    DIFF:     tests/visual/diff/${state}.png   <- open this one first\n` +
          `              red = current is LIGHTER than baseline, green = DARKER, yellow = anti-aliased\n` +
          `  Known non-render causes of a whole-frame diff, in order of how often they bite:\n` +
          `    1. a transient world event fired mid-capture (weather, a notification toast, a spawn)\n` +
          `    2. the frame is genuinely re-art-directed -> review it, then re-baseline deliberately\n` +
          `    3. machine load skewed a load-sensitive frame -> re-run before believing it\n` +
          `  A diff confined to one band is usually HUD/CSS; a diff spanning the whole frame is the scene.`
      ).toBeLessThan(THRESHOLD);
    });
  }
});
