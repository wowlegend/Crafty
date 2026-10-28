/**
 * saveSchema.js — the ONE save-payload serializer (schema source of truth) + a
 * version-gated migration seam. Local-first. Replaces the 4 duplicated inline payload
 * literals (store.saveGame + WorldManager x3). Pure: takes a state snapshot, returns a
 * JSON-safe object (Maps -> entry arrays). No store/React/axios imports.
 */
import { normalizeInventoryKeys } from './invNormalize.js';
import { serializeBossState } from './bossPersistence.js';

export const SAVE_VERSION = 2; // 1 = pre-A3 (no progression); 2 = A3 progression slice

const mapEntries = (m) => (m instanceof Map ? Array.from(m.entries()) : Array.isArray(m) ? m : []);

// THE TOMBSTONE PASS-THROUGH (plan row 20; DECISIONS 2026-10-28 W1-H items 4 and 10). A key under `progression` or
// `game_state` that this build does not write is kept as loaded (the store's `_tombstone`) and written back on every
// save, so a build that stops writing a field, or one rolled back behind a build that added one, loses nothing. It
// holds for one SAVE_VERSION: a save stamped older than this build carries nothing forward, so bumping SAVE_VERSION is
// the act that closes these doors. Live keys are spread after the bag, so a tombstoned value never shadows one.
const TOMBSTONE_SLICES = ['progression', 'game_state'];

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** The keys of `saveData`'s slices this build does not write, as `{ progression?, game_state? }`. Pure. */
export function splitTombstone(saveData) {
  const bag = {};
  if (!isPlainObject(saveData) || !(Number(saveData.version) >= SAVE_VERSION)) return bag;
  const written = buildSaveData({});
  for (const slice of TOMBSTONE_SLICES) {
    if (!isPlainObject(saveData[slice])) continue;
    const unknown = Object.entries(saveData[slice]).filter(([key]) => !Object.prototype.hasOwnProperty.call(written[slice], key));
    if (unknown.length) bag[slice] = Object.fromEntries(unknown);
  }
  return bag;
}

export function buildSaveData(state, { position } = {}) {
  const tomb = isPlainObject(state._tombstone) ? state._tombstone : {};
  return {
    version: SAVE_VERSION,
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
    questState: state.questState || null,
    progression: {
      ...tomb.progression,
      level: state.level,
      currentXP: state.currentXP,
      totalXP: state.totalXP,
      attributes: state.attributes,
      equipment: state.equipment,
      talentPoints: state.talentPoints,
      unlockedTalents: state.unlockedTalents,
      spellLevels: state.spellLevels,
      coins: state.coins,
      // Siege progression: nightCount drives siege intensity AND dawn-reward scaling;
      // lastRewardedNight is the once-per-night reward guard. Both must persist so the
      // "harder every night" loop + its reward guard survive a reload (the coins it
      // grants already persist above — these keep the producer durable too).
      nightCount: state.nightCount,
      lastRewardedNight: state.lastRewardedNight,
      ferocityBanked: state.ferocityBanked, // S2-B1-M4 (clamped+rounded on load)
      kineticBanked: state.kineticBanked, // S2-B2-M4 (twin; clamped+rounded on load)
      soulBanked: state.soulBanked, // S2-B3-M2 (twin)
      resonanceBanked: state.resonanceBanked, // S2-B4-M2 (twin)
    },
    game_state: {
      ...tomb.game_state,
      gameMode: state.gameMode,
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
