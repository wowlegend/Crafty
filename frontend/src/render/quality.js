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
// (godRays/shadowMapSize/dprCap/renderDistance), not from the outline.
// `charRim` (the fresnel onBeforeCompile patch) stays high-only — it is the costlier effect.
// Guarded by tests/gates/character-render-gates.test.js ("charOutline ON at every tier").
//
// `budgetPx` + `dprCap` (2026-10-27, plan 2026-10-27-crafty-steady-cool item a): the canvas dpr is
// render/pixelBudget.js pixelBudgetDpr — clamp(min(dprCap, devicePixelRatio, sqrt(budgetPx / cssPx)), 1, dprCap).
// DERIVATION. high 4.2 Mpx is ~55% of the 7.72 Mpx an M3 Max window drew at dpr 2 (1728x1117 CSS), the case Kevin
// heard as fans at full speed: the per-pixel chain is the cost, so the budget is set where that machine sits at
// dpr ~1.48. med and low step down by ~2/3 each (2.8, 1.8 Mpx), the same ratio as their shadow cuts. The caps
// fall 1.75 / 1.5 / 1.25 so a small screen, where the budget alone would allow dpr 2+, still pays less per tier:
// an iPad Pro 11 (1194x834) gets exactly the cap at each tier, a 1080p monitor stays at 1, a 5K display at high
// drops to ~1.07. Sharpness at ~1.5 on Retina is the taste call; the lookbook's side-by-side crops decide it.
export const TIERS = {
  low:  { godRays: false, godRaySamples: 0,   bloomMipmap: false, shadowMapSize: 512,  renderDistance: 2, weather: 0.25, dprCap: 1.25, budgetPx: 1.8e6, charOutline: true,  charRim: false, moteCount: 36  },
  med:  { godRays: true,  godRaySamples: 60,  bloomMipmap: true,  shadowMapSize: 1024, renderDistance: 3, weather: 0.6,  dprCap: 1.5,  budgetPx: 2.8e6, charOutline: true,  charRim: false, moteCount: 80  },
  // godRaySamples high 100 -> 60 (2026-09-22). This file's own header states the governing fact —
  // "GodRays cost scales ~linearly with samples" — which makes 100 the single most expensive knob in the
  // post chain, and it was never cost-budgeted: `selectTier` puts any machine with >=12 GB and >=8 cores
  // on `high`, so a 36 GB / 14-core laptop runs 100-sample god rays across 7.7 Mpx at dpr 2. Measured
  // live: navigator.deviceMemory reports 32 on a secure context (NOT clamped to 8 — I assumed it was and
  // was wrong), cores 14, so selectTier returns 'high' on exactly that machine.
  // 60 is not a guess: `med` has shipped 60 since S1-D-M3 as the value judged to hold the atmosphere
  // signature, so this takes ~40% off the most expensive pass at a quality point already accepted.
  // dprCap was held at 2 here "for a measured before/after and Kevin's eye"; the masterpiece programme (Kevin,
  // 2026-10-27, Phase 0g) moved it into the pixel budget above, and the lookbook crops are that eye.
  high: { godRays: true,  godRaySamples: 60,  bloomMipmap: true,  shadowMapSize: 2048, renderDistance: 4, weather: 1.0,  dprCap: 1.75, budgetPx: 4.2e6, charOutline: true,  charRim: true,  moteCount: 140 },
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
