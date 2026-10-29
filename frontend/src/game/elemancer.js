/**
 * elemancer.js — S2-B4-M2: the IMBUE latch (pure reducer). Deliberately SIMPLER than every
 * prior Aspect SM: imbue is a STANCE, not an aim-test — you arm it, and the skill lives in
 * WHAT you choose to cast at (M5's zone spawn judges the surface). Hold/charge mechanics
 * would add friction without depth here (the latch-not-channel decision, M2 plan).
 * Arm on Z (ctx.canIgnite is the talent, ctx.canPay the ember bar); re-press disarms (a
 * toggle); a cast while armed CONSUMES (the apply-site spends IMBUE_COST + tags the
 * projectile); death/menu disarms — no dangling latch.
 */
export function makeImbueState() {
  return { armed: false };
}

/** decideImbue(sm, ctx) -> { sm, action }; action: 'none'|'arm'|'short'|'disarm'|'consume'|'unpaid'.
 *  ctx: { imbueEdge, castFired, active, alive, canIgnite, owned, canPay }
 *  canIgnite: every gate on the arm but the price (the elemancer_imbue talent). canPay: the ember bar holds IMBUE_COST
 *  now. A Z that would arm but for the price is 'short'. One bar pays every verb, so the price vetted at the arm may be gone by
 *  the cast; that cast is 'unpaid': the stance ends, nothing is consumed, and the cast goes out plain. A 'consume' or an
 *  'unpaid' is the caller's to apply only if the cast goes out (castSpell refuses one it has no mana for).
 *  `owned` (the elemancer_imbue talent) is checked on the ARMED branch too: canIgnite is only read at
 *  arm-time, so without it a respec that refunds the talent left the stance armed in this ref while the
 *  store's reticle flag went dark — the next cast consumed an imbue the player no longer owns (R1.4).
 *  Absent (older callers) is not `false`, so it only ever disarms when a caller says so. */
export function decideImbue(sm, ctx) {
  const out = { ...sm };

  if (sm.armed) {
    if (!ctx.alive || !ctx.active || ctx.owned === false) { out.armed = false; return { sm: out, action: 'disarm' }; }
    if (ctx.castFired) { out.armed = false; return { sm: out, action: ctx.canPay ? 'consume' : 'unpaid' }; }
    if (ctx.imbueEdge) { out.armed = false; return { sm: out, action: 'disarm' }; }
    return { sm: out, action: 'none' };
  }

  if (ctx.imbueEdge && ctx.alive && ctx.active && ctx.canIgnite) {
    if (!ctx.canPay) return { sm: out, action: 'short' };
    out.armed = true;
    return { sm: out, action: 'arm' };
  }

  return { sm: out, action: 'none' };
}

/** The cast's element decides the chemistry (design §2): spell -> zone kind. */
export const KIND_BY_SPELL = {
  fireball: 'burning',
  iceball: 'frozen',
  lightning: 'conductive',
  arcane: 'resonant',
};
