/**
 * mobKillBus.js — S2-B1-M3.5: a multi-subscriber kill-event bus.
 *
 * Replaces the single-slot `store.onMobKill` (only ONE consumer could register it — a last-writer-wins
 * trap: a 2nd registrant silently clobbered the first, flagged by the M1 review). Now quests AND the
 * WILDHEART Ferocity accrual — and future Aspects (SOULBIND captures a low-HP mob on its death) — all
 * SUBSCRIBE; the single mob-death code path EMITS once. The Aspect-meta kill-event scaffold.
 *
 * Singleton module (like inputState): the kill-path imports `emitMobKill`; consumers import
 * `subscribeMobKill` in a useEffect (unsub in cleanup). One throwing subscriber never blocks the rest.
 */
const subscribers = new Set();

/** subscribeMobKill(cb) -> unsubscribe. cb receives (mobType, position[], source).
 *  source ∈ 'player' | 'ally' (S2-B3-M1 attribution — ally kills must BANK NOTHING downstream). */
export function subscribeMobKill(cb) {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/** emitMobKill(mobType, position, source) — fan out a mob death (isolated per-cb). The source
 *  default keeps every pre-B3 caller green; ally deaths DO emit (so squad UI can react) but
 *  attribution-filtered subscribers bank nothing from them. */
export function emitMobKill(mobType, position, source = 'player') {
  for (const cb of [...subscribers]) {
    try {
      cb(mobType, position, source);
    } catch {
      // one bad subscriber (e.g. a quest handler throwing) must not block the others.
    }
  }
}

/** subscriber count (test/debug). */
export function mobKillSubscriberCount() {
  return subscribers.size;
}

/** test helper — clear all subscribers. */
export function _resetMobKillBus() {
  subscribers.clear();
}
