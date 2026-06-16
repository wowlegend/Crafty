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

/**
 * Windup progress in [0,1] for the render: 0 at the start of the windup, 1 at the strike moment.
 * Drives the anticipation pose (coil) + the emissive charge ramp on the mob. Returns 0 when there
 * is no active windup. RNG-free.
 */
export function windupRamp(now, windupUntil, windupMs = WINDUP_MS) {
  if (!windupUntil || windupMs <= 0) return 0;
  const remaining = windupUntil - now;
  if (remaining <= 0) return 1;
  if (remaining >= windupMs) return 0;
  return 1 - remaining / windupMs;
}
