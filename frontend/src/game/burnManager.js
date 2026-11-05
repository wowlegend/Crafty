// burnManager.js — the fire damage-over-time burns: each deals a tick per second of WORLD time, driven by the frame loop
// (EnhancedMagicSystem calls pump every frame), and stopAll() ends every burn on the spell system's unmount.
//
// A burn's ticks are due on a grid of world time from its start (game/worldClock.js worldNow), the clock a pause and a
// hitstop hold: a hold holds the burn exactly, keeping the part of the second it had run, however often the holds come;
// and a tick dealt late, on the first frame past its second, does not move the ticks after it. At most one tick per burn
// per frame, so a backlog after a stalled frame lands a frame apart. The frame loop is the only driver: a timer runs late
// on a busy main thread while frames keep coming, and a hidden tab runs no frames, so the burn holds with the rest of the
// world rather than ticking on alone.
//
// Pure of React. damageMob is read through a getter on EVERY tick (not captured at start) so a burn
// stops the instant the global damage method disappears — mirroring the original inline behaviour.
import { worldNow } from './worldClock.js';

const TICK_MS = 1000;

export function makeBurnManager() {
  // handle -> { handle, mobId, dps, getDamageMob, ticksRemaining, next }: `next` is when the next tick is due, world ms.
  const active = new Map();
  let lastHandle = 0;

  function start(mobId, duration, dps, getDamageMob) {
    const handle = ++lastHandle;
    active.set(handle, { handle, mobId, dps, getDamageMob, ticksRemaining: Math.floor(duration), next: worldNow() + TICK_MS });
    return handle;
  }

  /** Called every frame: deal each burn's tick that has come due on the world clock, at most one per burn. */
  function pump(now = worldNow()) {
    if (!active.size) return;
    for (const b of active.values()) {
      if (now < b.next) continue;
      const damageMob = b.getDamageMob();
      if (b.ticksRemaining <= 0 || typeof damageMob !== 'function') { active.delete(b.handle); continue; }
      b.next += TICK_MS;
      // 'player-dot': the player's damage for XP and kill attribution, NOT a direct hit for feel. This
      // omitted the argument and took the 'player' default, so every tick stamped hitstop, shook the
      // camera and pushed an impact ring -- four times, a second apart, with no input.
      const mob = damageMob(b.mobId, b.dps, 'fireball', 'player-dot');
      if (!mob) { active.delete(b.handle); continue; } // mob already dead/despawned
      b.ticksRemaining--;
      if (b.ticksRemaining <= 0) active.delete(b.handle);
    }
  }

  function stopAll() { active.clear(); }

  return { start, pump, stopAll, get size() { return active.size; } };
}
