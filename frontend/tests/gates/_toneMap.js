// A test-side twin of three r172's NeutralToneMapping (node_modules/three/src/renderers/shaders/ShaderChunk/
// tonemapping_pars_fragment.glsl.js, NeutralToneMapping), the chunk the post chain's ToneMappingEffect includes
// (GameScene.jsx <ToneMapping mode={NEUTRAL} />), at exposure 1. It is the reference a colour is judged against: what
// the player sees of a linear colour before the grade, the bloom halo and the vignette, which it does not model.
// Its first gate is its own: identity under the knee, compressed and desaturated above it (feedback-grammar-gates).

export function neutralToneMap([r0, g0, b0]) {
  const START = 0.8 - 0.04;
  const DESAT = 0.15;
  const x = Math.min(r0, g0, b0);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  let [r, g, b] = [r0 - offset, g0 - offset, b0 - offset];
  const peak = Math.max(r, g, b);
  if (peak < START) return [r, g, b];
  const d = 1 - START;
  const newPeak = 1 - (d * d) / (peak + d - START);
  r *= newPeak / peak; g *= newPeak / peak; b *= newPeak / peak;
  const k = 1 - 1 / (DESAT * (peak - newPeak) + 1);
  return [r + (newPeak - r) * k, g + (newPeak - g) * k, b + (newPeak - b) * k];
}

const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** The sRGB display value, 0..1, of a linear rgb triple through the Neutral tone map. */
export function toneMappedSrgb(linear) {
  return neutralToneMap(linear).map((c) => Math.min(1, Math.max(0, toSrgb(c))));
}
