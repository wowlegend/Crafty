// dragonTelegraphs.js — what the dragon's ground decals show for each windup (DECISIONS 2026-10-30 item 124). Pure; the
// pool of decal meshes is render/BossEntity.jsx's, shown and hidden from its one frame loop.
import { windupRamp } from '../game/attackTelegraph.js';

/** The bite's arc on the ground: the quarter turn in front of its jaw (game/dragonMoves.js gives the same). */
export const BITE_DECAL_ARC = Math.PI / 2;
/** The fireball's mark where it aims: the distance at which it hits (render/BossEntity.jsx, 1.6 m). */
export const FIREBALL_DECAL_R = 1.6;

/**
 * The decal for a windup event from game/dragonMoves.js stepDragon, with the dragon at `boss` ({ x, z }): the bite and
 * dive-bite an arc of their reach in the heading, the roar and the summons a ring of their radius on the dragon, the
 * fireball a disc where it aims. The lava gets none: its zone's own forming ring is its tell.
 */
export function decalFor(ev, boss) {
  switch (ev.move) {
    case 'bite':
    case 'diveBite':
      return { shape: 'arc', x: boss.x, z: boss.z, radius: ev.radius, heading: ev.heading };
    case 'roar':
    case 'summon':
      return { shape: 'ring', x: boss.x, z: boss.z, radius: ev.radius };
    case 'fireball':
      return { shape: 'disc', x: ev.at.x, z: ev.at.z, radius: FIREBALL_DECAL_R };
    default:
      return null;
  }
}

/** The decal's opacity at `now`: 0.25 when the windup starts, rising to 0.75 at the strike. */
export function decalOpacity(now, until, windupMs) {
  return 0.25 + 0.5 * windupRamp(now, until, windupMs);
}

/**
 * The z rotation that points a flat ring sector (three's RingGeometry, centred on its local +X, laid flat by an x
 * rotation of -PI/2) along `heading` (world radians: 0 is +Z, PI/2 is +X, the dragon's own convention).
 */
export function decalSpin(heading) {
  return Math.atan2(-Math.cos(heading), Math.sin(heading));
}
