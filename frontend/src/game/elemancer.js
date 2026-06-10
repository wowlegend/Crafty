/**
 * elemancer.js — S2-B4-M2: the IMBUE latch (pure reducer). Deliberately SIMPLER than every
 * prior Aspect SM: imbue is a STANCE, not an aim-test — you arm it, and the skill lives in
 * WHAT you choose to cast at (M5's zone spawn judges the surface). Hold/charge mechanics
 * would add friction without depth here (the latch-not-channel decision, M2 plan).
 * Arm on Z (the apply-site composes ctx.canIgnite = bank ∧ talent); re-press disarms (a
 * toggle); a cast while armed CONSUMES (the apply-site spends ZONE_COST + tags the
 * projectile); death/menu disarms — no dangling latch.
 */
export function makeImbueState() {
  return { armed: false };
}

/** decideImbue(sm, ctx) -> { sm, action }; action: 'none'|'arm'|'disarm'|'consume'.
 *  ctx: { imbueEdge, castFired, active, alive, canIgnite } */
export function decideImbue(sm, ctx) {
  const out = { ...sm };

  if (sm.armed) {
    if (!ctx.alive || !ctx.active) { out.armed = false; return { sm: out, action: 'disarm' }; }
    if (ctx.castFired) { out.armed = false; return { sm: out, action: 'consume' }; }
    if (ctx.imbueEdge) { out.armed = false; return { sm: out, action: 'disarm' }; }
    return { sm: out, action: 'none' };
  }

  if (ctx.imbueEdge && ctx.alive && ctx.active && ctx.canIgnite) {
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
