/**
 * beastAvatarParts.js — S2-B1-M7b: the per-form VOXEL BEAST avatar layout (pure data).
 *
 * The transform-cam (M7a) reveals a visible beast; this is its procedural box-construction (mirrors the
 * mob render idiom — `SimplifiedNPCSystem` MobMesh: a group of box meshes + the toon material). Each
 * form is a distinct MASS-SILHOUETTE (the content-variety / grayscale-silhouette test — shape first,
 * element color LAST). `BeastAvatar.jsx` renders these boxes with `MobToonMaterial` (the crisp toneMapped
 * "Hades ink" silhouette that NEVER blooms) + the proven SpellProjectileCore glow layers (the
 * toneMapped=false hot-core + aura = the "Genshin radiance") = the locked ③·5 look.
 *
 * Local space: feet at y=0, +Z is forward (the group is yawed to face the look direction by the
 * component). All numbers are Kevin-tunable — the exact shape + the aura dial are judged IN-WORLD at M7d.
 * The LEAD form (comet/fire) is shaped with the most care; the other 3 are first-pass, refined at M8.
 */

// element -> { DARK ink body (the crisp silhouette — never blooms), bright element glow+rim, near-white
// core tint }. The Hades+Genshin fusion: the body is DARK (ink), the ELEMENT color lives in the rim /
// core / aura (the radiance) — NOT the body fill (a bright body + heavy aura = the blob anti-pattern).
const ELEMENT_COLOR = {
  fire:      { body: '#3A1206', glow: '#FF6A2C', core: '#FFE3C0' },
  ice:       { body: '#0E2233', glow: '#6FC8FF', core: '#DCF3FF' },
  lightning: { body: '#2A2408', glow: '#FFE066', core: '#FFFBDC' },
  arcane:    { body: '#1C0E2E', glow: '#B36BFF', core: '#EAD9FF' },
};

// Per-form box construction + glow placement. boxes: [{ pos:[x,y,z], size:[w,h,d], rot:[x,y,z] }].
// core: the hot-core sphere center+radius. aura: the glow-shell radius (relative to a ~unit body).
const FORM_PARTS = {
  // comet (fire) — KEVIN: a BIG DRAGON form. A rearing Western dragon: reared body, a long neck + horned
  // head reaching up-forward, HUGE bat-wings spread wide, front claws, planted back legs, a long tail.
  fire: {
    height: 2.45,
    boxes: [
      { pos: [0, 0.98, -0.12], size: [0.58, 0.82, 1.05], rot: [0.55, 0, 0] },     // reared body (big)
      { pos: [0, 1.78, 0.42], size: [0.34, 0.8, 0.4], rot: [0.75, 0, 0] },        // long neck (rising fwd+up)
      { pos: [0, 2.28, 0.86], size: [0.38, 0.34, 0.66], rot: [0.3, 0, 0] },       // horned dragon head/snout
      { pos: [-0.15, 2.5, 0.66], size: [0.08, 0.28, 0.1], rot: [-0.4, 0, 0.25] },  // left horn
      { pos: [0.15, 2.5, 0.66], size: [0.08, 0.28, 0.1], rot: [-0.4, 0, -0.25] },  // right horn
      { pos: [-1.02, 1.55, -0.42], size: [1.75, 0.08, 1.18], rot: [0.04, 0.55, 0.5] },  // left bat-wing (HUGE)
      { pos: [1.02, 1.55, -0.42], size: [1.75, 0.08, 1.18], rot: [0.04, -0.55, -0.5] }, // right bat-wing
      { pos: [-0.3, 0.9, 0.56], size: [0.17, 0.66, 0.19], rot: [1.0, 0, 0.12] },  // left front claw (reaching)
      { pos: [0.3, 0.9, 0.56], size: [0.17, 0.66, 0.19], rot: [1.0, 0, -0.12] },  // right front claw
      { pos: [-0.28, 0.38, -0.46], size: [0.23, 0.74, 0.27], rot: [-0.15, 0, 0] }, // left back leg (planted)
      { pos: [0.28, 0.38, -0.46], size: [0.23, 0.74, 0.27], rot: [-0.15, 0, 0] },  // right back leg
      { pos: [0, 0.62, -0.95], size: [0.21, 0.21, 0.8], rot: [-0.35, 0, 0] },     // tail base (long)
      { pos: [0, 0.34, -1.48], size: [0.13, 0.13, 0.72], rot: [-0.6, 0, 0] },     // tail tip
    ],
    core: { pos: [0, 1.12, 0.16], radius: 0.22 },
    aura: 1.05,
  },
  // boulder-bull (ice) — KEVIN: BIGGER. A MASSIVE, heavy, LOW + WIDE horned QUADRUPED brute on 4 thick
  // legs (the hulking charge/power silhouette — biggest body mass of the roster).
  ice: {
    height: 1.5,
    boxes: [
      { pos: [0, 0.88, 0], size: [1.0, 0.82, 1.4], rot: [0, 0, 0] },            // HUGE wide low body
      { pos: [0, 0.84, 0.88], size: [0.68, 0.64, 0.56], rot: [-0.1, 0, 0] },    // big blocky head, forward
      { pos: [-0.35, 1.24, 0.95], size: [0.13, 0.13, 0.44], rot: [0, 0, 0.5] }, // left horn (big)
      { pos: [0.35, 1.24, 0.95], size: [0.13, 0.13, 0.44], rot: [0, 0, -0.5] }, // right horn
      { pos: [-0.38, 0.3, 0.52], size: [0.26, 0.62, 0.26], rot: [0, 0, 0] },    // front-left leg (thick)
      { pos: [0.38, 0.3, 0.52], size: [0.26, 0.62, 0.26], rot: [0, 0, 0] },     // front-right leg
      { pos: [-0.38, 0.3, -0.52], size: [0.26, 0.62, 0.26], rot: [0, 0, 0] },   // back-left leg
      { pos: [0.38, 0.3, -0.52], size: [0.26, 0.62, 0.26], rot: [0, 0, 0] },    // back-right leg
    ],
    core: { pos: [0, 0.9, 0.42], radius: 0.26 },
    aura: 1.25,
  },
  // hawk (lightning) — tall, sleek AVIAN RAPTOR: upright body + a beak + big SHARP wings + talons.
  lightning: {
    height: 1.6,
    boxes: [
      { pos: [0, 0.95, 0], size: [0.28, 0.86, 0.34], rot: [0.15, 0, 0] },      // upright sleek body
      { pos: [0, 1.46, 0.16], size: [0.24, 0.26, 0.4], rot: [0.2, 0, 0] },     // head
      { pos: [0, 1.46, 0.44], size: [0.1, 0.1, 0.24], rot: [0.2, 0, 0] },      // beak
      { pos: [-0.64, 1.2, -0.1], size: [1.18, 0.06, 0.62], rot: [0, 0.62, 0.5] },  // left wing (big, sharp)
      { pos: [0.64, 1.2, -0.1], size: [1.18, 0.06, 0.62], rot: [0, -0.62, -0.5] }, // right wing
      { pos: [-0.1, 0.42, 0], size: [0.1, 0.5, 0.12], rot: [0, 0, 0] },        // left talon-leg
      { pos: [0.1, 0.42, 0], size: [0.1, 0.5, 0.12], rot: [0, 0, 0] },         // right talon-leg
      { pos: [0, 0.6, -0.42], size: [0.1, 0.1, 0.5], rot: [-0.4, 0, 0] },      // tail feathers
    ],
    core: { pos: [0, 1.02, 0.12], radius: 0.15 },
    aura: 0.9,
  },
  // golem (arcane) — TALL, MASSIVE blocky monolith CONSTRUCT (no wings): huge torso + heavy arms/legs.
  arcane: {
    height: 1.8,
    boxes: [
      { pos: [0, 0.9, 0], size: [0.82, 1.2, 0.62], rot: [0, 0, 0] },           // massive blocky torso
      { pos: [0, 1.66, 0.04], size: [0.52, 0.5, 0.5], rot: [0, 0, 0] },        // big blocky head
      { pos: [-0.58, 1.0, 0], size: [0.3, 0.88, 0.3], rot: [0, 0, 0.05] },     // heavy left arm
      { pos: [0.58, 1.0, 0], size: [0.3, 0.88, 0.3], rot: [0, 0, -0.05] },     // heavy right arm
      { pos: [-0.22, 0.28, 0], size: [0.28, 0.56, 0.32], rot: [0, 0, 0] },     // thick left leg
      { pos: [0.22, 0.28, 0], size: [0.28, 0.56, 0.32], rot: [0, 0, 0] },      // thick right leg
    ],
    core: { pos: [0, 1.05, 0.14], radius: 0.24 },
    aura: 1.15,
  },
};

// --- M7d SHAPE-VARIANT SHOWCASE: 4 distinct silhouette PHILOSOPHIES for the LEAD (fire/comet) beast,
// for Kevin to pick (mirrors the M0 mockup approach). Each is a full box-construction + core. The
// chosen one gets baked into FORM_PARTS.fire; the rest + this map are then removed. Same dark-ink body
// + element rim + bloom-core recipe applies to all (the look is locked; this is the SHAPE choice).
export const FIRE_SHAPE_VARIANTS = {
  // A — FERAL QUADRUPED: a low, horizontal, 4-legged panther/wolf lunging forward. Reads as an animal.
  A: {
    label: 'feral quadruped',
    boxes: [
      { pos: [0, 0.55, 0], size: [0.42, 0.42, 0.95], rot: [0.1, 0, 0] },
      { pos: [0, 0.6, 0.62], size: [0.34, 0.32, 0.4], rot: [-0.15, 0, 0] },
      { pos: [0, 0.62, 0.84], size: [0.18, 0.16, 0.22], rot: [0, 0, 0] },
      { pos: [-0.16, 0.25, 0.42], size: [0.12, 0.5, 0.12], rot: [0.2, 0, 0] },
      { pos: [0.16, 0.25, 0.42], size: [0.12, 0.5, 0.12], rot: [0.2, 0, 0] },
      { pos: [-0.16, 0.27, -0.36], size: [0.12, 0.54, 0.12], rot: [-0.15, 0, 0] },
      { pos: [0.16, 0.27, -0.36], size: [0.12, 0.54, 0.12], rot: [-0.15, 0, 0] },
      { pos: [0, 0.78, -0.52], size: [0.1, 0.1, 0.5], rot: [-0.7, 0, 0] },
    ],
    core: { pos: [0, 0.6, 0.28], radius: 0.16 },
  },
  // B — BIPEDAL WEREBEAST: a hunched feral humanoid with clawed arms (the "transform into a beast-warrior").
  B: {
    label: 'bipedal werebeast',
    boxes: [
      { pos: [0, 1.0, 0], size: [0.5, 0.7, 0.42], rot: [0.3, 0, 0] },
      { pos: [0, 1.42, 0.22], size: [0.34, 0.34, 0.38], rot: [0.1, 0, 0] },
      { pos: [-0.36, 0.95, 0.18], size: [0.16, 0.6, 0.16], rot: [0.35, 0, 0.2] },
      { pos: [0.36, 0.95, 0.18], size: [0.16, 0.6, 0.16], rot: [0.35, 0, -0.2] },
      { pos: [-0.16, 0.4, -0.02], size: [0.18, 0.7, 0.2], rot: [-0.2, 0, 0] },
      { pos: [0.16, 0.4, -0.02], size: [0.18, 0.7, 0.2], rot: [-0.2, 0, 0] },
    ],
    core: { pos: [0, 1.05, 0.18], radius: 0.18 },
  },
  // C — ELEMENTAL ENERGY-FORM: a sleek upward-tapering flame-being + floating shards (abstract Genshin).
  C: {
    label: 'elemental energy-form',
    boxes: [
      { pos: [0, 0.5, 0], size: [0.5, 0.5, 0.4], rot: [0, 0, 0] },
      { pos: [0, 0.95, 0.02], size: [0.34, 0.5, 0.3], rot: [0.05, 0, 0] },
      { pos: [0, 1.32, 0.04], size: [0.2, 0.42, 0.2], rot: [0.1, 0, 0] },
      { pos: [-0.3, 0.72, -0.05], size: [0.1, 0.34, 0.1], rot: [0.2, 0, 0.5] },
      { pos: [0.3, 0.72, -0.05], size: [0.1, 0.34, 0.1], rot: [0.2, 0, -0.5] },
    ],
    core: { pos: [0, 0.78, 0.12], radius: 0.2 },
  },
  // D — WINGED RAPTOR / COMET: a sharp diving bird-of-prey with big swept wings (the literal speed read).
  D: {
    label: 'winged raptor / comet',
    boxes: [
      { pos: [0, 0.8, 0.1], size: [0.3, 0.4, 0.8], rot: [0.4, 0, 0] },
      { pos: [0, 1.0, 0.44], size: [0.22, 0.22, 0.36], rot: [0.4, 0, 0] },
      { pos: [-0.52, 0.95, -0.1], size: [0.72, 0.06, 0.5], rot: [0.1, 0.4, 0.5] },
      { pos: [0.52, 0.95, -0.1], size: [0.72, 0.06, 0.5], rot: [0.1, -0.4, -0.5] },
      { pos: [0, 0.55, -0.5], size: [0.08, 0.3, 0.5], rot: [0.5, 0, 0] },
    ],
    core: { pos: [0, 0.82, 0.18], radius: 0.16 },
  },
};

/** beastAvatarParts(element, shapeVariant?) -> { bodyColor, glowColor, coreColor, height, boxes, core, aura } | null.
 *  shapeVariant (showcase only) overrides the fire box-construction with a FIRE_SHAPE_VARIANTS entry. */
export function beastAvatarParts(element, shapeVariant) {
  const parts = FORM_PARTS[element];
  const col = ELEMENT_COLOR[element];
  if (!parts || !col) return null;
  let boxes = parts.boxes;
  let core = parts.core;
  if (element === 'fire' && shapeVariant && FIRE_SHAPE_VARIANTS[shapeVariant]) {
    boxes = FIRE_SHAPE_VARIANTS[shapeVariant].boxes;
    core = FIRE_SHAPE_VARIANTS[shapeVariant].core;
  }
  return { bodyColor: col.body, glowColor: col.glow, coreColor: col.core, height: parts.height, boxes, core, aura: parts.aura };
}

export const BEAST_AVATAR_ELEMENTS = Object.keys(FORM_PARTS);
