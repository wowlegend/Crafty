// dragonTelegraphs.js — what the dragon's ground decals show for each windup (DECISIONS 2026-10-30 item 124). Pure; the
// pool of decal meshes is render/BossEntity.jsx's, shown and hidden from its one frame loop. Every size and angle comes
// from the move machine (game/dragonMoves.js), so a decal covers exactly the ground its move lands on.
import { windupRamp } from '../game/attackTelegraph.js';
import { DRAGON_MOVES } from '../game/dragonMoves.js';

/** The unit geometry of each decal shape (scaled by the decal's radius): the roar's and the summons' ring an outline
 *  a tenth of its radius wide, the fireball's mark a filled disc, the bite's a filled sector of its arc from the dragon out, centred
 *  on its local +X. RingGeometry and CircleGeometry argument lists, shared by the meshes and the gate that proves them. */
export const DECAL_GEOMETRY = Object.freeze({
  ring: Object.freeze([0.9, 1, 64]),
  disc: Object.freeze([1, 40]),
  arc: Object.freeze([1, 32, -DRAGON_MOVES.bite.arc / 2, DRAGON_MOVES.bite.arc]),
});

/**
 * The decal for a windup event from game/dragonMoves.js windUp, with the dragon at `boss` ({ x, z }): the bite and
 * dive-bite a sector of their reach about their heading, the roar and the summons a ring of their radius on the dragon,
 * the fireball a disc of the radius it hits within on its mark. The lava gets none: its zone's own forming ring is its
 * tell.
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
      return { shape: 'disc', x: ev.at.x, z: ev.at.z, radius: ev.radius };
    default:
      return null;
  }
}

/** The decal's opacity at `now`: 0.25 when the windup starts, rising to 0.75 at the strike. */
export function decalOpacity(now, until, windupMs) {
  return 0.25 + 0.5 * windupRamp(now, until, windupMs);
}

/**
 * The z rotation that points a flat sector (three's Ring- or CircleGeometry, centred on its local +X, laid flat by an x
 * rotation of -PI/2) along `heading` (world radians: 0 is +Z, PI/2 is +X, the dragon's own convention).
 */
export function decalSpin(heading) {
  return Math.atan2(-Math.cos(heading), Math.sin(heading));
}

/** Lay decal `d` (decalFor's) flat on the ground at height `y`: `obj` is any three Object3D carrying DECAL_GEOMETRY. */
export function placeDecal(obj, d, y) {
  obj.position.set(d.x, y, d.z);
  obj.scale.setScalar(d.radius);
  obj.rotation.set(-Math.PI / 2, 0, d.shape === 'arc' ? decalSpin(d.heading) : 0);
}
