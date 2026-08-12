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
