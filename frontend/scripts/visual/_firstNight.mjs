// _firstNight.mjs — the First Night probe's decisions (first-night.mjs; the W3-A brief's acceptance 2; DECISIONS
// 2026-11-01 (W3-A PR C) items 484 and 489): what each beat must show and by when, the beats one tick of readings adds
// to the log, the pressure band a lived night must sit in, the verdict over a run's beat log and pressure numbers, the
// exit code a run ends with, and the pointer step that turns the eye toward a point. No browser, no server and no file
// writes, so a gate drives every decision (tests/gates/first-night-verdict-gates.test.js). It also holds the page
// function that logs the notices shown, which the probe and tests/e2e/first-night.spec.js both install. Leading
// underscore: a helper, not a probe; it binds no port.
import { LOOK_BASE_SENSITIVITY } from '../../src/input/touchMath.js';

/** A run that could not reach a verdict for a reason outside the game's play: no build, no seam, no renderer. */
export class CouldNotCheck extends Error {}

/** How a run ends: every beat and number held, a miss, the probe itself failed (no verdict), or COULD NOT CHECK. */
export const EXIT = Object.freeze({ pass: 0, miss: 1, crashed: 2, couldNotCheck: 3 });

/** The exit code for an error a run ended on: a crash is not a verdict on the game, so it is never the miss code. */
export const exitCodeFor = (e) => (e instanceof CouldNotCheck ? EXIT.couldNotCheck : EXIT.crashed);

/** The siege horn's notices (game/dayNight.js siegeWarning: notice.siege.first and the tiers after it). */
export const isHornKey = (key) => /^notice\.siege\./.test(String(key));

/**
 * IN THE PAGE, before its scripts (`page.addInitScript(installNoticeLog)`): log every notification the page shows into
 * `window.__fnNotices`, `{ key, id, at }` in order, once per notice. The stack and the boss bar's line carry the
 * channel's id (QuestSystem.jsx NotificationStack, ui/BossHealthBar.jsx as `data-notification-id`), so a toast mounted
 * again (a single line handing back to it, a layout change, the bar taking the line) is not counted twice; an element
 * from a build without the id counts each time it is added. Plain-string notices carry no key and are not logged.
 * Self-contained, because Playwright serialises it into the page.
 */
export function installNoticeLog() {
  const log = [];
  const seen = new Set();
  window.__fnNotices = log;
  const take = (el) => {
    const key = el.getAttribute?.('data-notification-key');
    if (!key) return;
    const id = el.getAttribute('data-notification-id');
    if (id !== null) {
      if (seen.has(id)) return;
      seen.add(id);
    }
    log.push({ key, id, at: performance.now() });
  };
  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (!(n instanceof Element)) continue;
        take(n);
        for (const el of n.querySelectorAll('[data-notification-key]')) take(el);
      }
    }
  }).observe(document, { childList: true, subtree: true });
}

/**
 * PURE. The beats one tick adds to the run's log, from the reading before (`prev`, null on the first) and this one
 * (`cur`): each `{ t, n, horns }`, `t` real seconds since the game clock started, `n` the seam's night(), `horns` how
 * many siege notices the page has shown so far. Transitions only: the kindle needs a cold reading before a lit one, the
 * horn is the notice and never the clock's flip (which logs as `dusk`), and nothing is read off the first tick.
 */
export function tickBeats(prev, cur) {
  if (!prev || !cur) return [];
  const out = [];
  const { t, n } = cur;
  if (prev.n.hearthLit === false && n.hearthLit === true) out.push({ beat: 'kindle', t });
  for (let k = prev.horns; k < cur.horns; k++) out.push({ beat: 'horn', t, night: n.nightCount, clock: n.gameTime });
  if (prev.n.isDay === true && n.isDay === false) out.push({ beat: 'dusk', t, night: n.nightCount, clock: n.gameTime });
  if (prev.n.isDay === false && n.isDay === true) out.push({ beat: 'dawn', t, night: n.nightCount, clock: n.gameTime });
  const wave = n.siege?.wave ?? 0;
  if (wave > (prev.n.siege?.wave ?? 0)) out.push({ beat: 'wave', t, wave });
  return out;
}

/** The beats, timed in real seconds from the game clock's start: the world built and play live (dayNight.js
 *  shouldAdvanceClock), not the Start click, since the clock waits for both (brief, acceptance 2: fresh, real time). */
export const FIRST_NIGHT_BEATS = Object.freeze([
  Object.freeze({ id: 'kindle', by: 60, says: 'the Hearth lit by 1:00' }),
  Object.freeze({ id: 'horn', at: 240, within: 3, says: 'one dusk horn, at 4:00 plus or minus 3 s' }),
  Object.freeze({ id: 'beast', heldSec: 13.5, says: 'the beast held in third person for 13.5 s or more' }),
  Object.freeze({ id: 'dawn', by: 485, says: 'dawn by 8:05' }),
]);

/** The pressure a lived night must put on the player (brief, acceptance 2). Health is a share of the maximum. */
export const PRESSURE_BAND = Object.freeze({ lowestHealth: Object.freeze([0.3, 0.85]), engagedSec: 60 });

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** Each beat a run's log ([{ beat, t, ... }], t in seconds from the clock's start) showed or missed: [{ id, ok, why }]. */
export function beatVerdicts(log, beats = FIRST_NIGHT_BEATS) {
  const of = (id) => (log || []).filter((e) => e && e.beat === id);
  return beats.map((b) => {
    const seen = of(b.id);
    if (b.id === 'beast') {
      const held = Math.max(0, ...seen.map((e) => Number(e.heldSec) || 0));
      return { id: b.id, ok: held >= b.heldSec, why: seen.length ? `held ${held.toFixed(1)} s (${b.says})` : `never entered (${b.says})` };
    }
    if (!seen.length) return { id: b.id, ok: false, why: `never seen (${b.says})` };
    const t = seen[0].t;
    if (b.at !== undefined) {
      const ok = seen.length === 1 && Math.abs(t - b.at) <= b.within;
      return { id: b.id, ok, why: `${seen.length} at ${seen.map((e) => fmt(e.t)).join(', ')} (${b.says})` };
    }
    return { id: b.id, ok: t <= b.by, why: `at ${fmt(t)} (${b.says})` };
  });
}

/**
 * The flame's place in the verdict. Switched off by the run's declaration (`flameOff`: H1's FLAME_DRAIN 0 night, or the
 * flame cut, each recorded in DECISIONS), it must not have dipped, and the night is judged on health and engagement; a
 * dip under the declaration is a miss, since the declaration is then false. Otherwise it must dip (below 1) and hold
 * (above 0 at dawn), and a build without one is a miss, said so, never a pass.
 */
function flameVerdict(p) {
  const flame = p?.flameLow;
  const dipped = Number.isFinite(flame) && flame < 1;
  if (p?.flameOff === true) {
    return {
      id: 'flame',
      ok: !dipped,
      why: dipped ? `declared off (--flame-off), but the flame dipped to ${flame.toFixed(2)}: the declaration is false`
        : 'declared off (--flame-off): no dip to read, so the night is judged on health and engagement',
    };
  }
  return {
    id: 'flame',
    ok: dipped && Number(p?.flameAtDawn) > 0,
    why: Number.isFinite(flame) ? `the flame's low ${flame.toFixed(2)}, ${Number(p?.flameAtDawn) > 0 ? 'held' : 'out'} at dawn (it must dip and hold)` : 'no Hearth flame in this build to dip and hold',
  };
}

/**
 * The pressure numbers in or out of the band: [{ id, ok, why }]. `p`: { lowestHealth (a share, 0-1), engagedSec,
 * flameLow (the Hearth flame's lowest, 0-1, or null where the build has no flame), flameAtDawn, flameOff (the run's
 * declaration that the flame is switched off) }.
 */
export function pressureVerdict(p, band = PRESSURE_BAND) {
  const [lo, hi] = band.lowestHealth;
  const h = p?.lowestHealth;
  return [
    { id: 'lowestHealth', ok: Number.isFinite(h) && h >= lo && h <= hi, why: `lowest health ${Number.isFinite(h) ? `${Math.round(h * 100)} %` : 'unread'} (band ${lo * 100}-${hi * 100} %)` },
    { id: 'engaged', ok: Number(p?.engagedSec) >= band.engagedSec, why: `${Number(p?.engagedSec || 0).toFixed(0)} s engaged (at least ${band.engagedSec} s)` },
    flameVerdict(p),
  ];
}

/** The run's verdict: ok only when every beat and every pressure number holds. `lines` says each, misses first. */
export function firstNightVerdict({ log, pressure }) {
  const beats = beatVerdicts(log);
  const press = pressureVerdict(pressure);
  const all = [...beats.map((v) => ({ ...v, kind: 'beat' })), ...press.map((v) => ({ ...v, kind: 'pressure' }))];
  const lines = [...all.filter((v) => !v.ok), ...all.filter((v) => v.ok)].map((v) => `${v.ok ? 'ok  ' : 'MISS'} ${v.kind} ${v.id}: ${v.why}`);
  return { ok: all.every((v) => v.ok), beats, pressure: press, lines };
}

const DEG = Math.PI / 180;
const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/**
 * The mouse move, in pixels, that turns a camera at `from` ({ heading, pitch }, compass degrees: 0 north, clockwise;
 * pitch up positive) toward `to`, under the game's own mouse look (input/pointerLook.js through input/touchMath.js
 * applyLook: yaw -= dx * k, pitch -= dy * k, k = LOOK_BASE_SENSITIVITY * sensitivity), at most `maxPx` a step on each
 * axis, so a run turns as a hand does rather than in one jump.
 */
export function aimStep(from, to, { sensitivity = 1, maxPx = 160 } = {}) {
  const k = LOOK_BASE_SENSITIVITY * sensitivity;
  const clamp = (v) => Math.max(-maxPx, Math.min(maxPx, v));
  return {
    dx: clamp((wrapDeg(to.heading - from.heading) * DEG) / k),
    dy: clamp((-(to.pitch - from.pitch) * DEG) / k),
  };
}
