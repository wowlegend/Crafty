> **✅ SHIPPED (loop iter 122, 2026-06-13).** `audio/biomeAmbience.js` (pure biome→{cutoff,gain} map, 4 unit tests) + a looping wind-bed voice in SoundManager (started with the synthPad, ramped per the player biome in the existing 8s step-interval via `playerPosition`→`climate.surfaceBlockAt`→`biomeAmbience`, faded+stopped+disconnected in `stopSynthPad`). 933 unit (+7) · build · visual **17/17 no change** (audio-only). Ear-verified by Kevin (KRB). NEXT = PICK (deferred new-blocks batch M4b+M5b · M4c topography · S3-M5 de-monolith).

# Interleave — Biome-Ambient Audio Bed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Checkbox steps.

**Goal:** Let each biome SOUND distinct — a subtle looping ambient "wind bed" under the music whose character shifts with the player's biome (snow = bright airy howl · desert = dry mid hiss · plains = soft low rustle · underwater = muffled). The thematic capstone of the world pass: you SEE distinct biomes (M3/M4a), HEAR distinct footsteps (locomotion audio), and now FEEL distinct ambience.

**Why this interleave (charter §2/§6):** the interleave cadence is due (2 world milestones since locomotion-audio@116), audio is the charter's most-neglected first-class axis, and `world/climate.js` (built for footsteps) ALREADY exposes the player biome — so this rides everything cheaply. It's a contained ADD (one ambient voice + a biome→params map + a periodic update), not a new subsystem.

**Architecture:** A pure `audio/biomeAmbience.js` maps `(surfaceBlock, isWater)` → `{cutoff, gain}` (the wind character per biome) — unit-testable. `SoundManager.jsx` gains a looping noise "wind bed" (a `makeNoise` BufferSource → bandpass filter → gain, started with the synthPad), and the EXISTING pad `setInterval` loop (:160) additionally reads the player's biome (`useGameStore.getState().playerPosition` — already written every 200ms by Components:124 — → `climate.surfaceBlockAt(x,z)` → `biomeAmbience(...)`) and ramps the bed's filter/gain to the biome's target. Audio-only → ZERO visual-gate impact (17/17 holds). Ear-verified by Kevin (headless can't hear).

**Tech Stack:** a new `audio/biomeAmbience.js`, `SoundManager.jsx` (the wind bed + the interval update), `world/climate.js` (reused for biome), `store` `playerPosition` (reused), vitest (the biome→params unit test + a static gate). Web Audio (`createBufferSource`/`createBiquadFilter`/`createGain`).

**Live seams (verified this iteration):**
- `SoundManager.jsx`: `synthPadRef` (the pad — `:41`); `startSynthPad` (`:95`) builds nodes (masterGain/filter/lfo, `:108-126`); the pad `setInterval` loop at `:160` re-reads `freshState.isDay` each tick (the hook for the per-biome bed update); `stopSynthPad` (`:52`) tears down. `makeNoise(ctx, duration)` (`synthVoices.js:46`) → a white-noise AudioBuffer (loop it for the bed). `VOICES` imported `:2`.
- `store` `playerPosition` (`useGameStore.jsx:114`, `setPlayerPosition` `:115`) — written by `Components.jsx:124` every 200ms (rounded camera x/y/z).
- `world/climate.js` `surfaceBlockAt(x,z)` → `{surfaceBlock, surfaceY, isWater}`.

---

## File Structure

- **Create** `frontend/src/audio/biomeAmbience.js` — `biomeAmbience(surfaceBlock, isWater)` → `{cutoff, gain, label}` (the wind character per biome).
- **Modify** `frontend/src/SoundManager.jsx` — a looping wind-bed voice (start in `startSynthPad`, teardown in `stopSynthPad`) + a per-biome ramp inside the pad interval.
- **Create** `frontend/tests/audio/biomeAmbience.test.js` — each biome → distinct, sane params; underwater muffles; deterministic.
- **Create** `frontend/tests/gates/biome-ambience-gates.test.js` — static gate: the bed exists, is biome-keyed (climate + biomeAmbience + playerPosition), torn down in stop, deterministic.

---

### Task 1: `audio/biomeAmbience.js` (the biome → wind params map)

**Files:** Create `frontend/src/audio/biomeAmbience.js`; Test `frontend/tests/audio/biomeAmbience.test.js`.

- [ ] **Step 1: Write the failing unit test**

Create `frontend/tests/audio/biomeAmbience.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { biomeAmbience } from '../../src/audio/biomeAmbience.js';

describe('biomeAmbience (interleave) — per-biome wind character', () => {
  it('every land biome returns sane filter cutoff (120..8000 Hz) + gain (0..0.12)', () => {
    for (const b of [1, 4, 5, 3, 2]) { // grass, sand, snow, stone, dirt
      const a = biomeAmbience(b, false);
      expect(a.cutoff).toBeGreaterThanOrEqual(120);
      expect(a.cutoff).toBeLessThanOrEqual(8000);
      expect(a.gain).toBeGreaterThanOrEqual(0);
      expect(a.gain).toBeLessThanOrEqual(0.12);
    }
  });
  it('snow is brighter/airier than desert, which is brighter than plains (distinct cutoffs)', () => {
    expect(biomeAmbience(5, false).cutoff).toBeGreaterThan(biomeAmbience(4, false).cutoff); // snow > sand
    expect(biomeAmbience(4, false).cutoff).toBeGreaterThan(biomeAmbience(1, false).cutoff); // sand > grass
  });
  it('underwater muffles — a much lower cutoff than any land biome', () => {
    const water = biomeAmbience(9, true);
    expect(water.cutoff).toBeLessThan(biomeAmbience(1, false).cutoff);
    expect(water.cutoff).toBeLessThanOrEqual(500);
  });
  it('is deterministic (pure map)', () => {
    expect(biomeAmbience(5, false)).toEqual(biomeAmbience(5, false));
  });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Write the module**

Create `frontend/src/audio/biomeAmbience.js`:

```js
// Per-biome ambient wind character (interleave). Pure map: the player's surface block (from
// world/climate.surfaceBlockAt) -> a looping wind bed's filter cutoff + gain. SoundManager ramps a
// noise voice toward these so each biome SOUNDS distinct (rides the M3/M4a biome visuals). Underwater
// (isWater) muffles everything. Tuned conservatively — the bed is a subtle UNDER-layer, not music.
const LAND = {
  5: { cutoff: 5200, gain: 0.075, label: 'snow' },   // bright, airy howl
  4: { cutoff: 2600, gain: 0.060, label: 'desert' },  // dry mid hiss
  3: { cutoff: 1400, gain: 0.045, label: 'stone' },   // hollow draft
  1: { cutoff: 900,  gain: 0.050, label: 'plains' },  // soft low rustle
  2: { cutoff: 900,  gain: 0.050, label: 'plains' },  // dirt -> same as plains
};
const DEFAULT = LAND[1];
const UNDERWATER = { cutoff: 380, gain: 0.085, label: 'underwater' }; // muffled, enveloping

export function biomeAmbience(surfaceBlock, isWater) {
  if (isWater) return { ...UNDERWATER };
  return { ...(LAND[surfaceBlock] || DEFAULT) };
}
```

- [ ] **Step 4: Run → pass.** **Step 5: Commit** `feat(interleave): audio/biomeAmbience.js — per-biome wind character map`.

---

### Task 2: The wind bed in SoundManager + static gate

**Files:** Modify `frontend/src/SoundManager.jsx`; Test `frontend/tests/gates/biome-ambience-gates.test.js`.

- [ ] **Step 1: Imports** (top of SoundManager.jsx): `import { makeNoise } from './audio/synthVoices';` (if not already importing it — `VOICES` is imported; add `makeNoise`), `import { surfaceBlockAt } from './world/climate.js';`, `import { biomeAmbience } from './audio/biomeAmbience.js';`. Add a ref near `synthPadRef`: `const windBedRef = useRef({ source: null, filter: null, gain: null, active: false });`

- [ ] **Step 2: Start the wind bed in `startSynthPad`** (after the pad nodes are built, before/with `pad.active = true`):

```js
      // Biome-ambient wind bed: a looping noise voice; its filter/gain track the player's biome
      // (updated in the pad interval below). A subtle under-layer beneath the music.
      const wb = windBedRef.current;
      const noiseBuf = makeNoise(audioContext.current, 2.0);
      wb.source = audioContext.current.createBufferSource();
      wb.source.buffer = noiseBuf; wb.source.loop = true;
      wb.filter = audioContext.current.createBiquadFilter();
      wb.filter.type = 'bandpass'; wb.filter.frequency.setValueAtTime(900, now); wb.filter.Q.setValueAtTime(0.7, now);
      wb.gain = audioContext.current.createGain(); wb.gain.gain.setValueAtTime(0, now);
      wb.source.connect(wb.filter); wb.filter.connect(wb.gain); wb.gain.connect(audioContext.current.destination);
      wb.source.start(now); wb.active = true;
```

- [ ] **Step 3: Per-biome ramp** — inside the existing pad `setInterval` callback (`:160`, where `freshState` is read), add:

```js
        // Biome-ambient: ramp the wind bed toward the player's current-biome character.
        const wb2 = windBedRef.current;
        if (wb2.active && wb2.filter) {
          const pp = useGameStore.getState().playerPosition || { x: 0, z: 0 };
          const { surfaceBlock, isWater } = surfaceBlockAt(pp.x, pp.z);
          const amb = biomeAmbience(surfaceBlock, isWater);
          const t = audioContext.current.currentTime;
          wb2.filter.frequency.linearRampToValueAtTime(amb.cutoff, t + 1.5);
          wb2.gain.gain.linearRampToValueAtTime(amb.gain * volume, t + 1.5);
        }
```

- [ ] **Step 4: Teardown in `stopSynthPad`** (with the other node teardown): stop + disconnect `windBedRef.current.source`/`filter`/`gain`, set `active = false`, null them.

- [ ] **Step 5: Build + suite** (`npx vitest run && npm run build`) — count grows; build clean.

- [ ] **Step 6: Static gate.** Create `frontend/tests/gates/biome-ambience-gates.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Biome-ambience gate (interleave)', () => {
  const sm = strip(read('SoundManager.jsx'));
  it('a looping wind bed exists, biome-keyed via climate + biomeAmbience + playerPosition', () => {
    expect(sm).toMatch(/from '\.\/audio\/biomeAmbience\.js'/);
    expect(sm).toMatch(/surfaceBlockAt\(/);
    expect(sm).toMatch(/biomeAmbience\(/);
    expect(sm).toMatch(/playerPosition/);
    expect(sm).toMatch(/windBedRef/);
    expect(sm).toMatch(/loop = true/);
  });
  it('the wind bed is torn down when the pad stops (no leaked looping source)', () => {
    const stop = sm.slice(sm.indexOf('stopSynthPad'), sm.indexOf('stopSynthPad') + 1200);
    expect(stop).toMatch(/windBedRef|wb\./);
  });
  it('biomeAmbience.js is a pure deterministic map (no Math.random)', () => {
    expect(read('audio/biomeAmbience.js')).not.toMatch(/Math\.random/);
  });
});
```

Run → pass. **Commit** `feat(interleave): biome-ambient wind bed in SoundManager (climate-keyed, ramped)`.

---

### Task 3: Verify (audio is ear-verified by Kevin)

- [ ] `npx vitest run && npm run build` — count grows; build clean.
- [ ] `npm run visual:capture && npx vitest run --config vitest.visual.config.js` — **17/17 unchanged** (audio-only; a diff = an accidental visual edit → STOP).
- [ ] Audio can't be auto-verified headless. The unit test proves the biome→params mapping; the gate proves the bed is wired + biome-keyed + torn down. KEVIN-REVIEW-BATCH item: "walk grass→sand→snow + dive — does the ambient wind shift character per biome (snow airy / desert dry / underwater muffled)? Is the under-layer subtle, not intrusive?"

---

### Task 4: Doc close-out

- [ ] Banner this plan ✅ SHIPPED. Update `memory/ACTIVE_PLAN.md` (shipped biome-ambience + NEXT = PICK — the deferred new-blocks batch / M4c topography / S3-M5 de-monolith) + `memory/CHANGELOG.md`. Refresh the SOTA banner + audio ledger (ambience@<iter>). KRB: the ear-check. Final commit `docs(interleave): biome-ambience close-out — resume = PICK`, push.

---

## Self-Review

**Charter fit:** interleave due ✅; audio = most-neglected axis ✅; rides the world (climate-keyed) ✅; contained (one voice + a map + an interval-ramp, reuses climate.js + the pad loop + store playerPosition) ✅.

**Game-Loop-Isolation:** the per-biome update runs in the EXISTING pad `setInterval` (already a transient `getState()` loop), not a React render — no new hot-loop coupling. The bed is one looping BufferSource (zero per-frame cost).

**Capture-determinism:** audio-only → zero visual impact (17/17 holds). The bed loops independently of `time`-frozen visuals.

**Leak safety:** the looping source is explicitly stopped + disconnected in `stopSynthPad` (gated) — no orphaned oscillator/source.

**Placeholder scan:** none — exact paths/code/commands.

**Type/name consistency:** `biomeAmbience(surfaceBlock, isWater)` → `{cutoff,gain,label}` identical at def/import/test; `surfaceBlockAt` returns `{surfaceBlock,isWater}` as used; `windBedRef` consistent across start/update/stop.
