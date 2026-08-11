/**
 * phase.js — turning a frequency-over-time into a waveform, correctly.
 *
 * THE ERROR THIS EXISTS TO STOP. Three voices in synthVoices.js wrote `Math.sin(2 * Math.PI * f(t) * t)`
 * with a time-varying `f`. That is not a sweep from f(0) to f(D): the instantaneous frequency of
 * sin(2*pi*g(t)) is g'(t), and for g(t) = f(t)*t that is `f(t) + t*f'(t)` — the sweep runs at DOUBLE the
 * intended rate.
 *
 * What that cost, measured against each voice's own comment:
 *   makeFreezeSound  declared 1400 -> 700 Hz; actual 1400 - 2800t, so it passes 700 Hz at the MIDPOINT
 *                    and reaches 0 Hz before the buffer ends.
 *   makeDefeatSound  declared 200 -> 80 Hz; actual 200 - 300t, which CROSSES ZERO at t = 0.667 of a 0.8s
 *                    buffer and then rises again — a descending defeat sting that turns around and goes up.
 *   makeBindSound    steps f from 392 to 523.25 at t = 0.18. With phase = t*f, the phase jumps
 *                    discontinuously at that instant, which is a click — on the "binding lands" resolve,
 *                    the one moment the sound is supposed to feel clean.
 *
 * ACCUMULATING the phase fixes all three shapes with one mechanism, including the step, because it never
 * asks what the phase "should be" at time t — it only ever advances it by this sample's worth.
 */

/**
 * A phase accumulator, in radians, advanced one sample at a time.
 *
 * Returns the phase BEFORE advancing, so the first sample is at phase 0 — a generator that returned the
 * post-advance value would start one sample into the waveform, which is a click of its own at high f.
 *
 * For a harmonic partial, multiply: the phase of k*f is exactly k times the phase of f, since
 * integral(k*f) = k*integral(f). One accumulator therefore serves a fundamental and all its partials.
 *
 * @param {number} sampleRate
 * @returns {(f:number) => number} advance(f) -> phase in radians for THIS sample
 */
export function makePhaseAccumulator(sampleRate) {
  const k = (2 * Math.PI) / sampleRate;
  let phase = 0;
  return function advance(f) {
    const here = phase;
    phase += k * (Number.isFinite(f) ? f : 0);
    return here;
  };
}

/**
 * A band-limited-enough triangle from a phase in RADIANS (the shape makeBindSound draws).
 * Kept here so the voice does not re-derive `t * f` cycles and reintroduce the same error in another form.
 */
export function triangleFromPhase(phase) {
  const cycles = phase / (2 * Math.PI);
  return 2 * Math.abs(2 * (cycles - Math.floor(cycles + 0.5))) - 1;
}
