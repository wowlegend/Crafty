/**
 * squadRoster.js — the bound squad as its world saves it (deep audit 2026-10-30, lane L3; the soulbind spec,
 * docs/superpowers/specs/2026-06-10-crafty-s2b3-soulbind-design.md: the roster persists in the progression slice, the
 * positions do not, and the squad comes back at the player). A creature is its type: a mob type (game/mobTypes.js) or a
 * hybrid's id (game/hybrids.js). Everything else it carries derives from the type, as a bind (game/allegiance.js
 * convertMobToAlly) and a fusion (hybridAlly) derive it, so the save holds no second copy of a stat. Pure.
 */
import { MOB_TYPES } from './mobTypes.js';
import { HYBRIDS, hybridAlly } from './hybrids.js';
import { isBindable } from './allegiance.js';

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/** A type a squad can hold: a hybrid, or a mob type a bind accepts. */
const allyType = (type) => typeof type === 'string' && (own(HYBRIDS, type) || (own(MOB_TYPES, type) && isBindable(type)));

/** The roster of `allies` (ECS ally entities): one `{ type }` each, in their order. */
export function rosterOf(allies) {
  return allies.filter((a) => a && allyType(a.type)).map((a) => ({ type: a.type }));
}

/** A save's roster, kept to the entries a squad can hold; anything else is no squad. */
export function liveSquad(saved) {
  return Array.isArray(saved) ? saved.filter((e) => e && typeof e === 'object' && allyType(e.type)).map((e) => ({ type: e.type })) : [];
}

/** Whether two rosters hold the same creatures in the same order. */
export function sameRoster(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((e, i) => e.type === b[i].type);
}

/**
 * The ally entity for a roster entry at `position` (a THREE.Vector3, the spawn contract MobModel reads): a hybrid as its
 * fusion makes it, a mob type as a bind leaves the mob the spawner made (systems/SpawnerSystem.jsx spawnMob, then
 * convertMobToAlly: whole, not aggroed, its type its fusion key).
 * @param {{ type: string }} entry a liveSquad entry
 * @param {string|number} id unique among the ECS's entities
 */
export function allyFor(entry, id, position) {
  const def = HYBRIDS[entry.type];
  if (def) return hybridAlly(def, id, position, 0);
  const m = MOB_TYPES[entry.type];
  return {
    isAlly: true, id, type: entry.type, baseType: entry.type, position, color: m.color,
    health: m.health, maxHealth: m.health, speed: m.speed, passive: m.passive, damage: m.damage,
    ...(m.legMode ? { legMode: m.legMode } : {}),
    targetX: position.x, targetZ: position.z, rotation: 0, moveTimer: 0,
    isMoving: false, isAggro: false, lastAttackTime: 0, knockback: null, lastHit: 0,
  };
}
