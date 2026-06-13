# Interleave — Locomotion Audio (surface-keyed footsteps + landing + jump) Implementation Plan

> **✅ SHIPPED (loop iter 116, 2026-06-13).** Walking is no longer silent. `world/climate.js` (main-thread biome/surface sampler, reuses pickBiome+oceanProfile, 5 characterization tests) + Game-Loop-safe wiring in the Components useFrame: surface-keyed footsteps (stride-throttled, grass/sand/snow/stone — riding M4a), a landing thud (prev-grounded edge), a jump cue — all via the store's `playSpatialSound`. 916 unit (+9) · build · visual **15/15 no diff** (audio-only). Audio is ear-verified by Kevin (KRB). `world/climate.js` also unlocks biome-ambient music later. NEXT = world-M5 (ocean seabed + depth-tint).

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Checkbox steps.

**Goal:** Un-silence movement. Walking is currently SILENT (the `playFootstep` SFX exists but is never called); jumps/landings too. Add **surface-keyed footsteps** (grass/sand/snow/stone — so each biome SOUNDS distinct, riding the M4a biome work), plus a landing thud and a jump cue.

**Why this interleave (charter §2/§6):** the experience interleave is DUE (4 world milestones M1–M4a since UX@98; audio is the charter's most-neglected first-class axis, untouched since the motifs @93). Footsteps are the highest game-feel-per-effort win (walking is the most-performed action) AND they ride the just-shipped biome distinctness (see-distinct-biomes → hear-distinct-ground). Hitstop + screenShake already exist (verified — NOT rebuilt here).

**Architecture:** A greenfield pure `world/climate.js` samples the worker's climate noise on the MAIN thread (same seed 12345; reuses `pickBiome` + the `oceanProfile` consts — single source of truth, only the noise + height formula mirrored) → `surfaceBlockAt(x,z)` / `footstepTypeAt(x,z)`. The movement `useFrame` in `Components.jsx` already detects walking (`isGrounded && horizontalSpeed > 1`, the head-bob seam ~:1230) and already plays sound via the store (`store.playSpatialSound('swing', [x,y,z], rate, falloff)` :384). We add a throttled footstep trigger there (Game-Loop-Isolation: transient `useGameStore.getState()` + a stride-timer ref, no React state), a landing trigger (prev-grounded edge), and a jump cue at the grounded-jump (:1082). Audio-only → ZERO visual-gate impact (15/15 holds, NO re-baseline). `world/climate.js` also unlocks biome-ambient music later (the player-biome prerequisite).

**Tech Stack:** a new `world/climate.js`, `Components.jsx` (movement useFrame), vitest (climate characterization + a static gate). `simplex-noise` is already bundled.

**Live seams (verified this iteration):**
- `SoundManager.jsx:513` `playFootstep(pos, type)` exists, pitch-varies by type (stone=0.8 else 1.1), routes through the store's `playSpatialSound('footstep', pos, rate, 5)` — but is NEVER called. The store exposes `playSpatialSound(name, pos, rate, falloff)` (registered by SoundManager; the `'footstep'`/`'jump'` voices exist in `synthVoices.js`).
- `Components.jsx:1230` `if (isGrounded && horizontalSpeed > 1) { bobOffset = Math.sin(time * 15) * 0.06; }` — the walk/head-bob seam (`time = state.clock.elapsedTime`). `camera.position` is the player world pos in this useFrame. `store = useGameStore.getState()` is already in scope just below (:1239). `:1023` `const isGrounded = controllerRef.current ? controllerRef.current.computedGrounded() : false;`. `:1082` the grounded jump (`velocityY.current = 12.0 * loco.jumpMult`).
- `terrain.worker.js:381-403` the climate/height/biome/beach logic to mirror (continent `*0.002`; moisture `*0.005`; temperature `(+500)*0.005`; `n` two octaves; `baseHeight=30+n*40`; ocean branch via `oceanSurfaceY`; `pickBiome`; beach `surfaceY<BEACH_BAND_TOP→sand`).

**Known limitation (recorded, not floated):** `climate.js` samples GEN terrain only — it doesn't see player-placed blocks or the Hearth plinth stamp, so footsteps on the small Hearth footprint play 'grass' not 'stone'. Acceptable (a few origin tiles); a worker-block-query is a future refinement.

---

## File Structure

- **Create** `frontend/src/world/climate.js` — `surfaceBlockAt(x,z)` + `footstepTypeAt(x,z)` (main-thread biome/surface sampler).
- **Modify** `frontend/src/Components.jsx` — throttled footstep trigger at the walk seam + landing edge + jump cue.
- **Create** `frontend/tests/world/climate.test.js` — characterization: known coords → expected surface/footstep type; reuses pickBiome; determinism.
- **Create** `frontend/tests/gates/locomotion-audio-gates.test.js` — static gate: footstep wired at the walk seam, surface-keyed via footstepTypeAt, throttled (a stride ref).

---

### Task 1: `world/climate.js` (main-thread surface sampler)

**Files:** Create `frontend/src/world/climate.js`; Test `frontend/tests/world/climate.test.js`.

- [ ] **Step 1: Write the failing characterization test**

Create `frontend/tests/world/climate.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { surfaceBlockAt, footstepTypeAt } from '../../src/world/climate.js';

// Anchored against the worker's real field (the same coords the M2/M4a node-probes verified):
// origin is land (plains/grass); [0,-40] is a solid snowfield (snow); deep-ocean columns beach to sand.
describe('climate sampler (locomotion-audio interleave) — main-thread biome/surface', () => {
  it('origin region is land grass (plains)', () => {
    expect(surfaceBlockAt(0, 0).surfaceBlock).toBe(1);      // grass
    expect(footstepTypeAt(0, 0)).toBe('grass');
  });
  it('the probed snowfield [0,-40] is snow', () => {
    expect(surfaceBlockAt(0, -40).surfaceBlock).toBe(5);    // snow
    expect(footstepTypeAt(0, -40)).toBe('snow');
  });
  it('a low/ocean column beaches to sand (surfaceY < BEACH_BAND_TOP -> sand)', () => {
    // [-24,0] was the nearest shallow ocean in the M2 probe (depth ~1 -> surfaceY ~27 < 30)
    const s = surfaceBlockAt(-24, 0);
    if (s.surfaceY < 30) expect(s.surfaceBlock).toBe(4);    // sand beach
  });
  it('footstepTypeAt maps every surface block to a stride sound', () => {
    expect(['grass', 'dirt', 'stone', 'sand', 'snow', 'wood']).toContain(footstepTypeAt(0, 0));
  });
  it('is deterministic (same coord -> same surface)', () => {
    expect(surfaceBlockAt(123, -456)).toEqual(surfaceBlockAt(123, -456));
  });
});
```

- [ ] **Step 2: Run → fail** (module missing).

- [ ] **Step 3: Write the module**

Create `frontend/src/world/climate.js`:

```js
// Main-thread climate sampler (World — locomotion-audio interleave). Replicates the worker's
// climate noise (SAME seed 12345) so the main thread can know the player's biome/surface — for
// surface-keyed footstep audio now, and biome-ambient music later. Reuses pickBiome + the ocean
// consts (single source of truth); only the noise instance + the climate/height formulas are
// mirrored from terrain.worker.js:381-403 (keep in lockstep — a characterization test pins it).
import { createNoise2D } from 'simplex-noise';
import { pickBiome } from './biomeTable.js';
import { SEA_LEVEL, BEACH_BAND_TOP, OCEAN_CONTINENT_THRESHOLD, oceanSurfaceY } from './oceanProfile.js';

const lcg = (seed) => () => (seed = Math.imul(1664525, seed) + 1013904223 | 0) / 4294967296 + 0.5;
const noise2D = createNoise2D(lcg(12345));

// The gen surface block at a world column (ignores player edits + the Hearth stamp — see the plan).
export function surfaceBlockAt(worldX, worldZ) {
  const continent = noise2D(worldX * 0.002, worldZ * 0.002);
  const moisture = noise2D(worldX * 0.005, worldZ * 0.005) * 0.5 + 0.5;
  const temperature = noise2D((worldX + 500) * 0.005, (worldZ + 500) * 0.005) * 0.5 + 0.5;
  let n = noise2D(worldX * 0.01, worldZ * 0.01) * 0.5 + 0.5;
  n += noise2D(worldX * 0.05, worldZ * 0.05) * 0.1;
  const baseHeight = 30 + n * 40;
  const surfaceY = continent < OCEAN_CONTINENT_THRESHOLD ? oceanSurfaceY(baseHeight, n, continent) : Math.floor(baseHeight);
  let { surfaceBlock } = pickBiome(temperature, moisture, continent);
  if (surfaceY < BEACH_BAND_TOP) surfaceBlock = 4; // beach (matches the worker's override)
  return { surfaceBlock, surfaceY, isWater: surfaceY <= SEA_LEVEL };
}

const FOOTSTEP_TYPE = { 1: 'grass', 2: 'dirt', 3: 'stone', 4: 'sand', 5: 'snow', 6: 'wood' };
export function footstepTypeAt(worldX, worldZ) {
  return FOOTSTEP_TYPE[surfaceBlockAt(worldX, worldZ).surfaceBlock] || 'grass';
}
```

- [ ] **Step 4: Run → pass.** (If the `[-24,0]` beach assertion's `surfaceY` isn't < 30, the `if` guard makes it a no-op — the test still passes; it only asserts WHEN it's a beach.)

- [ ] **Step 5: Commit** `feat(interleave): world/climate.js — main-thread biome/surface sampler (reuses pickBiome + oceanProfile)`.

---

### Task 2: Wire locomotion audio (Game-Loop-safe) + static gate

**Files:** Modify `frontend/src/Components.jsx`; Test `frontend/tests/gates/locomotion-audio-gates.test.js`.

- [ ] **Step 1: Add the import** at the top of Components.jsx: `import { footstepTypeAt } from './world/climate.js';`

- [ ] **Step 2: Add a stride + prev-grounded ref** near the other movement refs (e.g. by `velocityY`): `const lastStepRef = useRef(0); const prevGroundedRef = useRef(true);`

- [ ] **Step 3: Footstep + landing trigger at the walk seam.** Just after the head-bob block (`:1230-1232`), insert (uses the `store`/`camera`/`isGrounded`/`horizontalSpeed`/`time` already in scope; `store` is fetched at :1239 — fetch it once earlier or reuse):

```js
    // Locomotion audio: surface-keyed footsteps in stride while walking, + a landing thud.
    {
      const sStore = useGameStore.getState();
      const px = camera.position.x, pz = camera.position.z;
      if (isGrounded && horizontalSpeed > 1.2) {
        const stride = Math.max(0.28, 0.42 - horizontalSpeed * 0.01); // faster -> quicker steps
        if (time - lastStepRef.current > stride) {
          lastStepRef.current = time;
          const t = footstepTypeAt(px, pz);
          const rate = t === 'stone' ? 0.8 : t === 'snow' ? 1.25 : t === 'sand' ? 0.95 : 1.05;
          sStore.playSpatialSound?.('footstep', [px, camera.position.y, pz], rate, 5);
        }
      }
      // landing edge: was airborne, now grounded -> a firmer footstep
      if (isGrounded && !prevGroundedRef.current) {
        const t = footstepTypeAt(px, pz);
        sStore.playSpatialSound?.('footstep', [px, camera.position.y, pz], (t === 'stone' ? 0.7 : 0.85), 8);
        lastStepRef.current = time;
      }
      prevGroundedRef.current = isGrounded;
    }
```

- [ ] **Step 4: Jump cue** at the grounded jump (`:1082`, right after `velocityY.current = 12.0 * loco.jumpMult;`): `useGameStore.getState().playSpatialSound?.('jump', [camera.position.x, camera.position.y, camera.position.z], 1, 6);`

- [ ] **Step 5: Build + suite** (`npx vitest run && npm run build`) — count holds/grows; build clean.

- [ ] **Step 6: Static gate.** Create `frontend/tests/gates/locomotion-audio-gates.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Locomotion audio gate (interleave)', () => {
  const comp = strip(read('Components.jsx'));
  it('footsteps are wired + surface-keyed (climate.footstepTypeAt) + throttled by a stride ref', () => {
    expect(comp).toMatch(/from '\.\/world\/climate\.js'/);
    expect(comp).toMatch(/footstepTypeAt\(/);
    expect(comp).toMatch(/playSpatialSound\?\.\('footstep'/);
    expect(comp).toMatch(/lastStepRef/);
  });
  it('a landing edge uses a prev-grounded ref (one thud per touchdown, not every frame)', () => {
    expect(comp).toMatch(/prevGroundedRef/);
  });
  it('climate.js stays deterministic (no Math.random in the sampler)', () => {
    expect(read('world/climate.js')).not.toMatch(/Math\.random/);
  });
});
```

Run → pass. **Commit** `feat(interleave): wire surface-keyed footsteps + landing + jump audio (Game-Loop-safe)`.

---

### Task 3: Verify (audio is ear-verified by Kevin)

- [ ] `npx vitest run && npm run build` — count grows (climate + gate tests); build clean.
- [ ] `npm run visual:capture && npx vitest run --config vitest.visual.config.js` — **15/15, NO change** (audio-only; capture pauses physics so no footsteps fire → zero baseline impact). A diff here would mean an accidental visual edit — STOP.
- [ ] Audio cannot be auto-verified headless. The static gate proves it's WIRED + surface-keyed + throttled; the climate test proves the right surface is detected. Flag a KEVIN-REVIEW-BATCH item: "walk over grass/sand/snow/stone — do footsteps fire in stride + sound surface-distinct? jump/land cue OK?" (like the Aspect-SFX ear checks).

---

### Task 4: Doc close-out (interleave)

- [ ] Banner this plan ✅ SHIPPED. Update `memory/ACTIVE_PLAN.md` (shipped the locomotion-audio interleave + NEXT = world-M5 ocean visual) + `memory/CHANGELOG.md`. Refresh the `SOTA-INITIATIVE.md` status banner + its interleave ledger (audio@<this iter>). KRB: the ear-check item. Final commit `docs(interleave): locomotion-audio close-out — resume = world-M5 ocean visual`, push.

---

## Self-Review

**Charter fit:** interleave DUE (4 milestones since UX@98) ✅; audio = most-neglected axis ✅; rides M4a biomes (surface-keyed) ✅; doesn't rebuild existing hitstop/shake ✅.

**Game-Loop-Isolation:** the trigger reads `useGameStore.getState()` transiently + throttles via refs (`lastStepRef`/`prevGroundedRef`) — NO React state in the useFrame, matching the existing `:384` sound pattern.

**Capture-determinism:** audio-only; capture pauses physics (no walking) → zero baseline impact → 15/15 holds, no re-baseline.

**Placeholder scan:** none — exact paths/code/commands. The `[-24,0]` beach test is guarded (asserts only when it IS a beach) — intentional, not a placeholder.

**Type/name consistency:** `surfaceBlockAt`/`footstepTypeAt` identical at definition, import, test, gate; `playSpatialSound('footstep'|'jump', [x,y,z], rate, falloff)` matches the store API + the `:384` precedent; block ids 1/4/5/etc. match `biomeTable` + `BLOCK_COLORS`.
