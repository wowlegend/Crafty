/**
 * The kill event's two helpers on the event bus (game/eventBus.js): the one mob-death path emits, and every kill
 * consumer (quests, the ember accrual) subscribes.
 */
import { EVENTS, on, emit } from './eventBus.js';

/** subscribeMobKill(cb) -> unsubscribe. cb receives (mobType, position[], source, entity): source is 'player', 'ally' or
 *  'hazard' (an element-zone kill, which the 'player'-filtered consumers bank nothing from); entity is the dying mob, or
 *  null from an emitter that has none. */
export function subscribeMobKill(cb) {
  return on(EVENTS.mobKill, cb);
}

/** emitMobKill(mobType, position, source, entity) — a mob died. An ally's death emits too, so squad UI can react; the
 *  attribution-filtered consumers bank nothing from it. */
export function emitMobKill(mobType, position, source = 'player', entity = null) {
  emit(EVENTS.mobKill, mobType, position, source, entity);
}
