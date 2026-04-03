import { create } from 'zustand';

export const useGameStore = create((set, get) => ({
    gameMode: 'creative',
    setGameMode: (mode) => set({ gameMode: mode }),

    selectedBlock: 'grass',
    setSelectedBlock: (block) => set({ selectedBlock: block }),

    worldBlocks: new Map(),
    setWorldBlocks: (blocks) => set({ worldBlocks: blocks }),

    activeSpell: 'fireball',
    setActiveSpell: (spell) => set({ activeSpell: spell }),

    showTradingInterface: false,
    setShowTradingInterface: (show) => set({ showTradingInterface: typeof show === 'function' ? show(get().showTradingInterface) : show }),

    selectedVillager: null,
    setSelectedVillager: (villager) => set({ selectedVillager: villager }),

    inventory: {
        blocks: {
            grass: 64, dirt: 64, stone: 64, wood: 64, glass: 32, water: 16,
            lava: 8, diamond: 4, gold: 8, iron: 16, coal: 32, sand: 64, cobblestone: 32
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

        const now = Date.now();
        if (now - window._spawnTime < 5000) return;

        if (now - state.lastDamageTime < 500) return;

        set({
            lastDamageTime: now,
            damageFlash: true,
            screenShake: amount / 10
        });

        setTimeout(() => {
            set({ damageFlash: false, screenShake: 0 });
        }, 200);

        const newHealth = Math.max(0, state.playerHealth - amount);
        set({ playerHealth: newHealth });
        
        if (newHealth <= 0) {
            set({ isAlive: false });
            if (window.playDefeatSound) window.playDefeatSound();
        }

        if (window.playHitSound) window.playHitSound();
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
        window._spawnTime = Date.now();
    },

    playerStats: {
        blocksPlaced: 0, blocksDestroyed: 0, distanceTraveled: 0, timeplayed: 0
    },
    setPlayerStats: (statsArg) => set((state) => ({
        playerStats: typeof statsArg === 'function' ? statsArg(state.playerStats) : statsArg
    })),

    saveGame: async () => {
        try {
            const authData = JSON.parse(localStorage.getItem('authToken') || '{}');
            if (!authData.token) {
                alert('Please log in to save your game');
                return;
            }

            const state = get();
            const saveData = {
                save_name: `Save_${new Date().toLocaleString()}`,
                world_data: { blocks: Array.from(state.worldBlocks.entries()) },
                player_data: {
                    position: { x: 0, y: 18, z: 0 },
                    inventory: state.inventory,
                    stats: state.playerStats
                },
                game_state: {
                    gameMode: state.gameMode,
                    selectedBlock: state.selectedBlock,
                    activeSpell: state.activeSpell,
                    isDay: state.isDay,
                    gameTime: state.gameTime,
                    achievements: state.achievements
                }
            };

            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/world/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authData.token}`
                },
                body: JSON.stringify(saveData)
            });

            if (response.ok) {
                const result = await response.json();
                alert(`Game saved successfully: ${result.save_name}`);
            } else {
                throw new Error('Failed to save game');
            }
        } catch (error) {
            console.error('❌ Save error:', error);
            alert('Failed to save game. Please try again.');
        }
    },

    loadGame: async () => {
        try {
            const authData = JSON.parse(localStorage.getItem('authToken') || '{}');
            if (!authData.token) {
                alert('Please log in to load your game');
                return;
            }

            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/world/saves`, {
                headers: {
                    'Authorization': `Bearer ${authData.token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch saves');

            const { saves } = await response.json();
            if (saves.length === 0) {
                alert('No saved games found');
                return;
            }

            const mostRecentSave = saves[0];
            const loadResponse = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/world/load/${mostRecentSave.save_id}`, {
                headers: {
                    'Authorization': `Bearer ${authData.token}`
                }
            });

            if (!loadResponse.ok) throw new Error('Failed to load game');

            const saveData = await loadResponse.json();

            set((state) => ({
                worldBlocks: saveData.world_data?.blocks ? new Map(saveData.world_data.blocks) : state.worldBlocks,
                inventory: saveData.player_data?.inventory || state.inventory,
                playerStats: saveData.player_data?.stats || state.playerStats,
                gameMode: saveData.game_state?.gameMode || state.gameMode,
                selectedBlock: saveData.game_state?.selectedBlock || state.selectedBlock,
                activeSpell: saveData.game_state?.activeSpell || state.activeSpell,
                isDay: saveData.game_state?.isDay !== undefined ? saveData.game_state.isDay : state.isDay,
                gameTime: saveData.game_state?.gameTime || state.gameTime,
                achievements: saveData.game_state?.achievements || state.achievements
            }));

            alert(`Game loaded successfully: ${saveData.save_name}`);
        } catch (error) {
            console.error('❌ Load error:', error);
            alert('Failed to load game. Please try again.');
        }
    }
}));
