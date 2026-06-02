// Device-gated quality tiers (spec §8). S1-B wires these switches into the
// render pipeline; S1-A only defines the config + the pure selection logic.

// S1-D-M3: `godRays` now ON at med (was high-only) for the always-on atmosphere signature,
// with a reduced `godRaySamples` (60 vs high's 100) to keep med within its perf envelope —
// GodRays cost scales ~linearly with samples. low stays off (mobile/coarse-pointer floor).
// `moteCount` = the per-tier warm-mote count consumed by <LightMotes> (motes are cheap
// additive quads; low gets a sparse layer, high the full signature cloud).
//
// `charOutline` is TIER-INDEPENDENT (true at every tier) — the inverted-hull ink contour is
// the LOCKED character render language (S1-B-M2b) and is CHEAP (one backface mesh per object,
// a handful of mobs/props). It must NOT be a perf-downgrade casualty: the in-game
// PerformanceMonitor.onDecline ratchets the tier one-way toward `low`, so gating the outline
// off at low made the signature contour vanish mid-session (Kevin caught 2026-06-02). The
// perf budget at low is recovered from the genuinely-expensive toggles below
// (ao/godRays/shadowMapSize/dprCap/renderDistance/outlineWorldEdge), not from the outline.
// `charRim` (the fresnel onBeforeCompile patch) stays high-only — it is the costlier effect.
// Guarded by tests/gates/character-render-gates.test.js ("charOutline ON at every tier").
export const TIERS = {
  low:  { ao: false, godRays: false, godRaySamples: 0,   bloomMipmap: false, shadowMapSize: 512,  renderDistance: 2, weather: 0.25, dprCap: 1.5, outlineWorldEdge: false, charOutline: true,  charRim: false, moteCount: 36  },
  med:  { ao: true,  godRays: true,  godRaySamples: 60,  bloomMipmap: true,  shadowMapSize: 1024, renderDistance: 3, weather: 0.6,  dprCap: 2,   outlineWorldEdge: false, charOutline: true,  charRim: false, moteCount: 80  },
  high: { ao: true,  godRays: true,  godRaySamples: 100, bloomMipmap: true,  shadowMapSize: 2048, renderDistance: 4, weather: 1.0,  dprCap: 2,   outlineWorldEdge: true,  charOutline: true,  charRim: true,  moteCount: 140 },
};

/**
 * Pure device->tier selection. Touch/coarse-pointer devices START conservative
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
