/**
 * soulbind.js — S2-B3-M2: the SOULBIND snare-channel SM (pure reducer). Twin of voidhand.js, but
 * CHANNEL-shaped: instead of charge-then-hold, snare is a 1.1s aim-gated channel — ctx.targetId is
 * the per-frame VALIDITY verdict computed at the apply-site (nearest snareable in cone+range+alive;
 * the mob keeps moving, so holding aim IS the skill — design §2). Validity loss breaks the channel
 * FREE (no cooldown — cooldown only arms on bind/completion); menu/death cancels. The squad/roster
 * truth lives in the store (M3+); this SM owns only the channel timer + cooldown.
 */
export const SNARE_CHANNEL_SEC = 1.1;  // hold-to-bind window (Kevin-tunable)
export const SNARE_COOLDOWN_SEC = 1.5; // after a completed bind (anti-spam; breaks are free)

export function makeSoulbindState() {
  return { channeling: false, channelStart: 0, targetId: null, cooldownUntil: 0 };
}

/** decideSoulbind(sm, ctx) -> { sm, action }; action: 'none'|'startChannel'|'channelBreak'|'bind'|'cancel'.
 *  ctx: { snareEdge, active, alive, now, canSnare, targetId } — targetId = the CURRENT valid snareable
 *  target id or null (apply-site computes it; a different id than locked = validity loss). */
export function decideSoulbind(sm, ctx) {
  const out = { ...sm };

  if (sm.channeling) {
    if (!ctx.alive || !ctx.active) { out.channeling = false; out.targetId = null; return { sm: out, action: 'cancel' }; }
    if (ctx.targetId !== sm.targetId || ctx.targetId == null) {
      out.channeling = false; out.targetId = null;
      return { sm: out, action: 'channelBreak' }; // free — no cooldown (design §2)
    }
    // 1e-9 epsilon: the channel window is boundary-INCLUSIVE — (10 + 1.1) - 10 is 1.0999999999999996
    // in floats, and a frame landing exactly on the boundary must bind, not slip to the next frame.
    if (ctx.now - sm.channelStart >= SNARE_CHANNEL_SEC - 1e-9) {
      out.channeling = false;
      out.cooldownUntil = ctx.now + SNARE_COOLDOWN_SEC;
      return { sm: out, action: 'bind' }; // apply-site spends SNARE_COST + converts the entity (M3/M4)
    }
    return { sm: out, action: 'none' };
  }

  if (ctx.snareEdge && ctx.now >= sm.cooldownUntil && ctx.alive && ctx.active && ctx.canSnare && ctx.targetId != null) {
    out.channeling = true;
    out.channelStart = ctx.now;
    out.targetId = ctx.targetId;
    return { sm: out, action: 'startChannel' };
  }

  return { sm: out, action: 'none' };
}
