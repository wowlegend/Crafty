// _media.mjs — the PURE half of the media pipeline (scripts/visual/media.mjs): the declared shot table, the byte
// budgets, the image size readers, the manifest check, the per-shot verdict, the og card and the encoder argv. No
// browser, no server and no file writes, so a gate drives every decision (tests/gates/media-plan-gates.test.js) and the
// committed files are checked with the same code (tests/scripts/media.test.js). Leading underscore: a helper, not a
// probe; it binds no port.

import { LOOKBOOK_CYCLES, LOOKBOOK_PLACES, OBSTRUCTION_M, classifyRenderer, shotVerdict, handCount } from './_lookbook.mjs';
import { BRAND } from '../../src/brand.js';

/** The lookbook's four times by name (its LOOKBOOK_CYCLES, dawn-origin cycle fractions, in the same order). */
export const MEDIA_TIMES = Object.freeze(Object.fromEntries(
  ['afternoon', 'golden hour', 'blue hour', 'midnight'].map((name, i) => [name, LOOKBOOK_CYCLES[i]]),
));

/** Ceilings, in bytes (1 KB = 1000 bytes): each JPEG, the og card, and everything under docs/media together. */
export const MEDIA_BUDGETS = Object.freeze({ jpgBytes: 350_000, ogPngBytes: 400_000, docsMediaBytes: 3_000_000 });
/** media.json shares the folder budget; the table's byte targets leave it this much. */
const MANIFEST_ALLOWANCE_BYTES = 20_000;

export const MEDIA_DIR = 'docs/media';
export const MEDIA_MANIFEST = 'docs/media/media.json';
const MEDIA_GENERATOR = 'frontend/scripts/visual/media.mjs';
/** The size every scraper documents for an og image (1.91:1); index.html's og tags state it. */
export const OG_CARD = Object.freeze({ file: 'frontend/public/og-image.png', width: 1200, height: 630 });
/** GitHub's documented social preview size (2:1). */
export const SOCIAL_PREVIEW = Object.freeze({ width: 1280, height: 640 });

const PURPOSES = ['hero', 'og', 'social', 'still'];
const RECIPE_KINDS = ['eye', 'pose', 'fight'];
const MAX_PITCH_DEG = 85; // the seam's look() refuses more (render/lookbookSeam.js)
const HEADING_TOLERANCE_DEG = 1;
const STAND_TOLERANCE_M = 0.5;

const deepFreeze = (o) => {
  for (const v of Object.values(o)) if (v && typeof v === 'object') deepFreeze(v);
  return Object.freeze(o);
};
const still = (name, time, recipe, alt, extra = {}) => ({
  name, purpose: 'still', time, recipe, size: [1600, 1000], format: 'jpg', out: `${MEDIA_DIR}/stills/${name}.jpg`,
  targetBytes: 250_000, alt, ...extra,
});

/**
 * THE SHOT TABLE, shot in this order. Recipes:
 *   eye    the player's own eye, stood at the Hearth where the spawn settles, turned to `heading` (compass degrees,
 *          0 north) and `pitch`, with the first-person hands on;
 *   pose   the camera pinned at a lookbook place (LOOKBOOK_PLACES), the hands hidden by the pose;
 *   fight  the eye at the Hearth turned to the nearest hostile between `minM` and `maxM` metres out, waited for up to
 *          `waitS` seconds, then a fireball cast with the real F key. The seam cannot spawn a mob, so a fight depends
 *          on the night and is optional.
 * No shot shows the HUD (DECISIONS 2026-10-29 item 50). Day shots go before the night ones: after dusk the night's mobs
 * crowd the Hearth (lookbook.mjs).
 */
export const MEDIA_SHOTS = deepFreeze([
  { name: 'hero', purpose: 'hero', time: 'golden hour', recipe: { kind: 'eye', heading: 205, pitch: 6 }, size: [1600, 900],
    format: 'jpg', out: `${MEDIA_DIR}/hero.jpg`, targetBytes: 330_000,
    alt: 'Crafty at golden hour, from the player\'s eye at the Hearth: gauntleted hands holding a grass block and a wand, the outpost\'s watchtower and Old Pike the Warden ahead, forest on the left and sunlit hills under a warm sky.' },
  { name: 'og', purpose: 'og', time: 'golden hour', recipe: { kind: 'eye', heading: 200, pitch: 6 },
    size: [OG_CARD.width, OG_CARD.height], format: 'png', out: OG_CARD.file, targetBytes: 390_000, alt: BRAND.ogImageAlt },
  still('golden-forest', 'golden hour', { kind: 'eye', heading: 120, pitch: 0 },
    'The forest beside the Hearth at golden hour, from the player\'s eye: gauntleted hands, the Hearth\'s glowing brazier and Sister Wren, a shrine\'s beam above the trees.'),
  still('coast', 'golden hour', { kind: 'pose', place: 'coast' },
    'A voxel coast at golden hour seen from above: a dry grassland slope running down into the sea under a warm haze.'),
  still('forest-edge', 'afternoon', { kind: 'pose', place: 'forest-edge' },
    'The edge of a voxel forest in the afternoon, seen from above the plains: turf, trunks and leaf canopies under a blue sky.'),
  still('snow-terrace', 'golden hour', { kind: 'pose', place: 'snow-terrace' },
    'Snow-covered terraces and trees in the hills near the Hearth at golden hour, seen from above, an outpost roof in the corner.'),
  { name: 'social-preview', purpose: 'social', time: 'blue hour', recipe: { kind: 'eye', heading: 100, pitch: 4 },
    size: [SOCIAL_PREVIEW.width, SOCIAL_PREVIEW.height], format: 'jpg', out: `${MEDIA_DIR}/social-preview.jpg`, targetBytes: 300_000,
    alt: 'The Hearth at blue hour from the player\'s eye: gauntleted hands, Mara the Smith and Sister Wren among the trees, a shrine\'s beam rising into the dusk sky.' },
  still('blue-hour', 'blue hour', { kind: 'eye', heading: 50, pitch: 2 },
    'The forest beside the Hearth at blue hour, from the player\'s eye: a shrine\'s beam over the trees, Mara the Smith by a fire, fireflies in the dusk.'),
  still('night-fight', 'blue hour', { kind: 'fight', minM: 4, maxM: 14, waitS: 60 },
    'A fight at the Hearth after dusk, from the player\'s eye: a fireball flying toward a hostile mob beside the Hearth\'s glowing brazier.', { optional: true }),
]);

function recipeProblems(label, r) {
  if (!r || !RECIPE_KINDS.includes(r.kind)) return [`${label}: recipe kind ${JSON.stringify(r?.kind)} is not one of ${RECIPE_KINDS.join(', ')}`];
  const out = [];
  if (r.kind === 'eye') {
    if (!(Number.isFinite(r.heading) && r.heading >= 0 && r.heading < 360)) out.push(`${label}: heading ${r.heading} is not a compass bearing in [0, 360)`);
    if (!(Number.isFinite(r.pitch) && Math.abs(r.pitch) <= MAX_PITCH_DEG)) out.push(`${label}: pitch ${r.pitch} is not within +-${MAX_PITCH_DEG} degrees`);
  } else if (r.kind === 'pose') {
    if (!LOOKBOOK_PLACES.some((p) => p.id === r.place)) out.push(`${label}: no lookbook place "${r.place}"`);
  } else if (!(r.minM >= OBSTRUCTION_M && r.maxM > r.minM && r.waitS > 0)) {
    out.push(`${label}: a fight needs ${OBSTRUCTION_M} <= minM < maxM and waitS > 0`);
  }
  return out;
}

/** Why the table cannot be shot as declared: one line per problem, [] when it can. */
export function shotTableProblems(shots = MEDIA_SHOTS, budgets = MEDIA_BUDGETS) {
  if (!Array.isArray(shots) || shots.length === 0) return ['the table declares no shot'];
  const problems = [];
  const names = new Set();
  const outs = new Set();
  let docsTarget = 0;
  for (const s of shots) {
    const label = s?.name ?? '(unnamed)';
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(s?.name))) problems.push(`${label}: a name is lower-case words joined by hyphens`);
    if (names.has(s.name)) problems.push(`${label}: named twice`);
    names.add(s.name);
    if (outs.has(s.out)) problems.push(`${label}: writes ${s.out}, which another shot writes`);
    outs.add(s.out);
    if (!PURPOSES.includes(s.purpose)) problems.push(`${label}: purpose ${JSON.stringify(s.purpose)} is not one of ${PURPOSES.join(', ')}`);
    if (!(s.time in MEDIA_TIMES)) problems.push(`${label}: time ${JSON.stringify(s.time)} is not one of ${Object.keys(MEDIA_TIMES).join(', ')}`);
    problems.push(...recipeProblems(label, s.recipe));
    if (!(Array.isArray(s.size) && s.size.length === 2 && s.size.every((n) => Number.isInteger(n) && n > 0))) problems.push(`${label}: size is not [width, height] in whole pixels`);
    if (!['jpg', 'png'].includes(s.format) || !String(s.out).endsWith(`.${s.format}`)) problems.push(`${label}: format ${s.format} does not match ${s.out}`);
    if (s.format === 'png' && s.purpose !== 'og') problems.push(`${label}: only the og card is a PNG`);
    const ceiling = s.format === 'png' ? budgets.ogPngBytes : budgets.jpgBytes;
    if (!(Number.isInteger(s.targetBytes) && s.targetBytes > 0 && s.targetBytes <= ceiling)) {
      problems.push(`${label}: target ${s.targetBytes} bytes is past its ${ceiling}-byte ceiling`);
    }
    if (String(s.out).startsWith(`${MEDIA_DIR}/`)) docsTarget += Number(s.targetBytes) || 0;
    if (typeof s.alt !== 'string' || s.alt.length < 20) problems.push(`${label}: alt text missing or under 20 characters`);
    if (s.optional && s.purpose !== 'still') problems.push(`${label}: only a still may be optional`);
    if (s.recipe?.kind === 'fight' && !s.optional) problems.push(`${label}: a fight depends on the night, so it is optional`);
    if (s.purpose === 'still' && s.out !== `${MEDIA_DIR}/stills/${s.name}.jpg`) problems.push(`${label}: a still writes ${MEDIA_DIR}/stills/${s.name}.jpg`);
  }
  for (const [purpose, out, size, format] of [
    ['hero', `${MEDIA_DIR}/hero.jpg`, null, 'jpg'],
    ['og', OG_CARD.file, [OG_CARD.width, OG_CARD.height], 'png'],
    ['social', `${MEDIA_DIR}/social-preview.jpg`, [SOCIAL_PREVIEW.width, SOCIAL_PREVIEW.height], 'jpg'],
  ]) {
    const list = shots.filter((s) => s.purpose === purpose);
    if (list.length !== 1) { problems.push(`${list.length} ${purpose} shots; the table needs exactly one`); continue; }
    const s = list[0];
    if (s.out !== out) problems.push(`${s.name}: the ${purpose} shot writes ${out}, not ${s.out}`);
    if (s.format !== format) problems.push(`${s.name}: the ${purpose} shot is a ${format}`);
    if (size && (s.size?.[0] !== size[0] || s.size?.[1] !== size[1])) problems.push(`${s.name}: the ${purpose} shot is ${size[0]}x${size[1]}`);
  }
  const room = budgets.docsMediaBytes - MANIFEST_ALLOWANCE_BYTES;
  if (docsTarget > room) problems.push(`the table's targets add up to ${docsTarget} bytes in ${MEDIA_DIR}, past the folder budget (${room} after media.json)`);
  return problems;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** JPEG frame headers (SOF0-3, 5-7, 9-11, 13-15): the markers that carry the image's height and width. */
const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const asBuffer = (b) => (Buffer.isBuffer(b) ? b : Buffer.from(b.buffer, b.byteOffset, b.byteLength));

/** A PNG's { width, height } from its IHDR, or null when the bytes are not a PNG. */
export function pngSize(bytes) {
  if (!bytes || bytes.length < 24) return null;
  const b = asBuffer(bytes);
  if (!PNG_SIGNATURE.every((v, i) => b[i] === v) || b.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/** A JPEG's { width, height } from its frame header, walking the segments before it, or null when there is none. */
export function jpegSize(bytes) {
  if (!bytes || bytes.length < 4) return null;
  const b = asBuffer(bytes);
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) { i += 1; continue; } // a fill byte before the marker
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd8)) { i += 2; continue; } // markers with no length
    if (m === 0xd9 || m === 0xda) return null; // the image or its scan began before any frame header
    if (JPEG_SOF.has(m)) return i + 8 < b.length ? { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) } : null;
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

/** { format: 'png' | 'jpg', width, height }, or null for anything else. */
export function imageSize(bytes) {
  const png = pngSize(bytes);
  if (png) return { format: 'png', ...png };
  const jpg = jpegSize(bytes);
  return jpg ? { format: 'jpg', ...jpg } : null;
}

/**
 * Whether media.json and the files agree. `manifest`: the parsed media.json. `files`: what is on disk, every image
 * under docs/media and the og card, as [{ path (repo-relative), bytes, width, height, format }], measured from the
 * files themselves (imageSize). `manifestBytes`: media.json's own size, which counts toward the folder budget.
 * Returns { problems, checked }: `checked` is how many listed files were found and compared, the denominator.
 */
export function mediaProblems({ manifest, files, manifestBytes = 0, shots = MEDIA_SHOTS, budgets = MEDIA_BUDGETS }) {
  const entries = Array.isArray(manifest?.files) ? manifest.files : null;
  if (!entries) return { problems: ['media.json has no files array'], checked: 0 };
  const problems = [];
  const byShot = new Map(shots.map((s) => [s.name, s]));
  const disk = new Map((files || []).map((f) => [f.path, f]));
  const listed = new Set();
  for (const e of entries) {
    if (listed.has(e.file)) problems.push(`${e.file}: listed twice in media.json`);
    listed.add(e.file);
  }
  for (const f of files || []) if (!listed.has(f.path)) problems.push(`${f.path}: on disk but not listed in media.json`);
  let checked = 0;
  for (const e of entries) {
    const f = disk.get(e.file);
    if (!f) { problems.push(`${e.file}: listed in media.json but missing on disk`); continue; }
    checked += 1;
    const s = byShot.get(e.shot);
    if (!s) { problems.push(`${e.file}: names shot "${e.shot}", which the table does not declare`); continue; }
    if (e.file !== s.out) problems.push(`${e.file}: shot ${s.name} writes ${s.out}`);
    if (e.purpose !== s.purpose) problems.push(`${e.file}: purpose ${e.purpose}, the table says ${s.purpose}`);
    if (e.time !== s.time) problems.push(`${e.file}: shot at ${e.time}, the table says ${s.time}`);
    for (const k of ['bytes', 'width', 'height', 'format']) {
      if (e[k] !== f[k]) problems.push(`${e.file}: media.json says ${k} ${e[k]}, the file has ${f[k]}`);
    }
    const [w, h] = s.size;
    if (f.width !== w || f.height !== h) problems.push(`${e.file}: the file is ${f.width}x${f.height}, the table declares ${w}x${h}`);
    if (e.width !== w || e.height !== h) problems.push(`${e.file}: media.json says ${e.width}x${e.height}, the table declares ${w}x${h}`);
    const ceiling = f.format === 'png' ? budgets.ogPngBytes : budgets.jpgBytes;
    if (!(f.bytes <= ceiling)) problems.push(`${e.file}: ${f.bytes} bytes, over its ${ceiling}-byte budget`);
    if (!/^[0-9a-f]{40}$/.test(String(e.sha))) problems.push(`${e.file}: sha "${e.sha}" is not a full commit sha`);
    if (e.dirty !== false) problems.push(`${e.file}: shot from a dirty tree (dirty: ${e.dirty})`);
    const gpu = classifyRenderer(e.renderer);
    if (gpu !== 'hardware') problems.push(`${e.file}: renderer "${e.renderer ?? ''}" is ${gpu}, not a hardware GPU`);
  }
  for (const s of shots) {
    if (!s.optional && !entries.some((e) => e.shot === s.name)) problems.push(`${s.name}: the table declares it and media.json lists no file for it`);
  }
  const docsBytes = (files || []).filter((f) => f.path.startsWith(`${MEDIA_DIR}/`)).reduce((n, f) => n + f.bytes, 0) + manifestBytes;
  if (docsBytes > budgets.docsMediaBytes) problems.push(`${MEDIA_DIR}: ${docsBytes} bytes, over its ${budgets.docsMediaBytes}-byte budget`);
  return { problems, checked };
}

const circularDeg = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};
const near3 = (a, b, tol = 0.01) => Array.isArray(a) && Array.isArray(b) && a.every((v, i) => Math.abs(v - b[i]) <= tol);

/**
 * Whether a frame shows what its shot declares. `before` / `after`: the seam's info() just before and after the
 * screenshot. `hudVisible`: whether the HUD's vitals stack is on screen (it must not be). For eye and fight shots,
 * `stand` is where the body was stood, `heading` the bearing asked for (a fight's is found at run time),
 * `handsHidden` the hands' node count with them hidden, measured in the same page, and `nearestMobM` the nearest mob
 * of any kind to the eye (nearestMobM below; null when there is none), since the seam counts hostiles only.
 */
export function mediaShotVerdict({ shot, before, after, stand, heading, handsHidden, hudVisible, nearestMobM }) {
  const why = [...shotVerdict({ cycle: MEDIA_TIMES[shot.time], before, after }).why];
  if (hudVisible !== false) why.push('HUD on screen, or not checked');
  if (after?.tier !== 'high') why.push(`render tier ${after?.tier ?? '?'}, not high`);
  const gpu = classifyRenderer(after?.gl?.renderer);
  if (gpu !== 'hardware') why.push(`renderer ${gpu} (${after?.gl?.renderer ?? 'none read'})`);
  const kind = shot.recipe.kind;
  if (kind === 'pose') {
    const place = LOOKBOOK_PLACES.find((p) => p.id === shot.recipe.place);
    if (!place || !near3(after?.pose?.position, place.position)) why.push(`camera not pinned at the ${shot.recipe.place} pose`);
    return { valid: why.length === 0, why };
  }
  if (after?.pose) why.push('camera pinned by a pose, not at the player\'s eye');
  const hands = handCount(after);
  if (!Number.isFinite(handsHidden)) why.push('hands not checked: no baseline with them hidden');
  else if (!(hands > handsHidden)) why.push(`hands not mounted (${hands} nodes; ${handsHidden} with them hidden)`);
  const body = after?.body;
  const off = Array.isArray(body) && Array.isArray(stand) ? Math.hypot(body[0] - stand[0], body[2] - stand[2]) : NaN;
  if (!(off <= STAND_TOLERANCE_M)) why.push(`the body ${Number.isFinite(off) ? off.toFixed(2) : '?'} m from the stand`);
  const at = Number(after?.heading);
  if (!(after?.heading != null && Number.isFinite(at) && circularDeg(at, heading) <= HEADING_TOLERANCE_DEG)) {
    why.push(`facing ${Number.isFinite(at) ? at.toFixed(1) : '?'}, asked ${heading}`);
  }
  if (nearestMobM === undefined) why.push('mobs not checked');
  else if (nearestMobM !== null && nearestMobM < OBSTRUCTION_M) why.push(`a mob ${nearestMobM.toFixed(1)} m from the eye fills the frame`);
  const near = after?.hostiles?.nearestM;
  if (kind === 'fight') {
    if (!(near >= OBSTRUCTION_M && near <= shot.recipe.maxM)) why.push(`no hostile between ${OBSTRUCTION_M} and ${shot.recipe.maxM} m of the eye (nearest ${near ?? 'none'})`);
  } else if (!after?.hostiles) why.push('hostiles not checked');
  else if (near != null && near < OBSTRUCTION_M) why.push(`a hostile ${near.toFixed(1)} m from the eye: a fight, not the view`);
  return { valid: why.length === 0, why };
}

/**
 * The nearest hostile between `minM` and `maxM` metres of `from`, from the store's minimap mirror (`mobEntities`:
 * [{ type, passive, npcName, position: [x, y, z] }]), or null. Passive animals and named NPCs are not hostile.
 */
export function nearestHostile(mobs, from, { minM, maxM }) {
  let best = null;
  for (const m of mobs || []) {
    if (!m || m.passive || m.npcName || !Array.isArray(m.position)) continue;
    const d = Math.hypot(m.position[0] - from[0], m.position[1] - from[1], m.position[2] - from[2]);
    if (d < minM || d > maxM) continue;
    if (!best || d < best.distance) best = { type: m.type, position: [...m.position], distance: d };
  }
  return best;
}

/** The distance from `from` to the nearest mob of any kind in the store's minimap mirror, or null when there is none. */
export function nearestMobM(mobs, from) {
  let best = null;
  for (const m of mobs || []) {
    if (!m || !Array.isArray(m.position)) continue;
    const d = Math.hypot(m.position[0] - from[0], m.position[1] - from[1], m.position[2] - from[2]);
    if (best === null || d < best) best = d;
  }
  return best;
}

/** media.json after a run: the fresh entries, the previous ones for shots not re-shot, nothing for a shot the table
 *  no longer declares, in table order. */
export function mergeManifest(previous, fresh, shots = MEDIA_SHOTS) {
  const freshBy = new Map((fresh || []).map((e) => [e.shot, e]));
  const oldBy = new Map((previous?.files || []).map((e) => [e.shot, e]));
  const files = [];
  for (const s of shots) {
    const e = freshBy.get(s.name) ?? oldBy.get(s.name);
    if (e) files.push(e);
  }
  return { generator: MEDIA_GENERATOR, files };
}

/** The og card's line under the wordmark: the brand title after its colon, capitalised. */
export function cardSubtitle(brand = BRAND) {
  const t = String(brand.title);
  const i = t.indexOf(': ');
  const s = i >= 0 ? t.slice(i + 2) : t;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(String(hex).slice(i, i + 2), 16)).join(', ');

/**
 * The og card as one self-contained page: the frame under an ink scrim from the left, the wordmark in the game's own
 * Lilita One in the brand gold, and the subtitle. `frame`, `wordmarkFont` and `textFont` are data URLs, so the page
 * loads nothing. No buttons and no controls text (reset plan section 6).
 */
export function ogCardHtml({ frame, wordmarkFont, textFont, width, height, brand = BRAND }) {
  const ink = rgb(brand.ground);
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Lilita One'; src: url(${wordmarkFont}) format('woff2'); }
@font-face { font-family: 'Space Grotesk'; src: url(${textFont}) format('woff2'); }
html, body { margin: 0; padding: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: ${brand.ground}; }
.card { position: relative; width: ${width}px; height: ${height}px; background: ${brand.ground} url(${frame}) center / cover no-repeat; }
.scrim { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(${ink}, 0.9) 0%, rgba(${ink}, 0.72) 30%, rgba(${ink}, 0) 62%); }
.mark { position: absolute; left: ${Math.round(width * 0.06)}px; bottom: ${Math.round(height * 0.14)}px; }
.word { font-family: 'Lilita One', sans-serif; font-size: ${Math.round(height * 0.21)}px; line-height: 1; color: ${brand.accent};
  text-shadow: 0 ${Math.max(1, Math.round(height * 0.006))}px 0 rgba(${ink}, 0.85); }
.sub { margin-top: ${Math.round(height * 0.022)}px; font-family: 'Space Grotesk', sans-serif; font-size: ${Math.round(height * 0.052)}px;
  line-height: 1.2; color: ${brand.ink}; }
</style></head><body><div class="card"><div class="scrim"></div><div class="mark">
<div class="word">${esc(brand.name)}</div><div class="sub">${esc(cardSubtitle(brand))}</div>
</div></div></body></html>`;
}

/** The paths `git status --porcelain` names outside the files a media run writes. A run refuses a tree dirty
 *  elsewhere, since the sha it stamps would not name what it shot. */
export function dirtyOutsideOutputs(porcelain) {
  return String(porcelain ?? '').split('\n').filter((l) => l.trim())
    .map((l) => { const p = l.slice(3); const arrow = p.indexOf(' -> '); return arrow >= 0 ? p.slice(arrow + 4) : p; })
    .filter((p) => !p.startsWith(`${MEDIA_DIR}/`) && p !== OG_CARD.file);
}

/** ImageMagick argv: a device-scale PNG master to a JPEG of exactly `width` x `height`, at the highest quality that
 *  fits `targetBytes`, progressive, 4:2:0, with no metadata. */
export function jpegEncodeArgv(master, out, { width, height, targetBytes }) {
  return [master, '-filter', 'Lanczos', '-resize', `${width}x${height}!`, '-strip', '-sampling-factor', '4:2:0',
    '-interlace', 'JPEG', '-define', `jpeg:extent=${targetBytes}`, out];
}

/** ImageMagick argv: a PNG to an opaque 8-bit palette PNG of `colors` colours, error-diffused, with no metadata. */
export function pngPaletteArgv(input, out, { width, height, colors }) {
  return [input, '-filter', 'Lanczos', '-resize', `${width}x${height}!`, '-alpha', 'off', '-strip', '-dither', 'FloydSteinberg',
    '-colors', String(colors), '-define', 'png:compression-level=9', `PNG8:${out}`];
}
