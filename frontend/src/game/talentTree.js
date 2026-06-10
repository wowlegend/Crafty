/**
 * talentTree.js — the 4 Aspect talent trees (data) + a pure effect-fold + limits + a
 * stale-id refund migration. Pure (no React/store/THREE). Each node's effect adds
 * `perRank` to one of the 4 effective attributes (strength/agility/intellect/armor),
 * so effects fold through getEffectiveAttributes (derive, never bake) and every solver
 * + deriveMaxStats picks them up free. Per-Aspect SIGNATURE abilities are S2-B; these
 * foundational stat nodes are the S2-A scaffold. Taxonomy numbers are Kevin-tunable.
 */
export const ASPECT_TREES = [
  {
    aspect: 'voidhand', title: 'Voidhand', icon: 'force', accent: 'text-stat-atk', dot: 'bg-stat-atk',
    nodes: [
      { id: 'voidhand_force', name: 'Kinetic Force', desc: '+3 Strength per rank — kinetic strikes and hurled mass hit harder.', limit: 3, prereq: null, effect: { stat: 'strength', perRank: 3 } },
      { id: 'voidhand_ward', name: 'Gravity Ward', desc: '+6 Armor per rank — orbiting mass shields you (base-as-anvil).', limit: 3, prereq: null, effect: { stat: 'armor', perRank: 6 } },
      { id: 'voidhand_crush', name: 'Crushing Pull', desc: '+2 Strength per rank — heavier gravitic slams.', limit: 2, prereq: 'voidhand_force', effect: { stat: 'strength', perRank: 2 } },
      // S2-B2-M4: the grab UNLOCK — effect-LESS like wildheart_roar (the stat-fold skips it;
      // rank is read at the SM entry gate in Components). Gates the whole VOIDHAND verb kit.
      { id: 'voidhand_grasp', name: 'Kinetic Grasp', desc: 'Unlocks the VOIDHAND grab — press V in combat to seize a phantom block (costs 25 banked Kinetic); hurl it (attack) or slam it down (cast).', limit: 1, prereq: 'voidhand_force' },
    ],
  },
  {
    aspect: 'wildheart', title: 'Wildheart', icon: 'run', accent: 'text-stat-spd', dot: 'bg-stat-spd',
    nodes: [
      { id: 'wildheart_vigor', name: 'Beast Vigor', desc: '+3 Strength per rank — primal might and a bigger health pool.', limit: 3, prereq: null, effect: { stat: 'strength', perRank: 3 } },
      { id: 'wildheart_swift', name: 'Feral Swiftness', desc: '+4 Agility per rank — faster, deadlier strikes (more crit).', limit: 3, prereq: null, effect: { stat: 'agility', perRank: 4 } },
      { id: 'wildheart_frenzy', name: 'Blood Frenzy', desc: '+3 Agility per rank — the kill-rush sharpens your edge.', limit: 2, prereq: 'wildheart_swift', effect: { stat: 'agility', perRank: 3 } },
      // S2-B1-M6 SIGNATURE nodes (effect-less — skipped by the stat-fold; rank read at THEIR OWN site):
      { id: 'wildheart_roar', name: 'Primal Roar', desc: 'Unlocks the WILDHEART transformation — hold R with a full Ferocity bank in the night siege to become an element-beast (your loaded spell picks the form).', limit: 1, prereq: 'wildheart_vigor' },
      { id: 'wildheart_endurance', name: 'Primal Endurance', desc: '+3s beast-form duration per rank — stay feral longer (read at the duration timer, not the stat-fold).', limit: 3, prereq: 'wildheart_roar' },
    ],
  },
  {
    aspect: 'soulbind', title: 'Soulbind', icon: 'shield', accent: 'text-stat-def', dot: 'bg-stat-def',
    nodes: [
      { id: 'soulbind_bond', name: 'Soul Bond', desc: '+3 Intellect per rank — deepen the bond that binds living creatures.', limit: 3, prereq: null, effect: { stat: 'intellect', perRank: 3 } },
      { id: 'soulbind_aegis', name: "Warden's Aegis", desc: '+5 Armor per rank — the warden shields the bound squad and self.', limit: 3, prereq: null, effect: { stat: 'armor', perRank: 5 } },
      { id: 'soulbind_link', name: 'Spirit Link', desc: '+2 Intellect per rank — stronger spirit channels.', limit: 2, prereq: 'soulbind_bond', effect: { stat: 'intellect', perRank: 2 } },
      // S2-B3-M2: effect-less unlocks (the voidhand_grasp pattern) — the kit gates on talents, not stats.
      { id: 'soulbind_snare', name: 'Soul Snare', desc: 'Unlock the SNARE verb — bind a weakened creature to your squad (X).', limit: 1, prereq: 'soulbind_bond' },
      { id: 'soulbind_pack', name: 'Pack Warden', desc: '+1 squad slot — a third creature may walk beside you.', limit: 1, prereq: 'soulbind_snare' },
    ],
  },
  {
    aspect: 'elemancer', title: 'Elemancer', icon: 'magic', accent: 'text-spell-arcane', dot: 'bg-spell-arcane',
    nodes: [
      { id: 'elemancer_focus', name: 'Elemental Focus', desc: '+4 Intellect per rank — greater spell power and a deeper mana pool.', limit: 3, prereq: null, effect: { stat: 'intellect', perRank: 4 } },
      { id: 'elemancer_volatile', name: 'Volatile Edge', desc: '+3 Agility per rank — volatile elements crit more often.', limit: 3, prereq: null, effect: { stat: 'agility', perRank: 3 } },
      { id: 'elemancer_cataclysm', name: 'Cataclysm', desc: '+3 Intellect per rank — channel cataclysmic elemental force.', limit: 2, prereq: 'elemancer_focus', effect: { stat: 'intellect', perRank: 3 } },
    ],
  },
];

/** All node ids -> limit (single source; the store imports this, killing its inline map). */
export const TALENT_LIMITS = Object.fromEntries(
  ASPECT_TREES.flatMap((t) => t.nodes).map((n) => [n.id, n.limit])
);

const NODE_BY_ID = Object.fromEntries(ASPECT_TREES.flatMap((t) => t.nodes).map((n) => [n.id, n]));

/** Derive talent stat bonuses onto an effective-attrs object. Returns a NEW object; never mutates base. */
export function foldTalentEffects(eff, unlockedTalents) {
  const out = { ...eff };
  for (const id in (unlockedTalents || {})) {
    const node = NODE_BY_ID[id];
    const rank = unlockedTalents[id] || 0;
    // Effect-less nodes (signature UNLOCKS + ability-tuning LEVERS, e.g. wildheart_roar/wildheart_
    // endurance) carry no `.effect` — they are SKIPPED by the stat-fold (which would otherwise throw
    // on the unconditional destructure) and read their rank at THEIR OWN math site (the roar gate / the
    // duration timer), never here. (S2-B1-M6 node-shape contract.)
    if (!node || rank <= 0 || !node.effect) continue;
    const { stat, perRank } = node.effect;
    out[stat] = (out[stat] || 0) + perRank * rank;
  }
  return out;
}

/** Migration: refund ranks of ids not in the current trees back into points; drop the stale ids. */
export function refundUnknownTalents(unlockedTalents, talentPoints) {
  const kept = {};
  let refunded = 0;
  for (const id in (unlockedTalents || {})) {
    if (NODE_BY_ID[id]) kept[id] = unlockedTalents[id];
    else refunded += unlockedTalents[id] || 0;
  }
  return { unlockedTalents: kept, talentPoints: (talentPoints || 0) + refunded };
}
