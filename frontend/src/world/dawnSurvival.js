// dawnSurvival.js — the pure dawn-transition decision: does this dawn credit a survived night, and what
// HUD message does it show? Extracted from survivalSystem.js's isDay-edge effect. The load-bearing
// invariant: the survive_nights quest is credited EXACTLY ONCE per genuinely-survived night. nightCount is
// bumped at nightfall, so it equals the night just survived; grantDawnReward guards once-per-night
// INTERNALLY (persisted lastRewardedNight) and returns its descriptor ONLY when it actually granted (null
// on a re-fired transition / hook remount / mid-run reload). Crediting the quest is therefore gated on that
// descriptor, NOT on nightCount>0 — otherwise a duplicate dawn double-counts the quest. grantDawnReward is
// injected (it has the grant side effect); this module owns only the DECISION + message.
export function resolveDawn(nightCount, grantDawnReward) {
  const survived = nightCount;
  const reward = survived > 0 ? grantDawnReward(survived) : null;
  return {
    reward,
    creditSurvivedNight: !!reward, // fire onNightSurvived IFF the reward actually granted (once-per-night)
    message: reward
      ? `Dawn! +${reward.xp} XP, +${reward.coins} coins, ${reward.lootItem}!`
      : 'Dawn breaks! You survived the night!',
  };
}
