// burnManager.js — owns the fire damage-over-time interval tickers so they can ALL be stopped on
// unmount. Each burn already self-clears when its duration elapses or the mob dies, but a burn still
// active when EnhancedMagicSystem unmounts had no owner to clear it — the 1s ticker kept hammering
// damage into the global mob table forever. This registry tracks every live handle and exposes stopAll()
// for the component's unmount cleanup.
//
// Pure of React. damageMob is read through a getter on EVERY tick (not captured at start) so a burn
// stops the instant the global damage method disappears — mirroring the original inline behaviour.
export function makeBurnManager() {
  const active = new Set();

  function start(mobId, duration, dps, getDamageMob) {
    let ticksRemaining = Math.floor(duration);
    const handle = setInterval(() => {
      const damageMob = getDamageMob();
      if (ticksRemaining <= 0 || typeof damageMob !== 'function') { stop(handle); return; }
      const mob = damageMob(mobId, dps, 'fireball');
      if (!mob) { stop(handle); return; } // mob already dead/despawned
      ticksRemaining--;
    }, 1000);
    active.add(handle);
    return handle;
  }

  function stop(handle) { clearInterval(handle); active.delete(handle); }
  function stopAll() { for (const h of active) clearInterval(h); active.clear(); }

  return { start, stop, stopAll, get size() { return active.size; } };
}
