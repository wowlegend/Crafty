// _firstNightSky.js — what beat (e) of tests/e2e/first-night.spec.js counts as a cut in the sky during the dawn rush
// (the task script's N6a: the rush steps the clock 60 units a 1 s tick, and the sky must follow it, not cut; DECISIONS
// 2026-11-01 (W3-A PR C) item 492). Pure, so tests/gates/first-night-sky-gates.test.js drives it on logs whose answer is
// known by construction.
//
// A log is the sky's own clock read every drawn frame: `{ at }` in ms and `cycle`, the fraction of the day the frame was
// drawn at (render/Atmosphere.jsx readSkyLight). A cut is the clock moving further in one frame than the fastest pan, the
// rush's rate over that frame's time (twice it, and 6 units, for the frame's jitter), so a slow page's pan never reads as
// a cut and a cut on a fast page always does. A wrap from the end of a cycle to its start is a step of a few units.

/** Each frame's step: its time in seconds, how far the sky's clock moved in units, and the most a pan could move it. */
export function skySteps(log, cycleUnits, rate) {
  const sky = (log || []).filter((f) => Number.isFinite(f.cycle));
  return sky.slice(1).map((f, i) => {
    const dt = (f.at - sky[i].at) / 1000;
    let du = (f.cycle - sky[i].cycle) * cycleUnits;
    if (du > cycleUnits / 2) du -= cycleUnits;
    if (du < -cycleUnits / 2) du += cycleUnits;
    return { dt, du, pan: 2 * rate * dt + 6 };
  });
}

/** The first step that is a cut, or null. */
export const firstCut = (steps) => steps.find((s) => Math.abs(s.du) > s.pan) ?? null;

/** The median frame time of `steps`, in seconds (null for none). */
export function medianFrameSec(steps) {
  if (!steps.length) return null;
  const dts = steps.map((s) => s.dt).sort((a, b) => a - b);
  return dts[Math.floor(dts.length / 2)];
}
