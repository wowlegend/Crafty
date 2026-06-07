/**
 * beastMorph.js — S2-B1-M7c: the morph CHOREOGRAPHY timing/easing (pure).
 *
 * The 3-beat transform reveal (spec §3b/§5b), driven by the roar lifecycle + the transform-cam window:
 *   beat 1 ANTICIPATION — while the hold-roar charge fills, a growing element glow at the player.
 *   beat 2 BURST        — at the commit, a bright radial flash that MASKS the collider/avatar swap frame.
 *   beat 3 SETTLE       — the beast avatar pops into being (scale overshoot) + the entry flash eases to steady.
 *
 * Pure functions of elapsed seconds — `BeastAvatar` tracks its own entry/charge clock (Game-Loop-Isolation;
 * no per-frame store writes) + applies these. FROZEN to the SETTLED state under capture (deterministic frame).
 */
export const MORPH_SEC = 0.55;  // the avatar entrance (scale-pop + entry flash)
export const BURST_SEC = 0.18;  // the swap-masking burst flash

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
// easeOutBack: overshoots past 1 then settles — the "pop into being".
function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  const x = clamp01(t) - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}

/** morphEntrance(elapsed) -> { scale, flash }. scale pops 0.5 -> overshoot -> 1; flash (extra core glow) 1 -> 0.
 *  >= MORPH_SEC (or non-finite) = the SETTLED state { scale:1, flash:0 } (what capture renders). */
export function morphEntrance(elapsed) {
  if (!Number.isFinite(elapsed) || elapsed >= MORPH_SEC) return { scale: 1, flash: 0 };
  const p = clamp01(elapsed / MORPH_SEC);
  return { scale: 0.5 + 0.5 * easeOutBack(p), flash: 1 - p };
}

/** burstFlash(elapsed) -> { active, scale, opacity }. A bright radial flash: expands 0.5 -> 3 + fades 1 -> 0.
 *  >= BURST_SEC (or non-finite) = inactive (gone — the settled frame has no burst). */
export function burstFlash(elapsed) {
  if (!Number.isFinite(elapsed) || elapsed >= BURST_SEC) return { active: false, scale: 0, opacity: 0 };
  const p = clamp01(elapsed / BURST_SEC);
  return { active: true, scale: 0.5 + p * 2.5, opacity: 1 - p };
}

/** chargeGlow(chargeProgress 0..1) -> { scale, intensity }. The anticipation glow grows + brightens as the
 *  hold-roar charge fills. */
export function chargeGlow(chargeProgress) {
  const p = clamp01(chargeProgress);
  return { scale: 0.3 + 0.7 * p, intensity: p };
}
