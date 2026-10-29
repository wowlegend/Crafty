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
// Each Primal Endurance rank lengthens the form by this much (its `mod` in game/talentTree.js); the form's length for
// a build is game/verbMods.js roarSec, passed in as ctx.formDurationSec.
export const ENDURANCE_SEC_PER_RANK = 3;

/** The SM's own state (charge + timers). The active/human truth lives in the store, not here. */
export function makeTransformState() {
  return { charging: false, chargeStart: 0, activeSince: 0, cooldownUntil: 0 };
}

const formLength = (ctx) => (Number.isFinite(ctx.formDurationSec) ? ctx.formDurationSec : FORM_DURATION_SEC);

/**
 * decideTransform(sm, ctx) -> { sm, action }.
 * ctx: { isBeast, roar(held), roarEdge(pressed this frame), active(input live), alive, now, canEnter, canPay,
 *        formDurationSec } — formDurationSec (default FORM_DURATION_SEC) is the form's length as the build stands this
 *        tick, read every tick, so a relic taken off mid-form takes its seconds with it and one slot never lends one
 *        relic's roar to the next relic's verb.
 * action: 'none' | 'startCharge' | 'short' | 'cancel' | 'unpaid' | 'enter' | 'exitTimer' | 'exitManual'
 *   - 'enter'  -> Components reads activeSpell -> enterBeastForm(element), and spends ROAR_COST
 *   - 'exit*'  -> Components calls exitBeastForm()
 * `canEnter` is every gate but the price (the wildheart_roar talent); `canPay` is the ember bar holding ROAR_COST on the
 * frame it is read. One bar pays every Aspect verb, so the price is the reducer's to judge at both ends: a press that
 * would start the charge but for it is 'short', and a charge whose price another verb spent before it committed is
 * 'unpaid'. Neither starts anything nor arms a cooldown, and the caller says why the press did nothing.
 */
export function decideTransform(sm, ctx) {
  const out = { ...sm };

  // ACTIVE (the store says we're a beast): handle the duration timer + a manual roar-tap exit.
  if (ctx.isBeast) {
    out.charging = false;
    if (ctx.now - sm.activeSince >= formLength(ctx)) { out.cooldownUntil = ctx.now + COOLDOWN_SEC; return { sm: out, action: 'exitTimer' }; }
    if (ctx.roarEdge) { out.cooldownUntil = ctx.now + COOLDOWN_SEC; return { sm: out, action: 'exitManual' }; }
    return { sm: out, action: 'none' };
  }

  // HUMAN + charging: the anticipation window.
  if (sm.charging) {
    if (!ctx.alive || !ctx.active || !ctx.roar) { out.charging = false; return { sm: out, action: 'cancel' }; }
    if (ctx.now - sm.chargeStart >= ANTICIPATION_SEC) {
      out.charging = false;
      if (!ctx.canEnter) return { sm: out, action: 'cancel' };
      if (!ctx.canPay) return { sm: out, action: 'unpaid' };
      out.activeSince = ctx.now;
      return { sm: out, action: 'enter' };
    }
    return { sm: out, action: 'none' };
  }

  // HUMAN + idle: a fresh roar press (off cooldown, all conditions) starts the charge.
  if (ctx.roarEdge && ctx.now >= sm.cooldownUntil && ctx.alive && ctx.active && ctx.canEnter) {
    if (!ctx.canPay) return { sm: out, action: 'short' };
    out.charging = true;
    out.chargeStart = ctx.now;
    return { sm: out, action: 'startCharge' };
  }

  return { sm: out, action: 'none' };
}
