// eliteLook.js — elites you can see on every tier (encounters-siege plan Move E).
//
// An ember-touched elite wears a three-box ember crest above its head; the siege captain adds a two-box banner (a pole
// and a flag) on its back. The boxes are game/mobFeatures.js's vocabulary ({ pos, box, tone }) in the body-local frame,
// so MobModel draws them with the mob's own toon material and ink hull; each is marked `elite`, so it casts no shadow:
// they are small, and each would otherwise add a shadow-map draw. The crest's tone is 'ember' (featureColor), with a
// warm emissive under the bloom threshold, so it reads at night without competing with the eyes, a mob's only glow.
// The crest is sized to the head and seated clear of what the head already wears (SEAT); a type whose own head boxes
// are a crest (the ember husk's charred crown, marked `crest` in mobFeatures) wears that crest in ember instead, so the
// two never stack. tests/gates/elite-clearance-gates.test.js holds every hostile type to this, and the nametag over it.
import { MOB_TYPES } from '../game/mobTypes.js';
import { mobFeatures } from '../game/mobFeatures.js';

const CREST_HEAD_W = 0.7; // the crest is authored on a zombie's 0.7 m head and scales with the head's width
// Where the crest sits on a head that already wears something, in fractions of the head: `back` toward the head's back
// (behind a duskhound's ears and a skitterling's antennae, which rise from its front half), `spread` its side boxes'
// offset (0.3 by default; between the ears), `lift` its base over the head's top (onto the moss brute's crown).
const SEAT = {
  duskhound: { back: 0.3, spread: 0.17 },
  skitterling: { back: 0.3 },
  moss_brute: { lift: 0.2 },
};

/** The feature boxes MobModel draws on a mob of `type` with dims `d`: the type's own (mobFeatures) and, for an elite
 *  `rank` ('ember' or 'captain'), its crest and the captain's banner. */
export function drawnFeatures(type, rank, d) {
  const own = mobFeatures(type, d);
  if (rank !== 'ember' && rank !== 'captain') return own;
  const out = own.map((f) => (f.crest ? { ...f, tone: 'ember', elite: true } : f));
  if (!own.some((f) => f.crest)) {
    const s = SEAT[type] || {};
    const k = d.headW / CREST_HEAD_W;
    const top = d.bodyH + d.headH * (1 + (s.lift ?? 0)) + 0.02; // a hair above the head's top face, or the crown's
    const z = d.bodyD / 3 - (s.back ?? 0) * d.headD; // the head's centre (MobModel), moved back
    const x = (s.spread ?? 0.3) * d.headW;
    out.push(
      { pos: [0, top + 0.18 * k, z], box: [0.12 * k, 0.36 * k, 0.12 * k], tone: 'ember', elite: true },
      { pos: [-x, top + 0.11 * k, z], box: [0.1 * k, 0.22 * k, 0.1 * k], tone: 'ember', elite: true },
      { pos: [x, top + 0.11 * k, z], box: [0.1 * k, 0.22 * k, 0.1 * k], tone: 'ember', elite: true },
    );
  }
  if (rank === 'captain') {
    const x = d.bodyW * 0.3, back = -d.bodyD / 2 - 0.06;
    out.push(
      { pos: [x, d.bodyH + 0.4, back], box: [0.06, 1.3, 0.06], tone: 'dark', elite: true },
      { pos: [x + 0.25, d.bodyH + 0.8, back], box: [0.44, 0.32, 0.03], tone: 'ember', elite: true },
    );
  }
  return out;
}

/** A nametag's anchor over a mob's origin (render/Nametags.jsx), in metres. A taller silhouette raises it. */
export const NAMETAG_Y = 2.4;
const TAG_OVER_TOP = 0.26; // the anchor over the silhouette's top: the 0.12 m bar's bottom 0.2 m clear of it

/** Where `entity`'s nametag sits over its origin: NAMETAG_Y, or higher so its bar clears the head, every feature box,
 *  and an elite's crest and banner. A box's top is taken unrotated: a tilted box's exact top is up to 0.15 m higher (a
 *  moss brute's shoulder slab), and none reaches a tag today; the clearance gate measures every type's exact tops. */
export function nametagY(entity) {
  const t = MOB_TYPES[entity.type] || MOB_TYPES.pig;
  const [bodyW, bodyH, bodyD] = entity.bodySize || t.bodySize;
  const [headW, headH, headD] = entity.headSize || t.headSize;
  let top = bodyH + headH;
  for (const f of drawnFeatures(entity.type, entity.elite, { bodyW, bodyH, bodyD, headW, headH, headD })) top = Math.max(top, f.pos[1] + f.box[1] / 2);
  return Math.max(NAMETAG_Y, top + TAG_OVER_TOP);
}
