/**
 * aspectMotifs.js — the per-Aspect STINGERS (music-motif v2, the #74 deferred half).
 * A stinger is a short MELODIC phrase in the Aspect's identity played at its SIGNATURE
 * moment (transform / slam / fuse / the day's first zone) — distinct from the verb foley,
 * and rarity-guarded at the call sites so it stays special. A shared arp grammar with
 * per-Aspect intervals + timbre; pure (ctx)=>AudioBuffer like every voice.
 */

/** A tiny additive-synth arpeggio: notes (Hz) played sequentially with overlap + decay. */
export const makeArp = (ctx, notes, noteDur, wave, { gain = 0.32, overlap = 0.5, shimmer = 0 } = {}) => {
  if (!ctx) return null;
  const sampleRate = ctx.sampleRate;
  const step = noteDur * (1 - overlap);
  const total = step * (notes.length - 1) + noteDur * 1.6; // the last note rings
  const buffer = ctx.createBuffer(1, Math.floor(sampleRate * total), sampleRate);
  const d = buffer.getChannelData(0);
  const osc = (w, f, t) => {
    if (w === 'sawtooth') return 2 * (t * f - Math.floor(t * f + 0.5));
    if (w === 'square') return Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.7;
    if (w === 'triangle') return 2 * Math.abs(2 * (t * f - Math.floor(t * f + 0.5))) - 1;
    return Math.sin(2 * Math.PI * f * t);
  };
  notes.forEach((f, n) => {
    const start = Math.floor(n * step * sampleRate);
    const len = Math.floor(noteDur * 1.6 * sampleRate);
    for (let i = 0; i < len && start + i < d.length; i++) {
      const t = i / sampleRate;
      const env = Math.min(t * 30, 1) * Math.exp(-t * 5);
      let s = osc(wave, f, t);
      if (shimmer) s += Math.sin(2 * Math.PI * f * 2 * t) * shimmer * Math.exp(-t * 8);
      d[start + i] += s * env * gain;
    }
  });
  // safety headroom: normalize only if the overlap summed past 1
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak > 0.95) for (let i = 0; i < d.length; i++) d[i] *= 0.95 / peak;
  return buffer;
};

export const makeWildheartMotif = (ctx) => makeArp(ctx, [110, 130.81, 164.81], 0.22, 'sawtooth', { gain: 0.3 });          // A2 C3 E3 — primal rise
export const makeVoidhandMotif = (ctx) => makeArp(ctx, [164.81, 123.47, 82.41], 0.24, 'square', { gain: 0.3 });            // E3 B2 E2 — gravity falls
export const makeSoulbindMotif = (ctx) => makeArp(ctx, [196.0, 246.94, 293.66, 392.0], 0.18, 'triangle', { gain: 0.3 });   // G3 B3 D4 G4 — a soul joins
export const makeElemancerMotif = (ctx) => makeArp(ctx, [261.63, 329.63, 369.99, 493.88], 0.18, 'sine', { gain: 0.3, shimmer: 0.25 }); // C4 E4 F#4 B4 — lydian wonder

export const MOTIFS = {
  motifWildheart: makeWildheartMotif,
  motifVoidhand: makeVoidhandMotif,
  motifSoulbind: makeSoulbindMotif,
  motifElemancer: makeElemancerMotif,
};
