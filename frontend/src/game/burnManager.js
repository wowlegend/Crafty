// burnManager.js — owns the fire damage-over-time interval tickers so they can ALL be stopped on
// unmount. Each burn already self-clears when its duration elapses or the mob dies, but a burn still
// active when EnhancedMagicSystem unmounts had no owner to clear it — the 1s ticker kept hammering
// damage into the global mob table forever. This registry tracks every live handle and exposes stopAll()
// for the component's unmount cleanup.
//
// Pure of React. damageMob is read through a getter on EVERY tick (not captured at start) so a burn
// stops the instant the global damage method disappears — mirroring the original inline behaviour.
// A tick that lands while the world is held (a pause or a hitstop) deals nothing and spends nothing, so the burn
// resumes with every tick it had left.
import { isWorldFrozenNow } from './worldClock.js';

const TICK_MS = 1000;
const TIMER_SLACK_MS = 50;

export function makeBurnManager() {
  // handle -> { mobId, dps, getDamageMob, ticksRemaining, next }: `next` is when the next tick is due, performance.now() ms.
  const active = new Map();

  // One tick of a burn if it is due at `now`. The interval and the frame loop (pump) both ask, whichever comes first:
  // a busy main thread runs a timer late while frames keep coming, and a hidden tab runs no frames.
  function fire(handle, now, slack = 0) {
    const b = active.get(handle);
    if (!b) return;
    // A held world deals nothing and spends nothing: the next tick is due a second after the hold ends.
    if (isWorldFrozenNow(now)) { b.next = Math.max(b.next, now + TICK_MS); return; }
    if (now + slack < b.next) return;
    const damageMob = b.getDamageMob();
    if (b.ticksRemaining <= 0 || typeof damageMob !== 'function') { stop(handle); return; }
    b.next = now + TICK_MS;
    // 'player-dot': the player's damage for XP and kill attribution, NOT a direct hit for feel. This
    // omitted the argument and took the 'player' default, so every tick stamped hitstop, shook the
    // camera and pushed an impact ring -- four times, a second apart, with no input.
    const mob = damageMob(b.mobId, b.dps, 'fireball', 'player-dot');
    if (!mob) { stop(handle); return; } // mob already dead/despawned
    b.ticksRemaining--;
    if (b.ticksRemaining <= 0) stop(handle);
  }

  function start(mobId, duration, dps, getDamageMob) {
    const burn = { mobId, dps, getDamageMob, ticksRemaining: Math.floor(duration), next: performance.now() + TICK_MS };
    // A timer can fire a hair before performance.now() reaches its due time; the slack lets it take its own tick, and
    // is far under a second, so a tick the frame loop has just dealt is never dealt again.
    const handle = setInterval(() => fire(handle, performance.now(), TIMER_SLACK_MS), TICK_MS);
    active.set(handle, burn);
    return handle;
  }

  /** Called every frame: deal each burn's tick that has come due. */
  function pump(now = performance.now()) {
    for (const handle of [...active.keys()]) fire(handle, now);
  }

  function stop(handle) { clearInterval(handle); active.delete(handle); }
  function stopAll() { for (const h of active.keys()) clearInterval(h); active.clear(); }

  return { start, pump, stop, stopAll, get size() { return active.size; } };
}
