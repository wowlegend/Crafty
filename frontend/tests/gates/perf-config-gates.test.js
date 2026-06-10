import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TIERS } from '../../src/render/quality.js';

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
    expect(src).toMatch(/TIERS\[\s*tier\s*\]/);
    expect(src).toMatch(/\.renderDistance/);
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

  it('WeatherSystem scales its instanced particle COUNT by TIERS[...].weather (transient read)', () => {
    const src = read('src/GameScene.jsx');
    // The effective rendered count must derive from the tier weather multiplier applied
    // to a base count (e.g. Math.round(rainCount * weather)). Lock the multiplier read +
    // its application to the particle base counts.
    expect(src).toMatch(/\.weather/);
    // Transient tier read (Game-Loop-Isolation: getState, not a per-frame subscription
    // bound to the particle buffers).
    expect(src).toMatch(/useGameStore\.getState\(\)\.qualityTier|getState\(\)\.qualityTier/);
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
    const inclineIdx = src.indexOf('onIncline={');
    expect(inclineIdx).toBeGreaterThan(-1);
    // Grab a window after the prop up to the next prop / close (bounded, non-greedy).
    const window = src.slice(inclineIdx, inclineIdx + 300);
    // Upward ladder anchors: 'low' maps up to 'med', and 'med' maps up to 'high'.
    expect(window).toMatch(/cur\s*===\s*'low'\s*\?\s*'med'\s*:\s*'high'/);
    // It must guard against a no-op write (only setQualityTier when next differs).
    expect(window).toMatch(/next\s*!==\s*cur/);
    expect(window).toMatch(/setQualityTier\(next\)/);
  });

  it('PerformanceMonitor uses built-in hysteresis (bounds + flipflops) to prevent oscillation', () => {
    // The dead-zone `bounds` margin + `flipflops` instability cap stop incline/decline
    // ping-ponging. Conservative defaults; real-device threshold tuning is S3.
    expect(src).toMatch(/bounds\s*=\s*\{/);
    expect(src).toMatch(/flipflops\s*=\s*\{/);
  });

  it('the PerformanceMonitor stays inside the !isCaptureMode guard (capture forced-high untouched)', () => {
    // The monitor must remain capture-guarded so the deterministic forced-high capture is
    // never perturbed by recovery logic. S2-B2-M2 STRENGTHENED the guard to also exclude
    // perf-probe mode (`{!isCaptureMode && !isPerfProbe() && (` — the probe must measure a
    // FIXED render config, so the adaptive machinery is off under ?perf= too). The gate now
    // pins the strengthened literal: the capture condition is still required verbatim inside
    // it, the monitor must sit INSIDE the guard, and no intervening `)}` close may occur.
    const GUARD = '{!isCaptureMode && !isPerfProbe() && (';
    const guardIdx = src.indexOf(GUARD);
    const monitorIdx = src.indexOf('<PerformanceMonitor');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(monitorIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(monitorIdx);
    // No guard-close `)}` between the opening guard and the monitor tag.
    const between = src.slice(guardIdx + GUARD.length, monitorIdx);
    expect(between).not.toMatch(/\)\}/);
  });
});
