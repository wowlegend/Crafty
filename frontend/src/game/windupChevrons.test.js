// windupChevrons.test.js — which windups the player cannot see, and where their chevrons sit (combat-stance Task 6).
// Plan: docs/superpowers/plans/2026-10-27-crafty-combat-stance.md, Task 6.
//
// Mutation-Proof: scripts/dev/mutate.sh on src/game/windupChevrons.js, 11 tests, 2026-10-27. RED: C6a the off-screen
//   predicate negated; C6b the |y| term dropped (only the steep-pitch test catches it, as designed); C6c the sort
//   dropped; C6d the bottom inset ignored; C6e the range measured flat (no dy); C6f the range test strict (<);
//   C6g the x margin dropped; C6h the stagger check dropped; C6i windupUntil >= now; C6j the ramp over 2x WINDUP_MS;
//   C6k the sort reversed; C6l the cap keeps the LATEST four; C6m the ray from the frame's centre, not the screen's;
//   C6n rotDeg negated; C6o the yaw ignored; C6p screen y flipped; C6q the far boundary instead of the near;
//   C6r the hostile check dropped. C6z (a comment edit, the identity mutant) SURVIVED.
import { describe, it, expect } from 'vitest';
import {
  offscreenWindups, chevronPlacement, touchBottomInsetPx,
  CHEVRON_MAX, CHEVRON_RANGE_M, ON_SCREEN_MARGIN,
  TOP_INSET_PX, SIDE_INSET_PX, BOTTOM_INSET_DESKTOP_PX,
} from './windupChevrons.js';

const NOW = 100000; // the world clock, ms
const PLAYER = { x: 0, y: 0, z: 0 };

let nextId = 1;
function mob({ x = 0, y = 0, z = 0, windupIn = 200, staggerUntil = 0, passive = false, health = 50, dyingUntil, isNPC } = {}) {
  return {
    id: nextId++, isMob: true, type: 'zombie', position: { x, y, z }, health, passive,
    windupUntil: windupIn == null ? 0 : NOW + windupIn, staggerUntil, dyingUntil, isNPC,
  };
}

// A pinhole camera at the player, level, looking along `yaw` (three.js YXZ: forward (-sin, -cos), right (cos, -sin)).
// A point behind the eye plane gets NDC z > 1, as Vector3.project gives it.
const TAN_HALF = Math.tan((75 * Math.PI) / 360);
const ASPECT = 1.6;
function pinhole(yaw) {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  const ndc = { x: 0, y: 0, z: 0 };
  return (p) => {
    const dx = p.x - PLAYER.x, dy = p.y - PLAYER.y, dz = p.z - PLAYER.z;
    const fwd = -dx * s - dz * c;
    const rgt = dx * c - dz * s;
    if (fwd <= 0) { ndc.x = 0; ndc.y = 0; ndc.z = 2; return ndc; }
    ndc.x = rgt / (fwd * TAN_HALF * ASPECT);
    ndc.y = dy / (fwd * TAN_HALF);
    ndc.z = 0.5;
    return ndc;
  };
}
const fixed = (x, y, z) => () => ({ x, y, z });
const pool = () => Array.from({ length: 4 }, () => ({ id: 0, angle: 0, ramp: 0 }));

describe('offscreenWindups', () => {
  it('a windup behind the player is off screen, at angle ±π', () => {
    const behind = mob({ z: 4 });
    const out = pool();
    const n = offscreenWindups([behind], PLAYER, 0, pinhole(0), NOW, out);
    expect(n).toBe(1);
    expect(out[0].id).toBe(behind.id);
    expect(Math.abs(out[0].angle)).toBeCloseTo(Math.PI, 9);
  });

  it('a windup dead ahead and in the frustum is not listed', () => {
    // PRESENCE first: the same call, the same instrument, lists the one behind.
    const ahead = mob({ z: -4 });
    const behind = mob({ z: 4 });
    const out = pool();
    const n = offscreenWindups([ahead, behind], PLAYER, 0, pinhole(0), NOW, out);
    expect(n).toBe(1);
    expect(out[0].id).toBe(behind.id);
    // and a windup to the side, outside the 75 degree view, is listed at about +90 degrees
    const side = mob({ x: 4 });
    expect(offscreenWindups([ahead, side], PLAYER, 0, pinhole(0), NOW, out)).toBe(1);
    expect(out[0].id).toBe(side.id);
    expect(out[0].angle).toBeCloseTo(Math.PI / 2, 9);
  });

  it('a mob is judged by its body, not its base: feet below the frame with the torso in view gets no chevron', () => {
    // The pinhole is at the eye (y 0). A husk 2 m ahead standing 1.6 m below it has its base at NDC y -1.04, past the
    // edge, and its body's centre (its base plus half its 1.6 m body) at -0.52, in view.
    const out = pool();
    const close = mob({ z: -2, y: -1.6 });
    expect(offscreenWindups([close], PLAYER, 0, pinhole(0), NOW, out), 'a husk whose torso is in view got a chevron').toBe(0);
    // PRESENCE: the same projection lists a husk whose body is below the frame as well
    const below = mob({ z: -2, y: -3.0 });
    expect(offscreenWindups([below], PLAYER, 0, pinhole(0), NOW, out)).toBe(1);
    // a mob's own body size (a hybrid's) wins over its type's: a 3 m body here is in view, a husk's 1.6 m body is not
    const tall = { ...mob({ z: -2, y: -2.4 }), bodySize: [1, 3.0, 1] };
    expect(offscreenWindups([tall], PLAYER, 0, pinhole(0), NOW, out), 'the entity\'s own body size was ignored').toBe(0);
    expect(offscreenWindups([mob({ z: -2, y: -2.4 })], PLAYER, 0, pinhole(0), NOW, out)).toBe(1);
  });

  it('a windup ahead but above the frustum is off screen (Review Focus 4)', () => {
    // A steep pitch: the mob is horizontally dead ahead, yet the camera's projection puts it above the view.
    const ahead = mob({ z: -2.5 });
    const out = pool();
    expect(offscreenWindups([ahead], PLAYER, 0, fixed(0, 1.4, 0.5), NOW, out)).toBe(1);
    expect(out[0].angle).toBeCloseTo(0, 9);
    // below the view too
    expect(offscreenWindups([ahead], PLAYER, 0, fixed(0, -1.4, 0.5), NOW, out)).toBe(1);
    // the margin: inside 1 - 0.06 is on screen, beyond it is not
    expect(offscreenWindups([ahead], PLAYER, 0, fixed(0, 0.9, 0.5), NOW, out)).toBe(0);
    expect(offscreenWindups([ahead], PLAYER, 0, fixed(0, 0.97, 0.5), NOW, out)).toBe(1);
    expect(offscreenWindups([ahead], PLAYER, 0, fixed(0.9, 0, 0.5), NOW, out)).toBe(0);
    expect(offscreenWindups([ahead], PLAYER, 0, fixed(-0.97, 0, 0.5), NOW, out)).toBe(1);
    expect(ON_SCREEN_MARGIN).toBe(0.06);
  });

  it('not winding up, staggered, passive, dead or beyond 12 m: not listed', () => {
    const listed = mob({ z: 11.9 });
    const atRange = mob({ z: 12 }); // 3D distance exactly CHEVRON_RANGE_M: listed (<=)
    const rejects = [
      mob({ z: 4, windupIn: null }),             // not winding up
      mob({ z: 4, windupIn: 0 }),                // its windup ends now: struck or cancelled, not coming
      mob({ z: 4, windupIn: -50 }),              // expired
      mob({ z: 4, staggerUntil: NOW + 500 }),    // staggered (a perfect dodge cancelled it)
      mob({ z: 4, passive: true }),              // livestock
      mob({ z: 4, health: 0 }),                  // dead
      mob({ z: 4, dyingUntil: NOW + 300 }),      // mid-dissolve
      mob({ z: 4, isNPC: true }),                // a hub NPC
      mob({ z: 12.5 }),                          // beyond 12 m
      mob({ y: 11, z: 6 }),                      // 6 m across, 12.5 m in 3D: the range is 3D
    ];
    const out = pool();
    const n = offscreenWindups([...rejects, listed, atRange], PLAYER, 0, pinhole(0), NOW, out);
    expect(n).toBe(2);
    expect([out[0].id, out[1].id].sort((a, b) => a - b)).toEqual([listed.id, atRange.id].sort((a, b) => a - b));
    expect(CHEVRON_RANGE_M).toBe(12);
  });

  it('sorted by soonest strike, at most 4', () => {
    const dues = [300, 100, 500, 50, 200, 400];
    const mobs = dues.map((d, i) => mob({ x: i - 2.5, z: 5, windupIn: d }));
    const out = pool();
    const objects = new Set(out);
    const n = offscreenWindups(mobs, PLAYER, 0, pinhole(0), NOW, out);
    expect(CHEVRON_MAX).toBe(4);
    expect(n).toBe(4);
    const byDue = (d) => mobs[dues.indexOf(d)].id;
    expect(out.slice(0, n).map((o) => o.id)).toEqual([byDue(50), byDue(100), byDue(200), byDue(300)]);
    // allocation-free: every slot is still one of the four objects handed in
    expect(out.length).toBe(4);
    for (const o of out) expect(objects.has(o)).toBe(true);
    // fewer than four: the count, in order
    const two = [mob({ z: 5, windupIn: 250 }), mob({ z: 6, windupIn: 20 })];
    expect(offscreenWindups(two, PLAYER, 0, pinhole(0), NOW, out)).toBe(2);
    expect(out[0].id).toBe(two[1].id);
    expect(out[1].id).toBe(two[0].id);
  });

  it('ramp rises from 0 to 1 across the windup', () => {
    const out = pool();
    const ramps = [380, 285, 190, 95, 1].map((d) => {
      offscreenWindups([mob({ z: 4, windupIn: d })], PLAYER, 0, pinhole(0), NOW, out);
      return out[0].ramp;
    });
    expect(ramps[0]).toBe(0);
    expect(ramps[1]).toBeCloseTo(0.25, 9);
    expect(ramps[2]).toBeCloseTo(0.5, 9);
    expect(ramps[3]).toBeCloseTo(0.75, 9);
    expect(ramps[4]).toBeCloseTo(1 - 1 / 380, 9);
    // a planted windup due 2 s out has not begun to ramp
    offscreenWindups([mob({ z: 4, windupIn: 2000 })], PLAYER, 0, pinhole(0), NOW, out);
    expect(out[0].ramp).toBe(0);
  });

  it('turns with the camera: yaw pi puts the mob behind the old view ahead of the new one', () => {
    const north = mob({ z: -4 }); // ahead at yaw 0
    const out = pool();
    expect(offscreenWindups([north], PLAYER, 0, pinhole(0), NOW, out)).toBe(0);
    expect(offscreenWindups([north], PLAYER, Math.PI, pinhole(Math.PI), NOW, out)).toBe(1);
    expect(Math.abs(out[0].angle)).toBeCloseTo(Math.PI, 9);
  });
});

describe('chevronPlacement', () => {
  // The rectangle is written in LITERALS: computed from the module's constants it would move with a mutant of them.
  const SIZES = [
    { w: 1280, h: 800, bottom: 140 },   // desktop
    { w: 1194, h: 834, bottom: 262 },   // iPad Pro 11 landscape: round(0.11 * 834) + 170
    { w: 834, h: 1194, bottom: 301 },   // portrait: round(0.11 * 1194) + 170
  ];

  it('the insets are the plan\'s', () => {
    expect(TOP_INSET_PX).toBe(120);
    expect(SIDE_INSET_PX).toBe(96);
    expect(BOTTOM_INSET_DESKTOP_PX).toBe(140);
    expect(touchBottomInsetPx(834)).toBe(262);
    expect(touchBottomInsetPx(1194)).toBe(301);
  });

  it('placement stays inside the inset rectangle for 360 angles at 1280x800, 1194x834 and 834x1194', () => {
    let checked = 0;
    for (const { w, h, bottom } of SIZES) {
      const L = 96, R = w - 96, T = 120, B = h - bottom;
      const edges = { top: 0, right: 0, bottom: 0, left: 0 };
      for (let deg = -180; deg < 180; deg++) {
        const p = chevronPlacement((deg * Math.PI) / 180, w, h, bottom);
        expect(Number.isFinite(p.left) && Number.isFinite(p.top)).toBe(true);
        expect(p.left).toBeGreaterThanOrEqual(L - 0.5);
        expect(p.left).toBeLessThanOrEqual(R + 0.5);
        expect(p.top).toBeGreaterThanOrEqual(T - 0.5);
        expect(p.top).toBeLessThanOrEqual(B + 0.5);
        // ON the frame, not inside it: one coordinate sits on an edge
        const onEdge = Math.min(Math.abs(p.left - L), Math.abs(p.left - R), Math.abs(p.top - T), Math.abs(p.top - B));
        expect(onEdge).toBeLessThanOrEqual(0.5);
        if (Math.abs(p.top - T) <= 0.5) edges.top++;
        if (Math.abs(p.left - R) <= 0.5) edges.right++;
        if (Math.abs(p.top - B) <= 0.5) edges.bottom++;
        if (Math.abs(p.left - L) <= 0.5) edges.left++;
        checked++;
      }
      for (const k of Object.keys(edges)) expect(edges[k], `${w}x${h}: no angle reached the ${k} edge`).toBeGreaterThan(0);
    }
    expect(checked).toBe(3 * 360);
  });

  it('placement at angle 0 is top-centre, π/2 right-centre, π bottom-centre, -π/2 left-centre', () => {
    const w = 1280, h = 800, bottom = 140;
    const top = chevronPlacement(0, w, h, bottom);
    expect(top.left).toBeCloseTo(640, 6); expect(top.top).toBeCloseTo(120, 6); expect(top.rotDeg).toBeCloseTo(0, 9);
    const right = chevronPlacement(Math.PI / 2, w, h, bottom);
    expect(right.left).toBeCloseTo(1184, 6); expect(right.top).toBeCloseTo(400, 6); expect(right.rotDeg).toBeCloseTo(90, 9);
    const down = chevronPlacement(Math.PI, w, h, bottom);
    expect(down.left).toBeCloseTo(640, 6); expect(down.top).toBeCloseTo(660, 6); expect(down.rotDeg).toBeCloseTo(180, 9);
    const left = chevronPlacement(-Math.PI / 2, w, h, bottom);
    expect(left.left).toBeCloseTo(96, 6); expect(left.top).toBeCloseTo(400, 6); expect(left.rotDeg).toBeCloseTo(-90, 9);
    // the corner: 45 degrees on a wide screen meets the top edge right of centre, on the ray from the centre
    const d45 = chevronPlacement(Math.PI / 4, w, h, bottom);
    expect(d45.top).toBeCloseTo(120, 6);
    expect(d45.left - 640).toBeCloseTo(400 - 120, 6);
  });

  it('writes into a preallocated out when one is passed', () => {
    const out = { left: 0, top: 0, rotDeg: 0 };
    const r = chevronPlacement(Math.PI, 1280, 800, 140, out);
    expect(r).toBe(out);
    expect(out.top).toBeCloseTo(660, 6);
  });
});
