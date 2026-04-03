import React from 'react';
import { useGameStore } from '../store/useGameStore';
import { BLOCK_TYPES } from '../world/Blocks';

export const Inventory = ({ onClose }) => {
    const gameState = useGameStore();

    const isConsumable = (item) => {
        if (!item) return false;
        return ['Health Potion', 'Mana Potion', 'Cooked Porkchop', 'Cooked Beef', 'Apple', 'Raw Porkchop', 'Raw Beef', 'Rotten Flesh', 'Diamond', 'Golden Crown', 'Star Fragment'].some(c => item.includes(c));
    };

    const handleConsume = (e, item) => {
        e.stopPropagation();

        // Healing Items
        if (item.includes('Health Potion')) {
            if (useGameStore.getState().healPlayer) useGameStore.getState().healPlayer(30);
        } else if (item.includes('Cooked')) {
            if (useGameStore.getState().feedPlayer) useGameStore.getState().feedPlayer(40);
            if (useGameStore.getState().healPlayer) useGameStore.getState().healPlayer(10);
        } else if (item.includes('Apple')) {
            if (useGameStore.getState().feedPlayer) useGameStore.getState().feedPlayer(20);
            if (useGameStore.getState().healPlayer) useGameStore.getState().healPlayer(5);
        } else if (item.includes('Raw')) {
            if (useGameStore.getState().feedPlayer) useGameStore.getState().feedPlayer(15);
        } else if (item.includes('Rotten Flesh')) {
            if (useGameStore.getState().feedPlayer) useGameStore.getState().feedPlayer(10);
            // Maybe add a poison effect later
        }
        // Mana Items
        else if (item.includes('Mana Potion')) {
            // Re-use healPlayer with a special mana hook if available, or just ignore since we don't have mana refill
            if (window.addMana) window.addMana(40);
        }
        // XP Items
        else if (item.includes('Diamond')) {
            if (window.addExperience) window.addExperience(50, item);
        } else if (item.includes('Golden Crown')) {
            if (window.addExperience) window.addExperience(200, item);
        } else if (item.includes('Star Fragment')) {
            if (window.addExperience) window.addExperience(100, item);
        }

        gameState.removeFromInventory(item, 1);
    };

    return (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
            <div className="game-panel p-6 text-white min-w-[400px] max-w-[600px]" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">📦 Inventory</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>
                <div className="grid grid-cols-6 gap-2">
                    {Object.entries(gameState.inventory.blocks).map(([type, count]) => {
                        if (count <= 0) return null;
                        const blockConfig = BLOCK_TYPES[type];
                        return (
                            <div
                                key={type}
                                onClick={() => { gameState.setSelectedBlock(type); onClose(); }}
                                className={`game-panel-item p-3 cursor-pointer relative group ${gameState.selectedBlock === type ? 'selected' : ''}`}
                                title={blockConfig?.name || type}
                            >
                                <div
                                    className="w-8 h-8 mx-auto rounded flex items-center justify-center text-xl"
                                    style={{ backgroundColor: blockConfig?.color || '#333' }}
                                >
                                    {/* Expose emojis if they are embedded in the item string */}
                                    {type.match(/[\uE000-\uF8FF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF]/g) || ''}
                                </div>
                                <div className="text-[10px] text-center mt-1 truncate max-w-[80px]" title={type}>
                                    {type.replace(/[\uE000-\uF8FF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF]/g, '').trim()}
                                </div>
                                <div className="text-xs text-center text-gray-400">{count}</div>

                                {isConsumable(type) && (
                                    <div className="absolute top-1 right-1 hidden group-hover:block z-10">
                                        <button
                                            onClick={(e) => handleConsume(e, type)}
                                            className="bg-green-600 hover:bg-green-500 text-white text-[10px] px-2 py-1 rounded shadow"
                                        >
                                            Use
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                <div className="mt-4 text-sm text-gray-500">
                    Press E to close • Click item to equip to hotbar • Hover consumable to Use
                </div>
            </div>
        </div>
    );
};

export const CraftingTable = ({ onClose }) => {
    const gameState = useGameStore();
    const [craftMessage, setCraftMessage] = React.useState(null);

    const recipes = [
        // Tools & Weapons
        { name: 'Stone Pickaxe', category: 'Tools', input: { cobblestone: 3, wood: 2 }, output: { pickaxe: 1 } },
        { name: 'Stone Sword', category: 'Tools', input: { cobblestone: 2, wood: 1 }, output: { sword: 1 } },
        { name: 'Iron Sword', category: 'Tools', input: { '🗡️ Iron Nugget': 4, wood: 1 }, output: { sword: 1 } },
        { name: 'Bow', category: 'Tools', input: { '🧵 String': 3, wood: 3 }, output: { '🏹 Arrow': 5 } },
        { name: 'Torch', category: 'Tools', input: { coal: 1, wood: 1 }, output: { torch: 4 } },

        // Materials
        { name: 'Glass', category: 'Materials', input: { sand: 1 }, output: { glass: 1 } },
        { name: 'Cobblestone', category: 'Materials', input: { stone: 1 }, output: { cobblestone: 1 } },
        { name: 'Planks', category: 'Materials', input: { wood: 1 }, output: { planks: 4 } },
        { name: 'Bone Meal', category: 'Materials', input: { '🦴 Bone': 1 }, output: { 'Bone Meal': 3 } },

        // Magic Items
        { name: 'Magic Crystal', category: 'Magic', input: { diamond: 1, gold: 1 }, output: { crystals: 4 } },
        { name: 'Spell Scroll', category: 'Magic', input: { crystals: 2, wood: 1 }, output: { scrolls: 1 } },
        { name: 'Enchanted Wand', category: 'Magic', input: { crystals: 4, gold: 2, wood: 1 }, output: { wand: 1 } },
        { name: 'Ender Staff', category: 'Magic', input: { '💜 Ender Pearl': 1, crystals: 2 }, output: { wand: 1 } },
        { name: 'Mana Potion', category: 'Magic', input: { '🕸️ Spider Eye': 1, water: 1 }, output: { '💙 Mana Potion': 1 } },

        // Food
        { name: 'Cooked Porkchop', category: 'Food', input: { '🥩 Raw Porkchop': 1, coal: 1 }, output: { '🍖 Cooked Porkchop': 1 } },
        { name: 'Cooked Beef', category: 'Food', input: { '🥩 Raw Beef': 1, coal: 1 }, output: { '🍖 Cooked Beef': 1 } },
    ];

    const canCraft = (recipe) => {
        return Object.entries(recipe.input).every(([item, count]) =>
            (gameState.inventory?.blocks?.[item] || 0) >= count
        );
    };

    const doCraft = (recipe) => {
        if (!canCraft(recipe)) {
            setCraftMessage({ type: 'error', text: 'Not enough materials!' });
            setTimeout(() => setCraftMessage(null), 2000);
            return;
        }

        // Remove input items
        Object.entries(recipe.input).forEach(([item, count]) => {
            gameState.removeFromInventory(item, count);
        });

        // Add output items
        Object.entries(recipe.output).forEach(([item, count]) => {
            gameState.addToInventory(item, count);
        });

        setCraftMessage({ type: 'success', text: `Crafted ${recipe.name}!` });
        setTimeout(() => setCraftMessage(null), 2000);

        // Grant XP for crafting
        if (window.grantXP) window.grantXP(5);
    };

    const categories = [...new Set(recipes.map(r => r.category))];

    return (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
            <div className="game-panel p-6 text-white min-w-[450px] max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">🔨 Crafting Table</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>

                {craftMessage && (
                    <div className={`mb-4 p-2 rounded text-center ${craftMessage.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
                        {craftMessage.text}
                    </div>
                )}

                {categories.map(category => (
                    <div key={category} className="mb-4">
                        <h3 className="text-lg font-semibold text-gray-300 mb-2">{category}</h3>
                        <div className="space-y-2">
                            {recipes.filter(r => r.category === category).map((recipe, i) => {
                                const craftable = canCraft(recipe);
                                return (
                                    <div key={i} className={`game-panel-item p-3 flex items-center justify-between ${!craftable && 'opacity-60'}`}>
                                        <div>
                                            <div className="font-medium">{recipe.name}</div>
                                            <div className="text-xs text-gray-400">
                                                {Object.entries(recipe.input).map(([item, count]) => {
                                                    const have = gameState.inventory?.blocks?.[item] || 0;
                                                    return (
                                                        <span key={item} className={have >= count ? 'text-green-400' : 'text-red-400'}>
                                                            {count}x {item} ({have})
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                            <div className="text-xs text-yellow-400">
                                                → {Object.entries(recipe.output).map(([item, count]) => `${count}x ${item}`).join(', ')}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => doCraft(recipe)}
                                            disabled={!craftable}
                                            className={`px-3 py-1 rounded text-sm ${craftable ? 'bg-green-600 hover:bg-green-500' : 'bg-gray-600 cursor-not-allowed'}`}
                                        >
                                            Craft
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                <div className="mt-4 text-sm text-gray-400">
                    Press C to close
                </div>
            </div>
        </div>
    );
};

export const MagicSystem = ({ onClose }) => {
    const gameState = useGameStore();
    const spells = [
        { name: 'Fireball', key: '1', color: '#FF4500', damage: 50, mana: 15, description: 'Launches a fiery projectile that burns on impact' },
        { name: 'Iceball', key: '2', color: '#00BFFF', damage: 40, mana: 12, description: 'Freezes and slows enemies on impact' },
        { name: 'Lightning', key: '3', color: '#FFD700', damage: 75, mana: 25, description: 'Fast electric strike that chains to nearby enemies' },
        { name: 'Arcane', key: '4', color: '#9932CC', damage: 60, mana: 18, description: 'Mystical blast that pierces through enemies' },
    ];

    return (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
            <div className="game-panel p-6 text-white min-w-[400px]" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">✨ Magic Spells</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>
                <div className="space-y-3">
                    {spells.map((spell, i) => (
                        <div key={i} className="game-panel-item p-3 flex items-center gap-4">
                            <div
                                className="w-12 h-12 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: spell.color }}
                            >
                                <span className="text-xl">🔮</span>
                            </div>
                            <div className="flex-1">
                                <div className="font-medium">{spell.name}</div>
                                <div className="text-xs text-gray-400">{spell.description}</div>
                                <div className="flex gap-3 text-xs mt-1">
                                    <span className="text-yellow-400">⚔️ {spell.damage} DMG</span>
                                    <span className="text-blue-400">💧 {spell.mana} MP</span>
                                </div>
                            </div>
                            <div className="text-gray-500">
                                Press {spell.key}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-4 text-sm text-gray-400">
                    Press M to close • Click or F to cast selected spell
                </div>
            </div>
        </div>
    );
};

export const BuildingTools = ({ onClose }) => {
    const gameState = useGameStore();
    const [selectedTool, setSelectedTool] = React.useState('single');
    const [buildSize, setBuildSize] = React.useState(3);

    const tools = [
        { id: 'single', name: 'Single Block', icon: '🧱', description: 'Place one block at a time', hotkey: '1' },
        { id: 'wall', name: 'Wall Builder', icon: '🏗️', description: `Build ${buildSize}-high walls`, hotkey: '2' },
        { id: 'floor', name: 'Floor Builder', icon: '📐', description: `Create ${buildSize}x${buildSize} floors`, hotkey: '3' },
        { id: 'cube', name: 'Cube Builder', icon: '📦', description: `Build ${buildSize}x${buildSize}x${buildSize} cubes`, hotkey: '4' },
        { id: 'delete', name: 'Delete Tool', icon: '🗑️', description: 'Remove multiple blocks', hotkey: '5' },
    ];

    // Set global building mode
    React.useEffect(() => {
        window.buildingMode = selectedTool;
        window.buildSize = buildSize;
        window.selectedBuildBlock = gameState.selectedBlock;

    }, [selectedTool, buildSize, gameState.selectedBlock]);

    return (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
            <div className="game-panel p-6 text-white min-w-[450px]" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">🏠 Building Tools</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>

                {/* Size Slider */}
                <div className="mb-4 bg-gray-700 p-3 rounded">
                    <div className="flex justify-between items-center mb-2">
                        <span>Build Size</span>
                        <span className="font-bold text-yellow-400">{buildSize}</span>
                    </div>
                    <input
                        type="range"
                        min="1"
                        max="10"
                        value={buildSize}
                        onChange={(e) => setBuildSize(parseInt(e.target.value))}
                        className="w-full accent-yellow-500"
                    />
                </div>

                {/* Tool Selection */}
                <div className="grid grid-cols-2 gap-3">
                    {tools.map((tool) => (
                        <div
                            key={tool.id}
                            onClick={() => setSelectedTool(tool.id)}
                            className={`game-panel-item p-3 cursor-pointer ${selectedTool === tool.id ? 'selected' : ''}`}
                        >
                            <div className="flex items-center gap-2">
                                <div className="text-3xl">{tool.icon}</div>
                                <div>
                                    <div className="font-medium">{tool.name}</div>
                                    <div className="text-xs text-gray-400">{tool.description}</div>
                                </div>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">Press {tool.hotkey}</div>
                        </div>
                    ))}
                </div>

                {/* Selected Block Preview */}
                <div className="mt-4 bg-gray-700 p-3 rounded flex items-center gap-3">
                    <div
                        className="w-10 h-10 rounded"
                        style={{ backgroundColor: BLOCK_TYPES[gameState.selectedBlock]?.color || '#567C35' }}
                    />
                    <div>
                        <div className="text-sm text-gray-400">Selected Block</div>
                        <div className="font-medium">{BLOCK_TYPES[gameState.selectedBlock]?.name || gameState.selectedBlock}</div>
                    </div>
                </div>

                <div className="mt-4 text-sm text-gray-400">
                    Press B to close • Right-click to build • Left-click to remove
                </div>
            </div>
        </div>
    );
};

export const SettingsPanel = ({ onClose, showStats, setShowStats }) => {
    const gameState = useGameStore();
    return (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
            <div className="game-panel p-6 text-white min-w-[350px]" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold">⚙️ Settings</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <span>Show Stats (F3)</span>
                        <button
                            onClick={() => setShowStats(!showStats)}
                            className={`px-4 py-1 rounded ${showStats ? 'bg-green-600' : 'bg-gray-600'}`}
                        >
                            {showStats ? 'ON' : 'OFF'}
                        </button>
                    </div>
                    <div className="flex items-center justify-between">
                        <span>Game Mode</span>
                        <button
                            onClick={() => gameState.setGameMode(gameState.gameMode === 'creative' ? 'survival' : 'creative')}
                            className="px-4 py-1 rounded bg-purple-600 hover:bg-purple-500"
                        >
                            {gameState.gameMode}
                        </button>
                    </div>
                    <div className="flex items-center justify-between">
                        <span>Time</span>
                        <button
                            onClick={() => gameState.setIsDay(!gameState.isDay)}
                            className="px-4 py-1 rounded bg-blue-600 hover:bg-blue-500"
                        >
                            {gameState.isDay ? '☀️ Day' : '🌙 Night'}
                        </button>
                    </div>
                    <hr className="border-gray-600" />
                    <button
                        onClick={onClose}
                        className="w-full bg-green-600 hover:bg-green-500 py-2 rounded font-medium"
                    >
                        Resume Game
                    </button>
                </div>
                <div className="mt-4 text-sm text-gray-400 text-center">
                    Press ESC to close
                </div>
            </div>
        </div>
    );
};
