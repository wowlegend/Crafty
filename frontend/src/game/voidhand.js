/**
 * voidhand.js — S2-B2-M1: the VOIDHAND grab state machine (pure reducer). Twin of beastTransform.js.
 *
 * The grab verb's logic: tap GRAB -> ANTICIPATION (charge) -> commit (spawn a phantom block, orbiting) ->
 * HELD -> release via HURL (attack intent) / SLAM (cast intent) / auto-DROP (max-hold) -> cooldown.
 * Kept pure (no React/store/Rapier/worker) so the charge/commit/hold/release logic is unit-testable AND
 * so the NO-RE-MESH static gate (this file references zero voxel/worker seams) holds by construction.
 * Components.jsx holds this state in a ref, reads the abstract `grab`/`attack`/`cast` intents transiently,
 * and APPLIES the returned action. "Am I holding a block" is the store's single truth (`voidhandHeld` in
 * ctx.held), not duplicated here — this SM owns only the charge + hold/cooldown timers (mirrors how
 * beastTransform.js owns charge+duration while the store owns beastFormActive).
 *
 * THE element + the phantom spawn + the impact all live at the Components apply-site / render layer; a
 * COMBAT grab there spawns a pooled PHANTOM (never a voxel edit) — this pure SM cannot touch terrain.
 */
export const GRAB_CHARGE_SEC = 0.35; // anticipation before the grab commits (Kevin-tunable)
export const MAX_HOLD_SEC = 8;       // auto-drop the held block after this (no infinite carry)
export const GRAB_COOLDOWN_SEC = 0.6; // after a release, before grab can charge again

/** M3/M8: worker-numeric block type -> phantom tint. M8 covers the FULL worker type space
 *  (1-9, enumerated from terrain.worker.js generation: grass/dirt/stone/sand/snow/wood/leaves/
 *  trunk/water) so every type reads distinct ("8+ types" — spec §12 M8). HONEST REACH NOTE:
 *  the v1 grab tint resolves only worldBlocks-KNOWN (player-edited) voxels, whose placeable
 *  space is {1,2,3,4,6,7}; 5/8/9 tints are data-ready for the deferred pristine-voxel query.
 *  Pure data, gate-safe. */
export const PHANTOM_BLOCK_COLORS = {
  1: '#6FA34D', // grass
  2: '#8B6A42', // dirt
  3: '#8A8E94', // stone-family
  4: '#D8C98E', // sand
  5: '#E8F0F5', // snow
  6: '#9A7B4F', // wood/chest
  7: '#5F8F4E', // leaves/flowers
  8: '#7A5A38', // tree trunk
  9: '#4A9BD8', // water (unreachable by grab today; data-complete)
};

/** The SM's own state (charge + timers). The held/active truth lives in the store, not here. */
export function makeVoidhandState() {
  return { charging: false, chargeStart: 0, heldUntil: 0, cooldownUntil: 0 };
}

/**
 * decideVoidhand(sm, ctx) -> { sm, action }.
 * ctx: { held, grabEdge(pressed this frame), attack(edge), cast(edge), active(input live), alive, now, canGrab }
 * action: 'none' | 'startGrab' | 'cancel' | 'grab' | 'hurl' | 'slam' | 'drop'
 *   - 'grab'  -> Components spawns the phantom + setVoidhandHeld(true) + spends GRAB_COST kinetic
 *   - 'hurl'/'slam' -> launch the phantom (the 2 attack intents re-skinned) + setVoidhandHeld(false)
 *   - 'drop'/'cancel' -> despawn the phantom + setVoidhandHeld(false)
 * `canGrab` is the gate other layers compose (the kinetic.js GRAB_COST bank + the voidhand_grasp talent).
 */
export function decideVoidhand(sm, ctx) {
  const out = { ...sm };

  // HELD (the store says we're holding a phantom): release via a verb, death, or the max-hold timer.
  if (ctx.held) {
    out.charging = false;
    if (!ctx.alive) { out.cooldownUntil = ctx.now + GRAB_COOLDOWN_SEC; return { sm: out, action: 'drop' }; }
    if (ctx.attack) { out.cooldownUntil = ctx.now + GRAB_COOLDOWN_SEC; return { sm: out, action: 'hurl' }; }
    if (ctx.cast)   { out.cooldownUntil = ctx.now + GRAB_COOLDOWN_SEC; return { sm: out, action: 'slam' }; }
    if (ctx.grabEdge) { out.cooldownUntil = ctx.now + GRAB_COOLDOWN_SEC; return { sm: out, action: 'drop' }; } // re-press grab = release the held block
    if (ctx.now >= sm.heldUntil) { out.cooldownUntil = ctx.now + GRAB_COOLDOWN_SEC; return { sm: out, action: 'drop' }; }
    return { sm: out, action: 'none' };
  }

  // CHARGING: the anticipation window (a tap-to-grab; menu-open / death cancels).
  if (sm.charging) {
    if (!ctx.alive || !ctx.active) { out.charging = false; return { sm: out, action: 'cancel' }; }
    if (ctx.now - sm.chargeStart >= GRAB_CHARGE_SEC) {
      out.charging = false;
      if (ctx.canGrab) { out.heldUntil = ctx.now + MAX_HOLD_SEC; return { sm: out, action: 'grab' }; }
      return { sm: out, action: 'cancel' };
    }
    return { sm: out, action: 'none' };
  }

  // IDLE: a fresh grab press (off cooldown, all conditions, bank has GRAB_COST) starts the charge.
  if (ctx.grabEdge && ctx.now >= sm.cooldownUntil && ctx.alive && ctx.active && ctx.canGrab) {
    out.charging = true;
    out.chargeStart = ctx.now;
    return { sm: out, action: 'startGrab' };
  }

  return { sm: out, action: 'none' };
}
