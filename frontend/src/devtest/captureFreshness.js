// captureFreshness.js — the pure predicate behind the visual-gate FAIL-LOUD hardening
// (KEVIN-REVIEW-BATCH item #12).
//
// THE HOLE IT CLOSES: the puppeteer capture (scripts/visual/capture.mjs) already exits non-zero on
// a render-crash (the iter-161 _trailDir lesson), so `npm run test:visual` (= capture && diff) aborts
// before the diff on a crash. BUT `tests/visual/diff.test.js` historically only `existsSync`-checked
// current/, so running the diff config IN ISOLATION (the legitimate "diff-alone for a provably-non-
// rendering change" path) against a STALE current/ left behind by a crashed/timed-out capture passed
// SILENT-GREEN on pre-failure frames. That exact class hid a mount-crash for ~4 iters (item #12, iter
// 105) and a heavy-scene capture timeout this 2026-06-28 session.
//
// THE FIX: capture.mjs writes tests/visual/current/.capture-meta.json:
//   { startedAt, finishedAt, complete, crashes }
// INVALIDATED to complete:false at capture START, re-written complete:true ONLY at a clean (crash-free)
// end. diff.test.js calls this predicate BEFORE diffing. A crashed/timed-out/aborted capture leaves the
// sentinel at complete:false -> the gate FAILS LOUD even when the diff is run isolated. A deliberate
// diff-alone of a PRIOR good capture still passes (its sentinel is complete:true + its PNGs were written
// after that run's startedAt), so the legitimate pure-logic path is preserved.
//
// Pure (no fs / puppeteer) -> unit-tested under the normal unit config, so the LOGIC is verifiable even
// when the puppeteer infra is flaky (which is exactly when this guard matters most).

const MTIME_SLACK_MS = 2000; // fs/clock-skew tolerance for "this png was (re)written during this run"

/**
 * @param {{startedAt?:number, finishedAt?:number, complete?:boolean, crashes?:number}|null} meta
 *        parsed .capture-meta.json, or null if the file is missing.
 * @param {string[]} requiredStates the gated visual states (diff.test STATES).
 * @param {Record<string,{exists:boolean, mtimeMs?:number}>} pngInfo per-state current/<state>.png info.
 * @param {{mtimeSlackMs?:number}} [opts]
 * @returns {{ok:boolean, reasons:string[]}}
 */
export function evaluateCaptureFreshness(meta, requiredStates, pngInfo, { mtimeSlackMs = MTIME_SLACK_MS } = {}) {
  const reasons = [];

  if (!meta || typeof meta !== 'object') {
    return {
      ok: false,
      reasons: ['missing .capture-meta.json -- run `npm run visual:capture` (the diff gate must not run on a stale current/)'],
    };
  }

  if (meta.complete !== true) {
    reasons.push('capture did not complete cleanly (timeout / crash / partial run) -- current/ frames are STALE; do NOT trust the diff');
  }
  if ((meta.crashes || 0) > 0) {
    reasons.push(`${meta.crashes} render crash(es) during capture`);
  }

  const startedAt = typeof meta.startedAt === 'number' ? meta.startedAt : NaN;
  for (const state of requiredStates) {
    const info = pngInfo[state];
    if (!info || !info.exists) {
      reasons.push(`missing current/${state}.png`);
      continue;
    }
    if (Number.isFinite(startedAt) && typeof info.mtimeMs === 'number' && info.mtimeMs < startedAt - mtimeSlackMs) {
      reasons.push(`current/${state}.png is older than the capture run start -- STALE frame (mtime ${info.mtimeMs} < startedAt ${startedAt})`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}
