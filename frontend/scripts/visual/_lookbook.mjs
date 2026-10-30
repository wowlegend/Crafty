// _lookbook.mjs — the PURE half of the lookbook probe (scripts/visual/lookbook.mjs): the shot set, the targets, the
// Chromium launch candidates, the real-GPU test, the per-shot validity verdict and the contact sheet. No browser and no
// server here, so a gate drives every decision (tests/gates/lookbook-plan-gates.test.js). Leading underscore: a helper,
// not a probe — it binds no port (tests/scripts/probe-ports.test.js classifies by what a file does).

import { LOOK_TIMES } from '../../src/render/colourScript.js';
import { blightHeartSite } from '../../src/world/blightHeart.js';
import { DRAGON_POSES } from '../../src/render/lookbookSeam.js';

/** The programme's four times of day, as DAWN-origin cycle fractions (game/dayPhase.cycleFraction: 0 dawn, 0.25 noon,
 *  0.5 dusk, 0.75 midnight) — roadmap move 4's afternoon, golden hour, blue hour and midnight, read from the light
 *  script that is judged at them (render/colourScript.js LOOK_TIMES). */
export const LOOKBOOK_CYCLES = Object.freeze(Object.values(LOOK_TIMES));

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
 *   hearth, coast, snow-terrace — the poses of the retired capture oracle's hearth / ocean-coast / biome-snow
 *     states, so a lookbook frame and an old baseline of one place (git history) can be set side by side;
 *   forest-edge — located from the generator itself (climate.surfaceBlockAt over a grid): forest at z <= 58 for
 *     x 12..64, plains to the south; the camera stands ~12 m above the plains looking north at the tree line.
 */
export const LOOKBOOK_PLACES = Object.freeze([
  { id: 'hearth', position: [13, 81, 13], lookAt: [0, 51, 0] },
  { id: 'forest-edge', position: [36, 56, 92], lookAt: [36, 47, 50] },
  { id: 'coast', position: [-60, 78, 40], lookAt: [-110, 22, -6] },
  { id: 'snow-terrace', position: [20, 82, -20], lookAt: [0, 54, -40] },
]);

/**
 * THE DRAGON ARENA (--sets dragon; DECISIONS 2026-10-30 item 122): the Shadow Dragon woken over the Blight Heart lair
 * through the seam's dragon() and held in each pose it knows (src/render/lookbookSeam.js DRAGON_POSES), at each time.
 * The camera first hangs over the lair so its chunks stream in (PositionTracker publishes the posed camera as the
 * player), since dragon() refuses until the lair's ground is loaded; the seam wakes the dragon beside the lair, on the
 * side a player walks in from (world/bossSystem.js lookbookDragonSpot). Then the camera stands DRAGON_VIEW.back metres
 * from the dragon ACROSS that bearing (side-on, so the sky and not the lair's black monolith stands behind it),
 * DRAGON_VIEW.up metres off its centre, looking at it.
 */
export const DRAGON_ARENA = Object.freeze({ id: 'dragon-arena', lair: Object.freeze(blightHeartSite()), streamY: 110 });
export const DRAGON_VIEW = Object.freeze({ back: 16, up: -3, eye: 2.5, bearings: 12, samples: 16 });

/** The camera over the lair while its chunks stream: high, looking down and a little north so the view is not straight
 *  down its up vector. */
export function dragonStreamPose(arena = DRAGON_ARENA) {
  const { x, z } = arena.lair;
  return { position: [x, arena.streamY, z + 12], lookAt: [x, arena.streamY - 60, z] };
}

/** The camera for a frame of the dragon at `at` ([x, y, z]) from bearing `turn` (radians, clockwise from side-on):
 *  DRAGON_VIEW.back metres from it, side-on to its bearing from the spawn (the world origin) at turn 0, DRAGON_VIEW.up
 *  off its centre, looking at its centre, and never less than DRAGON_VIEW.eye over `ground`, the ground under the camera
 *  when known (a camera inside a hill sees black). */
export function dragonCameraPose(at, ground = null, view = DRAGON_VIEW, turn = 0) {
  const len = Math.hypot(at[0], at[2]) || 1;
  const sx0 = at[2] / len, sz0 = -at[0] / len;
  const c = Math.cos(turn), s = Math.sin(turn);
  const sx = sx0 * c - sz0 * s, sz = sx0 * s + sz0 * c;
  const y = Number.isFinite(ground) ? Math.max(at[1] + view.up, ground + view.eye) : at[1] + view.up;
  return { position: [at[0] + sx * view.back, y, at[2] + sz * view.back], lookAt: [at[0], at[1], at[2]] };
}

/** The ground points a sight check of every candidate bearing reads: each camera's foot and DRAGON_VIEW.samples points
 *  along the line from it to the dragon, as [x, z] pairs (the probe reads them all through the seam's groundAt). */
export function dragonSightPoints(at, view = DRAGON_VIEW) {
  const out = [];
  for (let b = 0; b < view.bearings; b++) {
    const p = dragonCameraPose(at, null, view, (b * 2 * Math.PI) / view.bearings).position;
    out.push([p[0], p[2]]);
    for (let i = 1; i < view.samples; i++) {
      const f = i / view.samples;
      out.push([p[0] + (at[0] - p[0]) * f, p[2] + (at[2] - p[2]) * f]);
    }
  }
  return out;
}

/**
 * The first bearing (side-on first, then clockwise in DRAGON_VIEW.bearings steps) whose camera sees the dragon over the
 * ground: at every sampled point of the sight line the line runs above the column top there (the mobs' ground probe:
 * trees and roofs count). `groundAt(x, z)` answers from the probe's read of dragonSightPoints; null (not loaded) is not
 * an obstacle. Returns the pose, its turn, and whether any bearing was clear (if none is, the side-on pose, flagged).
 */
export function pickDragonView(at, groundAt, view = DRAGON_VIEW) {
  for (let b = 0; b < view.bearings; b++) {
    const turn = (b * 2 * Math.PI) / view.bearings;
    const foot = dragonCameraPose(at, null, view, turn).position;
    const pose = dragonCameraPose(at, groundAt(foot[0], foot[2]), view, turn);
    const p = pose.position;
    let clear = true;
    for (let i = 1; i < view.samples && clear; i++) {
      const f = i / view.samples;
      const g = groundAt(p[0] + (at[0] - p[0]) * f, p[2] + (at[2] - p[2]) * f);
      if (Number.isFinite(g) && g >= p[1] + (at[1] - p[1]) * f) clear = false;
    }
    if (clear) return { pose, turn, clear: true };
  }
  const foot = dragonCameraPose(at, null, view, 0).position;
  return { pose: dragonCameraPose(at, groundAt(foot[0], foot[2]), view, 0), turn: 0, clear: false };
}

/** Every dragon frame, pose-major: [{ pose, cycle, file }]. */
export function dragonShotPlan(poses = DRAGON_POSES, cycles = LOOKBOOK_CYCLES) {
  const out = [];
  for (const pose of poses) for (const c of cycles) out.push({ pose, cycle: c, file: `dragon-${pose}-${c.toFixed(2)}.png` });
  return out;
}

/** A dragon frame is valid when the shot is (shotVerdict), the dragon is up, held in the pose the frame names, its group
 *  is in the live scene with something visible to draw (`scene`, read by the probe from the scene graph), and the camera
 *  picked sees it over the ground (`sightClear`, pickDragonView). */
export function dragonShotVerdict({ pose, cycle, before, after, scene, sightClear = true }) {
  const v = shotVerdict({ cycle, before, after });
  if (sightClear === false) v.why.push('no camera bearing sees the dragon over the ground');
  const d = after?.dragon;
  if (!d?.active) v.why.push('the dragon is not up');
  else if (d.hold !== pose) v.why.push(`the dragon is held in ${JSON.stringify(d.hold)}, not ${JSON.stringify(pose)}`);
  if (!scene?.inScene) v.why.push('the dragon\'s group is not in the scene (its chunk mounted nothing)');
  else if (!(scene.meshes > 0)) v.why.push('the dragon\'s group draws nothing');
  return { valid: v.why.length === 0, why: v.why };
}

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
 * THE MATERIAL SET (opt-in, `--sets material`): the block surfaces the material grammar changes, seen at the player's
 * eye with the hands and the HUD on. Two sights, each found in the live world's own mesh near the Hearth:
 *   turf-wall  the side of a grass hill (a grass block over exposed dirt, else a one-block grass step), where the
 *              tiles' top / side roles show as a turf lip over a dirt wall;
 *   trunk      the side of a tree trunk (wood, at least three blocks tall), where bark replaces end-grain rings.
 * The player is stood MATERIAL_STAND_M in front of the face on the ground it rises from, with a clear line to it, and
 * turned to look at it.
 */
export const MATERIAL_SIGHT_KINDS = Object.freeze(['turf-wall', 'trunk']);
export const MATERIAL_STAND_M = 3.5;
/** The outpost's buildings ring the Hearth out to about 15 m (world/hubLayout.js) and are not in the terrain mesh, so
 *  the finder cannot see them in a sight line: sights are taken from at least this far out. */
export const MATERIAL_MIN_M = 20;

/** Every material shot, sight-major (one stand per sight): [{ kind, cycle, file }]. */
export function materialShotPlan(kinds = MATERIAL_SIGHT_KINDS, cycles = LOOKBOOK_CYCLES) {
  const out = [];
  for (const kind of kinds) for (const c of cycles) out.push({ kind, cycle: c, file: `${kind}-${c.toFixed(2)}.png` });
  return out;
}

/**
 * The compass bearing (HUD convention: 0 north = -Z, 90 east = +X) and pitch (degrees, up positive) that point an
 * eye at `eye` toward `target`.
 */
export function aimAt(eye, target) {
  const dx = target[0] - eye[0], dz = target[2] - eye[2];
  const heading = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
  const pitch = (Math.atan2(target[1] - eye[1], Math.hypot(dx, dz)) * 180) / Math.PI;
  return { heading, pitch };
}

/**
 * The nearest turf-wall and trunk sights to `from` (the Hearth stand, [x, y, z]) in a set of chunk meshes, or null
 * for a kind with none between `minM` and `maxM` of it. `chunks`: [{ cx, cz, meshData: { positions, normals, colors } }] (the shape of
 * the store's debugChunks); omitted, it reads them from the page (`window.useGameStore`), so this runs unchanged
 * through Playwright's page.evaluate. It therefore reads nothing from module scope: every input arrives in `arg`.
 *
 * Read from the mesh: a side quad is a wall face (its block in colour.r) and marks the block behind it as solid over
 * its height; a +Y quad marks a column's ground at its height. A sight's stand column must have ground exactly at the
 * wall's base, and every column from the face to the stand must be clear of blocks over the 2 m above that base: no
 * ground rising into it and no block whose side shows within it, however tall that block is.
 * `ids`: { grass, dirt, wood }, the game's block ids (src/world/blockIds.js BLOCK_ID); required, since the page
 * evaluation this runs in cannot import them.
 */
export function findMaterialSights(arg) {
  const { from, ids, standM = 3.5, minM = 0, maxM = 40, chunkSize = 16 } = arg;
  for (const k of ['grass', 'dirt', 'wood']) {
    if (!Number.isInteger(ids?.[k])) throw new TypeError(`findMaterialSights: ids.${k} must be the game's block id, got ${JSON.stringify(ids?.[k])}`);
  }
  const list = arg.chunks || Object.values(window.useGameStore.getState().debugChunks || {});
  const sides = [];
  const tops = new Map();
  const solid = new Map(); // column -> [y0, y1] of every block whose side face shows there
  const key = (x, z) => `${x},${z}`;
  for (const c of list) {
    const m = c.meshData || c;
    const P = m.positions, N = m.normals, C = m.colors;
    if (!P || !N || !C) continue;
    const ox = c.cx * chunkSize, oz = c.cz * chunkSize;
    for (let v = 0; v + 4 <= P.length / 3; v += 4) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let k = 0; k < 4; k++) {
        const i = (v + k) * 3;
        x0 = Math.min(x0, P[i] + ox); x1 = Math.max(x1, P[i] + ox);
        y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]);
        z0 = Math.min(z0, P[i + 2] + oz); z1 = Math.max(z1, P[i + 2] + oz);
      }
      const nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
      if (ny > 0.5) {
        for (let x = Math.round(x0); x < Math.round(x1); x++) {
          for (let z = Math.round(z0); z < Math.round(z1); z++) {
            const k = key(x, z);
            if (!tops.has(k)) tops.set(k, []);
            tops.get(k).push(Math.round(y1));
          }
        }
      } else if (ny >= -0.5) {
        sides.push({ block: Math.round(C[v * 3]), nx: Math.round(nx), nz: Math.round(nz),
          x0: Math.round(x0), x1: Math.round(x1), y0: Math.round(y0), y1: Math.round(y1), z0: Math.round(z0), z1: Math.round(z1) });
      }
    }
  }
  // A side face lies on its block's boundary; the block is the column on the side away from its normal.
  for (const q of sides) {
    const along = q.nx !== 0 ? [q.z0, q.z1] : [q.x0, q.x1];
    for (let a = along[0]; a < along[1]; a++) {
      const k = q.nx !== 0 ? key(q.nx > 0 ? q.x0 - 1 : q.x0, a) : key(a, q.nz > 0 ? q.z0 - 1 : q.z0);
      if (!solid.has(k)) solid.set(k, []);
      solid.get(k).push([q.y0, q.y1]);
    }
  }
  const groundAt = (x, z) => tops.get(key(Math.floor(x), Math.floor(z))) || [];
  const solidAt = (x, z) => solid.get(key(Math.floor(x), Math.floor(z))) || [];
  const clearAbove = (x, z, base) => !groundAt(x, z).some((t) => t > base && t <= base + 2)
    && !solidAt(x, z).some(([y0, y1]) => y0 < base + 2 && y1 > base);
  // Vertical vertex AO splits one wall face into several quads, so the face is read per column of its plane: every
  // side quad's [y0, y1] is filed under (direction, plane, column along the face).
  const planeOf = (q) => (q.nx !== 0 ? q.x0 : q.z0);
  const spanOf = (q) => (q.nx !== 0 ? [q.z0, q.z1] : [q.x0, q.x1]);
  const columns = new Map();
  for (const q of sides) {
    const [a0, a1] = spanOf(q);
    for (let a = a0; a < a1; a++) {
      const k = `${q.nx},${q.nz},${planeOf(q)},${a}`;
      if (!columns.has(k)) columns.set(k, []);
      columns.get(k).push(q);
    }
  }
  const below = (q, a, y) => (columns.get(`${q.nx},${q.nz},${planeOf(q)},${a}`) || []).find((d) => d.y1 === y);
  const above = (q, a, y, block) => (columns.get(`${q.nx},${q.nz},${planeOf(q)},${a}`) || []).find((d) => d.y0 === y && d.block === block);
  // The point on the face at its centre column, and the stand point in front of it on the wall's base.
  const frame = (q, a, targetY, base) => {
    const target = q.nx !== 0 ? [q.x0, targetY, a + 0.5] : [a + 0.5, targetY, q.z0];
    const stand = [target[0] + q.nx * standM, base, target[2] + q.nz * standM];
    if (!groundAt(stand[0], stand[2]).includes(base)) return null;
    for (let s = 0.5; s <= standM; s += 0.25) {
      if (!clearAbove(target[0] + q.nx * s, target[2] + q.nz * s, base)) return null;
    }
    const rangeM = Math.hypot(stand[0] - from[0], stand[2] - from[2]);
    if (!(rangeM >= minM && rangeM <= maxM)) return null;
    const span = spanOf(q);
    return { target, stand, ground: base, normal: [q.nx, 0, q.nz], span: span[1] - span[0], rangeM };
  };
  const candidates = { 'turf-wall': [], trunk: [] };
  for (const q of sides) {
    const [a0, a1] = spanOf(q);
    const a = Math.floor((a0 + a1) / 2);
    if (q.block === ids.grass) {
      const under = below(q, a, q.y0);
      let base = q.y0;
      for (let d = under; d; d = below(q, a, d.y0)) base = d.y0;
      const hill = !!under && under.block === ids.dirt;
      const f = frame(q, a, q.y0 + 0.5, base);
      if (f) candidates['turf-wall'].push({ kind: 'turf-wall', form: hill ? 'hill' : 'step', ...f, rank: [hill ? 0 : 1, f.span >= 2 ? 0 : 1] });
    } else if (q.block === ids.wood && !(below(q, a, q.y0)?.block === ids.wood)) {
      let top = q.y1;
      for (let u = above(q, a, top, ids.wood); u; u = above(q, a, top, ids.wood)) top = u.y1;
      if (top - q.y0 < 3) continue;
      const f = frame(q, a, q.y0 + 1.5, q.y0);
      if (f) candidates.trunk.push({ kind: 'trunk', form: 'trunk', ...f, height: top - q.y0, rank: [0, 0] });
    }
  }
  const order = (a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rangeM - b.rangeM
    || a.stand[0] - b.stand[0] || a.stand[2] - b.stand[2];
  const pick = (list) => {
    const best = [...list].sort(order)[0];
    if (!best) return null;
    const { rank, ...sight } = best;
    return sight;
  };
  return { 'turf-wall': pick(candidates['turf-wall']), trunk: pick(candidates.trunk) };
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

/** The hands' node count from a seam info() reading: the viewmodel's `handNodes` where the build reports it, else the
 *  camera's subtree, where a build from before the viewmodel hung the hands. */
export function handCount(info) {
  return info?.handNodes ?? info?.cameraNodes;
}

/** Why a heading reading is not the asked-for bearing, or null. */
function offHeading(reading, heading, when) {
  const at = Number(reading);
  if (reading != null && Number.isFinite(at) && circularDeg(at, heading) <= HEADING_TOLERANCE) return null;
  return `facing ${reading != null && Number.isFinite(at) ? at.toFixed(1) : '?'}${when}, asked ${heading}`;
}

/**
 * Whether an eye-level shot shows what a player sees: everything shotVerdict asks, plus no hero pose pinned, no
 * hostile in the player's face, the hands mounted (more hand nodes than the same page measured with them hidden:
 * `handsBaseline`), the HUD on screen, the body where it was stood (`stand`, the resting body read once per target),
 * and the camera facing the asked-for bearing. A frame that passes still wants looking at: the hands count says they
 * are mounted, not that they are inside the frame.
 */
export function eyeShotVerdict({ cycle, heading, stand, before, after, handsBaseline, hud }) {
  const why = [...shotVerdict({ cycle, before, after }).why];
  if (after?.pose) why.push('camera pinned by a hero pose, not at the player\'s eye');
  const near = after?.hostiles?.nearestM;
  if (!after?.hostiles) why.push('hostiles not checked');
  else if (near != null && near < OBSTRUCTION_M) why.push(`a hostile ${near.toFixed(1)} m from the eye: a fight, not the view`);
  const hands = handCount(after);
  if (!Number.isFinite(handsBaseline)) why.push('hands not checked: no baseline with them hidden');
  else if (!(hands > handsBaseline)) why.push(`hands not mounted (${hands} nodes; ${handsBaseline} with them hidden)`);
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
 * mid-window (a tier first mounting GodRays) counts each frame once, under whichever label drew it: `sceneMs`, the
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

/**
 * THE WHOLE-FRAME DIFFERENTIAL (lookbook.mjs --passes; plan docs/superpowers/plans/2026-10-28-crafty-w2i-passes.md).
 * Each arm switches the named passes off through the seam (src/render/passesOff.js LOOKBOOK_PASS_NAMES).
 */
export const PASS_ARMS = Object.freeze([
  { id: 'godrays+sun', off: ['godrays', 'sun'] },
  { id: 'bloom', off: ['bloom'] },
  { id: 'smaa', off: ['smaa'] },
  { id: 'tonemapping', off: ['tonemapping'] },
  { id: 'grade', off: ['grade'] },
  { id: 'vignette', off: ['vignette'] },
]);
/** Noon, golden hour (GodRays is horizon-gated, so it runs only while the sun is up) and midnight, dawn-origin. At
 *  golden hour the player faces the sun, where GodRays shows; otherwise north, the lodge wall and the forest edge. */
export const PASS_TIMES = Object.freeze([
  { id: 'noon', cycle: 0.25, face: 'north' },
  { id: 'golden', cycle: 0.48, face: 'sun' },
  { id: 'midnight', cycle: 0.75, face: 'north' },
]);
export const PASS_REPS = 5;
/** Kevin's laptop window, the case render/quality.js derives the pixel budgets from: at tier high, dpr 1.475, 4.2 Mpx. */
export const PASS_TARGET = Object.freeze({ id: 'chromium-1728x1117', engine: 'chromium', viewport: { width: 1728, height: 1117 }, deviceScaleFactor: 2, touch: false });
/** The before/after frames shot for the plan's two named candidates, at the times their look depends on. */
export const PASS_LOOK_PAIRS = Object.freeze([
  { time: 'golden', arm: 'godrays+sun', face: 'sun' },
  { time: 'noon', arm: 'godrays+sun', face: 'sun' },
]);
/** No block starts while the 1-minute load average is above this (the lane's measurement rule). */
export const PASS_MAX_LOAD = 12;
/** A positive control, not a decision: every post pass off at once, which must move every instrument a long way. */
export const PASS_CONTROL = Object.freeze({ id: 'all-post', off: ['bloom', 'godrays', 'grade', 'smaa', 'sun', 'tonemapping', 'vignette'], control: true });

/**
 * PURE. The GPU's own busy figures out of `ioreg -r -d 1 -w 0 -c IOAccelerator` (the driver's PerformanceStatistics,
 * readable without root; Activity Monitor's GPU history reads the same): percent of the last driver interval the GPU
 * was busy, whole device and the renderer and tiler stages. Null when the text carries no device figure.
 */
export function parseGpuUtil(text) {
  const n = (key) => {
    const m = String(text ?? '').match(new RegExp(`"${key} %"=(\\d+)`));
    return m ? Number(m[1]) : null;
  };
  const device = n('Device Utilization');
  return device === null ? null : { device, renderer: n('Renderer Utilization'), tiler: n('Tiler Utilization') };
}

/**
 * PURE. GPU busy ms per frame over a utilization window: the median device percent of the samples taken after
 * `skipMs` (the driver's figure lags), times the window's mean frame interval. Null without frames or samples.
 */
export function gpuMsPerFrame(samples, { frames, windowMs, skipMs = 500 } = {}) {
  const pct = medianOf((samples || []).filter((s) => s.t >= skipMs && s.util).map((s) => s.util.device));
  if (pct === null || !(frames > 0) || !(windowMs > 0)) return null;
  return { pct, intervalMs: windowMs / frames, ms: (pct / 100) * (windowMs / frames), n: (samples || []).filter((s) => s.t >= skipMs && s.util).length };
}

/** The windows for one time of day, repetition-major (each arm once per repetition), on and off alternating by
 *  repetition so a drift over the block lands on both arms alike: [{ arm, off, rep, state }]. */
export function passWindowPlan(arms = PASS_ARMS, reps = PASS_REPS) {
  const out = [];
  for (let rep = 0; rep < reps; rep++) {
    for (const arm of arms) {
      const order = rep % 2 === 0 ? ['on', 'off'] : ['off', 'on'];
      for (const state of order) out.push({ arm: arm.id, off: state === 'off' ? [...arm.off] : [], rep, state });
    }
  }
  return out;
}

/** The game canvas's median for `label` out of a passTimes() report (the timer's p50 over the window), or null. */
export function windowMedian(report, label, gameCanvas) {
  const ctxs = report?.contexts || [];
  const same = (c) => Array.isArray(c) && Array.isArray(gameCanvas) && c[0] === gameCanvas[0] && c[1] === gameCanvas[1];
  const area = (c) => (Array.isArray(c) ? c[0] * c[1] : 0);
  const ctx = ctxs.find((x) => same(x.canvas)) || [...ctxs].sort((x, y) => area(y.canvas) - area(x.canvas))[0];
  const p = ctx?.passes?.find((x) => x.label === label);
  return p && Number.isFinite(p.p50Ms) ? { ms: p.p50Ms, n: p.n } : null;
}

export const medianOf = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const statsOf = (values) => ({
  values, n: values.length, median: medianOf(values),
  min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null,
  positive: values.filter((v) => v > 0).length,
});

/**
 * PURE. One arm's differential from measured windows ([{ arm, rep, state, q, w, u, valid }], `q` the whole-frame query
 * median, `w` the synced wall median and `u` the GPU's busy ms per frame of each window): per repetition with both a
 * valid `on` and a valid `off`, `d = on - off` on each instrument that read both halves. Each instrument pairs on its
 * own, so a window whose timer query read nothing still counts for U. A repetition missing either half counts for
 * nothing.
 */
export function passDifferential(windows, arm) {
  const reps = new Map();
  for (const x of windows) {
    if (x.arm !== arm || !x.valid) continue;
    if (!reps.has(x.rep)) reps.set(x.rep, {});
    reps.get(x.rep)[x.state] = x;
  }
  const pairs = [...reps.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v).filter((v) => v.on && v.off);
  const read = (k) => pairs.filter((p) => Number.isFinite(p.on[k]) && Number.isFinite(p.off[k]));
  const [qPairs, wPairs, uPairs] = [read('q'), read('w'), read('u')];
  return {
    arm,
    reps: pairs.length,
    q: statsOf(qPairs.map((p) => p.on.q - p.off.q)),
    w: statsOf(wPairs.map((p) => p.on.w - p.off.w)),
    u: statsOf(uPairs.map((p) => p.on.u - p.off.u)),
    onQ: medianOf(qPairs.map((p) => p.on.q)), offQ: medianOf(qPairs.map((p) => p.off.q)),
    onW: medianOf(wPairs.map((p) => p.on.w)), offW: medianOf(wPairs.map((p) => p.off.w)),
    onU: medianOf(uPairs.map((p) => p.on.u)), offU: medianOf(uPairs.map((p) => p.off.u)),
  };
}

/** A timer-query instrument (`q`, `w`) is read from at least this many frames of its window. */
export const PASS_MIN_TIMED = 30;
/** U is read from at least this many post-lag GPU utilization readings. */
export const PASS_MIN_UTIL = 5;

/**
 * PURE. A frame window's three readings, each kept only where it had enough samples: `q` (the whole-frame query),
 * `w` (the synced wall clock, which needs no timer extension) and `u` (the driver's busy time, which needs neither).
 * One instrument short of samples drops that instrument, never the window. `dropped` names each one dropped.
 */
export function windowReadings({ q, w, util }) {
  const dropped = [];
  const keep = (name, r) => {
    if (r && Number.isFinite(r.ms) && r.n >= PASS_MIN_TIMED) return r.ms;
    dropped.push(`${name}: ${r?.n ?? 0} timed frames`);
    return null;
  };
  const qMs = keep('Q', q);
  const wMs = keep('W', w);
  let u = null;
  if (util && Number.isFinite(util.u) && util.uN >= PASS_MIN_UTIL) u = util.u;
  else dropped.push(`U: ${util?.uN ?? 0} GPU utilization readings`);
  return { q: qMs, w: wMs, u, dropped };
}

/**
 * PURE. Why the composer is not in the state an arm asked for, or []. `chain` is the pass timer's chain (each
 * EffectPass carries `skipped`: its effects whose blend function is SKIP); `expectEffects` the effect names the seam
 * says the arm switches off (render/passesOff.js lookbookEffectNames). Exactly those must be skipped: a renamed effect
 * that the arm no longer matches, or a missing composer, would otherwise measure the on state twice. The Sun billboard
 * is not an effect, so the 'sun' half of an arm is not checked here.
 */
export function armAppliedWhy(chain, expectEffects) {
  if (!Array.isArray(chain) || !chain.some((p) => Array.isArray(p?.skipped))) {
    return ['the chain shows no effect pass, so whether the arm is off is unread'];
  }
  if (!Array.isArray(expectEffects)) return ['the seam names no effects for the arm'];
  const skipped = [...new Set(chain.flatMap((p) => p.skipped || []))];
  const missing = expectEffects.filter((n) => !skipped.includes(n));
  const extra = skipped.filter((n) => !expectEffects.includes(n));
  const why = [];
  if (missing.length) why.push(`the arm's ${missing.join(', ')} not off in the chain`);
  if (extra.length) why.push(`${extra.join(', ')} off in the chain, which the arm does not name`);
  return why;
}

/** PURE. Why the body or the gaze moved off the pose a block measures from ({ stand, heading }), or []. */
export function poseWhy(at, pose) {
  const why = [];
  const stood = offStand(at?.body, pose?.stand, 'at the read');
  if (stood) why.push(stood);
  const facing = offHeading(at?.heading, pose?.heading, '');
  if (facing) why.push(facing);
  return why;
}

/**
 * PURE. Why a --passes window (or one half of an alternation) does not measure what it claims, or []: `at` is the
 * seam's info() read as it closed, `chain` the pass timer's chain read with it. Valid only with input live, the player
 * alive, the tier high, the clock within CYCLE_TOLERANCE of `cycle`, the body at the block's stand facing its
 * heading, and exactly the arm's effects off.
 */
export function passWindowWhy({ cycle, pose, at, chain, expectEffects }) {
  const why = [];
  if (!at?.active) why.push('input not live');
  if (!at?.isAlive) why.push('player dead');
  if (at?.tier !== 'high') why.push(`tier ${at?.tier}`);
  const c = Number(at?.cycle);
  if (!Number.isFinite(c) || circular(c, cycle) > CYCLE_TOLERANCE) why.push(`clock at ${Number.isFinite(c) ? c.toFixed(4) : '?'}, asked ${cycle}`);
  why.push(...poseWhy(at, pose));
  why.push(...armAppliedWhy(chain, expectEffects));
  return why;
}

/** PURE. Why --passes cannot read the GPU it measures through this renderer, or null. The driver's utilization is the
 *  hardware GPU's, so a software renderer leaves it idle whatever the arm does. */
export function passRendererProblem(renderer, { allowSoftware = false } = {}) {
  const gpu = classifyRenderer(renderer);
  if (gpu === 'hardware' || (gpu === 'software' && allowSoftware)) return null;
  return `the GAME's renderer is ${gpu} (${renderer ?? 'none read'}): the GPU utilization would read an idle device`;
}

/**
 * PURE. Which checkout a run measured: `rev` from `git rev-parse --short HEAD`, `porcelain` from `git status
 * --porcelain`. A dirty tree means the probe or the build can differ from the commit named, so the paths are kept.
 */
export function checkoutState(rev, porcelain) {
  const commitAtRun = typeof rev === 'string' && rev.trim() ? rev.trim() : null;
  if (typeof porcelain !== 'string') return { commitAtRun, dirty: null, dirtyPaths: [] };
  const paths = porcelain.split('\n').filter((l) => l.trim()).map((l) => l.slice(3));
  return { commitAtRun, dirty: paths.length > 0, dirtyPaths: paths.slice(0, 20), dirtyCount: paths.length };
}

/** The driver's utilization lags: an alternation half is read from this far in. */
export const PASS_ALT_SKIP_MS = 600;
/** An alternation half counts with at least this many readings after the lag. */
export const PASS_ALT_MIN_READINGS = 3;

/**
 * PURE. The fast alternation (lookbook.mjs --passes --alt): one window of halves, the arm switched on and off every
 * half, the GPU's utilization read through each. The GPU moves between power states over tens of seconds, which the
 * windowed design lands on either arm at random; within a few seconds it does not, so each adjacent on/off pair of
 * halves is one differential within one state. A half's value is its median busy percent after `skipMs` (the driver
 * lags), in ms at that half's own frame interval (`windowMs / frames`, counted over the same post-lag span), so an arm
 * that changes the frame rate at the same busy percent still reads as a cost. A half counts for nothing when the window
 * check refused it (`why` non-empty), when it has fewer than `minReadings` readings after the lag, or no interval.
 * Adjacent pairs share halves, so the differentials are not independent: one odd half moves the two pairs it is in.
 * `halves`: [{ state: 'on'|'off', samples: [{ t, util }], frames, windowMs, why? }].
 */
export function altDifferential(halves, { skipMs = PASS_ALT_SKIP_MS, minReadings = PASS_ALT_MIN_READINGS } = {}) {
  const value = (h) => {
    if (h.why?.length) return { ms: null, dropped: h.why.join('; ') };
    const readings = (h.samples || []).filter((s) => s.t >= skipMs && s.util).map((s) => s.util.device);
    if (readings.length < minReadings) return { ms: null, dropped: `${readings.length} readings after the lag` };
    const intervalMs = h.frames > 0 && h.windowMs > 0 ? h.windowMs / h.frames : null;
    if (intervalMs === null) return { ms: null, dropped: 'no frame interval' };
    return { ms: (medianOf(readings) / 100) * intervalMs, intervalMs };
  };
  const vals = (halves || []).map((h) => ({ state: h.state, ...value(h) }));
  const d = [];
  for (let i = 1; i < vals.length; i++) {
    const [a, b] = [vals[i - 1], vals[i]];
    if (a.ms === null || b.ms === null || a.state === b.state) continue;
    d.push(a.state === 'on' ? a.ms - b.ms : b.ms - a.ms);
  }
  const onMs = medianOf(vals.filter((v) => v.state === 'on' && v.ms !== null).map((v) => v.ms));
  return {
    u: statsOf(d), onU: onMs, halves: vals.map((v) => v.ms),
    dropped: vals.map((v, i) => (v.ms === null ? `half ${i} (${v.state}): ${v.dropped}` : null)).filter(Boolean),
  };
}

/** The rule (plan 2026-10-28-crafty-w2i-passes, "The decision rule" and its amendment), fixed before the measurement. */
export const PASS_RULE = Object.freeze({ minReps: 5, minMs: 0.5, minShare: 0.10, minPositiveShare: 0.8, contradictMs: 0.25 });

const enoughPositive = (s, rule) => s.n > 0 && s.positive >= Math.ceil(rule.minPositiveShare * s.n);

/**
 * PURE. Which instruments can see post-processing at all at this time of day: those on which the positive control
 * (PASS_CONTROL, every pass off) moves the frame by a material amount in enough repetitions. Q is also refused when any
 * window read more GPU time than the synced wall clock that brackets it (`qOverW`).
 */
export function admittedInstruments(control, { qOverW = 0 } = {}, rule = PASS_RULE) {
  const ok = (s) => !!s && s.n >= rule.minReps && s.median >= rule.minMs && enoughPositive(s, rule);
  return { u: ok(control?.u), w: ok(control?.w), q: ok(control?.q) && qOverW === 0 };
}

/** PURE. Whether an arm's cost is material by PASS_RULE, decided on U, with every reason it is not. */
export function passVerdict(d, admitted, rule = PASS_RULE) {
  const why = [];
  const u = d.u.median;
  if (!admitted?.u) why.push('U (GPU busy time) is not admitted: the control did not move it');
  if (d.u.n < rule.minReps) why.push(`${d.u.n} complete repetitions, fewer than ${rule.minReps}`);
  const share = Number.isFinite(u) && d.onU > 0 ? u / d.onU : null;
  if (!(u >= rule.minMs)) why.push(`under ${rule.minMs} ms (U ${u})`);
  if (!(share >= rule.minShare)) why.push(`under ${Math.round(rule.minShare * 100)}% of the frame (${share === null ? '?' : `${(share * 100).toFixed(1)}%`})`);
  if (!enoughPositive(d.u, rule)) why.push(`${d.u.positive} of ${d.u.n} repetitions positive`);
  const contradicted = ['w', 'q'].filter((k) => admitted?.[k] && d[k].median < -rule.contradictMs);
  for (const k of contradicted) why.push(`${k.toUpperCase()} contradicts it (${d[k].median})`);
  return { share, contradicted, material: why.length === 0, why };
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

/**
 * PURE. The lines the run prints for one target: each set's valid count against its plan with every invalid frame
 * named, the clips, and how many frames of every set carried post-pass timings. `planned`: { hero, eye, material },
 * the shots each set was asked for; a set that was asked for and shot nothing still prints its 0 of N.
 */
export function targetSummaryLines(r, planned = {}) {
  const lines = [];
  const set = (label, list, plan, tail = '') => {
    lines.push(`  ${label.padEnd(13)} ${list.filter((s) => s.valid).length}/${list.length} valid (planned ${plan})${tail}`);
    for (const s of list.filter((x) => !x.valid)) lines.push(`    INVALID ${s.file}: ${(s.why || []).join('; ')}`);
  };
  set('shots', r.shots || [], planned.hero ?? 0, r.respawns ? `, ${r.respawns} respawn(s)` : '');
  if (r.eye) set('eye level', r.eye, planned.eye ?? 0, `; stand ${JSON.stringify(r.stand)}; hands ${JSON.stringify(r.hands)}`);
  if (r.dragon?.length || planned.dragon) set('dragon', r.dragon || [], planned.dragon ?? 0);
  if (r.eye?.length) lines.push(...chromeSummaryLines(r.eye));
  if (r.material?.length || planned.material) {
    const sights = MATERIAL_SIGHT_KINDS.map((k) => {
      const s = r.sights?.[k];
      return s ? `${k} ${s.form} at ${Number(s.rangeM).toFixed(1)} m` : `${k} none`;
    }).join(', ');
    set('material', r.material || [], planned.material ?? 0, `; sights: ${sights}`);
  }
  if (r.hud) {
    const c = r.hud.compass;
    lines.push(c?.labels ? `  hud compass   ${c.labels.length} label(s) shown, ${c.overlaps.length} overlapping${c.overlaps.length ? ` (${c.overlaps.join('; ')})` : ''}; pips ${c.pips.join(', ')}`
      : `  hud compass   NOT MEASURED: ${c?.why}`);
    for (const d of r.hud.dusk || []) lines.push(`  hud dusk ${d.locale.padEnd(5)} ${d.count} warning(s), ${d.coversDial ? 'COVERS the dial' : 'clear of the dial'}; "${d.text ?? ''}"`);
  }
  if (r.clips?.length) {
    lines.push(`  clips         ${r.clips.filter((c) => c.valid).length}/${r.clips.length} valid`);
    for (const c of r.clips) {
      lines.push(`    ${c.file}: walked ${Number(c.movedM).toFixed(2)} m, ${c.frames} video / ${c.gameFrames} game frames${c.valid ? '' : `, INVALID: ${(c.why || []).join('; ')}`}`);
    }
  }
  const all = [...(r.shots || []), ...(r.eye || []), ...(r.material || []), ...(r.dragon || []), ...(r.clips || [])].map((s) => s.passMs);
  const timed = all.filter((p) => p?.postMs != null);
  const implausible = timed.filter((p) => !p.plausible).length;
  const why = [...new Set(all.filter((p) => p?.postMs == null).map((p) => p?.reason).filter(Boolean))];
  lines.push(`  post-pass ms  ${timed.length}/${all.length} frame(s) and clip(s) timed, ${implausible} of them IMPLAUSIBLE (more GPU ms than the window lasted)${why.length ? `; untimed: ${why.join('; ')}` : ''}`);
  return lines;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/**
 * THE CHROME FOOTPRINT (plan docs/superpowers/plans/2026-10-29-crafty-w2d-hud.md, decision 1). The HUD lane's acceptance
 * is a share of the screen: how many of an eye-level frame's pixels the interface changes. Three shots of one held page
 * (lookbook.mjs chromeOf: the page's animation frames are held, so the canvas shows one rendered frame throughout):
 * `on`, the frame as a player sees it; `hudOff`, the same with the HUD's own elements hidden and the canvas and the touch
 * layer shown; `world`, the canvas alone. A pixel is the HUD's when `on` and `hudOff` differ there by more than
 * `tolerance` in any channel, and the touch layer's (its scrim, ring and buttons, reported apart) when `hudOff` and
 * `world` do. The rule reads no palette, so a world texture near a surface colour is never lent to the HUD, and a
 * translucent panel counts wherever it changes what is under it by more than `tolerance`. Its blind spot is the same
 * rule seen from the other side: a surface that changes the world under it by `tolerance` or less in every channel is
 * not counted. An opaque surface over world pixels of its own colour reads short of its area, and a faint translucent
 * one over a world near its colour reads nothing (lookbook-chrome-gates' warm-on-warm fixture: a 10% warm panel over
 * warm stone reads 8.28%, the same panel at alpha 0.15 reads 0%), so warm chrome over a warm world is under-read.
 * Returns the HUD's share and pixels, the touch layer's (null without a `world` shot) and the denominator.
 */
export const FOOTPRINT_TOLERANCE = 2;

export function chromeFootprint(on, hudOff, world, { width, height, tolerance = FOOTPRINT_TOLERANCE, keepMask = false } = {}) {
  const n = width * height * 4;
  for (const [name, buf] of [['on', on], ['hudOff', hudOff], ['world', world]]) {
    if (name === 'world' && buf == null) continue;
    if (!(width > 0 && height > 0) || !buf || buf.length !== n) {
      throw new RangeError(`chromeFootprint: ${width}x${height} RGBA frames needed, got ${buf ? buf.length : buf} bytes for ${name}`);
    }
  }
  const differs = (a, b, i) => Math.abs(a[i] - b[i]) > tolerance || Math.abs(a[i + 1] - b[i + 1]) > tolerance
    || Math.abs(a[i + 2] - b[i + 2]) > tolerance;
  let pixels = 0, touchPixels = 0;
  const mask = keepMask ? new Uint8Array(width * height) : null;
  for (let i = 0; i < n; i += 4) {
    if (differs(on, hudOff, i)) { pixels += 1; if (mask) mask[i / 4] = 1; }
    if (world && differs(hudOff, world, i)) touchPixels += 1;
  }
  const checked = width * height;
  return { share: pixels / checked, pixels, touchShare: world ? touchPixels / checked : null, touchPixels: world ? touchPixels : null, checked,
    ...(mask ? { mask } : {}) };
}

/**
 * PURE. Where the HUD's footprint lies: each counted pixel of `mask` (width x height, 1 = HUD) given to the first of
 * `rects` ([{ id, x, y, right, bottom }] in CSS px) whose box, grown by `pad` CSS px on every side (an offset shadow,
 * a glow), holds it at `scale` device px per CSS px; the rest is `other`. Returns { [id]: share of the frame }, largest
 * first, so a run can say which surface holds the screen.
 */
export function footprintByRect(mask, { width, height, rects, scale = 1, pad = 8 }) {
  const boxes = rects.map((r) => ({ id: r.id, x0: (r.x - pad) * scale, y0: (r.y - pad) * scale, x1: (r.right + pad) * scale, y1: (r.bottom + pad) * scale }));
  const count = Object.fromEntries([...boxes.map((b) => [b.id, 0]), ['other', 0]]);
  for (let p = 0; p < width * height; p++) {
    if (!mask[p]) continue;
    const x = p % width, y = (p - x) / width;
    const hit = boxes.find((b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1);
    count[hit ? hit.id : 'other'] += 1;
  }
  const total = width * height;
  return Object.fromEntries(Object.entries(count).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => [k, Math.round((v / total) * 10000) / 10000]));
}

/** How many pixels of two shots of the held page differ (by more than FOOTPRINT_TOLERANCE): 0 when the page was still. */
export function framesMoved(a, b, { width, height, tolerance = FOOTPRINT_TOLERANCE } = {}) {
  return chromeFootprint(a, b, null, { width, height, tolerance }).pixels;
}

/** The share of a frame that may change between the first and last shot of a held page before its footprint is not
 *  read: a page that did not hold still would lend its motion to the HUD's count. */
export const HELD_MOVED_MAX = 0.001;

/**
 * THE COLOUR COUNT, the footprint's second column: the pixels within CHROME_TOLERANCE of the surface colours the BUILD
 * UNDER TEST gives these CSS variables (src/theme/cssVars.js), read from its page at shot time. It depends on the
 * palette in both directions (a world texture within 3 of a token counts; a translucent panel's blend does not), which
 * is why it is not the acceptance number.
 */
export const CHROME_VARS = Object.freeze([
  '--ui-ink', '--ui-panel', '--ui-panel-raise', '--ui-panel-frame', '--ui-panel-inset', '--ui-well', '--ui-slot',
  '--ui-control', '--ui-track',
]);
/** The largest per-channel difference at which a pixel still reads as a surface colour (a flat fill, an encoder's
 *  rounding); anti-aliased edges and text fall outside it. */
export const CHROME_TOLERANCE = 3;

/** `{ '--ui-panel': '22 33 58', ... }` (the channel strings cssVars.js writes) to `[{ name, rgb }]`, in CHROME_VARS
 *  order. A variable the build does not define, or one that does not parse as three channels, is left out. */
export function chromeColoursFrom(vars) {
  const out = [];
  for (const name of CHROME_VARS) {
    const parts = String(vars?.[name] ?? '').trim().split(/[\s,]+/).map(Number);
    if (parts.length === 3 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) out.push({ name, rgb: parts });
  }
  return out;
}

/**
 * The share of an RGBA8 frame's pixels in the chrome colours. A pixel counts once, under the first colour in the list it
 * lies within `tolerance` of on every channel, unless `off` is given and its pixel at the same place lies within
 * `tolerance` of that same colour: `off` is the canvas-only shot, so a dusk sky that happens to sit on a surface colour
 * is the WORLD and is not counted (`world`). Returns the share, the counted pixels by colour, the world matches set
 * aside and the denominator.
 */
export function chromeShare(on, off, { width, height, colours, tolerance = CHROME_TOLERANCE } = {}) {
  const n = width * height * 4;
  if (!(width > 0 && height > 0) || on.length !== n || (off && off.length !== n)) {
    throw new RangeError(`chromeShare: ${width}x${height} RGBA frames needed, got ${on.length}${off ? ` and ${off.length}` : ''} bytes`);
  }
  if (!Array.isArray(colours) || colours.length === 0) throw new RangeError('chromeShare: no chrome colours to count');
  const byColour = Object.fromEntries(colours.map((c) => [c.name, 0]));
  let pixels = 0, world = 0;
  const near = (buf, i, rgb) => Math.abs(buf[i] - rgb[0]) <= tolerance && Math.abs(buf[i + 1] - rgb[1]) <= tolerance
    && Math.abs(buf[i + 2] - rgb[2]) <= tolerance;
  for (let i = 0; i < n; i += 4) {
    for (const c of colours) {
      if (!near(on, i, c.rgb)) continue;
      if (off && near(off, i, c.rgb)) world += 1;
      else { pixels += 1; byColour[c.name] += 1; }
      break;
    }
  }
  const checked = width * height;
  return { share: pixels / checked, pixels, checked, world, byColour };
}

/** The chrome budget the HUD lane accepts against (brief "Acceptance on the live game"): 8% of an eye-level frame. */
export const CHROME_BUDGET = 0.08;

/** PURE. Whether an eye shot's chrome reading is the HUD at rest: a valid frame whose footprint was read on a held page
 *  and with no toast in the notification stack (every toast the game raises goes there: ui/notifications.js), so a
 *  dusk warning, a night's siege notice or a boss's call is never counted as the screen at rest. A target's nameplate
 *  is the HUD while the player looks at a mob, so a frame with one up counts. */
export function atRest(s) {
  return !!s?.valid && Number.isFinite(s.chrome?.share) && !(s.chrome.toasts > 0);
}

/** PURE. The run's chrome lines for a target's eye shots: the footprint over the frames at rest (the acceptance
 *  number), with how many of them had a nameplate up and how many drew the returning player's ember bar and coin count;
 *  then the colour count and the touch layer over the same frames; the nameplate twin (`chromeTarget`, each frame again
 *  with a target's nameplate raised); and what was set aside and why. */
export function chromeSummaryLines(eye) {
  const pct = (x) => `${(x * 100).toFixed(2)}%`;
  const rest = eye.filter(atRest);
  const unread = eye.filter((s) => s.valid && !Number.isFinite(s.chrome?.share));
  const toasted = eye.filter((s) => s.valid && Number.isFinite(s.chrome?.share) && s.chrome.toasts > 0);
  if (!rest.length) {
    return [`  chrome        NOT MEASURED on any valid eye frame at rest (${toasted.length} with a toast up, ${unread.length} unread: ${[...new Set(unread.map((s) => s.chrome?.why))].join('; ')})`];
  }
  const share = rest.map((s) => s.chrome.share);
  const plated = rest.filter((s) => s.chrome.target).length;
  const purse = rest.filter((s) => s.chrome.purse?.ember && s.chrome.purse?.coins).length;
  const lines = [`  chrome        ${rest.length} valid eye frame(s) at rest (${plated} with a nameplate up, counted; ${purse} with the ember bar and the coin count drawn): `
    + `footprint max ${pct(Math.max(...share))}, median ${pct(medianOf(share))}; `
    + `${share.filter((x) => x > CHROME_BUDGET).length} over the ${CHROME_BUDGET * 100}% budget; ${toasted.length} with a toast up and ${unread.length} unread set aside`];
  const plate = eye.filter((s) => atRest(s) && s.chromeTarget && atRest({ valid: true, chrome: s.chromeTarget })).map((s) => s.chromeTarget.share);
  if (eye.some((s) => s.chromeTarget)) {
    lines.push(plate.length
      ? `  nameplate     ${plate.length} frame(s) with a target's nameplate raised: footprint max ${pct(Math.max(...plate))}, median ${pct(medianOf(plate))}; ${plate.filter((x) => x > CHROME_BUDGET).length} over the budget`
      : '  nameplate     NOT MEASURED on any frame at rest');
  }
  const colour = rest.map((s) => s.chrome.colourShare).filter(Number.isFinite);
  if (colour.length) lines.push(`  chrome colour ${colour.length} frame(s): max ${pct(Math.max(...colour))}, median ${pct(medianOf(colour))} (second column; it reads the palette)`);
  const touch = rest.map((s) => s.chrome.touchShare).filter(Number.isFinite);
  if (touch.length) lines.push(`  touch layer   ${touch.length} frame(s): max ${pct(Math.max(...touch))}, median ${pct(medianOf(touch))} (scrim, ring and buttons; not in the footprint)`);
  const card = eye.filter((s) => atRest(s) && s.chromeCard && atRest({ valid: true, chrome: s.chromeCard })).map((s) => s.chromeCard.share);
  if (eye.some((s) => s.chromeCard)) {
    lines.push(card.length
      ? `  first-run card ${card.length} frame(s) with the card up: footprint max ${pct(Math.max(...card))}, median ${pct(medianOf(card))}; ${card.filter((x) => x > CHROME_BUDGET).length} over the budget`
      : '  first-run card NOT MEASURED on any frame at rest');
  }
  return lines;
}

/**
 * THE HANDS SET (plan docs/superpowers/plans/2026-10-29-crafty-w2e-hands.md). At each time the player's eye is shot
 * with the hands on, then twice more through a pose at that exact eye and direction (a pose hides the hands). A hand
 * pixel lies below `fromY` of the frame, differs from the first hidden frame by more than `threshold` in some 8-bit
 * channel, and is STABLE: the two hidden frames agree there within `threshold / 2`, so grass sway, motes and cloud
 * drift between the shots are not counted as hands. The HUD is in every frame and drops out.
 */
export const HAND_MASK = Object.freeze({ threshold: 24, fromY: 0.55, minShare: 0.015 });
/** The bearing the hands set faces: Old Pike's tower over open meadow, ground under the hands. */
export const HANDS_HEADING = 240;

/**
 * Hand-pixel statistics over three RGBA8 frames of `width` x `height`: `on` (hands shown), `off` and `off2` (hidden).
 * Luma is Rec. 709 weights on the encoded 8-bit values of `on`. Returns the mask's size and the denominator it was
 * drawn from, the mean and median luma, the mean colour, the hand pixels in the frame's left and right halves, and
 * how many pixels were dropped as unstable.
 */
export function handPixelStats(on, off, off2, { width, height, threshold = HAND_MASK.threshold, fromY = HAND_MASK.fromY } = {}) {
  const n = width * height * 4;
  if (!(width > 0 && height > 0) || on.length !== n || off.length !== n || off2.length !== n) {
    throw new RangeError(`handPixelStats: three ${width}x${height} RGBA frames needed, got ${on.length}, ${off.length}, ${off2.length} bytes`);
  }
  const hist = new Uint32Array(256);
  let pixels = 0, unstable = 0, r = 0, g = 0, b = 0, left = 0, right = 0;
  const y0 = Math.floor(height * fromY);
  for (let y = y0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const d = Math.max(Math.abs(on[i] - off[i]), Math.abs(on[i + 1] - off[i + 1]), Math.abs(on[i + 2] - off[i + 2]));
      if (d <= threshold) continue;
      const noise = Math.max(Math.abs(off[i] - off2[i]), Math.abs(off[i + 1] - off2[i + 1]), Math.abs(off[i + 2] - off2[i + 2]));
      if (noise > threshold / 2) { unstable += 1; continue; }
      pixels += 1;
      r += on[i]; g += on[i + 1]; b += on[i + 2];
      hist[Math.round(0.2126 * on[i] + 0.7152 * on[i + 1] + 0.0722 * on[i + 2])] += 1;
      if (x < width / 2) left += 1; else right += 1;
    }
  }
  let median = null;
  if (pixels > 0) {
    let seen = 0;
    for (let v = 0; v < 256; v++) { seen += hist[v]; if (seen * 2 >= pixels) { median = v; break; } }
  }
  const checked = (height - y0) * width;
  return {
    pixels, checked, share: pixels / (width * height), unstable, left, right,
    meanLuma: pixels ? (0.2126 * r + 0.7152 * g + 0.0722 * b) / pixels : null,
    medianLuma: median,
    meanRGB: pixels ? [r / pixels, g / pixels, b / pixels] : null,
  };
}

/** The unit vector a camera at compass `heading` (0 north = -Z, 90 east = +X) and `pitch` (degrees, up positive) faces. */
export function facing(heading, pitch = 0) {
  const h = (heading * Math.PI) / 180, p = (pitch * Math.PI) / 180;
  return [Math.sin(h) * Math.cos(p), Math.sin(p), -Math.cos(h) * Math.cos(p)];
}

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
      const facts = [`cycle ${esc(s.cycle)} (at ${esc(Number(s.cycleAtShot).toFixed(3))})`, `tier ${esc(s.tier)}`, `dpr ${esc(s.dpr)}`, `console errors ${esc(s.consoleErrors)}`,
        ...(Number.isFinite(s.chrome?.share) ? [`chrome ${esc((s.chrome.share * 100).toFixed(2))}%`] : []),
        ...(Number.isFinite(s.chrome?.colourShare) ? [`colour ${esc((s.chrome.colourShare * 100).toFixed(2))}%`] : []),
        ...(Number.isFinite(s.chrome?.touchShare) ? [`touch ${esc((s.chrome.touchShare * 100).toFixed(2))}%`] : []),
        ...(s.chrome?.toasts > 0 ? [`${esc(s.chrome.toasts)} toast(s) up: not at rest`] : [])].join(' · ');
      const bad = s.valid ? '' : `<p class="bad">INVALID: ${esc((s.why || []).join('; '))}</p>`;
      return `<figure class="${s.valid ? 'ok' : 'invalid'}"><a href="${src}"><img src="${src}" alt="${esc(alt)}" loading="lazy"></a>` +
        `<figcaption><b>${esc(title)}</b> · ${facts}${passNote(s.passMs)}${bad}</figcaption></figure>`;
    };
    const figs = (t.shots || []).map((s) => figure(s, s.place, `${s.place} at ${s.cycle}`)).join('\n');
    const eye = (t.eye || []).map((s) => figure(s, `eye, facing ${s.heading}`, `eye level facing ${s.heading} at ${s.cycle}`)).join('\n');
    const material = (t.material || []).map((s) => figure(s, `${s.kind}, eye level`, `${s.kind} at eye level at ${s.cycle}`)).join('\n');
    const dragon = (t.dragon || []).map((s) => figure(s, `dragon, ${s.pose}`, `the dragon held ${s.pose} at ${s.cycle}`)).join('\n');
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
      `${sub('Hero shots', figs)}${sub('Eye level, hands and HUD on', eye)}${sub('Material sights, eye level', material)}${sub('The dragon arena', dragon)}${sub('Walking, real input', clips)}</section>`;
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
