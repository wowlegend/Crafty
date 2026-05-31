# Crafty S1-A: Visual Foundation & Can-Go-Red Harness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the design-token source-of-truth, a device-aware quality-tier module, a dev test-bridge, and a visual-regression + static-gate test harness that can actually go **red** — the bedrock the render recipe (S1-B) and UI system (S1-C) are verified against.

**Architecture:** Pure-logic modules (tokens, tier selection, bridge registry) are unit-tested with Vitest (new). A Puppeteer + pixelmatch visual-regression suite drives the running app to known states via a dev-only `window.__craftyTest` bridge and diffs screenshots against committed baselines. This is the explicit replacement for `test_swarm.js`, which (per the S0 audit) cannot fail on anything visual.

**Tech Stack:** Vite 6 · React 19 · zustand 5 · Vitest (new, dev) · Puppeteer 24 (existing dev) · pixelmatch + pngjs (new, dev). Plain JS/JSX (no TypeScript — match the existing codebase).

**Source-of-truth spec:** `docs/superpowers/specs/2026-05-30-crafty-visual-direction-design.md` (§4 palette tokens, §8 quality tiers, §9 success criteria).

**Working directory:** `/Users/kz/Code/Crafty/frontend` for all `npm`/test commands. Paths below are relative to `frontend/` unless noted.

**Conventions:** TDD (failing test first). Frequent commits (one per task). No `Generated with`/`Co-Authored-By: Claude` footer in any commit (global rule).

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `vitest.config.js` | Vitest runner config (node env, `tests/**/*.test.js`) | 1 |
| `package.json` | add `test:unit`, `test:visual` scripts + dev deps | 1, 5 |
| `src/theme/tokens.js` | **Single source of truth** for palette (explore/dusk/obsidian) + magic + UI tokens | 2 |
| `tests/theme/tokens.test.js` | Token shape + lerp-safety + hex validity | 2 |
| `src/render/quality.js` | Quality-tier config + pure `selectTier()` device→tier logic | 3 |
| `tests/render/quality.test.js` | Tier-selection logic | 3 |
| `src/devtest/testBridge.js` | Dev-only registry exposing `window.__craftyTest` to drive states headlessly | 4 |
| `tests/devtest/testBridge.test.js` | Registry register/call/no-op | 4 |
| `src/App.jsx` (modify) | Wire bridge in dev: register `start`, `setTimeOfDay` hooks | 4 |
| `scripts/visual/capture.mjs` | Spawn `vite preview`, drive states via bridge, screenshot to `tests/visual/current/` | 5 |
| `tests/visual/diff.test.js` | pixelmatch `current/` vs `baseline/`, fail over threshold | 5 |
| `tests/visual/baseline/*.png` | Committed reference frames | 5 |
| `tests/gates/static-gates.test.js` | no-emoji + hex-inventory reporters; deferred look/UI gates registered (skipped) | 6 |
| `docs/PERF-PROTOCOL.md` (repo root) | Manual real-device FPS protocol + in-app perf marker usage | 6 |

> The 5 visual states are: `menu`, `explore-day`, `explore-night`, `dusk-danger`, `boss-obsidian`. **Only the first three are reachable today** (no `dangerLevel` exists until S1-B). This plan captures + baselines those three and registers the two danger states as pending (added when S1-B introduces `dangerLevel`). This is noted, not silently skipped.

---

## Task 1: Add the Vitest unit-test harness

**Files:**
- Create: `vitest.config.js`
- Modify: `package.json` (scripts + devDependencies)

- [ ] **Step 1: Install Vitest**

Run (in `frontend/`):
```bash
npm install -D vitest@^3
```
Expected: `vitest` added to `devDependencies`, no peer-dep errors (Vite 6 is compatible).

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // visual diff test spawns a browser/server; keep it serial + give it room
    testTimeout: 20000,
  },
});
```

- [ ] **Step 3: Add npm scripts**

In `package.json`, add to `"scripts"`:
```json
"test:unit": "vitest run",
"test:unit:watch": "vitest"
```
(Leave the existing `"test": "node test_swarm.js"` for now; it is superseded by `test:visual` in Task 5 and removed in S1-C cleanup.)

- [ ] **Step 4: Write a sanity test**

Create `tests/sanity.test.js`:
```js
import { describe, it, expect } from 'vitest';

describe('vitest harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it and verify it passes**

Run: `npm run test:unit`
Expected: `1 passed` (1 test file, 1 test).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.js package.json package-lock.json tests/sanity.test.js
git commit -m "test: add vitest unit harness"
```

---

## Task 2: Design-token source of truth

**Files:**
- Create: `src/theme/tokens.js`
- Test: `tests/theme/tokens.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/theme/tokens.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { PALETTE, PALETTE_KEYS, MAGIC, DANGER_STATES } from '../../src/theme/tokens.js';

const HEX = /^#[0-9A-Fa-f]{6}$/;

describe('palette tokens', () => {
  it('every palette state defines every required key as a valid hex', () => {
    for (const state of ['explore', ...DANGER_STATES]) {
      for (const key of PALETTE_KEYS) {
        expect(PALETTE[state]?.[key], `${state}.${key}`).toMatch(HEX);
      }
    }
  });

  it('danger states share EXACTLY the explore keys (lerp-safety: no undefined mid-lerp)', () => {
    const exploreKeys = Object.keys(PALETTE.explore).sort();
    for (const state of DANGER_STATES) {
      expect(Object.keys(PALETTE[state]).sort(), state).toEqual(exploreKeys);
    }
  });

  it('magic palette covers all elements + default', () => {
    for (const el of ['fire', 'ice', 'lightning', 'arcane', 'nature', 'default']) {
      expect(MAGIC[el], el).toMatch(HEX);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit -- tests/theme/tokens.test.js`
Expected: FAIL — `Failed to resolve import ... src/theme/tokens.js`.

- [ ] **Step 3: Implement the token module**

Create `src/theme/tokens.js`:
```js
// SINGLE SOURCE OF TRUTH for Crafty's visual palette (spec §4).
// Three palette STATES share identical keys so the day/night + danger
// system can lerp between them without ever hitting `undefined`.

export const PALETTE_KEYS = [
  'skyTop', 'skyMid', 'skyHorizon', 'sun', 'fog',
  'grass', 'rock', 'rockShadow', 'waterShallow', 'waterDeep',
  'leaf', 'leafHi', 'trunk', 'heroCloth', 'heroAccent', 'mobBody', 'mobShadow',
];

export const DANGER_STATES = ['dusk', 'obsidian'];

export const PALETTE = {
  // Explore (day) — warm-heroic, de-pinked
  explore: {
    skyTop: '#2E4A7A', skyMid: '#6FB7C9', skyHorizon: '#FFD9A0', sun: '#FFE9B0', fog: '#CFE6E4',
    grass: '#7FB85E', rock: '#C2A06A', rockShadow: '#8A6B41', waterShallow: '#8FD3D8', waterDeep: '#3E86A6',
    leaf: '#4F9E63', leafHi: '#74C07E', trunk: '#6E4A30', heroCloth: '#E8C07A', heroAccent: '#2F6FAE',
    mobBody: '#58C6A2', mobShadow: '#2E8E74',
  },
  // Danger T1 — dusk-shift (night/combat, everyday)
  dusk: {
    skyTop: '#161B3A', skyMid: '#2E4A6E', skyHorizon: '#C25A3A', sun: '#FF8A4C', fog: '#3A2E40',
    grass: '#3E6E54', rock: '#7A5E3E', rockShadow: '#4A381F', waterShallow: '#2E6E7C', waterDeep: '#103040',
    leaf: '#2E5A44', leafHi: '#437A5C', trunk: '#3A2A1E', heroCloth: '#C9A86A', heroAccent: '#2F4F7E',
    mobBody: '#3E6E66', mobShadow: '#1C3A38',
  },
  // Danger T2 — full Obsidian (boss only)
  obsidian: {
    skyTop: '#0A0C14', skyMid: '#14182B', skyHorizon: '#2A1622', sun: '#FF6B5E', fog: '#241026',
    grass: '#2A2438', rock: '#262030', rockShadow: '#110C16', waterShallow: '#221034', waterDeep: '#08040E',
    leaf: '#2A1A33', leafHi: '#3E2A48', trunk: '#1A141E', heroCloth: '#2E2A3C', heroAccent: '#0C0A12',
    mobBody: '#2E2238', mobShadow: '#160E1C',
  },
};

// Emissive magic palette — the ONLY intended bloom sources (spec §3, §4)
export const MAGIC = {
  fire: '#FF7A3C', ice: '#6FC8FF', lightning: '#FFE066',
  arcane: '#B36BFF', nature: '#7FE0A0', default: '#46E0FF',
};

// UI design-system tokens (consumed by S1-C). Derived from the game palette.
export const UI = {
  surface: 'rgba(20, 26, 38, 0.62)',   // glass base
  surfaceBorder: 'rgba(255, 255, 255, 0.14)',
  ink: '#ECECEF',
  inkMuted: '#9AA0AD',
  accent: '#C9A86A',     // warm gold
  accentCool: '#46E0FF', // teal (mirrors magic.default)
  danger: '#FF4D6E',
  radius: { sm: 8, md: 14, lg: 20 },
  space: { xs: 4, sm: 8, md: 14, lg: 22, xl: 36 },
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:unit -- tests/theme/tokens.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/theme/tokens.js tests/theme/tokens.test.js
git commit -m "feat(theme): add palette + magic + UI design tokens (single source of truth)"
```

---

## Task 3: Quality-tier selection

**Files:**
- Create: `src/render/quality.js`
- Test: `tests/render/quality.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/render/quality.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { selectTier, TIERS } from '../../src/render/quality.js';

describe('selectTier', () => {
  it('coarse pointer (phone/tablet) starts at low', () => {
    expect(selectTier({ coarsePointer: true, deviceMemory: 8, cores: 8 })).toBe('low');
  });
  it('strong desktop → high', () => {
    expect(selectTier({ coarsePointer: false, deviceMemory: 16, cores: 12 })).toBe('high');
  });
  it('mid desktop/laptop → med', () => {
    expect(selectTier({ coarsePointer: false, deviceMemory: 8, cores: 6 })).toBe('med');
  });
  it('weak/unknown → low', () => {
    expect(selectTier({})).toBe('low');
  });
});

describe('TIERS config', () => {
  it('every tier defines the same switches', () => {
    const keys = Object.keys(TIERS.low).sort();
    for (const t of ['med', 'high']) expect(Object.keys(TIERS[t]).sort(), t).toEqual(keys);
  });
  it('ramps monotonically on render distance', () => {
    expect(TIERS.low.renderDistance).toBeLessThanOrEqual(TIERS.med.renderDistance);
    expect(TIERS.med.renderDistance).toBeLessThanOrEqual(TIERS.high.renderDistance);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit -- tests/render/quality.test.js`
Expected: FAIL — cannot resolve `src/render/quality.js`.

- [ ] **Step 3: Implement**

Create `src/render/quality.js`:
```js
// Device-gated quality tiers (spec §8). S1-B wires these switches into the
// render pipeline; S1-A only defines the config + the pure selection logic.

export const TIERS = {
  low:  { ao: false, godRays: false, bloomMipmap: false, shadowMapSize: 512,  renderDistance: 2, weather: 0.25, dprCap: 1.5, outlineWorldEdge: false },
  med:  { ao: true,  godRays: false, bloomMipmap: true,  shadowMapSize: 1024, renderDistance: 3, weather: 0.6,  dprCap: 2,   outlineWorldEdge: false },
  high: { ao: true,  godRays: true,  bloomMipmap: true,  shadowMapSize: 2048, renderDistance: 4, weather: 1.0,  dprCap: 2,   outlineWorldEdge: true },
};

/**
 * Pure device→tier selection. Touch/coarse-pointer devices START conservative
 * (PerformanceMonitor, wired in S1-B, can later incline them up).
 * @param {{coarsePointer?:boolean, deviceMemory?:number, cores?:number}} signals
 * @returns {'low'|'med'|'high'}
 */
export function selectTier({ coarsePointer = false, deviceMemory = 0, cores = 0 } = {}) {
  if (coarsePointer) return 'low';
  if (deviceMemory >= 12 && cores >= 8) return 'high';
  if (deviceMemory >= 6 && cores >= 4) return 'med';
  return 'low';
}

/** Read device signals from the browser (call in the app; not in unit tests). */
export function readDeviceSignals() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return {};
  return {
    coarsePointer: window.matchMedia?.('(pointer: coarse)')?.matches ?? false,
    deviceMemory: navigator.deviceMemory ?? 0,
    cores: navigator.hardwareConcurrency ?? 0,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:unit -- tests/render/quality.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/render/quality.js tests/render/quality.test.js
git commit -m "feat(render): add device-gated quality-tier config + selection"
```

---

## Task 4: Dev test-bridge (drive states headlessly)

**Files:**
- Create: `src/devtest/testBridge.js`
- Test: `tests/devtest/testBridge.test.js`
- Modify: `src/App.jsx` (wire bridge in dev only)

- [ ] **Step 1: Write the failing test**

Create `tests/devtest/testBridge.test.js`:
```js
import { describe, it, expect, beforeEach } from 'vitest';
import { registerTestHook, callTestHook, _resetBridge } from '../../src/devtest/testBridge.js';

describe('test bridge registry', () => {
  beforeEach(() => _resetBridge());

  it('registers and calls a hook with args', () => {
    let captured = null;
    registerTestHook('setTime', (t) => { captured = t; });
    callTestHook('setTime', 0.5);
    expect(captured).toBe(0.5);
  });

  it('calling an unregistered hook is a safe no-op', () => {
    expect(() => callTestHook('missing', 1, 2)).not.toThrow();
    expect(callTestHook('missing')).toBeUndefined();
  });

  it('returns the hook return value', () => {
    registerTestHook('echo', (x) => x * 2);
    expect(callTestHook('echo', 21)).toBe(42);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:unit -- tests/devtest/testBridge.test.js`
Expected: FAIL — cannot resolve `src/devtest/testBridge.js`.

- [ ] **Step 3: Implement the bridge**

Create `src/devtest/testBridge.js`:
```js
// Dev-only bridge that lets the visual-regression harness drive the running
// app into known states (start game, set time-of-day, later set dangerLevel).
// In production builds this module's installer is a no-op.

let registry = {};

export function registerTestHook(name, fn) { registry[name] = fn; }
export function callTestHook(name, ...args) {
  return Object.prototype.hasOwnProperty.call(registry, name) ? registry[name](...args) : undefined;
}
export function _resetBridge() { registry = {}; } // test-only

/** Expose window.__craftyTest in dev so Puppeteer can call registered hooks. */
export function installTestBridge() {
  if (typeof window === 'undefined') return;
  if (!import.meta.env || !import.meta.env.DEV) return; // dev-only
  window.__craftyTest = {
    call: (name, ...args) => callTestHook(name, ...args),
    list: () => Object.keys(registry),
    ready: () => true,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:unit -- tests/devtest/testBridge.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the bridge into the app (dev only)**

In `src/App.jsx`: add the import near the top with the other imports:
```jsx
import { installTestBridge, registerTestHook } from './devtest/testBridge.js';
import { useGameStore } from './store/useGameStore.jsx';
```
(If `useGameStore` is already imported in `App.jsx`, do not duplicate the import.)

Then, inside the `App` component body, add a dev-only effect (place it with the other `useEffect`s). **Read the existing component first** to find the real state setter that dismisses the menu / starts the game (S0 notes the gate is a local `isPointerLocked`/started `useState` plus the "Start Adventure" button). Bind that setter here:
```jsx
useEffect(() => {
  if (!import.meta.env.DEV) return;
  // Bridge hooks for the visual-regression harness:
  registerTestHook('start', () => {
    // TODO-AT-IMPLEMENTATION: call the SAME setter the "Start Adventure"
    // button calls to leave the menu (e.g. setHasStarted(true)).
    setHasStarted(true);
  });
  registerTestHook('setTimeOfDay', (t) => {
    useGameStore.getState().setTimeOfDay?.(t);
  });
  installTestBridge();
}, []);
```

> Implementation note for the worker: `setHasStarted` is illustrative — use the actual menu-dismiss setter found by reading `App.jsx` + `MenuSystem.jsx`. If time-of-day has no store setter yet, add a minimal `setTimeOfDay(t)` action to `useGameStore` that writes the same state the day/night cycle reads, and register it. Verify in Step 7 that the hook actually leaves the menu and changes the sky.

- [ ] **Step 6: Verify the app still builds**

Run: `npm run build`
Expected: build succeeds (no new errors), bundle emitted to `build/`.

- [ ] **Step 7: Manually verify the bridge in dev**

Run: `npm run dev`, open `http://localhost:3000`, in the browser console:
```js
window.__craftyTest.list()          // → ['start','setTimeOfDay'] (or your hook names)
window.__craftyTest.call('start')   // → menu dismisses, world renders
window.__craftyTest.call('setTimeOfDay', 0.0) // → night
```
Expected: menu dismisses and the sky changes. If not, fix the bound setters before continuing.

- [ ] **Step 8: Commit**

```bash
git add src/devtest/testBridge.js tests/devtest/testBridge.test.js src/App.jsx src/store/useGameStore.jsx
git commit -m "feat(devtest): dev-only test bridge to drive game states for the visual harness"
```

---

## Task 5: Visual-regression suite (the can-go-red core)

> **⚠️ CORRECTIONS (from Task 4 findings):**
> 1. **Drive `vite dev`, NOT `vite preview`.** The test-bridge (`window.__craftyTest`) is `import.meta.env.DEV`-guarded and is tree-shaken out of prod builds, so it does **not** exist under `vite preview`. The capture script must spawn the dev server: `npx vite --port 4178 --strictPort --no-open` (the `--no-open` suppresses the config's `server.open:true` so no browser pops on the host). No `npm run build` needed for capture.
> 2. **Wait for world-built before `start`.** The `start` hook flips pointer-lock state; call it only after the app is ready, and after `start` wait for the spawn chunk to load (poll `window.useGameStore.getState().isSpawnChunkLoaded === true`, with a time fallback) before screenshotting `explore-day`, so the terrain has streamed in.
> 3. The `setTimeOfDay` hook exists (Task 4): `setTimeOfDay(0.5)`→day, `setTimeOfDay(0.0)`→night.
> 4. While here, **delete the leftover `frontend/_s0_capture.mjs`** (superseded by this task's `scripts/visual/capture.mjs`); `git rm` it in this task's commit.

**Files:**
- Modify: `package.json` (deps + `test:visual` script)
- Create: `scripts/visual/capture.mjs`
- Create: `tests/visual/diff.test.js`
- Create: `tests/visual/baseline/` (generated PNGs, committed)

- [ ] **Step 1: Install diff deps**

Run (in `frontend/`):
```bash
npm install -D pixelmatch@^6 pngjs@^7
```

- [ ] **Step 2: Add the capture + visual scripts**

In `package.json` `"scripts"`:
```json
"visual:capture": "node scripts/visual/capture.mjs",
"visual:baseline": "node scripts/visual/capture.mjs --baseline",
"test:visual": "node scripts/visual/capture.mjs && vitest run tests/visual/diff.test.js"
```

- [ ] **Step 3: Write the capture script**

Create `scripts/visual/capture.mjs`:
```js
// Spawns `vite preview`, drives the app to known states via window.__craftyTest,
// and screenshots each to tests/visual/<current|baseline>/<state>.png.
// Reachable states today: menu, explore-day, explore-night. The two danger
// states (dusk-danger, boss-obsidian) are added when S1-B introduces dangerLevel.
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');               // frontend/
const isBaseline = process.argv.includes('--baseline');
const OUT = resolve(ROOT, 'tests/visual', isBaseline ? 'baseline' : 'current');
const PORT = 4178;
const URL = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const STATES = [
  { name: 'menu', drive: async () => {} },
  { name: 'explore-day', drive: async (p) => { await p.evaluate(() => window.__craftyTest.call('start')); await new Promise(r=>setTimeout(r,3500)); await p.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.5)); } },
  { name: 'explore-night', drive: async (p) => { await p.evaluate(() => window.__craftyTest.call('setTimeOfDay', 0.0)); } },
  // FUTURE (S1-B): { name:'dusk-danger', drive: p=>p.evaluate(()=>window.__craftyTest.call('setDanger',1)) },
  // FUTURE (S1-B): { name:'boss-obsidian', drive: p=>p.evaluate(()=>window.__craftyTest.call('setDanger',2)) },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  // build first so preview has something to serve
  await run('npm', ['run', 'build']);
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-angle=swiftshader'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await waitForServer(URL);
    await page.goto(URL, { waitUntil: 'networkidle2' });
    await page.waitForFunction('typeof window.useGameStore === "function" && window.__craftyTest?.ready?.()', { timeout: 20000 });
    await delay(2000);
    for (const s of STATES) {
      await s.drive(page);
      await delay(1200);
      await page.screenshot({ path: resolve(OUT, `${s.name}.png`) });
      console.log(`captured ${s.name}`);
    }
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
}
function run(cmd, args) { return new Promise((res, rej) => { const p = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit' }); p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`${cmd} exited ${c}`)))); }); }
async function waitForServer(url, tries = 40) { for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return; } catch {} await delay(250); } throw new Error('preview server did not start'); }
main().catch((e) => { console.error(e); process.exit(1); });
```

> Note: SwiftShader (`--use-angle=swiftshader`) makes screenshots deterministic across machines (no GPU-driver variance) — correct for regression diffing, even though it's useless for FPS (S0 lesson). FPS is measured separately on real devices (Task 6 protocol).

- [ ] **Step 4: Generate the baselines**

Run: `npm run visual:baseline`
Expected: `tests/visual/baseline/menu.png`, `explore-day.png`, `explore-night.png` created and non-trivial (>20 KB each). **Eyeball each** — confirm `menu` shows the title screen, `explore-day` shows lit terrain, `explore-night` is visibly darker. If a state is blank, fix the bridge (Task 4) before baselining.

- [ ] **Step 5: Write the diff test**

Create `tests/visual/diff.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const STATES = ['menu', 'explore-day', 'explore-night'];
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
```

- [ ] **Step 6: Run the full visual suite to verify it passes against its own baseline**

Run: `npm run test:visual`
Expected: capture writes `tests/visual/current/*`, then 3 diff tests PASS (current == baseline, ~0% diff).

- [ ] **Step 7: Prove it can go RED (the whole point)**

Temporarily edit the clear-color / a sky value so the render changes (e.g. tweak one palette value used on screen), then:
Run: `npm run test:visual`
Expected: at least one state FAILS with a non-trivial `differs X%`. **Revert the temporary edit**, re-run, confirm green again. This demonstrates the harness is not blind.

- [ ] **Step 8: Gitignore `current/`, commit baselines + harness**

Append to `frontend/.gitignore` (create if absent):
```
tests/visual/current/
```
Then:
```bash
git add package.json package-lock.json scripts/visual/capture.mjs tests/visual/diff.test.js tests/visual/baseline frontend/.gitignore
git commit -m "test(visual): puppeteer+pixelmatch visual-regression suite with baselines (replaces blind swarm)"
```

---

## Task 6: Static gates + real-device perf protocol

**Files:**
- Create: `tests/gates/static-gates.test.js`
- Create: `docs/PERF-PROTOCOL.md` (repo root, i.e. `../docs/` from `frontend/` — use `/Users/kz/Code/Crafty/docs/PERF-PROTOCOL.md`)

- [ ] **Step 1: Write the static-gate tests**

Create `tests/gates/static-gates.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (['.js', '.jsx'].includes(extname(p))) acc.push(p);
  }
  return acc;
}
const FILES = walk(SRC);
// Emoji ranges (pictographic). Brand/HUD emoji are an AI-slop tell (S0 visual-quality#4).
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2B00}-\u{2BFF}]/u;
const HEX = /#[0-9A-Fa-f]{6}\b/g;

describe('static gates', () => {
  // REPORTER (always passes; prints a burn-down number). Flips to a hard
  // assertion in S1-C once emoji are replaced by the custom icon set.
  it('reports emoji usage in src (burn-down metric)', () => {
    const offenders = FILES.filter((f) => EMOJI.test(readFileSync(f, 'utf8')));
    console.log(`[gate] files containing emoji: ${offenders.length}`);
    for (const f of offenders) console.log('  -', f.replace(SRC, 'src'));
    expect(offenders.length).toBeGreaterThanOrEqual(0); // reporter only
  });

  // REPORTER for the hardcoded-hex burn-down (target: 0 outside src/theme).
  it('reports hardcoded hex outside src/theme (burn-down metric)', () => {
    let total = 0;
    const perFile = [];
    for (const f of FILES) {
      if (f.includes(join('src', 'theme'))) continue;
      const n = (readFileSync(f, 'utf8').match(HEX) || []).length;
      if (n > 0) { total += n; perFile.push([f.replace(SRC, 'src'), n]); }
    }
    perFile.sort((a, b) => b[1] - a[1]);
    console.log(`[gate] hardcoded hex outside src/theme: ${total} across ${perFile.length} files`);
    for (const [f, n] of perFile.slice(0, 10)) console.log(`  ${n}\t${f}`);
    expect(total).toBeGreaterThanOrEqual(0); // reporter only
  });

  // DEFERRED HARD GATES (enabled by later plans). Documented so they are not
  // silently forgotten; .todo keeps them visible in test output.
  it.todo('S1-C: zero emoji as brand/mascot/HUD markers (hard fail)');
  it.todo('S1-C: single UI design language — no minecraft-bevel + glass + neon coexisting');
  it.todo('S1-B: AO pass present in the EffectComposer (render-probe)');
  it.todo('S1-B: bloom luminanceThreshold >= 0.85');
});
```

- [ ] **Step 2: Run to verify the reporters pass and the todos show**

Run: `npm run test:unit -- tests/gates/static-gates.test.js`
Expected: 2 passed, 4 todo. The console prints the current emoji + hex counts (the burn-down starting point — expect non-zero, per S0).

- [ ] **Step 3: Write the real-device perf protocol**

Create `/Users/kz/Code/Crafty/docs/PERF-PROTOCOL.md`:
```markdown
# Crafty — Real-Device Performance Protocol

The headless/SwiftShader FPS number is meaningless (S0). Frame-rate is acceptance-gated on REAL hardware only.

## Devices (minimum)
- iPad (Safari) — primary touch target
- A mid-range Android phone (Chrome)
- A desktop/laptop (baseline)

## Procedure
1. `npm run build && npm run preview`, open the LAN URL on the device (same Wi-Fi), or deploy a preview.
2. Enter the world; play 60s covering: idle, running, combat (multiple mobs), a weather state.
3. Record at each quality tier (Low/Med/High): median FPS, 1%-low FPS, and whether PerformanceMonitor changed tiers.
4. Record the numbers in this file under a dated run heading.

## Targets (S1 acceptance)
- iPad @ Med: median >= 45 FPS, 1%-low >= 30 FPS, no multi-second hitches.
- Desktop @ High: median >= 60 FPS.

## Runs
<!-- append dated measurement tables here -->
```
(The in-app perf marker / HUD that produces these numbers is built in S1-B with the render pipeline; this protocol defines how it is used.)

- [ ] **Step 4: Commit**

```bash
git add tests/gates/static-gates.test.js
git -C /Users/kz/Code/Crafty add docs/PERF-PROTOCOL.md
git commit -m "test(gates): static reporters (emoji/hex burn-down) + deferred hard-gate todos; add real-device perf protocol"
```

---

## Final: run the whole harness

- [ ] **Step 1: Run all unit tests**

Run: `npm run test:unit`
Expected: all PASS (sanity + tokens + quality + bridge + static-gate reporters) + the deferred todos listed.

- [ ] **Step 2: Run the visual suite**

Run: `npm run test:visual`
Expected: 3 visual states PASS against baseline.

- [ ] **Step 3: Confirm build is clean**

Run: `npm run build`
Expected: succeeds, no new warnings introduced by this plan.

---

## Self-Review (completed during authoring)

**Spec coverage (S1 §9 success criteria):** ✅ Token source-of-truth (criterion 7) → Task 2. ✅ Visual-regression suite across states (criterion 6) → Task 5 (3 of 5 states now; 2 danger states registered for S1-B). ✅ Real-device perf gate (criterion 8) → Task 6 protocol + S1-B marker. ✅ no-emoji + hardcoded-hex (criteria 4,5,7) → Task 6 reporters now, hard gates in S1-C. ⏸ AO-live / colorSpace / bloom / one-UI-language hard gates (criteria 1,2,3,4) → intentionally deferred to S1-B/C as `it.todo` (cannot pass before the render/UI work exists). This plan builds the **machinery**; later plans turn the deferred gates green. Quality tiers (spec §8) → Task 3 (logic) + S1-B (wiring).

**Placeholder scan:** One intentional `TODO-AT-IMPLEMENTATION` in Task 4 Step 5 — the exact menu-dismiss setter must be read from `App.jsx` at implementation time (can't be known without reading the live component); the surrounding steps (6,7) verify it works. All other steps contain complete, runnable code.

**Type/name consistency:** `registerTestHook`/`callTestHook`/`_resetBridge`/`installTestBridge`, `selectTier`/`TIERS`, `PALETTE`/`PALETTE_KEYS`/`DANGER_STATES`/`MAGIC`/`UI` used consistently across tasks and tests. Visual states named identically in capture script + diff test (`menu`, `explore-day`, `explore-night`).
