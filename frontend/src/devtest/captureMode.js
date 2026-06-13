// Dev-only capture-determinism layer for the visual-regression suite.
//
// In normal gameplay this module is INERT: `isCaptureMode()` is false, so every
// guarded code path falls through to its original behavior, and `captureRandom`
// returns the native `Math.random`. The capture harness flips the flag (via the
// `enterCapture` test-bridge hook) only on the dev server, and `import.meta.env.DEV`
// tree-shakes the activation out of production builds entirely.
//
// The load-bearing idea: per-KEY seeded PRNG streams. A single shared global seed
// is NOT enough because the app's async terrain worker + React render order change
// the call sequence between runs, so a shared stream desyncs. Instead each system
// instance (e.g. `weather-snow-12`) gets its OWN deterministic stream derived from a
// fixed base seed + the key string, making the value independent of call order.

const BASE_SEED = 0x9e3779b9; // golden-ratio constant, fixed across all runs

let _captureMode = false;
let _opts = {
  // A known, fixed camera pose so the follow-cam stops drifting during capture.
  // Elevated ~25° "diorama" down-angle over the spawn terrain (x=0,z=0, surface ≈ y53)
  // instead of an eye-level horizontal stare — so the visual-regression frame actually
  // samples what the render recipe changes (AO crevices, foliage saturation, sky grade,
  // water, silhouettes) rather than a single flat trunk/wall filling the frame.
  camera: {
    position: [0, 70, 24],
    lookAt: [0, 64, -66],
  },
};

/** True only while the capture harness has explicitly entered capture mode. */
export function isCaptureMode() {
  return _captureMode;
}

export function getCaptureOpts() {
  return _opts;
}

export function enterCaptureMode(opts = {}) {
  _captureMode = true;
  if (opts.camera) _opts = { ..._opts, camera: { ..._opts.camera, ...opts.camera } };
  // showTouch (M2): the mobile.png fixture opts IN to render the touch overlay; default-off keeps
  // the 17 other baselines null (the overlay's capture guard reads getCaptureOpts().showTouch).
  if ('showTouch' in opts) _opts = { ..._opts, showTouch: !!opts.showTouch };
  return _opts;
}

export function exitCaptureMode() {
  _captureMode = false;
  _opts = { ..._opts, showTouch: false }; // never leak a showTouch fixture into later frames
}

// xmur3 string hash -> 32-bit seed. Deterministic, well-distributed across keys.
function hashKey(str) {
  let h = BASE_SEED ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x5bd1e995);
    h = (h << 13) | (h >>> 19);
  }
  // finalize
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

// mulberry32 PRNG: tiny, fast, good enough for visual determinism.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns a deterministic [0,1) PRNG stream bound to `key`. Each distinct key
 * yields an independent, repeatable sequence — order-independent across runs.
 */
export function makeSeededRandom(key) {
  return mulberry32(hashKey(String(key)));
}

/**
 * Convenience: in capture mode returns a seeded stream for `key`; in normal mode
 * returns native `Math.random`. Call ONCE per system/instance and reuse the
 * returned function, e.g.:
 *   const rnd = captureRandom(`weather-snow-${i}`);
 *   const x = (rnd() - 0.5) * 40;
 */
export function captureRandom(key) {
  return _captureMode ? makeSeededRandom(key) : Math.random;
}
