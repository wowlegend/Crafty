/**
 * The kill event's two helpers on the event bus (game/eventBus.js): the one mob-death path emits, and every kill
 * consumer (quests, the ember accrual) subscribes.
 */
import { EVENTS, on, emit } from './eventBus.js';

/** subscribeMobKill(cb) -> unsubscribe. cb receives (mobType, position[], source): 'player', 'ally' or 'hazard' (an
 *  element-zone kill, which the 'player'-filtered consumers bank nothing from). */
export function subscribeMobKill(cb) {
  return on(EVENTS.mobKill, cb);
}

/** emitMobKill(mobType, position, source) — a mob died. An ally's death emits too, so squad UI can react; the
 *  attribution-filtered consumers bank nothing from it. */
export function emitMobKill(mobType, position, source = 'player') {
  emit(EVENTS.mobKill, mobType, position, source);
}
