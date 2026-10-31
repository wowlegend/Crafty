/**
 * The game's event bus: the system that knows a moment emits it, and whatever reacts (quests, the ember accrual, the
 * sound layer) subscribes. Emitters never call a reactor directly, so a reactor that is not mounted costs nothing and
 * a second one needs no change at the emitter.
 *
 * The names are a closed set: subscribing to or emitting a name outside EVENTS throws, so a mistyped name fails where
 * it is written instead of becoming a moment nobody hears. Payloads are positional (up to three arguments, documented
 * per event below). Each name's subscribers live in an array replaced on every subscribe and unsubscribe, so an emit
 * walks a snapshot without copying it: a subscriber added or removed during a dispatch takes effect from the next one,
 * and an emit allocates nothing. One throwing subscriber never stops the rest, and is reported (isolatedEffects.js).
 */
import { reportIsolatedFailure } from './isolatedEffects.js';

export const EVENTS = Object.freeze({
  /** (mobType: string, position: [x, y, z], source: 'player' | 'ally' | 'hazard') — a mob died. */
  mobKill: 'mobKill',
  /** (level: number) — the player's level rose. */
  levelUp: 'levelUp',
  /** () — an achievement unlocked or a quest completed. */
  reward: 'reward',
  /** () — the win screen appeared. */
  victory: 'victory',
});

const EMPTY = Object.freeze([]);
const subscribers = new Map(Object.values(EVENTS).map((name) => [name, EMPTY]));

function listFor(name) {
  const list = subscribers.get(name);
  if (!list) throw new Error(`eventBus: "${name}" is not an event (EVENTS names them all)`);
  return list;
}

/** Subscribe `cb` to `name`; returns the unsubscribe. */
export function on(name, cb) {
  subscribers.set(name, [...listFor(name), cb]);
  return () => {
    const list = subscribers.get(name);
    if (list.includes(cb)) subscribers.set(name, list.filter((s) => s !== cb));
  };
}

/** Deliver `name` to every subscriber, in subscription order. */
export function emit(name, a, b, c) {
  const list = listFor(name);
  for (let i = 0; i < list.length; i++) {
    try {
      list[i](a, b, c);
    } catch (error) {
      // one reactor failing must not silence the others, and must not go unseen either
      reportIsolatedFailure(`the ${name} event`, error);
    }
  }
}

/** How many subscribers `name` has. @internal */
export function subscriberCount(name) {
  return listFor(name).length;
}

/** Drop every subscriber of every event. @internal */
export function _resetBus() {
  for (const name of subscribers.keys()) subscribers.set(name, EMPTY);
}
