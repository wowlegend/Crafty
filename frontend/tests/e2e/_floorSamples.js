// How long mob-floor.spec.js's zombie test watches the zombie, and what it counts — the WHOLE watch, its poll loop
// included, kept out of the spec so a unit gate can drive it (tests/gates/floor-sample-window-gates.test.js), the same
// split as _spellEnd.js for the fireball test. The spec supplies only the I/O (page.evaluate, Date.now,
// page.waitForTimeout); everything that decides when the watch ends lives here, where the gate runs it on a fake clock.
//
// THE DEFECT THIS REPLACES (2026-10-28). The spec sampled the zombie once per requestAnimationFrame callback for a flat
// 10 s of wall clock, then demanded a worker reply and at least 2 post-reply samples under the roof: a FRAME count read
// inside a TIME window. What CI measured (run 40637608377, shard 5, both traces): the old in-page loop ran 10.04 s and
// 10.05 s and returned 2 samples and 1 — so in the ~10 s after spawnMob the page ran at most one requestAnimationFrame
// callback. In the retry the screencast shows compositor frames at +0.44-0.51 s after the spawn all the same, so this was
// not a steady slow frame rate but an EPISODIC stall of the main thread (inferred: rAF stopped while the compositor did
// not), ~10 s long, starting at the spawn. Its cause is unmeasured. main shows the same two messages on a first attempt,
// each passing on a retry: 995f1da2 (run 40615332358, "never moved in 1 frames") and d5375ac1 (run 40637429575, "only
// 1 post-reply samples ... of 2 frames"). What the page draws AFTER the stall has not been measured either: the
// screencast's later frames (+13.0, +14.3, +21.2 s) are compositor output, not rAF callbacks.
//
// THE RULE NOW: sample for at least WINDOW_MS, as before, so a machine that renders gets the samples it always got; past
// that, go on until the verdict's denominator exists (MIN_UNDER post-reply samples over the roofed patch), the mob is
// gone, or CAP_MS has passed. At the cap the spec's own assertions say which piece of evidence is missing. This is the
// shape world-hitstop.spec.js's installHoldFreeze already uses: `need` frames AND `minMs`, under a cap.
import { cellOf } from '../../src/game/localPath.js';

/** The least the spec samples, whatever it has seen: the old flat window. */
export const WINDOW_MS = 10000;
/** The most it waits for the evidence, past a stall like CI's. */
export const CAP_MS = 60000;
/** Post-reply samples under the roof the verdict needs. */
export const MIN_UNDER = 2;
/** The zombie test's own timeout: a CI boot, the roof and probes, CAP_MS, and the teardown. */
export const TEST_BUDGET_MS = 240000;
/** How often the watch reads the page's recorder. */
export const POLL_MS = 250;

/**
 * The patch column a sample stands in, relative to its centre: the game's own column for a mob, cellOf from
 * src/game/localPath.js — floor(v + 0.1), the column the ground snap probes (it casts at x + 0.1, z + 0.1).
 */
export const colOf = (m, site) => `${cellOf(m.x, site.cx)},${cellOf(m.z, site.cz)}`;

/**
 * PURE. Where the verdict's evidence stands in `samples` (one per requestAnimationFrame callback, oldest first).
 *   replied: the index of the first sample a worker reply moved off the spawn point in x/z, or -1. The snap runs on every
 *            reply, so from that sample on the zombie's y is the snap's answer — which is why a change in y alone is
 *            not a reply.
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

/**
 * The spec's watch, with its I/O injected. Call it right after the spawn; it reads the page's recorder every POLL_MS
 * until keepSampling says stop, and returns the last read and how long it watched.
 * @param {{
 *   read: () => Promise<{ samples: {x:number, y:number, z:number}[], gone: boolean }>,
 *   now: () => number,
 *   sleep: (ms: number) => Promise<unknown>,
 *   site: {cx:number, cz:number, grounds:Object<string, number>},
 * }} io  the spec: page.evaluate of window.__mobFloorRec, Date.now, page.waitForTimeout, and its roofed patch.
 * @returns {Promise<{ rec: { samples: {x:number, y:number, z:number}[], gone: boolean }, elapsedMs: number }>}
 */
export async function watchUntilEvidence({ read, now, sleep, site }) {
  const t0 = now();
  for (;;) {
    const rec = await read();
    const elapsedMs = now() - t0;
    if (!keepSampling({ elapsedMs, gone: rec.gone, under: floorEvidence(rec.samples, site).under.length })) return { rec, elapsedMs };
    await sleep(POLL_MS);
  }
}
