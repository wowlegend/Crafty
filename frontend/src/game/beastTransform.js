/**
 * beastTransform.js — S2-B1-M3: the WILDHEART transform STATE MACHINE (pure reducer).
 *
 * The roar verb's logic: hold-roar -> ANTICIPATION (charge) -> commit -> ACTIVE(beast, for a fixed
 * duration) -> EXIT -> cooldown. Kept pure (no React/store/Rapier) so the charge/cancel/duration/
 * cooldown/edge logic is unit-testable. Components.jsx holds the state in a ref, reads the abstract
 * `roar` intent transiently in useFrame, and APPLIES the returned action (enter/exitBeastForm — the
 * M1 store authority). "Am I a beast" is the store's single source of truth (`isBeast` in ctx), not
 * a flag duplicated here — the SM only owns the charge + the duration/cooldown timers.
 *
 * Tunable (Kevin — KEVIN-REVIEW-BATCH §8 #2; M4 may scale duration by talent/ferocity):
 */
export const ANTICIPATION_SEC = 0.45; // hold-roar charge window before the transform commits
export const FORM_DURATION_SEC = 14;  // how long a beast form lasts before auto-exit
export const COOLDOWN_SEC = 1.5;      // after exit, before roar can charge again
export const ENDURANCE_SEC_PER_RANK = 3; // S2-B1-M6: each Primal Endurance rank extends the form (Kevin-tunable, Decision #4)

/**
 * formDurationFor(enduranceRank) -> the effective beast-form duration in seconds. The Primal Endurance
 * talent is an ability-LEVER: its rank is read HERE (the duration site), NOT the stat-fold (the node is
 * effect-less). rank<=0 (no talent) -> the base FORM_DURATION_SEC. Pure + unit-tested.
 */
export function formDurationFor(enduranceRank) {
  return FORM_DURATION_SEC + Math.max(0, enduranceRank || 0) * ENDURANCE_SEC_PER_RANK;
}

/** The SM's own state (charge + timers). The active/human truth lives in the store, not here. */
export function makeTransformState() {
  return { charging: false, chargeStart: 0, activeUntil: 0, cooldownUntil: 0 };
}

/**
 * decideTransform(sm, ctx) -> { sm, action }.
 * ctx: { isBeast, roar(held), roarEdge(pressed this frame), active(input live), alive, now, canEnter }
 * action: 'none' | 'startCharge' | 'cancel' | 'enter' | 'exitTimer' | 'exitManual'
 *   - 'enter'  -> Components reads activeSpell -> enterBeastForm(element)
 *   - 'exit*'  -> Components calls exitBeastForm()
 * `canEnter` is the gate other milestones layer on (M4 ferocity threshold, M6 wildheart_roar unlock);
 * true in M3 so the verb is independently playable.
 */
export function decideTransform(sm, ctx) {
  const out = { ...sm };

  // ACTIVE (the store says we're a beast): handle the duration timer + a manual roar-tap exit.
  if (ctx.isBeast) {
    out.charging = false;
    if (ctx.now >= sm.activeUntil) { out.cooldownUntil = ctx.now + COOLDOWN_SEC; return { sm: out, action: 'exitTimer' }; }
    if (ctx.roarEdge) { out.cooldownUntil = ctx.now + COOLDOWN_SEC; return { sm: out, action: 'exitManual' }; }
    return { sm: out, action: 'none' };
  }

  // HUMAN + charging: the anticipation window.
  if (sm.charging) {
    if (!ctx.alive || !ctx.active || !ctx.roar) { out.charging = false; return { sm: out, action: 'cancel' }; }
    if (ctx.now - sm.chargeStart >= ANTICIPATION_SEC) {
      out.charging = false;
      // M6: the effective duration is passed in (Primal Endurance rank, computed at the Components site);
      // absent (existing callers / tests) -> the base FORM_DURATION_SEC, so this is backward-compatible.
      if (ctx.canEnter) { out.activeUntil = ctx.now + (ctx.formDurationSec ?? FORM_DURATION_SEC); return { sm: out, action: 'enter' }; }
      return { sm: out, action: 'cancel' };
    }
    return { sm: out, action: 'none' };
  }

  // HUMAN + idle: a fresh roar press (off cooldown, all conditions) starts the charge.
  if (ctx.roarEdge && ctx.now >= sm.cooldownUntil && ctx.alive && ctx.active && ctx.canEnter) {
    out.charging = true;
    out.chargeStart = ctx.now;
    return { sm: out, action: 'startCharge' };
  }

  return { sm: out, action: 'none' };
}
