// _firstNight.mjs — the First Night probe's decisions (first-night.mjs; the W3-A brief's acceptance 2; DECISIONS
// 2026-11-01 (W3-A PR C) item 484): what each beat must show and by when, the pressure band a lived night must sit in,
// the verdict over a run's beat log and pressure numbers, and the pointer step that turns the eye toward a point. No
// browser, no server and no file writes, so a gate drives every decision (tests/gates/first-night-verdict-gates.test.js).
// Leading underscore: a helper, not a probe; it binds no port.
import { LOOK_BASE_SENSITIVITY } from '../../src/input/touchMath.js';

/** The beats, timed in real seconds from the Start click (brief, acceptance 2: fresh, real time). */
export const FIRST_NIGHT_BEATS = Object.freeze([
  Object.freeze({ id: 'kindle', by: 60, says: 'the Hearth lit by 1:00' }),
  Object.freeze({ id: 'horn', at: 240, within: 3, says: 'one dusk horn, at 4:00 plus or minus 3 s' }),
  Object.freeze({ id: 'beast', heldSec: 13.5, says: 'the beast held in third person for 13.5 s or more' }),
  Object.freeze({ id: 'dawn', by: 485, says: 'dawn by 8:05' }),
]);

/** The pressure a lived night must put on the player (brief, acceptance 2). Health is a share of the maximum. */
export const PRESSURE_BAND = Object.freeze({ lowestHealth: Object.freeze([0.3, 0.85]), engagedSec: 60 });

const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** Each beat a run's log ([{ beat, t, ... }], t in seconds from Start) showed or missed: [{ id, ok, why }]. */
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
 * The pressure numbers in or out of the band: [{ id, ok, why }]. `p`: { lowestHealth (a share, 0-1), engagedSec,
 * flameLow (the Hearth flame's lowest, 0-1, or null where the build has no flame), flameAtDawn }. The flame must dip
 * (below 1) and hold (above 0 at dawn); a build without one is a miss, said so, never a pass.
 */
export function pressureVerdict(p, band = PRESSURE_BAND) {
  const [lo, hi] = band.lowestHealth;
  const h = p?.lowestHealth;
  const flame = p?.flameLow;
  return [
    { id: 'lowestHealth', ok: Number.isFinite(h) && h >= lo && h <= hi, why: `lowest health ${Number.isFinite(h) ? `${Math.round(h * 100)} %` : 'unread'} (band ${lo * 100}-${hi * 100} %)` },
    { id: 'engaged', ok: Number(p?.engagedSec) >= band.engagedSec, why: `${Number(p?.engagedSec || 0).toFixed(0)} s engaged (at least ${band.engagedSec} s)` },
    {
      id: 'flame',
      ok: Number.isFinite(flame) && flame < 1 && Number(p?.flameAtDawn) > 0,
      why: Number.isFinite(flame) ? `the flame's low ${flame.toFixed(2)}, ${Number(p?.flameAtDawn) > 0 ? 'held' : 'out'} at dawn (it must dip and hold)` : 'no Hearth flame in this build to dip and hold',
    },
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
