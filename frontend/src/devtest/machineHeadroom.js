// machineHeadroom.js — what the machine had when a capture ran, recorded rather than guessed.
//
// THE PROBLEM THIS DOES *NOT* SOLVE, DELIBERATELY. Captures have crashed with `TargetCloseError`
// (headless Chromium killed mid-run) and the repo's note says it happened "at load 13-37". That is the
// only evidence anyone has, and it is the WRONG INSTRUMENT to have written down: load average conflates
// CPU contention, disk I/O and blocked processes, so the same number describes machines in completely
// different states. Measured 2026-08-13 on this machine, one minute apart:
//
//     load 21.25   ->   39% CPU idle, 3.5G free, 6.8G in the compressor
//
// 21 is squarely inside the documented "crash band" while eight of fourteen cores sat idle. A gate on
// that number would refuse a machine that is fine and admit one that is about to OOM.
//
// SO THIS RECORDS AND WARNS; IT DOES NOT ABORT. The honest state of knowledge is that nobody has
// correlated the crashes with anything — "killed" points at memory rather than CPU, but that is a
// hypothesis with n=0 measurements attached. Writing these numbers into `.capture-meta.json` on every
// run means the NEXT crash arrives with the machine state beside it, and after a few the threshold
// becomes measurable instead of folklore. Enforcing a guessed threshold now would foreclose exactly
// that: every refused run is a datapoint not collected.
//
// Pure (no fs, no os) so the thresholds are unit-testable without a particular machine — the readings
// are injected by the caller, which is also what lets a test drive the OOM case on a healthy box.

/** Free RAM below which a headless Chromium capture is plausibly at risk. PROVISIONAL — see above. */
export const LOW_MEM_MB = 4096;

/** Free RAM as a share of total, for machines where the absolute figure means something different. */
export const LOW_MEM_FRACTION = 0.12;

/**
 * @param {{freeMemMB:number, totalMemMB:number, loadAvg1:number, cores:number}} r  injected readings
 * @returns {{freeMemMB:number, freeMemPct:number, loadPerCore:number, warnings:string[]}}
 */
export function evaluateMachineHeadroom(r) {
  const warnings = [];
  const freeMemPct = r.totalMemMB > 0 ? r.freeMemMB / r.totalMemMB : 0;
  const loadPerCore = r.cores > 0 ? r.loadAvg1 / r.cores : 0;

  if (r.freeMemMB < LOW_MEM_MB || freeMemPct < LOW_MEM_FRACTION) {
    warnings.push(
      `only ${Math.round(r.freeMemMB)}MB free of ${Math.round(r.totalMemMB)}MB ` +
      `(${(freeMemPct * 100).toFixed(1)}%) — a headless Chromium capture allocates heavily and a renderer ` +
      `killed mid-run reads as a flaky gate. This is a WARNING, not a refusal: the threshold is a guess ` +
      `and the run is worth more as a datapoint than as a refusal.`,
    );
  }

  // Reported for the record, and deliberately NOT a warning on its own — see the header. It earns one
  // only alongside the memory signal, where the two together describe a genuinely contended machine.
  if (loadPerCore > 1.5 && warnings.length) {
    warnings.push(
      `load ${r.loadAvg1.toFixed(2)} on ${r.cores} cores (${loadPerCore.toFixed(2)}/core) alongside the ` +
      `memory pressure above — measure CPU idle before blaming either; load alone has already been ` +
      `observed at 21 on a machine with 39% of its cores idle.`,
    );
  }

  return { freeMemMB: r.freeMemMB, freeMemPct, loadPerCore, warnings };
}
