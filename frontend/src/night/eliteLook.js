// eliteLook.js — elites you can see on every tier (encounters-siege plan Move E).
//
// An ember-touched elite wears a three-box ember crest above its head; the siege captain adds a two-box banner (a pole
// and a flag) on its back. The boxes are game/mobFeatures.js's vocabulary ({ pos, box, tone }) in the body-local frame,
// so MobModel draws them with the mob's own toon material and ink hull; each is marked `elite`, so it casts no shadow:
// they are small, and each would otherwise add a shadow-map draw. The crest's tone is 'ember' (featureColor), with a
// warm emissive under the bloom threshold, so it reads at night without competing with the eyes, a mob's only glow.

/** The crest and banner boxes for an elite `rank` ('ember' or 'captain'); [] for none. */
export function eliteFeatures(rank, { bodyW, bodyH, bodyD, headW, headH }) {
  if (rank !== 'ember' && rank !== 'captain') return [];
  const top = bodyH + headH + 0.02; // a hair above the head's top face
  const z = bodyD / 3; // the head's centre (MobModel)
  const out = [
    { pos: [0, top + 0.18, z], box: [0.12, 0.36, 0.12], tone: 'ember', elite: true },
    { pos: [-headW * 0.3, top + 0.11, z], box: [0.1, 0.22, 0.1], tone: 'ember', elite: true },
    { pos: [headW * 0.3, top + 0.11, z], box: [0.1, 0.22, 0.1], tone: 'ember', elite: true },
  ];
  if (rank === 'captain') {
    const x = bodyW * 0.3, back = -bodyD / 2 - 0.06;
    out.push(
      { pos: [x, bodyH + 0.4, back], box: [0.06, 1.3, 0.06], tone: 'dark', elite: true },
      { pos: [x + 0.25, bodyH + 0.8, back], box: [0.44, 0.32, 0.03], tone: 'ember', elite: true },
    );
  }
  return out;
}
