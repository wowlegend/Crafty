import { create } from 'zustand';
import { mitigateDamage } from '../utils/combat';
import { computeEffective, deriveMaxStats, xpForLevel } from '../game/progression.js';
import { TALENT_LIMITS, foldTalentEffects, refundUnknownTalents } from '../game/talentTree.js';
import { aspectUnlockHint } from '../game/aspectHints.js';
import { buildSaveData, migrateSaveData } from '../game/saveSchema.js';
import { writeWorld, getActiveWorldId, setActiveWorldId } from '../game/worldSaves.js';
import { crossedHalfCycle, isDayAtUnit, dawnReward } from '../game/dayNight.js';
import { getBeastForm } from '../game/beasts.js';
import { clampFerocity } from '../game/ferocity.js';
import { clampKinetic } from '../game/kinetic.js';
import { hitDirection } from '../game/damageDirection.js';
import { clampSoul } from '../game/soul.js';
import { clampResonance } from '../game/resonance.js';

export const EQUIPMENT_STATS = {
    // Weapons
    'sword': { strength: 2, agility: 1 },
    'pickaxe': { strength: 1 },
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

// Effective attrs INCLUDING talent folds — the single source for any maxStats derivation.
// (getEffectiveAttributes is the get()-based equivalent; this takes explicit pending args
// for the in-reducer recomputes where state isn't committed yet.)
const effectiveWith = (base, equipment, unlockedTalents) =>
  foldTalentEffects(computeEffective(base, equipment, EQUIPMENT_STATS), unlockedTalents);

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

    // Danger mood input (spec §4): 0 = explore, 1 = dusk, 2 = obsidian. Gameplay
    // triggers (night/combat/boss) wire this in S2; the test bridge drives it now.
    dangerLevel: 0,
    setDangerLevel: (n) => set({ dangerLevel: Number(n) || 0 }),

    // UI locale (S1-C): 'en' default + togglable 'zh-CN'. (A later task makes
    // setLocale also lazy-load CJK fonts on the flip to zh-CN.)
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
    setTerrainWorker: (worker) => set({ terrainWorker: worker }),
    
    getGeneratedChunks: null,
    setGetGeneratedChunks: (fn) => set({ getGeneratedChunks: fn }),
    
    getMobGroundLevel: null,
    setGetMobGroundLevel: (fn) => set({ getMobGroundLevel: fn }),

    playerRigidBodyRef: null,
    setPlayerRigidBodyRef: (ref) => set({ playerRigidBodyRef: ref }),

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
    attributes: {
        strength: 10,
        agility: 10,
        intellect: 10,
        armor: 0,
        attributePoints: 0
    },
    equipment: {
        head: null,
        chest: null,
        boots: null,
        weapon: null,
        offhand: null
    },
    isPlayerInvincible: () => false,

    getEffectiveAttributes: () => {
        const state = get();
        return effectiveWith(state.attributes, state.equipment, state.unlockedTalents);
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

        const effective = effectiveWith(state.attributes, newEquipment, state.unlockedTalents);
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

        const effective = effectiveWith(state.attributes, newEquipment, state.unlockedTalents);
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

    allocateAttribute: (attr) => set((state) => {
        if (state.attributes.attributePoints <= 0) return {};
        
        const newAttributes = {
            ...state.attributes,
            [attr]: state.attributes[attr] + 1,
            attributePoints: state.attributes.attributePoints - 1
        };
        
        const effective = effectiveWith(newAttributes, state.equipment, state.unlockedTalents);
        const level = state.level;
        const { maxHealth: newMaxHealth, maxMana: newMaxMana } = deriveMaxStats(level, effective);

        return {
            attributes: newAttributes,
            maxHealth: newMaxHealth,
            maxMana: newMaxMana,
            playerHealth: Math.min(state.playerHealth, newMaxHealth),
            mana: Math.min(state.mana, newMaxMana)
        };
    }),

    addAttributePoints: (amount) => set((state) => ({
        attributes: {
            ...state.attributes,
            attributePoints: state.attributes.attributePoints + amount
        }
    })),

    // Phase 9: Camera Shake
    cameraShakeIntensity: 0,
    // SOTA M2 #9: directional bias unit [x,z] (world) so a hit lurches the camera AWAY from the
    // player along the real hit vector, not a symmetric jitter. Passing a dir sets it; omitting the
    // dir (the per-frame decay calls) PRESERVES it across the multi-frame falloff.
    cameraShakeDir: [0, 0],
    triggerCameraShake: (intensity = 1.0, dirX, dirZ) => set((s) => ({
      cameraShakeIntensity: intensity,
      cameraShakeDir: dirX === undefined ? s.cameraShakeDir : [dirX, dirZ],
    })),

    // SOTA M1 game-feel: ONE global feedback/juice dial scaling screenshake + hitstop magnitude.
    // 1 = full, 0 = off. The M3 Settings/accessibility "reduced motion" toggle drives this to 0.
    juiceIntensity: 1,
    setJuiceIntensity: (v) => set({ juiceIntensity: Math.max(0, Math.min(1, v)) }),

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

    // S1-D-M1: Non-blocking hitstop. `damageMob` sets this to `performance.now() + ms`;
    // the player movement loop clamps its motion toward zero while now < hitstopUntil.
    // Replaces the old main-thread busy-wait. 0 = inactive (always in the past).
    hitstopUntil: 0,

    // S1-D-M1: Transient bloom-spike. Spell impacts set this to `performance.now() + ms`;
    // a useFrame consumer in the EffectComposer drives the Bloom effect's intensity up
    // for the window, then eases back to the baseline. 0 = inactive. `triggerBloomSpike`
    // is the public hook (mirrors triggerCameraShake / triggerGPUSparks).
    bloomSpikeUntil: 0,
    triggerBloomSpike: (ms = 80) => set({ bloomSpikeUntil: performance.now() + ms }),

    checkCollision: null,
    setCheckCollision: (fn) => set({ checkCollision: fn }),

    mobEntities: [],
    setMobEntities: (entities) => set((state) => ({ mobEntities: typeof entities === 'function' ? entities(state.mobEntities) : entities })),

    // Transient Events & System Hooks
    _spawnTime: Date.now(),
    getPlayerLevel: () => get().level,
    getPlayerXP: () => ({ current: get().currentXP, total: get().totalXP, level: get().level, required: xpForLevel(get().level) }),
    grantXP: (amount, reason = 'Action') => set((state) => {
        let level = state.level;
        let currentXP = state.currentXP + (amount || 0);
        const totalXP = state.totalXP + (amount || 0);
        let attributePoints = state.attributes.attributePoints;
        let talentPoints = state.talentPoints;
        let leveledUp = false;
        while (currentXP >= xpForLevel(level)) {
            currentXP -= xpForLevel(level);
            level += 1;
            attributePoints += 5;
            talentPoints += 1;
            leveledUp = true;
        }
        const attributes = { ...state.attributes, attributePoints };
        const effective = effectiveWith(attributes, state.equipment, state.unlockedTalents);
        const { maxHealth, maxMana } = deriveMaxStats(level, effective);
        return {
            level, currentXP, totalXP, talentPoints, attributes, maxHealth, maxMana,
            ...(leveledUp ? { playerHealth: maxHealth, mana: maxMana } : {}),
        };
    }),

    // (onMobKill moved to the src/game/mobKillBus.js fan-out in M3.5 — quests + ferocity both subscribe.)
    onSpellCast: null,
    setOnSpellCast: (fn) => set({ onSpellCast: fn }),
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

    damageMob: null,
    setDamageMob: (fn) => set({ damageMob: fn }),
    checkMobCollision: null,
    setCheckMobCollision: (fn) => set({ checkMobCollision: fn }),
    
    castSpell: null,
    setCastSpell: (fn) => set({ castSpell: fn }),
    
    damageBoss: null,
    setDamageBoss: (fn) => set({ damageBoss: fn }),
    getBossPosition: null,
    setGetBossPosition: (fn) => set({ getBossPosition: fn }),
    // Single source of truth for boss-active state. The VALUE `bossActive` is what
    // SoundManager gates the boss battle music on (`state.bossActive`); the FUNCTION
    // `isBossActive()` returns that SAME value, so callers reading either path can
    // never diverge. `useBossSystem` drives both via `setBossActive`.
    bossActive: false,
    setBossActive: (v) => set({ bossActive: !!v }),
    isBossActive: () => get().bossActive,
    // Retained for backward compatibility (no longer the driver; prefer setBossActive).
    setIsBossActive: (fn) => set({ isBossActive: fn }),
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
    // M4: the KINETIC bank (twin of ferocityBanked) — day-kill accrual, spent per combat grab,
    // dawn-bled, PERSISTED in the progression slice (unlike the transient held flags above).
    kineticBanked: 0,
    setKineticBanked: (v) => set({ kineticBanked: clampKinetic(v) }),
    accrueKinetic: (delta) => set((s) => ({ kineticBanked: clampKinetic(s.kineticBanked + delta) })),
    // S2-B3-M2: the Soul bank (SOULBIND) — the kinetic triplet's twin.
    soulBanked: 0,
    setSoulBanked: (v) => set({ soulBanked: clampSoul(v) }),
    accrueSoul: (delta) => set((s) => ({ soulBanked: clampSoul(s.soulBanked + delta) })),
    // S2-B4-M5: the armed-reticle tell (edge-written only — arm/disarm events, GLI-clean).
    imbueArmed: false,
    setImbueArmed: (v) => set({ imbueArmed: v }),
    // S2-B4-M2: the Resonance bank (ELEMANCER) — the build-verb meter's triplet.
    resonanceBanked: 0,
    setResonanceBanked: (v) => set({ resonanceBanked: clampResonance(v) }),
    accrueResonance: (delta) => set((s) => ({ resonanceBanked: clampResonance(s.resonanceBanked + delta) })),
    enterBeastForm: (element) => {
        if (!getBeastForm(element) || !get().isAlive || get().beastFormActive) return false;
        get().setBeastFormActive(true, element);
        return true; // M4: the caller spends Ferocity ONLY on a real transform (not a rejected enter)
    },
    exitBeastForm: () => {
        if (!get().beastFormActive && get().activeBeastForm == null) return;
        get().setBeastFormActive(false, null);
    },
    // Dev-only: visual-fixture force-spawn for the boss-closeup state (set by useBossSystem).
    forceBossSpawn: null,

    spellLevels: {},
    setSpellLevels: (levels) => set({ spellLevels: levels }),
    getSpellStats: null,
    setGetSpellStats: (fn) => set({ getSpellStats: fn }),
    upgradeSpell: null,
    setUpgradeSpell: (fn) => set({ upgradeSpell: fn }),

    // Phase 23: Skill Talent Tree & Placeable Container Chests
    talentPoints: 0,
    unlockedTalents: {},
    aspectHint: null, // just-in-time teaching toast on a fresh Aspect-verb unlock (auto-cleared by AspectHintToast)
    setAspectHint: (v) => set({ aspectHint: v }),
    // S2a: serializable mirror of useQuestSystem's persistable state (quest
    // progress + achievement counters). The gameplay hook owns the working
    // state; this is a JSON-safe snapshot for buildSaveData. `questLoadedAt`
    // is a monotonic resync tick bumped on load so the hook re-seeds.
    questState: null,
    questLoadedAt: 0,
    setQuestState: (qs) => set({ questState: qs }),
    chests: new Map(),
    activeChestCoords: null,
    showChestInterface: false,
    setShowChestInterface: (show) => set({ showChestInterface: show }),
    setActiveChestCoords: (coords) => set({ activeChestCoords: coords }),
    addTalentPoint: (amount) => set((state) => ({ talentPoints: state.talentPoints + amount })),
    spendTalentPoint: (talentId) => set((state) => {
        if (state.talentPoints <= 0) return {};
        const currentVal = state.unlockedTalents[talentId] || 0;
        const limit = TALENT_LIMITS[talentId] || 0;
        if (!limit || currentVal >= limit) return {};
        
        const newUnlocked = { ...state.unlockedTalents, [talentId]: currentVal + 1 };

        // STR/INT talents feed deriveMaxStats, so a spend can change the HP/mana caps.
        // Raise the cap + clamp current down if it somehow exceeds — NEVER heal on spend.
        const effective = effectiveWith(state.attributes, state.equipment, newUnlocked);
        const { maxHealth, maxMana } = deriveMaxStats(state.level, effective);
        // just-in-time teaching: on the FIRST unlock of an Aspect verb-talent, surface a hint toast.
        const hint = currentVal === 0 ? aspectUnlockHint(talentId) : null;
        return {
            talentPoints: state.talentPoints - 1,
            unlockedTalents: newUnlocked,
            maxHealth, maxMana,
            playerHealth: Math.min(state.playerHealth, maxHealth),
            mana: Math.min(state.mana, maxMana),
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
    lookSensitivity: 1,
    setLookSensitivity: (v) => set({ lookSensitivity: Math.max(0.3, Math.min(2.5, Number(v) || 1)) }),
    selectedBuildBlock: null,
    setSelectedBuildBlock: (block) => set({ selectedBuildBlock: block }),

    gameMode: 'creative',
    setGameMode: (mode) => set({ gameMode: mode }),

    selectedBlock: 'grass',
    setSelectedBlock: (block) => set({ selectedBlock: block }),

    worldBlocks: new Map(),
    setWorldBlocks: (blocks) => set({ worldBlocks: blocks }),

    activeSpell: 'fireball',
    setActiveSpell: (spell) => set({ activeSpell: spell }),

    showTradingInterface: false,
    setShowTradingInterface: (show) => set((state) => ({ showTradingInterface: typeof show === 'function' ? show(state.showTradingInterface) : show })),

    selectedVillager: null,
    setSelectedVillager: (villager) => set({ selectedVillager: villager }),

    inventory: {
        blocks: {
            grass: 64, dirt: 64, stone: 64, wood: 64, glass: 32, water: 16,
            lava: 8, diamond: 4, gold: 8, iron: 16, coal: 32, sand: 64, cobblestone: 32,
            'Stone Sword': 1, 'Iron Sword': 1, 'Diamond Sword': 1,
            'Wooden Shield': 1, 'Iron Shield': 1,
            'Golden Crown': 1, 'Iron Helmet': 1,
            'Iron Chestplate': 1, 'Leather Chestplate': 1,
            'Leather Boots': 1, 'Iron Boots': 1,
            'Health Potion': 5, 'Mana Potion': 5
        },
        tools: { pickaxe: 1, shovel: 1, axe: 1, sword: 1 },
        magic: { wand: 1, crystals: 8 }
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

    showInventory: false,
    setShowInventory: (show) => set((state) => ({ showInventory: typeof show === 'function' ? show(state.showInventory) : show })),

    showCrafting: false,
    setShowCrafting: (show) => set((state) => ({ showCrafting: typeof show === 'function' ? show(state.showCrafting) : show })),

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

    isDay: true,
    setIsDay: (isDayArg) => set((state) => ({ isDay: typeof isDayArg === 'function' ? isDayArg(state.isDay) : isDayArg })),

    // M3b night siege: nightCount (nights entered/survived) is the ONE source of
    // truth for siege intensity. Lifted out of useSurvivalMode's local useState so
    // BOTH the survival hook AND the spawn system (SimplifiedNPCSystem, via
    // siegeParams(store.nightCount)) read one value -- mirrors the M3a/M2c
    // single-SoT discipline. The spawn loop READS this transiently (getState),
    // never subscribes, so Game-Loop-Isolation holds.
    nightCount: 0,
    incrementNight: () => set((state) => ({ nightCount: state.nightCount + 1 })),
    // Highest night already rewarded at dawn — the once-per-night guard (persisted in
    // the save slice so a reload mid-run cannot re-grant a night's reward).
    lastRewardedNight: 0,

    // S2-B1-M4: Ferocity — banked by DAY kills (via the mobKill bus), SPENT by transforming in the
    // siege, bled to zero at dawn (no carry across nights). A full bank gates + powers one roar.
    // Persisted (clamped+rounded on load). Day-gated accrual lives in useFerocityAccrual (App); the
    // dawn bleed in useSurvivalMode. accrueFerocity takes signed delta (negative = spend on enter).
    ferocityBanked: 0,
    setFerocityBanked: (v) => set({ ferocityBanked: clampFerocity(v) }),
    accrueFerocity: (delta) => set((s) => ({ ferocityBanked: clampFerocity(s.ferocityBanked + delta) })),

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
            return { gameTime: newTime, isDay: !state.isDay };
        }
        return { gameTime: newTime };
    }),

    // Force the day/night cycle to a normalized time-of-day fraction in [0, 1).
    // The sky/lighting reads `isDay`; daytime spans [0.25, 0.75), night otherwise.
    // Used by the dev test bridge to drive the world into known lighting states.
    setTimeOfDay: (t) => set(() => {
        const frac = ((Number(t) % 1) + 1) % 1; // wrap into [0, 1)
        const isDay = frac >= 0.25 && frac < 0.75;
        return { gameTime: Math.round(frac * 1200), isDay };
    }),

    achievements: [],
    setAchievements: (achievementsArg) => set((state) => ({
        achievements: typeof achievementsArg === 'function' ? achievementsArg(state.achievements) : achievementsArg
    })),

    playerHealth: 100,
    maxHealth: 100,
    mana: 100,
    maxMana: 100,
    hunger: 100,
    isAlive: true,
    // W1 BUG-FIX: `gameStarted` was read at 5 guard-sites (App ESC=pause + 3 MenuSystem relock guards)
    // but never defined -> always undefined -> all 5 dead. One-way latch: set true the first time the
    // player enters play (Components pointer-lock OR touch enterPlay) and never unset (pre-game vs mid-game).
    gameStarted: false,
    markGameStarted: () => set((state) => (state.gameStarted ? {} : { gameStarted: true })),
    damageFlash: false,
    screenShake: 0,
    lastHitDir: null, // {angle,t} of the most recent directional hit (combat-legibility cue); null until a sourced hit

    setPlayerHealth: (healthArg) => set((state) => ({ playerHealth: typeof healthArg === 'function' ? healthArg(state.playerHealth) : healthArg })),
    setMaxHealth: (max) => set({ maxHealth: max }),
    setMana: (manaArg) => set((state) => ({ mana: typeof manaArg === 'function' ? manaArg(state.mana) : manaArg })),
    setMaxMana: (max) => set({ maxMana: max }),
    setHunger: (hungerArg) => set((state) => ({ hunger: typeof hungerArg === 'function' ? hungerArg(state.hunger) : hungerArg })),
    setIsAlive: (alive) => set({ isAlive: alive }),
    setDamageFlash: (flash) => set({ damageFlash: flash }),
    setScreenShake: (shake) => set({ screenShake: shake }),

    lastDamageTime: 0,
    setLastDamageTime: (time) => set({ lastDamageTime: time }),

    damagePlayer: (amount, source = 'unknown', sourcePos = null) => {
        const state = get();
        if (!state.isAlive) return;

        // Ignore damage if player is currently in invincible dodge roll i-frames
        if (state.isPlayerInvincible && state.isPlayerInvincible()) {
            if (import.meta.env.DEV) console.log(`[i-frames] Damage ignored (source: ${source})`);
            return;
        }

        const now = Date.now();
        if (now - useGameStore.getState()._spawnTime < 5000) return;

        if (now - state.lastDamageTime < 500) return;

        // Apply Armor Damage Mitigation
        const effective = state.getEffectiveAttributes();
        const armor = effective.armor || 0;
        const dr = armor / (armor + 100);
        const finalDamage = mitigateDamage(effective, amount);

        if (import.meta.env.DEV) console.log(`[hit] Player hit by ${source}: raw damage ${amount} -> mitigated to ${finalDamage} (Armor: ${armor}, DR: ${Math.round(dr * 100)}%)`);

        // Combat-legibility: when the caller supplies the attacker position, record the screen-relative
        // hit direction (read the live camera yaw + player pos) so the HUD can point you at the threat.
        const dir = sourcePos ? hitDirection(state.playerPosition, sourcePos, state.gameCamera?.rotation?.y) : null;
        set({
            lastDamageTime: now,
            damageFlash: true,
            screenShake: finalDamage / 10,
            lastHitDir: dir != null ? { angle: dir, t: now } : state.lastHitDir
        });

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
            get().exitBeastForm(); // death-edge: drop beast form NOW (before the soft-death screen) -- no-permanent-beast + Marcus-floor
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

    consumeHunger: (amount = 0.5) => {
        const state = get();
        if (!state.isAlive) return;
        const newHunger = Math.max(0, state.hunger - amount);
        set({ hunger: newHunger });
        if (newHunger <= 0) {
            state.damagePlayer(1, 'starvation');
        }
    },

    feedPlayer: (amount) => {
        const state = get();
        set({ hunger: Math.min(100, state.hunger + amount) });
    },

    respawn: () => {
        const state = get();
        set({
            playerHealth: state.maxHealth,
            mana: state.maxMana,
            hunger: 100,
            isAlive: true
        });
        useGameStore.setState({ _spawnTime: Date.now() });
    },

    playerStats: {
        blocksPlaced: 0, blocksDestroyed: 0, distanceTraveled: 0, timeplayed: 0
    },
    setPlayerStats: (statsArg) => set((state) => ({
        playerStats: typeof statsArg === 'function' ? statsArg(state.playerStats) : statsArg
    })),

    loadWorldData: (rawSaveData) => {
        const saveData = migrateSaveData(rawSaveData);
        set((state) => {
            const worldBlocks = saveData.world_data?.blocks ? new Map(saveData.world_data.blocks) : state.worldBlocks;
            // migrateSaveData already normalized inventory keys — use directly.
            const inventory = saveData.player_data?.inventory || state.inventory;
            const playerStats = saveData.player_data?.stats || state.playerStats;
            const gameMode = saveData.game_state?.gameMode || state.gameMode;
            const selectedBlock = saveData.game_state?.selectedBlock || state.selectedBlock;
            const activeSpell = saveData.game_state?.activeSpell || state.activeSpell;
            const gameTime = saveData.game_state?.gameTime || state.gameTime;
            // Derive isDay from the restored gameTime so a resumed save is always
            // phase-consistent (the clock is authoritative; the manual setIsDay toggle is
            // transient by design). Fixes the edge where a save's stored isDay disagreed
            // with its gameTime and would not self-correct until the next half-cycle crossing.
            const isDay = isDayAtUnit(gameTime);
            const achievements = saveData.game_state?.achievements || state.achievements;

            // Full progression slice — tolerate pre-A3 saves (no `progression`) by falling back to current state.
            const prog = saveData.progression;
            const level = prog?.level ?? state.level;
            const currentXP = prog?.currentXP ?? state.currentXP;
            const totalXP = prog?.totalXP ?? state.totalXP;
            const attributes = prog?.attributes ?? state.attributes;
            const equipment = prog?.equipment ?? state.equipment;
            const talentPoints = prog?.talentPoints ?? state.talentPoints;
            const unlockedTalents = prog?.unlockedTalents ?? state.unlockedTalents;
            // Migrate pre-A4 saves: drop talent ids no longer in the trees + refund their ranks into points.
            const _talentRefund = refundUnknownTalents(unlockedTalents, talentPoints);
            const spellLevels = prog?.spellLevels ?? state.spellLevels;
            const coins = prog?.coins ?? state.coins;
            // Siege progression (durable across reload): siege intensity + reward scaling.
            const nightCount = prog?.nightCount ?? state.nightCount;
            const lastRewardedNight = prog?.lastRewardedNight ?? state.lastRewardedNight;
            const ferocityBanked = clampFerocity(prog?.ferocityBanked ?? state.ferocityBanked); // M4: clamp+round on load
            const kineticBanked = clampKinetic(prog?.kineticBanked ?? state.kineticBanked); // S2-B2-M4: twin
            const soulBanked = clampSoul(prog?.soulBanked ?? state.soulBanked); // S2-B3-M2: twin
            const resonanceBanked = clampResonance(prog?.resonanceBanked ?? state.resonanceBanked); // S2-B4-M2: twin

            const chests = saveData.chests ? new Map(saveData.chests) : state.chests;

            // Recompute derived caps from BASE attributes + equipment + kept talents + level
            // (never bake); a loaded character arrives at full HP/mana — matches respawn behavior.
            // Use the REFUNDED talents (the same value the set() below commits) so caps reflect
            // exactly the talents the character keeps.
            const eff = effectiveWith(attributes, equipment, _talentRefund.unlockedTalents);
            const { maxHealth, maxMana } = deriveMaxStats(level, eff);

            const position = saveData.player_data?.position;

            if (state.terrainWorker) {
                const modifications = [];
                for (const [key, blockType] of worldBlocks.entries()) {
                    const [wxStr, wyStr, wzStr] = key.split('_');
                    const wx = parseInt(wxStr);
                    const wy = parseInt(wyStr);
                    const wz = parseInt(wzStr);

                    const cx = Math.floor(wx / 16);
                    const cz = Math.floor(wz / 16);
                    const lx = wx - cx * 16;
                    const lz = wz - cz * 16;
                    const index = lx + lz * 16 + wy * 256;

                    modifications.push([cx, cz, index, blockType]);
                }
                state.terrainWorker.postMessage({ type: 'load_modifications', payload: { modifications } });
            }

            return {
                worldBlocks,
                inventory,
                playerStats,
                gameMode,
                selectedBlock,
                activeSpell,
                isDay,
                gameTime,
                achievements,
                level,
                currentXP,
                totalXP,
                attributes,
                equipment,
                talentPoints: _talentRefund.talentPoints,
                unlockedTalents: _talentRefund.unlockedTalents,
                spellLevels,
                coins,
                nightCount,
                lastRewardedNight,
                ferocityBanked,
                kineticBanked,
                soulBanked,
                resonanceBanked,
                chests,
                maxHealth,
                maxMana,
                playerHealth: maxHealth,
                mana: maxMana,
                playerPosition: position || state.playerPosition,
                // S2a: restore the quest/achievement mirror (tolerate pre-questState
                // saves by falling back) and bump the resync tick so useQuestSystem
                // re-seeds its local working state from the loaded snapshot.
                questState: saveData.questState ?? state.questState,
                questLoadedAt: (state.questLoadedAt || 0) + 1,
            };
        });

        // Teleport the live Rapier body (imperative; outside the reactive set) if present.
        const pos = saveData.player_data?.position;
        const rb = get().playerRigidBodyRef;
        if (pos && rb && rb.current && typeof rb.current.setTranslation === 'function') {
            rb.current.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
        }
        // No-permanent-beast: a same-session load while transformed returns to human (the beast-form
        // state is transient/never serialized; this also drives Components.jsx to restore the base
        // collider via the activeBeastForm subscription).
        get().exitBeastForm();
    },

    // Local-first autosave: serialize the live state to the active world slot. No-op
    // under the visual-capture harness so capture frames never touch localStorage.
    saveActiveWorld: (position) => {
        if (get().isCaptureMode) return;
        const data = buildSaveData(get(), { position });
        let id = getActiveWorldId();
        if (!id) { id = 'local_' + Date.now(); setActiveWorldId(id); }
        writeWorld(id, { name: data.save_name, created_at: new Date().toISOString(), is_owner: true }, data);
    }
}));
