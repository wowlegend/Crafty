// questRewards.js — B4 quest rewards (pure math, node-testable).
//
// Quests used to grant XP ONLY. Now each quest also pays COINS and may grant an ITEM, so completing
// a quest has a real payoff (gear / mats / recipe) — the way you earn back the gear B6 stripped from
// the starter kit. Data-driven: a quest carries `xpReward` (existing) + optional `coinReward` and
// `itemReward: {item, count}`; coins default to a conservative fraction of xp when not specified.
// Clamped + NaN-safe so a malformed quest entry can never grant a negative/NaN reward. Consumed by
// QuestSystem.claimQuest. Locked by questRewards.test.js + quest-rewards-gates.

/** Default coin payout as a fraction of a quest's xp reward (when no explicit coinReward). */
export const QUEST_COIN_RATE = 0.4;

/**
 * Normalize a quest's full reward bundle.
 * @param {{ xpReward?: number, coinReward?: number, itemReward?: {item: string, count?: number} }} quest
 * @returns {{ xp: number, coins: number, item: ({item: string, count: number}|null) }}
 */
export function questRewards(quest) {
  const q = quest || {};
  const xp = Math.max(0, Math.round(Number(q.xpReward) || 0));
  const coins = q.coinReward != null
    ? Math.max(0, Math.round(Number(q.coinReward) || 0))
    : Math.round(xp * QUEST_COIN_RATE);
  const ir = q.itemReward;
  const item = ir && ir.item
    ? { item: ir.item, count: Math.max(1, Math.round(Number(ir.count) || 1)) }
    : null;
  return { xp, coins, item };
}
