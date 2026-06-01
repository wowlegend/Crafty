# Crafty S1-B — Render Recipe · Milestone 1 (Render Correctness & Device Tiers) Implementation Plan

> ✅ **STATUS: COMPLETE — DONE + merged to `main` 2026-05-31 (S1-B M1 render recipe: sRGB/N8AO/bloom/SMAA/tiers).** Whole-branch review APPROVED; `test:visual` 3/3.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three render-correctness defects that block the Vanguard+Toon look (washed-out terrain, no ambient occlusion, over-eager bloom), add proper anti-aliasing + a baseline warm grade, and wire the orphaned device-quality tiers into the live pipeline — turning the two deferred §9 render gates green, all verified by the deterministic visual-regression harness.

**Architecture:** All of Crafty's post-processing + lighting lives in one file, `src/GameScene.jsx`, with a single `<EffectComposer>`. The voxel material is two `MeshStandardMaterial` instances patched via `onBeforeCompile` in `src/world/Terrain.jsx`. The S1-A foundation (`src/theme/tokens.js`, `src/render/quality.js`, the capture-determinism layer, the visual-regression gate) is fully built but **zero `src/` files consume `quality.js` yet** — M1 is its first consumer. M1 makes **no new gameplay state and no character-art changes** (those are Milestone 2); it only corrects color/AO/bloom, adds AA + grade, and threads the existing `TIERS` config into the composer/shadows/DPR. Every visual change is validated by re-baselining the deterministic capture harness under a **forced `high` tier** (so baselines never depend on the capture machine's hardware) with a **mandatory human eyeball** of each new baseline before commit.

**Tech Stack:** React 19.2 · three r172 · @react-three/fiber 9.5 · @react-three/drei 10.7.7 (`PerformanceMonitor`, `AdaptiveDpr`) · @react-three/postprocessing 3.0.4 (`N8AO`, `SMAA`, `HueSaturation`, `BrightnessContrast`, `Bloom`) · vitest 3.2.4 · puppeteer 24.42 + pixelmatch 6 (visual gate).

---

## Ground rules for the implementer (read before Task 1)

1. **Branch, not main.** Before any code, ensure you are on a feature branch: `git checkout -b s1b-render-recipe` (the controller will confirm). Never implement on `main`.
2. **The visual gate is a re-baseline gate, not an auto-accept gate.** When a task changes rendered output, you regenerate baselines with `npm run visual:baseline`, but you MUST surface the 3 new PNGs (`tests/visual/baseline/{menu,explore-day,explore-night}.png`) for a **human visual review** and get explicit confirmation that the change is the *intended improvement* before committing the new baselines. Blindly re-baselining defeats the entire anti-blind-harness mandate. If you cannot get a human review, STOP and report `BLOCKED: needs visual review`.
3. **Determinism prerequisite:** baselines are captured under a forced `qualityTier === 'high'` (Task 1 wires this into the capture bridge). Do not regenerate baselines until Task 1 has landed.
4. **Two unit-test configs:** `npm run test:unit` (vitest, excludes `tests/visual/**`) must stay green after every task. `npm run test:visual` (runs `capture.mjs` then diffs) is the visual gate. The default `npm test` is the legacy `node test_swarm.js` — **ignore it**.
5. **DRY/YAGNI/TDD.** For render changes where a runtime unit test is impractical (jsdom has no WebGL), the "test" is the **static source gate** (in `tests/gates/static-gates.test.js`) + the **visual-regression re-baseline**. Write the gate first (red), then implement (green).

---

## File Map (what each task touches)

| File | Responsibility | Tasks |
|---|---|---|
| `src/store/useGameStore.jsx` | add `qualityTier` field + `setQualityTier` action | 1 |
| `src/App.jsx` | select tier at startup (prod) + force `high` in capture bridge (dev) | 1 |
| `src/render/quality.js` | (read-only consumer) `TIERS`, `selectTier`, `readDeviceSignals` | 1,3,4,6 |
| `src/world/Terrain.jsx` | voxel `onBeforeCompile` — inject sRGB decode | 2 |
| `src/GameScene.jsx` | the `<EffectComposer>`, `<Canvas>` dpr, shadow config, lights | 3,4,5,6 |
| `tests/gates/static-gates.test.js` | flip 2 S1-B `it.todo` → real gates; add sRGB gate | 2,3,4 |
| `tests/store/*`, `tests/render/*` | keep existing tokens/quality tests green; add store-field test | 1 |
| `tests/visual/baseline/*.png` | re-baseline after each visual change (human-reviewed) | 2,3,4,5,6 |

**Out of scope for M1 (→ Milestone 2 / later):** the `dangerLevel`/palette-state mood lerp (dusk/obsidian), the `<Atmosphere>` light/fog unification + tokens-driven hex, character rim-light/2-band-toon/inverted-hull outlines, the two new capture states (`dusk-danger`, `boss-obsidian`), `godRays`/`outlineWorldEdge`/`weather`/`renderDistance` tier fields, per-frame allocation hoisting. These are listed at the end so nothing is silently dropped.

---

### Task 1: Wire device-quality tier selection into the store + capture-forced tier

**Why first:** every later task reads the selected tier to gate AO / bloom-mipmap / shadow res / DPR. Capturing deterministic baselines requires forcing a known tier (`high`) in capture mode, so this must land before any re-baseline.

**Files:**
- Modify: `src/store/useGameStore.jsx` (near the `isCaptureMode` field, ~lines 40-41)
- Modify: `src/App.jsx` (the `useEffect` hook block, ~lines 113-143, and add one non-DEV `useEffect`)
- Test: `tests/store/qualityTier.test.js` (create)

- [x] **Step 1: Write the failing test**

Create `tests/store/qualityTier.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { TIERS } from '../../src/render/quality.js';

describe('store qualityTier', () => {
  beforeEach(() => useGameStore.getState().setQualityTier('low'));

  it('defaults to a valid tier key', () => {
    const t = useGameStore.getState().qualityTier;
    expect(Object.keys(TIERS)).toContain(t);
  });

  it('setQualityTier updates the field', () => {
    useGameStore.getState().setQualityTier('high');
    expect(useGameStore.getState().qualityTier).toBe('high');
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -- tests/store/qualityTier.test.js`
Expected: FAIL — `setQualityTier is not a function` / `qualityTier` undefined.

- [x] **Step 3: Add the store field + action**

In `src/store/useGameStore.jsx`, immediately after the existing capture-mode lines:

```js
    isCaptureMode: false,
    setCaptureMode: (on) => set({ isCaptureMode: !!on }),
```

add:

```js
    // Device-gated render quality tier (spec §8). Default 'low' = conservative;
    // App.jsx selects up at startup via selectTier(readDeviceSignals()).
    qualityTier: 'low',
    setQualityTier: (tier) => set({ qualityTier: tier }),
```

- [x] **Step 4: Select the real tier at startup (prod) + force `high` in capture (dev)**

In `src/App.jsx`, add the import near the other imports:

```js
import { selectTier, readDeviceSignals } from './render/quality';
```

Add a **new, non-DEV-gated** `useEffect` (tier selection must run in production too) — place it just above the existing DEV-gated test-bridge `useEffect`:

```js
  // Select the device quality tier once at startup (runs in prod + dev).
  useEffect(() => {
    useGameStore.getState().setQualityTier(selectTier(readDeviceSignals()));
  }, []);
```

Then, inside the existing DEV-gated test-bridge `useEffect`, (a) force a known tier on capture entry so baselines are hardware-independent, and (b) expose a `setQualityTier` hook. Change the `enterCapture` registration and add the new hook:

```js
    registerTestHook('enterCapture', (opts = {}) => {
      enterCaptureMode(opts);
      useGameStore.getState().setCaptureMode(true);
      // Force a deterministic tier so visual baselines never depend on the
      // capture machine's deviceMemory/cores.
      useGameStore.getState().setQualityTier('high');
      if (typeof opts.timeOfDay === 'number') {
        useGameStore.getState().setTimeOfDay(opts.timeOfDay);
      }
    });
    registerTestHook('setQualityTier', (tier) => useGameStore.getState().setQualityTier(tier));
```

- [x] **Step 5: Run tests to verify they pass**

Run: `npm run test:unit -- tests/store/qualityTier.test.js`
Expected: PASS (2/2).
Run: `npm run test:unit` — full suite stays green (tokens/quality tests unaffected).

- [x] **Step 6: Commit**

```bash
git add src/store/useGameStore.jsx src/App.jsx tests/store/qualityTier.test.js
git commit -m "feat(render): wire device quality-tier into store + force high tier in capture"
```

> No rendered output changed in this task (the tier is selected but not yet consumed by the composer), so **no re-baseline** is needed. `test:visual` should still pass unchanged.

---

### Task 2: sRGB-decode the voxel texture sample (fix the washout)

**Why:** The `DataArrayTexture` has no colorSpace and is sampled through a **custom `sampler2DArray` uniform**, so `material.colorSpace = SRGBColorSpace` is a confirmed no-op. The stored bytes are sRGB-display values sampled as if linear, then the renderer sRGB-encodes again → washout. The fix is an explicit GLSL `pow(2.2)` decode at the sample site (upstream of lighting, the lighting-correct place).

**Files:**
- Modify: `src/world/Terrain.jsx` (the `#include <color_fragment>` replacement, the `diffuseColor = ...` line)
- Test: `tests/gates/static-gates.test.js` (add a new sRGB gate)

- [x] **Step 1: Write the failing gate**

In `tests/gates/static-gates.test.js`, inside the `describe('static gates', ...)` block (just above the `it.todo` lines), add:

```js
  it('S1-B: voxel texture sRGB decode present (washout fix)', () => {
    const src = readFileSync(resolve(SRC, 'world/Terrain.jsx'), 'utf8');
    expect(src, 'voxel color_fragment must sRGB-decode the sampled texColor (pow 2.2)')
      .toMatch(/pow\(\s*texColor\.rgb\s*,\s*vec3\(\s*2\.2\s*\)\s*\)/);
  });
```

- [x] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -- tests/gates/static-gates.test.js`
Expected: FAIL — decode pattern not found in `Terrain.jsx`.

- [x] **Step 3: Inject the decode**

In `src/world/Terrain.jsx`, find the exact current line inside the `#include <color_fragment>` replacement:

```js
        // Set the diffuse color to the sampled texture (before lighting calculations)
        diffuseColor = vec4(diffuse * texColor.rgb, texColor.a * customAlpha);
```

Replace the assignment line with the sRGB-decoded form:

```js
        // Set the diffuse color to the sampled texture (before lighting calculations).
        // The DataArrayTexture stores sRGB-display bytes but is sampled through a
        // custom sampler2DArray (so material.colorSpace is a no-op). Decode to linear
        // here, upstream of lighting, so PBR + the renderer's sRGB output are correct.
        diffuseColor = vec4(diffuse * pow(texColor.rgb, vec3(2.2)), texColor.a * customAlpha);
```

- [x] **Step 4: Run the gate to verify it passes**

Run: `npm run test:unit -- tests/gates/static-gates.test.js`
Expected: PASS.
Run: `npm run test:unit` — full suite green.

- [x] **Step 5: Re-baseline (HUMAN REVIEW REQUIRED)**

Run: `npm run visual:baseline` (regenerates `tests/visual/baseline/*.png` under forced `high` tier).
Then **surface the 3 new baselines for human review.** Expected intended change: terrain/foliage reads with correct, richer saturation and is no longer washed-out/over-bright; sky/water unchanged in hue. Confirm with the controller/Kevin that this is the intended improvement (not a darkening regression). If confirmed:
Run: `npm run test:visual`
Expected: PASS (baselines == fresh capture).

- [x] **Step 6: Commit**

```bash
git add src/world/Terrain.jsx tests/gates/static-gates.test.js tests/visual/baseline
git commit -m "fix(render): sRGB-decode voxel texture sample to fix washout; add static gate + re-baseline"
```

---

### Task 3: Discipline the bloom (threshold 0.6 → 0.9, tier-gated mipmap) + flip the bloom gate

**Why:** Current `luminanceThreshold={0.6}` blooms diffuse mid-tones → the scene reads flat. Spec mandates ≥0.85 (glow on emissive/magic only). `mipmapBlur` is currently hardcoded-on; `quality.js` intends it off at `low`.

**Files:**
- Modify: `src/GameScene.jsx` (the `<Bloom>` element + add tier read)
- Modify: `tests/gates/static-gates.test.js` (flip the `it.todo('S1-B: bloom...')` to a real gate)

- [x] **Step 1: Write the failing gate (flip the todo)**

In `tests/gates/static-gates.test.js`, delete the line `it.todo('S1-B: bloom luminanceThreshold >= 0.85');` and add in its place:

```js
  it('S1-B: bloom luminanceThreshold >= 0.85', () => {
    const src = readFileSync(resolve(SRC, 'GameScene.jsx'), 'utf8');
    const m = src.match(/luminanceThreshold=\{\s*([0-9.]+)\s*\}/);
    expect(m, 'Bloom luminanceThreshold prop not found').not.toBeNull();
    expect(parseFloat(m[1])).toBeGreaterThanOrEqual(0.85);
  });
```

- [x] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -- tests/gates/static-gates.test.js`
Expected: FAIL — current threshold is `0.6` (< 0.85).

- [x] **Step 3: Add the tier read + raise the threshold + tier-gate mipmap**

In `src/GameScene.jsx`, add the import (near the existing `import { ... } from '@react-three/postprocessing'` line, add a separate import for the tier config):

```js
import { TIERS } from './render/quality';
```

Inside the component, where other store selectors are read (near the `isCaptureMode` usage), add:

```js
  const qualityTier = useGameStore((s) => s.qualityTier);
  const q = TIERS[qualityTier] || TIERS.low;
```

Then change the `<Bloom>` element from:

```jsx
  <Bloom
    intensity={1.2}
    luminanceThreshold={0.6}
    luminanceSmoothing={0.1}
    mipmapBlur
  />
```

to:

```jsx
  <Bloom
    intensity={1.2}
    luminanceThreshold={0.9}
    luminanceSmoothing={0.1}
    mipmapBlur={q.bloomMipmap}
  />
```

- [x] **Step 4: Run the gate to verify it passes**

Run: `npm run test:unit -- tests/gates/static-gates.test.js`
Expected: PASS.
Run: `npm run test:unit` — full suite green.

- [x] **Step 5: Re-baseline (HUMAN REVIEW REQUIRED)**

Run: `npm run visual:baseline`. Intended change: only genuinely bright/emissive pixels glow; terrain no longer has a hazy bloom wash → crisper, more readable. Confirm with controller/Kevin, then:
Run: `npm run test:visual` → PASS.

- [x] **Step 6: Commit**

```bash
git add src/GameScene.jsx tests/gates/static-gates.test.js tests/visual/baseline
git commit -m "fix(render): bloom luminanceThreshold 0.6->0.9 + tier-gate mipmapBlur; flip bloom gate"
```

---

### Task 4: Instantiate ambient occlusion (N8AO, tier-gated) + remove dead AO imports + flip the AO gate

**Why:** S0's #1 premium-voxel cue is missing: `SSAO` and `N8AO` are both imported but neither is rendered. N8AO (depth-based, no normal pass needed) is the modern high-quality choice. Render it tier-gated (`q.ao`), half-res for perf.

**Files:**
- Modify: `src/GameScene.jsx` (imports line 8 + line 6 drei; the composer block)
- Modify: `tests/gates/static-gates.test.js` (flip `it.todo('S1-B: AO...')`)

- [x] **Step 1: Write the failing gate (flip the todo)**

In `tests/gates/static-gates.test.js`, delete `it.todo('S1-B: AO pass present in the EffectComposer (render-probe)');` and add:

```js
  it('S1-B: AO pass present in the EffectComposer', () => {
    const src = readFileSync(resolve(SRC, 'GameScene.jsx'), 'utf8');
    expect(src, 'N8AO must be rendered inside the composer, not just imported')
      .toMatch(/<N8AO\b/);
  });
```

- [x] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -- tests/gates/static-gates.test.js`
Expected: FAIL — `<N8AO` appears nowhere in JSX (only the import).

- [x] **Step 3: Clean dead imports + render N8AO tier-gated**

In `src/GameScene.jsx`, change the postprocessing import (line ~8) from:

```js
import { EffectComposer, SSAO, Bloom, Noise, Vignette, N8AO } from '@react-three/postprocessing';
```

to (drop `SSAO` — unused; keep `N8AO`):

```js
import { EffectComposer, Bloom, Noise, Vignette, N8AO } from '@react-three/postprocessing';
```

Change the drei import (line ~6) from:

```js
import { PointerLockControls, Stats, Preload, Sky, ContactShadows } from '@react-three/drei';
```

to (drop unused `ContactShadows`):

```js
import { PointerLockControls, Stats, Preload, Sky } from '@react-three/drei';
```

Then update the composer. Current block:

```jsx
<EffectComposer disableNormalPass>
  <Bloom
    intensity={1.2}
    luminanceThreshold={0.9}
    luminanceSmoothing={0.1}
    mipmapBlur={q.bloomMipmap}
  />
  {!isCaptureMode && <Noise opacity={0.01} />}
  <Vignette eskil={false} offset={0.3} darkness={0.8} />
</EffectComposer>
```

becomes (N8AO first so AO multiplies into the lit scene; drop the `disableNormalPass` prop — it does not exist in @react-three/postprocessing v3, the normal pass is already off by default; N8AO derives AO from depth):

```jsx
<EffectComposer>
  {q.ao && (
    <N8AO
      halfRes
      aoRadius={1.2}
      distanceFalloff={1.0}
      intensity={2.0}
      quality="medium"
      color="black"
    />
  )}
  <Bloom
    intensity={1.2}
    luminanceThreshold={0.9}
    luminanceSmoothing={0.1}
    mipmapBlur={q.bloomMipmap}
  />
  {!isCaptureMode && <Noise opacity={0.01} />}
  <Vignette eskil={false} offset={0.3} darkness={0.8} />
</EffectComposer>
```

- [x] **Step 4: Run the gate to verify it passes**

Run: `npm run test:unit -- tests/gates/static-gates.test.js`
Expected: PASS (all three S1-B gates now green: sRGB, AO, bloom).
Run: `npm run test:unit` — full suite green (no more dead-import references; confirm nothing else imported `SSAO`/`ContactShadows` — grep first: `grep -rn 'SSAO\|ContactShadows' src/` must return zero).

- [x] **Step 5: Re-baseline (HUMAN REVIEW REQUIRED)**

Run: `npm run visual:baseline` (captures under forced `high` tier → `q.ao` true → N8AO present). Intended change: crevices/contact areas between voxels gain soft grounding shadows → depth and "premium voxel" read. Confirm with controller/Kevin (watch for over-darkening — if too strong, dial `intensity` down toward 1.2 and re-baseline). Then:
Run: `npm run test:visual` → PASS.

- [x] **Step 6: Commit**

```bash
git add src/GameScene.jsx tests/gates/static-gates.test.js tests/visual/baseline
git commit -m "feat(render): instantiate N8AO ambient occlusion (tier-gated); drop dead SSAO/ContactShadows; flip AO gate"
```

---

### Task 5: Add anti-aliasing (SMAA) + a baseline warm grade (HueSaturation + BrightnessContrast)

**Why:** `<Canvas gl={{antialias:false}}>` relies on "post-processing handles AA" but there is **no AA effect** in the composer → aliased edges. Add `SMAA`. Also add a subtle, always-on warm grade as the foundation of the "magic-hour" Atmosphere signature (the mood-lerped version comes in M2; this is the static baseline).

**Files:**
- Modify: `src/GameScene.jsx` (imports + composer block)

- [x] **Step 1: (No new gate — covered by the visual baseline.)** Confirm current state.

Run: `npm run test:unit` — green baseline before changes.

- [x] **Step 2: Add SMAA + grade imports**

In `src/GameScene.jsx`, extend the postprocessing import to include `SMAA`, `HueSaturation`, `BrightnessContrast`:

```js
import { EffectComposer, Bloom, Noise, Vignette, N8AO, SMAA, HueSaturation, BrightnessContrast } from '@react-three/postprocessing';
```

- [x] **Step 3: Insert grade (before bloom) + SMAA (after bloom)**

Update the composer to the final M1 effect order — AO → grade → bloom → SMAA → Noise → Vignette:

```jsx
<EffectComposer>
  {q.ao && (
    <N8AO
      halfRes
      aoRadius={1.2}
      distanceFalloff={1.0}
      intensity={2.0}
      quality="medium"
      color="black"
    />
  )}
  {/* Baseline warm "magic-hour" grade (Atmosphere signature ①, static form;
      the mood-lerped version lands in S1-B Milestone 2). Subtle by design. */}
  <HueSaturation saturation={0.08} />
  <BrightnessContrast brightness={0.0} contrast={0.06} />
  <Bloom
    intensity={1.2}
    luminanceThreshold={0.9}
    luminanceSmoothing={0.1}
    mipmapBlur={q.bloomMipmap}
  />
  <SMAA />
  {!isCaptureMode && <Noise opacity={0.01} />}
  <Vignette eskil={false} offset={0.3} darkness={0.8} />
</EffectComposer>
```

- [x] **Step 4: Verify build + unit tests**

Run: `npm run test:unit` — green (the AO gate still matches `<N8AO`; bloom gate still ≥0.85).
Run: `npm run build` — must succeed (confirms the new imports resolve in the production bundle).

- [x] **Step 5: Re-baseline (HUMAN REVIEW REQUIRED)**

Run: `npm run visual:baseline`. Intended change: edges are cleaner (no jaggies); the scene reads slightly warmer + a touch more saturated/contrasty — premium, not garish. Confirm with controller/Kevin (if the grade reads too strong, reduce `saturation`/`contrast` toward 0.04 and re-baseline). Then:
Run: `npm run test:visual` → PASS.

- [x] **Step 6: Commit**

```bash
git add src/GameScene.jsx tests/visual/baseline
git commit -m "feat(render): add SMAA anti-aliasing + baseline warm grade; lock M1 effect order"
```

---

### Task 6: Thread tiers into shadows + DPR + add runtime perf auto-gating

**Why:** `shadowConfig` (2048²) and the DPR cap (`min(dpr,2)`) are hardcoded — low/mid devices never get the smaller maps `quality.js` intends. Add `<PerformanceMonitor>` (incline/decline → step tier) + `<AdaptiveDpr>`, both **disabled in capture mode** for determinism.

**Files:**
- Modify: `src/GameScene.jsx` (shadowConfig, `<Canvas>` dpr, add perf components, drei import)

- [x] **Step 1: Confirm green baseline**

Run: `npm run test:unit` — green.

- [x] **Step 2: Add drei perf imports**

Extend the drei import:

```js
import { PointerLockControls, Stats, Preload, Sky, PerformanceMonitor, AdaptiveDpr } from '@react-three/drei';
```

- [x] **Step 3: Tier-drive the shadow map size**

Change `shadowConfig` from a constant-deps memo to depend on the tier:

```js
  const shadowConfig = useMemo(() => ({
    mapSize: [q.shadowMapSize, q.shadowMapSize],
    camera: {
      left: -100,
      right: 100,
      top: 100,
      bottom: -100,
      near: 0.1,
      far: 200
    }
  }), [q.shadowMapSize]);
```

> Note: under the forced `high` capture tier, `shadowMapSize` is 2048 (identical to the old hardcoded value), so **this task produces no capture-visible change** at `high` — baselines should be unaffected.

- [x] **Step 4: Tier-cap the DPR via the Canvas prop**

On `<Canvas>`, add the `dpr` prop and remove the manual `setPixelRatio`. Add the prop to the opening tag:

```jsx
      <Canvas
        shadows
        dpr={[1, q.dprCap]}
        className="w-full h-full"
```

and delete this line from `onCreated`:

```js
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
```

(Leave the rest of `onCreated` — camera rotation, `window.__threeScene` etc. — untouched.)

- [x] **Step 5: Add runtime auto-gating (capture-safe)**

Inside `<Canvas>`, alongside the scene contents (e.g. just before `<EnvironmentalFog />`), add — gated off in capture mode so it never perturbs baselines:

```jsx
        {!isCaptureMode && (
          <PerformanceMonitor
            onDecline={() => {
              const cur = useGameStore.getState().qualityTier;
              const next = cur === 'high' ? 'med' : 'low';
              if (next !== cur) useGameStore.getState().setQualityTier(next);
            }}
          />
        )}
        {!isCaptureMode && <AdaptiveDpr pixelated />}
```

- [x] **Step 6: Verify**

Run: `npm run test:unit` — green.
Run: `npm run build` — succeeds.
Run: `npm run visual:baseline` then `npm run test:visual` — should pass **with no baseline change** at the forced `high` tier (DPR cap 2 + shadow 2048 == prior). If pixels shifted, investigate before committing (a change here is unexpected). Human-confirm "no visible change" before committing any baseline delta.

- [x] **Step 7: Commit**

```bash
git add src/GameScene.jsx tests/visual/baseline
git commit -m "feat(render): tier-drive shadow map + DPR cap; add capture-safe PerformanceMonitor + AdaptiveDpr"
```

---

### Task 7: Final M1 verification sweep

**Files:** none (verification only).

- [x] **Step 1: Full unit suite**

Run: `npm run test:unit`
Expected: PASS, including all three S1-B static gates (`sRGB decode`, `AO present`, `bloom >= 0.85`) and the existing tokens/quality/store tests. The two S1-C `it.todo`s remain (correctly deferred).

- [x] **Step 2: Full visual suite**

Run: `npm run test:visual`
Expected: PASS for `menu`, `explore-day`, `explore-night`.

- [x] **Step 3: Production build**

Run: `npm run build`
Expected: succeeds; confirm the dev-only bridge is still tree-shaken — `grep -c '__craftyTest' dist/assets/*.js` returns 0 (as in S1-A).

- [x] **Step 4: Confirm dead-import cleanup**

Run: `grep -rn 'SSAO\|ContactShadows\|disableNormalPass' src/`
Expected: zero matches.

- [x] **Step 5: Report M1 complete** with the before/after of the three §9 gates and a one-line note that baselines were human-reviewed at each visual step.

---

## Self-Review (planner — completed)

- **Spec coverage (§3/§9):** AO instantiate ✓ (T4, gate §9.1) · sRGB decode ✓ (T2, gate §9.2) · bloom ≥0.85 ✓ (T3, gate §9.3) · AA/SMAA ✓ (T5) · color grade baseline ✓ (T5) · device tiers ✓ (T1/T6, spec §8) · visual-regression suite extended/re-baselined ✓ (every visual task). Deferred-by-design (M2): rim light, outlines, toon, day/night+danger lerp, dusk/obsidian states, palette-token wiring — explicitly listed below, not dropped.
- **Placeholder scan:** none — every code step shows complete before/after.
- **Type/name consistency:** `qualityTier`/`setQualityTier`/`TIERS[...]`/`q.ao`/`q.bloomMipmap`/`q.shadowMapSize`/`q.dprCap` used consistently across T1/T3/T4/T5/T6. `N8AO`/`SMAA`/`HueSaturation`/`BrightnessContrast` props verified against the installed `@react-three/postprocessing@3.0.4` type defs. `PerformanceMonitor.onDecline`/`AdaptiveDpr.pixelated` verified against drei 10.7.7 defs. `disableNormalPass` correctly removed (does not exist in pp v3).

---

## Milestone 2 (separate plan — authored AFTER M1 lands, against the updated code)

Not dropped — deferred because M1 rewrites the exact files M2 edits (composer, lights, Terrain), so authoring M2's "exact current code" now would be stale.

1. **`dangerLevel` mood system:** store field + `setDangerLevel` action + `setDangerLevel` bridge hook (mirror `setTimeOfDay`). Continuous `mood ∈ [0,2]` = `max(night?1:0, dangerLevel)`.
2. **`<Atmosphere>` unification:** replace `EnvironmentalFog` + the inline `isDay` light ternaries + the scattered hex (`#e0f7fa`/`#0a0a23`/`#4169E1`) with one component that lerps fog/background/ambient/sun/sky-tint between `tokens.PALETTE` states (`explore`→`dusk`→`obsidian`) by `mood`; feed a `mood`/`dangerLevel` uniform to the terrain shader (reconciling the hardcoded bioluminescence literal). Unify the two inconsistent lerp rates (fog `delta*2` vs shader fixed `0.05`).
3. **Character render language:** rim-light util (`onBeforeCompile` fresnel) on mobs + first-person hands; subtle 2-band toon (`MeshToonMaterial` + 2-step `gradientMap`) on mobs (NOT the boss — preserve its emissive phase-telegraphing) — **must coexist with the per-frame hit-flash traversal** (`SimplifiedNPCSystem.jsx` ~140-149) by naming the outline material; inverted-hull outlines (`drei <Outlines>`, material named `'outline'`) on mobs/boss/chests/pickups (mind transparent boss wings + `toneMapped:false` glow eyes).
4. **Two new capture states:** `dusk-danger` + `boss-obsidian` — add to `capture.mjs` (copy the `call→delay→screenshot` pattern, drive via the new `setDangerLevel` hook) AND `diff.test.js` `STATES` AND generate baselines. Realizes §9.6 (5-state suite).
5. **Remaining tier fields:** `godRays` (high), `outlineWorldEdge` (high, terrain), `weather` particle scaling — wire where their owning systems live.
6. **Per-frame allocation hoist** in the render path (S0 perf) for any `new Object3D/Vector3` in hot loops touched by the above.
