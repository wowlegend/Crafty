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
