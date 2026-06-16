/**
 * Pure windup->strike telegraph state machine. An enemy that COULD attack this tick (hasIntent =
 * in-range + off-cooldown) first enters a WINDUP for `windupMs`; only when the windup elapses AND the
 * intent still holds does it STRIKE. If the target dodged out of intent during the windup it CANCELS
 * (a whiff) -- this is what makes telegraphed attacks dodgeable. `now`/`windupUntil` are performance.now()
 * units (the AI worker's `now` == the render clock). RNG-free.
 * @returns {{action:'idle'|'windup'|'charge'|'strike'|'cancel', windupUntil:number}}
 */
export const WINDUP_MS = 380; // readable 300-500ms reaction band; Kevin FEEL #50 tunable

export function attackPhase(now, windupUntil, hasIntent, windupMs = WINDUP_MS) {
  if (windupUntil > 0) {
    if (now >= windupUntil) return { action: hasIntent ? 'strike' : 'cancel', windupUntil: 0 };
    return { action: 'charge', windupUntil };
  }
  if (hasIntent) return { action: 'windup', windupUntil: now + windupMs };
  return { action: 'idle', windupUntil: 0 };
}
