// mobFeatures.js — pure per-type silhouette-accessory specs (T1 of the mob-distinctness milestone,
// spec: docs/superpowers/specs/2026-06-14-crafty-mob-distinctness-design.md). Each spec is an
// axis-aligned BOX in the MobModel body-local space (body centered at y=bodyH/2, spanning y∈[0,bodyH];
// head centered at y=bodyH+headH/2, z=bodyD/3). T3 maps these to <mesh> boxes with the SAME toon
// material + inverted-hull outline as the body, so a featured mob reads as ONE creature whose
// SILHOUETTE (not just color) identifies the species. Static geometry only (capture-deterministic).
//
// A spec: { box:[w,h,d], pos:[x,y,z], rot?:[x,y,z], tone?:'dark'|'bone' }. `rot` defaults to none;
// `tone` is an optional shade hint the renderer applies (else the feature inherits the body color).
// Positions/sizes are DERIVED from the body dims so features scale with each type's size.

const FEATURES = {
  // rare heavy tank -> a looming, top-heavy BRUTE: hunched shoulder slabs + a head moss-crown.
  moss_brute: (d) => [
    { box: [d.bodyW * 0.55, d.bodyH * 0.22, d.bodyD * 0.80], pos: [-d.bodyW * 0.45, d.bodyH * 0.95, 0], rot: [0, 0, 0.35], tone: 'dark' },
    { box: [d.bodyW * 0.55, d.bodyH * 0.22, d.bodyD * 0.80], pos: [ d.bodyW * 0.45, d.bodyH * 0.95, 0], rot: [0, 0, -0.35], tone: 'dark' },
    { box: [d.headW * 0.90, d.headH * 0.30, d.headD * 0.90], pos: [0, d.bodyH + d.headH * 1.05, d.bodyD / 3], tone: 'dark' },
  ],
  // fast quad hunter -> a HOUND: pointed ears + a down-back tail.
  duskhound: (d) => [
    { box: [d.headW * 0.18, d.headH * 0.50, d.headD * 0.20], pos: [-d.headW * 0.30, d.bodyH + d.headH * 1.10, d.bodyD / 3], rot: [0, 0, 0.20] },
    { box: [d.headW * 0.18, d.headH * 0.50, d.headD * 0.20], pos: [ d.headW * 0.30, d.bodyH + d.headH * 1.10, d.bodyD / 3], rot: [0, 0, -0.20] },
    { box: [d.bodyW * 0.16, d.bodyH * 0.18, d.bodyD * 0.70], pos: [0, d.bodyH * 0.55, -d.bodyD * 0.70], rot: [0.50, 0, 0] },
  ],
  // tiny swarmer -> an INSECT: antennae on the head front-top.
  skitterling: (d) => [
    { box: [d.headW * 0.10, d.headH * 0.70, d.headW * 0.10], pos: [-d.headW * 0.20, d.bodyH + d.headH * 1.20, d.bodyD / 3 + d.headD * 0.30], rot: [0.30, 0, 0.15] },
    { box: [d.headW * 0.10, d.headH * 0.70, d.headW * 0.10], pos: [ d.headW * 0.20, d.bodyH + d.headH * 1.20, d.bodyD / 3 + d.headD * 0.30], rot: [0.30, 0, -0.15] },
  ],
  // fast bony hostile -> a SKELETON: rib slats across the torso front.
  skeleton: (d) => [
    { box: [d.bodyW * 0.85, d.bodyH * 0.08, 0.04], pos: [0, d.bodyH * 0.62, d.bodyD / 2 + 0.02], tone: 'bone' },
    { box: [d.bodyW * 0.80, d.bodyH * 0.08, 0.04], pos: [0, d.bodyH * 0.45, d.bodyD / 2 + 0.02], tone: 'bone' },
    { box: [d.bodyW * 0.70, d.bodyH * 0.08, 0.04], pos: [0, d.bodyH * 0.28, d.bodyD / 2 + 0.02], tone: 'bone' },
  ],
  // passive livestock -> stubby horns on the head sides.
  cow: (d) => [
    { box: [d.headW * 0.30, d.headH * 0.18, d.headD * 0.18], pos: [-d.headW * 0.55, d.bodyH + d.headH * 0.85, d.bodyD / 3], tone: 'bone' },
    { box: [d.headW * 0.30, d.headH * 0.18, d.headD * 0.18], pos: [ d.headW * 0.55, d.bodyH + d.headH * 0.85, d.bodyD / 3], tone: 'bone' },
  ],
};

// The types that carry silhouette features (pig/zombie/villager/spider are intentionally plain — the
// spider's 8-leg sprawl + the zombie's render-side head-tilt [T3, a transform tweak not a box] carry them).
export const FEATURED_TYPES = Object.keys(FEATURES);

// mobFeatures(type, dims) -> array of accessory box specs (empty for unfeatured types / missing dims).
// dims = { bodyW, bodyH, bodyD, headW, headH, headD } (MobModel's resolved body/head box dimensions).
export function mobFeatures(type, dims) {
  const fn = FEATURES[type];
  if (!fn || !dims) return [];
  return fn(dims);
}
