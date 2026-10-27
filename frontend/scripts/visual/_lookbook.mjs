// _lookbook.mjs — the PURE half of the lookbook probe (scripts/visual/lookbook.mjs): the shot set, the targets, the
// Chromium launch candidates, the real-GPU test, the per-shot validity verdict and the contact sheet. No browser and no
// server here, so a gate drives every decision (tests/gates/lookbook-plan-gates.test.js). Leading underscore: a helper,
// not a probe — it binds no port (tests/scripts/probe-ports.test.js classifies by what a file does).

/** The programme's four times of day, as DAWN-origin cycle fractions (game/dayPhase.cycleFraction: 0 dawn, 0.25 noon,
 *  0.5 dusk, 0.75 midnight) — roadmap move 4's "cycle 0.30, 0.48, 0.55, 0.75": afternoon, golden hour, blue hour,
 *  midnight. */
export const LOOKBOOK_CYCLES = Object.freeze([0.30, 0.48, 0.55, 0.75]);

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

/** How far the live clock may drift from the asked-for time (cycle fraction; 0.01 is 3 s of a 300 s day). */
export const CYCLE_TOLERANCE = 0.01;

/** Every shot, place-major: [{ place, cycle, file }]. */
export function shotPlan(places = LOOKBOOK_PLACES, cycles = LOOKBOOK_CYCLES) {
  const out = [];
  for (const p of places) for (const c of cycles) out.push({ place: p.id, cycle: c, file: `${p.id}-${c.toFixed(2)}.png` });
  return out;
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
    const figs = (t.shots || []).map((s) => {
      const src = `${esc(t.id)}/${esc(s.file)}`;
      const facts = [`cycle ${esc(s.cycle)} (at ${esc(Number(s.cycleAtShot).toFixed(3))})`, `tier ${esc(s.tier)}`, `dpr ${esc(s.dpr)}`, `console errors ${esc(s.consoleErrors)}`].join(' · ');
      const bad = s.valid ? '' : `<p class="bad">INVALID: ${esc((s.why || []).join('; '))}</p>`;
      return `<figure class="${s.valid ? 'ok' : 'invalid'}"><a href="${src}"><img src="${src}" alt="${esc(s.place)} at ${esc(s.cycle)}" loading="lazy"></a>` +
        `<figcaption><b>${esc(s.place)}</b> · ${facts}${bad}</figcaption></figure>`;
    }).join('\n');
    return `<section><h2>${esc(t.id)}</h2><p class="gl">${esc(t.engine)} · GL renderer: <code>${esc(t.renderer)}</code> (${esc(t.gpu)})` +
      `${t.launch ? ` · launch ${esc(t.launch)}` : ''}${t.entry ? ` · entered play by ${esc(t.entry)}` : ''}</p>${gpuNote}${notes}<div class="grid">${figs}</div></section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Crafty lookbook</title>
<style>
:root { --bg: #101216; --fg: #e9e9ee; --muted: #9aa0ab; --warn: #f2b84b; --bad: #ff6b6b; --card: #1a1d23; }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.45 system-ui, sans-serif; }
h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 16px; margin: 24px 0 4px; }
.meta, .gl { color: var(--muted); } code { color: var(--fg); }
.warn { color: var(--warn); } .bad { color: var(--bad); margin: 4px 0 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 12px; }
figure { margin: 0; background: var(--card); border-radius: 6px; overflow: hidden; }
figure.invalid { outline: 2px solid var(--bad); }
img { display: block; width: 100%; height: auto; }
figcaption { padding: 6px 8px; color: var(--muted); font-size: 12px; } figcaption b { color: var(--fg); }
</style></head><body>
<h1>Crafty lookbook</h1>
<p class="meta">Production build, motion on (weather, mobs, particles live). Generated ${esc(report.generatedAt)}. An instrument, not a gate: judge the frames by eye.</p>
${sections}
</body></html>
`;
}
