import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TIERS } from '../../src/render/quality.js';
import { createGovernor, governorIncline, governorDecline } from '../../src/render/tierGovernor.js';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

// S2-A-M4a: the tier perf levers (renderDistance, weather) were DEAD (zero consumers
// outside quality.js); onIncline tier-recovery was ABSENT (one-way ratchet to `low`).
// These gates lock the wiring + the symmetric recovery. They are STATIC (source-text)
// gates because the chunk loader / weather system / PerformanceMonitor live inside R3F
// component closures that are not unit-mountable without a GL context.

describe('S2-A-M4a T1: renderDistance tier lever is WIRED', () => {
  // Capture-safety contract: capture forces `high`, and the chunk loader historically
  // hardcoded a radius of 4 which equals TIERS.high.renderDistance, so the forced-high
  // baselines are byte-identical with NO TIERS adjustment. If a future edit lowers
  // high.renderDistance below 4 this fails (it would shrink the high-tier capture world).
  it('TIERS.high.renderDistance equals the legacy hardcoded chunk radius (4) -> high unchanged', () => {
    expect(TIERS.high.renderDistance).toBe(4);
  });

  it('low/med renderDistance are the smaller perf-saving values (low < med < high)', () => {
    expect(TIERS.low.renderDistance).toBeLessThan(TIERS.med.renderDistance);
    expect(TIERS.med.renderDistance).toBeLessThan(TIERS.high.renderDistance);
  });

  it('Terrain chunk loader DERIVES its radius from TIERS[...].renderDistance (no hardcoded 4)', () => {
    const src = read('src/world/Terrain.jsx');
    // The render-distance gate must read the tier lever transiently from the store, not
    // a hardcoded constant. Lock that it indexes TIERS by tier AND reads .renderDistance
    // (the actual code is `(TIERS[tier] || TIERS.low).renderDistance` -> a fallback-safe
    // derivation, so assert the two facts separately rather than one brittle adjacency).
    // RE-POINTED 2026-10-27 (plan 2026-10-27-crafty-steady-cool item d): the lookup moved into
    // render/tierGovernor.js renderDistanceFor(tier, pin), which pins the radius to the boot tier on a coarse
    // pointer; its arithmetic is tests/gates/tier-governor-gates. Here: the loader calls it with the tier it read.
    expect(src).toMatch(/renderDistanceFor\(\s*tier\s*,\s*useGameStore\.getState\(\)\.renderDistancePin\s*\)/);
    // And it must read the tier transiently from the store (Game-Loop-Isolation: a
    // getState read inside the setTimeout chunk loop, NOT a reactive subscription).
    expect(src).toMatch(/useGameStore\.getState\(\)\.qualityTier/);
    // Regression guard: the loop must NOT reintroduce a literal `RENDER_DISTANCE = 4`.
    expect(src).not.toMatch(/RENDER_DISTANCE\s*=\s*4/);
  });
});

describe('S2-A-M4a T2: weather density tier lever is WIRED', () => {
  // Capture-safety contract: capture forces `high` with weather == 1.0, so the effective
  // particle count == the full base count -> the weather frames (and all forced-high
  // baselines) are byte-identical. low (0.25) / med (0.6) thin the particle clouds.
  it('TIERS.high.weather is 1.0 (full density -> high unchanged)', () => {
    expect(TIERS.high.weather).toBe(1.0);
  });

  it('low/med weather multipliers are the smaller perf-saving values (low < med < high)', () => {
    expect(TIERS.low.weather).toBeLessThan(TIERS.med.weather);
    expect(TIERS.med.weather).toBeLessThan(TIERS.high.weather);
  });

  it('WeatherSystem scales its instanced particle COUNT by TIERS[...].weather (a selector, re-thinned on a tier step)', () => {
    // RE-POINTED 2026-10-27. This read GameScene.jsx + WeatherSystem.jsx and asserted a TRANSIENT tier read
    // (`getState().qualityTier`). WeatherSystem never did that: it subscribes with a selector, on purpose, so its
    // count-keyed useMemos re-thin the particles on a runtime tier change (GameScene's residue note, "(was 3)").
    // The assertion was satisfied by GameScene's old PerformanceMonitor handlers, which read the tier with
    // getState — so it measured the wrong file, and went red the moment those handlers moved into
    // render/tierGovernor.js. It now reads WeatherSystem alone and asserts what it actually does.
    const src = read('src/render/WeatherSystem.jsx'); // A2.5: WeatherSystem moved -> src/render/
    // The effective rendered count must derive from the tier weather multiplier applied
    // to a base count (e.g. Math.round(rainCount * weather)). Lock the multiplier read +
    // its application to the particle base counts.
    expect(src).toMatch(/\(TIERS\[qualityTier\] \|\| TIERS\.low\)\.weather/);
    // The tier arrives through a selector subscription (a render on a tier change, never a per-frame binding).
    expect(src).toMatch(/useGameStore\(\(s\) => s\.qualityTier\)/);
    // The effective counts must be scaled by the multiplier (rounding the base count by
    // weatherDensity) for at least rain+snow. Code: `Math.round(rainCountBase * weatherDensity)`.
    expect(src).toMatch(/Math\.round\(\s*rainCountBase\s*\*\s*weatherDensity\s*\)/);
    expect(src).toMatch(/Math\.round\(\s*snowCountBase\s*\*\s*weatherDensity\s*\)/);
    // The multiplier itself must derive from the tier's .weather lever.
    expect(src).toMatch(/\)\.weather/);
  });
});

describe('S2-A-M4a T3: onIncline tier recovery (fix the one-way ratchet)', () => {
  const src = read('src/GameScene.jsx');

  it('PerformanceMonitor has BOTH onIncline and onDecline (recovery is no longer one-way)', () => {
    expect(src).toMatch(/onIncline\s*=\s*\{/);
    expect(src).toMatch(/onDecline\s*=\s*\{/);
  });

  it('onIncline steps low->med->high (symmetric to onDecline high->med->low)', () => {
    // Isolate the onIncline arrow-callback body and assert the upward step ladder:
    //   cur === 'low'  -> 'med'   (else)
    //   cur === 'med'  -> 'high'
    //   cur === 'high' -> stays 'high' (the `next !== cur` guard no-ops)
    // Anchor on the JSX prop `onIncline={` (the actual callback) -- not a prose mention
    // of "onIncline" in a comment -- so the window holds the callback body.
    // RE-POINTED 2026-10-27 (plan 2026-10-27-crafty-steady-cool item d). The ladder moved into
    // render/tierGovernor.js (governorIncline / governorDecline, with hysteresis and a settle), so it is driven
    // here as behaviour; what stays a source fact is the WIRING: both monitor callbacks go through GameScene's one
    // governorStep, and that step writes the store only when the governor returns a tier.
    const g = createGovernor();
    expect([governorIncline(g, 'low', 0), governorIncline(g, 'med', 0), governorIncline(g, 'high', 0)]).toEqual(['med', 'high', null]);
    expect([governorDecline(createGovernor(), 'high', 0), governorDecline(createGovernor(), 'med', 0), governorDecline(createGovernor(), 'low', 0)]).toEqual(['med', 'low', null]);
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // 2026-10-27 (review MED 4, the warm-up): each callback hands drei's api to the step, which ignores a fresh monitor's
    // first window (governorWarm, driven against drei's real monitor in tier-governor-gates), and the monitor is keyed on
    // the tier so a step's own cost lands in a fresh monitor's first window.
    expect(code).toMatch(/onIncline=\{\(api\) => governorStep\('incline', api\)\}/);
    expect(code).toMatch(/onDecline=\{\(api\) => governorStep\('decline', api\)\}/);
    const step = code.slice(code.indexOf('const governorStep = useRef('), code.indexOf('}).current;'));
    expect(step, 'governorStep not found').toMatch(/governorIncline\(governor\.current, st\.qualityTier, now\)/);
    expect(step).toMatch(/governorDecline\(governor\.current, st\.qualityTier, now\)/);
    expect(step, 'the step does not ignore a fresh monitor\'s first window').toMatch(/^\s*if \(monitor && !governorWarm\(monitor\.index\)\) return null;/m);
    expect(step.indexOf('governorWarm('), 'the warm-up check comes after the tier is stepped').toBeLessThan(step.indexOf('governorDecline('));
    const tagAt = code.indexOf('<PerformanceMonitor');
    const tag = code.slice(tagAt, code.indexOf('/>', tagAt));
    expect(tag, 'the monitor is not remounted by a tier step').toMatch(/\bkey=\{qualityTier\}/);
    // It must guard against a no-op write (only setQualityTier when the governor returned a tier).
    expect(step).toMatch(/if \(next\) st\.setQualityTier\(next\);/);
  });

  it('PerformanceMonitor uses the bounds dead zone for hysteresis — and does NOT cap flipflops', () => {
    // REWRITTEN 2026-09-22. This case used to assert `flipflops = {` as half of the anti-oscillation
    // mechanism. It was removed from GameScene that day, and gate-shape immediately reported that the
    // assertion now matched ONLY the residue COMMENT naming the old value — "delete the guarded code and
    // this assertion still passes; it is not a gate". Correct diagnosis: the property changed, so the
    // gate had to change with it rather than be relaxed.
    //
    // WHY flipflops is gone. drei's default is Infinity, and its sampler opens with
    // `if (api.fallback) return;` under "If the fallback has been reached do not continue running
    // samples" (read from the installed drei source). Exceeding the cap stops SAMPLING for the session,
    // so a warm-up climb of 2 inclines plus one dip froze adaptation permanently. `bounds` is the
    // mechanism whose job is hysteresis; a transition budget was doing it by switching the instrument off.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).toMatch(/bounds\s*=\s*\{/);        // the dead zone IS present, in code
    expect(code).not.toMatch(/flipflops\s*=\s*\{/); // and the session-freezing cap is not
  });

  it('the PerformanceMonitor stays inside the canvas pace\'s governor guard (capture forced-high untouched)', () => {
    // The monitor must remain capture-guarded so the deterministic forced-high capture is
    // never perturbed by recovery logic. S2-B2-M2 STRENGTHENED the guard to also exclude
    // perf-probe mode (the probe must measure a FIXED render config, so the adaptive machinery
    // is off under ?perf= too). 2026-10-27: the guard is render/canvasPace.js's `governor`, which
    // is also off behind the title (whose 10 fps pace the monitor read as a slow machine); that
    // decision's behaviour is canvas-pace-gates'. This pins its two ends here: the pace is computed
    // with BOTH harnesses, and the monitor sits INSIDE `{pace.governor && (` with no `)}` between.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code, 'the pace no longer knows both harnesses').toMatch(/paceFor\(\{[^}]*harness:\s*isCaptureMode\s*\|\|\s*isPerfProbe\(\)\s*\}\)/);
    const GUARD = '{pace.governor && (';
    const guardIdx = code.indexOf(GUARD);
    const monitorIdx = code.indexOf('<PerformanceMonitor');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(monitorIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(monitorIdx);
    // No guard-close `)}` between the opening guard and the monitor tag. Sliced from `code`, whose offsets these are.
    const between = code.slice(guardIdx + GUARD.length, monitorIdx);
    expect(between).not.toMatch(/\)\}/);
  });
});
