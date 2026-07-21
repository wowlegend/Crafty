// questClaim.js — the PURE quest-claim reduction (R1).
//
// WHY THIS MODULE EXISTS (the bug it kills):
// `QuestSystem.claimQuest` used to do two things that are unsafe under React batching:
//   1. it mutated a closure variable (`claimedQuest`) from INSIDE a `setQuests(prev => ...)` updater and
//      then read it AFTER the call, to decide whether to grant the reward. React only evaluates that
//      updater eagerly when the fiber has no pending lanes — so on a SECOND claim in the same tick the
//      updater was deferred, the closure var stayed null, and THE REWARD WAS SILENTLY NEVER GRANTED;
//   2. it rebuilt `new Set([...completedQuestIds, questId])` from a STALE closure of `completedQuestIds`,
//      so claim #2 rebuilt the set from the pre-claim-#1 value and ERASED quest #1 from the save.
//
// That is reachable in ordinary play: the `Q` key claims EVERY completed quest in one synchronous forEach
// (InputManager.jsx), and quests routinely complete in pairs (one zombie kill finishes both `first_blood`
// and `zombie_slayer`). Result: the player lost a whole quest's XP + coins AND had to redo the quest.
//
// The fix is to make the claim a PURE state->state reduction. No React, no closures, no nested setState:
// given the current quest state, produce the next quest state plus the claimed quest (so the caller can pay
// the reward from a value it can actually trust). Locked by quest-multiclaim-gates.test.jsx (behavioral,
// RED against the old code) + questClaim.test.js (pure).

/** Max simultaneously-offered quests. Kept identical to the previous inline behavior (balance is Kevin's). */
export const MAX_ACTIVE_QUESTS = 3;

/**
 * Reduce one quest claim.
 *
 * Pure: no mutation of the inputs, no side effects, no reward granting (the caller pays out from `claimed`).
 * Idempotent for an unclaimable id: returns the SAME state object identities and `claimed: null`, so a
 * double-dispatch of the same id can never double-pay.
 *
 * @param {{quests: Array<object>, completedQuestIds: Set<string>|Iterable<string>}} state current state
 * @param {string} questId the quest being claimed
 * @param {(claimedIds: Set<string>, active: Array<object>) => (object|null)} [pickNext]
 *        supplies the replacement quest (the QUEST_LIST / bounty logic lives in the component, which owns
 *        the lore + theming); called only when there is room in the feed.
 * @returns {{quests: Array<object>, completedQuestIds: Set<string>, claimed: (object|null)}}
 */
export function reduceClaim(state, questId, pickNext) {
  const quests = Array.isArray(state?.quests) ? state.quests : [];
  const prevCompleted = state?.completedQuestIds instanceof Set
    ? state.completedQuestIds
    : new Set(state?.completedQuestIds || []);

  // Only a COMPLETED, UNCLAIMED quest can be claimed. Anything else is a no-op — and returning the input
  // identities matters: it makes a repeat-dispatch provably free of side effects.
  const claimed = quests.find((q) => q && q.id === questId && q.completed && !q.claimed) || null;
  if (!claimed) {
    return { quests, completedQuestIds: prevCompleted, claimed: null };
  }

  const completedQuestIds = new Set(prevCompleted);
  completedQuestIds.add(questId);

  // Drop the claimed quest (and any previously-claimed stragglers) from the active feed. The `q &&`
  // guard mirrors the find() above — a null/undefined entry must not crash the claim.
  const active = quests.filter((q) => q && q.id !== questId && !q.claimed);

  if (active.length < MAX_ACTIVE_QUESTS && typeof pickNext === 'function') {
    const next = pickNext(completedQuestIds, active);
    if (next) active.push(next);
  }

  return { quests: active, completedQuestIds, claimed };
}
