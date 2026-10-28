// _lookbook.mjs — the PURE half of the lookbook probe (scripts/visual/lookbook.mjs): the shot set, the targets, the
// Chromium launch candidates, the real-GPU test, the per-shot validity verdict and the contact sheet. No browser and no
// server here, so a gate drives every decision (tests/gates/lookbook-plan-gates.test.js). Leading underscore: a helper,
// not a probe — it binds no port (tests/scripts/probe-ports.test.js classifies by what a file does).

/** The programme's four times of day, as DAWN-origin cycle fractions (game/dayPhase.cycleFraction: 0 dawn, 0.25 noon,
 *  0.5 dusk, 0.75 midnight) — roadmap move 4's "cycle 0.30, 0.48, 0.55, 0.75": afternoon, golden hour, blue hour,
 *  midnight. */
export const LOOKBOOK_CYCLES = Object.freeze([0.30, 0.48, 0.55, 0.75]);

/** The index chunk an index.html loads (`index-<hash>.js`), or null. Its content hash is the build's identity. */
export function indexChunkOf(html) {
  return (String(html ?? '').match(/assets\/(index-[\w-]+\.js)/) || [])[1] || null;
}

/**
 * Is the server on the port serving THIS build? Every lookbook in every worktree shares one port, and vite's
 * --strictPort fails silently when another run holds it, so a ready port can be someone else's build. Returns null when
 * the served page loads the expected chunk, else the reason to stop.
 */
export function servedBuildProblem(servedHtml, expectedChunk) {
  const served = indexChunkOf(servedHtml);
  if (!expectedChunk) return 'the build to serve has no index chunk in its index.html';
  if (served === expectedChunk) return null;
  return `the port serves ${served ?? 'a page with no index chunk'}, not this build's ${expectedChunk}: another run holds the port`;
}

/**
 * `--cycles 0.02,0.25,0.5` as the times to shoot: dawn-origin cycle fractions in [0, 1), each named at most once, since
 * the file names carry two decimals. Absent (null or empty) is LOOKBOOK_CYCLES. Anything else throws, naming it: a
 * mistyped time must stop the run, never shoot a different set.
 */
export function parseCycles(arg) {
  if (arg === null || arg === undefined || arg === '') return LOOKBOOK_CYCLES;
  const parts = String(arg).split(',').map((s) => s.trim());
  const out = parts.map((s) => {
    const c = /^\d*\.?\d+$/.test(s) ? Number(s) : NaN;
    if (!(c >= 0 && c < 1)) throw new Error(`--cycles: "${s}" is not a cycle fraction in [0, 1)`);
    return c;
  });
  const names = out.map((c) => c.toFixed(2));
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) throw new Error(`--cycles: ${dup} is named twice (file names carry two decimals)`);
  return Object.freeze(out);
}

/**
 * The four places. Seed 12345 is fixed (world/terrain.worker.js), so these are the same ground on every build.
 *   hearth, coast, snow-terrace — the capture harness's own poses (capture.mjs, the hearth / ocean-coast / biome-snow
 *     states), so a lookbook frame and a regression frame of one place can be set side by side;
 *   forest-edge — located from the generator itself (climate.surfaceBlockAt over a grid): forest at z <= 58 for
 *     x 12..64, plains to the south; the camera stands ~12 m above the plains looking north at the tree line.
 */
export const LOOKBOOK_PLACES = Object.freeze([
  { id: 'hearth', position: [13, 81, 13], lookAt: [0, 51, 0] },
  { id: 'forest-edge', position: [36, 56, 92], lookAt: [36, 47, 50] },
  { id: 'coast', position: [-60, 78, 40], lookAt: [-110, 22, -6] },
  { id: 'snow-terrace', position: [20, 82, -20], lookAt: [0, 54, -40] },
]);

/** Chromium desktop at Kevin's laptop's shape, and WebKit (the engine iOS Safari runs) at both iPad Air viewports. */
export const TARGETS = Object.freeze([
  { id: 'chromium-1280x800', engine: 'chromium', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, touch: false },
  { id: 'webkit-1180x820', engine: 'webkit', viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, touch: true },
  { id: 'webkit-820x1180', engine: 'webkit', viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, touch: true },
]);

/**
 * Chromium launches to try, in order, until one gives the GAME a hardware renderer. Playwright runs the
 * `chromium-headless-shell` binary for plain `headless: true`, and the full Chromium in "new headless" mode for
 * `channel: 'chromium'` (playwright-core 1.64.1 `getExecutableName`; Playwright docs, "Chromium: new headless mode").
 * Which of them reaches ANGLE-on-Metal on a given Mac is MEASURED per run, never assumed: the probe records every
 * candidate's renderer string. The headless shell stays last as the control the others are compared with.
 */
export const CHROMIUM_CANDIDATES = Object.freeze([
  { id: 'new-headless', launch: { channel: 'chromium', headless: true } },
  { id: 'new-headless+metal', launch: { channel: 'chromium', headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] } },
  { id: 'headless-shell', launch: { headless: true } },
]);

/** How far the live clock may drift from the asked-for time (cycle fraction; 0.01 is 4.8 s of the 480 s day). */
export const CYCLE_TOLERANCE = 0.01;

/** Every shot, place-major: [{ place, cycle, file }]. */
export function shotPlan(places = LOOKBOOK_PLACES, cycles = LOOKBOOK_CYCLES) {
  const out = [];
  for (const p of places) for (const c of cycles) out.push({ place: p.id, cycle: c, file: `${p.id}-${c.toFixed(2)}.png` });
  return out;
}

/**
 * THE EYE-LEVEL SET: what a player sees, standing at the Hearth (the spawn, read from the live body once the world
 * settles, because the spawn settle decides it), with the hands and the HUD on. Three compass bearings a third of
 * the horizon apart (HUD compass convention: 0 north, clockwise), so at the game's 75 degree vertical fov, about 100
 * degrees across at 16:10, the three frames see nearly all the way round. A level gaze.
 */
export const EYE_HEADINGS = Object.freeze([0, 120, 240]);
export const EYE_PITCH = 0;
/** How far the camera may face from the asked-for bearing, in degrees. */
const HEADING_TOLERANCE = 1;
/** How far, horizontally, the body may be from where stand() put it. A body that was never stood, or walked off, is
 *  metres away; one that settled onto the ground is not, so the height is not compared. */
const STAND_TOLERANCE_M = 0.5;
/** A hostile closer than this to the eye fills much of the frame: the shot is a fight, not the view. */
export const OBSTRUCTION_M = 3;

/** Every eye-level shot, time-major (one clock jump per time): [{ heading, cycle, file }]. */
export function eyeShotPlan(headings = EYE_HEADINGS, cycles = LOOKBOOK_CYCLES) {
  const out = [];
  for (const c of cycles) {
    for (const h of headings) out.push({ heading: h, cycle: c, file: `eye-${String(h).padStart(3, '0')}-${c.toFixed(2)}.png` });
  }
  return out;
}

/**
 * THE WALKING CLIPS: W held for 4 s from the Hearth along one bearing, a real key through the browser's input
 * pipeline, once per programme time. Bearing 180 crosses open plains for at least 48 m, while forest starts 12 to 20 m
 * out on bearings 150 to 165, to the left of the view (world/climate.js surfaceBlockAt, seed 12345): an open path with
 * foliage at mid distance, where texture shimmer shows. Bearing 120, toward the nearer forest, walks into tree canopy.
 */
export const WALK_MS = 4000;
const WALK_HEADING = 180;
/** A 4 s walk covers several metres; less than this means the key did not move the player. */
export const MIN_WALK_M = 2;

/** The clips, one per time: [{ cycle, heading, ms, file }]. */
export function clipPlan(cycles = LOOKBOOK_CYCLES, heading = WALK_HEADING) {
  return cycles.map((c) => ({ cycle: c, heading, ms: WALK_MS, file: `walk-${c.toFixed(2)}.mp4` }));
}

const circularDeg = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

/** Why the body is not where stand() put it, or null. */
function offStand(body, stand, when) {
  const d = Array.isArray(body) && Array.isArray(stand) ? Math.hypot(body[0] - stand[0], body[2] - stand[2]) : NaN;
  return d <= STAND_TOLERANCE_M ? null : `the body ${Number.isFinite(d) ? d.toFixed(2) : '?'} m from the stand ${when}`;
}

/** Why a heading reading is not the asked-for bearing, or null. */
function offHeading(reading, heading, when) {
  const at = Number(reading);
  if (reading != null && Number.isFinite(at) && circularDeg(at, heading) <= HEADING_TOLERANCE) return null;
  return `facing ${reading != null && Number.isFinite(at) ? at.toFixed(1) : '?'}${when}, asked ${heading}`;
}

/**
 * Whether an eye-level shot shows what a player sees: everything shotVerdict asks, plus no hero pose pinned, no
 * hostile in the player's face, the hands on the camera (more nodes on it than the same page measured with them
 * hidden: `handsBaseline`), the HUD on screen, the body where it was stood (`stand`, the resting body read once per
 * target), and the camera facing the asked-for bearing. A frame that passes still wants looking at: the hands count
 * says they are mounted, not that they are inside the frame.
 */
export function eyeShotVerdict({ cycle, heading, stand, before, after, handsBaseline, hud }) {
  const why = [...shotVerdict({ cycle, before, after }).why];
  if (after?.pose) why.push('camera pinned by a hero pose, not at the player\'s eye');
  const near = after?.hostiles?.nearestM;
  if (!after?.hostiles) why.push('hostiles not checked');
  else if (near != null && near < OBSTRUCTION_M) why.push(`a hostile ${near.toFixed(1)} m from the eye: a fight, not the view`);
  if (!Number.isFinite(handsBaseline)) why.push('hands not checked: no baseline with them hidden');
  else if (!(after?.cameraNodes > handsBaseline)) why.push(`hands not on the camera (${after?.cameraNodes} nodes; ${handsBaseline} with them hidden)`);
  if (hud !== true) why.push('HUD not on screen');
  const stood = offStand(after?.body, stand, 'at the shot');
  if (stood) why.push(stood);
  const facing = offHeading(after?.heading, heading, '');
  if (facing) why.push(facing);
  return { valid: why.length === 0, why };
}

/**
 * Whether a walking clip shows the walk it claims: from where the body was stood (`stand`), along `heading` from the
 * first frame to the last, far enough to be a walk. `start` / `end`: the seam's info() just before the key went down
 * and just after it came up. The clock check is on `start`: a 4 s clip spans more of the day than CYCLE_TOLERANCE by
 * design.
 */
export function clipVerdict({ cycle, heading, stand, start, end, frames }) {
  const why = [];
  if (!start?.active || !end?.active) why.push('input not live');
  const stood = offStand(start?.body, stand, 'when the key went down');
  if (stood) why.push(stood);
  for (const [r, when] of [[start?.heading, ' at the start'], [end?.heading, ' at the end']]) {
    const facing = offHeading(r, heading, when);
    if (facing) why.push(facing);
  }
  if (!end?.isAlive) why.push('player dead');
  const a = start?.body, b = end?.body;
  const movedM = a && b ? Math.hypot(b[0] - a[0], b[2] - a[2]) : NaN;
  if (!(movedM >= MIN_WALK_M)) why.push(`the player moved ${Number.isFinite(movedM) ? movedM.toFixed(2) : '?'} m`);
  const at = Number(start?.cycle);
  if (!Number.isFinite(at) || circular(at, cycle) > CYCLE_TOLERANCE) why.push(`clock at ${Number.isFinite(at) ? at.toFixed(4) : '?'}, asked ${cycle}`);
  if (!(frames > 0)) why.push('no video frames');
  return { valid: why.length === 0, why, movedM };
}

/** The segment that draws the world itself (postprocessing's RenderPass, pass 0), not a post-processing pass. */
const SCENE_RE = /^\d+:RenderPass$/;
const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * The game canvas's pass times out of a passTimes() report: the context whose canvas is the game's (the seam's
 * glInfo canvas), else the largest. Per timed frame, from every result that landed in the window, so a pass rebuilt
 * mid-window (a tier first mounting N8AO or GodRays) counts each frame once, under whichever label drew it: `sceneMs`, the
 * RenderPass that draws the world, and `postMs`, every segment after it. `plausible` is false when the results sum to
 * more GPU time (`gpuMs`) than the window lasted (`windowMs`): segments that run one after another cannot, so the
 * numbers are then not GPU execution times and no decision about a pass may rest on them.
 */
export function passSummary(report, gameCanvas) {
  const none = (reason) => ({ available: false, reason, sceneMs: null, postMs: null, plausible: null, passes: [] });
  if (!report || report.installed !== true) return none(report?.reason || 'pass timer not installed');
  const same = (c) => Array.isArray(c) && Array.isArray(gameCanvas) && c[0] === gameCanvas[0] && c[1] === gameCanvas[1];
  const area = (c) => (Array.isArray(c) ? c[0] * c[1] : 0);
  const ctxs = report.contexts || [];
  const ctx = ctxs.find((x) => same(x.canvas)) || [...ctxs].sort((x, y) => area(y.canvas) - area(x.canvas))[0];
  if (!ctx) return none('no composer has rendered');
  if (!ctx.available) return none(ctx.reason);
  const passes = ctx.passes.map(({ label, n, meanMs, p50Ms, maxMs, count, sumMs }) => ({ label, n, meanMs, p50Ms, maxMs, count, sumMs }));
  const base = { available: true, passes, frames: ctx.frames, framesTimed: ctx.framesTimed, windowMs: ctx.windowMs, disjoint: ctx.disjoint, skipped: ctx.skipped };
  if (passes.length === 0) return { ...base, reason: 'no samples in the window', sceneMs: null, postMs: null, plausible: null };
  if (!(ctx.framesTimed > 0) || !Number.isFinite(ctx.windowMs) || !passes.every((p) => Number.isFinite(p.sumMs))) {
    return { ...base, reason: 'the timer reports no window: whether these are GPU times cannot be checked', sceneMs: null, postMs: null, plausible: false };
  }
  const sum = (ps) => ps.reduce((s, p) => s + p.sumMs, 0);
  const gpuMs = sum(passes);
  const sceneSum = sum(passes.filter((p) => SCENE_RE.test(p.label)));
  const plausible = gpuMs <= ctx.windowMs;
  return {
    ...base,
    reason: plausible ? null : `IMPLAUSIBLE: ${r3(gpuMs)} ms of GPU time in a ${r3(ctx.windowMs)} ms window, so these are not GPU execution times`,
    gpuMs: r3(gpuMs),
    sceneMs: r3(sceneSum / ctx.framesTimed),
    postMs: r3((gpuMs - sceneSum) / ctx.framesTimed),
    plausible,
  };
}

const SOFTWARE_RE = /swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render/i;
const NAMES_NO_DEVICE_RE = /^(webkit webgl|unknown|no webgl2?)$/i;

/**
 * 'software' | 'hardware' | 'unknown' for a GL renderer string. WebKit masks the renderer as "Apple GPU" — a hardware
 * renderer (WebKit's WebGL on macOS and iPadOS is ANGLE-on-Metal), so it classifies as such. A string that names no
 * device at all is 'unknown', never 'hardware': an instrument that cannot tell must not say yes.
 */
export function classifyRenderer(s) {
  if (typeof s !== 'string') return 'unknown';
  const v = s.trim();
  if (!v || NAMES_NO_DEVICE_RE.test(v)) return 'unknown';
  if (SOFTWARE_RE.test(v)) return 'software';
  return 'hardware';
}

/** The first launch result whose renderer is hardware, or null. `results`: [{ id, renderer?, error? }]. */
export function pickCandidate(results) {
  return results.find((r) => classifyRenderer(r.renderer) === 'hardware') || null;
}

const circular = (a, b) => {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d);
};

/**
 * Whether a shot shows the game it claims to show. `before` / `after`: the seam's info() read just before and just
 * after the screenshot. Each failure is named, because "invalid" alone sends the reader back to the frame to guess.
 */
export function shotVerdict({ cycle, before, after }) {
  const why = [];
  if (!before?.active || !after?.active) why.push('input not live (an overlay may cover the world)');
  if (!after?.isAlive) why.push('player dead (death screen)');
  if (!after?.worldBuilt) why.push('world not built');
  const at = Number(after?.cycle);
  if (!Number.isFinite(at) || circular(at, cycle) > CYCLE_TOLERANCE) why.push(`clock at ${Number.isFinite(at) ? at.toFixed(4) : '?'}, asked ${cycle}`);
  if ((after?.contextLosses ?? 0) !== (before?.contextLosses ?? 0)) why.push('context lost during the shot');
  return { valid: why.length === 0, why };
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/**
 * The contact sheet: one section per target (its renderer, classified, and any COULD NOT MEASURE notes), one figure
 * per shot linking its PNG, with the facts recorded for it. Self-contained HTML; image paths are relative to the
 * output directory (`<target id>/<file>`).
 */
export function contactSheetHtml(report) {
  const sections = (report.targets || []).map((t) => {
    const gpuNote = t.gpu === 'software'
      ? '<p class="warn">SOFTWARE renderer: these frames are NOT real-GPU frames and cannot judge looks.</p>'
      : t.gpu === 'unknown' ? '<p class="warn">Renderer UNKNOWN: whether these are real-GPU frames is not established.</p>' : '';
    const notes = (t.notes || []).map((n) => `<p class="warn">${esc(n)}</p>`).join('');
    const passNote = (p) => {
      if (!p) return '';
      if (p.postMs == null) return ` · post ms: ${esc(p.reason)}`;
      const ms = ` · scene ${esc(p.sceneMs)} ms · post ${esc(p.postMs)} ms`;
      return p.plausible ? ms : `${ms} <span class="bad">${esc(p.reason)}</span>`;
    };
    const figure = (s, title, alt) => {
      const src = `${esc(t.id)}/${esc(s.file)}`;
      const facts = [`cycle ${esc(s.cycle)} (at ${esc(Number(s.cycleAtShot).toFixed(3))})`, `tier ${esc(s.tier)}`, `dpr ${esc(s.dpr)}`, `console errors ${esc(s.consoleErrors)}`].join(' · ');
      const bad = s.valid ? '' : `<p class="bad">INVALID: ${esc((s.why || []).join('; '))}</p>`;
      return `<figure class="${s.valid ? 'ok' : 'invalid'}"><a href="${src}"><img src="${src}" alt="${esc(alt)}" loading="lazy"></a>` +
        `<figcaption><b>${esc(title)}</b> · ${facts}${passNote(s.passMs)}${bad}</figcaption></figure>`;
    };
    const figs = (t.shots || []).map((s) => figure(s, s.place, `${s.place} at ${s.cycle}`)).join('\n');
    const eye = (t.eye || []).map((s) => figure(s, `eye, facing ${s.heading}`, `eye level facing ${s.heading} at ${s.cycle}`)).join('\n');
    const clips = (t.clips || []).map((c) => {
      const src = `${esc(t.id)}/${esc(c.file)}`;
      const facts = [`cycle ${esc(c.cycle)}`, `facing ${esc(c.heading)}`, `walked ${esc(Number(c.movedM).toFixed(1))} m`, `${esc(c.frames)} frames`].join(' · ');
      const bad = c.valid ? '' : `<p class="bad">INVALID: ${esc((c.why || []).join('; '))}</p>`;
      return `<figure class="${c.valid ? 'ok' : 'invalid'}"><video src="${src}" controls muted loop playsinline preload="metadata"></video>` +
        `<figcaption><b>walk</b> · ${facts}${passNote(c.passMs)}${bad}</figcaption></figure>`;
    }).join('\n');
    const sub = (title, body) => (body ? `<h3>${title}</h3><div class="grid">${body}</div>` : '');
    return `<section><h2>${esc(t.id)}</h2><p class="gl">${esc(t.engine)} · GL renderer: <code>${esc(t.renderer)}</code> (${esc(t.gpu)})` +
      `${t.launch ? ` · launch ${esc(t.launch)}` : ''}${t.entry ? ` · entered play by ${esc(t.entry)}` : ''}</p>${gpuNote}${notes}` +
      `${sub('Hero shots', figs)}${sub('Eye level, hands and HUD on', eye)}${sub('Walking, real input', clips)}</section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Crafty lookbook</title>
<style>
:root { --bg: #101216; --fg: #e9e9ee; --muted: #9aa0ab; --warn: #f2b84b; --bad: #ff6b6b; --card: #1a1d23; }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.45 system-ui, sans-serif; }
h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 24px 0 4px; } h3 { font-size: 14px; margin: 16px 0 6px; }
.meta, .gl { color: var(--muted); } code { color: var(--fg); }
.warn { color: var(--warn); } .bad { color: var(--bad); margin: 4px 0 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 12px; }
figure { margin: 0; background: var(--card); border-radius: 6px; overflow: hidden; }
figure.invalid { outline: 2px solid var(--bad); }
img, video { display: block; width: 100%; height: auto; }
figcaption { padding: 6px 8px; color: var(--muted); font-size: 12px; } figcaption b { color: var(--fg); }
</style></head><body>
<h1>Crafty lookbook</h1>
<p class="meta">Production build, motion on (weather, mobs, particles live). Generated ${esc(report.generatedAt)}. An instrument, not a gate: judge the frames by eye.</p>
${sections}
</body></html>
`;
}
