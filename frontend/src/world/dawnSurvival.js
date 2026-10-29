// dawnSurvival.js — the pure dawn-transition decision: does this dawn credit a survived night, and what
// HUD message does it show? Extracted from survivalSystem.js's isDay-edge effect. The load-bearing
// invariant: the survive_nights quest is credited EXACTLY ONCE per genuinely-survived night. nightCount is
// bumped at nightfall, so it equals the night just survived; grantDawnReward guards once-per-night
// INTERNALLY (persisted lastRewardedNight) and returns its descriptor ONLY when it actually granted (null
// on a re-fired transition / hook remount / mid-run reload). Crediting the quest is therefore gated on that
// descriptor, NOT on nightCount>0 — otherwise a duplicate dawn double-counts the quest. grantDawnReward is
// injected (it has the grant side effect); this module owns only the DECISION + notice.
// The dawn loot's name by its rarity (game/dayNight.js DAWN_LOOT_BY_RARITY), as a dictionary key.
const DAWN_LOOT_KEYS = Object.freeze({ rare: 'loot.dawn.rare', epic: 'loot.dawn.epic', legendary: 'loot.dawn.legendary' });

export function resolveDawn(nightCount, grantDawnReward) {
  const survived = nightCount;
  const reward = survived > 0 ? grantDawnReward(survived) : null;
  return {
    reward,
    creditSurvivedNight: !!reward, // fire onNightSurvived IFF the reward actually granted (once-per-night)
    notice: reward
      ? { key: 'notice.dawnReward', vars: { xp: reward.xp, coins: reward.coins, item: { key: DAWN_LOOT_KEYS[reward.lootRarity] } } }
      : { key: 'notice.dawn' },
  };
}
