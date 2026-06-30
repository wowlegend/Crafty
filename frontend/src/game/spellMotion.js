// spellMotion.js — per-element MOTION GRAMMAR (v7-S3.1, pure: no THREE / React / clock / RNG).
//
// WHY: the 4 spells read "samey" because SpellProjectileCore drove EVERY element with one shared
// recipe -- pulse = 1 + sin(phase)*flicker + a hardcoded uniform spin (rotation.x+=.06/.05/.04). Motion
// is read before colour, so identical motion = identical feel. This module gives each element a distinct
// motion personality, keyed by ENERGY_PROFILE.motion:
//   roil   (fire)      -- turbulent, NON-uniform scale, slight upward bias, gentle drift spin
//   static (ice)       -- near-still; rare low-amp crystalline twinkle; NO tumble
//   strobe (lightning) -- discontinuous on/off core intensity (quantized), erratic, NO smooth pulse, no spin
//   orbit  (arcane)    -- smooth single-axis rotation, NO scale-breathing
//   <default>          -- the LEGACY uniform pulse + uniform spin (back-compat for untagged types)
//
// CAPTURE-DETERMINISM: a PURE function of (motion, phase, flicker). The caller freezes `phase` at
// profile.capturePhase under isCaptureMode(), so the returned transform is byte-stable in capture.
//
// RETURNS { shapeScale:[x,y,z], shapeSpin:[rx,ry,rz]|null, innerScale:number, outerScale:[x,y,z], coreIntensity:number }
//   - shapeScale  : non-uniform scale for the silhouette group (was setScalar(pulse)).
//   - shapeSpin   : per-frame ROTATION DELTA (radians) to ADD; null = do not spin. Caller applies only when !capture.
//   - innerScale  : scalar for the hot inner core (was pulse*jitter).
//   - outerScale  : scale for the outer glow shell (was setScalar(pulse)).
//   - coreIntensity in [0,1] : multiplies the core opacity/emissive (the strobe lever); 1 for non-strobe.

// Deterministic stepped strobe: a square on/off wave with `duty` cycle, derived from a continuous phase.
// Bright = 1, dim = 0.18 (never fully off, so the bolt still reads between flashes).
const strobeGate = (phase, freq, duty) => (((phase * freq) % 1) + 1) % 1 < duty ? 1 : 0.18;

export function computeSpellMotion(motion, phase, flicker = 0.12) {
  switch (motion) {
    case 'roil': {
      // fire: turbulent, non-uniform, RISING (y taller). Multiple incommensurate sines -> no clean loop.
      const sx = 1 + Math.sin(phase) * flicker * 0.6;
      const sy = 1 + Math.sin(phase * 1.7 + 0.5) * flicker + flicker * 0.5; // upward bias -> licks up
      const sz = 1 + Math.sin(phase * 1.3 + 1.1) * flicker * 0.6;
      return {
        shapeScale: [sx, sy, sz],
        shapeSpin: [0.012, 0.02, 0.008], // gentle turbulent drift, not a tidy tumble
        innerScale: 1 + Math.sin(phase * 2.3) * flicker * 0.5,
        outerScale: [sx, sy * 1.1, sz], // glow licks a touch taller than the body
        coreIntensity: 1,
      };
    }
    case 'static': {
      // ice: near-frozen. Only a slow, low-amplitude crystalline twinkle; no tumble (cold = still).
      const tw = 1 + Math.sin(phase * 0.5) * flicker * 0.25;
      return { shapeScale: [tw, tw, tw], shapeSpin: null, innerScale: tw, outerScale: [tw, tw, tw], coreIntensity: 1 };
    }
    case 'strobe': {
      // lightning: discontinuous flash. coreIntensity gates on/off; a tiny scale snap on the flash.
      const g = strobeGate(phase, 3.1, 0.55);
      const micro = 1 + (g > 0.5 ? flicker * 0.3 : -flicker * 0.2);
      return { shapeScale: [micro, micro, micro], shapeSpin: null, innerScale: micro, outerScale: [micro, micro, micro], coreIntensity: g };
    }
    case 'orbit': {
      // arcane: a smooth orbital wheel. Steady single-axis rotation, no scale-breathing (serene/uncanny).
      return { shapeScale: [1, 1, 1], shapeSpin: [0, 0.03, 0], innerScale: 1, outerScale: [1, 1, 1], coreIntensity: 1 };
    }
    default: {
      // back-compat: the legacy uniform pulse + uniform spin, so untagged/unknown types are unchanged.
      const pulse = 1 + Math.sin(phase) * flicker;
      return { shapeScale: [pulse, pulse, pulse], shapeSpin: [0.06, 0.05, 0.04], innerScale: pulse, outerScale: [pulse, pulse, pulse], coreIntensity: 1 };
    }
  }
}
