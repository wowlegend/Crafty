import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { evaluateCaptureFreshness } from '../../src/devtest/captureFreshness.js';
import { VISUAL_STATES } from '../../src/devtest/visualStates.js';
import { maxWindowDensity } from '../../src/devtest/diffDensity.js';
import { densityVerdict } from '../../scripts/ci/_density-ratchet.mjs';

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

// PROVENANCE ATTRIBUTION — and the first thing that has ever READ baseline/.capture-meta.json.
//
// A `--baseline` capture has always written a sentinel next to the oracle, and nothing consumed it: the
// comparator hardcodes current/. So the single most useful question after a mass diff — "were these two
// sets of pixels even produced by the same rasteriser?" — had no answer on disk, and a renderer change
// was indistinguishable from a source regression. Both arrive as "31 frames moved".
//
// Reported as ATTRIBUTION, never asserted. A renderer change with all 31 frames still green is evidence
// of ROBUSTNESS; hard-failing on it would mandate a reflexive 31-PNG re-baseline that blesses whatever
// real drift arrived alongside it.
const readMeta = (which) => {
  const p = resolve(DIR, which, '.capture-meta.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
};
const provLine = () => {
  const b = readMeta('baseline')?.provenance;
  const c = readMeta('current')?.provenance;
  if (!b && !c) return '';
  const fmt = (p) => (p ? `${p.renderer || '?'} · ${p.platform || '?'}` : 'not recorded (captured before provenance was tracked)');
  const same = b && c && b.renderer === c.renderer && b.platform === c.platform;
  return (
    `\n  PROVENANCE${same ? ' (matched — the rasteriser is not the cause)' : ' — MISMATCH, read this before diagnosing the code'}:\n` +
    `    baseline captured on: ${fmt(b)}\n` +
    `    this run:             ${fmt(c)}\n`
  );
};
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

// THE CONTACT SHEET — old / new / diff, side by side, for every frame that went red.
//
// A re-baseline is a rewrite of the SPECIFICATION, and until now there was no artifact to review it
// against: the terminal printed a percentage, `current/` is gitignored, and the reviewer's only option was
// to open PNGs one pair at a time from three directories. Measured consequence — 79 of 1,603 commits
// rewrite baselines and 10 of the last 12 bundled the src change that moved the pixels, so nothing
// distinguished an intended look change from a regression the oracle was updated to match.
//
// Written only when something is red, so a green run leaves no litter. Relative <img> paths, because
// diff/ is a sibling of baseline/ and current/ and the sheet must open straight off disk with no server.
const redFrames = [];
const density = [];

// THE FROZEN LEDGER, READ ONCE AND USED IN TWO PLACES.
//
// The ratchet at the bottom of this file asserts against it; the per-frame loop below needs it too, so a
// density-only failure can WRITE the artifact its own error message tells you to open. Until 2026-08-12
// it could not: the diff PNG was written only when the GLOBAL ratio went red, so a frame that failed the
// ratchet alone produced a message reading "Open tests/visual/diff/<state>.png" for a file that did not
// exist. The instruction pointed at nothing, and the first real ratchet failure (ocean-coast, 2.20%) had
// to be diagnosed by hand in an out-of-band script — exactly the cost the contact sheet exists to remove.
const LEDGER = JSON.parse(readFileSync(resolve(DIR, '.density-ledger.json'), 'utf8'));

afterAll(() => {
  // The density table prints on EVERY run, green or red — it is calibration data, and data only collected
  // when something is already broken is collected too late to set a threshold from.
  if (density.length) {
    const rows = [...density].sort((a, b) => b.density - a.density);
    const amp = rows.filter((r) => r.ratio > 0).map((r) => r.density / r.ratio);
    // The banner said "REPORT ONLY, asserts nothing" for four days after the ratchet started asserting.
    // A print statement describing the instrument's own behaviour is a claim, and this one had gone
    // false — a reader deciding whether to trust a green run would have read it and been misled.
    console.log(`\n  WINDOWED DIFF DENSITY (128px window, 32px stride) — RATCHETED per frame against .density-ledger.json`);
    console.log(`  ${'state'.padEnd(24)}${'global'.padStart(10)}${'local max'.padStart(12)}   worst window`);
    for (const r of rows.slice(0, 8)) {
      console.log(
        `  ${r.state.padEnd(24)}${(r.ratio * 100).toFixed(3).padStart(9)}%${(r.density * 100).toFixed(2).padStart(11)}%   at ${r.x},${r.y}`
      );
    }
    const zero = rows.filter((r) => r.density === 0).length;
    console.log(`  ${rows.length} frames measured; ${zero} with no changed pixel anywhere` +
      (amp.length ? `; local/global amplification ${Math.min(...amp).toFixed(1)}x-${Math.max(...amp).toFixed(1)}x` : ''));
  }
  if (!redFrames.length) return;
  const rows = redFrames
    .sort((a, b) => b.ratio - a.ratio)
    .map(
      ({ state, ratio }) => `
  <section>
    <h2>${state} <small>${(ratio * 100).toFixed(3)}% of pixels differ</small></h2>
    <div class="row">
      <figure><img src="../baseline/${state}.png" alt="baseline"><figcaption>baseline (the oracle)</figcaption></figure>
      <figure><img src="../current/${state}.png" alt="current"><figcaption>current (this run)</figcaption></figure>
      <figure><img src="./${state}.png" alt="diff"><figcaption>diff — red: current LIGHTER · green: DARKER · yellow: anti-aliased</figcaption></figure>
    </div>
  </section>`
    )
    .join('\n');
  const html = `<!doctype html><meta charset="utf-8"><title>Crafty visual diff — ${redFrames.length} frame(s) red</title>
<style>
  body{margin:0;padding:2rem;background:#14151a;color:#e8e6e2;font:14px/1.5 ui-sans-serif,system-ui,sans-serif}
  h1{font-size:1.3rem;margin:0 0 .35rem} p.lede{margin:0 0 2rem;color:#a5a29d;max-width:60ch}
  h2{font-size:1rem;margin:2.5rem 0 .6rem;font-weight:600} h2 small{color:#ff6257;font-weight:400;margin-left:.5rem}
  .row{display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem}
  figure{margin:0} img{width:100%;display:block;border:1px solid #2e3037;border-radius:3px;background:#000}
  figcaption{color:#83817d;font-size:.75rem;margin-top:.35rem}
</style>
<h1>${redFrames.length} frame(s) differ from the oracle</h1>
<p class="lede">Look before you re-baseline. A baseline says &ldquo;do not let this change without noticing&rdquo; &mdash;
rewriting one is rewriting the specification, so it belongs in its own commit with a
<code>Baseline-Review:</code> trailer saying what changed and that you opened these.</p>
${rows}
`;
  writeFileSync(resolve(DIFF_DIR, 'index.html'), html);
  console.error(`\n  CONTACT SHEET: tests/visual/diff/index.html (${redFrames.length} frame(s), worst first)`);
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
      // REPORT-ONLY windowed density. Asserts nothing — see src/devtest/diffDensity.js for why a
      // threshold cannot yet be derived from this corpus (global-to-local amplification is 12x-62x).
      const mask = new PNG({ width: base.width, height: base.height });
      pixelmatch(base.data, cur.data, mask.data, base.width, base.height, { threshold: 0.1, diffMask: true });
      const dens = maxWindowDensity(mask.data, base.width, base.height, 128, 32);
      density.push({ state, ratio, density: dens.density, x: dens.x, y: dens.y });

      // A frame is worth an artifact if EITHER gate will fail on it, and the ratchet's comparison is
      // `observed > ledger[state]` — the ledger stores the ALLOWANCE directly. (First draft called
      // frozenFor() here, which is the wrong direction: that helper takes an OBSERVED density and returns
      // what it should be FROZEN at, so it inflated 0.020 to 0.036 and the condition never fired. The
      // mutation check caught it; a green run would not have.) Exceeding the allowance is a failure even
      // when the global ratio is tiny — ocean-coast failed at 2.20% local while moving 0.0425% globally.
      const allowed = LEDGER.frames?.[state];
      const densityRed = allowed != null && dens.density > allowed;

      let diffPath = null;
      if (ratio >= THRESHOLD || densityRed) {
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
        redFrames.push({ state, ratio, density: dens.density, x: dens.x, y: dens.y, densityRed });

        // AND, for a density failure, a ZOOMED CROP of the offending window. A 128px square inside a
        // 1280x800 frame is 1.6% of its area; "at 768,672" is a coordinate a reviewer then has to go
        // find. This writes baseline | current | mask for exactly that window at 3x, which is the crop
        // that identified ocean-coast's change as scattered streaming variance rather than a shader
        // regression — and is otherwise a hand-written script every single time.
        if (densityRed) {
          const WIN = 128, S = 3, PAD = 8;
          const zoom = new PNG({ width: (WIN * 3 + PAD * 2) * S, height: WIN * S });
          zoom.data.fill(0);
          const blit = (src, ox) => {
            for (let y = 0; y < WIN * S; y++) {
              for (let x = 0; x < WIN * S; x++) {
                const sx = dens.x + Math.floor(x / S);
                const sy = dens.y + Math.floor(y / S);
                if (sx >= base.width || sy >= base.height) continue;
                const si = (sy * base.width + sx) << 2;
                const di = (y * zoom.width + (x + ox * S)) << 2;
                zoom.data[di] = src[si]; zoom.data[di + 1] = src[si + 1];
                zoom.data[di + 2] = src[si + 2]; zoom.data[di + 3] = 255;
              }
            }
          };
          blit(base.data, 0); blit(cur.data, WIN + PAD); blit(mask.data, (WIN + PAD) * 2);
          writeFileSync(resolve(DIFF_DIR, `${state}.window.png`), PNG.sync.write(zoom));
        }
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
          `  A diff confined to one band is usually HUD/CSS; a diff spanning the whole frame is the scene.` +
          provLine()
      ).toBeLessThan(THRESHOLD);
    });
  }

  // THE RATCHET. Runs last, so `density` is populated by every frame above.
  //
  // Until now this file computed a windowed local density for every frame and printed it under the words
  // "REPORT ONLY, asserts nothing". The recorded reason was sound and was an objection to a SINGLE
  // THRESHOLD, not to asserting: a TAU of 0.10 reds eight frames, seven of which pass the global gate,
  // because this corpus has no one tolerance -- 18 of 31 frames reproduce with no changed pixel anywhere
  // while explore-day carries 5.13% local terrain-streaming noise.
  //
  // A per-frame ratchet needs no adjudication and invents no tolerance. Each frame is frozen at what it
  // actually does; only a RISE fails. That closes the false-negative class the density instrument was
  // built for: a 248x248 block of a byte-identical frame could change completely and still move only
  // 6% of the frame, so the global gate cannot see it and never could.
  it('no frame has grown a NEW concentration of change (local-density ratchet)', () => {
    expect(density.length, 'no frame was measured — this assertion is running over nothing').toBe(STATES.length);
    const { risen, unfrozen, missing } = densityVerdict(LEDGER.frames, density);
    expect(unfrozen, 'gated state(s) absent from the density ledger — freeze them deliberately: node scripts/visual/freeze-density.mjs').toEqual([]);
    expect(missing, 'frozen state(s) were never measured — a frame has left the corpus and its guard went with it').toEqual([]);
    expect(
      risen.map((r) => `${r.state} ${(r.density * 100).toFixed(2)}% > ${(r.allowed * 100).toFixed(2)}% at ${r.x},${r.y}`),
      'a frame concentrated MORE change into one 128px window than it is frozen at. Open tests/visual/diff/<state>.png\n' +
      '  at the window coordinates above. A rise here can sit far under the global 6% gate and still be a\n' +
      '  real regression — that is the whole reason this assertion exists.'
    ).toEqual([]);
  });
});
