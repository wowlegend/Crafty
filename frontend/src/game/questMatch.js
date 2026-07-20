/**
 * questMatch.js — the pure "does this kill/action advance this quest?" predicate.
 *
 * Extracted from QuestSystem.updateQuestProgress, which had two bugs in one 5-line matcher:
 *
 * B6a — DOUBLE COUNT (every "Defeat N mobs" quest completed at HALF cost). onMobKill fires BOTH
 *   updateQuestProgress('kill') AND updateQuestProgress('kill_type', {mobType}) for the same kill, and the
 *   old matcher advanced a generic 'kill' quest on BOTH dispatches — so one kill counted twice.
 *
 * B6b — DEAD mobType FILTER (killing any mob advanced every targeted-hunt quest). The old matcher set
 *   matches=true for a kill_type quest whenever `quest.type === type` (i.e. type==='kill_type'), WITHOUT
 *   comparing quest.mobType to the killed mob — so "Defeat 5 moss brutes" completed on 5 spider kills.
 *
 * The fix, stated once and purely:
 *   - a generic 'kill' quest advances ONLY on the 'kill' dispatch (never the kill_type echo) -> one per kill.
 *   - a 'kill_type' quest advances ONLY when the killed mob IS its target.
 *   - every other quest type advances on an exact dispatch-type match.
 */
export function questMatches(quest, type, extra = {}) {
  if (!quest) return false;
  if (quest.type === 'kill') return type === 'kill';
  if (quest.type === 'kill_type') return type === 'kill_type' && quest.mobType === extra.mobType;
  return quest.type === type;
}
