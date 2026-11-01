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
import { EYE_HEIGHT_M } from '../combat/swingOrigin.js';
import { BEAST_FORMS } from '../game/beasts.js';
import { CONTROLLER_OFFSET } from '../game/kinematicMove.js';

// element -> { DARK ink body (the crisp silhouette — never blooms), bright element glow+rim, near-white
// core tint }. The Hades+Genshin fusion: the body is DARK (ink), the ELEMENT color lives in the rim /
// core / aura (the radiance) — NOT the body fill (a bright body + heavy aura = the blob anti-pattern).
// `rim` = per-element rim-strength MULTIPLIER (S2-B1-M7d polish). The COOL elements (ice cyan, lightning
// yellow) get a STRONGER element rim so their identity survives the warm DAYTIME sun: the body + the
// MobToonMaterial rim are toneMapped/lit, so warm light + the warm magic-hour grade wash them toward
// orange; a brighter element rim re-asserts the cool hue (the grade only saturates, it doesn't hue-shift,
// so a brighter cyan edge stays cyan). fire/arcane already read true (warm-on-warm / purple-on-orange),
// so they stay at 1.0. The grade-resistant additive core/halo are unchanged.
export const ELEMENT_COLOR = {
  fire:      { body: '#3A1206', glow: '#FF6A2C', core: '#FFE3C0', rim: 1.0 },
  ice:       { body: '#0E2233', glow: '#6FC8FF', core: '#DCF3FF', rim: 1.7 },
  lightning: { body: '#2A2408', glow: '#FFE066', core: '#FFFBDC', rim: 1.5 },
  arcane:    { body: '#1C0E2E', glow: '#B36BFF', core: '#EAD9FF', rim: 1.0 },
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

/** beastAvatarParts(element) -> { bodyColor, glowColor, coreColor, rimBoost, height, boxes, core, aura } | null. */
export function beastAvatarParts(element) {
  const parts = FORM_PARTS[element];
  const col = ELEMENT_COLOR[element];
  if (!parts || !col) return null;
  return { bodyColor: col.body, glowColor: col.glow, coreColor: col.core, rimBoost: col.rim ?? 1, height: parts.height, boxes: parts.boxes, core: parts.core, aura: parts.aura };
}

/** @internal Exported for the tests that enumerate it. */
export const BEAST_AVATAR_ELEMENTS = Object.keys(FORM_PARTS);

/**
 * In first person the eye rides the body's centre + EYE_HEIGHT_M (combat/swingOrigin.js), within a few centimetres of
 * the golem's head and the dragon's chest and a hand's width from the hawk's head, with the dragon's wings half a metre
 * off. The boxes are shaped to read from the reveal's 4.5 m;
 * from the eye they are slabs and fragments (the dragon's wings fill the upper corners, the hawk's beak floats under the
 * crosshair) and the halo washes the lower view, so in first person the avatar draws only into the shadow map and its
 * light stays on (DECISIONS 2026-10-29 item 80). Away from the eye, in the reveal, a part nearer the camera than this
 * is not drawn either: it would fill the view or be cut by the camera's 0.1 m near plane.
 */
export const SELF_CLEARANCE_M = 0.25;

/** The avatar's group hangs this far under the body's centre (the capsule's centre is the rigid body's origin); it turns
 *  with the view, and each form's boxes stand inside it at their own feet (formLift). The DEV hook frameBeastReveal
 *  (devtest/devBridge.js) finds the centre from the published group by this. */
export const FEET_OFFSET = -0.9;

/** The lowest point of `boxes` in the avatar's space: each box's centre less the reach of its half-size straight down,
 *  turned by its Euler XYZ rotation (the matrix Rx(a) Ry(b) Rz(c), whose second row maps a local axis onto y). */
function lowestY(boxes) {
  let low = Infinity;
  for (const box of boxes) {
    const [a, b, c] = box.rot || [0, 0, 0];
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
    const reach = Math.abs(ca * sc + sa * sb * cc) * box.size[0] / 2 + Math.abs(ca * cc - sa * sb * sc) * box.size[1] / 2
      + Math.abs(sa * cb) * box.size[2] / 2;
    low = Math.min(low, box.pos[1] - reach);
  }
  return low;
}

const FORM_LOW = Object.fromEntries(Object.entries(FORM_PARTS).map(([el, p]) => [el, lowestY(p.boxes)]));

/**
 * Where a form's parts stand inside the avatar's group (m, up from FEET_OFFSET) when drawn at `scale`: its capsule
 * (game/beasts.js) rests the body's centre halfHeight + radius + the controller's offset (game/kinematicMove.js
 * CONTROLLER_OFFSET) over the floor, and the lowest point of its boxes stands on that floor at every scale, so the
 * entrance grows the form from the floor. 0 for an element with no form or no parts.
 */
export function formLift(element, scale = 1) {
  const form = BEAST_FORMS[element], low = FORM_LOW[element];
  if (!form || low === undefined) return 0;
  return -(form.halfHeight + form.radius + CONTROLLER_OFFSET) - FEET_OFFSET - low * scale;
}

/** The element glow's strength: it scales the rim, the core, the halo and the core's light, never the ink body. */
export const BEAST_GLOW = 1.7;

/** The core's breathing pulse peaks at this scale (BeastAvatar.jsx), so its clearance is judged at it. */
export const CORE_PULSE_MAX = 1.08;

/** The first-person eye over the avatar's feet, in metres: on its axis, EYE_HEIGHT_M over the body's centre. */
export const EYE_LOCAL_Y = EYE_HEIGHT_M - FEET_OFFSET;

/** When the follow did not place the camera (render/followView.js), it counts as first person while it is within this
 *  of the steady eye, in world metres: the roar's reveal (4.7 m off at its hold) leaves it within its first fifth and
 *  comes back inside it in its last, and an eye pose stands at it. The follow itself is first person however far its
 *  shake carries the camera. */
export const FIRST_PERSON_M = 1.0;

/** The glow spheres each form draws at its core, at their largest drawn radius: the core with its pulse, the white
 *  hot spot inside it, and the faint back halo. */
export function beastAvatarSpheres(parts) {
  const r = parts.core.radius;
  return {
    core: { pos: parts.core.pos, radius: r * 0.6 * CORE_PULSE_MAX },
    hotspot: { pos: parts.core.pos, radius: r * 0.32 * CORE_PULSE_MAX },
    halo: { pos: parts.core.pos, radius: haloRadius(parts) },
  };
}

/** The back halo's radius (BeastAvatar.jsx draws it at this). */
export function haloRadius(parts) {
  return parts.core.radius * 1.7 * parts.aura * (0.9 + 0.1 * BEAST_GLOW);
}

/** The distance from point (x, y, z) to a sphere { pos, radius }'s solid, 0 inside it. */
export function sphereDistance(sphere, x, y, z) {
  return Math.max(Math.hypot(x - sphere.pos[0], y - sphere.pos[1], z - sphere.pos[2]) - sphere.radius, 0);
}

/** Whether a camera (dx, dy, dz) world metres from the steady eye stands at the player's own eye: within FIRST_PERSON_M.
 *  World metres, not the avatar's: on the form's first frames its entrance draws it at half scale. */
export function nearEye(dx, dy, dz) {
  return Math.hypot(dx, dy, dz) <= FIRST_PERSON_M;
}

/** The distance from point (x, y, z) to a box { pos, size, rot (Euler XYZ) }, 0 inside it. Same local space. */
export function boxDistance(box, x, y, z) {
  const [a, b, c] = box.rot || [0, 0, 0];
  let px = x - box.pos[0], py = y - box.pos[1], pz = z - box.pos[2];
  // Into the box's frame: the inverse of Rx(a) Ry(b) Rz(c), applied as Rx(-a), then Ry(-b), then Rz(-c).
  let t = py * Math.cos(a) + pz * Math.sin(a);
  pz = -py * Math.sin(a) + pz * Math.cos(a); py = t;
  t = px * Math.cos(b) - pz * Math.sin(b);
  pz = px * Math.sin(b) + pz * Math.cos(b); px = t;
  t = px * Math.cos(c) + py * Math.sin(c);
  py = -px * Math.sin(c) + py * Math.cos(c); px = t;
  const dx = Math.max(Math.abs(px) - box.size[0] / 2, 0);
  const dy = Math.max(Math.abs(py) - box.size[1] / 2, 0);
  const dz = Math.max(Math.abs(pz) - box.size[2] / 2, 0);
  return Math.hypot(dx, dy, dz);
}
