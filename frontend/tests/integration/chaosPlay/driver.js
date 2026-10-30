// The chaos player: a seeded session of short episodes, each a thing a player does when they are clicking and walking
// at random (Kevin, 2026-10-30: "left click / right clicking chaotically" near the ocean). Every session presses into a
// wall, swaps form, falls through the void and saves then loads, in a seeded order; the rest is wandering with clicks.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { BEAST_FORMS } from '../../../src/game/beasts.js';
import {
  makeSession, tick, lookDir, buildRay, rightClick, leftClick, enterForm, exitForm, voidFall, writeSave, loadSave,
  checkEscape, finishSession, mulberry32,
} from './harness.js';

const ELEMENTS = Object.keys(BEAST_FORMS);
const SPOT_SALT = { shore: 11, cliff: 23, cave: 37, overhang: 41, field: 53, origin: 67 };
/** The shape a session saves in: the base, or one of the four forms, rotated over a place's eight sessions. */
const SAVE_FORMS = [null, ...ELEMENTS];
const pick = (rnd, list) => list[Math.floor(rnd() * list.length)];

/** The heading of the nearest wall within 3 m at the body's height, or null. */
function nearestWall(S) {
  const t = S.p.body.translation();
  let best = null;
  for (let k = 0; k < 16; k++) {
    const yaw = (k * Math.PI) / 8;
    const hit = S.world.castRay(new RAPIER.Ray({ x: t.x, y: t.y, z: t.z }, { x: Math.cos(yaw), y: 0, z: Math.sin(yaw) }), 3, true, undefined, undefined, undefined, S.p.body, S.p.filter);
    if (hit && (!best || hit.timeOfImpact < best.toi)) best = { yaw, toi: hit.timeOfImpact };
  }
  return best;
}
function homeYaw(S) {
  const t = S.p.body.translation();
  return Math.atan2(S.home.z - t.z, S.home.x - t.x);
}
function farFromHome(S) {
  const t = S.p.body.translation();
  return Math.hypot(t.x - S.home.x, t.z - S.home.z) > S.home.roam;
}

function randomRight(S, rnd, yaw) {
  const r = rnd();
  let h = null;
  if (r < 0.25) {
    const w = nearestWall(S);
    h = buildRay(S, lookDir(w ? w.yaw : yaw, (rnd() - 0.5) * 0.5));
  } else if (r < 0.45) h = buildRay(S, lookDir(rnd() * 6.283, -1.55));
  else if (r < 0.6) h = buildRay(S, lookDir(yaw, -0.5 - rnd() * 0.5));
  else if (r < 0.7) h = eyeCellHit(S, rnd);
  else h = buildRay(S, lookDir(rnd() * 6.283, -1.55 + rnd() * 2.0));
  if (!h) return;
  const m = rnd();
  if (m < 0.6) rightClick(S, h, 'single', 1);
  else if (m < 0.8) rightClick(S, h, 'cube', 2 + Math.floor(rnd() * 2));
  else rightClick(S, h, m < 0.9 ? 'wall' : 'floor', 2 + Math.floor(rnd() * 3));
}
/** A hit whose placement cell is the eye's own cell (a ray from a bobbing or shaken camera lands one like it). */
function eyeCellHit(S, rnd) {
  const t = S.p.body.translation();
  const e = { x: t.x, y: t.y + 0.67, z: t.z };
  const c = [Math.floor(e.x), Math.floor(e.y), Math.floor(e.z)];
  const axis = Math.floor(rnd() * 4);
  const n = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]][axis];
  // The hit lies on the face of the eye's cell opposite the normal, so hitPoint + normal * 0.01 is inside the cell.
  const hp = new THREE.Vector3(c[0] + 0.5 - n[0] * 0.5, c[1] + 0.5, c[2] + 0.5 - n[2] * 0.5);
  return { toi: 0.3, normal: { x: n[0], y: n[1], z: n[2] }, direction: new THREE.Vector3(-n[0] * 0.3, 0, -n[2] * 0.3), hitPoint: hp };
}
function randomLeft(S, rnd, yaw) {
  const r = rnd();
  let h;
  if (r < 0.3) h = buildRay(S, lookDir(rnd() * 6.283, -1.55));
  else if (r < 0.55) { const w = nearestWall(S); h = buildRay(S, lookDir(w ? w.yaw : yaw, (rnd() - 0.5) * 0.8)); }
  else h = buildRay(S, lookDir(rnd() * 6.283, -1.55 + rnd() * 2.0));
  if (h) leftClick(S, h);
}

function frames(S, n, input, clicks = null) {
  for (let i = 0; i < n; i++) {
    if (clicks) clicks(i);
    tick(S, typeof input === 'function' ? input(i) : input);
    if (S.f % S.K === 0) checkEscape(S);
  }
}

const EPISODES = {
  wander(S, rnd) {
    let yaw = rnd() * 6.283;
    frames(S, 20 + Math.floor(rnd() * 25), (i) => {
      if (i % 12 === 0) yaw = farFromHome(S) ? homeYaw(S) : rnd() * 6.283;
      return { yaw, forward: rnd() < 0.85, jump: rnd() < 0.06 };
    }, () => {
      if (rnd() >= 0.3) return;
      // A fifth of the time two clicks land between one pair of frames: the second build ray is cast before any step has
      // put the first click's new cell in the broad phase (registry REVIEW:fix-invisible-box:rays-before-step).
      const pair = rnd() < 0.2;
      if (pair) S.stats.clickPairs++;
      for (let k = pair ? 2 : 1; k > 0; k--) (rnd() < 0.55 ? randomRight : randomLeft)(S, rnd, yaw);
    });
  },
  press(S, rnd) {
    const w = nearestWall(S);
    const yaw = w ? w.yaw : rnd() * 6.283;
    const n = 30 + Math.floor(rnd() * 15);
    const swapAt = rnd() < 0.6 ? 18 : -1;
    frames(S, n, { yaw, forward: true, jump: false }, (i) => {
      if (i === 15) { const h = buildRay(S, lookDir(yaw, (rnd() - 0.5) * 0.4)); if (h) rightClick(S, h, rnd() < 0.7 ? 'single' : 'cube', 2); }
      if (i === swapAt) enterForm(S, pick(rnd, ['ice', 'arcane', ...ELEMENTS]));
      if (i === n - 4 && rnd() < 0.5) exitForm(S);
      if (i > 15 && rnd() < 0.15) randomLeft(S, rnd, yaw);
    });
  },
  feet(S, rnd) {
    const yaw = rnd() * 6.283;
    frames(S, 4, { yaw, forward: false });
    const down = () => buildRay(S, lookDir(yaw, -1.55));
    let h = down();
    if (h) rightClick(S, h, pick(rnd, ['single', 'single', 'cube', 'floor']), 3);
    frames(S, 4, { yaw, forward: false });
    h = down();
    if (h && rnd() < 0.5) leftClick(S, h);
    // a pillar: jump, and at the apex place under the feet
    frames(S, 1, { yaw, forward: false, jump: true });
    frames(S, 18, { yaw, forward: false }, (i) => { if (i === 14) { const d = down(); if (d) rightClick(S, d, 'single', 1); } });
  },
  eye(S, rnd) {
    rightClick(S, eyeCellHit(S, rnd), rnd() < 0.7 ? 'single' : 'cube', 2);
    frames(S, 6, { yaw: rnd() * 6.283, forward: rnd() < 0.5 });
  },
  swap(S, rnd) {
    enterForm(S, pick(rnd, ELEMENTS));
    let yaw = rnd() * 6.283;
    frames(S, 40 + Math.floor(rnd() * 40), (i) => {
      if (i % 15 === 0) yaw = farFromHome(S) ? homeYaw(S) : rnd() * 6.283;
      return { yaw, forward: rnd() < 0.8, jump: rnd() < 0.05 };
    }, () => { if (rnd() < 0.2) (rnd() < 0.5 ? randomRight : randomLeft)(S, rnd, yaw); });
    exitForm(S);
    frames(S, 6, { yaw, forward: false });
  },
  origin(S, rnd) {
    // to the origin column's middle, then dig it, and sometimes build back on it
    for (let i = 0; i < 90; i++) {
      const t = S.p.body.translation();
      const dx = 0.5 - t.x, dz = 0.5 - t.z;
      if (Math.hypot(dx, dz) < 0.2) break;
      frames(S, 1, { yaw: Math.atan2(dz, dx), forward: true });
    }
    const digs = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < digs; i++) {
      const h = buildRay(S, lookDir(0, -1.5707));
      if (h) leftClick(S, h);
      frames(S, 25, { yaw: 0, forward: false });
    }
    if (rnd() < 0.5) {
      frames(S, 1, { yaw: 0, forward: false, jump: true });
      frames(S, 14, { yaw: 0, forward: false });
      const h = buildRay(S, lookDir(0, -1.5707));
      if (h) rightClick(S, h, 'single', 1);
      frames(S, 20, { yaw: 0, forward: false });
    }
    // out of the hole: jump toward home
    frames(S, 40, { yaw: homeYaw(S), forward: true, jump: true });
  },
  void(S, rnd) {
    voidFall(S);
    frames(S, 30, { yaw: rnd() * 6.283, forward: false });
    S.home = { x: 0.5, z: 0.5, roam: 3 };
  },
  saveLoad(S, rnd) {
    // Saved and loaded from the World Manager's panel, which takes the input: the player stands still for both. The save
    // is made in the session's form (a file's sessions try every form and the base shape), pressed against the nearest
    // wall where there is one (a narrow form stands closer to it than the base capsule can), and a third of the saves are
    // written as the Save button wrote them before DECISIONS 2026-10-30 item 153 (the camera, rounded), as saves on disk
    // still hold.
    if (S.saveForm) enterForm(S, S.saveForm);
    const w = nearestWall(S);
    if (w) frames(S, 20, { yaw: w.yaw, forward: true, jump: false });
    frames(S, 15, { yaw: 0, forward: false });
    const data = writeSave(S, pick(rnd, ['manual', 'auto', 'legacy']));
    EPISODES.wander(S, rnd);
    frames(S, 15, { yaw: 0, forward: false });
    loadSave(S, data);
    frames(S, 30 + 2 * S.lag, { yaw: rnd() * 6.283, forward: false });
  },
};

/** One seeded session; returns its state (stats, violations, counts) once it has ended and been checked. */
export function playSession({ spot, seed, hz, lag, budget = 420, K = 90, tol }) {
  const rnd = mulberry32(seed * 7919 + lag * 131 + hz * 7 + SPOT_SALT[spot]);
  const S = makeSession({ spot, rnd, hz, lag, tol });
  S.K = K;
  S.saveForm = SAVE_FORMS[([0, 2, 4, 8].indexOf(lag) + (hz === 120 ? 4 : 0) + seed + SPOT_SALT[spot]) % SAVE_FORMS.length];
  // Every session presses into a wall, swaps form, builds at its feet and its eye, and saves then loads, in a seeded
  // order at its own spot; the fall through the void comes last, since every respawn lands on the origin column. A
  // session at the origin digs and builds on that column first, so its respawn reads an edited column.
  const order = ['press', 'swap', 'saveLoad', 'feet', 'eye'].map((m) => [rnd(), m]).sort((a, b) => a[0] - b[0]).map(([, m]) => m);
  if (spot === 'origin') order.unshift('origin');
  for (const ep of order) {
    EPISODES[ep](S, rnd);
    if (rnd() < 0.7) EPISODES.wander(S, rnd);
  }
  while (S.f < budget) EPISODES[pick(rnd, ['wander', 'wander', 'press', 'feet', 'eye', 'swap'])](S, rnd);
  exitForm(S);
  EPISODES.void(S, rnd);
  EPISODES.wander(S, rnd);
  // let every edit land, then the end-of-session checks
  for (let i = 0; i < 40 && (S.worker.queue.length || S.reload); i++) tick(S, { yaw: 0, forward: false });
  for (let i = 0; i < 4; i++) tick(S, { yaw: 0, forward: false });
  finishSession(S);
  checkEscape(S);
  S.end = { standIns: S.cells.size(), queued: S.worker.queue.length };
  return S;
}
