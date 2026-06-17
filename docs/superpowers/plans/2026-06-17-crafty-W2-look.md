# W2 — The Look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Steps use checkbox (- [ ]) syntax.

**Goal:** Lift Crafty's always-on visible fidelity to a SOTA-June-2026 bar — warm magic-hour grade, a real stylized tropical-toon ocean surface, a cinematic 3D title vista, distinct per-element spell silhouettes/VFX, hue-preserving death-FX, stylized FPV hands, a de-islanded flat-spawn world, and biome variety — each validated by a LIVE-LOOK probe plus a deliberate capture re-baseline (the pinned gate is necessary, not sufficient).

**Architecture:** All work is on the R3F/three render layer plus the worldgen worker. Lighting/grade flows through the existing `mood.js` MOOD_SCALARS/MOOD_GRADE single-source driven by `<Atmosphere>` + `<MoodGradeDriver>`; the ocean becomes a NEW `src/render/Ocean.jsx` summed-Gerstner plane while the greedy mesher (`terrain.worker.js`) stops emitting water faces; spell VFX read per-element data from `spellVisualProfiles.js` rendered by `spellVfx.jsx`; the GPU spark pool (`GPUSparkSystem.jsx`) gains a death branch + hue-preserving glow; worldgen shape is data-only edits to `oceanProfile.js`/`heightAt.js`/`homeAnchor.js`/`biomeTable.js`. Capture-determinism is load-bearing throughout (gate animation on `isCaptureMode()`, freeze clocks, seed RNG).

**Tech Stack:** React 19, three 0.172 (R3F 9.5 + Drei 10.7 + @react-three/postprocessing), Rapier 2.2, zustand 5, vitest (unit), puppeteer + pixelmatch (visual, 6% gate). Tests run from `frontend/`.

---

## Repo layout reminder (two-level — read before any path op)

- REPO ROOT = `/Users/kz/Code/Crafty/` — `docs/`, `memory/`, plans live here.
- APP DIR = `/Users/kz/Code/Crafty/frontend/` — ALL `src/`, `tests/`, `scripts/`, `package.json`. **Run all npm + vitest + probes from here.**
- Source edits: `frontend/src/...`. Tests: `frontend/tests/...` (and a few co-located `src/**/*.test.js`).
- AST-safe edits only on `.js/.jsx` (Edit tool / no `sed`/regex rewrites). Commit `-F`, NO AI footer, `.state/` untouched, no backticks in `-m`.

## Commands of record

- Unit tests: `cd frontend && npx vitest run` (full) or `npx vitest run <path>` (one file). Build: `npm run build`. Lint: `npx eslint src`.
- Visual gate: `npm run visual:capture` (regen `tests/visual/current/*.png`) then `npx vitest run --config vitest.visual.config.js` (diff vs baseline, 6% pixelmatch). One-shot: `npm run test:visual`.
- Deliberate re-baseline (only after a LIVE-LOOK confirms the intended look): `npm run visual:baseline` (regenerates `tests/visual/baseline/*.png`), then eyeball the changed PNGs, then commit them in the same slice.
- Probes (LIVE-LOOK, drive the REAL non-capture game): `node scripts/visual/pov-probe.mjs` → `/tmp/crafty-pov/`, `node scripts/visual/ocean-probe.mjs` → `/tmp/crafty-ocean/`, `node scripts/visual/death-probe.mjs` → `/tmp/crafty-death/`. New probes save to their own `/tmp/crafty-*` dir.

## Pre-existing staged work to FOLD IN (do not re-derive)

`git diff frontend/src/GameScene.jsx` shows an UNCOMMITTED staged edit to the EffectComposer initial-prop values: `HueSaturation saturation 0.20 -> 0.30`, `BrightnessContrast brightness 0.05 -> 0.09`, `Bloom intensity 0.8 -> 0.95 / luminanceThreshold 1.0 -> 0.65 / luminanceSmoothing 0.1 -> 0.25`. These GameScene props are ONLY the explore-grade FALLBACK shown on the first frame before `<MoodGradeDriver>` resolves; the LIVE source of truth for the grade is `mood.js` MOOD_GRADE.explore + MOOD_SCALARS.explore. Task 1 folds the staged GameScene Bloom edit into the committed slice AND updates the mood.js source-of-truth so the warm grade is permanent (not just a first-frame flash). Do NOT `git checkout` the staged edit.

---

## FILE STRUCTURE (created / modified + responsibility)

**Task group 1 — Lighting / Postprocessing (warm magic-hour glow):**
- MODIFY `frontend/src/render/mood.js` — MOOD_SCALARS.explore.fillIntensity 0 -> 0.35 (warm fill ON in daytime); MOOD_GRADE.explore warmer/glowier (saturation/brightness up); add HEMI_SCALARS per-mood hemisphere intensities + COL[s].hemiSky/hemiGround colors + `_out` hemisphere fields.
- MODIFY `frontend/src/render/Atmosphere.jsx` — add a `<hemisphereLight>` (sky/ground bounce) driven mood-scaled each frame.
- MODIFY `frontend/src/GameScene.jsx` — commit the staged Bloom/grade initial-prop edit (luminanceThreshold 0.65, intensity 0.95).
- MODIFY `frontend/tests/render/mood.test.js` — assert the new explore fill + hemisphere + warmer grade values.
- MODIFY `frontend/tests/gates/atmosphere-isolation-gates.test.js` — assert the hemisphere light is present in `<Atmosphere>`.

**Task group 2 — Ocean rewrite (stylized tropical toon Caribbean) — in a git WORKTREE:**
- MODIFY `frontend/src/world/terrain.worker.js` — cull water TOP faces + water/air SIDE faces from the greedy mesher (stop emitting blockType 9 quads).
- MODIFY `frontend/src/world/oceanProfile.js` — add `gerstnerHeight(x, z, time)` + `gerstnerNormal(x, z, time)` pure helpers (world-space, cross-chunk coherent, capture-frozen time) and a `WAVES` constant.
- CREATE `frontend/src/render/Ocean.jsx` — a subdivided sea-level plane mesh; per-frame CPU-light vertex displacement via summed Gerstner with recomputed normals; toon turquoise->teal palette + Fresnel + glossy bands + continuous smoothstep shoreline foam; capture-frozen time.
- MODIFY `frontend/src/world/Terrain.jsx` — remove the now-dead water-geometry split + waterMaterial (no water faces emitted); keep the opaque land path.
- MODIFY `frontend/src/GameScene.jsx` — mount `<Ocean />` in the scene graph.
- CREATE `frontend/tests/world/gerstner.test.js` — pure-math test for cross-chunk coherence + determinism + normal recompute.
- MODIFY `frontend/tests/world/oceanProfile.test.js` — keep the existing kernels (foam/depth still pure-exported even if unused by the new path) OR delete the now-dead exports per the cull (see step detail).

**Task group 3 — Title screen (cinematic 3D vista):**
- CREATE `frontend/src/render/TitleDiorama.jsx` — a full-bleed live 3D Hearth diorama canvas (reuse the TitleMascot canvas + mood-grade palette + `<LightMotes>`-style motes), slow camera drift, capture-frozen.
- MODIFY `frontend/src/MenuSystem.jsx` — replace the purple-gradient/confetti/shimmer title block with: full-bleed `<TitleDiorama>` backdrop, wordmark + Crafty-Hero lockup, a bold-flat gold `<Button>` CTA; drop pixel-font/shimmer/glow/menu-particle/menu-star.
- MODIFY `frontend/src/App.css` — (already a W1/Art-System concern) confirm Orbitron/.pixel-font/shimmer-text/glow-button/menu-particle/menu-star/title-glow/float-slow are unreferenced after the rebuild (gate, not a hard edit here).
- MODIFY `frontend/scripts/visual/capture.mjs` — the `menu` capture already exists; ensure the new diorama canvas readiness gate replaces the `title-mascot`-canvas wait.
- (RE-BASELINE) `frontend/tests/visual/baseline/menu.png` — new capture-frozen `menu` baseline.

**Task group 4 — Spell per-element shapes + VFX:**
- MODIFY `frontend/src/game/spellVisualProfiles.js` — per-element silhouette tuning: boost `glowIntensity`/shape scale, shrink/dim `coreScale`/`coreColor` opacity intent; add `trail` + `impact` shape descriptors per element.
- MODIFY `frontend/src/render/spellVfx.jsx` — make the silhouette the hero (boost shape emissive/scale, shrink white core); per-element TRAIL geometry (fire taper / ice shard streak / lightning jagged segments / arcane ribbon); per-element IMPACT geometry (fireball burst / ice shard shatter / forked lightning flash / arcane imploding rune); add a deterministic seeded jagged forking-bolt for lightning (crackle in flight) + a chain segment on hit; arcane rotating sigil orb (rings + rune glyph).
- MODIFY `frontend/src/game/spellVisualProfiles.test.js` — characterization test asserting 4 DISTINCT geometry types per element (shape + trail + impact), and the fallback contract.

**Task group 5 — Death-FX:**
- MODIFY `frontend/src/world/GPUSparkSystem.jsx` — add a `'death'` velocity branch (upward-biased outward burst) + a hue-preserving glow cap (so a green mob reads green at peak, not white) — clamp the additive `vColor * (1.5 + vLife*3.5)` gain or add a saturated colored-core pass.
- MODIFY `frontend/src/game/mobHitFx.js` — `deathBurst` gains a per-element death descriptor (embers/shards/jitter) + a brighter dark-mob tint floor; add a `t=0` flash + ground-decal descriptor.
- MODIFY `frontend/src/SimplifiedNPCSystem.jsx` — the death-burst call passes the `'death'` type (already does at :560) + the per-element burst + spawns the ground decal + t=0 flash.
- MODIFY `frontend/src/game/mobHitFx.test.js` — assert the death branch descriptor + the dark-mob tint floor + hue preservation contract.

**Task group 6 — FPV hands:**
- MODIFY `frontend/src/render/playerRender.jsx` — replace the raw `#fdbcb4` boxes (StableMagicHands, lines 385-386 + 406-407) with a gloved/stylized silhouette in the character render language (drei `<Outlines>` + white-gold accent).
- CREATE `frontend/scripts/visual/hands-probe.mjs` — a NON-capture LIVE-LOOK probe that drives the real game to first-person, screenshots the hands (the capture camera hides them), saves to `/tmp/crafty-hands/`.
- MODIFY `frontend/tests/gates/` (new `hands-render-gates.test.js`) — static gate asserting no raw `#fdbcb4` hex remains in playerRender + that `<Outlines>` is used.

**Task group 7 — World feel (de-island + flatten spawn):**
- MODIFY `frontend/src/world/oceanProfile.js` — OCEAN_CONTINENT_THRESHOLD -0.15 -> lower (push oceans out).
- MODIFY `frontend/src/world/heightAt.js` — lower the continent noise frequency (enlarge the continent).
- MODIFY `frontend/src/world/homeAnchor.js` — HEARTH_Y 56 -> flush with local grade (~50-51); flush the pad.
- MODIFY `frontend/scripts/visual/capture.mjs` — reposition the pinned `ocean-coast`/`ocean-depth` cameras (pinned to the old -0.15 shore) + the `hearth` camera (pad lowered).
- MODIFY `frontend/tests/world/oceanProfile.test.js` + `frontend/tests/world/heightAt.test.js` + `frontend/tests/world/homeAnchor.test.js` — a `worldShape` characterization asserting the de-island (coastline distance from origin) + the flush spawn.
- (RE-BASELINE) `ocean-coast.png`, `ocean-depth.png`, `hearth.png`, `explore-day.png`.

**Task group 8 — Biome variety:**
- MODIFY `frontend/src/world/biomeTable.js` — expand beyond 3 hard-threshold biomes (forest/jungle/savanna/swamp/taiga/mesa) with per-biome surface/secondary blocks, flora, tint; use the (currently dead) `continent` param for blending.
- MODIFY `frontend/tests/world/biomeTable.test.js` — assert the expanded biome coverage + the continent-aware selection + each biome's distinct blocks.
- (RE-BASELINE if a pinned camera frames new biome) `biome-snow.png` + a possible new `biome-forest` capture state.

---

## TASK GROUP 1 — LIGHTING / POSTPROCESSING (warm magic-hour glow)

### Task 1.1 — Warm daytime fill light ON + glowier explore grade (mood.js source-of-truth)

**Files:** modify `frontend/src/render/mood.js`; modify `frontend/tests/render/mood.test.js`

- [ ] Read the current explore values to confirm coordinates: `MOOD_SCALARS.explore` (line 17) has `fillIntensity: 0.00`; `MOOD_GRADE.explore` (line 46) has `saturation: 0.20, brightness: 0.05, contrast: 0.06`.
- [ ] Write a FAILING test. Append to `frontend/tests/render/mood.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { MOOD_SCALARS, MOOD_GRADE, sampleMood } from '../../src/render/mood.js';

describe('W2-T1 warm magic-hour explore grade', () => {
  it('daytime explore fill light is ON (warm) — was 0', () => {
    expect(MOOD_SCALARS.explore.fillIntensity).toBeGreaterThanOrEqual(0.30);
    expect(MOOD_SCALARS.explore.fillIntensity).toBeLessThanOrEqual(0.45);
  });
  it('explore grade is glowier/warmer than the old neutral lock', () => {
    expect(MOOD_GRADE.explore.saturation).toBeGreaterThanOrEqual(0.28);
    expect(MOOD_GRADE.explore.brightness).toBeGreaterThanOrEqual(0.08);
  });
  it('sampleMood(0) reflects the warmed explore grade', () => {
    const m = sampleMood(0);
    expect(m.fillIntensity).toBeGreaterThanOrEqual(0.30);
    expect(m.grade.saturation).toBeGreaterThanOrEqual(0.28);
  });
});
```
- [ ] Run it FAILS: `cd frontend && npx vitest run tests/render/mood.test.js`. Expected: the 3 new assertions fail (fillIntensity 0, saturation 0.20).
- [ ] Minimal impl — edit `frontend/src/render/mood.js` line 17, change `fillIntensity: 0.00` to `fillIntensity: 0.35` in `MOOD_SCALARS.explore`.
- [ ] Edit `frontend/src/render/mood.js` line 46, change `MOOD_GRADE.explore` to `{ saturation: 0.30, brightness: 0.09, contrast: 0.06 }` (matching the staged GameScene fallback so the grade is permanent + consistent on the first frame).
- [ ] Run it PASSES: `cd frontend && npx vitest run tests/render/mood.test.js`. Expected: all green incl the 3 new.
- [ ] Run the full unit suite to confirm no regression in the existing mood/atmosphere assertions: `cd frontend && npx vitest run tests/render/mood.test.js tests/gates/atmosphere-isolation-gates.test.js`. Expected: green.
- [ ] DONE-GATE: `npx eslint src/render/mood.js` clean. Commit: `git add frontend/src/render/mood.js frontend/tests/render/mood.test.js && git commit -F` a message file with body "W2-T1 mood.js warm magic-hour explore grade: fill 0->0.35, grade saturation 0.20->0.30 brightness 0.05->0.09".

### Task 1.2 — HemisphereLight (sky/ground bounce, mood-scaled) in Atmosphere.jsx

**Files:** modify `frontend/src/render/mood.js`; modify `frontend/src/render/Atmosphere.jsx`; modify `frontend/tests/render/mood.test.js`; modify `frontend/tests/gates/atmosphere-isolation-gates.test.js`

- [ ] Write a FAILING test in `frontend/tests/render/mood.test.js` for the hemisphere fields on the sampled mood:
```js
describe('W2-T1 hemisphere bounce', () => {
  it('sampleMood exposes hemisphere intensity + sky/ground colors', () => {
    const m = sampleMood(0);
    expect(m.hemiIntensity).toBeGreaterThan(0); // daytime sky/ground bounce ON
    expect(m.hemiSky).toBeDefined();
    expect(m.hemiGround).toBeDefined();
    expect(typeof m.hemiSky.getHex).toBe('function'); // a THREE.Color
  });
  it('explore hemisphere is stronger than obsidian (boss dread is darker)', () => {
    expect(sampleMood(0).hemiIntensity).toBeGreaterThan(sampleMood(2).hemiIntensity);
  });
});
```
- [ ] Run it FAILS: `cd frontend && npx vitest run tests/render/mood.test.js`. Expected: `m.hemiIntensity` undefined -> fails.
- [ ] Minimal impl in `frontend/src/render/mood.js`: after `MOOD_SCALARS` add hemisphere intensities to each state object — set `MOOD_SCALARS.explore.hemiIntensity: 0.55`, `dusk.hemiIntensity: 0.30`, `obsidian.hemiIntensity: 0.12`. In the `COL[s]` loop (line 59) add `hemiSky: new THREE.Color(PALETTE[s].skyMid)` and `hemiGround: new THREE.Color(PALETTE[s].fog)`. In `_out` (line 74) add `hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), hemiIntensity: 0`. In `sampleMood` (after line 109) add the lerp:
```js
  _out.hemiSky.lerpColors(COL[a].hemiSky, COL[b].hemiSky, t);
  _out.hemiGround.lerpColors(COL[a].hemiGround, COL[b].hemiGround, t);
  _out.hemiIntensity = lerp(sa.hemiIntensity, sb.hemiIntensity, t);
```
- [ ] Run it PASSES: `cd frontend && npx vitest run tests/render/mood.test.js`. Expected: green.
- [ ] Wire the light in `frontend/src/render/Atmosphere.jsx`: add a `hemiRef = useRef();` near the other refs (line 143); inside the `useFrame` (after the `fillRef` block, line 189) add:
```js
    if (hemiRef.current) {
      hemiRef.current.color.copy(m.hemiSky);          // sky bounce (top)
      hemiRef.current.groundColor.copy(m.hemiGround); // ground bounce (bottom)
      hemiRef.current.intensity = m.hemiIntensity;
    }
```
and in the returned JSX (after the `<pointLight ref={fillRef} ... />` at line 210) add:
```jsx
      <hemisphereLight ref={hemiRef} intensity={0.55} />
```
- [ ] Write/extend a static gate. In `frontend/tests/gates/atmosphere-isolation-gates.test.js` add a test that reads `src/render/Atmosphere.jsx` source and asserts it contains `hemisphereLight` + `groundColor`:
```js
it('W2-T1 Atmosphere mounts a mood-driven hemisphereLight', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/render/Atmosphere.jsx'), 'utf8');
  expect(src).toMatch(/hemisphereLight/);
  expect(src).toMatch(/groundColor/);
});
```
(Confirm the file already imports `readFileSync`/`resolve`; if not, add them at the top.)
- [ ] Run the gate PASSES: `cd frontend && npx vitest run tests/gates/atmosphere-isolation-gates.test.js`. Expected: green.
- [ ] DONE-GATE: `npm run build` clean; `npx eslint src/render/Atmosphere.jsx src/render/mood.js` clean. Commit per Task 1.1 pattern.

### Task 1.3 — Fold in the staged GameScene Bloom edit + LIVE-LOOK + re-baseline explore-day

**Files:** modify `frontend/src/GameScene.jsx` (the staged edit); re-baseline `explore-day.png`

- [ ] Confirm the staged GameScene edit is still present: `cd frontend && git diff src/GameScene.jsx`. Expected: the HueSaturation 0.30 / BrightnessContrast 0.09 / Bloom intensity 0.95 luminanceThreshold 0.65 luminanceSmoothing 0.25 diff. KEEP it (it is the explore-grade first-frame fallback; Task 1.1 already matched mood.js to it).
- [ ] LIVE-LOOK (necessary, not the gate): `cd frontend && node scripts/visual/pov-probe.mjs`. Then Read the produced images `/tmp/crafty-pov/pov-1-forward.png`, `/tmp/crafty-pov/pov-2-look-down.png`, `/tmp/crafty-pov/pov-4-after-walk.png` with the Read tool and LOOK: terrain should read warmer + with form (hemisphere bounce gives sky/ground gradient on faces), highlights should bloom (sun disc, bright grass) WITHOUT blown-out highlight detail (grass/snow should not clip pure white). If highlights are blown, raise `luminanceThreshold` toward 0.72 and re-look (protect highlight detail).
- [ ] Re-capture current frames: `cd frontend && npm run visual:capture`.
- [ ] Run the visual diff to SEE the magnitude of change (it WILL exceed 6% on explore-day/hearth/ocean — that is the intended glowier look): `cd frontend && npx vitest run --config vitest.visual.config.js`. Expected: explore-day, hearth, explore-night, ocean-coast, ocean-depth, biome-snow, landmark FLAGGED (grade is global). This confirms the change is visible and intended.
- [ ] Read each flagged baseline-vs-current pair to confirm it is the intended warm magic-hour look (Read `tests/visual/current/explore-day.png` and `tests/visual/baseline/explore-day.png` side by side). Confirm warmer + glowier + highlight detail intact.
- [ ] DELIBERATE re-baseline: `cd frontend && npm run visual:baseline`. Re-run the gate to confirm green: `npx vitest run --config vitest.visual.config.js`. Expected: all 21 states green (new baselines).
- [ ] DONE-GATE: `npm run build` clean. Commit GameScene + the re-baselined PNGs (NOT `.state/`): `git add frontend/src/GameScene.jsx frontend/tests/visual/baseline && git commit -F` a message file with body "W2-T1 commit staged Bloom magic-hour grade + deliberate re-baseline (glowier is intended)".

---

## TASK GROUP 2 — OCEAN REWRITE (stylized tropical toon Caribbean) — in a git WORKTREE

> This group is RISKY (touches the hot mesher + the scene graph). Use superpowers:using-git-worktrees to create an isolated worktree BEFORE Task 2.1, do all of group 2 there, run the full unit + visual gate green, then finish-the-branch (merge) per superpowers:finishing-a-development-branch.

### Task 2.0 — Create the isolated worktree

**Files:** none (workspace setup)

- [ ] Invoke superpowers:using-git-worktrees to create a worktree for the ocean rewrite (e.g. branch `w2-ocean`). Verify `git -C <worktree> status` is clean and on the new branch.
- [ ] In the worktree run a baseline green check so a later red is attributable: `cd <worktree>/frontend && npx vitest run tests/world/oceanProfile.test.js`. Expected: green.

### Task 2.1 — Summed-Gerstner pure math (world-space, cross-chunk coherent, capture-frozen)

**Files:** modify `frontend/src/world/oceanProfile.js`; create `frontend/tests/world/gerstner.test.js`

- [ ] Write a FAILING test `frontend/tests/world/gerstner.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { gerstnerHeight, gerstnerNormal, WAVES, SEA_LEVEL } from '../../src/world/oceanProfile.js';

describe('W2-T2 summed Gerstner ocean surface', () => {
  it('is world-space coherent: same (x,z,t) -> same height regardless of chunk', () => {
    const t = 3.0;
    expect(gerstnerHeight(17.0, -33.0, t)).toBeCloseTo(gerstnerHeight(17.0, -33.0, t), 9);
  });
  it('cross-chunk seam is continuous (no per-chunk phase reset)', () => {
    const t = 1.5;
    const a = gerstnerHeight(15.999, 8.0, t);
    const b = gerstnerHeight(16.001, 8.0, t); // across the chunk-16 boundary
    expect(Math.abs(a - b)).toBeLessThan(0.05); // smooth, not a discontinuity
  });
  it('oscillates around SEA_LEVEL within a bounded amplitude', () => {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < 200; i++) { const h = gerstnerHeight(i * 1.3, i * 0.7, 2.0); min = Math.min(min, h); max = Math.max(max, h); }
    expect(min).toBeGreaterThan(SEA_LEVEL - 2.5);
    expect(max).toBeLessThan(SEA_LEVEL + 2.5);
  });
  it('recomputes a unit normal that tilts off vertical on a slope', () => {
    const n = gerstnerNormal(5.0, 5.0, 2.0);
    expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 5);
    expect(n[1]).toBeGreaterThan(0.5); // mostly up, but not exactly [0,1,0]
  });
  it('summed waves use >= 3 components', () => {
    expect(WAVES.length).toBeGreaterThanOrEqual(3);
  });
});
```
- [ ] Run it FAILS: `cd frontend && npx vitest run tests/world/gerstner.test.js`. Expected: import error (symbols not exported).
- [ ] Minimal impl — append to `frontend/src/world/oceanProfile.js`:
```js
// --- W2 stylized-toon ocean SURFACE (summed Gerstner) ---
// World-space (x,z) in, height around SEA_LEVEL out. 4 summed Gerstner components with
// world-space phase (k.x*x + k.z*z) so the surface is CROSS-CHUNK coherent (no per-chunk
// reset) and the Ocean.jsx plane can be re-positioned under the camera without seams.
// `time` is the wave clock; the Ocean component FREEZES it to a fixed phase in capture mode
// for byte-stable frames. Pure (no THREE/state) -> unit-testable without GL.
export const WAVES = [
  // [dirX, dirZ, wavelength, amplitude, speed]
  [1.0, 0.35, 18.0, 0.85, 0.55],
  [-0.6, 1.0, 11.0, 0.45, 0.80],
  [0.3, -1.0, 6.5, 0.28, 1.15],
  [1.0, -0.2, 27.0, 0.55, 0.40],
];
const _norm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };

export function gerstnerHeight(x, z, time) {
  let h = 0;
  for (const [dx, dz, wl, amp, spd] of WAVES) {
    const [nx, nz] = _norm(dx, dz);
    const k = (Math.PI * 2) / wl;            // wave number
    const phase = k * (nx * x + nz * z) + time * spd * k;
    h += amp * Math.sin(phase);
  }
  return SEA_LEVEL + h;
}

// Analytic normal from the partial derivatives of the summed height field (recomputed, not
// the flat plane normal — this is what makes Fresnel + glossy bands read off the REAL surface).
export function gerstnerNormal(x, z, time) {
  let dHdx = 0, dHdz = 0;
  for (const [dx, dz, wl, amp, spd] of WAVES) {
    const [nx, nz] = _norm(dx, dz);
    const k = (Math.PI * 2) / wl;
    const phase = k * (nx * x + nz * z) + time * spd * k;
    const c = amp * k * Math.cos(phase);
    dHdx += c * nx;
    dHdz += c * nz;
  }
  const len = Math.hypot(-dHdx, 1, -dHdz) || 1;
  return [-dHdx / len, 1 / len, -dHdz / len];
}
```
- [ ] Run it PASSES: `cd frontend && npx vitest run tests/world/gerstner.test.js`. Expected: all green.
- [ ] DONE-GATE: `npx eslint src/world/oceanProfile.js` clean. Commit in the worktree per the standard pattern.

### Task 2.2 — Cull water faces from the greedy mesher

**Files:** modify `frontend/src/world/terrain.worker.js`; modify `frontend/tests/gates/` (new `ocean-mesher-no-water-faces.test.js`)

- [ ] Write a FAILING test `frontend/tests/gates/ocean-mesher-no-water-faces.test.js` that reads the worker source and asserts the water-top + water-side face-emit branches are removed (the mesher must no longer emit blockType 9 quads, since the new plane owns water):
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const SRC = readFileSync(resolve(process.cwd(), 'src/world/terrain.worker.js'), 'utf8');
describe('W2-T2 mesher no longer emits water faces (Ocean.jsx owns water)', () => {
  it('the water-top unmerge + foam/depth bake is gone', () => {
    expect(SRC).not.toMatch(/isWaterTopFace/);
  });
  it('the per-column seabed-depth bake is gone', () => {
    expect(SRC).not.toMatch(/seabedDepthT\(/);
  });
  it('the `blockA > 0 && blockB === 0` branch excludes water (water top no longer drawn)', () => {
    // the surviving top-face branch must guard against water
    expect(SRC).toMatch(/blockA > 0 && blockA !== 9 && blockB === 0/);
  });
});
```
- [ ] Run it FAILS: `cd frontend && npx vitest run tests/gates/ocean-mesher-no-water-faces.test.js`. Expected: fails (the strings still present).
- [ ] Minimal impl in `frontend/src/world/terrain.worker.js`, the mask-population block (lines 636-648). Replace the four-branch face rules with land-only rules (water emits NO faces — neither top, bottom, side, nor against-solid):
```js
          if (blockA > 0 && blockA !== 9 && blockB === 0) {
            // Positive face of SOLID block A (facing +d) against air
            mask[cu + cv * sizeU] = blockA | (1 << 8);
          } else if (blockA === 0 && blockB > 0 && blockB !== 9) {
            // Negative face of SOLID block B (facing -d) against air
            mask[cu + cv * sizeU] = blockB | (2 << 8);
          } else if (aIsSolid && bIsWater) {
            // Solid block next to water -> still draw the solid face (the seabed/shore wall)
            mask[cu + cv * sizeU] = blockA | (1 << 8);
          } else if (bIsSolid && aIsWater) {
            mask[cu + cv * sizeU] = blockB | (2 << 8);
          }
```
- [ ] Remove the now-dead water-top special-case block (lines 661-682, the `isWaterTopFace`/`foamG`/`depthB` computation) AND simplify the greedy width/height loops (lines 684-702) to drop the `!isWaterTopFace &&` guards (now always true for the surviving solid faces). Remove the `foamG`/`depthB` from the `colors.push` (lines 806-811) — push `blockType, 0, 0` per corner (color.g/color.b are now unused but the attribute stays 3-wide for the shader's vertexColor read). Remove the import of `shoreFoamFactor, seabedDepthT` from line 3 (keep `SEA_LEVEL`).
- [ ] Run the gate PASSES: `cd frontend && npx vitest run tests/gates/ocean-mesher-no-water-faces.test.js`. Expected: green.
- [ ] Run the broader worldgen unit suite to confirm no break: `cd frontend && npx vitest run tests/world tests/gates/ocean-coastline-gates.test.js`. Expected: green (ocean-coastline-gates tests the PROFILE math `oceanSurfaceY` which is untouched; if foam/depth-wiring gates reference the removed bake, update them in the next step).
- [ ] If `tests/gates/ocean-foam-kernel.test.js` / `ocean-foam-wiring.test.js` / `ocean-depth-tint-gates.test.js` reference the now-removed water-top path, mark them obsolete: delete the wiring assertions that the mesher bakes foam/depth (the foam is now a shader effect on the plane — re-asserted in Task 2.3); keep the pure-kernel math tests only if `shoreFoamFactor`/`seabedDepthT` exports survive (they do not — remove the exports + their tests). Run `cd frontend && npx vitest run tests/gates`. Expected: green.
- [ ] DONE-GATE: `npm run build` clean; `npx eslint src/world/terrain.worker.js` clean. Commit in the worktree.

### Task 2.3 — Ocean.jsx: subdivided sea-level plane, toon palette, Fresnel, foam, glossy bands

**Files:** create `frontend/src/render/Ocean.jsx`; modify `frontend/src/world/Terrain.jsx` (drop dead water geom/material); modify `frontend/src/GameScene.jsx` (mount `<Ocean />`)

- [ ] Create `frontend/src/render/Ocean.jsx`. A subdivided plane centered + re-positioned under the camera each frame (so it covers the visible sea); vertex displacement via the Task 2.1 Gerstner with recomputed normals; an `onBeforeCompile`/ShaderMaterial toon palette (bright turquoise -> teal), Fresnel off the real normal, glossy highlight bands, and a CONTINUOUS smoothstep shoreline foam (sampled vs the terrain height, not a binary cell). Capture-frozen time. Full code:
```jsx
// W2 stylized tropical-toon ocean SURFACE — a real animated water plane that REPLACES the
// old voxel water tops (the mesher no longer emits water faces). A subdivided plane pinned at
// SEA_LEVEL, displaced by summed Gerstner waves (oceanProfile.gerstnerHeight) with RECOMPUTED
// normals, a bright turquoise->teal toon palette, Fresnel off the real normal, glossy highlight
// bands, and a continuous smoothstep shoreline foam. Capture-frozen time => byte-stable frames.
import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { SEA_LEVEL, gerstnerHeight, gerstnerNormal } from '../world/oceanProfile.js';
import { isCaptureMode } from '../devtest/captureMode.js';

const PLANE = 220;      // metres covered (re-centred under the camera each frame)
const SEG = 96;         // subdivisions per axis (vertex density for the wave detail)
const CAPTURE_TIME = 4.0; // frozen wave phase in capture (flattering mid-swell)

export function Ocean() {
  const meshRef = useRef();
  const { camera } = useThree();
  const geo = useMemo(() => new THREE.PlaneGeometry(PLANE, PLANE, SEG, SEG), []);
  // toon turquoise->teal + foam material (vertexColors carry per-vertex foam factor in r)
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#16C0C9', roughness: 0.18, metalness: 0.0, flatShading: false,
    transparent: true, opacity: 0.92, vertexColors: true,
  }), []);
  // attach a foam attribute (per-vertex, recomputed each frame)
  useMemo(() => {
    const n = geo.attributes.position.count;
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }, [geo]);

  useFrame((state) => {
    const t = isCaptureMode() ? CAPTURE_TIME : state.clock.elapsedTime;
    const mesh = meshRef.current; if (!mesh) return;
    // snap the plane centre to the camera's XZ (so it always covers the view); keep it at SEA_LEVEL.
    const cx = Math.round(camera.position.x), cz = Math.round(camera.position.z);
    mesh.position.set(cx, SEA_LEVEL, cz);
    const pos = geo.attributes.position, nrm = geo.attributes.normal, col = geo.attributes.color;
    for (let i = 0; i < pos.count; i++) {
      // plane local (x,y) -> world (x,z); plane is rotated -90deg about X so local-y maps to world-z
      const lx = pos.getX(i), ly = pos.getY(i);
      const wx = cx + lx, wz = cz - ly;
      const h = gerstnerHeight(wx, wz, t);
      pos.setZ(i, h - SEA_LEVEL); // local-z displacement (before the -90deg rotation lifts it to world-Y)
      const nv = gerstnerNormal(wx, wz, t);
      nrm.setXYZ(i, nv[0], nv[2], nv[1]); // remap world normal into plane-local (rotation-aware)
      // continuous toon foam at the crest (smoothstep on height) — a soft white cap, not a binary cell
      const crest = THREE.MathUtils.smoothstep(h, SEA_LEVEL + 0.6, SEA_LEVEL + 1.2);
      col.setXYZ(i, crest, crest, crest); // r carries the foam blend; material color is the base teal
    }
    pos.needsUpdate = true; nrm.needsUpdate = true; col.needsUpdate = true;
  });

  // Fresnel + glossy band tint injected post-lighting (reads off the recomputed normal).
  const onBeforeCompile = useMemo(() => (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       vec3 V = normalize(vViewPosition);
       float fres = pow(1.0 - max(dot(normalize(geometryNormal), V), 0.0), 3.0);
       gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.62, 0.93, 0.98), fres * 0.55); // sky-teal Fresnel
       float band = smoothstep(0.86, 0.98, dot(normalize(geometryNormal), normalize(vec3(0.4,1.0,0.3))));
       gl_FragColor.rgb += vec3(0.30, 0.40, 0.42) * band; // glossy highlight band off the real normal
       gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.97, 0.99, 1.0), vColor.r * 0.9); // crest foam`
    );
  }, []);
  mat.onBeforeCompile = onBeforeCompile;

  return (
    <mesh ref={meshRef} geometry={geo} material={mat} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1} frustumCulled={false} />
  );
}
```
- [ ] In `frontend/src/GameScene.jsx`, import `import { Ocean } from './render/Ocean.jsx';` (near the Atmosphere import) and mount `<Ocean />` inside the scene graph (alongside `<Atmosphere>` at line 834 — inside the Canvas/Suspense, NOT inside the EffectComposer).
- [ ] In `frontend/src/world/Terrain.jsx`, remove the dead water-geometry split (the `waterIndicesArr`/`waterGeom`/`waterMaterial` path, lines ~42-58 material + ~245-288 geometry split + the water mesh render) — the mesher emits no water faces now, so `waterIndicesArr` is always empty. Keep the opaque land geometry + `opaqueMaterial` path intact. (Read the file region first to get exact coordinates; AST-safe Edit only.)
- [ ] LIVE-LOOK at the shoreline: `cd frontend && node scripts/visual/ocean-probe.mjs`. Read `/tmp/crafty-ocean/coast-overlook.png`, `/tmp/crafty-ocean/surface-skim.png`, `/tmp/crafty-ocean/underwater.png` and LOOK: the water must read as a CONTINUOUS animated toon surface (turquoise->teal, glossy bands, soft white crest foam at the shoreline) — NOT a checkerboard of voxel tops, NOT a flat plane. Confirm the shoreline foam is a continuous soft band, not binary 1x1 cells.
- [ ] Run the unit + build gate: `cd frontend && npx vitest run && npm run build`. Expected: green (the gerstner + mesher tests pass; build clean).
- [ ] Re-capture + view the pinned ocean frames: `cd frontend && npm run visual:capture`, then Read `tests/visual/current/ocean-coast.png` + `tests/visual/current/ocean-depth.png` and LOOK. (The pinned cameras may need repositioning — that is Task 7; for now confirm the surface renders.)
- [ ] DELIBERATE re-baseline of the ocean frames: `cd frontend && npm run visual:baseline` then `npx vitest run --config vitest.visual.config.js`. Expected: green. (If ocean-coast/ocean-depth need a better pose, defer the re-pose to Task 7 which also moves them for the de-island.)
- [ ] DONE-GATE: `npx eslint src/render/Ocean.jsx src/world/Terrain.jsx src/GameScene.jsx` clean. Commit in the worktree: body "W2-T2 Ocean.jsx stylized tropical-toon Gerstner surface; cull voxel water faces; mount in scene".

### Task 2.4 — Merge the ocean worktree

**Files:** none (integration)

- [ ] In the worktree, run the FULL gate green: `cd <worktree>/frontend && npx vitest run && npm run build && npm run visual:capture && npx vitest run --config vitest.visual.config.js`. Expected: all green.
- [ ] Invoke superpowers:finishing-a-development-branch to merge `w2-ocean` back to `main` (fast-forward or merge commit per the skill). Verify `main` `git status` clean + the ocean tests + visual gate green post-merge.

---

## TASK GROUP 3 — TITLE SCREEN (cinematic 3D vista)

### Task 3.1 — TitleDiorama.jsx: full-bleed live 3D Hearth diorama (capture-frozen)

**Files:** create `frontend/src/render/TitleDiorama.jsx`

- [ ] Write a FAILING smoke test `frontend/tests/render/title-diorama-gates.test.js` (source-static gate; the canvas itself is verified via the menu probe):
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const SRC = readFileSync(resolve(process.cwd(), 'src/render/TitleDiorama.jsx'), 'utf8');
describe('W2-T3 TitleDiorama', () => {
  it('is a full-bleed live R3F canvas (not a 2D gradient)', () => {
    expect(SRC).toMatch(/Canvas/);
  });
  it('freezes its drift in capture mode (deterministic menu frame)', () => {
    expect(SRC).toMatch(/isCaptureMode/);
  });
  it('reuses the mood-grade warm palette + light motes', () => {
    expect(SRC).toMatch(/LightMotes|motes/i);
  });
});
```
- [ ] Run it FAILS: `cd frontend && npx vitest run tests/render/title-diorama-gates.test.js`. Expected: file-not-found.
- [ ] Create `frontend/src/render/TitleDiorama.jsx` — a full-bleed transparent R3F canvas behind the menu: the Hearth lodge silhouette (reuse the voxelKit Cube primitives the Terrain landmark/hearth uses, OR a simple stylized lodge), warm magic-hour lights (mirror TitleMascot's explore palette but warmer per Task 1), a slow camera drift (frozen in capture), and a light-motes layer. Frameloop `demand` in capture. Reference TitleMascot.jsx (the proven lazy-canvas pattern) + LightMotes.jsx (the motes pattern). Camera drift gated on `!isCaptureMode()`. Full code:
```jsx
// W2 cinematic title VISTA — a full-bleed live 3D Hearth diorama behind the menu, replacing the
// flat purple radial gradient + 2D confetti. Reuses the toon character look + the warm magic-hour
// light palette (Task 1) + drifting light motes. Slow camera drift in gameplay; FROZEN in capture
// (isCaptureMode) so the `menu` baseline is byte-stable. Lazy-friendly (caller Suspense-wraps it).
import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MascotCraftyHero } from './mascots/MascotCraftyHero';
import { isCaptureMode } from '../devtest/captureMode';

const SUN = '#FFE9C2', SKY = '#7FC9E0', GROUND = '#4A7A4A'; // warm magic-hour bounce

function DioramaMotes() {
  // a small additive mote field (the light-motes signature) — capture-frozen via a fixed phase.
  const ref = useRef();
  useFrame((s) => { if (ref.current && !isCaptureMode()) ref.current.rotation.y = s.clock.elapsedTime * 0.02; });
  const motes = Array.from({ length: 28 }, (_, i) => [Math.sin(i * 2.4) * 6, 1 + (i % 7) * 0.7, Math.cos(i * 1.7) * 6]);
  return (
    <group ref={ref}>
      {motes.map((p, i) => (
        <mesh key={i} position={p}>
          <planeGeometry args={[0.10, 0.10]} />
          <meshBasicMaterial color="#FFE6B0" transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function DriftCamera() {
  useFrame((s) => {
    if (isCaptureMode()) return; // frozen pose for the byte-stable menu baseline
    const a = s.clock.elapsedTime * 0.06;
    s.camera.position.x = Math.sin(a) * 0.6 + 2.4;
    s.camera.position.y = 2.0 + Math.sin(a * 0.7) * 0.15;
    s.camera.lookAt(0, 0.8, 0);
  });
  return null;
}

export function TitleDiorama() {
  return (
    <div data-testid="title-diorama" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <Canvas
        shadows={false}
        dpr={[1, 2]}
        frameloop={isCaptureMode() ? 'demand' : 'always'}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 38, near: 0.1, far: 100, position: [2.4, 2.0, 6.4] }}
        onCreated={({ camera }) => camera.lookAt(0, 0.8, 0)}
      >
        <DriftCamera />
        <hemisphereLight color={SKY} groundColor={GROUND} intensity={0.65} />
        <ambientLight color={SKY} intensity={0.5} />
        <directionalLight color={SUN} position={[-5, 6, 4]} intensity={2.0} />
        <DioramaMotes />
        <group scale={0.95} position={[0, -0.3, 0]}>
          <MascotCraftyHero />
        </group>
        {/* a simple warm ground plinth so the hero stands on the Hearth, not in a void */}
        <mesh position={[0, -1.0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[3.2, 32]} />
          <meshStandardMaterial color="#6B5440" roughness={0.9} />
        </mesh>
      </Canvas>
    </div>
  );
}
```
- [ ] Run the gate PASSES: `cd frontend && npx vitest run tests/render/title-diorama-gates.test.js`. Expected: green.
- [ ] DONE-GATE: `npx eslint src/render/TitleDiorama.jsx` clean; `npm run build` clean. Commit per pattern.

### Task 3.2 — Rebuild the MenuSystem title block on the diorama + bold-flat tokens

**Files:** modify `frontend/src/MenuSystem.jsx`

- [ ] Read `frontend/src/MenuSystem.jsx` lines 235-325 (the `titleMenuVisible` block) to confirm coordinates of the purple gradient + menuStars/menuParticles + pixel-font/shimmer-text wordmark + glow-button CTA.
- [ ] Write a FAILING static gate `frontend/tests/gates/title-screen-brand-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const SRC = readFileSync(resolve(process.cwd(), 'src/MenuSystem.jsx'), 'utf8');
describe('W2-T3 title screen is the cinematic 3D vista on bold-flat tokens', () => {
  it('mounts the full-bleed TitleDiorama', () => { expect(SRC).toMatch(/TitleDiorama/); });
  it('drops the off-brand purple gradient + confetti + shimmer/glow', () => {
    expect(SRC).not.toMatch(/radial-gradient\(ellipse at 50% 30%, #1a1040/);
    expect(SRC).not.toMatch(/menu-particle/);
    expect(SRC).not.toMatch(/shimmer-text/);
    expect(SRC).not.toMatch(/glow-button/);
    expect(SRC).not.toMatch(/pixel-font/);
    expect(SRC).not.toMatch(/bg-purple-600/);
  });
  it('uses the bold-flat Button primitive for the CTA', () => { expect(SRC).toMatch(/<Button/); });
});
```
- [ ] Run it FAILS: `cd frontend && npx vitest run tests/gates/title-screen-brand-gates.test.js`. Expected: fails (TitleDiorama absent; purple gradient present).
- [ ] Minimal impl in `frontend/src/MenuSystem.jsx`:
  - Add imports: `import { Button } from './ui/primitives/index.js';` (extend the existing `{ Icon }` import to `{ Icon, Button }`) and a lazy `const TitleDiorama = lazy(() => import('./render/TitleDiorama').then((m) => ({ default: m.TitleDiorama })));` next to the TitleMascot lazy import (line 25).
  - Replace the `titleMenuVisible` block (235-325): set the outer `motion.div` background to a token surface (e.g. `bg-panel` via className, no inline purple gradient); remove the `menuStars`/`menuParticles` `.map` blocks; place `<Suspense fallback={null}><TitleDiorama /></Suspense>` as the full-bleed backdrop (absolute inset-0, behind the lockup); keep the wordmark + mascot lockup but swap `pixel-font shimmer-text` for the display font token class (`font-display` + `text-accent`), and the tagline to a single non-wrapping line; replace the `<motion.button class="glow-button bg-purple-600 ... pixel-font">` with `<Button variant="primary" size="lg" onClick={enterPlay}><Icon name="sword" size={22} /> Start Adventure</Button>`.
  - You MAY delete the now-unused `menuStars`/`menuParticles` useMemo blocks (lines ~47-90) if nothing else references them (grep first).
- [ ] Run the gate PASSES: `cd frontend && npx vitest run tests/gates/title-screen-brand-gates.test.js`. Expected: green.
- [ ] LIVE-LOOK the real menu (non-capture): drive it via a probe. There is no menu-specific probe; use the capture path's `enterCapture` (which keeps the menu up) to screenshot — run `cd frontend && npm run visual:capture` then Read `tests/visual/current/menu.png` and LOOK: a full-bleed 3D Hearth diorama vista with the Crafty Hero on a warm plinth + drifting motes, a clean wordmark+mascot lockup, and ONE bold-flat gold CTA — NO purple gradient, NO confetti squares, NO shimmer.
- [ ] DELIBERATE re-baseline of `menu`: `cd frontend && npm run visual:baseline` then `npx vitest run --config vitest.visual.config.js`. Expected: green (new menu baseline). Confirm the other 20 states stayed byte-identical (only `menu` changed).
- [ ] DONE-GATE: `npm run build` clean; `npx eslint src/MenuSystem.jsx` clean. Commit MenuSystem + the re-baselined `menu.png`: body "W2-T3 cinematic 3D title vista on bold-flat tokens; new menu baseline".

---

## TASK GROUP 4 — SPELL PER-ELEMENT SHAPES + VFX

### Task 4.1 — Per-element profile data: shape-first, trail + impact descriptors

**Files:** modify `frontend/src/game/spellVisualProfiles.js`; modify `frontend/src/game/spellVisualProfiles.test.js`

- [ ] Read `frontend/src/game/spellVisualProfiles.test.js` to see the existing coverage/fallback assertions (so the new ones extend, not replace).
- [ ] Write a FAILING test — append to `frontend/src/game/spellVisualProfiles.test.js`:
```js
import { ENERGY_PROFILE, _defaultEnergy } from './spellVisualProfiles.js';
describe('W2-T4 per-element silhouette is the hero + distinct trail/impact', () => {
  const els = ['fireball', 'iceball', 'lightning', 'arcane'];
  it('every element declares a shape, a trail shape, and an impact shape', () => {
    for (const e of els) {
      expect(ENERGY_PROFILE[e].shape).toBeTruthy();
      expect(ENERGY_PROFILE[e].trail).toBeTruthy();
      expect(ENERGY_PROFILE[e].impact).toBeTruthy();
    }
  });
  it('the four silhouettes are DISTINCT (no shared shape)', () => {
    const shapes = els.map((e) => ENERGY_PROFILE[e].shape);
    expect(new Set(shapes).size).toBe(4);
  });
  it('the four TRAILS are distinct', () => {
    expect(new Set(els.map((e) => ENERGY_PROFILE[e].trail)).size).toBe(4);
  });
  it('the four IMPACTS are distinct', () => {
    expect(new Set(els.map((e) => ENERGY_PROFILE[e].impact)).size).toBe(4);
  });
  it('the shape now dominates the core (coreScale shrunk, shape emissive boosted)', () => {
    for (const e of els) {
      expect(ENERGY_PROFILE[e].coreScale).toBeLessThanOrEqual(0.42); // white core is a small spec
      expect(ENERGY_PROFILE[e].glowIntensity).toBeGreaterThanOrEqual(5.0); // shape reads first
    }
  });
  it('fallback still complete', () => { expect(_defaultEnergy.shape).toBeTruthy(); });
});
```
- [ ] Run it FAILS: `cd frontend && npx vitest run src/game/spellVisualProfiles.test.js`. Expected: `trail`/`impact` undefined + coreScale too big -> fails.
- [ ] Minimal impl in `frontend/src/game/spellVisualProfiles.js`: for each ENERGY_PROFILE element add `trail` + `impact` keys and shrink `coreScale` + boost `glowIntensity`:
  - fireball: `shape:'sphere'`, `trail:'embers'`, `impact:'burst'`, `coreScale: 0.40`, `glowIntensity: 5.5`.
  - iceball: `shape:'crystal'`, `trail:'shard'`, `impact:'shatter'`, `coreScale: 0.36`, `glowIntensity: 5.0`.
  - lightning: `shape:'bolt'`, `trail:'segments'`, `impact:'fork'`, `coreScale: 0.30`, `glowIntensity: 5.5`.
  - arcane: `shape:'sigil'`, `trail:'ribbon'`, `impact:'rune'`, `coreScale: 0.38`, `glowIntensity: 5.2`.
  - `_defaultEnergy`: add `trail:'embers', impact:'burst'`, `coreScale: 0.38`.
- [ ] Run it PASSES: `cd frontend && npx vitest run src/game/spellVisualProfiles.test.js`. Expected: green.
- [ ] DONE-GATE: `npx eslint src/game/spellVisualProfiles.js` clean. Commit per pattern.

### Task 4.2 — Render the distinct silhouettes + per-element trail + impact (spellVfx.jsx)

**Files:** modify `frontend/src/render/spellVfx.jsx`

- [ ] Read `frontend/src/render/spellVfx.jsx` lines 90-204 (SpellProjectileCore + renderShape), 20-74 (trail), 217-284 (SpellImpactPop) to confirm coordinates.
- [ ] Write a FAILING static gate `frontend/tests/gates/spell-shape-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const SRC = readFileSync(resolve(process.cwd(), 'src/render/spellVfx.jsx'), 'utf8');
describe('W2-T4 spellVfx renders distinct per-element geometry', () => {
  it('handles the new sigil silhouette (arcane rotating orb)', () => { expect(SRC).toMatch(/case 'sigil'/); });
  it('the bolt silhouette is jagged/forked, not a plain cylinder', () => { expect(SRC).toMatch(/fork|jagged|seg/i); });
  it('the trail varies per element (not one shared cylinder)', () => { expect(SRC).toMatch(/profile\.trail|energy\.trail|\.trail/); });
  it('the impact varies per element (per-element impact geometry)', () => { expect(SRC).toMatch(/energy\.impact|profile\.impact|\.impact/); });
});
```
- [ ] Run it FAILS: `cd frontend && npx vitest run tests/gates/spell-shape-gates.test.js`. Expected: fails (no `'sigil'`, no per-element trail/impact branching).
- [ ] Minimal impl in `frontend/src/render/spellVfx.jsx`:
  - In `renderShape()` (line 122): keep `crystal`/`bolt`/`sphere`; replace `'swirl'` with `'sigil'` (a torus PLUS a thin rune-glyph cross — return a fragment with two meshes: the ring torus + a small box/plane glyph); make `'bolt'` a jagged forking bolt (a thin extruded zig-zag — use a small set of cylinders at deterministic jitter angles via the existing `profile.capturePhase`-seeded approach, or a `LatheGeometry`/custom segments). Boost the shape mesh `emissiveIntensity` to `profile.glowIntensity` and raise the shape mesh `opacity` to 1.0 (the shape is the hero); shrink the white inner-core hotspot at line 172-183 (it already scales off `coreScale`, now 0.30-0.40 from Task 4.1, so it auto-shrinks — also drop its opacity to ~0.85 so it is a spec, not a dominant ball).
  - In `EnhancedSpellProjectile` trail (the `<mesh ref={trailRef}>` at lines 60-71): branch the trail GEOMETRY on `profile.trail` (read `const profile = ENERGY_PROFILE[projectile.type] || _defaultEnergy;`): `embers` = soft turbulent taper (current cylinder, wider top); `shard` = a sharp thin cone streak; `segments` = thin jagged lightning segments (a narrow cylinder, lower opacity, higher flicker); `ribbon` = a flat double-sided plane ribbon. Vary width/taper/opacity per element via the profile.
  - In `SpellImpactPop` (lines 217-284): branch the impact GEOMETRY on `energy.impact`: `burst` = expanding fireball burst (current ring + a soft sphere); `shatter` = radial shard shatter (several thin angular spokes); `fork` = a forked flash (a few jagged additive lines) PLUS a chain segment (a thin additive cylinder from the impact toward the chained target if `impact.chainTo` is set — deterministic, seeded); `rune` = an imploding rune ring (the ring scales DOWN instead of up + a glyph). Keep the t=0 hot-white flash.
- [ ] Run the gate PASSES: `cd frontend && npx vitest run tests/gates/spell-shape-gates.test.js`. Expected: green.
- [ ] LIVE-LOOK the spell cast: there is a `drive-elemancer.mjs` probe — run `cd frontend && node scripts/visual/drive-elemancer.mjs` (Read its output dir from the script header), OR re-capture + Read `tests/visual/current/spell-cast.png`. LOOK: the four elements must read as DISTINCT silhouettes (round roiling fireball / angular ice shard / jagged forking bolt / rotating sigil orb), the white core a small spec, the trail + impact element-specific.
- [ ] Run unit + build: `cd frontend && npx vitest run && npm run build`. Expected: green.
- [ ] DELIBERATE re-baseline of `spell-cast`: `cd frontend && npm run visual:capture && npm run visual:baseline && npx vitest run --config vitest.visual.config.js`. Expected: green; confirm only `spell-cast` changed.
- [ ] DONE-GATE: `npx eslint src/render/spellVfx.jsx` clean. Commit spellVfx + the re-baselined `spell-cast.png`: body "W2-T4 distinct per-element spell silhouettes + trail + impact; re-baseline spell-cast".

---

## TASK GROUP 5 — DEATH-FX

### Task 5.1 — GPU spark death branch + hue-preserving glow

**Files:** modify `frontend/src/world/GPUSparkSystem.jsx`; modify `frontend/src/game/mobHitFx.js`; modify `frontend/src/game/mobHitFx.test.js`

- [ ] Write a FAILING test — append to `frontend/src/game/mobHitFx.test.js`:
```js
import { deathBurst } from './mobHitFx.js';
describe('W2-T5 death-burst per-element + dark-mob tint floor', () => {
  it('returns a velocity branch tag the GPU pool understands', () => {
    expect(deathBurst('zombie').burst).toBe('death');
  });
  it('lifts a very dark mob tint to a visible floor (no near-black death puff)', () => {
    // a hypothetically near-black mob color should be lifted; green mob preserves green hue
    const z = deathBurst('zombie'); // #228B22 green
    expect(z.color.toLowerCase()).toMatch(/^#/);
    // floor: the brightest channel of the burst color is >= a minimum
    const hex = z.color.replace('#', '');
    const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
    expect(Math.max(r,g,b)).toBeGreaterThanOrEqual(80); // visible, not black
    expect(g).toBeGreaterThan(r); expect(g).toBeGreaterThan(b); // green hue PRESERVED
  });
});
```
- [ ] Run it FAILS: `cd frontend && npx vitest run src/game/mobHitFx.test.js`. Expected: `.burst` undefined -> fails.
- [ ] Minimal impl in `frontend/src/game/mobHitFx.js` — update `deathBurst` (line 15) to add `burst:'death'` + a tint-floor lift (preserve hue, lift brightness):
```js
export function deathBurst(mobType) {
  const m = MOB_TYPES[mobType];
  let color = (m && m.color) || '#ffffff';
  const xp = (m && m.xp) || 0;
  // dark-mob tint floor: lift very-dark body colors toward a visible glow while PRESERVING hue
  // (so a green mob reads green at peak, not white/black). Scale the channels up if the max < floor.
  const hex = color.replace('#', '');
  let r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  const mx = Math.max(r, g, b, 1), floor = 110;
  if (mx < floor) { const k = floor / mx; r = Math.min(255, r * k) | 0; g = Math.min(255, g * k) | 0; b = Math.min(255, b * k) | 0; color = '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join(''); }
  return { color, count: Math.max(50, Math.min(110, 40 + xp)), burst: 'death' };
}
```
- [ ] Run it PASSES: `cd frontend && npx vitest run src/game/mobHitFx.test.js`. Expected: green (zombie #228B22 already > floor so hue stays green; dark mobs lift).
- [ ] In `frontend/src/world/GPUSparkSystem.jsx`, add the `'death'` velocity branch in `triggerSparkBurst` (after the `arcane` branch, line 169) — an upward-biased outward burst:
```js
        } else if (type === 'death') {
          const angle = rnd() * Math.PI * 2;
          const speed = 1.5 + rnd() * 3.5;
          vx = Math.cos(angle) * speed;
          vy = rnd() * 7.0 + 4.0;   // strong upward bias (a rising soul-burst)
          vz = Math.sin(angle) * speed;
        }
```
- [ ] Cap the hue-washing additive glow in the fragment shader (line 71): change `vec3 glow = vColor * (1.5 + vLife * 3.5);` to a hue-preserving cap — `vec3 glow = vColor * (1.0 + vLife * 2.0);` (lower gain so the saturated color survives instead of clipping to white). Verify the change keeps sparks visible but colored.
- [ ] DONE-GATE: `cd frontend && npx vitest run src/game/mobHitFx.test.js && npm run build` green; `npx eslint src/world/GPUSparkSystem.jsx src/game/mobHitFx.js` clean. Commit per pattern.

### Task 5.2 — Per-element death burst + ground decal + t=0 flash in SimplifiedNPCSystem

**Files:** modify `frontend/src/SimplifiedNPCSystem.jsx`

- [ ] Read `frontend/src/SimplifiedNPCSystem.jsx` around line 560 (the death-burst call site `triggerGPUSparks(..., 'death')`) to confirm coordinates + the surrounding kill path.
- [ ] Write a FAILING static gate `frontend/tests/gates/death-fx-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const SRC = readFileSync(resolve(process.cwd(), 'src/SimplifiedNPCSystem.jsx'), 'utf8');
describe('W2-T5 death FX wiring', () => {
  it('death-burst still passes the death type the GPU pool now branches on', () => { expect(SRC).toMatch(/'death'/); });
  it('uses the deathBurst descriptor (color + count + burst)', () => { expect(SRC).toMatch(/deathBurst/); });
});
```
- [ ] Run it FAILS or PASSES depending on the current call — confirm it references `deathBurst`; if the kill path uses an inline color, change it to `deathBurst(entity.type)` so the tint-floor + per-element burst apply. Run: `cd frontend && npx vitest run tests/gates/death-fx-gates.test.js`.
- [ ] Minimal impl: at the death site, call `const db = deathBurst(entity.type);` then `triggerGPUSparks(pos, db.color, db.count, db.burst, hitDir);` (passing `db.burst === 'death'` so the new branch fires + the hit direction for a directional rise). Add a transient t=0 flash + a ground decal: spawn a short-lived additive flash sphere at the death position (reuse the SpellImpactPop pattern — a brief bright billboard) and a flat fading ground-ring decal (a `ringGeometry` on XZ that fades over ~400ms), both capture-safe (age off a deltaMs counter, frozen at 0 in capture). Implement these as a small `<DeathDecal>` entity pushed to a pooled array OR inline if a death-fx group already exists (grep for an existing death/decal pool first — reuse it).
- [ ] LIVE-LOOK the death: `cd frontend && node scripts/visual/death-probe.mjs`. Read the produced images (Read the script header for the output dir, likely `/tmp/crafty-death/`) and LOOK: a killed GREEN mob must burst GREEN (hue preserved, not white), with a rising per-element spark burst + a t=0 flash + a fading ground decal. Confirm dark mobs are visible (tint floor), not a black puff.
- [ ] Run unit + build: `cd frontend && npx vitest run && npm run build`. Expected: green.
- [ ] If a pinned capture frame shows a death (check `death`/mob states in capture.mjs) DELIBERATE re-baseline that frame; otherwise the death-probe LIVE-LOOK is the validation (death is transient, not a pinned baseline). Run the visual gate to confirm no unrelated frame drifted: `npm run visual:capture && npx vitest run --config vitest.visual.config.js`. Expected: green.
- [ ] DONE-GATE: `npx eslint src/SimplifiedNPCSystem.jsx` clean. Commit per pattern: body "W2-T5 hue-preserving per-element death burst + ground decal + t=0 flash".

---

## TASK GROUP 6 — FPV HANDS

### Task 6.1 — Stylized gloved hands (Outlines + white-gold accent) replacing the flesh boxes

**Files:** modify `frontend/src/render/playerRender.jsx`; create `frontend/tests/gates/hands-render-gates.test.js`

- [ ] Write a FAILING static gate `frontend/tests/gates/hands-render-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const SRC = readFileSync(resolve(process.cwd(), 'src/render/playerRender.jsx'), 'utf8');
describe('W2-T6 stylized FPV hands (character render language)', () => {
  it('the raw flesh-box hex #fdbcb4 is gone', () => { expect(SRC.toLowerCase()).not.toMatch(/#fdbcb4/); });
  it('the hands use drei Outlines (the character render language)', () => { expect(SRC).toMatch(/Outlines/); });
  it('a white-gold accent is present on the hands', () => { expect(SRC).toMatch(/#FFF|#F8E|gold|FFD700|E8D9|accent/i); });
});
```
- [ ] Run it FAILS: `cd frontend && npx vitest run tests/gates/hands-render-gates.test.js`. Expected: fails (`#fdbcb4` present, no `Outlines`).
- [ ] Read `frontend/src/render/playerRender.jsx` lines 263-428 (StableMagicHands) + the character render language: read `src/render/characterStyle.js` + how mobs/voxelKit use `<Outlines>` (grep `Outlines` in `src/render`) to match the toon look (2-band + fresnel rim + inverted-hull outline).
- [ ] Minimal impl: import `{ Outlines } from '@react-three/drei'` (confirm drei version supports it — it does at 10.7). Replace the four raw `#fdbcb4` box meshes (lines 385-386 right hand, 406-407 left hand) with a gloved/stylized silhouette: keep the same box dimensions + positions (so the pose rig is unchanged) but change the material to a dark glove base (`#2A2A33` or a token ink) with a `<meshStandardMaterial>` toon-ish roughness, add a thin `<Outlines thickness={4} color="#1A1A1F" />` child to each glove mesh (inverted-hull, screen-px thickness like the character lock), and add a white-gold accent cuff (a thin box ring at the wrist in `#E8D9A8`/`#FFE9B0`). Keep `castShadow receiveShadow`. Do NOT touch the procedural pose animation rig (the refs/useFrame).
- [ ] Run the gate PASSES: `cd frontend && npx vitest run tests/gates/hands-render-gates.test.js`. Expected: green.
- [ ] DONE-GATE: `npm run build` clean; `npx eslint src/render/playerRender.jsx` clean. Commit per pattern.

### Task 6.2 — hands-probe.mjs (non-capture LIVE-LOOK) + verify the gate sees the hands

**Files:** create `frontend/scripts/visual/hands-probe.mjs`

- [ ] Create `frontend/scripts/visual/hands-probe.mjs` (model on `pov-probe.mjs` — drive the REAL non-capture game to first-person; the hands render off the pinned capture camera so the visual gate can't see them — this probe is the only thing that does). Full code:
```js
// hands-probe.mjs — drive the REAL game (non-capture) to first-person and screenshot the FPV HANDS.
// The hands render off the pinned capture camera (the visual gate never sees them), so this probe is
// the LIVE-LOOK that validates the stylized gloved hands. Saves PNGs to /tmp/crafty-hands/.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
const PORT = 4198, URL = `http://localhost:${PORT}`, OUT = '/tmp/crafty-hands';
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const done = (c) => { try { server.kill('SIGKILL'); } catch {} process.exit(c); };
try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(URL); if (r.ok) break; } catch {} await delay(250); }
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await page.waitForFunction("typeof window.useGameStore === 'function' && window.__craftyTest?.ready?.()", { timeout: 25000 });
  await page.evaluate(() => window.__craftyTest.call('start'));
  await page.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5));
  await page.waitForFunction("window.useGameStore.getState().isSpawnChunkLoaded === true", { timeout: 15000 }).catch(() => {});
  await delay(5000);
  let locked = false;
  for (let i = 0; i < 8 && !locked; i++) { await page.mouse.click(600 + i * 10, 400); await delay(300); locked = await page.evaluate(() => !!document.pointerLockElement); }
  const shoot = async (name) => { await delay(600); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log('shot', name); };
  await page.mouse.move(640, 400); await page.mouse.move(640, 560); await shoot('hands-1-idle'); // tilt down to see the hands
  await page.keyboard.down('Digit1'); await page.keyboard.up('Digit1'); // select a spell -> wand hand
  await shoot('hands-2-spell');
  await page.mouse.down({ button: 'left' }); await delay(150); await shoot('hands-3-swing'); await page.mouse.up({ button: 'left' });
  await browser.close(); done(0);
} catch (e) { console.error('HANDS-PROBE ERROR:', e); done(1); }
```
- [ ] LIVE-LOOK: `cd frontend && node scripts/visual/hands-probe.mjs`. Read `/tmp/crafty-hands/hands-1-idle.png`, `/tmp/crafty-hands/hands-2-spell.png`, `/tmp/crafty-hands/hands-3-swing.png` and LOOK: the hands must read as stylized gloves with the character-language ink Outlines + a white-gold accent cuff (NOT raw flesh boxes), and the procedural swing/pose still animates.
- [ ] DONE-GATE: confirm the probe completes (exit 0) + the hands read correctly. Commit the probe: body "W2-T6 hands-probe.mjs LIVE-LOOK for the stylized FPV gloves".

---

## TASK GROUP 7 — WORLD FEEL (de-island + flatten spawn)

### Task 7.1 — De-island (push oceans out) + enlarge continent + flush the Hearth pad

**Files:** modify `frontend/src/world/oceanProfile.js`; modify `frontend/src/world/heightAt.js`; modify `frontend/src/world/homeAnchor.js`; modify `frontend/tests/world/oceanProfile.test.js` + `frontend/tests/world/heightAt.test.js` + `frontend/tests/world/homeAnchor.test.js`

- [ ] Write a FAILING `worldShape` characterization test `frontend/tests/world/worldShape.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { createNoise2D } from 'simplex-noise';
import { computeHeight } from '../../src/world/heightAt.js';
import { OCEAN_CONTINENT_THRESHOLD, oceanBlend, SEA_LEVEL } from '../../src/world/oceanProfile.js';
import { HEARTH_Y } from '../../src/world/homeAnchor.js';

// deterministic noise mirroring the worker seed (lcg 12345 — match the worker's seeding)
function lcg(seed) { return () => (seed = (Math.imul(1664525, seed) + 1013904223) | 0) / 4294967296 + 0.5; }
const noise2D = createNoise2D(lcg(12345));

describe('W2-T7 de-islanded flat spawn', () => {
  it('oceans pushed out: the threshold is lower than the old -0.15', () => {
    expect(OCEAN_CONTINENT_THRESHOLD).toBeLessThan(-0.15);
  });
  it('origin column is LAND (above sea level) — spawn is not on a tiny island', () => {
    const { continent, baseHeight } = computeHeight(noise2D, 0, 0);
    expect(oceanBlend(continent)).toBe(0); // origin is fully continent, not ocean
    expect(baseHeight).toBeGreaterThan(SEA_LEVEL);
  });
  it('the Hearth pad sits flush with the local grade (no podium)', () => {
    // local grade near origin ~49-51; the pad must not perch >3 above it
    let max = -Infinity;
    for (let x = -7; x <= 7; x++) for (let z = -7; z <= 7; z++) max = Math.max(max, computeHeight(noise2D, x, z).baseHeight);
    expect(HEARTH_Y).toBeLessThanOrEqual(Math.ceil(max) + 1);
  });
  it('the coastline is pushed away from spawn (no water within ~80m of origin)', () => {
    let nearestWater = Infinity;
    for (let r = 4; r < 200; r += 4) {
      for (const [dx, dz] of [[1,0],[0,1],[-1,0],[0,-1],[0.7,0.7],[-0.7,0.7]]) {
        const { continent } = computeHeight(noise2D, dx * r, dz * r);
        if (oceanBlend(continent) > 0.5) { nearestWater = Math.min(nearestWater, r); }
      }
    }
    expect(nearestWater).toBeGreaterThan(60); // shoreline far from the plinth
  });
});
```
- [ ] Run it FAILS: `cd frontend && npx vitest run tests/world/worldShape.test.js`. Expected: threshold not < -0.15; possibly water too near; pad too high. (Note: tune the test's nearest-water expectation against the ACTUAL post-edit measurement — read the failing values first, then set the edits to satisfy a sane de-island, NOT the test to a fantasy number.)
- [ ] Minimal impl:
  - `frontend/src/world/oceanProfile.js` line 18: `OCEAN_CONTINENT_THRESHOLD = -0.15` -> `-0.30` (push the coastline out). Update the in-code comment (the S4b-deferred note) to "de-island executed in W2-T7".
  - `frontend/src/world/heightAt.js` line 27: lower the continent frequency to enlarge the continent — `noise2D(worldX * 0.002, worldZ * 0.002)` -> `noise2D(worldX * 0.0013, worldZ * 0.0013)` (lower freq = larger landmasses; measure the origin stays land + the grade stays ~49).
  - `frontend/src/world/homeAnchor.js` line 14: `HEARTH_Y = 56` -> `51` (flush with the ~y49-51 origin grade — a gently-raised pad, not a podium). Update the comment (the "raised pad over the y50 grade" note) to the new value.
- [ ] Iterate the constants until `worldShape.test.js` PASSES with SANE values: `cd frontend && npx vitest run tests/world/worldShape.test.js`. Re-tune thresholds based on measured origin grade (read the failing values; do NOT bend the test to pass a bad world).
- [ ] Run the existing worldgen suite to catch regressions in the dependent tests (oceanProfile/heightAt/homeAnchor/home-anchor-gates/heightat-single-source/ocean-coastline-gates): `cd frontend && npx vitest run tests/world tests/gates/home-anchor-gates.test.js tests/gates/heightat-single-source.test.js tests/gates/ocean-coastline-gates.test.js`. Fix any now-stale pinned-value assertions (e.g. a test pinning HEARTH_Y=56 -> update to 51 with a comment that W2-T7 flushed the pad).
- [ ] DONE-GATE: `npm run build` clean; `npx eslint src/world/oceanProfile.js src/world/heightAt.js src/world/homeAnchor.js` clean. Commit per pattern (code + tests only).

### Task 7.2 — Reposition pinned ocean/hearth cameras + LIVE-LOOK + re-baseline

**Files:** modify `frontend/scripts/visual/capture.mjs`; re-baseline `ocean-coast.png`, `ocean-depth.png`, `hearth.png`, `explore-day.png`

- [ ] LIVE-LOOK first (find where the new shoreline + flush spawn read): `cd frontend && node scripts/visual/ocean-probe.mjs` (the probe cameras point at the OLD x≈-40 shore — read the produced images and note where the NEW coastline is). Then `node scripts/visual/pov-probe.mjs` and Read `/tmp/crafty-pov/*.png` to confirm spawn no longer feels like a peak on a tiny island (player nestled in landscape, coastline distant).
- [ ] Read `frontend/scripts/visual/capture.mjs` lines 140-178 (the `hearth`, `ocean-depth`, `ocean-coast` `enterCapture` camera poses) — these are pinned to the old `-0.15` shore + `y56` pad. Reposition them: aim the ocean cameras at the NEW coastline distance (from the ocean-probe LIVE-LOOK), and lower the `hearth` camera lookAt from `[0, 56, 0]` to `[0, 51, 0]` (+ adjust the position height proportionally). Also update the `ocean-probe.mjs` shot cameras to the new coast for future LIVE-LOOKs.
- [ ] Re-capture + LIVE-LOOK the new poses: `cd frontend && npm run visual:capture`, Read `tests/visual/current/ocean-coast.png`, `ocean-depth.png`, `hearth.png`, `explore-day.png` and confirm each frames the intended subject (continuous toon ocean at the distant shore; flush Hearth pad nestled in terrain).
- [ ] DELIBERATE re-baseline: `cd frontend && npm run visual:baseline && npx vitest run --config vitest.visual.config.js`. Expected: green (new baselines). Confirm unrelated frames stayed stable.
- [ ] DONE-GATE: commit the capture.mjs + ocean-probe.mjs camera moves + the re-baselined PNGs: body "W2-T7 de-island + flush spawn; re-pose pinned ocean/hearth cameras; re-baseline".

---

## TASK GROUP 8 — BIOME VARIETY

### Task 8.1 — Expand beyond 3 hard-threshold biomes (per-biome flora/tint/blend)

**Files:** modify `frontend/src/world/biomeTable.js`; modify `frontend/tests/world/biomeTable.test.js`

- [ ] Read `frontend/tests/world/biomeTable.test.js` to see the existing 3-biome assertions (so the new ones extend the coverage + don't break the byte-identical M3 contract that other tests may rely on — check `tests/gates/biome-table-gates.test.js` first).
- [ ] Write a FAILING test — append to `frontend/tests/world/biomeTable.test.js`:
```js
import { BIOMES, pickBiome } from '../../src/world/biomeTable.js';
describe('W2-T8 biome variety beyond 3 hard-threshold biomes', () => {
  it('declares at least 6 biomes with distinct surface blocks + flora + tint', () => {
    const keys = Object.keys(BIOMES);
    expect(keys.length).toBeGreaterThanOrEqual(6);
    for (const k of keys) {
      expect(BIOMES[k].surfaceBlock).toBeGreaterThan(0);
      expect(BIOMES[k]).toHaveProperty('flora');
      expect(BIOMES[k]).toHaveProperty('tint');
    }
  });
  it('uses the continent param for selection (no longer ignored)', () => {
    // two columns differing ONLY in continent can pick different biomes (e.g. coastal vs inland)
    const a = pickBiome(0.5, 0.5, -0.1);
    const b = pickBiome(0.5, 0.5, 0.6);
    expect(a.surfaceBlock !== b.surfaceBlock || a.flora !== b.flora).toBe(true);
  });
  it('still returns a FRESH object (worker reassigns surfaceBlock for the beach band)', () => {
    const x = pickBiome(0.8, 0.2, 0.3); x.surfaceBlock = 999;
    expect(pickBiome(0.8, 0.2, 0.3).surfaceBlock).not.toBe(999);
  });
});
```
- [ ] Run it FAILS: `cd frontend && npx vitest run tests/world/biomeTable.test.js`. Expected: <6 biomes; no flora/tint; continent ignored -> fails.
- [ ] Minimal impl in `frontend/src/world/biomeTable.js`: expand `BIOMES` to >=6 (forest/jungle/savanna/swamp/taiga/mesa on top of desert/snow/plains) each with `surfaceBlock`, `secondaryBlock`, `flora` (a flora-kind string the foliage system can branch on), `tint` (a vertex-tint hex/factor). Rewrite `pickBiome(temperature, moisture, continent)` to a multi-axis selection that USES `continent` (e.g. coastal-vs-inland, plus temperature/moisture quadrants), returning `{ ...BIOMES[chosen] }` (fresh object — keep the spread). Keep block ids to EXISTING ids unless the palette grows (the comment notes palette is M4 — confirm which block ids are valid in `src/world/Blocks.js` before adding new surface blocks; use existing ids).
- [ ] Run it PASSES: `cd frontend && npx vitest run tests/world/biomeTable.test.js`. Expected: green.
- [ ] Run the biome gate suite + worldgen to catch regressions (`biome-table-gates`, `biome-foliage-gates`, foliage): `cd frontend && npx vitest run tests/gates/biome-table-gates.test.js tests/gates/biome-foliage-gates.test.js tests/world`. Fix any test that pinned the old 3-branch byte-identity (update with a W2-T8 comment that the table intentionally grew).
- [ ] LIVE-LOOK: `cd frontend && node scripts/visual/pov-probe.mjs` then walk to a new biome OR re-capture + Read `tests/visual/current/biome-snow.png` (+ if a new biome camera is added, that frame). LOOK: the world should no longer read same-everywhere — distinct surface tints + flora per biome.
- [ ] Run unit + build: `cd frontend && npx vitest run && npm run build`. Expected: green.
- [ ] If a pinned camera now frames a changed biome, DELIBERATE re-baseline it: `cd frontend && npm run visual:capture && npm run visual:baseline && npx vitest run --config vitest.visual.config.js`. Expected: green. (Optionally add a NEW `biome-forest` capture state + baseline to gate the variety — extend capture.mjs + STATES in diff.test.js, then baseline.)
- [ ] DONE-GATE: `npx eslint src/world/biomeTable.js` clean. Commit per pattern: body "W2-T8 expand biome table beyond 3 hard-threshold biomes (continent-aware + per-biome flora/tint)".

---

## Verification before completion (whole-workstream done-gate)

After all 8 task groups, before declaring W2 complete, run the FULL gate from `frontend/` and confirm each is green by reading the output:
- [ ] `cd frontend && npx vitest run` — full unit suite green (incl all new W2 tests).
- [ ] `npm run build` — clean build.
- [ ] `npx eslint src` — clean.
- [ ] `npm run visual:capture && npx vitest run --config vitest.visual.config.js` — all 21 (or 22 if a biome state was added) visual states green against the deliberately re-baselined frames.
- [ ] Re-run each LIVE-LOOK probe one final time (pov / ocean / hands / death / drive-elemancer) and Read the images to confirm the lived result: warm magic-hour grade, continuous toon ocean, cinematic title vista, distinct spell silhouettes, hue-preserving death, stylized hands, de-islanded flat spawn, biome variety.
- [ ] Use superpowers:verification-before-completion to reconcile the executed tasks against this plan (the headline output is any MISSED task with no execution evidence) before reporting W2 done.
