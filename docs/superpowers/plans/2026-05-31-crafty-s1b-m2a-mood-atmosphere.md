# Crafty S1-B — Render Recipe · Milestone 2a (Mood & Atmosphere) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the world render the **explore → dusk → obsidian danger moods** via a single continuous `mood ∈ [0,2]` lerp driven by `(isDay, dangerLevel)`, unifying the scattered light/fog/sky hardcodes onto `tokens.PALETTE`, and add the `boss-obsidian` capture state so the visual-regression suite covers the danger tiers (spec §4, §9.6).

**Architecture:** A new pure config module `src/render/atmosphere.js` owns the mood math + a module-singleton smoothed `moodRef` (the single source of "current mood", read by both the lighting layer and the terrain shader — avoids per-frame store churn and the prior dual-lerp inconsistency). A new `<Atmosphere>` component replaces the inline `EnvironmentalFog` + `ambientLight` + `directionalLight` + night `pointLight` + drei `<Sky>` with one ref-driven component that, each frame, lerps `moodRef` toward `moodTarget(isDay, dangerLevel)` and applies the blended palette (colours from `tokens.PALETTE`, scalars from `atmosphere.js`) to the fog/background/lights. The terrain shader gains a `mood` uniform that cools + desaturates the terrain toward dusk/obsidian. In capture mode the mood **snaps** to target (deterministic frames). No gameplay triggers are wired (those are S2) — `dangerLevel` defaults 0 and is moved only by the test bridge (and, later, S2). Renderer-portable (WebGL2 now).

**Tech Stack:** React 19.2 · three r172 (`Color.lerpColors`, `MathUtils.lerp`, `FogExp2`) · @react-three/fiber 9.5 (`useFrame`, refs on lights) · zustand 5 · vitest 3 · puppeteer/pixelmatch visual gate.

---

## Key decisions baked in (flag on review if you disagree)
1. **`dusk` IS the everyday night.** Per spec §4 ("Danger Tier 1 — Dusk-shift (night / combat, everyday)"), natural night uses the dusk palette. So `explore-night` renders **mood 1 = dusk**, and a separate `dusk-danger` capture frame would be identical to `explore-night` — redundant. The suite therefore gains exactly **one** new state: `boss-obsidian` (mood 2). Final 4-state suite: `menu`, `explore-day` (mood 0), `explore-night` (mood 1 = dusk), `boss-obsidian` (mood 2).
2. **Mood-driven 3-stop gradient skydome; drei `<Sky>` removed.** The drei `<Sky>` is photoreal scattering that fights the stylized Vanguard+Toon palette, flips binary on `isDay` (inconsistent with a continuous mood), and is largely masked already. M2a replaces it with a camera-following **gradient SkyDome** — `skyTop → skyMid → skyHorizon` from `tokens.PALETTE` (mood-lerped) + a soft sun glow. Built **now**, not deferred: a flat single-colour sky is the #1 "AI-generic" tell on a premium voxel game, the palette already defines the three sky stops for exactly this gradient, and doing it now avoids a second sky re-baseline. (Kevin's call, 2026-05-31.)
3. **`moodRef` is a module singleton, not a store field.** The smoothed mood updates every frame; keeping it in `atmosphere.js` (a `{ current }` ref) avoids per-frame zustand writes and lets the terrain `useFrame` read it directly. The store holds only the low-frequency `dangerLevel` input.
4. **`<Atmosphere>` owns the day/night drive; the terrain's self-lerp is removed.** Today `MinecraftWorld`'s `useFrame` lerps `timeOfDay` at a fixed `0.05` while `EnvironmentalFog` lerps at `delta*2` — two inconsistent rates. M2a makes `<Atmosphere>` the single smoother; terrain reads `moodRef` and derives `timeOfDay = 1 - clamp(mood,0,1)` (preserving the night bioluminescence factor).

---

## Ground rules for the implementer
1. **Branch:** `git checkout -b s1b-m2a-mood` off `main` (controller confirms). Never implement on `main`.
2. **Re-baseline is human-gated.** Tasks 2-4 change rendered output. Regenerate with `npm run visual:baseline`, then surface the new PNGs for a **human eyeball** confirming the change is the intended mood look before committing baselines. If you cannot get review, STOP → `BLOCKED: needs visual review`.
3. **NEW commits only.** Never `git commit --amend`/`git reset`.
4. **Run from `frontend`**; each Bash call is isolated (`cd /Users/kz/Code/Crafty/frontend` in the same command).
5. **Read each file before editing** (line numbers below are post-M1 and approximate).

## File Map
| File | Responsibility | Task |
|---|---|---|
| `src/render/atmosphere.js` (new) | `moodRef`, `MOOD_SCALARS`, `moodTarget`, `sampleMood` | 1 |
| `src/store/useGameStore.jsx` | `dangerLevel` + `setDangerLevel` | 1 |
| `tests/render/atmosphere.test.js` (new) | unit tests for the mood math | 1 |
| `src/render/Atmosphere.jsx` (new) | the ref-driven mood→lights/fog/bg component | 2 |
| `src/GameScene.jsx` | swap inline fog/lights/Sky → `<Atmosphere>` | 2 |
| `src/world/Terrain.jsx` | `mood` uniform + cool/desaturate; drive from `moodRef` | 3 |
| `src/App.jsx` | `setDangerLevel` test-bridge hook | 4 |
| `scripts/visual/capture.mjs` | add `boss-obsidian` capture | 4 |
| `tests/visual/diff.test.js` | add `boss-obsidian` to `STATES` | 4 |
| `tests/visual/baseline/*.png` | re-baseline (human-reviewed) | 2,3,4 |

**Out of scope → M2b (separate plan):** character rim-light / 2-band toon / inverted-hull outlines on mobs/boss/props (+ a character capture-fixture, since mobs are suppressed in capture). Also deferred: gradient sky, `godRays`/`outlineWorldEdge`/`weather` tier fields.

---

### Task 1: `atmosphere.js` (mood math + moodRef) + store `dangerLevel` + tests

**Files:** create `src/render/atmosphere.js`; modify `src/store/useGameStore.jsx`; create `tests/render/atmosphere.test.js`.

- [ ] **Step 1: Write the failing test.** Create `tests/render/atmosphere.test.js`:

```js
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { moodTarget, sampleMood, moodRef } from '../../src/render/atmosphere.js';
import { PALETTE } from '../../src/theme/tokens.js';

describe('moodTarget', () => {
  it('day + no danger = 0 (explore)', () => expect(moodTarget({ isDay: true, dangerLevel: 0 })).toBe(0));
  it('night + no danger = 1 (dusk)', () => expect(moodTarget({ isDay: false, dangerLevel: 0 })).toBe(1));
  it('dangerLevel overrides upward', () => expect(moodTarget({ isDay: true, dangerLevel: 2 })).toBe(2));
  it('takes the max of night and danger', () => expect(moodTarget({ isDay: false, dangerLevel: 2 })).toBe(2));
  it('clamps to [0,2]', () => {
    expect(moodTarget({ isDay: true, dangerLevel: 5 })).toBe(2);
    expect(moodTarget({ isDay: true, dangerLevel: -3 })).toBe(0);
  });
});

describe('sampleMood', () => {
  const hex = (c) => '#' + c.getHexString();
  it('mood 0 = explore palette exactly', () => {
    const m = sampleMood(0);
    expect(hex(m.fog)).toBe(PALETTE.explore.fog.toLowerCase());
    expect(hex(m.sun)).toBe(PALETTE.explore.sun.toLowerCase());
    expect(hex(m.skyTop)).toBe(PALETTE.explore.skyTop.toLowerCase());
    expect(hex(m.skyHorizon)).toBe(PALETTE.explore.skyHorizon.toLowerCase());
  });
  it('mood 1 = dusk palette exactly', () => {
    const m = sampleMood(1);
    expect(hex(m.fog)).toBe(PALETTE.dusk.fog.toLowerCase());
  });
  it('mood 2 = obsidian palette exactly', () => {
    const m = sampleMood(2);
    expect(hex(m.fog)).toBe(PALETTE.obsidian.fog.toLowerCase());
  });
  it('blends between states (mood 0.5 fog is between explore and dusk)', () => {
    const a = new THREE.Color(PALETTE.explore.fog);
    const b = new THREE.Color(PALETTE.dusk.fog);
    const m = sampleMood(0.5);
    expect(m.fog.r).toBeCloseTo((a.r + b.r) / 2, 5);
  });
  it('never returns undefined scalars and clamps out-of-range mood', () => {
    for (const v of [-1, 0, 0.7, 1.3, 2, 9]) {
      const m = sampleMood(v);
      expect(typeof m.ambientIntensity).toBe('number');
      expect(typeof m.fogDensity).toBe('number');
      expect(m.sunPos).toHaveLength(3);
    }
  });
  it('moodRef starts at 0', () => expect(moodRef.current).toBe(0));
});
```

- [ ] **Step 2: Run it, verify FAIL:** `npm run test:unit -- tests/render/atmosphere.test.js` → FAIL (module missing).

- [ ] **Step 3: Create `src/render/atmosphere.js`:**

```js
// Mood/danger atmosphere model (spec §4). A single continuous `mood ∈ [0,2]`
// blends three palette STATES: 0 = explore (day), 1 = dusk (night/combat,
// everyday — spec §4 Tier 1), 2 = obsidian (boss). Colours come from
// tokens.PALETTE; per-state lighting SCALARS live here. `moodRef` is the single
// smoothed "current mood" — written by <Atmosphere>, read by the terrain shader.
import * as THREE from 'three';
import { PALETTE } from '../theme/tokens.js';

// The smoothed current mood (module singleton). <Atmosphere> updates it each
// frame; src/world/Terrain.jsx reads it to drive the terrain `mood`/`timeOfDay`.
export const moodRef = { current: 0 };

const STATES = ['explore', 'dusk', 'obsidian']; // index === integer mood

// Per-state lighting scalars (tunable). Colours are sourced from tokens.PALETTE.
export const MOOD_SCALARS = {
  explore:  { ambientIntensity: 0.60, sunIntensity: 1.50, fogDensity: 0.0070, fillIntensity: 0.00, sunPos: [50, 100, 50] },
  dusk:     { ambientIntensity: 0.40, sunIntensity: 0.60, fogDensity: 0.0120, fillIntensity: 0.45, sunPos: [-30, 40, -50] },
  obsidian: { ambientIntensity: 0.22, sunIntensity: 0.18, fogDensity: 0.0200, fillIntensity: 0.85, sunPos: [-50, 30, -50] },
};

// Per-state colour roles (mapped from palette tokens).
const ROLE = {
  ambient: 'skyMid',   // sky-bounce tint
  sun:     'sun',
  fog:     'fog',      // distance fog colour
};
// Fill light colour per state (explore: cool sky; dusk: hero-accent; obsidian: magic-red).
const FILL_HEX = { explore: PALETTE.explore.skyMid, dusk: PALETTE.dusk.heroAccent, obsidian: '#FF3B5C' };

// Pre-parsed per-state Colors (no per-frame allocation). skyTop/skyMid/skyHorizon
// feed the gradient SkyDome (Task 2); ambient/sun/fog/fill feed the lights + fog.
const COL = {};
for (const s of STATES) {
  COL[s] = {
    ambient: new THREE.Color(PALETTE[s][ROLE.ambient]),
    sun: new THREE.Color(PALETTE[s][ROLE.sun]),
    fog: new THREE.Color(PALETTE[s][ROLE.fog]),
    fill: new THREE.Color(FILL_HEX[s]),
    skyTop: new THREE.Color(PALETTE[s].skyTop),
    skyMid: new THREE.Color(PALETTE[s].skyMid),
    skyHorizon: new THREE.Color(PALETTE[s].skyHorizon),
  };
}

// Reusable result scratch (mutated each call — do not retain references across frames).
const _out = {
  ambient: new THREE.Color(), sun: new THREE.Color(), fog: new THREE.Color(), fill: new THREE.Color(),
  skyTop: new THREE.Color(), skyMid: new THREE.Color(), skyHorizon: new THREE.Color(),
  ambientIntensity: 0, sunIntensity: 0, fogDensity: 0, fillIntensity: 0, sunPos: [0, 0, 0],
};

const lerp = THREE.MathUtils.lerp;

/** Map (isDay, dangerLevel) → target mood in [0,2]. Night = dusk(1); danger overrides up. */
export function moodTarget({ isDay = true, dangerLevel = 0 } = {}) {
  const night = isDay ? 0 : 1;
  return THREE.MathUtils.clamp(Math.max(night, Number(dangerLevel) || 0), 0, 2);
}

/** Resolve the blended atmosphere for a continuous mood. Returns shared scratch. */
export function sampleMood(mood) {
  const m = THREE.MathUtils.clamp(Number(mood) || 0, 0, 2);
  const i = Math.min(Math.floor(m), 1);        // bracket lower index: 0 or 1
  const t = m - i;                              // fraction into [i, i+1]
  const a = STATES[i], b = STATES[i + 1];
  const sa = MOOD_SCALARS[a], sb = MOOD_SCALARS[b];
  _out.ambient.lerpColors(COL[a].ambient, COL[b].ambient, t);
  _out.sun.lerpColors(COL[a].sun, COL[b].sun, t);
  _out.fog.lerpColors(COL[a].fog, COL[b].fog, t);
  _out.fill.lerpColors(COL[a].fill, COL[b].fill, t);
  _out.skyTop.lerpColors(COL[a].skyTop, COL[b].skyTop, t);
  _out.skyMid.lerpColors(COL[a].skyMid, COL[b].skyMid, t);
  _out.skyHorizon.lerpColors(COL[a].skyHorizon, COL[b].skyHorizon, t);
  _out.ambientIntensity = lerp(sa.ambientIntensity, sb.ambientIntensity, t);
  _out.sunIntensity = lerp(sa.sunIntensity, sb.sunIntensity, t);
  _out.fogDensity = lerp(sa.fogDensity, sb.fogDensity, t);
  _out.fillIntensity = lerp(sa.fillIntensity, sb.fillIntensity, t);
  _out.sunPos[0] = lerp(sa.sunPos[0], sb.sunPos[0], t);
  _out.sunPos[1] = lerp(sa.sunPos[1], sb.sunPos[1], t);
  _out.sunPos[2] = lerp(sa.sunPos[2], sb.sunPos[2], t);
  return _out;
}
```

- [ ] **Step 4: Add the store field.** In `src/store/useGameStore.jsx`, right after the `qualityTier`/`setQualityTier` lines added in M1, add:

```js
    // Danger mood input (spec §4): 0 = explore, 1 = dusk, 2 = obsidian. Gameplay
    // triggers (night/combat/boss) wire this in S2; the test bridge drives it now.
    dangerLevel: 0,
    setDangerLevel: (n) => set({ dangerLevel: Number(n) || 0 }),
```

- [ ] **Step 5: Run tests → PASS.** `npm run test:unit -- tests/render/atmosphere.test.js` (all green) then `npm run test:unit` (full suite green). **No rendered-output change** yet → do NOT re-baseline.

- [ ] **Step 6: Commit.**
```bash
cd /Users/kz/Code/Crafty/frontend && git add src/render/atmosphere.js src/store/useGameStore.jsx tests/render/atmosphere.test.js && git commit -m "feat(atmosphere): mood model (moodTarget/sampleMood/moodRef) + store dangerLevel"
```

---

### Task 2: `<Atmosphere>` component — replace inline fog/lights/Sky

**Files:** create `src/render/Atmosphere.jsx`; modify `src/GameScene.jsx`.

- [ ] **Step 1: Create `src/render/Atmosphere.jsx`:**

```jsx
// Mood-driven atmosphere: one component owns the gradient skydome, fog, ambient/sun/
// fill lights, and the smoothed mood. Replaces the inline EnvironmentalFog + the
// isDay-ternary lights + drei <Sky> (removed — see decision #2). Each frame it lerps
// moodRef toward moodTarget(isDay, dangerLevel) and applies the blended palette.
// In capture mode the mood SNAPS to target for deterministic frames.
import { useRef, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore.jsx';
import { isCaptureMode } from '../devtest/captureMode.js';
import { moodRef, moodTarget, sampleMood } from './atmosphere.js';

// A 3-stop gradient skydome (horizon → mid → top) + soft sun glow. Always drawn
// behind everything (depthTest/Write off, renderOrder -1, fog off) and follows the
// camera so the sky reads as infinite. Colours are mood-driven (set each frame).
function makeSkyDomeMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      topColor: { value: new THREE.Color('#2E4A7A') },
      midColor: { value: new THREE.Color('#6FB7C9') },
      horizonColor: { value: new THREE.Color('#FFD9A0') },
      sunColor: { value: new THREE.Color('#FFE9B0') },
      sunDir: { value: new THREE.Vector3(0.3, 0.6, 0.3) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor, midColor, horizonColor, sunColor, sunDir;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 col = mix(horizonColor, midColor, smoothstep(0.0, 0.40, h));
        col = mix(col, topColor, smoothstep(0.35, 0.90, h));
        col = mix(col, horizonColor, smoothstep(0.0, -0.25, h)); // ground fade below horizon
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * pow(s, 8.0) * 0.4;                      // soft sun glow
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

export function Atmosphere({ shadowConfig }) {
  const { scene, camera } = useThree();
  const ambientRef = useRef();
  const sunRef = useRef();
  const fillRef = useRef();
  const domeRef = useRef();
  const domeMat = useMemo(makeSkyDomeMaterial, []);
  const domeGeo = useMemo(() => new THREE.SphereGeometry(100, 32, 16), []);

  useFrame((state, delta) => {
    const st = useGameStore.getState();
    const target = moodTarget({ isDay: st.isDay, dangerLevel: st.dangerLevel });
    if (isCaptureMode()) {
      moodRef.current = target; // snap → deterministic capture frames
    } else {
      moodRef.current = THREE.MathUtils.lerp(moodRef.current, target, Math.min(1, delta * 2.0));
    }
    const m = sampleMood(moodRef.current);

    // Distance fog (terrain only — the dome has fog:false). Background = horizon as a
    // base colour in case the dome ever fails to cover a pixel.
    if (!scene.fog) scene.fog = new THREE.FogExp2(0x000000, 0.01);
    scene.fog.color.copy(m.fog);
    scene.fog.density = m.fogDensity;
    if (!scene.background) scene.background = new THREE.Color();
    scene.background.copy(m.skyHorizon);

    // Gradient skydome — follow the camera + push mood-blended colours/sun.
    if (domeRef.current) {
      domeRef.current.position.copy(camera.position);
      const u = domeMat.uniforms;
      u.topColor.value.copy(m.skyTop);
      u.midColor.value.copy(m.skyMid);
      u.horizonColor.value.copy(m.skyHorizon);
      u.sunColor.value.copy(m.sun);
      u.sunDir.value.set(m.sunPos[0], m.sunPos[1], m.sunPos[2]).normalize();
    }

    if (ambientRef.current) {
      ambientRef.current.color.copy(m.ambient);
      ambientRef.current.intensity = m.ambientIntensity;
    }
    if (sunRef.current) {
      sunRef.current.color.copy(m.sun);
      sunRef.current.intensity = m.sunIntensity;
      sunRef.current.position.set(m.sunPos[0], m.sunPos[1], m.sunPos[2]);
    }
    if (fillRef.current) {
      fillRef.current.color.copy(m.fill);
      fillRef.current.intensity = m.fillIntensity;
    }
  });

  return (
    <>
      <mesh ref={domeRef} geometry={domeGeo} material={domeMat} renderOrder={-1} frustumCulled={false} />
      <ambientLight ref={ambientRef} intensity={0.6} />
      <directionalLight
        ref={sunRef}
        castShadow={!isCaptureMode()}
        position={[50, 100, 50]}
        intensity={1.5}
        shadow-mapSize={shadowConfig.mapSize}
        shadow-camera-left={shadowConfig.camera.left}
        shadow-camera-right={shadowConfig.camera.right}
        shadow-camera-top={shadowConfig.camera.top}
        shadow-camera-bottom={shadowConfig.camera.bottom}
        shadow-camera-near={shadowConfig.camera.near}
        shadow-camera-far={shadowConfig.camera.far}
        shadow-bias={-0.0001}
      />
      <pointLight ref={fillRef} position={[0, 20, 0]} intensity={0} distance={50} />
    </>
  );
}
```

- [ ] **Step 2: Wire into `GameScene.jsx`.** Add the import near the other `src/render` imports:
```js
import { Atmosphere } from './render/Atmosphere';
```
Then REPLACE this current block (the drei `<Sky>` at ~666-672, the `<EnvironmentalFog />` at ~685, the `<ambientLight>` at ~687, the `<directionalLight>` at ~689-701, and the night `<pointLight>` at ~703-705) — i.e. everything from `<Sky ...>` through the closing of the night `pointLight`, but **KEEP** the `PerformanceMonitor`/`AdaptiveDpr` block (~674-683) and `<WeatherSystem />` (~707):

Current (verbatim, to remove the Sky/fog/lights parts of):
```jsx
        <Sky 
          sunPosition={gameState.isDay ? [100, 20, 100] : [-100, -20, -100]} 
          turbidity={0.1}
          rayleigh={2}
          mieCoefficient={0.005}
          mieDirectionalG={0.8}
        />
        
        {!isCaptureMode && (
          <PerformanceMonitor ... />
        )}
        {!isCaptureMode && <AdaptiveDpr pixelated />}

        <EnvironmentalFog />

        <ambientLight intensity={gameState.isDay ? 0.6 : 0.25} />
        
        <directionalLight ... />

        {!gameState.isDay && (
          <pointLight position={[0, 20, 0]} intensity={0.5} distance={50} color="#4169E1" />
        )}
```
becomes (drop `<Sky>`, `<EnvironmentalFog />`, the three inline lights; keep PerformanceMonitor/AdaptiveDpr; add `<Atmosphere>`):
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

        <Atmosphere shadowConfig={shadowConfig} />
```

- [ ] **Step 3: Remove the now-dead `EnvironmentalFog` definition** (the `const EnvironmentalFog = () => { ... };` block at ~553-577 in `GameScene.jsx`) and, if `Sky` is now unused, drop `Sky` from the drei import (`grep -n 'Sky' src/GameScene.jsx` to confirm zero other uses first). Keep `PointerLockControls, Stats, Preload, PerformanceMonitor, AdaptiveDpr`.

- [ ] **Step 4: Verify build + units.** `npm run test:unit` → green. `npm run build` → succeeds. `grep -n '<Sky\|EnvironmentalFog' src/GameScene.jsx` → zero.

- [ ] **Step 5: Re-baseline (HUMAN REVIEW).** `npm run visual:baseline`. Intended change: `explore-day` shifts to the **explore token palette** (warm-heroic), `explore-night` shifts to the **dusk palette** (indigo sky + ember horizon, cooled). Confirm with the controller/Kevin this reads as the intended mood (watch the flat sky — if it reads cheap, that's the deferred gradient-sky tweak, note it). Then `npm run test:visual` → PASS.

- [ ] **Step 6: Commit** (code + baselines together, post-review):
```bash
cd /Users/kz/Code/Crafty/frontend && git add src/render/Atmosphere.jsx src/GameScene.jsx tests/visual/baseline && git commit -m "feat(atmosphere): mood-driven <Atmosphere> replaces inline fog/lights/Sky; tokens-driven explore/dusk"
```

---

### Task 3: Terrain `mood` uniform — cool + desaturate toward dusk/obsidian

**Files:** modify `src/world/Terrain.jsx`.

- [ ] **Step 1: Add the `mood` uniform.** In `compileShader` (where `shader.uniforms.timeOfDay = { value: 1.0 }` is set, ~line 39), add:
```js
    shader.uniforms.mood = { value: 0.0 }; // 0 explore, 1 dusk, 2 obsidian (spec §4)
```
And declare it in the injected fragment-shader header (where `uniform float timeOfDay;` is declared, ~line 83):
```glsl
        uniform float mood;
```

- [ ] **Step 2: Cool + desaturate in the fragment shader.** In the `#include <color_fragment>` replacement, AFTER the sRGB-decoded `diffuseColor = vec4(diffuse * pow(texColor.rgb, vec3(2.2)), texColor.a * customAlpha);` line, append:
```glsl
        // Danger-mood grade (spec §4): terrain cools + desaturates toward dusk,
        // near-monochrome at obsidian. Driven by the shared mood uniform.
        float danger = clamp(mood, 0.0, 2.0);
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum), clamp(danger * 0.42, 0.0, 0.9));
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.55, 0.55, 0.72), danger * 0.5);
```

- [ ] **Step 3: Drive `mood` (and derive `timeOfDay`) from `moodRef`; remove the double-lerp.** Add the import at the top of `Terrain.jsx`:
```js
import { moodRef } from '../render/atmosphere';
```
Then REPLACE the body of the `MinecraftWorld` uniform `useFrame` (the block at ~339-363 that computes `targetTimeOfDay` and lerps `timeOfDay` at `0.05` for both shaders) with:
```js
    useFrame((state) => {
        const time = state.clock.elapsedTime;
        const mood = moodRef.current;                 // already smoothed by <Atmosphere>
        const timeOfDay = 1.0 - THREE.MathUtils.clamp(mood, 0.0, 1.0); // night/obsidian → 0

        const opaqueShader = opaqueMaterial.userData.shader;
        if (opaqueShader) {
            opaqueShader.uniforms.time.value = time;
            opaqueShader.uniforms.timeOfDay.value = timeOfDay;
            opaqueShader.uniforms.mood.value = mood;
        }
        const waterShader = waterMaterial.userData.shader;
        if (waterShader) {
            waterShader.uniforms.time.value = time;
            waterShader.uniforms.timeOfDay.value = timeOfDay;
            waterShader.uniforms.mood.value = mood;
        }
    });
```

- [ ] **Step 4: Verify.** `npm run test:unit` → green. `npm run build` → succeeds.

- [ ] **Step 5: Re-baseline (HUMAN REVIEW).** `npm run visual:baseline`. Intended: `explore-night` terrain now visibly **cools + desaturates** (dusk); `explore-day` unchanged (mood 0 → danger 0 → no-op). Confirm with controller/Kevin (tune the `0.42`/tint constants if too strong). `npm run test:visual` → PASS.

- [ ] **Step 6: Commit.**
```bash
cd /Users/kz/Code/Crafty/frontend && git add src/world/Terrain.jsx tests/visual/baseline && git commit -m "feat(atmosphere): terrain mood uniform cools+desaturates toward dusk/obsidian; single moodRef driver"
```

---

### Task 4: `setDangerLevel` bridge hook + `boss-obsidian` capture state

**Files:** modify `src/App.jsx`, `scripts/visual/capture.mjs`, `tests/visual/diff.test.js`.

- [ ] **Step 1: Add the bridge hook.** In `src/App.jsx`, inside the DEV-gated test-bridge `useEffect`, next to the `setQualityTier` hook (~line 147), add:
```js
    registerTestHook('setDangerLevel', (n) => useGameStore.getState().setDangerLevel(n));
```

- [ ] **Step 2: Add the `boss-obsidian` capture.** In `scripts/visual/capture.mjs`, after the `explore-night` screenshot block (~line 90), add:
```js
    // boss-obsidian: drive the obsidian danger mood (spec §4 Tier 2). In capture
    // mode <Atmosphere> snaps the mood, so the frame settles within the delay.
    await page.evaluate(() => window.__craftyTest.call('setDangerLevel', 2));
    await delay(1500);
    await page.screenshot({ path: resolve(OUT, 'boss-obsidian.png') });
    console.log('captured boss-obsidian');
```
Also update the header comment (lines 3-4) to reflect the realized state list: `menu, explore-day, explore-night (dusk), boss-obsidian` (dusk-danger ≡ explore-night per spec §4).

- [ ] **Step 3: Add the state to the diff suite.** In `tests/visual/diff.test.js`, change:
```js
const STATES = ['menu', 'explore-day', 'explore-night'];
```
to:
```js
const STATES = ['menu', 'explore-day', 'explore-night', 'boss-obsidian'];
```

- [ ] **Step 4: Generate the new baseline (HUMAN REVIEW).** `npm run visual:baseline` (now writes 4 states incl. `boss-obsidian.png`). Surface the **new `boss-obsidian` frame** (ink-stone near-monochrome terrain, magic-red fill, deep vignette feel) for review. Confirm it reads as the intended boss mood. Then `npm run test:visual` → PASS (4/4).

- [ ] **Step 5: Commit.**
```bash
cd /Users/kz/Code/Crafty/frontend && git add src/App.jsx scripts/visual/capture.mjs tests/visual/diff.test.js tests/visual/baseline && git commit -m "feat(atmosphere): setDangerLevel bridge hook + boss-obsidian capture state (4-state suite)"
```

---

### Task 5: Final M2a verification sweep

**Files:** none (verification only).

- [ ] **Step 1:** `npm run test:unit` → green (atmosphere math tests + all prior).
- [ ] **Step 2:** `npm run test:visual` → 4/4 (`menu`, `explore-day`, `explore-night`, `boss-obsidian`).
- [ ] **Step 3:** `npm run build` → succeeds; `grep -c '__craftyTest' build/assets/*.js` → 0 (bridge tree-shaken).
- [ ] **Step 4:** `grep -rn '<Sky\|EnvironmentalFog\|#4169E1\|#e0f7fa\|#0a0a23' src/GameScene.jsx` → zero (the scattered atmosphere hex is gone, now tokens-driven).
- [ ] **Step 5:** Report M2a complete with the realized 4-state suite + a note that each visual step was human-reviewed.

---

## Self-Review (planner — completed)
- **Spec coverage:** §4 danger tiers (explore/dusk/obsidian) via the mood lerp ✓; §9.6 state suite realized as 4 states (dusk≡night per spec §4) ✓; scattered-hex unification onto tokens ✓ (§4 "one source-of-truth"). Deferred-by-design: gradient sky (→S1-D), rim/toon/outlines (→M2b), godRays/weather/outlineWorldEdge tier fields.
- **Placeholder scan:** none — full code for `atmosphere.js`, `Atmosphere.jsx`, the shader, the bridge/capture.
- **Type/name consistency:** `moodRef`/`moodTarget`/`sampleMood`/`MOOD_SCALARS` used consistently across atmosphere.js, Atmosphere.jsx (writer), Terrain.jsx (reader); `dangerLevel`/`setDangerLevel` across store + bridge; `mood` uniform declared in `compileShader` + fragment header + read in `useFrame`. Snap-in-capture keeps the gate deterministic. No per-frame allocation (scratch Colors hoisted).

## Milestone 2b (separate plan — authored after M2a)
Character render language: a shared rim-light `onBeforeCompile` util (fresnel→emissive) + 2-band toon (`MeshToonMaterial` + 2-step `gradientMap`) on mobs (NOT the boss — preserve its emissive phase-telegraphing) + inverted-hull outlines (`drei <Outlines>`, material named `'outline'` to dodge the per-frame hit-flash traversal in `SimplifiedNPCSystem.jsx`) on mobs/boss/chests/pickups. **Needs a character capture-fixture** — a bridge hook to spawn ONE deterministic mob at a fixed pose in capture mode (mobs are otherwise suppressed) + a `character-closeup` capture state — so the character look is visually gated. Then the gradient sky + godRays Atmosphere-signature work (S1-D).
