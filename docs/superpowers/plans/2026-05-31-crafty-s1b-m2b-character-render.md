# Crafty S1-B M2b — Character Render Language Implementation Plan

> ✅ **STATUS: COMPLETE — merged to `main` 2026-05-31** (`s1b-m2b-character-render` ff-merged). Executed via subagent-driven-development (Opus per task; spec + quality reviews all APPROVED). `test:visual` 6/6 · 40+2todo unit/gate · build clean. Execution DEVIATED from the original Task 4/5 step text and the deviations are documented inline (the `character-closeup` became a HUD-suppressed sky-studio shot because capture pauses physics → `getMobGroundLevel` raycast is null; `spawnMob` gained an explicit-Y overload; the chest moved into Task 5; the outline was later extended to ALL mob/pet parts + bolder thickness after Kevin flagged inconsistency). Checkboxes below marked complete at the task level. Follow-up polish (outline-consistency) is a separate commit on `main`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Crafty's characters (mobs, boss, pets) and key props a cohesive stylized render language — a subtle 2-band toon shade + a fresnel rim-light on mobs, plus inverted-hull contour outlines on mobs/boss/pets/chests — without disturbing the mob hit-flash feedback or the boss emissive attack-telegraphing, and gated behind a new deterministic visual-capture fixture.

**Architecture:** A single bounded module `src/render/characterStyle.js` owns the look's data (a memoized 2-band gradient `DataTexture`, the outline config, the fresnel-rim `onBeforeCompile` patch, and a `<MobToonMaterial>` wrapper). Consumers (`SimplifiedNPCSystem.jsx`, `AdvancedGameFeatures.jsx`, `world/Terrain.jsx`) apply it declaratively. The mob per-frame hit-flash traversal is hardened to a positive material-type allow-list so it keeps flashing the toon body/head while naturally skipping the outline's `ShaderMaterial` and the basic-material eyes. Two new deterministic capture states (`character-closeup`, `boss-closeup`) gate the look in the visual-regression suite; existing baselines are untouched because mobs/boss/chests are absent from the current 4 frames.

**Tech Stack:** React 19 · three ^0.172 · @react-three/fiber ^9.5 · @react-three/drei ^10.7 (`<Outlines>`) · @react-three/postprocessing ^3.0 · vitest · puppeteer + pixelmatch (visual gate).

---

## Ground-Truth References (verified 2026-05-31 against `main` @ 81e33b6)

| Concern | Location | Fact |
|---|---|---|
| Mob render | `src/SimplifiedNPCSystem.jsx:195-257` | `MobModel` renders body/head/legs as inline `<meshStandardMaterial roughness={0.8} metalness={0.1} color={entity.color}/>`; eyes are `<meshBasicMaterial name="eye"/>`; villager nose is standard `#d2b48c`. |
| Hit-flash traversal | `src/SimplifiedNPCSystem.jsx:141-149` | Every frame, `groupRef.traverse` mutates `child.material.color/.emissive/.emissiveIntensity` for any `child.isMesh && child.material.name !== "eye"`. |
| `baseColor`/`hitColor` | `src/SimplifiedNPCSystem.jsx:75-77` | `baseColor = new THREE.Color(entity.color)`, `hitColor = #ffffff`, `blackColor = #000000`. |
| Leg-swing clock | `src/SimplifiedNPCSystem.jsx:158-160` | `time = performance.now()*0.01`; `swing = speed>0.05 ? sin(time)*0.6 : 0` → **0 when stationary** (NOT frozen by capture, but velocity-gated). |
| Mob AI movement | `src/SimplifiedNPCSystem.jsx:710-772` (`NPCSystem` useFrame) | Posts a per-frame `TICK` to the AI worker; **physics-pause does NOT stop it** → must gate on `isCaptureMode()`. |
| Mob spawn | `src/SimplifiedNPCSystem.jsx:492-538` | `spawnMob(x, z, forceType=null)` adds an ECS entity at ground level; exposed via `useGameStore.setState({ spawnMob })`. No internal capture guard. |
| Capture mob-suppression | `src/SimplifiedNPCSystem.jsx:542` | The auto-spawn interval self-clears in capture; a **direct** `spawnMob()` call still works. |
| Boss render | `src/AdvancedGameFeatures.jsx:623-684` | Torso/neck `<meshStandardMaterial roughness={0.15} metalness={0.9} color={bodyColor} emissive={bodyEmissive} emissiveIntensity={emissiveIntensityVal}/>`; wings transparent `opacity={0.85}`; eyes `<meshBasicMaterial toneMapped={false}/>`; a `<pointLight>`. |
| Boss emissive telegraph | `src/AdvancedGameFeatures.jsx:614-621` | `bodyEmissive`/`emissiveIntensityVal`/`eyeColor` derive from `bossPhase` (0/1/2 → 0.8/1.5/2.2) and `isFlashing` (→ red 3.0). **M2b must NOT touch any emissive prop.** |
| Boss wing-flap clock | `src/AdvancedGameFeatures.jsx:604-609` | `flapAngle = sin(state.clock.elapsedTime * flapSpeed)*0.4` — **NOT frozen by capture** → must gate for a deterministic `boss-closeup`. |
| Chest render | `src/world/Terrain.jsx:310-343` (`TreasureChestsRender`) | Per chest: gold box, silver clasp, basic-material beacon orb, pointLight. `treasureChestsList` from store. Individual meshes → outline-able. |
| Pets render | `src/AdvancedGameFeatures.jsx:852+` (`PetEntities`) | Individual per-pet meshes → outline-able. Lower priority. |
| Capture camera applier | `src/Components.jsx:331-346` | In capture, the Player useFrame hard-sets `getCaptureOpts().camera` `{position, lookAt}` + fov 75 every frame. Runs only after the Player is mounted (`start`). |
| `enterCaptureMode(opts)` | `src/devtest/captureMode.js:39-43` | Merges `opts.camera` into `_opts.camera`. |
| Test hooks | `src/App.jsx:119-154` | `registerTestHook(...)` for `start`, `setTimeOfDay`, `enterCapture`, `setQualityTier`, `setDangerLevel`, `exitCapture`. `enterCapture` forces tier `'high'`. |
| Capture script | `frontend/scripts/visual/capture.mjs:55-104` | Drives: `enterCapture` → menu shot → `start` → `waitForStableTerrain` → `setTimeOfDay(0.5)` → explore-day → night → `setDangerLevel(2)` → boss-obsidian. 1280×800. |
| Visual gate | `frontend/tests/visual/diff.test.js:7-26` | `STATES = ['menu','explore-day','explore-night','boss-obsidian']`; 6% pixelmatch threshold (per-pixel threshold 0.1). |
| Quality tiers | `src/render/quality.js:4-8` | `TIERS = {low,med,high}` with `ao/godRays/bloomMipmap/...`. `outlineWorldEdge` exists but is a **dead flag** (no consumer). |
| drei `<Outlines>` | `node_modules/@react-three/drei/core/Outlines.{d.ts,js}` | Props: `color, thickness (def 0.05), opacity, transparent, angle (def π), toneMapped (def true), screenspace, renderOrder, polygonOffset*`. Renders a `BackSide` `ShaderMaterial` outline mesh as `group.children[0]`. The OutlinesMaterial **has a `color` uniform/property** but **no `emissive`/`emissiveIntensity`** and is NOT a `MeshStandard/Toon` material. |
| MeshToonMaterial | `node_modules/@types/three/.../MeshToonMaterial.d.ts` | `color, gradientMap (Texture|null, needs NearestFilter), emissive, emissiveIntensity, map`. Toon shader samples `gradientMap` at `(dotNL*0.5+0.5, 0)`. |

### Why the hit-flash collision is real, and the fix
The current guard is `child.material.name !== "eye"`. drei's OutlinesMaterial has **no `.name`** (so it wouldn't be skipped by name) but **does** expose a `color` property (the outline-color uniform). The traversal's `if (child.material.color) child.material.color.copy(...)` would therefore **overwrite the outline color** with the mob's body color every frame (and white on hit). Fix: replace the name-based guard with a **positive allow-list on flashable material types** — only `MeshStandardMaterial`/`MeshToonMaterial` get flashed. This keeps the toon body/head flashing, and naturally skips the outline `ShaderMaterial` AND the basic-material eyes (so the redundant `name==="eye"` check can be dropped, though we keep it as defense-in-depth).

### Art-direction starting values (Kevin's eye is the final judge at re-baseline)
- **Toon gradient:** 2 bands — shadow `0.55`, lit `1.0` (Uint8 `[140,255]`), `NearestFilter`, hard step at `dotNL=0.5`. "Subtle" = shadow not too dark.
- **Rim:** color `#bfe2ff` (cool sky-tint), power `2.5`, strength `0.35` (high tier only; `0` on low/med).
- **Outline:** thickness `0.025` (world-space), color `#0b0e14` (near-black, slightly cool), `toneMapped={false}` for a crisp constant contour. Boss outline a touch thicker (`0.04`) for its scale.
- These live as named constants in `characterStyle.js` so re-tuning is one edit.

---

## File Structure

**Create:**
- `src/render/characterStyle.js` — PURE look data + helpers (no JSX, no R3F import → node/vitest-testable): `getToonGradient()` (memoized 2-band `DataTexture`), `TOON`/`OUTLINE`/`RIM` config, `installRim(material, opts)` (fresnel `onBeforeCompile`), `flashableMaterial(mat)` (the hit-flash allow-list predicate).
- `src/render/MobToonMaterial.jsx` — the R3F wrapper component (`extend` + `<MobToonMaterial>`); imports the pure helpers from `characterStyle.js`. (JSX lives in a `.jsx` file — this project's Vite config parses JSX only in `.jsx`; and keeping `extend()` out of the pure module keeps the unit test renderer-free.)
- `tests/render/characterStyle.test.js` — unit tests for the pure pieces.
- `tests/gates/character-render-gates.test.js` — static source gates (boss emissive preserved; AI tick capture-gated; STATES updated).

**Modify:**
- `src/render/quality.js:4-8` — add `charOutline` + `charRim` tier flags.
- `src/SimplifiedNPCSystem.jsx` — toon-swap body/head/legs/nose via `<MobToonMaterial>`; add `<Outlines>` to body+head; harden hit-flash guard (`flashableMaterial`); gate the NPC-AI worker tick on `isCaptureMode()`.
- `src/world/Terrain.jsx:310-343` — add `<Outlines>` to the chest box (tier-gated).
- `src/App.jsx:119-154` — add `spawnCharacterCloseup` + `spawnBossCloseup` test hooks.
- `src/devtest/captureMode.js` — (optional) carry a `fixture` opt; only if needed (camera merge already supports the closeup).
- `src/AdvancedGameFeatures.jsx` — add `<Outlines>` to boss torso+neck (NOT eyes/wings/emissive) + pets; gate wing-flap on `isCaptureMode()`; add a deterministic boss spawn path for `boss-closeup`.
- `frontend/scripts/visual/capture.mjs` — add `character-closeup` (+ `boss-closeup`) capture sequences.
- `frontend/tests/visual/diff.test.js:7` — add the new states to `STATES`.
- `tests/visual/baseline/character-closeup.png` (+ `boss-closeup.png`) — new human-reviewed baselines.

---

## Task 1: `characterStyle.js` module + tier flags (pure, unit-tested)

**Files:**
- Create: `src/render/characterStyle.js`
- Create: `tests/render/characterStyle.test.js`
- Modify: `src/render/quality.js:4-8`

- [x] **Step 1: Write the failing unit test**

Create `tests/render/characterStyle.test.js`:

```js
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { getToonGradient, installRim, flashableMaterial, TOON, OUTLINE, RIM } from '../../src/render/characterStyle.js';

describe('characterStyle', () => {
  it('toon gradient is a 2-band NearestFilter DataTexture (singleton)', () => {
    const g = getToonGradient();
    expect(g).toBeInstanceOf(THREE.DataTexture);
    expect(g.magFilter).toBe(THREE.NearestFilter);
    expect(g.minFilter).toBe(THREE.NearestFilter);
    expect(g.image.width).toBe(2);   // exactly 2 bands
    expect(g.image.height).toBe(1);
    // distinct shadow vs lit band
    const data = g.image.data;
    expect(data[0]).toBe(Math.round(TOON.shadow * 255));
    expect(data[4]).toBe(Math.round(TOON.lit * 255));
    expect(getToonGradient()).toBe(g); // memoized — same instance
  });

  it('installRim wires fresnel uniforms + a stable program cache key', () => {
    const m = new THREE.MeshToonMaterial();
    installRim(m, { color: '#bfe2ff', power: 2.5, strength: 0.35 });
    expect(m.userData.rim.uRimColor.value).toBeInstanceOf(THREE.Color);
    expect(m.userData.rim.uRimPower.value).toBeCloseTo(2.5);
    expect(m.userData.rim.uRimStrength.value).toBeCloseTo(0.35);
    expect(typeof m.onBeforeCompile).toBe('function');
    expect(m.customProgramCacheKey()).toBe('mobToonRim');
    // the patch injects the uniforms into the compiled shader
    const shader = { uniforms: {}, vertexShader: '', fragmentShader: '#include <common>\n#include <dithering_fragment>' };
    m.onBeforeCompile(shader);
    expect(shader.uniforms.uRimStrength).toBe(m.userData.rim.uRimStrength);
    expect(shader.fragmentShader).toContain('uRimColor');
    expect(shader.fragmentShader).toContain('uRimStrength');
  });

  it('flashableMaterial allows Standard+Toon, rejects Basic+Shader (outline)', () => {
    expect(flashableMaterial(new THREE.MeshStandardMaterial())).toBe(true);
    expect(flashableMaterial(new THREE.MeshToonMaterial())).toBe(true);
    expect(flashableMaterial(new THREE.MeshBasicMaterial())).toBe(false);
    expect(flashableMaterial(new THREE.ShaderMaterial())).toBe(false);
    expect(flashableMaterial(null)).toBe(false);
  });

  it('config constants are in sane stylized ranges', () => {
    expect(TOON.shadow).toBeGreaterThan(0.3);
    expect(TOON.shadow).toBeLessThan(TOON.lit);
    expect(OUTLINE.mob.thickness).toBeGreaterThan(0);
    expect(RIM.strength).toBeGreaterThan(0);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run tests/render/characterStyle.test.js`
Expected: FAIL — cannot resolve `../../src/render/characterStyle.js`.

- [x] **Step 3: Implement `src/render/characterStyle.js`**

```js
// Character render language (S1-B M2b): PURE single source of truth for the
// stylized mob/boss/prop look — a subtle 2-band toon gradient, a fresnel
// rim-light shader patch, the inverted-hull outline config, and the hit-flash
// material allow-list. No JSX / no R3F import here (keeps it node-testable);
// the React <MobToonMaterial> wrapper lives in MobToonMaterial.jsx.
import * as THREE from 'three';

// --- Art direction (re-tune here; Kevin's eye is the judge at re-baseline) ---
export const TOON = { shadow: 0.55, lit: 1.0 }; // 2 bands, hard step at dotNL=0.5
export const RIM = { color: '#bfe2ff', power: 2.5, strength: 0.35 }; // high tier only
export const OUTLINE = {
  color: '#0b0e14',
  mob:  { thickness: 0.025 },
  boss: { thickness: 0.04 },
  prop: { thickness: 0.02 },
};

// --- 2-band toon gradient (memoized singleton) ---
let _gradient = null;
export function getToonGradient() {
  if (_gradient) return _gradient;
  const s = Math.round(TOON.shadow * 255);
  const l = Math.round(TOON.lit * 255);
  // width=2,height=1 RGBA, NearestFilter → crisp 2-band toon ramp sampled by .r
  const data = new Uint8Array([s, s, s, 255, l, l, l, 255]);
  const tex = new THREE.DataTexture(data, 2, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  _gradient = tex;
  return tex;
}

// --- Fresnel rim-light: additive view-dependent edge glow on a toon material.
// Independent of emissive (which the mob hit-flash mutates), so no collision.
export function installRim(material, { color = RIM.color, power = RIM.power, strength = RIM.strength } = {}) {
  material.userData.rim = {
    uRimColor: { value: new THREE.Color(color) },
    uRimPower: { value: power },
    uRimStrength: { value: strength },
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = material.userData.rim.uRimColor;
    shader.uniforms.uRimPower = material.userData.rim.uRimPower;
    shader.uniforms.uRimStrength = material.userData.rim.uRimStrength;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimPower;\nuniform float uRimStrength;'
      )
      .replace(
        '#include <dithering_fragment>',
        // vNormal + vViewPosition are standard varyings in three lit materials (toon included)
        'float rimDot = 1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0);\n' +
        'gl_FragColor.rgb += uRimColor * pow(rimDot, uRimPower) * uRimStrength;\n' +
        '#include <dithering_fragment>'
      );
  };
  // All rim materials share ONE compiled program (perf): stable cache key.
  material.customProgramCacheKey = () => 'mobToonRim';
  return material;
}

// --- Hit-flash allow-list: only flash lit body materials; never the outline
// ShaderMaterial or the basic-material eyes. (Replaces the name!=="eye" guard.)
export function flashableMaterial(mat) {
  return !!mat && (mat.isMeshStandardMaterial === true || mat.isMeshToonMaterial === true);
}
```

> **Implementer note (VBA):** before trusting `vNormal`/`vViewPosition`, confirm they're declared in the compiled toon shader (they are for lit materials — toon derives from the same chunks as phong). If a future three version renames them, the `tests/render/characterStyle.test.js` shader-injection assertion still passes (string replace), but the **visual** rim would vanish — caught at re-baseline.

- [x] **Step 3b: Implement `src/render/MobToonMaterial.jsx` (the R3F wrapper)**

```jsx
// R3F wrapper: a per-instance MeshToonMaterial with the shared 2-band gradient
// + the fresnel rim baked in at construction (so onBeforeCompile is set before
// first compile). `rimStrength` is tier-gated by the caller (0 disables the rim
// cheaply without a recompile). Kept in a .jsx file (JSX) + isolated from the
// pure characterStyle.js so the unit test stays renderer-free.
import { MeshToonMaterial } from 'three';
import { extend } from '@react-three/fiber';
import { getToonGradient, installRim, RIM } from './characterStyle';

class MobToonMaterialImpl extends MeshToonMaterial {
  constructor() {
    super();
    this.gradientMap = getToonGradient();
    installRim(this); // strength overridable per-instance via userData.rim
  }
}
extend({ MobToonMaterialImpl });

export function MobToonMaterial({ color, rimStrength = RIM.strength, ...props }) {
  return (
    <mobToonMaterialImpl
      attach="material"
      color={color}
      onUpdate={(self) => { if (self.userData.rim) self.userData.rim.uRimStrength.value = rimStrength; }}
      {...props}
    />
  );
}
```

> **Implementer note:** `<mobToonMaterialImpl>` is the lowercase R3F element name auto-derived from the `extend({ MobToonMaterialImpl })` key — verify it renders (a quick `npm run build` + dev smoke). If R3F's `attach="material"` + a custom material class misbehaves, fall back to a plain `<meshToonMaterial gradientMap={getToonGradient()} ...>` with `onUpdate`-installed rim, and report it as DONE_WITH_CONCERNS.

- [x] **Step 4: Run the unit test to verify it passes**

Run: `cd frontend && npx vitest run tests/render/characterStyle.test.js`
Expected: PASS (4 tests).

- [x] **Step 5: Add tier flags to `src/render/quality.js`**

Modify lines 4-8 — add `charOutline` + `charRim` (leave the dead `outlineWorldEdge` untouched to avoid scope creep):

```js
export const TIERS = {
  low:  { ao: false, godRays: false, bloomMipmap: false, shadowMapSize: 512,  renderDistance: 2, weather: 0.25, dprCap: 1.5, outlineWorldEdge: false, charOutline: false, charRim: false },
  med:  { ao: true,  godRays: false, bloomMipmap: true,  shadowMapSize: 1024, renderDistance: 3, weather: 0.6,  dprCap: 2,   outlineWorldEdge: false, charOutline: true,  charRim: false },
  high: { ao: true,  godRays: true,  bloomMipmap: true,  shadowMapSize: 2048, renderDistance: 4, weather: 1.0,  dprCap: 2,   outlineWorldEdge: true,  charOutline: true,  charRim: true  },
};
```

(Toon shading itself is applied on ALL tiers — it is no costlier than Standard PBR. Outlines double character draw calls → med+. Rim is a shader add → high only. Capture forces `high` → closeup baselines show the full look.)

- [x] **Step 6: Run the existing quality unit tests to confirm no regression**

Run: `cd frontend && npx vitest run tests/render/quality.test.js` (if present) and `npx vitest run`
Expected: PASS (new keys are additive; `selectTier` unchanged).

- [x] **Step 7: Commit**

```bash
git add frontend/src/render/characterStyle.js frontend/src/render/MobToonMaterial.jsx frontend/tests/render/characterStyle.test.js frontend/src/render/quality.js
git commit -m "feat(render): character-style module (2-band toon + fresnel rim + outline config) and tier flags"
```

---

## Task 2: Mob render language — toon + rim + outline + hit-flash hardening

**Files:**
- Modify: `src/SimplifiedNPCSystem.jsx` (imports; `MobModel` materials @195-257; hit-flash guard @143-149)

- [x] **Step 1: Add imports + read the quality tier in `MobModel`**

At the top of `src/SimplifiedNPCSystem.jsx`, add:

```js
import { Outlines } from '@react-three/drei';
import { MobToonMaterial } from './render/MobToonMaterial';
import { flashableMaterial, OUTLINE, RIM } from './render/characterStyle';
import { TIERS } from './render/quality';
```

(Task 2 Step 2 also references `OUTLINE_RIM_STRENGTH = RIM.strength` — `RIM` is now imported on the line above; drop the separate `import { RIM }` shown later in that step.)

Inside `MobModel`, near the other `useGameStore` reads (the component already calls `useGameStore.getState()` in useFrame; for render-time tier read a reactive selector is fine since tier changes are rare):

```js
const qualityTier = useGameStore(state => state.qualityTier) || 'high';
const q = TIERS[qualityTier] || TIERS.high;
```

- [x] **Step 2: Swap body/head/leg/nose materials to `<MobToonMaterial>`**

Replace each mob body part's `<meshStandardMaterial roughness={0.8} metalness={0.1} color={entity.color} />` with the toon wrapper, passing the tier-gated rim strength. Body (`:199-202`):

```jsx
{/* Body */}
<mesh castShadow receiveShadow position={[0, bodyH / 2, 0]}>
  <boxGeometry args={[bodyW, bodyH, bodyD]} />
  <MobToonMaterial color={entity.color} rimStrength={q.charRim ? OUTLINE_RIM_STRENGTH : 0} />
  {q.charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}
</mesh>
```

Head (`:204-207`): same pattern (toon material + `q.charOutline && <Outlines .../>`).
Legs (`:243-246` non-spider and `:249-255` spider): replace the standard material with `<MobToonMaterial color={entity.color} rimStrength={q.charRim ? OUTLINE_RIM_STRENGTH : 0} />`. **Do NOT** add `<Outlines>` to legs (keeps draw-call count and silhouette clean — body+head contour is enough).
Villager nose (`:234-237`): replace with `<MobToonMaterial color="#d2b48c" rimStrength={q.charRim ? OUTLINE_RIM_STRENGTH : 0} />` (no outline).
Eyes (`:211-218`, `:225-232`): **leave as `<meshBasicMaterial name="eye"/>`** — unchanged.

Define the rim-strength constant once near the imports:

```js
import { RIM } from './render/characterStyle';
const OUTLINE_RIM_STRENGTH = RIM.strength;
```

> **Note on `<Outlines>` as a child of a `<mesh>`:** drei's `<Outlines>` detects the parent mesh geometry and injects a `BackSide` outline mesh as `group.children[0]`. Placed inside the body/head `<mesh>`, the outline rides the flinch deformation with the body (correct). It is a child of `groupRef` so the hit-flash traversal will visit it — Step 4 ensures it is skipped.

- [x] **Step 3: Verify the toon material still receives the hit-flash white-flash**

`MeshToonMaterial` has `.color`, `.emissive`, and `.emissiveIntensity`, so the existing hit-flash (white color + emissive flash) keeps working on toon body/head/legs once Step 4's guard allows toon materials. No extra code — this step is a reasoning checkpoint, validated by the Task 4 visual capture (no hit in closeup) and by gameplay smoke-test.

- [x] **Step 4: Harden the hit-flash traversal guard (`:143-149`)**

Replace:

```jsx
groupRef.current.traverse((child) => {
  if (child.isMesh && child.material && child.material.name !== "eye") {
     if (child.material.color) child.material.color.copy(isHit ? hitColor : baseColor);
     if (child.material.emissive) child.material.emissive.copy(isHit ? hitColor : blackColor);
     if (child.material.emissiveIntensity !== undefined) child.material.emissiveIntensity = isHit ? 1.5 : 0;
  }
});
```

with (positive allow-list — flashes only Standard/Toon body materials; skips the outline `ShaderMaterial` and basic-material eyes):

```jsx
groupRef.current.traverse((child) => {
  // Only flash lit body materials (Standard/Toon). The drei outline mesh
  // (BackSide ShaderMaterial, exposes a `.color` uniform) and the basic-material
  // eyes must NOT be mutated, or the outline color would be clobbered each frame.
  if (child.isMesh && flashableMaterial(child.material) && child.material.name !== "eye") {
     child.material.color.copy(isHit ? hitColor : baseColor);
     child.material.emissive.copy(isHit ? hitColor : blackColor);
     child.material.emissiveIntensity = isHit ? 1.5 : 0;
  }
});
```

(The inner `if (child.material.color)` existence guards are now unnecessary — Standard/Toon always have those properties — but the `name !== "eye"` check is kept as belt-and-suspenders.)

- [x] **Step 5: Build smoke-test (no test runner for this visual step yet — gate is Task 4)**

Run: `cd frontend && npm run build`
Expected: clean build (no unresolved imports, JSX valid). Then a quick manual `npm run dev` sanity check that mobs render with the toon look + outline (Kevin's eye), and that hitting a mob still flashes it white with the outline intact.

- [x] **Step 6: Commit**

```bash
git add frontend/src/SimplifiedNPCSystem.jsx
git commit -m "feat(mobs): 2-band toon + fresnel rim + contour outline; harden hit-flash to a material-type allow-list"
```

---

## Task 3: Capture determinism — freeze mob AI in capture

**Files:**
- Modify: `src/SimplifiedNPCSystem.jsx` (`NPCSystem` AI-tick useFrame @710)

- [x] **Step 1: Add the failing static gate**

Create `tests/gates/character-render-gates.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('M2b static gates', () => {
  it('mob AI worker tick is capture-gated (deterministic closeup)', () => {
    const src = read('src/SimplifiedNPCSystem.jsx');
    // the per-frame TICK useFrame must early-return in capture mode
    expect(src).toMatch(/if \(isCaptureMode\(\)\) return;[\s\S]{0,400}workerRef\.current\.postMessage/);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run tests/gates/character-render-gates.test.js`
Expected: FAIL — the capture guard isn't present in the AI tick yet.

- [x] **Step 3: Gate the AI tick**

In `NPCSystem`'s movement useFrame (`:710`), add the guard as the first line after the existing early-return:

```jsx
useFrame((state, delta) => {
  if (!camera || !workerRef.current) return;
  if (isCaptureMode()) return; // freeze mob AI/movement so capture frames are byte-stable
  const now = performance.now();
  // ...unchanged...
```

(`isCaptureMode` is already imported at `:10`.)

- [x] **Step 4: Run the gate to verify it passes**

Run: `cd frontend && npx vitest run tests/gates/character-render-gates.test.js`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add frontend/src/SimplifiedNPCSystem.jsx frontend/tests/gates/character-render-gates.test.js
git commit -m "fix(capture): freeze mob AI tick in capture mode for deterministic character fixture"
```

---

## Task 4: `character-closeup` capture fixture (mob-only, sky-studio) + visual baseline

**Files:**
- Modify: `src/App.jsx:119-154` (add `spawnCharacterCloseup` hook)
- Modify: `frontend/scripts/visual/capture.mjs` (add the closeup sequence)
- Modify: `frontend/tests/visual/diff.test.js:7` (add the state)

- [x] **Step 1: Add the `spawnCharacterCloseup` test hook in `src/App.jsx`**

> **Implementation discovery (2026-05-31):** capture mounts `<Physics paused={isCaptureMode}>`, so Rapier never steps and the query pipeline is empty → `getMobGroundLevel(x,z)` (a raycast) returns `null` in capture. That makes `spawnMob` bail AND collapses `groundY`-relative placement to ~world-origin (vacuous frame). FIX: (a) extend `spawnMob` with an explicit-Y overload; (b) place the subject at a FIXED elevated Y framed against the sky horizon (terrain below frame). Chest moves to Task 5.

**Step 0: Extend `spawnMob` with an explicit-Y overload (`src/SimplifiedNPCSystem.jsx`):**
```js
const spawnMob = (x, z, forceType = null, explicitY = null) => {
  const store = useGameStore.getState();
  let y = explicitY;
  if (y === null) {
    if (!store.getMobGroundLevel) return false;
    y = store.getMobGroundLevel(x, z);
    if (y === null || isNaN(y)) return false;
  }
  // ...rest unchanged (position uses `new THREE.Vector3(x, y + 0.5, z)`)...
```
(Existing `spawnMob(x,z)` / `spawnMob(x,z,type)` callers unaffected — explicitY defaults null → old behavior.)

Inside the DEV test-bridge `useEffect` (after the `setDangerLevel` hook), add (MOB-ONLY sky-studio):

```jsx
// Character-render fixture: a deterministic close-up of ONE zombie, framed against
// the sky horizon. Capture pauses physics → getMobGroundLevel (raycast) is null, so
// we place the subject at a FIXED elevated Y and frame the camera so the terrain
// sits below the frame (clean sky backdrop showcases toon/rim/outline).
registerTestHook('spawnCharacterCloseup', () => {
  const store = useGameStore.getState();
  store.setDangerLevel(0);
  store.setTimeOfDay(0.5); // flattering midday
  const SX = 0, SZ = -8, SY = 70; // elevated, above the ~y53 terrain → sky backdrop
  if (store.spawnMob) store.spawnMob(SX, SZ, 'zombie', SY);
  enterCaptureMode({ camera: { position: [SX + 1.2, SY + 1.1, SZ + 4.6], lookAt: [SX + 0.4, SY + 0.7, SZ] } });
});
```

(`enterCaptureMode` is already imported in `App.jsx`. Camera coords are Kevin's-eye-tunable at re-baseline.)

- [x] **Step 2: Add the capture sequence in `frontend/scripts/visual/capture.mjs`**

After the `boss-obsidian` block (`:98`), add:

```js
// character-closeup: deterministic single-zombie + chest close-up that gates the
// M2b character render language (toon + rim + outline). Resets danger/day first.
await page.evaluate(() => window.__craftyTest.call('spawnCharacterCloseup'));
await delay(1800); // mob mounts + spawn-pop settles + mood/lighting lerp completes
await page.screenshot({ path: resolve(OUT, 'character-closeup.png') });
console.log('captured character-closeup');
```

Also update the header comment (`:3`) to list `character-closeup`.

- [x] **Step 3: Add the state to `frontend/tests/visual/diff.test.js`**

Line 7:

```js
const STATES = ['menu', 'explore-day', 'explore-night', 'boss-obsidian', 'character-closeup'];
```

- [x] **Step 4: Generate the baseline SURGICALLY (don't clobber the existing 4) + HUMAN REVIEW**

```bash
cd frontend && npm run visual:capture                 # current/, all 5 states
npm run test:visual                                   # existing 4 MUST pass (regression check); closeup errors "missing baseline"
cp tests/visual/current/character-closeup.png tests/visual/baseline/character-closeup.png   # add ONLY the new baseline
npm run test:visual                                   # all 5 pass
npm run visual:capture && npm run test:visual         # determinism: report the closeup self-diff % (<1% ideal)
```
**If the existing 4 drift at the regression check → STOP** (the change leaked into a shared path). Then **open `tests/visual/baseline/character-closeup.png` and eyeball it** (Kevin's anti-blind-harness gate): the zombie must show the 2-band toon banding + a cool rim on the silhouette edge + a crisp dark contour outline, framed against the sky (NOT an empty frame).

- [x] **Step 5: Commit (baseline image + harness)**

```bash
git add frontend/src/SimplifiedNPCSystem.jsx frontend/src/App.jsx frontend/scripts/visual/capture.mjs frontend/tests/visual/diff.test.js frontend/tests/visual/baseline/character-closeup.png
git commit -m "test(visual): character-closeup fixture + baseline (toon/rim/outline gate)"
```
(Source split across commits is fine — the spawnMob overload + hook may land in a follow-up fix commit if the first capture reveals a placement issue.)

---

## Task 5: Treasure-chest outline (prop)

**Files:**
- Modify: `src/world/Terrain.jsx:310-343` (`TreasureChestsRender`)

- [x] **Step 1: Add imports + tier read**

```js
import { Outlines } from '@react-three/drei';
import { OUTLINE } from '../render/characterStyle';
import { TIERS } from '../render/quality';
```

In `TreasureChestsRender`:

```js
const qualityTier = useGameStore(state => state.qualityTier) || 'high';
const charOutline = (TIERS[qualityTier] || TIERS.high).charOutline;
```

- [x] **Step 2: Add `<Outlines>` to the chest box (`:318-327`)**

```jsx
{/* Visual chest box */}
<mesh castShadow receiveShadow>
  <boxGeometry args={[1.0, 0.8, 0.8]} />
  <meshStandardMaterial color="#d4af37" roughness={0.15} metalness={0.85} emissive="#b8860b" emissiveIntensity={0.2} />
  {charOutline && <Outlines thickness={OUTLINE.prop.thickness} color={OUTLINE.color} toneMapped={false} />}
</mesh>
```

(Leave the clasp + beacon orb un-outlined — the box contour reads the chest silhouette.)

- [x] **Step 3: Add a chest to the closeup fixture + re-baseline**

Task 4 made the closeup mob-only (sky-studio). Add ONE deterministic chest beside the zombie so the outline is verified in-frame. In the `spawnCharacterCloseup` hook (`src/App.jsx`), after the `spawnMob(...)` line, inject the chest at the same elevated Y (slightly toward camera, on the implied ground line):
```jsx
useGameStore.setState({
  treasureChestsList: [{ id: 'closeup-chest', position: [SX + 1.9, SY - 0.4, SZ + 0.4] }],
});
```
(`SX/SY/SZ` are already in scope from Step 1.) Re-baseline SURGICALLY (only the closeup; don't touch the other 4):
```bash
cd frontend && npm run visual:capture            # current/, all 5
npm run test:visual                              # existing 4 PASS; closeup mismatches old baseline (expected)
cp tests/visual/current/character-closeup.png tests/visual/baseline/character-closeup.png
npm run test:visual                              # all 5 pass; eyeball the chest now has a dark contour
```
Commit `src/world/Terrain.jsx` + `src/App.jsx` + the updated `tests/visual/baseline/character-closeup.png`.

- [x] **Step 4: Commit**

```bash
git add frontend/src/world/Terrain.jsx frontend/tests/visual/baseline/character-closeup.png
git commit -m "feat(props): contour outline on treasure chests (tier-gated)"
```

---

## Task 6 (SECONDARY — separable; Kevin may defer): Boss + pets outline + `boss-closeup`

> The boss is the heavy case: its wing-flap rides `state.clock` (not frozen by capture), its wings are transparent, and its emissive is the attack-telegraph. This task is self-contained — it can ship in a follow-up if M2b core (Tasks 1-5) is approved alone. Boss gets an **outline only** (NO toon, NO rim) to preserve the emissive telegraph.

**Files:**
- Modify: `src/AdvancedGameFeatures.jsx` (boss torso/neck outline @628-648; wing-flap gate @604-609; deterministic `boss-closeup` spawn; pets outline @852+)
- Modify: `src/App.jsx` (add `spawnBossCloseup` hook)
- Modify: `frontend/scripts/visual/capture.mjs` + `frontend/tests/visual/diff.test.js`
- Modify: `tests/gates/character-render-gates.test.js` (boss-emissive-preserved gate)

- [x] **Step 1: Add the boss-emissive-preserved static gate (failing)**

Append to `tests/gates/character-render-gates.test.js`:

```js
it('boss torso/neck still drive emissive from phase state (telegraph preserved)', () => {
  const src = read('src/AdvancedGameFeatures.jsx');
  expect(src).toMatch(/emissive=\{bodyEmissive\}/);
  expect(src).toMatch(/emissiveIntensity=\{emissiveIntensityVal\}/);
  // boss must NOT be converted to a toon material
  expect(src).not.toMatch(/MobToonMaterial|meshToonMaterial/);
});
it('boss wing-flap is capture-gated for a deterministic boss-closeup', () => {
  const src = read('src/AdvancedGameFeatures.jsx');
  expect(src).toMatch(/isCaptureMode\(\)[\s\S]{0,200}leftWingRef/);
});
```

Run: `cd frontend && npx vitest run tests/gates/character-render-gates.test.js` → the new two FAIL.

- [x] **Step 2: Add imports**

```js
import { Outlines } from '@react-three/drei';
import { isCaptureMode } from './devtest/captureMode';
import { OUTLINE } from './render/characterStyle';
import { TIERS } from './render/quality';
```

- [x] **Step 3: Outline boss torso + neck (NOT wings/eyes/emissive)**

Read `q.charOutline` (reactive selector) in `BossEntity`, then add `<Outlines>` inside the torso (`:628`) and neck (`:639`) meshes only — leave every `emissive*` prop untouched:

```jsx
{/* Torso */}
<mesh castShadow receiveShadow>
  <boxGeometry args={[3, 2, 4]} />
  <meshStandardMaterial roughness={0.15} metalness={0.9} color={bodyColor} emissive={bodyEmissive} emissiveIntensity={emissiveIntensityVal} />
  {charOutline && <Outlines thickness={OUTLINE.boss.thickness} color={OUTLINE.color} toneMapped={false} />}
</mesh>
```

(Wings are transparent — an opaque BackSide outline around them looks wrong, so skip. Eyes are glow basic-material — skip.)

- [x] **Step 4: Gate the wing-flap for determinism (`:604-609`)**

```jsx
if (leftWingRef.current && rightWingRef.current) {
  if (isCaptureMode()) {
    leftWingRef.current.rotation.z = 0.2;   // rest pose
    rightWingRef.current.rotation.z = -0.2;
  } else {
    const flapSpeed = bossPhase === 0 ? 5.5 : 2.5;
    const flapAngle = Math.sin(state.clock.elapsedTime * flapSpeed) * 0.4;
    leftWingRef.current.rotation.z = 0.2 + flapAngle;
    rightWingRef.current.rotation.z = -0.2 - flapAngle;
  }
}
```

- [x] **Step 5: Outline pets (`PetEntities` @852+)**

Read the file region first; add `{charOutline && <Outlines thickness={OUTLINE.mob.thickness} color={OUTLINE.color} toneMapped={false} />}` inside each pet body/head mesh (mirror the mob pattern). Pets keep their existing materials (no toon) for M2b — outline only, to bound scope.

- [x] **Step 6: Add `spawnBossCloseup` hook in `src/App.jsx`**

```jsx
// Boss-closeup fixture: spawn a deterministic, frozen boss in the obsidian mood.
registerTestHook('spawnBossCloseup', () => {
  const store = useGameStore.getState();
  store.setDangerLevel(2);
  store.setTimeOfDay(0.0);
  const BX = 0, BZ = -6;
  const groundY = store.getMobGroundLevel ? store.getMobGroundLevel(BX, BZ) : 53;
  // Drive the boss-system into an active, fixed-phase state. NOTE: the exact
  // store setter depends on useBossSystem's API — read it and use the real
  // setter (e.g. store.setBossActive + a fixed bossPositionRef). If no public
  // setter exists, add a minimal dev-only `forceBossSpawn(pos)` action.
  if (store.forceBossSpawn) store.forceBossSpawn([BX, groundY + 1.5, BZ]);
  enterCaptureMode({ camera: { position: [BX + 5, groundY + 4, BZ + 9], lookAt: [BX, groundY + 1.5, BZ] } });
});
```

> **Implementer:** `useBossSystem` (`AdvancedGameFeatures.jsx:102-119`) spawns the boss at `playerLevel>=5`. There is no public force-spawn setter today. Add a minimal dev-only `forceBossSpawn([x,y,z])` store action (sets `bossActive=true` + a fixed `bossPositionRef` + `bossPhase=0`) wired through `useBossSystem`, used ONLY by this hook. Keep it `import.meta.env.DEV`-guarded.

- [x] **Step 7: Add `boss-closeup` to the capture script + STATES**

`capture.mjs` (after character-closeup):

```js
await page.evaluate(() => window.__craftyTest.call('spawnBossCloseup'));
await delay(1800);
await page.screenshot({ path: resolve(OUT, 'boss-closeup.png') });
console.log('captured boss-closeup');
```

`diff.test.js:7`: `... 'character-closeup', 'boss-closeup'];`

- [x] **Step 8: Run the static gates + generate + HUMAN-REVIEW the boss baseline**

```bash
cd frontend && npx vitest run tests/gates/character-render-gates.test.js   # all pass
npm run visual:capture -- --baseline
# eyeball tests/visual/baseline/boss-closeup.png: dragon shows its emissive
# phase glow (telegraph intact) + a crisp dark contour on torso/neck; wings at
# rest; eyes still glow. Stable across a re-run.
npm run test:visual
```

- [x] **Step 9: Commit**

```bash
git add frontend/src/AdvancedGameFeatures.jsx frontend/src/App.jsx frontend/scripts/visual/capture.mjs frontend/tests/visual/diff.test.js frontend/tests/gates/character-render-gates.test.js frontend/tests/visual/baseline/boss-closeup.png
git commit -m "feat(boss,pets): emissive-preserving contour outlines + deterministic boss-closeup fixture"
```

---

## Task 7: Self-review, full suite, milestone wrap

- [x] **Step 1: Run the entire test suite**

```bash
cd frontend && npx vitest run && npm run build && npm run test:visual
```
Expected: unit + gate tests green; clean build; all visual states (4 existing unchanged + new closeups) within 6%.

- [x] **Step 2: Gameplay smoke test (Kevin's eye)**

`npm run dev` — confirm in live play: mobs show the toon+rim+outline look and still flash white on hit (outline intact); the boss shows outlines + intact phase-emissive telegraph; chests/pets outlined; no perf cliff (check the PerformanceMonitor doesn't thrash tiers).

- [x] **Step 3: Update the 4-piece + memory**

- `memory/ACTIVE_PLAN.md`: M2b → DONE; note S1-C next.
- `memory/CHANGELOG.md`: M2b entry.
- If a reusable lesson emerged (e.g. fresnel-rim-via-onBeforeCompile coexisting with material-mutation traversals), append to native memory `feedback_*` per the EEE loop.

- [x] **Step 4: Merge to `main`**

Per project convention (subagent fix-ups use NEW commits, never `--amend`/`reset`; no Claude footer): finish the branch via `superpowers:finishing-a-development-branch` (squash/merge per Kevin's call), push.

---

## Self-Review (run after drafting; fix inline)

**Spec coverage (ACTIVE_PLAN.md line 12 → tasks):**
- "rim-light" → Task 1 `installRim` + Task 2 application ✓
- "subtle 2-band toon (MeshToonMaterial+gradientMap) on mobs (NOT boss)" → Task 1 `getToonGradient` + Task 2 (mobs) + Task 6 gate (boss excluded) ✓
- "inverted-hull drei <Outlines> on mobs/boss/props" → Task 2 (mobs) + Task 5 (chest prop) + Task 6 (boss/pets) ✓
- "must coexist with the mob per-frame hit-flash traversal" → Task 2 Step 4 (allow-list) ✓
- "needs a character capture fixture (spawn ONE deterministic mob) + a character-closeup state" → Task 4 ✓; determinism → Task 3 ✓

**Placeholder scan:** the `boss-closeup` force-spawn (Task 6 Step 6) is the one under-specified point — flagged explicitly with an implementer directive to read `useBossSystem` and add a dev-only `forceBossSpawn`. Acceptable because Task 6 is the separable/deferrable secondary; core M2b (Tasks 1-5) has no placeholders.

**Type/name consistency:** `MobToonMaterial`, `getToonGradient`, `installRim`, `flashableMaterial`, `OUTLINE`, `RIM`, `TOON`, `charOutline`, `charRim` used identically across tasks. `OUTLINE_RIM_STRENGTH` defined once (Task 2 Step 2). ✓

**Open decisions for Kevin (surfaced, not silently chosen):**
1. **Scope:** include Task 6 (boss/pets + boss-closeup) in M2b, or ship core (Tasks 1-5) first and defer Task 6?
2. **Rim-light:** keep the fresnel rim, or ship toon+outline only (drop Task 1 `installRim`)? (Rim is the one shader-surgery piece.)
3. **Props:** chests only (Task 5), or also outline trees? (Trees are merged terrain voxels — out of scope without a terrain remesh; recommended DEFER to S2/S3.)
```