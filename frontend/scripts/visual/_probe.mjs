// _probe.mjs — shared HONESTY primitives for the visual/interaction probes.
//
// WHY THIS EXISTS. On 2026-08-05 two registry lines were written from a probe that reported success over
// something it never touched. `touch-probe.mjs` tapped what it believed was the Aspect ring's first sector
// and reported `dispatched=true`; the sector's centre is in fact the SPELL TOGGLE's box (both radial menus
// use radius 78 and their anchors sit exactly 78px apart), so the tap opened the spell picker, the ring was
// never told anything, and the probe concluded "the ring does not close after a selection". A second line —
// "touch-spells leaves the DOM" — came from the same tap landing in the wrong place. Neither was true.
//
// The helper only ever checked that the element had non-zero SIZE. Size is not reachability: an element can
// be off-screen, or underneath something else, and still measure 52x52.
//
// This is the same move `_serve.mjs` made for the process-leak class. That class stopped when the correct
// lifecycle was extracted into one shared helper — not when the rule was written down. A rule in a document
// is read once at orientation; a helper is used at the moment of the mistake.

/**
 * PURE. Decide whether a tap aimed at `id` can actually REACH `id`.
 *
 * Split out from the DOM call so the two failures that motivated it are unit-testable with no browser:
 * a target whose centre lies outside the viewport, and a target something else is sitting on top of.
 *
 * @param {string} id                    the data-testid being aimed at
 * @param {{x:number,y:number,w:number,h:number,hitIsSelf:boolean,hitLabel:string}|null} info  measured in-page
 * @param {{w:number,h:number}} viewport
 * @returns {{ok:true,x:number,y:number}|{ok:false,why:string}}
 */
export function tapVerdict(id, info, viewport) {
  if (!info) return { ok: false, why: `no element with data-testid="${id}" in the DOM` };
  if (!(info.w > 0) || !(info.h > 0)) return { ok: false, why: `${id} has zero size (${info.w}x${info.h})` };

  const x = Math.round(info.x + info.w / 2);
  const y = Math.round(info.y + info.h / 2);

  // OFF-SCREEN. A control laid out past the edge measures full size and is untouchable by any thumb.
  // This is `touch-aspect-grab` at x=390 on a 390px-wide viewport.
  if (x < 0 || y < 0 || x >= viewport.w || y >= viewport.h) {
    return { ok: false, why: `${id} centre (${x},${y}) is outside the ${viewport.w}x${viewport.h} viewport — ` +
      `it is laid out at ${Math.round(info.x)},${Math.round(info.y)} ${info.w}x${info.h} and no tap can reach it` };
  }

  // OCCLUDED. The tap would dispatch, something would respond, and it would not be the thing we named.
  // This is the ring sector whose centre is the spell toggle's box.
  if (!info.hitIsSelf) {
    return { ok: false, why: `a tap at ${id}'s centre (${x},${y}) lands on ${info.hitLabel} instead — ` +
      `dispatching it would exercise the WRONG control and report success` };
  }

  return { ok: true, x, y };
}

/**
 * Measure a target and tap it ONLY if the tap can actually reach it.
 *
 * Returns the same {ok, why} shape as `tapVerdict` so a caller can report WHY a tap did not happen. A probe
 * that cannot say why is how a layout defect gets recorded as a behavioural one.
 *
 * @param {import('puppeteer').Page} page
 * @param {string} id  data-testid
 * @param {{settleMs?:number}} [opts]
 */
export async function tapTestId(page, id, { settleMs = 350 } = {}) {
  const viewport = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const info = await page.evaluate((sel) => {
    const el = document.querySelector(`[data-testid="${sel}"]`);
    if (!el) return null;
    const q = el.getBoundingClientRect();
    const cx = Math.round(q.x + q.width / 2);
    const cy = Math.round(q.y + q.height / 2);
    // What would ACTUALLY receive this tap? elementFromPoint skips pointer-events:none nodes, which is
    // exactly right here: those cannot receive the tap either, so they are not what we would hit.
    const hit = (cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight)
      ? document.elementFromPoint(cx, cy) : null;
    const hitIsSelf = !!hit && (hit === el || el.contains(hit) || hit.contains(el));
    const hitLabel = hit
      ? (hit.dataset?.testid ? `[data-testid="${hit.dataset.testid}"]` : `<${hit.tagName.toLowerCase()}>`)
      : 'nothing';
    return { x: q.x, y: q.y, w: q.width, h: q.height, hitIsSelf, hitLabel };
  }, id);

  const verdict = tapVerdict(id, info, viewport);
  if (!verdict.ok) return verdict;

  await page.touchscreen.tap(verdict.x, verdict.y);
  await new Promise((r) => setTimeout(r, settleMs));
  return verdict;
}

/**
 * Prove the instrument can detect PRESENCE before any assertion of ABSENCE is allowed to mean anything.
 *
 * A probe that reports "the player did not move" is worthless until it has shown, in the same run and with
 * the same measurement, that it CAN see the player move. Without that denominator, a broken observable and
 * a real freeze are the same reading. The ESC-freeze probe needed three attempts before the player had
 * settled onto streamed terrain — had it asserted the freeze first, it would have "passed" on a dead
 * instrument.
 *
 * @param {() => Promise<number|null>} measure  returns the quantity that should be non-trivial when working
 * @param {{label:string, min?:number, attempts?:number, gapMs?:number, onRetry?:(n:number)=>Promise<void>|void}} opts
 * @returns {Promise<{ok:boolean, value:number, why:string}>}
 */
export async function assertBaseline(measure, { label, min = 0.5, attempts = 4, gapMs = 2000, onRetry } = {}) {
  let value = 0;
  for (let i = 0; i < attempts; i++) {
    if (i) {
      if (onRetry) await onRetry(i);
      await new Promise((r) => setTimeout(r, gapMs));
    }
    value = (await measure()) ?? 0;
    if (value > min) return { ok: true, value, why: '' };
  }
  return {
    ok: false,
    value,
    why: `BASELINE FAILED for "${label}": the instrument never observed a value above ${min} in ${attempts} ` +
      `attempts, so it cannot distinguish a real absence from a dead measurement. Any absence this probe ` +
      `reports below is UNINTERPRETABLE — fix the baseline before believing the result.`,
  };
}
