import { create } from 'zustand';
import { mitigateDamage } from '../utils/combat';
import { normalizeInventoryKeys } from '../game/invNormalize.js';
import { computeEffective, deriveMaxStats, xpForLevel } from '../game/progression.js';

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
        return computeEffective(state.attributes, state.equipment, EQUIPMENT_STATS);
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
        
        const effective = computeEffective(state.attributes, newEquipment, EQUIPMENT_STATS);
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
        
        const effective = computeEffective(state.attributes, newEquipment, EQUIPMENT_STATS);
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
        
        const effective = computeEffective(newAttributes, state.equipment, EQUIPMENT_STATS);
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
    triggerCameraShake: (intensity = 1.0) => set({ cameraShakeIntensity: intensity }),

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
        const effective = computeEffective(attributes, state.equipment, EQUIPMENT_STATS);
        const { maxHealth, maxMana } = deriveMaxStats(level, effective);
        return {
            level, currentXP, totalXP, talentPoints, attributes, maxHealth, maxMana,
            ...(leveledUp ? { playerHealth: maxHealth, mana: maxMana } : {}),
        };
    }),

    onMobKill: null,
    setOnMobKill: (fn) => set({ onMobKill: fn }),
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

    attackEntity: null,
    setAttackEntity: (fn) => set({ attackEntity: fn }),
    damageMob: null,
    setDamageMob: (fn) => set({ damageMob: fn }),
    checkMobCollision: null,
    setCheckMobCollision: (fn) => set({ checkMobCollision: fn }),
    
    mobSlowEffects: {},
    setMobSlowEffects: (effects) => set((state) => ({ mobSlowEffects: typeof effects === 'function' ? effects(state.mobSlowEffects) : effects })),
    mobStunEffects: {},
    setMobStunEffects: (effects) => set((state) => ({ mobStunEffects: typeof effects === 'function' ? effects(state.mobStunEffects) : effects })),
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
    // Dev-only: visual-fixture force-spawn for the boss-closeup state (set by useBossSystem).
    forceBossSpawn: null,

    tameMob: null,
    setTameMob: (fn) => set({ tameMob: fn }),
    getPets: null,
    setGetPets: (fn) => set({ getPets: fn }),
    
    spellLevels: {},
    setSpellLevels: (levels) => set({ spellLevels: levels }),
    getSpellStats: null,
    setGetSpellStats: (fn) => set({ getSpellStats: fn }),
    upgradeSpell: null,
    setUpgradeSpell: (fn) => set({ upgradeSpell: fn }),

    // Phase 23: Skill Talent Tree & Placeable Container Chests
    talentPoints: 0,
    unlockedTalents: {},
    chests: new Map(),
    activeChestCoords: null,
    showChestInterface: false,
    setShowChestInterface: (show) => set({ showChestInterface: show }),
    setActiveChestCoords: (coords) => set({ activeChestCoords: coords }),
    addTalentPoint: (amount) => set((state) => ({ talentPoints: state.talentPoints + amount })),
    spendTalentPoint: (talentId) => set((state) => {
        if (state.talentPoints <= 0) return {};
        const currentVal = state.unlockedTalents[talentId] || 0;
        const limits = {
            'ember_core': 3, 'fire_blast': 3, 'conflagration': 1, 'storm_caller': 3, 'chain_overload': 2,
            'frost_shield': 3, 'permafrost': 2, 'glacial_chill': 1,
            'mana_flow': 3, 'time_warp': 2, 'astral_focus': 2
        };
        const limit = limits[talentId] || 3;
        if (currentVal >= limit) return {};
        
        const newUnlocked = { ...state.unlockedTalents, [talentId]: currentVal + 1 };
        
        let newAttributes = { ...state.attributes };
        if (talentId === 'frost_shield') {
            newAttributes.armor = (newAttributes.armor || 0) + 5;
        }
        
        return {
            talentPoints: state.talentPoints - 1,
            unlockedTalents: newUnlocked,
            attributes: newAttributes
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
        magic: { wand: 1, crystals: 8, scrolls: 4 }
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

    gameTime: 0,
    setGameTime: (timeArg) => set((state) => {
        const newTime = typeof timeArg === 'function' ? timeArg(state.gameTime) : timeArg;
        // Automatic day/night toggle every 600 ticks
        if (newTime > 0 && newTime % 600 === 0) {
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
    damageFlash: false,
    screenShake: 0,
    
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

    damagePlayer: (amount, source = 'unknown') => {
        const state = get();
        if (!state.isAlive) return;

        // Ignore damage if player is currently in invincible dodge roll i-frames
        if (state.isPlayerInvincible && state.isPlayerInvincible()) {
            console.log(`[i-frames] Damage ignored (source: ${source})`);
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

        console.log(`[hit] Player hit by ${source}: raw damage ${amount} -> mitigated to ${finalDamage} (Armor: ${armor}, DR: ${Math.round(dr * 100)}%)`);

        set({
            lastDamageTime: now,
            damageFlash: true,
            screenShake: finalDamage / 10
        });

        setTimeout(() => {
            set({ damageFlash: false, screenShake: 0 });
        }, 200);

        const newHealth = Math.max(0, state.playerHealth - finalDamage);
        set({ playerHealth: newHealth });
        
        if (newHealth <= 0) {
            set({ isAlive: false });
            if (useGameStore.getState().playDefeatSound) useGameStore.getState().playDefeatSound();
        }

        if (useGameStore.getState().playHitSound) useGameStore.getState().playHitSound();
    },

    healPlayer: (amount) => {
        const state = get();
        if (!state.isAlive) return;
        set({ playerHealth: Math.min(state.playerHealth + amount, state.maxHealth) });
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

    loadWorldData: (saveData) => {
        set((state) => {
            const worldBlocks = saveData.world_data?.blocks ? new Map(saveData.world_data.blocks) : state.worldBlocks;
            const inventory = saveData.player_data?.inventory
                ? normalizeInventoryKeys(saveData.player_data.inventory)
                : state.inventory;
            const playerStats = saveData.player_data?.stats || state.playerStats;
            const gameMode = saveData.game_state?.gameMode || state.gameMode;
            const selectedBlock = saveData.game_state?.selectedBlock || state.selectedBlock;
            const activeSpell = saveData.game_state?.activeSpell || state.activeSpell;
            const isDay = saveData.game_state?.isDay !== undefined ? saveData.game_state.isDay : state.isDay;
            const gameTime = saveData.game_state?.gameTime || state.gameTime;
            const achievements = saveData.game_state?.achievements || state.achievements;

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
                achievements
            };
        });
    }
}));
