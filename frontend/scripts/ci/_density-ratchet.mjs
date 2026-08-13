// THE LOCAL-DENSITY RATCHET — turning a measurement that judged nothing into one that does.
//
// FRAMEWORK SCOPE: universal. Pure arithmetic over two plain objects; no fs, no argv, no vitest.
//
// WHY A RATCHET AND NOT A THRESHOLD. `src/devtest/diffDensity.js` has computed a windowed local density
// on every frame of every run since 2026-08-09 and asserted NOTHING, and its docblock gives the reason
// honestly: a fixed TAU of 0.10 turns eight frames red, seven of which pass the current gate, so it
// would be "a red gate nobody can act on". That objection is correct and it is an objection to a SINGLE
// GLOBAL NUMBER, not to asserting at all. The corpus does not have one tolerance: measured over a real
// pair, 18 of 31 frames reproduce with no changed pixel anywhere while `explore-day` carries 5.13% local
// noise from terrain streaming. One number cannot serve both, and the one that serves `explore-day`
// leaves the static frames guarded by nothing.
//
// A PER-FRAME ratchet needs no adjudication and invents no tolerance. Each frame is frozen at what it
// actually does, and only a RISE fails. A new concentrated regression in a byte-identical frame reds
// immediately even though it moves 0.02% of the frame globally — which is exactly the false-negative
// class the whole density instrument was built for and then never used against.
//
// The floor exists because a frame frozen at exactly 0 would red on a single stray pixel, and a gate
// that cries wolf gets ignored, which is a slower way of asserting nothing.

/** Absolute floor for every frame, whatever it was observed at. 2% of a 128x128 window is 328 pixels. */
export const DENSITY_FLOOR = 0.02;

/**
 * Multiplicative headroom over the observed value, for frames that genuinely carry noise.
 *
 * CALIBRATED FROM ONE RUN, and that is a real limitation rather than a footnote: it is headroom over a
 * single sample of each frame's noise, so it is a guess at the variance, not a measurement of it. It is
 * deliberately generous for that reason. A second pair would let it be tightened, and tightening is the
 * direction this file is designed to move in.
 */
export const DENSITY_HEADROOM = 1.8;

/** The value a frame observed at `density` should be frozen at. */
export function frozenFor(density) {
  return Math.max(DENSITY_FLOOR, Math.ceil(density * DENSITY_HEADROOM * 1000) / 1000);
}

/**
 * Collapse per-run observations of the same frame into the one number to freeze at.
 *
 * THE DIRECTION IS THE WHOLE POINT AND IT IS EASY TO GET BACKWARDS. `freeze-density.mjs` has demanded
 * "TWO captures on identical code, so the number frozen reflects real run-to-run variance rather than
 * one run's noise" since it was written, while READING EXACTLY ONE `current/` directory — the
 * requirement lived in a docblock the code could not satisfy. This is the arithmetic that lets it.
 *
 * The gate fires on `observed > frozen`, so the frozen value is a CEILING and the merge must be MAX.
 * Taking the min (or a mean) would freeze most frames below what they demonstrably do on a good day,
 * and every such frame would red on ordinary variance — a gate that cries wolf, which this file's own
 * header calls a slower way of asserting nothing. Measured on the 2026-08-13 pair: `explore-day`
 * reproduces at 0.093 against one run and 0.107 against the other; a mean would freeze it at 0.180 and
 * red the very next capture that behaved like the second run.
 *
 * A frame observed by only ONE run is still merged — a partial capture is not a reason to refuse the 30
 * frames that did land — but the sample count is returned so the caller can record that the entry rests
 * on one observation. `title-mascot` is that frame today: it fails its canvas wait under a long GL
 * session, so it is the least-sampled entry in the corpus and the ledger should say so rather than
 * present it as equally well evidenced.
 *
 * @param {Record<string, number[]>} perFrame  frame name -> the densities each run observed for it
 * @returns {Record<string, {observed: number, samples: number}>}
 */
export function mergeObserved(perFrame) {
  const out = {};
  for (const [state, densities] of Object.entries(perFrame)) {
    if (!densities.length) continue;
    out[state] = { observed: Math.max(...densities), samples: densities.length };
  }
  return out;
}

/**
 * Compare observed local densities against the frozen ledger.
 *
 * @param {Record<string, number>} frozen    ledger: frame name -> allowed local density
 * @param {Array<{state: string, density: number, x?: number, y?: number}>} observed
 * @returns {{risen: Array, unfrozen: string[], missing: string[]}}
 *   `risen`    — frames whose local concentration exceeds what was frozen. The failure.
 *   `unfrozen` — measured frames absent from the ledger. A new state must be frozen deliberately,
 *                not admitted silently, or the ledger stops being a denominator.
 *   `missing`  — frozen frames that were not measured this run. A frame that vanishes from the corpus
 *                is exactly how a gate quietly stops covering something; the ledger has to notice.
 */
export function densityVerdict(frozen, observed) {
  const seen = new Set();
  const risen = [];
  const unfrozen = [];
  for (const o of observed) {
    seen.add(o.state);
    if (!Object.prototype.hasOwnProperty.call(frozen, o.state)) {
      unfrozen.push(o.state);
      continue;
    }
    if (o.density > frozen[o.state]) {
      risen.push({ state: o.state, density: o.density, allowed: frozen[o.state], x: o.x, y: o.y });
    }
  }
  return {
    risen,
    unfrozen,
    missing: Object.keys(frozen).filter((k) => !seen.has(k)),
  };
}
