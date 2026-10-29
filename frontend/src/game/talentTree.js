/**
 * talentTree.js — the four Aspect talent trees (data), their limits, exclusivity, respec, and the load-time refund of
 * ranks the trees no longer allow. Pure (no React/store/THREE).
 *
 * Every node changes how its Aspect's verb plays (DECISIONS 2026-10-28 W1-H item 6). A root node unlocks the verb and
 * carries no `mod`; every other node carries one `mod` in the vocabulary game/verbMods.js folds (`{ key, add }` per
 * rank), the same one relics use. No node adds a stat: damage, health and mana come from the level.
 *
 * Shape per tree: a root with no prerequisite (a level-2 player can take one), modifier nodes behind it, and two
 * capstones behind one of those that exclude each other.
 */
import { GRAB_COST } from './ember.js';
import { ENDURANCE_SEC_PER_RANK } from './beastTransform.js';

export const ASPECT_TREES = [
  {
    aspect: 'voidhand', title: 'Voidhand', icon: 'force', accent: 'text-stat-atk', dot: 'bg-stat-atk',
    nodes: [
      { id: 'voidhand_grasp', name: 'Kinetic Grasp', desc: `Unlocks the VOIDHAND grab: press V in combat to seize a phantom block (costs ${GRAB_COST} ember); hurl it (attack) or slam it down (cast).`, limit: 1, prereq: null },
      { id: 'voidhand_twin', name: 'Twin Grasp', desc: 'A grab holds two blocks: the first hurl or slam leaves the second in hand.', limit: 1, prereq: 'voidhand_grasp', mod: { key: 'grabThrows', add: 1 } },
      { id: 'voidhand_reach', name: 'Long Hold', desc: 'A grabbed block stays in hand 4 s longer per rank.', limit: 2, prereq: 'voidhand_grasp', mod: { key: 'holdSec', add: 4 } },
      { id: 'voidhand_singularity', name: 'Singularity', desc: 'A slam lands 1.5 m wider. Excludes Event Horizon.', limit: 1, prereq: 'voidhand_twin', excludes: 'voidhand_horizon', mod: { key: 'slamRadius', add: 1.5 } },
      { id: 'voidhand_horizon', name: 'Event Horizon', desc: 'A grabbed block stays in hand 8 s longer. Excludes Singularity.', limit: 1, prereq: 'voidhand_twin', excludes: 'voidhand_singularity', mod: { key: 'holdSec', add: 8 } },
    ],
  },
  {
    aspect: 'wildheart', title: 'Wildheart', icon: 'run', accent: 'text-stat-spd', dot: 'bg-stat-spd',
    nodes: [
      { id: 'wildheart_roar', name: 'Primal Roar', desc: 'Unlocks the WILDHEART transformation: hold R with a full ember bar to become an element-beast (your loaded spell picks the form).', limit: 1, prereq: null },
      { id: 'wildheart_endurance', name: 'Primal Endurance', desc: `The roar's beast form lasts ${ENDURANCE_SEC_PER_RANK} s longer per rank.`, limit: 3, prereq: 'wildheart_roar', mod: { key: 'roarSec', add: ENDURANCE_SEC_PER_RANK } },
      { id: 'wildheart_apex', name: 'Apex Predator', desc: 'The beast\'s strikes hit 25% harder. Excludes Untamed.', limit: 1, prereq: 'wildheart_endurance', excludes: 'wildheart_untamed', mod: { key: 'beastMeleeMult', add: 0.25 } },
      { id: 'wildheart_untamed', name: 'Untamed', desc: 'The beast form lasts 8 s longer. Excludes Apex Predator.', limit: 1, prereq: 'wildheart_endurance', excludes: 'wildheart_apex', mod: { key: 'roarSec', add: 8 } },
    ],
  },
  {
    aspect: 'soulbind', title: 'Soulbind', icon: 'shield', accent: 'text-stat-def', dot: 'bg-stat-def',
    nodes: [
      { id: 'soulbind_snare', name: 'Soul Snare', desc: 'Unlocks the SNARE verb: bind a weakened creature to your squad (X).', limit: 1, prereq: null },
      { id: 'soulbind_wide', name: 'Wide Snare', desc: 'The snare\'s aim is twice as wide.', limit: 1, prereq: 'soulbind_snare', mod: { key: 'snareArc', add: Math.PI / 8 } },
      { id: 'soulbind_pack', name: 'Pack Warden', desc: '+1 squad slot: a third creature may walk beside you.', limit: 1, prereq: 'soulbind_snare', mod: { key: 'squadCap', add: 1 } },
      { id: 'soulbind_communion', name: 'Communion', desc: 'The snare binds a creature at half health, not a third. Excludes Warden Bulwark.', limit: 1, prereq: 'soulbind_wide', excludes: 'soulbind_bulwark', mod: { key: 'snareHpFrac', add: 0.2 } },
      { id: 'soulbind_bulwark', name: 'Warden Bulwark', desc: '+1 more squad slot. Excludes Communion.', limit: 1, prereq: 'soulbind_wide', excludes: 'soulbind_communion', mod: { key: 'squadCap', add: 1 } },
    ],
  },
  {
    aspect: 'elemancer', title: 'Elemancer', icon: 'magic', accent: 'text-spell-arcane', dot: 'bg-spell-arcane',
    nodes: [
      { id: 'elemancer_imbue', name: 'Elemental Imbue', desc: 'Unlocks IMBUE: charge your next cast to paint an element zone into the world (Z).', limit: 1, prereq: null },
      { id: 'elemancer_chain', name: 'Chain Imbue', desc: 'An imbued zone leaps to one more hostile within 8 m per rank.', limit: 2, prereq: 'elemancer_imbue', mod: { key: 'imbueChain', add: 1 } },
      { id: 'elemancer_conflux', name: 'Conflux', desc: 'Imbued zones are 50% wider. Excludes Wildfire.', limit: 1, prereq: 'elemancer_chain', excludes: 'elemancer_wildfire', mod: { key: 'zoneRadiusMult', add: 0.5 } },
      { id: 'elemancer_wildfire', name: 'Wildfire', desc: 'An imbued zone leaps to two more hostiles. Excludes Conflux.', limit: 1, prereq: 'elemancer_chain', excludes: 'elemancer_conflux', mod: { key: 'imbueChain', add: 2 } },
    ],
  },
];

/** All node ids -> limit (single source; the store imports this, killing its inline map). */
export const TALENT_LIMITS = Object.fromEntries(
  ASPECT_TREES.flatMap((t) => t.nodes).map((n) => [n.id, n.limit])
);

const NODE_BY_ID = Object.fromEntries(ASPECT_TREES.flatMap((t) => t.nodes).map((n) => [n.id, n]));

/** The node with this id, or null. */
export function talentNode(id) {
  return Object.prototype.hasOwnProperty.call(NODE_BY_ID, id) ? NODE_BY_ID[id] : null;
}

/**
 * Load-time refund: every rank the trees no longer allow comes back as a point. A rank is not allowed when its id is
 * not a node, when it is over the node's limit, when the node's prerequisite is not held, or when its exclusive rival
 * was taken first. Prerequisites are re-checked until nothing changes, so a refunded root takes its branch with it.
 */
export function refundUnknownTalents(unlockedTalents, talentPoints) {
  const kept = {};
  let refunded = 0;
  for (const id in (unlockedTalents || {})) {
    const rank = Math.max(0, Math.floor(Number(unlockedTalents[id]) || 0));
    const node = NODE_BY_ID[id];
    if (!node) { refunded += rank; continue; }
    const allowed = Math.min(rank, node.limit);
    refunded += rank - allowed;
    if (allowed > 0) kept[id] = allowed;
  }
  for (const id of Object.keys(kept)) {
    const node = NODE_BY_ID[id];
    if (node.excludes && kept[node.excludes] && id > node.excludes) { refunded += kept[id]; delete kept[id]; }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of Object.keys(kept)) {
      const pre = NODE_BY_ID[id].prereq;
      if (pre && !kept[pre]) { refunded += kept[id]; delete kept[id]; changed = true; }
    }
  }
  return { unlockedTalents: kept, talentPoints: (Number(talentPoints) || 0) + refunded };
}

/**
 * EXCLUSIVITY: a capstone names its rival in `excludes`, and holding a rank of the rival closes it. One field, read here
 * and at the unlock site, so the panel and the store cannot disagree.
 */
export function talentBlockedBy(nodeId, unlockedTalents) {
  const node = NODE_BY_ID[nodeId];
  if (!node || !node.excludes) return null;
  const rival = node.excludes;
  return (unlockedTalents && (unlockedTalents[rival] || 0) > 0) ? rival : null;
}

/** Can this node take another rank right now? Prereq + limit + exclusivity, in one place. */
export function canUnlockTalent(nodeId, unlockedTalents, talentPoints) {
  const node = NODE_BY_ID[nodeId];
  if (!node) return false;
  if ((talentPoints || 0) <= 0) return false;
  if (((unlockedTalents || {})[nodeId] || 0) >= node.limit) return false;
  if (node.prereq && ((unlockedTalents || {})[node.prereq] || 0) <= 0) return false;
  if (talentBlockedBy(nodeId, unlockedTalents)) return false;
  return true;
}

/** RESPEC: every spent rank back as a point, so a build can be tried again. Returns a new pair, never mutates. */
export function respecTalents(unlockedTalents, talentPoints) {
  let refunded = 0;
  for (const id in (unlockedTalents || {})) refunded += unlockedTalents[id] || 0;
  return { unlockedTalents: {}, talentPoints: (talentPoints || 0) + refunded };
}
