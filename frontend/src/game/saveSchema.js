/**
 * saveSchema.js — the ONE save-payload serializer (schema source of truth) + a
 * version-gated migration seam. Local-first. Replaces the 4 duplicated inline payload
 * literals (store.saveGame + WorldManager x3). Pure: takes a state snapshot, returns a
 * JSON-safe object (Maps -> entry arrays). No store/React/axios imports.
 */
import { normalizeInventoryKeys } from './invNormalize.js';

export const SAVE_VERSION = 2; // 1 = pre-A3 (no progression); 2 = A3 progression slice

const mapEntries = (m) => (m instanceof Map ? Array.from(m.entries()) : Array.isArray(m) ? m : []);

export function buildSaveData(state, { position } = {}) {
  return {
    version: SAVE_VERSION,
    save_name: `Save_${new Date().toLocaleString()}`,
    world_data: { blocks: mapEntries(state.worldBlocks) },
    chests: mapEntries(state.chests),
    player_data: {
      position: position || { x: 0, y: 18, z: 0 },
      inventory: state.inventory,
      stats: state.playerStats,
    },
    // S2a: quest progress + achievements mirror (the gameplay hook keeps Sets in
    // working state and mirrors them to arrays here, so this is already JSON-safe).
    questState: state.questState || null,
    progression: {
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
    },
    game_state: {
      gameMode: state.gameMode,
      selectedBlock: state.selectedBlock,
      activeSpell: state.activeSpell,
      isDay: state.isDay,
      gameTime: state.gameTime,
      achievements: state.achievements,
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
