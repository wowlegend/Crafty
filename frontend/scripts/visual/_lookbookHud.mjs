// _lookbookHud.mjs — the lookbook's `hud` set (plan docs/superpowers/plans/2026-10-29-crafty-w2d-hud.md, A0): the HUD
// lane's two acceptance poses that are not eye-level frames at rest, shot on the production build through the seam.
//   compass  the player stood 22 m beyond Mara the Smith on the line from HOME (the world origin) through her, facing
//            HOME, so HOME and her marker sit a few degrees apart on the strip: the label boxes are read and their
//            overlaps counted (STATUS G-ledger 38/b);
//   dusk     the clock set just short of the dusk window and left to run into it, every toast logged from before the
//            edge; one frame with the warning up, its box against the day-phase dial's (G-ledger 38/a); then a night,
//            zh-CN, the next dusk and its frame; English restored after.
// Each reads the build it is pointed at: a build from before the HUD lane has no marker or toast test ids, so the
// readers fall back to the old markup (the compass track's spans, a toast found by its words, the dial by its place).
// A helper, not a probe: it binds no port and launches nothing (lookbook.mjs owns the browser).
import { join } from 'node:path';
import { HALF_CYCLE_UNITS } from '../../src/game/dayNight.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const DUSK_EDGE = HALF_CYCLE_UNITS * 0.82; // game/dayPhase.isDuskApproaching: the last 18% of the day half
const DUSK_WORDS = /Dusk approaches|黄昏将至/;

/** PURE. The pairs of [{ text, x, right, y, bottom }] boxes that intersect, as "a x b". */
export function overlappingPairs(boxes) {
  const out = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      if (a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom) out.push(`${a.text} x ${b.text}`);
    }
  }
  return out;
}

/** PURE. Where to stand so HOME (the origin) and an NPC at (x, z) share a bearing: `beyondM` past the NPC, away from
 *  HOME; and the compass heading (degrees) that faces HOME from there. */
export function clusterStand(x, z, beyondM = 22) {
  const d = Math.hypot(x, z) || 1;
  const px = x + (x / d) * beyondM, pz = z + (z / d) * beyondM;
  const heading = ((Math.atan2(-px, pz) * 180) / Math.PI + 360) % 360;
  return { x: px, z: pz, heading };
}

/** The compass strip as shown: label boxes and pips, from the pooled markers or the old innerHTML spans. */
const readStrip = (page) => page.evaluate(() => {
  const shown = (el) => getComputedStyle(el).visibility === 'visible' && el.getBoundingClientRect().width > 0;
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom }; };
  let labels = [...document.querySelectorAll('[data-compass-label]')];
  const pooled = labels.length > 0;
  if (!pooled) labels = [...document.querySelectorAll('[data-testid="compass-track"] span')];
  return {
    pooled,
    labels: labels.filter(shown).map((el) => ({ text: el.textContent.trim(), kind: el.getAttribute('data-compass-label'), ...box(el) })),
    pips: [...document.querySelectorAll('[data-compass-pip]')].filter(shown).map((el) => ({ kind: el.getAttribute('data-compass-pip'), ...box(el) })),
  };
});

/** Log every toast added from now on (the new markup's key, else a toast recognised by the dusk words). */
const installToastLog = (page) => page.evaluate((src) => {
  const words = new RegExp(src);
  const log = [];
  window.__lookbookToasts = log;
  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (!(n instanceof Element)) continue;
        const keyed = n.matches('[data-testid="notification"]') ? [n] : [...n.querySelectorAll('[data-testid="notification"]')];
        for (const el of keyed) log.push({ key: el.getAttribute('data-notification-key'), text: el.textContent });
        if (keyed.length === 0 && words.test(n.textContent || '') && (n.textContent || '').length < 200) log.push({ key: null, text: n.textContent });
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}, DUSK_WORDS.source);

const duskCount = (page) => page.evaluate((src) => (window.__lookbookToasts || []).filter((x) => x.key === 'notice.dusk' || new RegExp(src).test(x.text)).length, DUSK_WORDS.source);

/** The dusk toast and the dial as boxes, in either build's markup. */
const duskBoxes = (page) => page.evaluate((src) => {
  const words = new RegExp(src);
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; };
  const toast = document.querySelector('[data-notification-key="notice.dusk"]')
    || [...document.querySelectorAll('.absolute.right-4 > div')].find((el) => words.test(el.textContent || ''));
  const dial = document.querySelector('[data-testid="day-phase-dial"]') || document.querySelector('.absolute.top-14.right-4');
  return { toast: box(toast), dial: box(dial), text: toast ? toast.textContent : null };
}, DUSK_WORDS.source);

const intersects = (a, b) => !!(a && b) && !(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y);

/** Shoot the hud set into `dir`; `prep` clears hostiles and holds input before a frame. Returns the report's `hud`. */
export async function shootHudSet(page, dir, { prep, settleMs = 1500 }) {
  const out = { compass: null, dusk: [] };
  // COMPASS: HOME and Mara a few degrees apart.
  const mara = await page.evaluate(() => (window.__craftyLookbook.mobs() || []).find((m) => /^Mara/.test(m.npc || '')) || null);
  if (!mara) {
    out.compass = { why: 'Mara is not in the world (the seam lists no NPC named Mara)' };
  } else {
    const at = clusterStand(mara.position[0], mara.position[2]);
    const gy = await page.evaluate(({ x, z }) => window.useGameStore.getState().getMobGroundLevel?.(x, z), at);
    await page.evaluate((p) => window.__craftyLookbook.stand(p), { position: [at.x, (Number.isFinite(gy) ? gy : 60) + 1.5, at.z] });
    await delay(settleMs);
    await page.evaluate((h) => window.__craftyLookbook.look(h), { heading: at.heading, pitch: 0 });
    await page.evaluate(() => window.__craftyLookbook.setCycle(0.25));
    await prep();
    await delay(1000);
    const strip = await readStrip(page);
    await page.screenshot({ path: join(dir, 'hud-compass.png') });
    out.compass = { file: 'hud-compass.png', stand: [at.x, at.z], heading: at.heading, pooled: strip.pooled, labels: strip.labels.map((l) => l.text),
      pips: strip.pips.map((p) => p.kind), overlaps: overlappingPairs(strip.labels) };
  }
  // DUSK: en, then a night, zh-CN and the next dusk.
  await installToastLog(page);
  for (const [locale, dayStart, file] of [['en', 0, 'hud-dusk-en.png'], ['zh-CN', HALF_CYCLE_UNITS * 2, 'hud-dusk-zh.png']]) {
    await page.evaluate((l) => window.useGameStore.getState().setLocale?.(l), locale);
    const before = await duskCount(page);
    await prep();
    await page.evaluate((t) => window.useGameStore.setState({ gameTime: t, isDay: true }), dayStart + DUSK_EDGE - 8);
    let seen = false;
    for (let i = 0; i < 40 && !seen; i++) { await delay(500); seen = (await duskCount(page)) > before; }
    const boxes = await duskBoxes(page);
    if (seen) await page.screenshot({ path: join(dir, file) });
    await delay(6000); // still in the window: a second warning would land here
    const count = (await duskCount(page)) - before;
    out.dusk.push({ locale, file: seen ? file : null, count, text: boxes.text, coversDial: intersects(boxes.toast, boxes.dial), boxes });
    // A night re-arms the watcher for the next dusk.
    await page.evaluate((t) => window.useGameStore.setState({ gameTime: t, isDay: false }), dayStart + HALF_CYCLE_UNITS * 1.5);
    await delay(2500);
  }
  await page.evaluate(() => window.useGameStore.getState().setLocale?.('en'));
  return out;
}
