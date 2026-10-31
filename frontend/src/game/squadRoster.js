/**
 * squadRoster.js — the bound squad as its world saves it (deep audit 2026-10-30, lane L3; the soulbind spec,
 * docs/superpowers/specs/2026-06-10-crafty-s2b3-soulbind-design.md: the roster persists in the progression slice, the
 * positions do not, and the squad comes back at the player). A creature is its type: a mob type (game/mobTypes.js) or a
 * hybrid's id (game/hybrids.js). Everything else it carries derives from the type, as a bind (game/allegiance.js
 * convertMobToAlly) and a fusion (hybridAlly) derive it, so the save holds no second copy of a stat; the bodies are rebuilt
 * from it by world/squadPersistence.js. Pure.
 */
import { MOB_TYPES } from './mobTypes.js';
import { HYBRIDS } from './hybrids.js';
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
  return Array.isArray(saved) ? rosterOf(saved) : [];
}
