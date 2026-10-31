/**
 * saveSchema.js — the ONE save-payload serializer (schema source of truth) + a
 * version-gated migration seam. Local-first. Replaces the 4 duplicated inline payload
 * literals (store.saveGame + WorldManager x3). Pure: takes a state snapshot, returns a
 * JSON-safe object (Maps -> entry arrays). No store/React/axios imports.
 */
import { normalizeInventoryKeys } from './invNormalize.js';
import { serializeBossState } from './bossPersistence.js';
import { questRewards } from './questRewards.js';
import { resolveWorldSeed } from '../world/worldSeed.js';
import { BASE_CAPSULE } from './beasts.js';

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
// THE CUT'S TALENT REFUND (DECISIONS 2026-10-28 W1-H item 6). A level paid five attribute points and one talent point;
// now it pays the talent point alone and the level supplies the stats. A save whose progression holds `attributes` was
// written before the Cut (no later build writes the key; the tombstone only carries it back), so it is owed:
//   - floor(P / ATTRIBUTE_POINTS_PER_TALENT) talent points, P being its unspent attribute points plus every point it
//     allocated (strength, agility and intellect above their base, armour above 0), and
//   - every talent rank it holds back as a point, because each tree's nodes changed meaning (a free respec).
export const ATTRIBUTE_POINTS_PER_TALENT = 5;
const PRE_CUT_ATTRIBUTE_BASE = Object.freeze({ strength: 10, agility: 10, intellect: 10, armor: 0 });

/** The attribute points a pre-Cut `attributes` record holds, spent and unspent; a non-finite or negative field adds 0. */
export function attributePointsHeld(attributes) {
  if (!isPlainObject(attributes)) return 0;
  const pos = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  let points = pos(attributes.attributePoints);
  for (const [stat, base] of Object.entries(PRE_CUT_ATTRIBUTE_BASE)) {
    if (typeof attributes[stat] === 'number') points += pos(attributes[stat] - base);
  }
  return Math.floor(points);
}

/** The name the Cut's talent refund is recorded under. A store that has loaded nothing starts with it recorded too. */
export const TALENT_CUT = 'talents.cut';

const talentCutMigration = Object.freeze({
  name: TALENT_CUT,
  run(saveData) {
    const prog = saveData?.progression;
    // A save with no `attributes` holds a post-Cut build and is owed nothing, and is recorded all the same: a build from
    // before the Cut writes `attributes` into every save it touches, so after a rollback the record is the only thing
    // that keeps the next load here from respeccing the player's post-Cut choices.
    if (!isPlainObject(prog) || !isPlainObject(prog.attributes)) return {};
    return { talentPoints: Math.floor(attributePointsHeld(prog.attributes) / ATTRIBUTE_POINTS_PER_TALENT), respec: true };
  },
});

export const RETIRED_MIGRATIONS = Object.freeze([...Object.values(RETIRED_QUESTS).map(questMigration), talentCutMigration]);

const readMigrated = (saveData) => (isPlainObject(saveData) && Array.isArray(saveData.migrated)
  ? saveData.migrated.filter((name) => typeof name === 'string')
  : []);

/**
 * What loading `saveData` owes for retired keys whose migration it has not run, and the record once paid. Pure.
 * `talentPoints` and `respec` are the Cut's talent refund (above): points to add, and whether every held rank comes back.
 * @returns {{xp: number, coins: number, items: Array<{item: string, count: number}>, claimedQuestIds: string[],
 *   paidTitles: string[], talentPoints: number, respec: boolean, migrated: string[]}}
 */
export function migrateRetired(saveData, migrations = RETIRED_MIGRATIONS) {
  const migrated = [...new Set(readMigrated(saveData))];
  const owed = { xp: 0, coins: 0, items: [], claimedQuestIds: [], paidTitles: [], talentPoints: 0, respec: false, migrated };
  for (const m of migrations) {
    if (migrated.includes(m.name)) continue;
    const r = m.run(saveData);
    if (!r) continue;
    if (r.reward) {
      owed.xp += r.reward.xp;
      owed.coins += r.reward.coins;
      if (r.reward.item) owed.items.push(r.reward.item);
    }
    if (r.talentPoints) owed.talentPoints += r.talentPoints;
    if (r.respec) owed.respec = true;
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

// Inventory keys no build spends any more: the crystal currency and the wand it bought (DECISIONS 2026-10-28 W1-H item
// 6), the pickaxe, a weapon below the sword every profile holds, whose line the Forge's blades replace (2026-10-29
// item 66), and the five foods, whose use was to fill the hunger meter that left the game (2026-10-29 item 72). They
// leave every live container on load, each bag of the inventory and each chest, so nothing shows a dead item and no
// chest can hand one back to the bag, and ride the tombstone back into the same container in the save, for one
// SAVE_VERSION like the progression keys.
export const RETIRED_INVENTORY_KEYS = Object.freeze([
  'crystals', 'wand', 'pickaxe',
  'Raw Porkchop', 'Raw Beef', 'Cooked Porkchop', 'Cooked Beef', 'Rotten Flesh',
]);

/**
 * `equipment` with a retired pickaxe in hand replaced by the sword, the first blade of the Forge's line (damage 8 to 10,
 * so no hand gets weaker); the same object when the hand holds anything else. Pure.
 */
export function liveEquipment(equipment) {
  return isPlainObject(equipment) && equipment.weapon === 'pickaxe' ? { ...equipment, weapon: 'sword' } : equipment;
}

const holdsRetired = (items) => isPlainObject(items) && RETIRED_INVENTORY_KEYS.some((k) => Object.prototype.hasOwnProperty.call(items, k));
const withoutRetired = (items) => Object.fromEntries(Object.entries(items).filter(([k]) => !RETIRED_INVENTORY_KEYS.includes(k)));
const onlyRetired = (items) => Object.fromEntries(Object.entries(items).filter(([k]) => RETIRED_INVENTORY_KEYS.includes(k)));
const chestEntries = (chests) => (Array.isArray(chests) ? chests.filter((e) => Array.isArray(e) && e.length === 2) : []);

/** `inventory` with the retired keys taken out of every bag (the same object when it holds none). Pure. */
export function liveInventory(inventory) {
  if (!isPlainObject(inventory) || !Object.values(inventory).some(holdsRetired)) return inventory;
  return Object.fromEntries(Object.entries(inventory).map(([bag, items]) => [bag, holdsRetired(items) ? withoutRetired(items) : items]));
}

// A block edit's key: the cell's integer x_y_z (the store's worldBlocks).
const CELL_KEY = /^-?\d+_-?\d+_-?\d+$/;

/**
 * The block edits of a save that name a cell: its [key, block] pairs whose key is `x_y_z`. A save comes from
 * localStorage and may hold anything, and a key the terrain worker's message cannot split (store
 * loadModificationsMessage) throws when Terrain mounts, outside the boot's guard, so every reload of the tab would boot
 * into the same throw.
 * @param {unknown} blocks a save's world_data.blocks
 * @returns {Array<[string, unknown]>}
 */
export function liveBlocks(blocks) {
  return Array.isArray(blocks) ? blocks.filter((e) => Array.isArray(e) && e.length === 2 && typeof e[0] === 'string' && CELL_KEY.test(e[0])) : [];
}

/** A save's chest entries ([coords, chest]) with the retired keys taken out of each chest's inventory. Pure. */
export function liveChests(chests) {
  if (!Array.isArray(chests)) return chests;
  return chests.map((e) => (Array.isArray(e) && isPlainObject(e[1]) && holdsRetired(e[1].inventory)
    ? [e[0], { ...e[1], inventory: withoutRetired(e[1].inventory) }]
    : e));
}

// The held keys go under the live ones of the same bag or chest, so a live key of the same name always wins.
const withHeldInventory = (inventory, held) => {
  if (!isPlainObject(held) || !isPlainObject(inventory)) return inventory;
  const out = { ...inventory };
  for (const [bag, items] of Object.entries(held)) out[bag] = { ...items, ...(isPlainObject(inventory[bag]) ? inventory[bag] : {}) };
  return out;
};
const withHeldChests = (entries, held) => {
  if (!isPlainObject(held)) return entries;
  return entries.map(([coords, chest]) => (Object.prototype.hasOwnProperty.call(held, coords) && isPlainObject(chest)
    ? [coords, { ...chest, inventory: { ...held[coords], ...(isPlainObject(chest.inventory) ? chest.inventory : {}) } }]
    : [coords, chest]));
};

/**
 * What `saveData` holds that this build does not write, as `{ progression?, game_state?, quests?, inventory?, chests? }`:
 * `inventory` maps a bag to its retired keys and `chests` maps a chest's coords to its own. A retired quest in
 * `paidQuestIds` is not held, since this load has claimed it. Pure.
 */
export function splitTombstone(saveData, paidQuestIds = []) {
  const bag = {};
  if (!isPlainObject(saveData) || !(Number(saveData.version) >= SAVE_VERSION)) return bag;
  const inventory = saveData.player_data?.inventory;
  if (isPlainObject(inventory)) {
    const held = Object.entries(inventory).filter(([, items]) => holdsRetired(items));
    if (held.length) bag.inventory = Object.fromEntries(held.map(([b, items]) => [b, onlyRetired(items)]));
  }
  const chests = chestEntries(saveData.chests).filter(([, chest]) => isPlainObject(chest) && holdsRetired(chest.inventory));
  if (chests.length) bag.chests = Object.fromEntries(chests.map(([coords, chest]) => [coords, onlyRetired(chest.inventory)]));
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

/**
 * The store keys a save records: exactly the keys buildSaveData reads (tests/gates/autosave-trigger-gates traces them),
 * the boss fight's through serializeBossState and the loaded save's own carry, `_tombstone`, among them. A change to
 * any of them schedules an autosave (game/autosave.js).
 */
export const PERSISTED_KEYS = Object.freeze([
  '_tombstone', 'worldBlocks', 'chests', 'inventory', 'questState',
  'level', 'currentXP', 'totalXP', 'equipment', 'relicTiers', 'talentPoints', 'unlockedTalents', 'coins',
  'nightCount', 'lastRewardedNight', 'ember', 'emberBuildDay',
  'worldSeed', 'selectedBlock', 'activeSpell', 'isDay', 'gameTime', 'gameWon',
  'bossActive', 'bossHealth', 'bossDefeated', 'bossTier', 'bossKillNight',
]);

/**
 * Where a save stands the player when it is loaded: the centre of the BASE capsule over the body's lower end (a load
 * restores the base shape, and a form's capsule is centred lower or higher: the comet's 0.18 m under the base's stood the
 * loaded capsule 0.13 m into the floor). Never the store's playerPosition, which is the camera (0.67 m up at the eye)
 * rounded to whole metres (systems/PositionTracker.jsx): loaded as the body's centre, it stood the player up to half a
 * metre into a wall they had stood beside, or with the head in the ceiling of a two-high tunnel
 * (tests/integration/chaos-play-loads.test.jsx). That is the fallback only with no body.
 * While a load's spot is pending (`resumeSpawn`, until the Player places the body there), the save keeps that spot: the
 * body is in the sky freeze over the origin until the world is built, then held, and a save then wrote the freeze over
 * the place the world was saved at.
 * @param {{playerRigidBodyRef?: {current: ?{translation: () => {x: number, y: number, z: number}, collider?: (i: number) => ?{halfHeight: () => number, radius: () => number}}}, playerPosition?: object, resumeSpawn?: ?{x: number, y: number, z: number}}} state
 */
export function savePosition(state) {
  const r = state.resumeSpawn;
  if (r && [r.x, r.y, r.z].every(Number.isFinite)) return { x: r.x, y: r.y, z: r.z };
  const rb = state.playerRigidBodyRef && state.playerRigidBodyRef.current;
  const t = rb && rb.translation ? rb.translation() : null;
  if (!t) return state.playerPosition;
  const c = typeof rb.collider === 'function' ? rb.collider(0) : null;
  const lift = c ? BASE_CAPSULE.halfHeight + BASE_CAPSULE.radius - c.halfHeight() - c.radius() : 0;
  return { x: t.x, y: t.y + lift, z: t.z };
}

export function buildSaveData(state, { position } = {}) {
  const tomb = isPlainObject(state._tombstone) ? state._tombstone : {};
  return {
    version: SAVE_VERSION,
    migrated: Array.isArray(tomb.migrated) ? [...tomb.migrated] : [],
    save_name: `Save_${new Date().toLocaleString()}`,
    world_data: { blocks: mapEntries(state.worldBlocks) },
    chests: withHeldChests(mapEntries(state.chests), tomb.chests),
    player_data: {
      position: position || { x: 0, y: 18, z: 0 },
      inventory: withHeldInventory(state.inventory, tomb.inventory),
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
      // The tier Mara's Forge tempered each relic to (game/relics.js).
      relicTiers: state.relicTiers,
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
      // The world's terrain seed. In game_state so a build that does not know the field carries it back (the tombstone).
      worldSeed: resolveWorldSeed(state.worldSeed),
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

/**
 * The save of a player who is dead: the world as Respawn leaves it (HUD.jsx: respawn, then the quest system's
 * onPlayerDeath). No position, so the load stands the player at the origin spawn, as Respawn does (store loadWorldData:
 * a save with no position sets no resumeSpawn), and the death counted in the quest stats. Every load arrives at full
 * health, as a respawn does. Without it a refresh on the death screen resumes the player alive where they fell.
 * @param {object} saveData a buildSaveData result
 */
export function asRespawned(saveData) {
  const { position: _fell, ...player } = saveData.player_data || {};
  const qs = saveData.questState;
  const stats = isPlainObject(qs) && isPlainObject(qs.stats) ? qs.stats : null;
  return {
    ...saveData,
    player_data: player,
    questState: stats ? { ...qs, stats: { ...stats, deaths: (Number(stats.deaths) || 0) + 1 } } : qs,
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
