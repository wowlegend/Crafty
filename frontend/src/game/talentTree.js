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
    ],
  },
  {
    aspect: 'wildheart', title: 'Wildheart', icon: 'run', accent: 'text-stat-spd', dot: 'bg-stat-spd',
    nodes: [
      { id: 'wildheart_vigor', name: 'Beast Vigor', desc: '+3 Strength per rank — primal might and a bigger health pool.', limit: 3, prereq: null, effect: { stat: 'strength', perRank: 3 } },
      { id: 'wildheart_swift', name: 'Feral Swiftness', desc: '+4 Agility per rank — faster, deadlier strikes (more crit).', limit: 3, prereq: null, effect: { stat: 'agility', perRank: 4 } },
      { id: 'wildheart_frenzy', name: 'Blood Frenzy', desc: '+3 Agility per rank — the kill-rush sharpens your edge.', limit: 2, prereq: 'wildheart_swift', effect: { stat: 'agility', perRank: 3 } },
    ],
  },
  {
    aspect: 'soulbind', title: 'Soulbind', icon: 'shield', accent: 'text-stat-def', dot: 'bg-stat-def',
    nodes: [
      { id: 'soulbind_bond', name: 'Soul Bond', desc: '+3 Intellect per rank — deepen the bond that binds living creatures.', limit: 3, prereq: null, effect: { stat: 'intellect', perRank: 3 } },
      { id: 'soulbind_aegis', name: "Warden's Aegis", desc: '+5 Armor per rank — the warden shields the bound squad and self.', limit: 3, prereq: null, effect: { stat: 'armor', perRank: 5 } },
      { id: 'soulbind_link', name: 'Spirit Link', desc: '+2 Intellect per rank — stronger spirit channels.', limit: 2, prereq: 'soulbind_bond', effect: { stat: 'intellect', perRank: 2 } },
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
    if (!node || rank <= 0) continue;
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
