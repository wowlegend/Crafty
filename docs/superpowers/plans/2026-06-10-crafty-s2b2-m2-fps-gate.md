# VOIDHAND M2 — FPS Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Loop note (2026-06-10):** authored + executed by the autonomous build loop (inline execution, one task ≈ one iteration). Design-of-record: `docs/superpowers/specs/2026-06-09-crafty-s2b2-voidhand-design.md` §12 M2 row, as **amended by `memory/STATE-REVIEW-2026-06-10.md` §4** (the adversarially-verified input brief — it supersedes the spec's M2 row where they conflict).

**Goal:** Measure — with evidence, on a fixed render configuration — what VOIDHAND costs per frame under the worst case (night siege), pin it against a numeric budget, and engineer out the one known frame-hitch source (grab-edge light-count program re-link) BEFORE building the M3 verbs.

**Architecture:** A dev-only **perf-probe mode** (`?perf=<A..E>` URL param, tree-shaken from prod) that pins DPR + tier, disables `PerformanceMonitor`/`AdaptiveDpr`, drives the live game (physics + spawns LIVE — this is NOT capture mode) through five review-prescribed scenarios, samples rAF frame deltas for 60s, and reports stats on-screen + on `window.__craftyPerfResult`. Pure stat/scenario modules are TDD'd; a puppeteer runner automates the desktop pass; the same URL is the one-tap iPad protocol (no Safari-inspector dependency — the WILDHEART protocol's unproven logistics, fixed).

**Tech Stack:** React 19 + R3F, @react-three/rapier (dynamic-body hurl stand-in), zustand store writes via the existing `testBridge` pattern, puppeteer (headed — real GPU), vitest.

**The five scenarios (STATE-REVIEW §4):** (A) explore-idle day baseline · (B) **night-siege control, held=false** (the honest baseline — dominated by pre-existing NPC cost) · (C) siege + grab→orbit steady-state (**the gated delta = C−B**) · (D) the grab/drop EDGE (light-count hitch hunt) · (E) siege + a **dynamic hurl stand-in** (M1's phantom is render-only — zero physics presence — so E supplies the broad-phase/dynamic-body cost M3 will add; finding #11).

**The pinned budget (Decision #5 — adopted by the loop per the review's recommendation, methodology = WILDHEART delta-from-baseline):** `C−B ≤ 1.5 ms median frame-time delta AND ≤ 3.0 ms p95 delta`. Desktop pass = autonomous gate (necessary signal, catches blowups; NOT sufficient for device). Real mid-iPad session = Kevin-parked confirmation that does **not** block M3 (mirrors WILDHEART S2B1-M2 §4). Levers-if-fail, ordered: phantom pointLight removal → castShadow trims elsewhere → spec sphere-collider/sensor levers → tier levers.

**Reality notes (verified against HEAD 2026-06-10):**
- `PhantomBlockSystem.jsx` mounts its `pointLight` **conditionally** (unmounts when `!held`) → every grab/drop changes the scene light COUNT → three.js re-links shader programs = the #68 carry-forward this plan fixes (Task 3).
- Night: `setTimeOfDay(t)` — day is `[0.25, 0.75)`; use `0.8` (stays night for the whole 60s window at 4 units/s). Day baseline uses `0.4`.
- Siege saturation: `siegeParams` ramp caps at `nightCount=6` (24/4) → probe writes `useGameStore.setState({ nightCount: 6 })`.
- Player survives unattended siege via `healPlayer(100)` every 1s (soft-death lock untouched).
- Probe must NOT reuse capture mode (capture pauses physics + suppresses spawns — would measure nothing).

---

## File structure

| File | Responsibility |
|---|---|
| Create `frontend/src/devtest/frameStats.js` | Pure frame-delta statistics + budget verdict (no deps) |
| Create `frontend/src/devtest/frameStats.test.js` | TDD for the above |
| Create `frontend/src/devtest/perfScenarios.js` | Pure scenario table + event-schedule math |
| Create `frontend/src/devtest/perfScenarios.test.js` | TDD for the above |
| Modify `frontend/src/world/PhantomBlockSystem.jsx` | Light-POOL restructure: pointLight always-mounted, intensity-gated |
| Create `frontend/src/devtest/perfProbe.js` | Probe mode flag + phase + hurl-request channel + seeded RNG |
| Create `frontend/src/devtest/PerfProbeRunner.jsx` | DOM overlay + scenario driver + rAF sampler |
| Create `frontend/src/devtest/PerfProbeSystem.jsx` | Scenario-E dynamic-body hurl stand-in (inside `<Physics>`) |
| Modify `frontend/src/GameScene.jsx` | Pin dpr / suppress monitors under probe; mount PerfProbeSystem |
| Modify `frontend/src/App.jsx` | Mount PerfProbeRunner (dev-only) |
| Modify `frontend/tests/gates/voidhand-noremesh-gates.test.js` | GATED list += the 3 probe files (red-first: ENOENT until created) |
| Create `frontend/scripts/perf/run-scenarios.mjs` | Headed-puppeteer desktop automation + report JSON |
| Modify `frontend/package.json` | `"perf:m2"` script |
| Create `memory/S2B2-M2-PERF.md` | The recorded gate verdict (mirrors `memory/S2B1-M2-PERF.md`) |
| Modify `docs/superpowers/KEVIN-REVIEW-BATCH.md` | One-tap iPad protocol entry (+ #63 golem bundled) |

---

### Task 1: frameStats — pure statistics module

**Files:**
- Create: `frontend/src/devtest/frameStats.js`
- Test: `frontend/src/devtest/frameStats.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { quantile, frameStats, compareScenarios, withinBudget, M2_BUDGET, LONG_FRAME_MS } from './frameStats';

describe('frameStats (S2-B2-M2)', () => {
  it('quantile interpolates and handles edges', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([3, 1, 2], 0.5)).toBe(2); // unsorted input ok
    expect(quantile([10], 0.95)).toBe(10);
    expect(quantile([], 0.5)).toBe(0);
  });

  it('summarizes frame deltas', () => {
    const s = frameStats([16, 16, 16, 50]);
    expect(s.frames).toBe(4);
    expect(s.medianMs).toBe(16);
    expect(s.p95Ms).toBeGreaterThan(16);
    expect(s.maxMs).toBe(50);
    expect(s.longFrames).toBe(1); // 50 > LONG_FRAME_MS
    expect(LONG_FRAME_MS).toBeCloseTo(33.4, 5);
    expect(s.fps).toBeCloseTo(4 / (98 / 1000), 5);
  });

  it('empty input is all-zero (no NaN)', () => {
    const s = frameStats([]);
    expect(s.fps).toBe(0);
    expect(s.medianMs).toBe(0);
  });

  it('compareScenarios + withinBudget implement the pinned C−B gate', () => {
    const b = frameStats(Array(100).fill(16));
    const c = frameStats(Array(100).fill(17));
    const cmp = compareScenarios(b, c);
    expect(cmp.medianDeltaMs).toBeCloseTo(1, 5);
    expect(cmp.fpsDelta).toBeLessThan(0);
    expect(withinBudget(cmp)).toBe(true);
    expect(withinBudget({ medianDeltaMs: 2.0, p95DeltaMs: 0 })).toBe(false);
    expect(withinBudget({ medianDeltaMs: 0, p95DeltaMs: 3.5 })).toBe(false);
    expect(M2_BUDGET).toEqual({ medianDeltaMs: 1.5, p95DeltaMs: 3.0 });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (module not found)**

Run: `cd /Users/kz/Code/Crafty/frontend && npx vitest run src/devtest/frameStats.test.js`
Expected: FAIL — cannot resolve `./frameStats`.

- [ ] **Step 3: Implement**

```js
// frameStats.js — S2-B2-M2: pure frame-time statistics for the perf probe. Input = an array
// of rAF frame deltas in ms. No deps, no globals — unit-testable, and importable from BOTH
// the in-page runner and the node report script (plain ESM, no JSX/import.meta).

export const LONG_FRAME_MS = 33.4; // ≥2 missed 60Hz vsyncs = a visible hitch

/** Interpolated quantile (q in [0,1]) of a numeric array. Input need not be sorted. */
export function quantile(values, q) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Summarize one scenario's frame deltas. */
export function frameStats(deltasMs) {
  const n = deltasMs.length;
  if (!n) return { frames: 0, seconds: 0, fps: 0, medianMs: 0, p95Ms: 0, maxMs: 0, longFrames: 0 };
  const total = deltasMs.reduce((a, b) => a + b, 0);
  return {
    frames: n,
    seconds: total / 1000,
    fps: n / (total / 1000),
    medianMs: quantile(deltasMs, 0.5),
    p95Ms: quantile(deltasMs, 0.95),
    maxMs: Math.max(...deltasMs),
    longFrames: deltasMs.filter((d) => d > LONG_FRAME_MS).length,
  };
}

/** Probe-vs-baseline comparison: positive deltas = the probe scenario is more expensive. */
export function compareScenarios(baseline, probe) {
  return {
    medianDeltaMs: probe.medianMs - baseline.medianMs,
    p95DeltaMs: probe.p95Ms - baseline.p95Ms,
    fpsDelta: probe.fps - baseline.fps,
    longFrameDelta: probe.longFrames - baseline.longFrames,
  };
}

/** The pinned M2 budget for the C−B delta (STATE-REVIEW-2026-06-10 §4 rec, adopted 2026-06-10). */
export const M2_BUDGET = { medianDeltaMs: 1.5, p95DeltaMs: 3.0 };

export function withinBudget(cmp, budget = M2_BUDGET) {
  return cmp.medianDeltaMs <= budget.medianDeltaMs && cmp.p95DeltaMs <= budget.p95DeltaMs;
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/devtest/frameStats.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/kz/Code/Crafty
git add frontend/src/devtest/frameStats.js frontend/src/devtest/frameStats.test.js
git commit -m "feat(voidhand-m2): pure frame-stats module + the pinned C-B budget (1.5ms median / 3ms p95)"
```

---

### Task 2: perfScenarios — pure scenario table + schedule

**Files:**
- Create: `frontend/src/devtest/perfScenarios.js`
- Test: `frontend/src/devtest/perfScenarios.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import {
  SCENARIOS, scenarioEvents, SCENARIO_SEC, EDGE_PERIOD_SEC, HURL_PERIOD_SEC,
  SIEGE_NIGHTS, NIGHT_T, DAY_T, PROBE_DPR,
} from './perfScenarios';

describe('perfScenarios (S2-B2-M2)', () => {
  it('defines exactly the five review-prescribed scenarios', () => {
    expect(Object.keys(SCENARIOS)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(SCENARIOS.A.timeOfDay).toBe(DAY_T);
    expect(SCENARIOS.B.held).toBe(false);          // the honest control
    expect(SCENARIOS.C.held).toBe(true);           // the gated delta is C−B
    expect(SCENARIOS.B.nights).toBe(SIEGE_NIGHTS); // saturated siege ramp
    expect(SCENARIOS.D.edge).toBe(true);
    expect(SCENARIOS.E.hurl).toBe(true);
    expect(SCENARIOS.B.timeOfDay).toBe(NIGHT_T);
  });

  it('night/day fractions actually map to night/day and survive the 60s window', () => {
    expect(NIGHT_T >= 0.75 || NIGHT_T < 0.25).toBe(true);
    expect(DAY_T).toBeGreaterThanOrEqual(0.25);
    expect(DAY_T).toBeLessThan(0.75);
    // 60s at 4 units/s = 240 units = 0.2 of a cycle; neither start may cross its day/night boundary
    expect(NIGHT_T + 0.2 < 1.25).toBe(true); // night spans [0.75, 1.25) unwrapped
    expect(DAY_T + 0.2).toBeLessThan(0.75);
  });

  it('steady-state scenarios have empty schedules', () => {
    expect(scenarioEvents('A')).toEqual([]);
    expect(scenarioEvents('B')).toEqual([]);
    expect(scenarioEvents('C')).toEqual([]);
  });

  it('D alternates setHeld at the edge cadence, starting true', () => {
    const ev = scenarioEvents('D');
    expect(ev[0]).toEqual({ t: EDGE_PERIOD_SEC, type: 'setHeld', value: true });
    expect(ev[1]).toEqual({ t: 2 * EDGE_PERIOD_SEC, type: 'setHeld', value: false });
    expect(ev.length).toBe(Math.ceil(SCENARIO_SEC / EDGE_PERIOD_SEC) - 1);
  });

  it('E hurls on its cadence', () => {
    const ev = scenarioEvents('E');
    expect(ev.length).toBe(Math.ceil(SCENARIO_SEC / HURL_PERIOD_SEC) - 1);
    expect(ev.every((e) => e.type === 'hurl')).toBe(true);
  });

  it('throws on an unknown scenario id', () => {
    expect(() => scenarioEvents('Z')).toThrow(/unknown perf scenario/);
  });

  it('pins the probe DPR', () => {
    expect(PROBE_DPR).toBe(1.5);
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (module not found)**

Run: `npx vitest run src/devtest/perfScenarios.test.js`

- [ ] **Step 3: Implement**

```js
// perfScenarios.js — S2-B2-M2: the perf-probe scenario TABLE (pure data + schedule math).
// Scenarios per STATE-REVIEW-2026-06-10 §4: A explore-idle baseline · B night-siege control
// (held=false, the honest baseline) · C siege + grab-orbit steady-state (the gated C−B delta)
// · D the grab/drop EDGE (light-count hitch hunt) · E siege + a dynamic hurl stand-in (the
// physics presence M1's render-only phantom lacks — what M3's real hurl will add).

export const SCENARIO_SEC = 60;     // sampling window per scenario
export const PROBE_DPR = 1.5;       // pinned DPR while probing (AdaptiveDpr disabled)
export const SIEGE_NIGHTS = 6;      // nightCount=6 saturates the siege ramp (24/4 cap)
export const NIGHT_T = 0.8;         // deep night; +0.2 cycle over 60s never re-enters day
export const DAY_T = 0.4;           // mid-day for the A baseline
export const EDGE_PERIOD_SEC = 2;   // D: grab/drop toggle cadence
export const HURL_PERIOD_SEC = 3;   // E: hurl-stand-in cadence

export const SCENARIOS = {
  A: { label: 'explore-idle day baseline', timeOfDay: DAY_T, nights: 0, held: false, edge: false, hurl: false },
  B: { label: 'night-siege control (held=false)', timeOfDay: NIGHT_T, nights: SIEGE_NIGHTS, held: false, edge: false, hurl: false },
  C: { label: 'siege + grab-orbit steady-state', timeOfDay: NIGHT_T, nights: SIEGE_NIGHTS, held: true, edge: false, hurl: false },
  D: { label: 'grab/drop EDGE (light-count hitch)', timeOfDay: NIGHT_T, nights: SIEGE_NIGHTS, held: false, edge: true, hurl: false },
  E: { label: 'siege + dynamic hurl stand-in', timeOfDay: NIGHT_T, nights: SIEGE_NIGHTS, held: true, edge: false, hurl: true },
};

/**
 * One scenario's event schedule: [{ t (sec from sample-start), type: 'setHeld'|'hurl', value? }].
 * D alternates held true/false every EDGE_PERIOD_SEC (starting true — D begins held=false);
 * E fires a hurl request every HURL_PERIOD_SEC (consumed transiently by PerfProbeSystem).
 */
export function scenarioEvents(id, durationSec = SCENARIO_SEC) {
  const scn = SCENARIOS[id];
  if (!scn) throw new Error(`unknown perf scenario "${id}"`);
  const events = [];
  if (scn.edge) {
    let held = true;
    for (let t = EDGE_PERIOD_SEC; t < durationSec; t += EDGE_PERIOD_SEC) {
      events.push({ t, type: 'setHeld', value: held });
      held = !held;
    }
  }
  if (scn.hurl) {
    for (let t = HURL_PERIOD_SEC; t < durationSec; t += HURL_PERIOD_SEC) {
      events.push({ t, type: 'hurl' });
    }
  }
  return events;
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run src/devtest/perfScenarios.test.js`

- [ ] **Step 5: Full unit suite + commit**

Run: `npx vitest run` — expected: 657+ tests, count GROWS, all green.

```bash
cd /Users/kz/Code/Crafty
git add frontend/src/devtest/perfScenarios.js frontend/src/devtest/perfScenarios.test.js
git commit -m "feat(voidhand-m2): perf-probe scenario table A-E + event-schedule math (TDD)"
```

---

### Task 3: PhantomBlockSystem light-POOL (the #68 carry-forward)

The phantom's `pointLight` becomes ALWAYS-mounted with `intensity` gated on held — grab/drop no longer changes the scene's light COUNT, so the shader program re-link at the grab edge is engineered out by construction (scenario D then verifies empirically). Mesh stays conditional (geometry mount doesn't re-link programs).

**Files:**
- Modify: `frontend/src/world/PhantomBlockSystem.jsx` (full-file replacement below)

- [ ] **Step 1: Replace the component**

```jsx
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/useGameStore';
import { isCaptureMode } from '../devtest/captureMode';

/**
 * PhantomBlockSystem — S2-B2-M1: the VOIDHAND held "phantom block". A pooled VISUAL proxy of the grabbed
 * block that orbits the player as a shield + aim-reference. It is NEVER a voxel edit — grabbing it does NOT
 * touch the terrain worker, so a combat grab never re-meshes (the load-bearing no-re-mesh invariant; the
 * static gate `voidhand-noremesh-gates` keeps this file off every voxel/worker seam).
 *
 * M1 = a single held phantom (a 1×1×1 cube) orbiting via a kinematic RENDER write (group.position each
 * frame — NOT a Rapier constraint solve, so ~zero physics cost). The hurl/slam impulse-proxy + the cap-4
 * pool (eviction safety) are later milestones; the final rim/glow LOOK is M7. The MESH self-gates on
 * `voidhandHeld` (absent from every capture baseline). Capture FREEZES the orbit phase -> byte-stable frame.
 *
 * M2 LIGHT-POOL (the #68 carry-forward): the pointLight is ALWAYS mounted, `intensity`-gated on held —
 * a grab/drop must never change the scene's light COUNT, because a light-count change re-links every
 * shader program = a one-frame hitch at the grab EDGE. Intensity 0 emits nothing (baselines unchanged).
 */
const ORBIT_R = 2.2;       // orbit radius (outside the FPV nose-cam frustum so it never clips)
const ORBIT_Y = 0.2;       // height offset relative to the player origin
const ORBIT_SEC = 3;       // one revolution per 3s
const CAPTURE_PHASE = 0.7; // a flattering frozen side-on angle for the deterministic capture frame
const LIGHT_INTENSITY = 1.4;

export function PhantomBlockSystem() {
  const held = useGameStore((s) => s.voidhandHeld);
  const phantom = useGameStore((s) => s.heldPhantom);
  const groupRef = useRef();
  const spinRef = useRef();

  useFrame((state) => {
    if (!held || !groupRef.current) return;
    const capture = isCaptureMode();
    const theta = capture ? CAPTURE_PHASE : (state.clock.elapsedTime / ORBIT_SEC) * Math.PI * 2;
    groupRef.current.position.set(Math.cos(theta) * ORBIT_R, ORBIT_Y, Math.sin(theta) * ORBIT_R);
    if (spinRef.current) spinRef.current.rotation.set(theta * 0.6, theta, 0); // the block tumbles as it orbits
  });

  const active = held && phantom;
  const color = (phantom && phantom.color) || '#A9966E';

  return (
    <group ref={groupRef}>
      {active && (
        <mesh ref={spinRef} castShadow>
          {/* the grabbed block (M1 placeholder color; M3 reads the looked-at block, M7 polishes the look) */}
          <boxGeometry args={[0.85, 0.85, 0.85]} />
          <meshStandardMaterial color={color} roughness={0.7} metalness={0.05} />
          {/* the kinetic rim — a faint violet additive shell (the grade-resistant element/identity layer) */}
          <mesh scale={1.12}>
            <boxGeometry args={[0.85, 0.85, 0.85]} />
            <meshBasicMaterial color="#B36BFF" toneMapped={false} transparent opacity={0.28}
              blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.BackSide} />
          </mesh>
        </mesh>
      )}
      {/* LIGHT POOL: always mounted; intensity-gated (NEVER conditionally mounted — see header) */}
      <pointLight color="#B36BFF" intensity={active ? LIGHT_INTENSITY : 0} distance={4} decay={2} />
    </group>
  );
}
```

- [ ] **Step 2: Verify the invariant by grep (the light sits OUTSIDE any conditional render)**

Run: `grep -n "pointLight" /Users/kz/Code/Crafty/frontend/src/world/PhantomBlockSystem.jsx`
Expected: one hit, on an unconditional line containing `intensity={active ?`.

- [ ] **Step 3: Gates**

Run from `frontend/`: `npx vitest run` (all green, incl. `voidhand-noremesh-gates` + `dynamic-light-gates`) · `npm run build` (clean) · `npm run test:visual` (13/13 — intensity-0 light emits nothing; NO re-baseline).

- [ ] **Step 4: Commit**

```bash
cd /Users/kz/Code/Crafty
git add frontend/src/world/PhantomBlockSystem.jsx
git commit -m "perf(voidhand-m2): phantom pointLight joins a fixed light pool (always mounted, intensity-gated)

The #68 carry-forward: a conditional light mount changes the scene light COUNT at the
grab/drop edge, re-linking every shader program (a one-frame hitch). Always-mounted +
intensity 0 when not held = constant light count; baselines byte-identical (13/13)."
```

---

### Task 4: the probe runtime (mode flag, runner, hurl stand-in, GameScene/App wiring)

**Files:**
- Modify: `frontend/tests/gates/voidhand-noremesh-gates.test.js` (FIRST — red via ENOENT)
- Create: `frontend/src/devtest/perfProbe.js`
- Create: `frontend/src/devtest/PerfProbeRunner.jsx`
- Create: `frontend/src/devtest/PerfProbeSystem.jsx`
- Modify: `frontend/src/GameScene.jsx` (dpr pin + monitor suppression + PerfProbeSystem mount)
- Modify: `frontend/src/App.jsx` (PerfProbeRunner mount)

- [ ] **Step 1: Extend the no-re-mesh gate FIRST (red)**

In `frontend/tests/gates/voidhand-noremesh-gates.test.js`, extend `GATED` (the probe drives the combat path — it must stay voxel-clean by construction):

```js
  const GATED = [
    'game/voidhand.js',           // the pure grab SM
    'game/kinetic.js',            // the kinetic economy
    'world/PhantomBlockSystem.jsx', // the held-phantom render proxy
    'Components.jsx',             // the SM WIRING surface — where M3 HURL/SLAM lands; was un-gated
                                  // (STATE-REVIEW-2026-06-10 #9; full repo-wide inversion = #69)
    'devtest/perfProbe.js',         // M2 probe mode/channel — drives the combat path, voxel-clean
    'devtest/PerfProbeRunner.jsx',  // M2 scenario driver
    'devtest/PerfProbeSystem.jsx',  // M2 dynamic hurl stand-in
  ];
```

Run: `npx vitest run tests/gates/voidhand-noremesh-gates.test.js` — Expected: FAIL (ENOENT on the 3 new files).

- [ ] **Step 2: Create `frontend/src/devtest/perfProbe.js`**

```js
// perfProbe.js — S2-B2-M2: dev-only PERF-PROBE mode, activated by `?perf=<A..E>` on the dev
// server (import.meta.env.DEV guard -> tree-shaken from prod). While active, GameScene pins
// DPR + disables the adaptive perf machinery (PerformanceMonitor / AdaptiveDpr) so a scenario
// measures a FIXED render configuration, and PerfProbeRunner drives the store through the
// scenario + samples rAF frame deltas. NOT capture mode: physics + spawns stay LIVE — the
// probe measures the real game under siege.

let _scenario = null;
let _phase = 'boot'; // 'boot' | 'settling' | 'sampling' | 'done'
let _hurlRequests = 0;

if (typeof window !== 'undefined' && import.meta.env && import.meta.env.DEV) {
  const p = new URLSearchParams(window.location.search).get('perf');
  _scenario = p && /^[A-E]$/.test(p) ? p : null;
}

export function isPerfProbe() { return _scenario != null; }
export function perfScenarioId() { return _scenario; }
export function setProbePhase(p) { _phase = p; }
export function getProbePhase() { return _phase; }

/** Transient hurl channel: the runner schedules, PerfProbeSystem consumes in useFrame (GLI-clean). */
export function requestHurl() { _hurlRequests += 1; }
export function consumeHurl() { if (_hurlRequests > 0) { _hurlRequests -= 1; return true; } return false; }

/** Deterministic Math.random for the probe window (mulberry32). Returns a restore fn. */
export function seedRandom(seed = 0xC0FFEE) {
  const native = Math.random;
  let a = seed >>> 0;
  Math.random = function seededRandom() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => { Math.random = native; };
}
```

- [ ] **Step 3: Create `frontend/src/devtest/PerfProbeRunner.jsx`**

```jsx
import React, { useEffect, useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { callTestHook } from './testBridge';
import { isPerfProbe, perfScenarioId, setProbePhase, requestHurl, seedRandom } from './perfProbe';
import { SCENARIOS, scenarioEvents, SCENARIO_SEC } from './perfScenarios';
import { frameStats } from './frameStats';

const SETTLE_MS = 4000;     // post-terrain settle before sampling starts
const HEAL_EVERY_MS = 1000; // keep the unattended player alive through the siege

/**
 * PerfProbeRunner — S2-B2-M2 (dev-only DOM overlay; App mounts it, it self-nulls unless ?perf=).
 * Sequence: start game (no pointer-lock needed -> touch-iPad-runnable) -> pin tier -> wait stable
 * terrain -> apply the scenario's t0 store writes -> settle -> sample SCENARIO_SEC of rAF deltas
 * (healing the player + firing scheduled events as it goes) -> publish stats on-screen + on
 * window.__craftyPerfResult (consumed by scripts/perf/run-scenarios.mjs AND read off-screen on iPad).
 */
export function PerfProbeRunner() {
  const [status, setStatus] = useState('booting…');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!isPerfProbe()) return undefined;
    let cancelled = false;
    const id = perfScenarioId();
    const scn = SCENARIOS[id];
    const store = () => useGameStore.getState();
    const restoreRandom = seedRandom();

    const waitStableTerrain = () => new Promise((res) => {
      let last = -1; let stable = 0;
      const iv = setInterval(() => {
        const g = store().getGeneratedChunks;
        const size = g ? g().size : -1;
        stable = size > 0 && size === last ? stable + 1 : 0;
        last = size;
        if (stable >= 6 || cancelled) { clearInterval(iv); res(); }
      }, 300);
    });

    (async () => {
      setProbePhase('settling');
      setStatus(`scenario ${id} — starting…`);
      callTestHook('start');           // leave the menu (pointer lock is best-effort / no-op on touch)
      store().setQualityTier('high');  // pin the tier (matches the visual-gate tier)
      setStatus(`scenario ${id} — waiting for terrain…`);
      await waitStableTerrain();
      if (cancelled) return;

      // t0 scenario writes
      store().setTimeOfDay(scn.timeOfDay);
      useGameStore.setState({ nightCount: scn.nights });
      if (scn.held) { store().setHeldPhantom({ color: '#A9966E' }); store().setVoidhandHeld(true); }

      setStatus(`scenario ${id} — settling…`);
      await new Promise((r) => setTimeout(r, SETTLE_MS));
      if (cancelled) return;

      setProbePhase('sampling');
      setStatus(`scenario ${id} — sampling ${SCENARIO_SEC}s…`);
      const events = scenarioEvents(id);
      const deltas = [];
      let prev = performance.now();
      let lastHeal = prev;
      const t0 = prev;
      let next = 0;
      await new Promise((res) => {
        const tick = (now) => {
          deltas.push(now - prev);
          prev = now;
          const tSec = (now - t0) / 1000;
          if (now - lastHeal >= HEAL_EVERY_MS) { store().healPlayer(100); lastHeal = now; }
          while (next < events.length && events[next].t <= tSec) {
            const ev = events[next++];
            if (ev.type === 'setHeld') {
              if (ev.value) { store().setHeldPhantom({ color: '#A9966E' }); store().setVoidhandHeld(true); }
              else { store().setVoidhandHeld(false); store().setHeldPhantom(null); }
            } else if (ev.type === 'hurl') {
              requestHurl();
            }
          }
          if (tSec >= SCENARIO_SEC || cancelled) { res(); return; }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      setProbePhase('done');
      restoreRandom();
      const stats = frameStats(deltas.slice(1)); // drop the settle-boundary delta
      const out = { scenario: id, label: scn.label, ...stats };
      window.__craftyPerfResult = out;
      setResult(out);
      setStatus(`scenario ${id} — DONE`);
    })();

    return () => { cancelled = true; restoreRandom(); };
  }, []);

  if (!isPerfProbe()) return null;
  return (
    <div style={{ position: 'fixed', top: 8, left: 8, zIndex: 9999, background: 'rgba(10,10,18,0.85)',
      color: '#fff', fontFamily: 'monospace', fontSize: 14, padding: '10px 14px', borderRadius: 8,
      pointerEvents: 'none', maxWidth: 440 }}>
      <div>PERF PROBE — {status}</div>
      {result && (
        <pre style={{ fontSize: 16, margin: '6px 0 0' }}>
{`fps     ${result.fps.toFixed(1)}
median  ${result.medianMs.toFixed(2)} ms
p95     ${result.p95Ms.toFixed(2)} ms
max     ${result.maxMs.toFixed(1)} ms
long>33 ${result.longFrames}`}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/src/devtest/PerfProbeSystem.jsx`**

```jsx
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import { useGameStore } from '../store/useGameStore';
import { isPerfProbe, perfScenarioId, consumeHurl } from './perfProbe';
import { SCENARIOS } from './perfScenarios';

const POOL = 3;        // persistent dynamic bodies, cycled (mirrors M3's pooled-hurl design)
const HURL_SPEED = 22; // m/s — the M3 design ballpark
const CUBE = 0.85;     // the phantom's visual dims

/**
 * PerfProbeSystem — S2-B2-M2 scenario E ONLY (dev probe; GameScene mounts it inside <Physics>,
 * it self-nulls otherwise): a small pool of REAL Rapier dynamic bodies "hurled" from the player
 * on the runner's schedule. M1's phantom is render-only — zero physics presence — so this
 * stand-in supplies the broad-phase AABB + dynamic-body + impact cost M3's real hurl will add
 * (STATE-REVIEW-2026-06-10 §4 finding #11). Transient reads only (Game-Loop-Isolation).
 */
export function PerfProbeSystem() {
  const bodies = useRef([]);
  const nextRef = useRef(0);
  const headingRef = useRef(0);

  useFrame(() => {
    if (!consumeHurl()) return;
    const rb = bodies.current[nextRef.current % POOL];
    nextRef.current += 1;
    if (!rb) return;
    const p = useGameStore.getState().playerPosition;
    headingRef.current += 2.4; // deterministic spread around the player
    const dir = { x: Math.cos(headingRef.current), z: Math.sin(headingRef.current) };
    rb.setTranslation({ x: p.x + dir.x * 2, y: p.y + 1.2, z: p.z + dir.z * 2 }, true);
    rb.setLinvel({ x: dir.x * HURL_SPEED, y: 2, z: dir.z * HURL_SPEED }, true);
    rb.setAngvel({ x: 1, y: 2, z: 1 }, true);
  });

  const active = isPerfProbe() && SCENARIOS[perfScenarioId()] && SCENARIOS[perfScenarioId()].hurl;
  if (!active) return null;
  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <RigidBody key={i} ref={(r) => { bodies.current[i] = r; }} type="dynamic"
          position={[0, -200 - i * 4, 0]} canSleep>
          <mesh>
            <boxGeometry args={[CUBE, CUBE, CUBE]} />
            <meshStandardMaterial color="#A9966E" />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}
```

- [ ] **Step 5: Gate now green**

Run: `npx vitest run tests/gates/voidhand-noremesh-gates.test.js` — Expected: PASS (7 gated files, zero voxel seams).

- [ ] **Step 6: Wire GameScene** (`frontend/src/GameScene.jsx`)

Read-before-write: `grep -n "PerformanceMonitor\|AdaptiveDpr\|dpr={\|<Physics" src/GameScene.jsx`. Then:

a. Add imports next to the existing `captureMode` import:
```js
import { isPerfProbe } from './devtest/perfProbe';
import { PROBE_DPR } from './devtest/perfScenarios';
import { PerfProbeSystem } from './devtest/PerfProbeSystem';
```
b. Pin DPR — change `dpr={[1, q.dprCap]}` to:
```js
        dpr={isPerfProbe() ? PROBE_DPR : [1, q.dprCap]}
```
c. Suppress the adaptive machinery — change the two guards `{!isCaptureMode && (` (PerformanceMonitor block, ~line 775) and `{!isCaptureMode && <AdaptiveDpr pixelated />}` (~line 808) to:
```js
        {!isCaptureMode && !isPerfProbe() && (
```
```js
        {!isCaptureMode && !isPerfProbe() && <AdaptiveDpr pixelated />}
```
d. Mount the stand-in just inside `<Physics …>` (first child, ~line 832):
```js
            {import.meta.env.DEV && <PerfProbeSystem />}
```

- [ ] **Step 7: Wire App** (`frontend/src/App.jsx`)

Read-before-write: `grep -n "GameScene" src/App.jsx` to find the render site. Add the import `import { PerfProbeRunner } from './devtest/PerfProbeRunner';` and mount as a SIBLING of the `<GameScene …/>` element (DOM layer, outside the Canvas):
```jsx
        {import.meta.env.DEV && <PerfProbeRunner />}
```

- [ ] **Step 8: Verify**

From `frontend/`: `npx vitest run` (green, count grew) · `npm run build` (clean — probe modules tree-shaken; verify with `grep -c "PERF PROBE" dist/assets/*.js` → expected 0) · `npm run test:visual` (13/13 — probe inert without `?perf=`).
Manual smoke: `npx vite --port 4180` → open `http://localhost:4180/?perf=C` → overlay runs to DONE with plausible numbers; then `?perf=E` → cubes visibly hurl every 3s.

- [ ] **Step 9: Commit**

```bash
cd /Users/kz/Code/Crafty
git add frontend/src/devtest/perfProbe.js frontend/src/devtest/PerfProbeRunner.jsx \
        frontend/src/devtest/PerfProbeSystem.jsx frontend/src/GameScene.jsx frontend/src/App.jsx \
        frontend/tests/gates/voidhand-noremesh-gates.test.js
git commit -m "feat(voidhand-m2): perf-probe mode — ?perf=A..E drives live-siege scenarios w/ pinned dpr/tier

Dev-only (tree-shaken). Runner samples 60s rAF deltas + publishes window.__craftyPerfResult;
PerfProbeSystem = the scenario-E dynamic hurl stand-in (the physics presence M1's render-only
phantom lacks). PerformanceMonitor/AdaptiveDpr suppressed + DPR pinned under probe. The three
probe files join the voidhand no-re-mesh gate (red-first)."
```

---

### Task 5: desktop automation (headed puppeteer) + npm script

**Files:**
- Create: `frontend/scripts/perf/run-scenarios.mjs`
- Modify: `frontend/package.json` (scripts)

- [ ] **Step 1: Read `scripts/visual/capture.mjs`'s vite spawn/kill pattern and mirror it** (Read tool, lines 1-80 + the tail) — keep the same server lifecycle idioms.

- [ ] **Step 2: Create the runner**

```js
// run-scenarios.mjs — S2-B2-M2: drive the five perf scenarios (A..E) through a HEADED Chrome
// (real GPU — SwiftShader numbers would be meaningless) and collect window.__craftyPerfResult
// per scenario. Writes the report JSON to <repo-root>/memory/perf/ and prints the C−B gate
// verdict using the same tested budget module the app uses.
// Usage: node scripts/perf/run-scenarios.mjs [--scenarios=A,B,C]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import os from 'node:os';
import puppeteer from 'puppeteer';
import { compareScenarios, withinBudget, M2_BUDGET } from '../../src/devtest/frameStats.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');         // frontend/
const OUT_DIR = resolve(ROOT, '../memory/perf');  // repo-root memory/perf/ (committed evidence)
const PORT = 4179;
const URL = `http://localhost:${PORT}`;
const arg = process.argv.find((a) => a.startsWith('--scenarios='));
const IDS = (arg ? arg.split('=')[1].split(',') : ['A', 'B', 'C', 'D', 'E']).map((s) => s.trim().toUpperCase());
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await delay(250);
  }
  throw new Error('dev server did not start');
}

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
const killServer = () => { try { vite.kill('SIGTERM'); } catch {} };
process.on('exit', killServer);

try {
  await waitForServer(URL);
  const browser = await puppeteer.launch({
    headless: false, // real GPU frame pacing
    args: ['--window-size=1380,1100'],
    defaultViewport: { width: 1366, height: 1024 }, // iPad-ish canvas aspect
  });
  const results = {};
  for (const id of IDS) {
    const page = await browser.newPage();
    await page.goto(`${URL}/?perf=${id}`, { waitUntil: 'domcontentloaded' });
    process.stdout.write(`scenario ${id}: running…`);
    await page.waitForFunction('Boolean(window.__craftyPerfResult)', { timeout: 240000, polling: 1000 });
    results[id] = await page.evaluate(() => window.__craftyPerfResult);
    const r = results[id];
    console.log(` done — fps ${r.fps.toFixed(1)} · median ${r.medianMs.toFixed(2)}ms · p95 ${r.p95Ms.toFixed(2)}ms · long ${r.longFrames}`);
    await page.close();
  }
  await browser.close();

  const report = { host: os.hostname(), platform: `${os.type()} ${os.arch()}`, when: new Date().toISOString(), budget: M2_BUDGET, results, deltas: {} };
  if (results.B) {
    for (const id of Object.keys(results)) {
      if (id !== 'B' && id !== 'A') report.deltas[`${id}-B`] = compareScenarios(results.B, results[id]);
    }
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const file = resolve(OUT_DIR, `m2-${os.hostname().split('.')[0]}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`\nwrote ${file}`);
  if (Object.keys(report.deltas).length) console.table(report.deltas);
  const cb = report.deltas['C-B'];
  if (cb) console.log(`M2 gate C−B vs budget ${JSON.stringify(M2_BUDGET)}: ${withinBudget(cb) ? 'PASS ✅' : 'FAIL ❌'}`);
} finally {
  killServer();
}
```

- [ ] **Step 3: npm script** — in `frontend/package.json` scripts, after `"visual:baseline"`:
```json
    "perf:m2": "node scripts/perf/run-scenarios.mjs",
```

- [ ] **Step 4: Smoke + commit**

Run: `npm run perf:m2 -- --scenarios=A` — expected: a headed Chrome opens, scenario A completes, JSON written to `/Users/kz/Code/Crafty/memory/perf/`, no gate verdict (no B).

```bash
cd /Users/kz/Code/Crafty
git add frontend/scripts/perf/run-scenarios.mjs frontend/package.json
git commit -m "feat(voidhand-m2): headed-puppeteer perf runner + perf:m2 script (writes memory/perf/ evidence)"
```

---

### Task 6: RUN the desktop gate + record the verdict

**Files:**
- Create: `memory/S2B2-M2-PERF.md`
- (evidence) `memory/perf/m2-*.json` from the run

- [ ] **Step 1: Full run** — `npm run perf:m2` (all five, ~8 min incl. terrain waits). Eyeball the headed window during B/C: siege mobs visibly present (the control must actually be a siege), phantom orbiting in C.
- [ ] **Step 2: Author `memory/S2B2-M2-PERF.md`** mirroring `memory/S2B1-M2-PERF.md`: methodology (probe mode, pinned dpr/tier, scenarios table), the desktop numbers table (A/B/C/D/E + C−B, D−B, E−B deltas), the gate verdict vs `M2_BUDGET`, the D long-frame reading (edge hitch — expected ~0 post light-pool), the E reading (dynamic-body cost → the M3 re-gate note: re-run E−B after the REAL hurl ships), honest scope (desktop = necessary-not-sufficient proxy; mid-iPad = Kevin session, does NOT block M3), levers status + order, and the bundle-size context note (4.27MB main chunk → S3).
- [ ] **Step 3: Verdict branch** — PASS: M2 desktop gate green → M3 unblocked. FAIL: apply levers in order (light already pooled → castShadow trims → sphere-collider/sensor → tier), re-run, record each attempt; if still over budget after the named levers, park with a writeup per the loop's STUCK rule.
- [ ] **Step 4: Commit**

```bash
cd /Users/kz/Code/Crafty
git add memory/S2B2-M2-PERF.md memory/perf/
git commit -m "gate(voidhand-m2): desktop perf gate executed — scenarios A-E recorded, C-B verdict vs the 1.5ms/3ms budget"
```

---

### Task 7: device protocol + KEVIN-REVIEW-BATCH + doc-currency (M2 close-out)

**Files:**
- Modify: `docs/superpowers/KEVIN-REVIEW-BATCH.md`
- Modify: `docs/superpowers/specs/2026-06-09-crafty-s2b2-voidhand-design.md` (status header: M2 state)
- Modify: `memory/ACTIVE_PLAN.md`, `memory/CHANGELOG.md`, `SOTA-INITIATIVE.md` status banner

- [ ] **Step 1: KEVIN-REVIEW-BATCH entry** — "VOIDHAND M2 device confirmation (one-tap, ~5 min, bundles #63)": on the Mac `cd /Users/kz/Code/Crafty/frontend && npx vite --host`; on the iPad (same Wi-Fi) open `http://<mac-LAN-ip>:5173/?perf=B`, wait for the on-screen DONE numbers, then `?perf=C` (optionally `?perf=E`); compare the two medians against the 1.5ms budget (the overlay shows them — no Safari inspector needed). Same session: the #63 WILDHEART golem check per `memory/S2B1-M2-PERF.md` §4. Record desktop verdict alongside so Kevin sees the expected shape. Note: probe runs on the dev origin — it never touches a real save.
- [ ] **Step 2: Spec status header** — update the M2 line: desktop gate executed (verdict + date), device confirmation parked-to-Kevin, M3 unblocked (or the FAIL/lever state).
- [ ] **Step 3: 4-piece + banner** — ACTIVE_PLAN current-task block (M2 shipped + NEXT = #72 mouse verb-mode seam, the plan-marked pre-M3 blocker, then M3); CHANGELOG milestone entry; SOTA-INITIATIVE banner line (VOIDHAND M2 ✅, M3 next). Banner THIS plan doc `✅ SHIPPED` when done.
- [ ] **Step 4: Commit + push**

```bash
cd /Users/kz/Code/Crafty
git add docs/superpowers/KEVIN-REVIEW-BATCH.md docs/superpowers/specs/2026-06-09-crafty-s2b2-voidhand-design.md \
        docs/superpowers/plans/2026-06-10-crafty-s2b2-m2-fps-gate.md memory/ACTIVE_PLAN.md memory/CHANGELOG.md SOTA-INITIATIVE.md
git commit -m "docs(voidhand-m2): M2 close-out — device protocol parked to Kevin (bundles #63), spec/plan/banner current"
git push origin main
```

---

## Self-review (done at authoring, 2026-06-10)

- **§4 coverage:** scenarios A-E ✓ (Tasks 2/4/5) · pinned budget ✓ (Task 1 `M2_BUDGET`) · touch-iPad dev probe without pointer-lock/KeyV ✓ (URL param + on-screen readout) · hurl stub explicitly defined ✓ (PerfProbeSystem: pool 3, 22 m/s, 3s cadence) · edge measured AT the edge ✓ (D) · light-pool carry-forward ✓ (Task 3) · device-protocol logistics fixed ✓ (one-tap URL, no inspector) · #63 bundled ✓ (Task 7) · M3 re-gate recorded ✓ (Task 6) · #68-first sequencing — already shipped pre-M2 ✓.
- **Placeholder scan:** clean — every code step carries the full code; the two grep-anchored edits (GameScene/App) carry exact target expressions + read-before-write steps.
- **Type consistency:** `frameStats` fields (`fps/medianMs/p95Ms/maxMs/longFrames/frames/seconds`) match across Runner overlay, runner script, and tests ✓; `compareScenarios`/`withinBudget`/`M2_BUDGET` shared app↔script via plain-ESM import ✓; scenario fields (`timeOfDay/nights/held/edge/hurl`) consistent ✓.
- **Known honest limits (recorded, not hidden):** desktop GPU ≫ iPad — the autonomous pass is a necessary-not-sufficient proxy, the device run stays parked to Kevin without blocking M3 (the WILDHEART precedent); siege is statistically (not byte-) deterministic — 60s medians + the same protocol on both sides of every delta make that sound.
