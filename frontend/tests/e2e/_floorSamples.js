// How long mob-floor.spec.js's zombie test samples, and what it counts — kept out of the spec so a unit gate can drive
// it (tests/gates/floor-sample-window-gates.test.js), the same split as _spellEnd.js for the fireball test: the spec
// runs only in a browser, where the case that decides this rule (a renderer that draws a frame every few seconds) is a
// matter of the runner's load.
//
// THE DEFECT THIS REPLACES (2026-10-28). The spec sampled the zombie once per rendered frame for a flat 10 s of wall
// clock, then demanded a worker reply and at least 2 post-reply samples under the roof: a FRAME count read inside a TIME
// window. CI's software renderer draws a frame every 1.3-10 s, and right after the spawn it drew none for ~9.6 s. In
// run 40637608377 (shard 5, attempt 2) the trace's screencast has a frame 0.4 s after the spawn and the next one 10.0 s
// after it, so the window held 1 or 2 samples: "the zombie never moved in 1 frames" and "only 1 post-reply samples
// under the roof, of 2 frames". main fails the same way, then passes on a retry: 995f1da2 (run 40615332358) and
// d5375ac1 (run 40637429575).
//
// THE RULE NOW: sample for at least WINDOW_MS, as before, so a machine that renders gets the samples it always got; past
// that, go on until the verdict's denominator exists (MIN_UNDER post-reply samples over the roofed patch), the mob is
// gone, or CAP_MS has passed. At the cap the spec's own assertions say which piece of evidence is missing. This is the
// shape world-hitstop.spec.js's installHoldFreeze already uses: `need` frames AND `minMs`, under a cap.

/** The least the spec samples, whatever it has seen: the old flat window. */
export const WINDOW_MS = 10000;
/** The most it waits for the evidence on a renderer that draws a frame every few seconds. */
export const CAP_MS = 60000;
/** Post-reply samples under the roof the verdict needs. */
export const MIN_UNDER = 2;
/** The zombie test's own timeout: a CI boot of up to 90 s, the roof and probes, CAP_MS, and the teardown. */
export const TEST_BUDGET_MS = 240000;

/** The patch column a sample stands in, relative to its centre. floor(x + 0.1): the probes' own seam jitter. */
export const colOf = (m, site) => `${Math.floor(m.x + 0.1) - site.cx},${Math.floor(m.z + 0.1) - site.cz}`;

/**
 * PURE. Where the verdict's evidence stands in `samples` (one per rendered frame, oldest first).
 *   replied: the index of the first sample a worker reply moved off the spawn point, or -1. The snap runs on every reply,
 *            so from that sample on the zombie's y is the snap's answer.
 *   under:   the samples from `replied` on that lie over the roofed patch (`site.grounds` is keyed by column).
 * @param {{x:number, y:number, z:number}[]} samples
 * @param {{cx:number, cz:number, grounds:Object<string, number>}} site
 */
export function floorEvidence(samples, site) {
  if (!samples.length) return { replied: -1, under: [] };
  const first = samples[0];
  const replied = samples.findIndex((m) => Math.hypot(m.x - first.x, m.z - first.z) > 0.01);
  const under = replied < 0 ? [] : samples.slice(replied).filter((m) => site.grounds[colOf(m, site)] !== undefined);
  return { replied, under };
}

/**
 * PURE. Whether the spec reads another frame.
 * @param {{ elapsedMs: number, gone: boolean, under: number }} s  elapsedMs since the spawn; gone: the mob left the
 *   world; under: floorEvidence(...).under.length so far.
 */
export function keepSampling({ elapsedMs, gone, under }) {
  if (gone) return false;
  if (elapsedMs >= CAP_MS) return false;
  if (elapsedMs < WINDOW_MS) return true;
  return under < MIN_UNDER;
}
