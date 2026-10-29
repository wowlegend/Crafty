/**
 * verbMods.js — the one vocabulary in which talents and relics change the Aspect verbs (DECISIONS 2026-10-28 W1-H item
 * 6). A modifier is `{ key, add }`; a talent adds it once per rank, a relic once. Folding the player's ranks and relic
 * over VERB_BASE gives the numbers every verb site reads (the store's getVerbMods). Pure: no React, store or THREE.
 */
import { FORM_DURATION_SEC } from './beastTransform.js';
import { MAX_HOLD_SEC } from './voidhand.js';
import { SLAM_RADIUS } from './hurl.js';
import { BASE_SQUAD_CAP, SNARE_ARC, SNARE_HP_FRAC } from './soulbind.js';
import { talentNode } from './talentTree.js';
import { relicByName, RELIC_MAX_TIER } from './relics.js';

/** Each verb's numbers with no talent and no relic: the values the verbs played with before talents changed them. */
export const VERB_BASE = Object.freeze({
  roarSec: FORM_DURATION_SEC, // how long the roar's beast form lasts
  beastMeleeMult: 1, // the beast form's swing, on top of its element's own multiplier
  grabThrows: 1, // hurls or slams one grab holds
  holdSec: MAX_HOLD_SEC, // how long a grabbed block stays in hand
  slamRadius: SLAM_RADIUS, // the slam's reach around the held block
  snareArc: SNARE_ARC, // the snare's aim cone, full arc
  snareHpFrac: SNARE_HP_FRAC, // a hostile binds at or below this share of its health
  squadCap: BASE_SQUAD_CAP, // bound creatures held at once
  imbueChain: 0, // further hostiles an imbued zone leaps to
  zoneRadiusMult: 1, // an imbued zone's radius, as a multiple of its kind's
});

const apply = (out, mod, times) => {
  if (!mod || !Object.prototype.hasOwnProperty.call(VERB_BASE, mod.key) || !(times > 0)) return;
  out[mod.key] += mod.add * times;
};

/**
 * The verb numbers for a talent map (id -> rank), an equipped relic (its display name, or null) and the tier the Forge
 * tempered it to (game/relics.js relicTier). A rank above its node's limit counts as the limit, a tier outside 1 to
 * RELIC_MAX_TIER as the nearest end; an unknown id or relic adds nothing.
 */
export function foldVerbMods(unlockedTalents, relicName, relicTier = 1) {
  const out = { ...VERB_BASE };
  for (const id in (unlockedTalents || {})) {
    const node = talentNode(id);
    if (node) apply(out, node.mod, Math.min(Math.floor(Number(unlockedTalents[id]) || 0), node.limit));
  }
  const relic = relicByName(relicName);
  if (relic) apply(out, relic.mod, Math.min(RELIC_MAX_TIER, Math.max(1, Math.floor(Number(relicTier)) || 1)));
  return out;
}
