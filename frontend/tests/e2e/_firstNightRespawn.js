// _firstNightRespawn.js — where beat (f) of tests/e2e/first-night.spec.js lets the player fall, and what rising right
// means (the brief: "respawn at the lit light nearest the fall"; N8 picks nearestLit of the death point, else the
// Hearth; DECISIONS 2026-11-01 (W3-A PR C) item 486). Pure, so tests/gates/first-night-respawn-gates.test.js drives the
// beat's own cases under the right rule and the wrong ones a respawn could be built with.
//
// The beat plays on the returning profile, where the Hearth reads lit, so each death is placed where the light it names
// is the nearest lit one by 6 m or more: beside the lantern (12 m from it, about 32 m from the Hearth); nearer the Hearth
// with the lantern standing (14 m from the Hearth, about 34 m from the lantern), the case a rule that prefers any lantern
// fails; and beside the lantern's place once it is mined, the case a rule reading a stale index fails. 12 m keeps "rise
// where you fell" apart from both lights past their tolerances.

/** The Hearth on the ground plane (world/homeAnchor.js: the plinth at the origin). */
export const HEARTH_XZ = Object.freeze([0, 0]);
/** How near the body must rise to the light a case names, in metres on the ground plane. */
export const RISE_M = Object.freeze({ lantern: 3, hearth: 4 });
const MARGIN_M = 6;

const xz = (p) => (Array.isArray(p) ? (p.length === 3 ? [p[0], p[2]] : p) : [p.x, p.z]);
const flat = (a, b) => Math.hypot(xz(a)[0] - xz(b)[0], xz(a)[1] - xz(b)[1]);

/** The beat's three deaths for a lantern at `lantern` ({ x, z }), in the order it plays them. */
export function respawnCases(lantern) {
  const beside = Object.freeze({ x: lantern.x + 12, z: lantern.z });
  return Object.freeze([
    Object.freeze({ check: 'near', death: beside, at: 'lantern', lantern: 'standing' }),
    Object.freeze({ check: 'hearth', death: Object.freeze({ x: -14, z: lantern.z }), at: 'hearth', lantern: 'standing' }),
    Object.freeze({ check: 'fallback', death: beside, at: 'hearth', lantern: 'mined' }),
  ]);
}

/** Whether the case's geometry holds: the light it names is the nearest lit one to the death by MARGIN_M or more. */
export function caseHolds(c, lantern) {
  const dH = flat(c.death, HEARTH_XZ);
  if (c.lantern === 'mined') return c.at === 'hearth';
  const dL = flat(c.death, lantern);
  return c.at === 'lantern' ? dL + MARGIN_M <= dH : dH + MARGIN_M <= dL;
}

/** Whether a body that rose at `rose` answers the case. */
export const roseRight = (c, rose, lantern) => flat(rose, c.at === 'lantern' ? lantern : HEARTH_XZ) <= RISE_M[c.at];

/** How far `rose` is from each light, for the beat's red line. */
export const distances = (c, rose, lantern) => ({ death: { lantern: flat(c.death, lantern), hearth: flat(c.death, HEARTH_XZ) }, rose: { lantern: flat(rose, lantern), hearth: flat(rose, HEARTH_XZ) } });
