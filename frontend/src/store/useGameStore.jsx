import { create } from 'zustand';
import { readControlsSeen, writeControlsSeen, readControlsCardDone, writeControlsCardDone } from '../ui/controlsSeen.js';
import { mitigateDamage } from '../utils/combat';
import { computeEffective, deriveMaxStats, xpForLevel, levelAttributes } from '../game/progression.js';
import { refundUnknownTalents, canUnlockTalent, respecTalents } from '../game/talentTree.js';
import { spellStatsAt } from '../game/spellTiers.js';
import { foldVerbMods } from '../game/verbMods.js';
import { relicTier, normalizeRelicTiers } from '../game/relics.js';
import { buy as forgeBuy } from '../game/forge.js';
import { aspectUnlockHint } from '../game/aspectHints.js';
import { buildSaveData, asRespawned, migrateSaveData, splitTombstone, liveQuestState, migrateRetired, liveInventory, liveChests, liveBlocks, liveEquipment, TALENT_CUT, BOSS_WIPE_REPAIR } from '../game/saveSchema.js';
import { resolvePlacement } from '../world/placementEconomy.js';
import { motionIntensity } from '../game/a11y.js';
import { teleportPlayer } from '../game/stanceState.js';
import { addShake, decayShake } from '../game/cameraShakeChannel.js';
import { writeWorld, listWorlds, mintWorldId, setActiveWorldId } from '../game/worldSaves.js';
import { crossedHalfCycle, crossedIntoNight, isDayAtUnit, dawnReward, gameTimeForTimeOfDay } from '../game/dayNight.js';
import { getBeastForm } from '../game/beasts.js';
import { BOSS_CONFIG } from '../game/bossConfig.js';
import { hydrateBossState } from '../game/bossPersistence.js';
import { clampEmber, canAfford, accrueBuild, readBuildDay, emberFromSave } from '../game/ember.js';
import { hitDirection } from '../game/damageDirection.js';
import { hurtStopMs } from '../game/hurtFeel.js';
import { stackHitstop } from '../game/hitstop.js';
import { chunkOf, CHUNK_SIZE } from '../world/loadedChunks.js';
import { voxelIndex } from '../world/chunkLayout.js';
import { DEFAULT_WORLD_SEED, resolveWorldSeed } from '../world/worldSeed.js';
import { seedClimate } from '../world/climate.js';

// How long ONE attacker must wait before it can damage the player again. This was an inline 500 applied
// to a single global timestamp, which made it a world-wide budget rather than a per-attacker cooldown —
// see the comment in damagePlayer. The duration is unchanged; only what it is keyed on moved.
const DAMAGE_LOCKOUT_MS = 500;

export const EQUIPMENT_STATS = {
    // Weapons
    'sword': { strength: 2, agility: 1 },
    'Stone Sword': { strength: 4, agility: 2 },
    'Iron Sword': { strength: 8, agility: 4 },
    'Diamond Sword': { strength: 15, agility: 8 },
    // Shields / Off-hands
    'Wooden Shield': { armor: 5, strength: 1 },
    'Iron Shield': { armor: 15, strength: 3 },
    'Diamond Shield': { armor: 30, strength: 6 },
    // Helmets
    'Golden Crown': { intellect: 10, armor: 5 },
    'Leather Helmet': { armor: 2, agility: 2 },
    'Iron Helmet': { armor: 6, strength: 2 },
    'Diamond Helmet': { armor: 15, strength: 4, intellect: 2 },
    // Chests
    'Leather Chestplate': { armor: 5, agility: 4 },
    'Iron Chestplate': { armor: 15, strength: 5 },
    'Diamond Chestplate': { armor: 35, strength: 10, intellect: 5 },
    // Boots
    'Leather Boots': { armor: 2, agility: 5 },
    'Iron Boots': { armor: 5, agility: 2 },
    'Diamond Boots': { armor: 12, agility: 6, strength: 3 }
};

// The player's effective stats: the level's own (game/progression.js levelAttributes) plus the gear's. The single source
// for every damage solver and maxStats derivation; getEffectiveAttributes is the get()-based equivalent, and this one
// takes explicit pending args for the in-reducer recomputes where state is not committed yet.
const effectiveWith = (level, equipment) => computeEffective(levelAttributes(level), equipment, EQUIPMENT_STATS);

// getVerbMods is read every frame by the verb sites; the fold is redone only when the talent map or the relic tiers (each
// replaced on every change, never mutated) or the relic changes, so a frame allocates nothing. Frozen, since every
// caller shares it.
let _verbModsKey = { talents: undefined, relic: undefined, tiers: undefined, mods: null };
function verbModsFor(unlockedTalents, relic, relicTiers) {
  const k = _verbModsKey;
  if (!k.mods || k.talents !== unlockedTalents || k.relic !== relic || k.tiers !== relicTiers) {
    const mods = Object.freeze(foldVerbMods(unlockedTalents, relic, relicTier(relicTiers, relic)));
    _verbModsKey = { talents: unlockedTalents, relic, tiers: relicTiers, mods };
  }
  return _verbModsKey.mods;
}

// The terrain worker's `load_modifications` message for the store's block edits (`x_y_z` -> block id): one
// [cx, cz, voxelIndex, blockType] per edit, and the world's seed. The worker REPLACES its edit table with this, so an
// empty map clears it, and re-seeds its noise.
function loadModificationsMessage(worldBlocks, seed) {
  const modifications = [];
  for (const [key, blockType] of worldBlocks.entries()) {
    const [wxStr, wyStr, wzStr] = key.split('_');
    const wx = parseInt(wxStr);
    const wy = parseInt(wyStr);
    const wz = parseInt(wzStr);

    const cx = chunkOf(wx); // the ONE chunk index (world/loadedChunks.js, review #5 R6.7)
    const cz = chunkOf(wz);
    const lx = wx - cx * CHUNK_SIZE;
    const lz = wz - cz * CHUNK_SIZE;
    const index = voxelIndex(lx, wy, lz);

    modifications.push([cx, cz, index, blockType]);
  }
  return { type: 'load_modifications', payload: { modifications, seed } };
}

// The saved_at the save index holds for slot `id`, or null: a slot never saved in play, or a save from before the field.
const slotSavedAt = (id) => (listWorlds().find((w) => w.id === id) || {}).saved_at ?? null;
// Whether the index's `disk` saved_at is a later write than the `known` one (store saveActiveWorld): two ISO times, and
// a time beside none is later. A disk with none is a slot nobody has saved in play since the tab read it.
const writtenSince = (disk, known) => {
  const d = Date.parse(disk);
  if (!Number.isFinite(d)) return false;
  const k = Date.parse(known);
  return !Number.isFinite(k) || d > k;
};

// The notice a load's talent refund raises, by the plural form of the points it leaves to spend.
const RESPEC_NOTICE = Object.freeze({ one: 'notice.talentsRespec.one', other: 'notice.talentsRespec.other' });

export const useGameStore = create((set, get) => ({
    // Transient World State (No need to persist)
    isSpawnChunkLoaded: false,
    setIsSpawnChunkLoaded: (loaded) => set({ isSpawnChunkLoaded: loaded }),

    // Dev-only visual-regression capture mode. When true, the scene is driven into a
    // byte-stable state: physics paused, follow-cam pinned to a fixed pose, mob spawns
    // suppressed. Set ONLY by the `enterCapture` test-bridge hook on the dev server;
    // always false in production (the bridge is tree-shaken out of prod builds).
    isCaptureMode: false,
    setCaptureMode: (on) => set({ isCaptureMode: !!on }),

    // B2a: which world slot THIS SESSION owns. Set by loadWorldData (opened one) or by the first
    // autosave (minted one). Deliberately NOT persisted: it must die with the tab, or a fresh session
    // inherits a pointer to a save it never opened and the autosave writes a level-1 world over it.
    // NEVER serialize this into saveSchema.
    _sessionWorldId: null,
    // The saved_at of that slot as this tab last read it (the claim) or wrote it (saveActiveWorld), or null. Transient.
    _slotSavedAt: null,
    // Set when saveActiveWorld refused to write over a newer save of the slot from another tab: { id }, or null. Once set,
    // the tab saves nothing more and the conflict panel offers the reload (ui/SlotConflictPanel.jsx). Transient.
    slotConflict: null,
    // The world the boot loaded, for the title's Continue: { id, name, level, savedAt } or null (game/worldBoot.js
    // bootWorld). Transient: the page that loaded it is the only one it describes.
    continueWorld: null,
    // A world the boot did not open, for the title to say why: { id, name, reason } or null (game/worldBoot.js bootWorld).
    // Transient, as continueWorld is.
    bootHeld: null,
    // The world whose attempt the boot left in sessionStorage, for the world's first frame to take back (game/worldBoot.js
    // BOOT_ATTEMPT_KEY, systems/BootSettle.jsx), or null. Transient.
    _bootAttempt: null,
    // The notices the boot's load raised before the quest system published the notification channel; it replays them
    // when it does (QuestSystem.jsx). Each entry is addNotification's arguments.
    _bootNotices: [],

    // The save keys this build does not write, as loaded (game/saveSchema.js splitTombstone); buildSaveData writes them
    // back. Replaced wholesale by every load, so a new world never inherits the last one's. A session that has loaded
    // nothing plays a post-Cut build, so its saves record the Cut's refund as run (saveSchema.js TALENT_CUT), and it was
    // never under the resume wipe, so they record its repair as run too (BOSS_WIPE_REPAIR).
    _tombstone: { migrated: [TALENT_CUT, BOSS_WIPE_REPAIR] },

    // Capture-only: hide the gameplay HUD for clean character-studio shots
    // (e.g. the character-closeup visual fixture). Default false -> HUD always shows
    // in gameplay and in the other capture states.
    hudHidden: false,
    setHudHidden: (on) => set({ hudHidden: !!on }),

    // Capture-only: marks a SKY-STUDIO subject card (character/boss/spell-cast close-ups)
    // vs an in-world frame. The explore-scene atmosphere (<LightMotes>) is suppressed when
    // true so the warm mote cloud doesn't drift across the framed hero. Declarative identity
    // (the studio-card hook SETS this) — GameScene does NOT infer it from camera position,
    // and it is decoupled from `hudHidden` (HUD visibility != scene atmosphere). Default
    // false -> motes always render in gameplay and in the in-world capture frames.
    captureStudio: false,
    setCaptureStudio: (on) => set({ captureStudio: !!on }),

    // Device-gated render quality tier (spec §8). Default 'low' = conservative;
    // App.jsx selects up at startup via selectTier(readDeviceSignals()).
    qualityTier: 'low',
    setQualityTier: (tier) => set({ qualityTier: tier }),
    // The boot tier on a coarse pointer (phone, iPad), else null: a runtime tier step never moves the render distance
    // there (render/tierGovernor.js renderDistanceFor). Written once at boot by App.
    renderDistancePin: null,

    // Danger mood input (spec §4): 0 = explore, 1 = dusk, 2 = obsidian. Gameplay
    // triggers (night/combat/boss) wire this in S2; the test bridge drives it now.
    dangerLevel: 0,
    setDangerLevel: (n) => set({ dangerLevel: Number(n) || 0 }),

    // W4 storm sky-darken: the active storm's mood boost (0 clear, ~0.85 rain/snow), MAXed into moodTarget
    // by the Atmosphere driver so a daytime storm reads overcast/moody (not full night). Set by the
    // WeatherSystem on each weather transition; transient (not persisted).
    weatherMoodBoost: 0,
    setWeatherMoodBoost: (n) => set({ weatherMoodBoost: Number(n) || 0 }),

    // UI locale (S1-C): 'en' default + togglable 'zh-CN'. setLocale lazy-loads the
    // CJK fonts on the flip to zh-CN (see the dynamic import below).
    locale: 'en',
    setLocale: (loc) => {
      const next = loc === 'zh-CN' ? 'zh-CN' : 'en';
      set({ locale: next });
      // M6 #5: keep <html lang> in sync (was static 'en' -> wrong for screen readers/SEO under zh-CN).
      // The locale values are valid BCP-47 codes; harmless under capture (the attr is invisible).
      if (typeof document !== 'undefined') document.documentElement.lang = next;
      if (next === 'zh-CN') import('../i18n/cjkFonts.js').then((m) => m.loadCjkFonts());
    },

    // Dev-only: full-screen primitives showcase for the visual-regression gate.
    showcaseView: false,
    setShowcaseView: (on) => set({ showcaseView: !!on }),

    isWebGLContextLost: false,
    setIsWebGLContextLost: (lost) => set({ isWebGLContextLost: lost }),

    activeHostilesCount: 0,
    setActiveHostilesCount: (count) => set({ activeHostilesCount: count }),
    
    terrainWorker: null,
    // Published by world/Terrain.jsx when the world mounts (null when it unmounts). A world LOADED before that — the
    // context-loss resume runs at App mount, before the Canvas's children exist — had no worker to send its block edits
    // to: loadWorldData marks them pending and the publish delivers them, ahead of the streamer's first chunk request.
    setTerrainWorker: (worker) => {
        set({ terrainWorker: worker });
        if (worker && get()._worldEditsPending) {
            worker.postMessage(loadModificationsMessage(get().worldBlocks, get().worldSeed));
            set({ _worldEditsPending: false });
        }
    },
    // True while the store holds block edits the terrain worker has not been sent (see setTerrainWorker).
    _worldEditsPending: false,
    // Where a LOADED save puts the player (set by loadWorldData; the boot's load, game/worldBoot.js), or null: one-shot,
    // read and cleared by the Player's spawn (Components.jsx, game/spawnPlacement.js resolveResumeSpawn). Without it the
    // boot spawn always lands on the origin column, wherever the save was made.
    resumeSpawn: null,
    // True from a save's load until Terrain.jsx has committed the wipe of the old world's chunks: until then the ground
    // probe under the loaded position can still answer from the old world, so the Player's hold there does not ask it.
    worldReloading: false,
    
    getGeneratedChunks: null,
    setGetGeneratedChunks: (fn) => set({ getGeneratedChunks: fn }),
    
    getMobGroundLevel: null,
    setGetMobGroundLevel: (fn) => set({ getMobGroundLevel: fn }),
    // (x, z, feet) -> the floor a mob at those feet stands on (world/mobFloorProbe.js); the column TOP above is
    // a roof or a canopy wherever there is one (review #6, R7.1). Terrain.jsx registers both.
    getMobFloor: null,
    setGetMobFloor: (fn) => set({ getMobFloor: fn }),

    playerRigidBodyRef: null,
    beastGroupRef: null, // the RENDERED beast avatar group (transient ref; see BeastAvatar)
    playerVisualAnchorRef: null, // .parent === the player RigidBody's Object3D (the VISUAL side)
    setPlayerRigidBodyRef: (ref) => set({ playerRigidBodyRef: ref }),

    // Declared so no reader needs an allocating fallback. Terrain read it as
    // `state => state.treasureChestsList || []`; undeclared, that selector returned a BRAND NEW array on
    // every evaluation, which defeats zustand's reference equality and re-rendered the chest renderer on
    // every unrelated store change. Written by QuestSystem; rendered by Terrain.
    treasureChestsList: [],
    playerPosition: { x: 0, y: 0, z: 0 },
    setPlayerPosition: (pos) => set({ playerPosition: pos }),

    // RPG Stats & Equipment Systems (Decoupled & Optimized)
    level: 1, currentXP: 0, totalXP: 0,
    // M3b currency wallet (distinct from the `gold:8` block mining-XP value).
    // addCoins clamps at >= 0 so a reward never drives a negative balance and a
    // future spend can't underflow; a nullish/NaN amount is a safe no-op.
    coins: 0,
    addCoins: (n) => set((state) => ({ coins: Math.max(0, state.coins + (Number(n) || 0)) })),
    // Spend coins (the merchant coin sink): deduct iff affordable, return success. A negative/nullish/NaN
    // amount clamps to a 0-cost no-op (true, never ADDS coins). The ONLY consumer of the coin balance.
    spendCoins: (n) => {
        const amt = Math.max(0, Math.floor(Number(n) || 0));
        const have = get().coins;
        if (have < amt) return false;
        set({ coins: have - amt });
        return true;
    },
    equipment: {
        head: null,
        chest: null,
        boots: null,
        weapon: null,
        offhand: null,
        relic: null
    },
    // The tier Mara's Forge tempered each relic to (relic name -> 2 or 3; game/relics.js relicTier reads a missing one as I).
    relicTiers: {},
    // Buy a Forge offer (game/forge.js): the price listed for the offer's id is spent, or nothing changes and the
    // refusal says what is short. A new blade in hand moves the derived caps as equipItem does. Returns buy's result.
    buyForgeOffer: (offer) => {
        const state = get();
        const r = forgeBuy({ inventory: state.inventory, coins: state.coins, equipment: state.equipment, relicTiers: state.relicTiers }, offer);
        if (!r.ok) return r;
        const { inventory, coins, equipment, relicTiers } = r.state;
        const patch = { inventory, coins, equipment, relicTiers };
        if (equipment !== state.equipment) {
            const { maxHealth, maxMana } = deriveMaxStats(state.level, effectiveWith(state.level, equipment));
            Object.assign(patch, { maxHealth, maxMana, playerHealth: Math.min(state.playerHealth, maxHealth), mana: Math.min(state.mana, maxMana) });
        }
        set(patch);
        return r;
    },
    isPlayerInvincible: () => false,

    getEffectiveAttributes: () => {
        const state = get();
        return effectiveWith(state.level, state.equipment);
    },

    equipItem: (slot, itemName) => set((state) => {
        const currentEquipped = state.equipment[slot];
        const newEquipment = { ...state.equipment, [slot]: itemName };
        
        const updatedBlocks = { ...state.inventory.blocks };
        const updatedTools = { ...state.inventory.tools };
        const updatedMagic = { ...state.inventory.magic };
        
        let found = false;
        if (updatedBlocks[itemName] > 0) {
            updatedBlocks[itemName]--;
            found = true;
        } else if (updatedTools[itemName] > 0) {
            updatedTools[itemName]--;
            found = true;
        } else if (updatedMagic[itemName] > 0) {
            updatedMagic[itemName]--;
            found = true;
        }
        
        if (!found) return {};

        if (currentEquipped) {
            if (currentEquipped in updatedBlocks) {
                updatedBlocks[currentEquipped]++;
            } else if (currentEquipped in updatedTools) {
                updatedTools[currentEquipped]++;
            } else if (currentEquipped in updatedMagic) {
                updatedMagic[currentEquipped]++;
            } else {
                updatedBlocks[currentEquipped] = (updatedBlocks[currentEquipped] || 0) + 1;
            }
        }

        const effective = effectiveWith(state.level, newEquipment);
        const level = state.level;
        const { maxHealth: newMaxHealth, maxMana: newMaxMana } = deriveMaxStats(level, effective);

        return {
            equipment: newEquipment,
            inventory: {
                ...state.inventory,
                blocks: updatedBlocks,
                tools: updatedTools,
                magic: updatedMagic
            },
            maxHealth: newMaxHealth,
            maxMana: newMaxMana,
            playerHealth: Math.min(state.playerHealth, newMaxHealth),
            mana: Math.min(state.mana, newMaxMana)
        };
    }),

    unequipItem: (slot) => set((state) => {
        const currentEquipped = state.equipment[slot];
        if (!currentEquipped) return {};
        
        const newEquipment = { ...state.equipment, [slot]: null };
        const updatedBlocks = { ...state.inventory.blocks };
        const updatedTools = { ...state.inventory.tools };
        const updatedMagic = { ...state.inventory.magic };
        
        if (currentEquipped in updatedBlocks) {
            updatedBlocks[currentEquipped]++;
        } else if (currentEquipped in updatedTools) {
            updatedTools[currentEquipped]++;
        } else if (currentEquipped in updatedMagic) {
            updatedMagic[currentEquipped]++;
        } else {
            updatedBlocks[currentEquipped] = (updatedBlocks[currentEquipped] || 0) + 1;
        }

        const effective = effectiveWith(state.level, newEquipment);
        const level = state.level;
        const { maxHealth: newMaxHealth, maxMana: newMaxMana } = deriveMaxStats(level, effective);

        return {
            equipment: newEquipment,
            inventory: {
                ...state.inventory,
                blocks: updatedBlocks,
                tools: updatedTools,
                magic: updatedMagic
            },
            maxHealth: newMaxHealth,
            maxMana: newMaxMana,
            playerHealth: Math.min(state.playerHealth, newMaxHealth),
            mana: Math.min(state.mana, newMaxMana)
        };
    }),

    // Phase 9: Camera Shake — the LIVE VALUE LIVES IN game/cameraShakeChannel.js, not here.
    //
    // Trauma decays every frame while a shake runs, so holding it in zustand meant a `set()` per frame
    // from inside useFrame: ~30 store notifications per hit, each re-running every subscriber's selector
    // across the whole app. That is the reactive-binding-to-a-high-frequency-system this project's
    // Game-Loop-Isolation rule exists to forbid, and it bought nothing -- the only reader is the player
    // controller's useFrame, which already read it transiently, and it was never persisted.
    //
    // These two stay as store methods purely so the eight producers keep calling what they called before.
    // Neither writes state.
    triggerCameraShake: (weight = 1.0, dirX, dirZ) => { addShake(weight, dirX, dirZ); },
    decayCameraShake: (dt) => { decayShake(dt); },

    // SOTA M1 game-feel: ONE global feedback/juice dial scaling screenshake + hitstop magnitude.
    // 1 = full, 0 = off. The M3 Settings/accessibility "reduced motion" toggle drives this to 0.
    // TWO FIELDS, because there are two facts. `juiceIntensityChoice` is what the PLAYER chose and is
    // what persists; `juiceIntensity` is what is in effect right now, which the OS reduced-motion
    // preference can force to 0.
    //
    // One field could not hold both. The OS listener passed the literal 1 on every `change` event, so
    // toggling macOS Reduce Motion ON and then OFF again overwrote a player's 40% with 100% -- and
    // persisted it, with no way to recover the 40% but to re-drag the slider. The obvious fix, reading
    // the current dial back in, is worse: the ON transition destructively wrote 0 into that very field,
    // so an ON/OFF cycle would latch at 0 forever. There was no slot to restore FROM. Now there is.
    juiceIntensityChoice: 1,
    // FRAME CAP (render/FrameCap.jsx; plan 2026-09-23-crafty-perf-heat-ipad, Task 4). 60 = at most 60 frames a second,
    // on any display; 0 = unlimited (the display's own rate — 120 on a ProMotion laptop, twice the GPU work). The
    // default is 60: Kevin measured an M3 Max's fans at full speed on the uncapped loop. Persisted (settingsPersist).
    frameCap: 60,
    setFrameCap: (fps) => set({ frameCap: fps === 0 ? 0 : 60 }),
    // The opaque title screen covers the game canvas (render/canvasPace.js paces it down). ONE writer: MenuSystem,
    // from its own titleMenuVisible — a second derivation of "is the title up" is how two copies drift.
    titleCovering: false,
    // A panel's full-screen scrim covers the game canvas (render/canvasPace.js paces it to 30). ONE writer: MenuSystem.
    panelCovering: false,
    juiceIntensity: 1,
    setJuiceIntensity: (v) => set(() => {
      const next = Math.max(0, Math.min(1, v));
      return { juiceIntensityChoice: next, juiceIntensity: next };
    }),
    /** The OS preference changed. ON forces 0; OFF restores what the player chose, not a hardcoded 1. */
    applyReducedMotion: (prefersReduced) => set((st) => ({
      juiceIntensity: motionIntensity(prefersReduced, st.juiceIntensityChoice ?? 1),
    })),

    // SOTA M3 #3 audio settings: SFX master volume 0..1 (drives the WebAudio master-bus input gain via a
    // SoundManager effect). musicVolume + masterMuted land in S3b. Default 1 (full).
    sfxVolume: 1,
    setSfxVolume: (v) => set({ sfxVolume: Math.max(0, Math.min(1, v)) }),
    // S3b: music volume (scales the MusicPlayer crossfade target) + a single master mute that silences
    // BOTH the SFX bus AND the music (both audio paths are wired to it).
    musicVolume: 1,
    setMusicVolume: (v) => set({ musicVolume: Math.max(0, Math.min(1, v)) }),
    masterMuted: false,
    setMasterMuted: (m) => set({ masterMuted: !!m }),

    // S1-D-M1: Non-blocking hitstop. While now < hitstopUntil the WORLD holds still — the player's motion,
    // mob render damp and the AI tick all read game/hitstop.js worldTimeScale (EXTERNAL-BASELINE #3; it was
    // the player alone). 0 = inactive (always in the past). `triggerHitstop` is the ONE writer: it stacks a
    // burst of hits and caps it (stackHitstop), and `hitstopStart` is the burst's start the cap counts from.
    hitstopUntil: 0,
    hitstopStart: 0,
    // Every FINISHED burst's frozen span, banked when the next burst starts, so the world clock
    // (game/worldClock.js) is exact however the frames fall — a burst that ended and another that began
    // between two frames used to lose the first one's tail (review #5, R6.6).
    hitstopFrozenTotal: 0,
    triggerHitstop: (ms) => {
        const cur = get();
        const next = stackHitstop({ until: cur.hitstopUntil, start: cur.hitstopStart }, performance.now(), ms);
        if (next.until !== cur.hitstopUntil || next.start !== cur.hitstopStart) {
            const banked = next.start !== cur.hitstopStart ? Math.max(0, cur.hitstopUntil - cur.hitstopStart) : 0;
            set({ hitstopUntil: next.until, hitstopStart: next.start, hitstopFrozenTotal: (cur.hitstopFrozenTotal || 0) + banked });
        }
    },

    // S1-D-M1: Transient bloom-spike. Spell impacts set this to `performance.now() + ms`;
    // a useFrame consumer in the EffectComposer drives the Bloom effect's intensity up
    // for the window, then eases back to the baseline. 0 = inactive. `triggerBloomSpike`
    // is the public hook (mirrors triggerCameraShake / triggerGPUSparks).
    bloomSpikeUntil: 0,
    triggerBloomSpike: (ms = 80) => set({ bloomSpikeUntil: performance.now() + ms }),

    // checkCollision / setCheckCollision DELETED 2026-08-11: Terrain registered a function here on
    // mount and NOTHING ever read it. A registration with no reader is a wire to nowhere that the next
    // author has to trace before they can rule it out.

    // Transient Events & System Hooks
    _spawnTime: Date.now(),
    getPlayerLevel: () => get().level,
    getPlayerXP: () => ({ current: get().currentXP, total: get().totalXP, level: get().level, required: xpForLevel(get().level) }),
    grantXP: (amount, _reason = 'Action') => set((state) => {
        let level = state.level;
        let currentXP = state.currentXP + (amount || 0);
        const totalXP = state.totalXP + (amount || 0);
        let talentPoints = state.talentPoints;
        let leveledUp = false;
        while (currentXP >= xpForLevel(level)) {
            currentXP -= xpForLevel(level);
            level += 1;
            talentPoints += 1; // a level's one choice; its stats come from the level itself (effectiveWith)
            leveledUp = true;
        }
        const effective = effectiveWith(level, state.equipment);
        const { maxHealth, maxMana } = deriveMaxStats(level, effective);
        return {
            level, currentXP, totalXP, talentPoints, maxHealth, maxMana,
            ...(leveledUp ? { playerHealth: maxHealth, mana: maxMana } : {}),
        };
    }),

    // (onMobKill moved to the src/game/mobKillBus.js fan-out in M3.5 — quests + ember both subscribe.)
    onSpellCast: null,
    setOnSpellCast: (fn) => set({ onSpellCast: fn }),
    onSpellHit: null, // QuestSystem publishes it; the magic system calls it when a spell lands on an enemy
    onBlockPlace: null,
    setOnBlockPlace: (fn) => set({ onBlockPlace: fn }),
    onBlockBreak: null,
    setOnBlockBreak: (fn) => set({ onBlockBreak: fn }),
    onChestOpen: null,
    setOnChestOpen: (fn) => set({ onChestOpen: fn }),
    onPlayerDeath: null,
    setOnPlayerDeath: (fn) => set({ onPlayerDeath: fn }),
    addNotification: null,
    checkNearbyChest: null,
    setCheckNearbyChest: (fn) => set({ checkNearbyChest: fn }),
    openNearbyChest: null,
    setOpenNearbyChest: (fn) => set({ openNearbyChest: fn }),

    gameCamera: null,
    setGameCamera: (camera) => set({ gameCamera: camera }),

    // Published by the system that owns each, null until it mounts (tests/scripts/store-keys-declared.test.js: a key
    // set with setState and absent here is invisible to getInitialState, so a new world and a failed boot kept it).
    playAttackSounds: null, // App.jsx: the swing and the hit sound of a melee attack
    playHitSound: null, // App.jsx
    playDefeatSound: null, // App.jsx
    playSpatialSound: null, // render/SpatialAudioController.jsx
    requestPointerLock: null, // GameScene.jsx: the canvas's lock request
    spawnMob: null, // systems/SpawnerSystem.jsx
    spawnEnemyProjectile: null, // systems/EnemyProjectileSystem.jsx
    triggerGPUSparks: null, // world/GPUSparkSystem.jsx
    spawnDeterministicCast: null, // EnhancedMagicSystem.jsx, for the visual fixtures (devtest/devBridge.js)
    onNightSurvived: null, // QuestSystem.jsx: the night quest's counter
    onLevelChanged: null, // QuestSystem.jsx: the level quest's counter, called by SimpleExperienceSystem.jsx
    // The primary action's seams (input/primaryInput.js): the touch overlay presses and releases through them.
    performVerb: null,
    pressPrimary: null,
    releasePrimary: null,
    debugChunks: null, // world/Terrain.jsx: the loaded chunks, for the debug overlay
    shrineReached: false, // QuestSystem.jsx: a frontier shrine reached this session, for the HUD objective

    // damageMob / checkMobCollision DELETED 2026-08-11 along with their setters: a write-only mirror of
    // the GameMethods singleton that all eleven live consumers actually read. Two publication mechanisms
    // where one is read is worse than one -- the next author has to work out which is authoritative.
    
    castSpell: null,
    setCastSpell: (fn) => set({ castSpell: fn }),
    
    damageBoss: null,
    setDamageBoss: (fn) => set({ damageBoss: fn }),
    // The boss system's give-up path for a dragon chunk that never loaded (render/dragonLoader.js LazyDragon).
    suspendBossEncounter: null,
    // The lookbook's dragon spawn: set only on a ?lookbook=1 page (world/bossSystem.js), null in the game.
    lookbookSpawnDragon: null,
    getBossPosition: null,
    setGetBossPosition: (fn) => set({ getBossPosition: fn }),
    // Single source of truth for boss-active state. The VALUE `bossActive` is what
    // SoundManager gates the boss battle music on (`state.bossActive`); the FUNCTION
    // `isBossActive()` returns that SAME value, so callers reading either path can
    // never diverge.
    bossActive: false,
    setBossActive: (v) => set({ bossActive: !!v }),
    isBossActive: () => get().bossActive,
    // THE ENCOUNTER, persisted (A-bis B2g) and owned here (deep audit lane L3): `useBossSystem` selects these and writes
    // them through setBossEncounter, keeping no copy, so a load is the fight the hook shows. Before B2g the whole fight
    // was hook-local, and a reload mid-boss handed the dragon back every point of health the player had taken off it.
    // Phase is deliberately absent: it is DERIVED from health (`game/bossPersistence.phaseForHealth`), and persisting a
    // derived value invites it to drift.
    bossHealth: BOSS_CONFIG.health,
    bossDefeated: false,
    // QUEUE C3: dragons slain so far (the next fight's tier, game/bossTier.js) and the night of the last kill
    // (the return cadence counts from it). Persisted with the encounter; written only when passed.
    bossTier: 0,
    bossKillNight: 0,
    setBossEncounter: ({ health, active, defeated, tier, killNight }) =>
      set({
        bossHealth: health, bossActive: !!active, bossDefeated: !!defeated,
        ...(Number.isFinite(tier) ? { bossTier: tier } : {}),
        ...(Number.isFinite(killNight) ? { bossKillNight: killNight } : {}),
      }),
    // S2-B1 WILDHEART -- single-writer beast-form authority (mirrors bossActive above). TRANSIENT:
    // never serialized (absent from saveSchema), so load/respawn ALWAYS returns to human -- this IS
    // the no-permanent-beast invariant. Components.jsx subscribes to `activeBeastForm` (a rare
    // transition, game-loop-isolation-safe) and does the imperative Rapier collider setShape; the
    // store NEVER touches Rapier (keeps the invariant unit-testable). All exits route through exitBeastForm.
    beastFormActive: false,
    activeBeastForm: null,
    setBeastFormActive: (active, form = null) => set({ beastFormActive: !!active, activeBeastForm: active ? (form ?? null) : null }),
    isBeastFormActive: () => get().beastFormActive,
    // M7c: the hold-roar ANTICIPATION flag (transient — NOT persisted). Set by the Components SM on
    // startCharge, cleared on cancel/commit. Drives the anticipation charge-glow (beat 1 of the morph).
    beastCharging: false,
    setBeastCharging: (v) => set({ beastCharging: !!v }),
    // S2-B2-M1: VOIDHAND grab — TRANSIENT (NOT serialized, like beastFormActive). `voidhandHeld` is the
    // single active-truth (the pure SM in voidhand.js owns the timers); `heldPhantom` = { color } of the
    // orbiting phantom block (a pooled visual proxy — NEVER a voxel edit, so a combat grab never re-meshes).
    voidhandHeld: false,
    setVoidhandHeld: (v) => set({ voidhandHeld: !!v }),
    heldPhantom: null,
    setHeldPhantom: (p) => set({ heldPhantom: p || null }),
    // S2-B4-M5: the armed-reticle tell (edge-written only — arm/disarm events, GLI-clean).
    imbueArmed: false,
    setImbueArmed: (v) => set({ imbueArmed: v }),
    enterBeastForm: (element) => {
        if (!getBeastForm(element) || !get().isAlive || get().beastFormActive) return false;
        get().setBeastFormActive(true, element);
        return true; // the caller spends the roar's ember only on a real transform, never on a rejected enter
    },
    exitBeastForm: () => {
        if (!get().beastFormActive && get().activeBeastForm == null) return;
        get().setBeastFormActive(false, null);
    },
    // Dev-only: visual-fixture force-spawn for the boss-closeup state (set by useBossSystem).
    forceBossSpawn: null,

    // The tier row a spell casts at: the highest its caster's level has reached (game/spellTiers.js). Read by the cast.
    getSpellStats: (spellType) => spellStatsAt(spellType, get().level),

    // Phase 23: Skill Talent Tree & Placeable Container Chests
    talentPoints: 0,
    unlockedTalents: {},
    // The Aspect verbs' numbers for the player's talents and equipped relic (game/verbMods.js). Every verb site reads it
    // through getState(), so a talent or a relic changes a verb with no subscription in the frame loop.
    getVerbMods: () => verbModsFor(get().unlockedTalents, get().equipment?.relic, get().relicTiers),
    aspectHint: null, // just-in-time teaching toast on a fresh Aspect-verb unlock (auto-cleared by AspectHintToast)
    setAspectHint: (v) => set({ aspectHint: v }),
    // S2a: serializable mirror of useQuestSystem's persistable state (quest
    // progress + achievement counters). The gameplay hook owns the working
    // state; this is a JSON-safe snapshot for buildSaveData.
    questState: null,
    // The world-load event: a monotonic tick every loadWorldData bumps (startNewWorld too), so each owner of per-world
    // state outside the store re-seeds from the loaded world: the quest log (QuestSystem.jsx), the dragon's arrival
    // latches (world/bossSystem.js), the squad's bodies (world/squadPersistence.js).
    worldLoadedAt: 0,
    setQuestState: (qs) => set({ questState: qs }),
    chests: new Map(),
    activeChestCoords: null,
    showChestInterface: false,
    setShowChestInterface: (show) => set({ showChestInterface: show }),
    setActiveChestCoords: (coords) => set({ activeChestCoords: coords }),
    // C4/Q24: a choice you cannot revisit is a one-way door, and the second-run problem is precisely
    // that there is no build to come back and try differently. Refunds every rank; reuses the shape
    // refundUnknownTalents already established.
    respecTalentPoints: () => set((state) => {
        const r = respecTalents(state.unlockedTalents, state.talentPoints);
        return {
            unlockedTalents: r.unlockedTalents,
            talentPoints: r.talentPoints,
            // R1.4: refunding a verb must also END what the verb is doing, or respec is a free exploit —
            // hold a beast form or a grab through it and keep both. These are the same store flags each
            // Aspect SM reads as its ACTIVE state, so clearing them IS the SM's own exit path (the form's
            // collider swap is driven by activeBeastForm). The squad-cap half lives in SquadAISystem,
            // because the store never touches the ECS world; the imbue stance is owned by its SM's ref,
            // which disarms itself when the talent is no longer owned (game/elemancer.js `owned`).
            beastFormActive: false, activeBeastForm: null, beastCharging: false,
            voidhandHeld: false, heldPhantom: null,
        };
    }),

    spendTalentPoint: (talentId) => set((state) => {
        // C4/Q24: ONE authority for "may this rank be taken". This used to check points and limit only
        // — it did NOT enforce `prereq`, so the store would happily rank a node whose prerequisite was
        // untaken and the tree's own shape was advisory, held up by whatever the panel chose to grey
        // out. `canUnlockTalent` enforces points, limit, prereq AND the new exclusivity in one place,
        // which is also what stops `excludes` being a data field nothing reads.
        if (!canUnlockTalent(talentId, state.unlockedTalents, state.talentPoints)) return {};
        const currentVal = state.unlockedTalents[talentId] || 0;
        
        const newUnlocked = { ...state.unlockedTalents, [talentId]: currentVal + 1 };
        // just-in-time teaching: on the FIRST unlock of an Aspect verb-talent, surface a hint toast.
        const hint = currentVal === 0 ? aspectUnlockHint(talentId) : null;
        return {
            talentPoints: state.talentPoints - 1,
            unlockedTalents: newUnlocked,
            aspectHint: hint || state.aspectHint,
        };
    }),
    setChestInventory: (coords, inventory) => set((state) => {
        const newChests = new Map(state.chests);
        newChests.set(coords, { ...newChests.get(coords), inventory });
        return { chests: newChests };
    }),
    transferItem: (coords, item, quantity = 1, direction) => set((state) => {
        const chest = state.chests.get(coords) || { inventory: {} };
        const chestInv = { ...chest.inventory };
        const playerBlocks = { ...state.inventory.blocks };
        
        if (direction === 'to_chest') {
            const playerQty = playerBlocks[item] || 0;
            if (playerQty < quantity) return {};
            playerBlocks[item] = playerQty - quantity;
            chestInv[item] = (chestInv[item] || 0) + quantity;
        } else {
            const chestQty = chestInv[item] || 0;
            if (chestQty < quantity) return {};
            chestInv[item] = chestQty - quantity;
            playerBlocks[item] = (playerBlocks[item] || 0) + quantity;
        }
        
        const newChests = new Map(state.chests);
        newChests.set(coords, { ...chest, inventory: chestInv });
        
        return {
            inventory: { ...state.inventory, blocks: playerBlocks },
            chests: newChests
        };
    }),

    buildingMode: 'single',
    setBuildingMode: (mode) => set({ buildingMode: mode }),
    buildSize: 1,
    setBuildSize: (size) => set({ buildSize: size }),

    // Look sensitivity (mouse pointerSpeed + touch drag-look); 1 = default, clamped 0.3..2.5.
    // Is the sun above the horizon? Written EDGE-TRIGGERED by <Atmosphere> (twice per day/night cycle,
    // never per frame) so <EffectComposer> can gate the GodRays pass. Default true = the historical
    // always-on behaviour, so nothing changes until the arc actually moves the sun below the horizon.
    sunAboveHorizon: true,
    lookSensitivity: 1,
    setLookSensitivity: (v) => set({ lookSensitivity: Math.max(0.3, Math.min(2.5, Number(v) || 1)) }),
    selectedBuildBlock: null,
    setSelectedBuildBlock: (block) => set({ selectedBuildBlock: block }),

    // W3 M-HUD.9: the controls cheatsheet (CombatInstructions) is now a toggle/auto-fade, not always-on.
    // HUD auto-fades it after the first ~8s of play; H re-summons it (InputManager). Default false so the
    // deterministic visual capture (which never runs the fade timer) renders a clean, sheet-free HUD.
    // The controls panel (H), generated from KEY_MAP; `controlsSeen` is whether this browser has opened it once, and
    // `controlsCardDone` whether its first-run card has had its time on screen and folded to the hint
    // (ui/CombatInstructions.jsx); `controlsCardMs` is how long the card has been on screen this session.
    showControls: false,
    setShowControls: (v) => set({ showControls: v }),
    controlsSeen: readControlsSeen(),
    markControlsSeen: () => { writeControlsSeen(); set({ controlsSeen: true }); },
    controlsCardDone: readControlsCardDone(),
    markControlsCardDone: () => { writeControlsCardDone(); set({ controlsCardDone: true }); },
    controlsCardMs: 0,
    addControlsCardMs: (ms) => set((st) => ({ controlsCardMs: st.controlsCardMs + Math.max(0, ms) })),

    selectedBlock: 'grass',
    setSelectedBlock: (block) => set({ selectedBlock: block }),

    worldBlocks: new Map(),
    setWorldBlocks: (blocks) => set({ worldBlocks: blocks }),
    // The open world's terrain seed (world/worldSeed.js). Set only by a load; New World loads the initial state, so it
    // writes 12345.
    worldSeed: DEFAULT_WORLD_SEED,

    activeSpell: 'fireball',
    setActiveSpell: (spell) => set({ activeSpell: spell }),

    showTradingInterface: false,
    setShowTradingInterface: (show) => set((state) => ({ showTradingInterface: typeof show === 'function' ? show(state.showTradingInterface) : show })),

    selectedVillager: null,
    setSelectedVillager: (villager) => set({ selectedVillager: villager }),

    // W3 M-HUD.2: the ability-bar cooldown mirror — a JSON-safe snapshot of the Aspect/dodge cooldown
    // timers written ~6.7x/s from Components.jsx's useFrame (Game-Loop-Isolation: a throttled setState,
    // never per-frame React state). The HUD AbilityBar reads this, never the component-local SM refs.
    abilityCooldowns: { grab: null, snare: null, roar: null, imbue: null, dodge: { ready: true, remaining: 0, duration: 0.8 } },
    setAbilityCooldowns: (m) => set({ abilityCooldowns: m }),

    // W3 M-HUD.7: the looked-at mob/NPC mirror for the HUD TargetFrame (nameplate). A throttled,
    // JSON-safe transient write from Components.jsx's useFrame (Game-Loop-Isolation) off the aim-cone
    // seam; null when nothing is aimed at. The TargetFrame component is the sole reader.
    targetEntity: null,
    setTargetEntity: (t) => set({ targetEntity: t }),

    // B6 (Phase B, Kevin 2026-06-22): a HUMBLE frontier start so the loot and Forge loop matters: building basics,
    // basic tools, ONE humble Stone Sword, a little bootstrap ore (the iron for the Forge's first reforge, so it is
    // reachable, not gifted) and a modest 2+1 potion safety net. Better blades are reforged at Mara's Forge
    // (game/forge.js); diamond and gold ore are mined. Locked by tests/store/startingLoadout.test.js.
    inventory: {
        blocks: {
            grass: 32, dirt: 32, stone: 16, wood: 16, glass: 8, sand: 16,
            coal: 8, iron: 4,
            'Stone Sword': 1,
            'Health Potion': 2, 'Mana Potion': 1,
        },
        tools: { shovel: 1, axe: 1, sword: 1 },
        magic: {}
    },
    setInventory: (inventoryArg) => set((state) => ({
        inventory: typeof inventoryArg === 'function' ? inventoryArg(state.inventory) : inventoryArg
    })),

    addToInventory: (item, quantity = 1) => set((state) => ({
        inventory: {
            ...state.inventory,
            blocks: { ...state.inventory.blocks, [item]: (state.inventory.blocks[item] || 0) + quantity }
        }
    })),

    removeFromInventory: (item, quantity = 1) => set((state) => ({
        inventory: {
            ...state.inventory,
            blocks: { ...state.inventory.blocks, [item]: Math.max(0, (state.inventory.blocks[item] || 0) - quantity) }
        }
    })),

    // The ONE decision point for whether a placement is allowed and what it costs. The place executor
    // (world/placeAtHit.js) calls it per cell, so the debit reuses the single removeFromInventory writer (the
    // floor-at-0 invariant cannot fork). Returns false to REFUSE the placement: no block of that kind to spend.
    consumeForPlacement: (blockName) => {
        const { inventory, removeFromInventory } = get();
        const { allowed, consume } = resolvePlacement(inventory.blocks[blockName]);
        if (!allowed) return false;
        removeFromInventory(blockName, consume);
        return true;
    },

    showInventory: false,
    setShowInventory: (show) => set((state) => ({ showInventory: typeof show === 'function' ? show(state.showInventory) : show })),

    showQuestLog: false,
    setShowQuestLog: (show) => set((state) => ({ showQuestLog: typeof show === 'function' ? show(state.showQuestLog) : show })),

    // Mara's Forge (ui/panels/ForgePanel.jsx), opened by talking to her (input/talk.js).
    showForge: false,
    setShowForge: (show) => set((state) => ({ showForge: typeof show === 'function' ? show(state.showForge) : show })),

    showMagic: false,
    setShowMagic: (show) => set((state) => ({ showMagic: typeof show === 'function' ? show(state.showMagic) : show })),

    showSettings: false,
    setShowSettings: (show) => set((state) => ({ showSettings: typeof show === 'function' ? show(state.showSettings) : show })),

    showBuildingTools: false,
    setShowBuildingTools: (show) => set((state) => ({ showBuildingTools: typeof show === 'function' ? show(state.showBuildingTools) : show })),

    showWorldManager: false,
    setShowWorldManager: (show) => set((state) => ({ showWorldManager: typeof show === 'function' ? show(state.showWorldManager) : show })),

    showCredits: false,
    setShowCredits: (show) => set((state) => ({ showCredits: typeof show === 'function' ? show(state.showCredits) : show })),

    // The Talents panel and the Journal's Feats tab. Store flags like every other panel, so one read of the store answers
    // whether any panel is up (ui/panelState.js) for the world clock and the verb gate, which cannot see React state.
    showSpellUpgrades: false,
    setShowSpellUpgrades: (show) => set((state) => ({ showSpellUpgrades: typeof show === 'function' ? show(state.showSpellUpgrades) : show })),

    showAchievements: false,
    setShowAchievements: (show) => set((state) => ({ showAchievements: typeof show === 'function' ? show(state.showAchievements) : show })),

    isDay: true,

    // M3b night siege: nightCount (nights entered/survived) is the ONE source of
    // truth for siege intensity. Lifted out of useSurvivalMode's local useState so
    // BOTH the survival hook AND the spawn system (SimplifiedNPCSystem, via
    // siegeParams(store.nightCount)) read one value -- mirrors the M3a/M2c
    // single-SoT discipline. The spawn loop READS this transiently (getState),
    // never subscribes, so Game-Loop-Isolation holds.
    nightCount: 0,
    // B2f: nightCount is advanced by setGameTime (the single clock-crossing writer) — there is no
    // standalone incrementNight action, because a second writer is exactly what let a load double-count
    // the siege. Direct nightCount writes are reserved for loadWorldData (restore) and the new-world reset.
    // Highest night already rewarded at dawn — the once-per-night guard (persisted in
    // the save slice so a reload mid-run cannot re-grant a night's reward).
    lastRewardedNight: 0,

    // EMBER (game/ember.js): the one Aspect meter. Day kills fill it (useEmberAccrual, App), day placements fill it up
    // to the day's allowance (accrueBuildEmber, world/placeAtHit.js), the four verbs spend it, dawn empties it
    // (setGameTime, on the clock's crossing into day). Both fields are persisted.
    ember: 0,
    // A gain or a placement that changes nothing returns the same state, so zustand notifies no subscriber and App's
    // autosave trigger sees no change.
    gainEmber: (n) => set((s) => {
        const ember = clampEmber(s.ember + n);
        return ember === s.ember ? s : { ember };
    }),
    // One bank pays four verbs, so a price vetted when a verb started (a bind's channel, an armed imbue) may no longer
    // be covered when it lands: the spend checks again and refuses, taking nothing, rather than selling it for less.
    spendEmber: (cost) => {
        if (!canAfford(get().ember, cost)) return false;
        set((s) => ({ ember: clampEmber(s.ember - cost) }));
        return true;
    },
    emberBuildDay: { night: 0, built: 0 },
    accrueBuildEmber: () => set((s) => {
        const r = accrueBuild(s.ember, s.emberBuildDay, s.nightCount, s.isDay);
        return r.ember === s.ember && r.record === s.emberBuildDay ? s : { ember: r.ember, emberBuildDay: r.record };
    }),

    // M3b survive-to-dawn reward: grant ALL THREE (Kevin's decision) -- scaled bonus
    // XP + currency + one guaranteed scaling-rarity loot drop -- via the existing
    // grantXP / addCoins / addToInventory paths. Pure magnitudes from dawnReward();
    // the ONCE-per-dawn guard lives in useSurvivalMode (this action just grants).
    // Returns the reward descriptor so the caller can render a toast.
    grantDawnReward: (nightNumber) => {
        const state = get();
        // Once per night, robust across hook remount + reload (lastRewardedNight is
        // persisted). A re-fired dawn for an already-rewarded (or lower) night is a
        // no-op returning null; the caller renders a plain "you survived" toast then.
        if (nightNumber <= state.lastRewardedNight) return null;
        const reward = dawnReward(nightNumber);
        state.grantXP(reward.xp, 'Survived the night');
        state.addCoins(reward.coins);
        state.addToInventory(reward.lootItem, 1);
        set({ lastRewardedNight: nightNumber });
        return reward;
    },

    gameTime: 0,
    setGameTime: (timeArg) => set((state) => {
        const newTime = typeof timeArg === 'function' ? timeArg(state.gameTime) : timeArg;
        // Flip isDay on a half-cycle BOUNDARY CROSSING (not an exact `% 600 === 0`
        // landing). Robust to any tick step + any resumed gameTime: a multi-step
        // jump that skips the exact multiple still flips, and a save resumed at a
        // non-aligned gameTime (e.g. 437) still flips when a step first lands >= 600.
        if (crossedHalfCycle(state.gameTime, newTime)) {
            // B2f: the siege night-count advances HERE — on a genuine clock crossing INTO night — and
            // NOWHERE else. It used to be bumped by a reactive isDay-edge watcher in the survival hook,
            // which cannot tell a real nightfall from a LOAD (loadWorldData sets isDay directly via
            // isDayAtUnit, with no crossing) — so resuming a night save silently added a phantom siege
            // night, and it ratcheted +1 on every reload. setGameTime is the single clock-ADVANCE writer,
            // so gating the bump here makes a load / dev time-jump unable to advance the siege.
            // Dawn empties the ember bar on this same crossing, for the same reason: the hook's isDay edge also fires on a
            // load, and a day save loaded at night would lose its bar (a pre-cut save its just-migrated banks for good).
            const enteringNight = crossedIntoNight(state.gameTime, newTime);
            return {
                gameTime: newTime,
                isDay: !state.isDay,
                ...(enteringNight ? { nightCount: state.nightCount + 1 } : { ember: 0 }),
            };
        }
        return { gameTime: newTime };
    }),

    // Force the clock to a normalized TIME OF DAY in [0, 1), 0 = midnight, 0.5 = noon.
    //
    // isDay is now DERIVED from the gameTime being written, through the same isDayAtUnit the clock,
    // loadWorldData and the compass dial use. It used to carry a SECOND window of its own -- day spanning
    // [0.25, 0.75) here against isDayAtUnit's [0, 0.5) -- so setTimeOfDay(0.5) wrote gameTime 600 with
    // isDay TRUE while every other reader of that same 600 says night. Both windows were internally
    // coherent; they disagreed about the ORIGIN, midnight here versus dawn in the clock. The consequences
    // were real even though only the DEV bridge and the visual probes reach this: a save taken in that
    // state reloaded inverted (loadWorldData re-derives isDay from gameTime), the compass dial drew
    // sunset beside a daytime readout, and nightCount desynced.
    //
    // The midnight origin is kept because it is what every caller already means (`setTimeOfDay(0.5) //
    // midday`) and what "time of day" reads as; the conversion to the clock's dawn origin happens once,
    // in gameTimeForTimeOfDay, instead of being a second opinion about which half is day.
    setTimeOfDay: (t) => set(() => {
        const gameTime = gameTimeForTimeOfDay(t);
        return { gameTime, isDay: isDayAtUnit(gameTime) };
    }),

    // achievements / setAchievements DELETED 2026-08-11: the setter had zero callers and the array had
    // zero readers, so this serialized an empty list into every save and restored it. The achievements
    // the game actually tracks are QuestSystem's ACHIEVEMENTS, persisted through questState.

    playerHealth: 100,
    maxHealth: 100,
    mana: 100,
    maxMana: 100,
    isAlive: true,
    // W1 BUG-FIX: `gameStarted` was read at 5 guard-sites (App ESC=pause + 3 MenuSystem relock guards)
    // but never defined -> always undefined -> all 5 dead. One-way latch: set true the first time the
    // player enters play (Components pointer-lock OR touch enterPlay) and never unset (pre-game vs mid-game).
    gameStarted: false,
    markGameStarted: () => set((state) => (state.gameStarted ? {} : { gameStarted: true })),
    // S9c WIN-STATE (persisted): set true the first time the Blight-Heart (Shadow Dragon) is slain,
    // so the victory survives a reload (the VictoryOverlay's bossDefeated is transient useState) and
    // the boss does not auto-respawn into a beaten game. One-way latch; serialized in game_state.
    gameWon: false,
    markGameWon: () => set((state) => (state.gameWon ? {} : { gameWon: true })),
    // VICTORY is an EVENT of the first dragon's death, not a state (review #4, R5.5): raised by that kill's own
    // isolated effect and cleared when the overlay is dismissed. Never saved, so a reload cannot resurrect it —
    // deriving it from saved state (defeated + tier) showed the win screen again on every load of a won game.
    victoryPending: false,
    damageFlash: false,
    screenShake: 0,
    lastHitDir: null, // {angle,t} of the most recent directional hit (combat-legibility cue); null until a sourced hit

    setPlayerHealth: (healthArg) => set((state) => ({ playerHealth: typeof healthArg === 'function' ? healthArg(state.playerHealth) : healthArg })),
    setMaxHealth: (max) => set({ maxHealth: max }),
    setMana: (manaArg) => set((state) => ({ mana: typeof manaArg === 'function' ? manaArg(state.mana) : manaArg })),
    setMaxMana: (max) => set({ maxMana: max }),
    setIsAlive: (alive) => set({ isAlive: alive }),
    setDamageFlash: (flash) => set({ damageFlash: flash }),
    setScreenShake: (shake) => set({ screenShake: shake }),

    lastDamageTime: 0,
    setLastDamageTime: (time) => set({ lastDamageTime: time }),

    // Per-ATTACKER damage lockout stamps, keyed by sourceKey (see damagePlayer). `lastDamageTime` above
    // is kept because it is a different thing: the timestamp of the most recent accepted hit, which the
    // HUD and the camera controller read as a hit SIGNAL. It is no longer the rate limiter.
    damageLockouts: {},

    damagePlayer: (amount, source = 'unknown', sourcePos = null, sourceKey = null) => {
        const state = get();
        if (!state.isAlive) return;

        // Ignore damage if player is currently in invincible dodge roll i-frames
        if (state.isPlayerInvincible && state.isPlayerInvincible()) {
            if (import.meta.env.DEV) console.log(`[i-frames] Damage ignored (source: ${source})`);
            return;
        }

        const now = Date.now();
        if (now - useGameStore.getState()._spawnTime < 5000) return;

        // PER-ATTACKER, not global. This read `now - state.lastDamageTime < 500`, and lastDamageTime is
        // one number for the whole game — so the rule was never "this attacker may hit me twice a second",
        // it was "the WORLD may hit me twice a second". Six mobs swinging on their own cooldowns landed
        // the damage of one, which silently deleted the threat model above it: the night siege,
        // SquadAISystem, squadAI.js and every archetype distinction mobArchetypes.js draws.
        //
        // `sourceKey` identifies the ATTACKER; `source` stays the display/attribution string. Callers that
        // pass no key fall back to `source`, so a pre-existing call site keeps a rate limit rather than
        // silently losing one — per-class instead of per-entity, which is strictly better than global.
        const key = sourceKey || source;
        const lockouts = state.damageLockouts || {};
        if (now - (lockouts[key] || 0) < DAMAGE_LOCKOUT_MS) return;

        // Apply Armor Damage Mitigation
        const effective = state.getEffectiveAttributes();
        const finalDamage = mitigateDamage(effective, amount);

        if (import.meta.env.DEV) {
            const armor = effective.armor || 0;
            const dr = armor / (armor + 100);
            console.log(`[hit] Player hit by ${source}: raw damage ${amount} -> mitigated to ${finalDamage} (Armor: ${armor}, DR: ${Math.round(dr * 100)}%)`);
        }

        // Combat-legibility: when the caller supplies the attacker position, record the screen-relative
        // hit direction (read the live camera yaw + player pos) so the HUD can point you at the threat.
        const dir = sourcePos ? hitDirection(state.playerPosition, sourcePos, state.gameCamera?.rotation?.y) : null;
        // E-ter: incoming hits now FREEZE, tiered by what the blow actually cost you. Hitstop existed only
        // for outgoing damage, so the player's swings had weight and the enemies' did not — a moss brute's
        // 25 landed exactly like a skitterling's 5. `hurtStopMs` returns 0 for a fully-mitigated hit, so
        // armour never makes the screen stutter more as it absorbs more.
        const stopMs = hurtStopMs(finalDamage, state.maxHealth);
        set({
            lastDamageTime: now,
            damageLockouts: { ...lockouts, [key]: now },
            damageFlash: true,
            screenShake: finalDamage / 10,
            // The stamp is also the HIT SIGNAL the per-frame camera controller edge-detects for its kick,
            // so it is set on every accepted hit, not only when an attacker position was supplied.
            lastHitDir: dir != null ? { angle: dir, t: now } : { angle: state.lastHitDir?.angle ?? null, t: now },
        });
        if (stopMs > 0) get().triggerHitstop(stopMs);

        setTimeout(() => {
            set({ damageFlash: false, screenShake: 0 });
        }, 200);

        const newHealth = Math.max(0, state.playerHealth - finalDamage);
        set({ playerHealth: newHealth });
        
        if (newHealth <= 0) {
            // death-edge: cancel any in-flight roar CHARGE + drop any VOIDHAND held phantom atomically with
            // the death flag -- without this, beastCharging / voidhandHeld leak true for 1 frame until the
            // SM's own !alive catches up next frame, flashing the charge-glow / orbiting phantom over the
            // soft-death screen (transient-safety; same 1-frame-race class the WILDHEART review caught).
            set({ isAlive: false, beastCharging: false, voidhandHeld: false, heldPhantom: null });
            get().exitBeastForm(); // death-edge: drop beast form NOW (before the soft-death screen) -- no-permanent-beast + kid-floor
            if (useGameStore.getState().playDefeatSound) useGameStore.getState().playDefeatSound();
        }

        if (useGameStore.getState().playHitSound) useGameStore.getState().playHitSound();
    },

    healPlayer: (amount) => {
        const state = get();
        if (!state.isAlive) return;
        set({ playerHealth: Math.min(state.playerHealth + amount, state.maxHealth) });
    },

    restoreMana: (amount) => {
        const state = get();
        if (!state.isAlive) return;
        set({ mana: Math.min(state.mana + amount, state.maxMana) });
    },

    useMana: (cost) => {
        const state = get();
        if (state.mana >= cost) {
            set({ mana: Math.max(0, state.mana - cost) });
            return true;
        }
        return false;
    },

    respawn: () => {
        const state = get();
        set({
            playerHealth: state.maxHealth,
            mana: state.maxMana,
            isAlive: true
        });
        useGameStore.setState({ _spawnTime: Date.now() });
    },

    // playerStats / setPlayerStats DELETED 2026-08-11. The setter had zero callers anywhere in src, tests
    // or scripts, so all four counters -- blocksPlaced, blocksDestroyed, distanceTraveled, timeplayed --
    // were permanently zero, and every save serialized those zeros into player_data.stats while
    // loadWorldData faithfully restored them. The counters the game ACTUALLY keeps live in the quest
    // system's own `stats` (blocks_placed / blocks_broken / distance) and persist through questState.
    // A serialized field nothing writes and nothing reads is worse than absent: the next reader has no
    // way to tell it is fiction.

    loadWorldData: (rawSaveData) => {
        const saveData = migrateSaveData(rawSaveData);
        // B2a: opening a world CLAIMS its slot for this session — subsequent autosaves write back into
        // it (rather than minting a new slot every save). The boot passes the slot's id (game/worldBoot.js). Without an id (a hand-fed payload, a test
        // fixture), the session stays unowned and the next autosave mints a fresh slot — which is the
        // safe direction: never overwrite a world you cannot identify.
        const loadedId = rawSaveData && rawSaveData.id;
        if (loadedId) {
            set({ _sessionWorldId: loadedId, _slotSavedAt: slotSavedAt(loadedId) });
            setActiveWorldId(loadedId);
        }
        const owed = migrateRetired(saveData);
        // The save's own seed; one written before the field was played on 12345, whatever world is open now.
        const worldSeed = resolveWorldSeed(saveData.game_state?.worldSeed);
        seedClimate(worldSeed);
        set((state) => {
            const worldBlocks = saveData.world_data?.blocks ? new Map(liveBlocks(saveData.world_data.blocks)) : state.worldBlocks;
            // migrateSaveData already normalized inventory keys. The retired items (RETIRED_INVENTORY_KEYS: the
            // currency, the pickaxe, the foods) leave the live bag (the tombstone below holds them for the save).
            const inventory = liveInventory(saveData.player_data?.inventory || state.inventory);
            const selectedBlock = saveData.game_state?.selectedBlock || state.selectedBlock;
            const activeSpell = saveData.game_state?.activeSpell || state.activeSpell;
            // `??`, not `||`: gameTime 0 is DAWN — a real, common, perfectly valid clock value, and it is
            // falsy. With `||`, loading any save made at the start of a day silently kept the CURRENT
            // clock instead of the saved one (so a dawn save could resume at dusk, and a new world could
            // not reset the clock at all). Every numeric field in the progression slice below already
            // uses `??` for exactly this reason; game_state was missed. Found by the drift-proof
            // new-world gate, not by anyone reading this line.
            const gameTime = saveData.game_state?.gameTime ?? state.gameTime;
            // Derive isDay from the restored gameTime so a resumed save is always
            // phase-consistent (the clock is authoritative). Fixes the edge where a save's stored isDay disagreed
            // with its gameTime and would not self-correct until the next half-cycle crossing.
            const isDay = isDayAtUnit(gameTime);
            const gameWon = saveData.game_state?.gameWon ?? state.gameWon; // S9c: the win persists across reload
            // A-bis B2g: restore the ENCOUNTER, not just the win. Hydration is invariant-enforcing, not a
            // spread: a won game can never re-arm the dragon, a defeated one stays defeated, health is
            // clamped into [0, max], and a save with no boss block (written before this existed) reads as
            // "not started". Absent-block tolerance is the same forward-compat contract as `prog` below.
            // C3: the fight is sized from its TIER (no fixed max), and a won pre-tier save counts its first
            // return from the night it was loaded on. A save the context-loss resume wiped loads its slain dragon
            // (saveSchema.js BOSS_WIPE_REPAIR, DECISIONS 2026-10-31 item 250).
            const boss = hydrateBossState(owed.bossState || saveData.game_state?.bossState, {
                gameWon, nightCount: saveData.progression?.nightCount ?? state.nightCount,
            });

            // Full progression slice — tolerate pre-A3 saves (no `progression`) by falling back to current state.
            const prog = saveData.progression;
            const level = prog?.level ?? state.level;
            const currentXP = prog?.currentXP ?? state.currentXP;
            const totalXP = prog?.totalXP ?? state.totalXP;
            // A pickaxe in hand becomes the sword (saveSchema.js liveEquipment).
            const equipment = liveEquipment(prog?.equipment ?? state.equipment);
            // A save from before the Forge has tempered nothing; one with no progression slice keeps the session's, as the
            // equipment above does.
            const relicTiers = normalizeRelicTiers(prog ? prog.relicTiers : state.relicTiers);
            const talentPoints = prog?.talentPoints ?? state.talentPoints;
            const unlockedTalents = prog?.unlockedTalents ?? state.unlockedTalents;
            // Migrate pre-A4 saves: drop talent ids no longer in the trees + refund their ranks into points.
            const _known = refundUnknownTalents(unlockedTalents, talentPoints);
            // A pre-Cut save gets every rank back and its attribute points as talent points (saveSchema talents.cut).
            const _cut = owed.respec ? respecTalents(_known.unlockedTalents, _known.talentPoints) : _known;
            const _talentRefund = { unlockedTalents: _cut.unlockedTalents, talentPoints: _cut.talentPoints + owed.talentPoints };
            const coins = prog?.coins ?? state.coins;
            // Siege progression (durable across reload): siege intensity + reward scaling.
            const nightCount = prog?.nightCount ?? state.nightCount;
            const lastRewardedNight = prog?.lastRewardedNight ?? state.lastRewardedNight;
            // A save written before the one meter carries four banks and no `ember`: they are summed into it. Unlike the
            // fields above, a save with no slice does not keep the session's: ember is spendable, and another world's
            // bar would be spent in this one.
            const ember = emberFromSave(prog);
            // The save's own record, absent or not: a save older than the record has spent none of its day, and the
            // session's record belongs to whichever world was loaded before it.
            const emberBuildDay = readBuildDay(prog ? prog.emberBuildDay : state.emberBuildDay);

            // The retired items leave every chest too (the tombstone holds them for the save).
            const chests = saveData.chests ? new Map(liveChests(saveData.chests)) : state.chests;

            // Derived caps from the level and the gear (never baked); a loaded character arrives at full HP and mana, as a
            // respawn does.
            const eff = effectiveWith(level, equipment);
            const { maxHealth, maxMana } = deriveMaxStats(level, eff);

            const position = saveData.player_data?.position;

            // No worker yet (a load at boot, before the world mounted): the edits wait for setTerrainWorker to deliver
            // them. Sending only when a worker existed is how a resumed save came back with its coins and without the
            // blocks its player placed (review 2026-10-27, steady-cool HIGH 2).
            if (state.terrainWorker) state.terrainWorker.postMessage(loadModificationsMessage(worldBlocks, worldSeed));

            return {
                _worldEditsPending: !state.terrainWorker,
                _tombstone: { ...splitTombstone(saveData, owed.claimedQuestIds), migrated: owed.migrated },
                worldBlocks,
                worldSeed,
                inventory,
                selectedBlock,
                activeSpell,
                isDay,
                gameTime,
                gameWon,
                // A pending VICTORY belongs to the kill that raised it, never to the world loaded next (R6.5).
                victoryPending: false,
                bossHealth: boss.health,
                bossActive: boss.active,
                bossDefeated: boss.defeated,
                bossTier: boss.tier,
                bossKillNight: boss.killNight,
                level,
                currentXP,
                totalXP,
                equipment,
                relicTiers,
                talentPoints: _talentRefund.talentPoints,
                unlockedTalents: _talentRefund.unlockedTalents,
                coins,
                nightCount,
                lastRewardedNight,
                ember,
                emberBuildDay,
                chests,
                maxHealth,
                maxMana,
                playerHealth: maxHealth,
                mana: maxMana,
                playerPosition: position || state.playerPosition,
                // A grabbed block belongs to the world it was grabbed in, and the loaded build may not hold the grab at
                // all (the Cut's respec, a rank refunded as unknown): the held branch of game/voidhand.js reads no
                // talent, so a block carried through the load would be thrown by a verb the player does not have.
                voidhandHeld: false,
                heldPhantom: null,
                // S2a: restore the quest/achievement mirror (tolerate pre-questState
                // saves by falling back) and bump the resync tick so useQuestSystem
                // re-seeds its local working state from the loaded snapshot.
                // PRESENCE test, not `??`. The two callers need opposite merge semantics through this
                // one function: loading an older save must tolerate a MISSING key (forward compat), while
                // startNewWorld — which is deliberately "load a save built from the INITIAL state" —
                // must force the reset. buildSaveData writes `questState: state.questState || null`, so a
                // fresh reset save carries the key PRESENT with value null, and `null ?? state.questState`
                // kept the OLD world's completed quests and achievements in the new one.
                questState: Object.prototype.hasOwnProperty.call(saveData, 'questState')
                    ? liveQuestState(saveData.questState, owed.claimedQuestIds)
                    : state.questState,
                worldLoadedAt: (state.worldLoadedAt || 0) + 1,
            };
        });

        // What the save was owed for retired quests, paid through the writers a claim uses, after the load so the XP
        // levels up from the saved level. The record above (`_tombstone.migrated`) keeps a later load from paying it again.
        const s = get();
        if (owed.xp > 0) s.grantXP(owed.xp, 'Quest Reward');
        if (owed.coins > 0) s.addCoins(owed.coins);
        for (const it of owed.items) s.addToInventory(it.item, it.count);
        if (owed.paidTitles.length) {
            const parts = [owed.xp > 0 && `+${owed.xp} XP`, owed.coins > 0 && `+${owed.coins} coins`, ...owed.items.map((it) => `+${it.count} ${it.item}`)].filter(Boolean);
            s.addNotification?.(`Quest reward (${owed.paidTitles.join(', ')}): ${parts.join(', ')}!`, 'reward');
        }
        // Read after the grants above: a retired quest's XP can level the player up, and each level adds a point.
        const points = get().talentPoints;
        if (owed.respec && points > 0) {
            s.addNotification?.(RESPEC_NOTICE[points === 1 ? 'one' : 'other'], 'reward', { vars: { n: points } });
        }

        // Teleport the live Rapier body (imperative; outside the reactive set) if present, leaving any fight behind
        // (game/stanceState.js teleportPlayer resets the stance).
        const pos = saveData.player_data?.position;
        const rb = get().playerRigidBodyRef;
        if (pos && rb && rb.current && typeof rb.current.setTranslation === 'function') {
            teleportPlayer(rb.current, { x: pos.x, y: pos.y, z: pos.z });
        }
        // The worker re-streams every chunk with the save's edits, and the old chunks are wiped first (Terrain.jsx
        // load_modifications_done): with no ground in between, the player fell through the gap and the new chunk
        // landed around them (tests/integration/chaos-play-loads.test.jsx). So the Player holds the body at the save's
        // position until that column has colliders again (Components.jsx, game/spawnPlacement.js resolveResumeSpawn).
        set({ worldReloading: true, resumeSpawn: pos ? { x: pos.x, y: pos.y, z: pos.z } : null });
        // No-permanent-beast: a same-session load while transformed returns to human (the beast-form
        // state is transient/never serialized; this also drives Components.jsx to restore the base
        // collider via the activeBeastForm subscription).
        get().exitBeastForm();
    },

    // B2b: START a genuinely new world — reset the live game, then claim the new slot.
    //
    // "Create New World" used to write a fresh blob to disk and set it active... without ever resetting
    // the store or loading the blob. So the live game kept its level 12, its 4321 coins and its blocks,
    // and the next autosave wrote all of that into the "new" slot. The new world was a CLONE of the old
    // one. (The fresh blob also copied `gameState.inventory` straight in, and carried no `progression`
    // key at all — so loadWorldData's fallback-to-current-state kept the old level anyway.)
    //
    // Reset is DRIFT-PROOF by construction: `buildSaveData` already enumerates every persisted key and
    // `loadWorldData` already knows how to apply them, so a new world is simply "load a save built from
    // the store's INITIAL state". Add a new persisted field to saveSchema and it resets here for free —
    // which is the only version of this I trust, given that the last hand-maintained list of fields is
    // what shipped this bug.
    startNewWorld: (id) => {
        const fresh = buildSaveData(useGameStore.getInitialState(), { position: { x: 0, y: 18, z: 0 } });
        get().loadWorldData(fresh);
        set({ resumeSpawn: null }); // a new world's player is not held at the placeholder position
        set({ _sessionWorldId: id || null, _slotSavedAt: id ? slotSavedAt(id) : null });
        if (id) setActiveWorldId(id);
    },

    // Local-first autosave: serialize the live state to the world slot THIS SESSION OWNS. No-op
    // under the visual-capture harness so capture frames never touch localStorage.
    //
    // B2a (18-domain review, CRITICAL): this used to write to `getActiveWorldId()`, which lives in
    // localStorage and survives a page reload, so a session that had loaded nothing autosaved a level-1
    // world straight over the player's level-15 one.
    //
    // The invariant: an autosave may only write to a slot this session actually OPENED (loaded) or
    // CREATED. `_sessionWorldId` is deliberately in-memory-only — it must NOT survive a reload, because
    // "which world am I playing" is a fact about the session, not about the browser. With no owned slot,
    // the autosave MINTS A NEW ONE. A save you never opened is not a save you may overwrite. The boot opens
    // the world a page plays (game/worldBoot.js), which is how a returning player's saves land in their slot.
    // `saved_at` is the title's "last played" (MenuSystem.jsx).
    // TWO TABS, ONE SLOT. Every plain visit claims the newest world's slot (game/worldBoot.js), so a second tab and
    // Continue put two tabs on one slot, and a save from the one played longer ago would write its older state over the
    // other's. The tab knows the slot's saved_at as it last read or wrote it (`_slotSavedAt`); a save that finds the
    // index's newer refuses, and `slotConflict` tells the player (ui/SlotConflictPanel.jsx). Returns whether it wrote.
    saveActiveWorld: (position) => {
        if (get().isCaptureMode) return false;
        // A dead player is saved as Respawn would leave them (game/saveSchema.js asRespawned): a refresh on the death
        // screen is not a way back to life where they fell.
        const built = buildSaveData(get(), { position });
        const data = get().isAlive === false ? asRespawned(built) : built;
        let id = get()._sessionWorldId;
        if (!id) {
            id = mintWorldId();   // collision-proof: 'local_' + Date.now() alone can repeat within a ms
            set({ _sessionWorldId: id });
            setActiveWorldId(id);
        }
        const existing = listWorlds().find((w) => w.id === id);
        if (existing && writtenSince(existing.saved_at, get()._slotSavedAt)) {
            if (!get().slotConflict) set({ slotConflict: { id } });
            return false;
        }
        // Preserve the player's chosen name. `data.save_name` is a `Save_<timestamp>` placeholder minted
        // fresh on every serialize, so writing it back renamed "Skyhold Keep" to "Save_7/13/2026,
        // 10:25:06 AM" on the first autosave. Only a brand-new slot gets the placeholder.
        const name = (existing && existing.name) || data.save_name;
        const created_at = (existing && existing.created_at) || new Date().toISOString();
        const saved_at = new Date().toISOString();
        const meta = { name, created_at, is_owner: true, saved_at };
        if (existing && 'is_public' in existing) meta.is_public = existing.is_public;
        const ok = writeWorld(id, meta, data);
        if (ok) set({ _slotSavedAt: saved_at });
        return ok;
    }
}));
