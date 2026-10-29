/**
 * saveSchema.js — the ONE save-payload serializer (schema source of truth) + a
 * version-gated migration seam. Local-first. Replaces the 4 duplicated inline payload
 * literals (store.saveGame + WorldManager x3). Pure: takes a state snapshot, returns a
 * JSON-safe object (Maps -> entry arrays). No store/React/axios imports.
 */
import { normalizeInventoryKeys } from './invNormalize.js';
import { serializeBossState } from './bossPersistence.js';
import { questRewards } from './questRewards.js';

export const SAVE_VERSION = 2; // 1 = pre-A3 (no progression); 2 = A3 progression slice

const mapEntries = (m) => (m instanceof Map ? Array.from(m.entries()) : Array.isArray(m) ? m : []);

// THE TOMBSTONE PASS-THROUGH (plan row 20; DECISIONS 2026-10-28 W1-H items 4 and 10). A key under `progression` or
// `game_state` that this build does not write is kept as loaded (the store's `_tombstone`) and written back on every
// save, so a build that stops writing a field, or one rolled back behind a build that added one, loses nothing. It
// holds for one SAVE_VERSION: a save stamped older than this build carries nothing forward, so bumping SAVE_VERSION is
// the act that closes these doors. Live keys are spread after the bag, so a tombstoned value never shadows one.
const TOMBSTONE_SLICES = ['progression', 'game_state'];

/** An object that is not an array or null: the shape of every save slice and record read here and in game/ember.js. */
export const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// The placement-count quests no longer offered (DECISIONS 2026-10-28 W1-H item 10), with the rewards their QUEST_LIST
// rows paid on a claim. A save's active entry for one is held in the tombstone like an unknown key, so a rollback finds
// its progress where it was. One the save holds completed and unclaimed is paid on load (`migrateRetired`) and becomes
// claimed, as the claim the player could no longer make would have left it.
export const RETIRED_QUESTS = Object.freeze({
  builder: Object.freeze({ id: 'builder', title: 'Builder', xpReward: 50, itemReward: Object.freeze({ item: 'wood', count: 24 }) }),
  architect: Object.freeze({ id: 'architect', title: 'Architect', xpReward: 150 }),
  world_builder: Object.freeze({ id: 'world_builder', title: 'World Builder', xpReward: 400 }),
});
export const RETIRED_QUEST_IDS = new Set(Object.keys(RETIRED_QUESTS));
const isRetiredQuest = (q) => isPlainObject(q) && RETIRED_QUEST_IDS.has(q.id);

/**
 * `questState` with the retired quests taken out of its active list, and the ids in `claimedIds` (paid on this load)
 * added to its claimed set: what the quest hook is seeded from. Pure.
 */
export function liveQuestState(questState, claimedIds = []) {
  if (!isPlainObject(questState)) return questState;
  const retiredActive = Array.isArray(questState.quests) && questState.quests.some(isRetiredQuest);
  if (!retiredActive && !claimedIds.length) return questState;
  const out = { ...questState };
  if (retiredActive) out.quests = questState.quests.filter((q) => !isRetiredQuest(q));
  if (claimedIds.length) {
    const prior = Array.isArray(questState.completedQuestIds) ? questState.completedQuestIds : [];
    out.completedQuestIds = [...new Set([...prior, ...claimedIds])];
  }
  return out;
}

// THE MIGRATION RECORD. The tombstone writes a retired key back on every save, so a migration that reads one would run
// again on every load. Each migration has a name, and a save lists the names it has run (top-level `migrated`). The list
// is read whatever the save's version, and every migration reads the save itself rather than the tombstone: bumping
// SAVE_VERSION stops carrying held keys, but must neither re-run a migration nor skip one that a pre-bump save is owed.
const questMigration = (def) => ({
  name: `quests.${def.id}`,
  run(saveData) {
    const quests = Array.isArray(saveData?.questState?.quests) ? saveData.questState.quests : [];
    const q = quests.find((e) => isPlainObject(e) && e.id === def.id);
    if (!q || !q.completed || q.claimed) return null;
    return { reward: questRewards(def), claimQuestId: def.id, title: def.title };
  },
});
export const RETIRED_MIGRATIONS = Object.freeze(Object.values(RETIRED_QUESTS).map(questMigration));

const readMigrated = (saveData) => (isPlainObject(saveData) && Array.isArray(saveData.migrated)
  ? saveData.migrated.filter((name) => typeof name === 'string')
  : []);

/**
 * What loading `saveData` owes for retired keys whose migration it has not run, and the record once paid. Pure.
 * @returns {{xp: number, coins: number, items: Array<{item: string, count: number}>, claimedQuestIds: string[],
 *   paidTitles: string[], migrated: string[]}}
 */
export function migrateRetired(saveData, migrations = RETIRED_MIGRATIONS) {
  const migrated = [...new Set(readMigrated(saveData))];
  const owed = { xp: 0, coins: 0, items: [], claimedQuestIds: [], paidTitles: [], migrated };
  for (const m of migrations) {
    if (migrated.includes(m.name)) continue;
    const r = m.run(saveData);
    if (!r) continue;
    if (r.reward) {
      owed.xp += r.reward.xp;
      owed.coins += r.reward.coins;
      if (r.reward.item) owed.items.push(r.reward.item);
    }
    if (r.claimQuestId) owed.claimedQuestIds.push(r.claimQuestId);
    if (r.title) owed.paidTitles.push(r.title);
    migrated.push(m.name);
  }
  return owed;
}

const withHeldQuests = (questState, held) => {
  if (!Array.isArray(held) || !held.length) return questState;
  const base = isPlainObject(questState) ? questState : {};
  return { ...base, quests: [...(Array.isArray(base.quests) ? base.quests : []), ...held] };
};

/**
 * What `saveData` holds that this build does not write, as `{ progression?, game_state?, quests? }`; a retired quest
 * in `paidQuestIds` is not held, since this load has claimed it. Pure.
 */
export function splitTombstone(saveData, paidQuestIds = []) {
  const bag = {};
  if (!isPlainObject(saveData) || !(Number(saveData.version) >= SAVE_VERSION)) return bag;
  const written = buildSaveData({});
  for (const slice of TOMBSTONE_SLICES) {
    if (!isPlainObject(saveData[slice])) continue;
    const unknown = Object.entries(saveData[slice]).filter(([key]) => !Object.prototype.hasOwnProperty.call(written[slice], key));
    if (unknown.length) bag[slice] = Object.fromEntries(unknown);
  }
  const held = Array.isArray(saveData.questState?.quests)
    ? saveData.questState.quests.filter((q) => isRetiredQuest(q) && !paidQuestIds.includes(q.id))
    : [];
  if (held.length) bag.quests = held;
  return bag;
}

export function buildSaveData(state, { position } = {}) {
  const tomb = isPlainObject(state._tombstone) ? state._tombstone : {};
  return {
    version: SAVE_VERSION,
    migrated: Array.isArray(tomb.migrated) ? [...tomb.migrated] : [],
    save_name: `Save_${new Date().toLocaleString()}`,
    world_data: { blocks: mapEntries(state.worldBlocks) },
    chests: mapEntries(state.chests),
    player_data: {
      position: position || { x: 0, y: 18, z: 0 },
      inventory: state.inventory,
      // `stats` DELETED 2026-08-11: setPlayerStats had zero callers, so this wrote four zeros into every
      // save. The real counters ride in questState. Old saves keep the key; nothing reads it, and
      // migrateSaveData does not need to strip it -- an ignored extra key costs nothing.
    },
    // S2a: quest progress + achievements mirror (the gameplay hook keeps Sets in
    // working state and mirrors them to arrays here, so this is already JSON-safe).
    questState: withHeldQuests(state.questState || null, tomb.quests),
    progression: {
      ...tomb.progression,
      level: state.level,
      currentXP: state.currentXP,
      totalXP: state.totalXP,
      // `attributes` and `spellLevels` are not written: stats and spell tiers derive from the level (DECISIONS
      // 2026-10-28 W1-H item 6). A save that holds them keeps them in the tombstone for one SAVE_VERSION.
      equipment: state.equipment,
      talentPoints: state.talentPoints,
      unlockedTalents: state.unlockedTalents,
      coins: state.coins,
      // Siege progression: nightCount drives siege intensity AND dawn-reward scaling;
      // lastRewardedNight is the once-per-night reward guard. Both must persist so the
      // "harder every night" loop + its reward guard survive a reload (the coins it
      // grants already persist above — these keep the producer durable too).
      nightCount: state.nightCount,
      lastRewardedNight: state.lastRewardedNight,
      // The one Aspect meter and the day's building allowance it has used (game/ember.js). The four banks it replaced
      // are not written: a save that holds them keeps them in the tombstone, and loading it sums them into `ember`.
      ember: state.ember,
      emberBuildDay: state.emberBuildDay,
    },
    game_state: {
      ...tomb.game_state,
      selectedBlock: state.selectedBlock,
      activeSpell: state.activeSpell,
      isDay: state.isDay,
      gameTime: state.gameTime,
      // `achievements` DELETED 2026-08-11: setAchievements had zero callers and the array zero readers,
      // so this wrote an empty list into every save. QuestSystem's achievements ride in questState.
      gameWon: state.gameWon, // S9c: the win-state survives a reload
      // A-bis B2g: the boss FIGHT survives a reload too, not just the win. gameWon alone only stopped a
      // slain dragon respawning; a fight in progress was hook-local React state, so a refresh at 5% HP
      // restored the dragon to all 700. Phase is not stored — it re-derives from health on load.
      bossState: serializeBossState(state),
    },
  };
}

/** Forward-compat: normalize legacy inventory keys; tolerate versionless/progression-less saves. */
export function migrateSaveData(saveData) {
  if (!saveData || typeof saveData !== 'object') return saveData;
  const out = { ...saveData };
  if (out.player_data?.inventory) {
    out.player_data = { ...out.player_data, inventory: normalizeInventoryKeys(out.player_data.inventory) };
  }
  return out;
}
