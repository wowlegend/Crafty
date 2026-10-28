// windupChevrons.js — which windups the player cannot see, and where their chevrons sit (masterpiece Phase 1,
// close-quarters combat). Plan: docs/superpowers/plans/2026-10-27-crafty-combat-stance.md, Task 6.
//
// PURE. No THREE, no React, no store. The HUD layer (ui/WindupChevrons.jsx) calls it from the HUD ticker with the
// camera's projection; the tests pass a fake one.
//
// WHY THE PROJECTION AND NOT THE BEARING. A windup is "seen" when it is in the camera's view, and the view pitches:
// looking up while building, a mob horizontally dead ahead is above the frustum, invisible, and still about to hit.
// A bearing test (|angle| < half the FOV) would call it seen. So the on-screen test is the projected NDC point, and
// only the chevron's PLACEMENT uses the planar bearing (game/damageDirection.js, 0 = ahead/top, +-pi = behind), the
// same convention as the damage-direction glow.
import { hitDirection } from './damageDirection.js';
import { windupRamp, WINDUP_MS } from './attackTelegraph.js';
import { isStaggered } from './perfectDodge.js';
import { isHostile } from '../combat/targeting.js';
import { ENGAGE_RADIUS_M } from './combatStance.js';

/** At most this many chevrons at once (the DOM pool's size). */
export const CHEVRON_MAX = 4;
/** A windup further than this (3D, m) gets no chevron: the stance's engage radius, so the two agree on "a fight". */
export const CHEVRON_RANGE_M = ENGAGE_RADIUS_M;
/** A projected point within this of the NDC edge counts as off screen: a mob at the very edge is not readable. */
export const ON_SCREEN_MARGIN = 0.06;
/** The edge frame the chevrons ride, inset from the safe area so it clears the HUD (px). */
export const TOP_INSET_PX = 120; // under the compass and the objective tracker
export const SIDE_INSET_PX = 96;
export const BOTTOM_INSET_DESKTOP_PX = 140; // over the hotbar
/** On touch the bottom inset clears the joystick and the action cluster, which scale with the screen's height. */
export function touchBottomInsetPx(h) {
  return Math.round(0.11 * h) + 170;
}
/**
 * Every edge of the frame stays at least this far (px) from the screen centre, where the crosshair and the imbue tell
 * sit. Round-1 review a: on touch the bottom inset exceeds half the height below about 436 px (every landscape iPhone),
 * so the frame's bottom edge rose above the centre and a windup behind the player drew its chevron ON the crosshair.
 * Where the insets do not fit, the frame now gives way toward the HUD and the controls, never toward the centre.
 */
export const CENTRE_CLEAR_PX = 60;

const offScreen = (ndc) => ndc.z > 1 || Math.abs(ndc.x) > 1 - ON_SCREEN_MARGIN || Math.abs(ndc.y) > 1 - ON_SCREEN_MARGIN;

/**
 * The windups the player cannot see, soonest strike first, at most CHEVRON_MAX.
 * @param {Iterable} mobs  the ECS mobs (mobsQuery.entities)
 * @param {{x,y,z}} player the eye the projection is taken from (the camera position)
 * @param {number} yaw     the camera's yaw (rotation.y, YXZ)
 * @param {(pos) => {x,y,z}} project world position -> NDC (z > 1 behind the eye or past the far plane)
 * @param {number} worldNowMs the WORLD clock (windupUntil and staggerUntil are stamped on it)
 * @param {Array<{id,angle,ramp}>} out CHEVRON_MAX preallocated slots; filled in place, never reallocated
 * @returns {number} how many slots were filled
 */
export function offscreenWindups(mobs, player, yaw, project, worldNowMs, out) {
  let count = 0;
  const r2 = CHEVRON_RANGE_M * CHEVRON_RANGE_M;
  for (const m of mobs) {
    if (!isHostile(m) || !(m.windupUntil > worldNowMs) || isStaggered(m, worldNowMs)) continue;
    const p = m.position;
    const dx = p.x - player.x, dy = p.y - player.y, dz = p.z - player.z;
    if (dx * dx + dy * dy + dz * dz > r2) continue;
    if (!offScreen(project(p))) continue;
    const until = m.windupUntil;
    // Insert into the sorted top-CHEVRON_MAX by soonest strike. The slots are rotated, never replaced, so `out`
    // keeps the four objects it was handed.
    let i;
    if (count < CHEVRON_MAX) i = count++;
    else if (until < out[CHEVRON_MAX - 1].until) i = CHEVRON_MAX - 1;
    else continue;
    const slot = out[i];
    while (i > 0 && out[i - 1].until > until) {
      out[i] = out[i - 1];
      i--;
    }
    out[i] = slot;
    slot.id = m.id;
    slot.until = until;
    slot.angle = hitDirection(player, p, yaw);
    slot.ramp = windupRamp(worldNowMs, until, WINDUP_MS);
  }
  return count;
}

/**
 * Where a chevron for screen angle `angle` sits: the ray from the container's centre meets the inset rectangle
 * [SIDE, w - SIDE] x [TOP, h - bottomInsetPx], each edge held at least CENTRE_CLEAR_PX from the centre. `rotDeg`
 * points the chevron outward, toward the mob.
 * @returns {{left:number, top:number, rotDeg:number}} px inside the safe-area container (written into `out`)
 */
export function chevronPlacement(angle, w, h, bottomInsetPx, out = { left: 0, top: 0, rotDeg: 0 }) {
  const cx = w / 2, cy = h / 2;
  const L = Math.min(SIDE_INSET_PX, cx - CENTRE_CLEAR_PX), R = Math.max(w - SIDE_INSET_PX, cx + CENTRE_CLEAR_PX);
  const T = Math.min(TOP_INSET_PX, cy - CENTRE_CLEAR_PX), B = Math.max(h - bottomInsetPx, cy + CENTRE_CLEAR_PX);
  const dx = Math.sin(angle), dy = -Math.cos(angle); // screen y grows downward; angle 0 is up
  const tx = dx > 0 ? (R - cx) / dx : dx < 0 ? (L - cx) / dx : Infinity;
  const ty = dy > 0 ? (B - cy) / dy : dy < 0 ? (T - cy) / dy : Infinity;
  const t = Math.max(0, Math.min(tx, ty));
  out.left = cx + t * dx;
  out.top = cy + t * dy;
  out.rotDeg = (angle * 180) / Math.PI;
  return out;
}
