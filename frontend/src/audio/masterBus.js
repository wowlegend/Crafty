// SFX overhaul: a single MASTER BUS so the whole mix (music pad/arp + every SFX) routes through ONE limiter
// before the speakers, instead of each voice connecting straight to ctx.destination -- which lets peaks SUM
// and clip when many sounds fire at once (no global headroom point today). Signature:
//   input (GainNode) -> limiter (DynamicsCompressor, brickwall-ish) -> ctx.destination
// Pure over a caller-supplied AudioContext (mirrors audio/synthVoices.js) -> unit-testable with a fake ctx.
// Returns null for a nullish ctx. The caller (SoundManager) creates it once on the shared ctx and routes
// every voice's final node into `input`.
export function createMasterBus(ctx) {
  if (!ctx) return null;
  const input = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  const t = ctx.currentTime || 0;
  // Brickwall-ish limiter: catch peaks just below 0 dBFS, hard knee, high ratio, fast attack, musical release.
  // Stops the summed mix from clipping while leaving normal levels untouched.
  limiter.threshold.setValueAtTime(-3, t);
  limiter.knee.setValueAtTime(0, t);
  limiter.ratio.setValueAtTime(20, t);
  limiter.attack.setValueAtTime(0.003, t);
  limiter.release.setValueAtTime(0.25, t);
  input.connect(limiter);
  limiter.connect(ctx.destination);
  return { input, limiter };
}
