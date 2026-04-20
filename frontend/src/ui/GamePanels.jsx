import React from 'react';
import { GameMethods } from '../GameMethods';
import { useGameStore } from '../store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import { BLOCK_TYPES } from '../world/Blocks';

export const Inventory = ({ onClose }) => {
    const gameState = useGameStore(useShallow(state => ({
        inventory: state.inventory,
        removeFromInventory: state.removeFromInventory,
        setSelectedBlock: state.setSelectedBlock,
        selectedBlock: state.selectedBlock
    })));

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
            if (GameMethods.grantXP) GameMethods.grantXP(50, item);
        } else if (item.includes('Golden Crown')) {
            if (GameMethods.grantXP) GameMethods.grantXP(200, item);
        } else if (item.includes('Star Fragment')) {
            if (GameMethods.grantXP) GameMethods.grantXP(100, item);
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

export const CraftingTable = React.memo(({ onClose }) => {
    const gameState = useGameStore();
    const [grid, setGrid] = React.useState(Array(9).fill(null));
    const [result, setResult] = React.useState(null);
    const [craftMessage, setCraftMessage] = React.useState(null);

    const RECIPES = React.useMemo(() => [
        // Tools & Weapons
        {
            name: 'Stone Pickaxe',
            pattern: [['cobblestone', 'cobblestone', 'cobblestone'], [null, 'wood', null], [null, 'wood', null]],
            output: { pickaxe: 1 }
        },
        {
            name: 'Stone Sword',
            pattern: [[null, 'cobblestone', null], [null, 'cobblestone', null], [null, 'wood', null]],
            output: { sword: 1 }
        },
        {
            name: 'Iron Sword',
            pattern: [[null, '🗡️ Iron Nugget', null], [null, '🗡️ Iron Nugget', null], [null, 'wood', null]],
            output: { sword: 1 }
        },
        {
            name: 'Bow',
            pattern: [['wood', '🧵 String', null], ['wood', null, '🧵 String'], ['wood', '🧵 String', null]],
            output: { '🏹 Arrow': 5 }
        },
        {
            name: 'Torch',
            pattern: [['coal'], ['wood']],
            output: { torch: 4 }
        },
        // Materials
        {
            name: 'Glass',
            pattern: [['sand']],
            output: { glass: 1 }
        },
        {
            name: 'Planks',
            pattern: [['wood']],
            output: { planks: 4 }
        },
        {
            name: 'Magic Crystal',
            pattern: [['diamond', 'gold']],
            output: { crystals: 4 }
        }
    ], []);

    const normalizeGrid = (g) => {
        // Find boundaries
        let minX = 3, minY = 3, maxX = -1, maxY = -1;
        let hasItems = false;
        for (let i = 0; i < 9; i++) {
            if (g[i]) {
                const x = i % 3;
                const y = Math.floor(i / 3);
                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x);
                maxY = Math.max(maxY, y);
                hasItems = true;
            }
        }
        if (!hasItems) return null;

        // Extract sub-grid
        const rows = [];
        for (let y = minY; y <= maxY; y++) {
            const row = [];
            for (let x = minX; x <= maxX; x++) {
                row.push(g[y * 3 + x]);
            }
            rows.push(row);
        }
        return rows;
    };

    const gridsEqual = (g1, g2) => {
        if (!g1 || !g2) return false;
        if (g1.length !== g2.length) return false;
        for (let i = 0; i < g1.length; i++) {
            if (g1[i].length !== g2[i].length) return false;
            for (let j = 0; j < g1[i].length; j++) {
                if (g1[i][j] !== g2[i][j]) return false;
            }
        }
        return true;
    };

    React.useEffect(() => {
        const normalized = normalizeGrid(grid);
        if (!normalized) {
            setResult(null);
            return;
        }

        const match = RECIPES.find(r => gridsEqual(normalized, r.pattern));
        setResult(match || null);
    }, [grid, RECIPES]);

    const handleGridClick = (index) => {
        const newGrid = [...grid];
        if (newGrid[index]) {
            // Remove item and put back in inventory (simplification: just remove)
            gameState.addToInventory(newGrid[index], 1);
            newGrid[index] = null;
        } else if (gameState.selectedBlock && (gameState.inventory.blocks[gameState.selectedBlock] || 0) > 0) {
            newGrid[index] = gameState.selectedBlock;
            gameState.removeFromInventory(gameState.selectedBlock, 1);
        }
        setGrid(newGrid);
    };

    const doCraft = () => {
        if (!result) return;

        // Add result to inventory
        Object.entries(result.output).forEach(([item, count]) => {
            gameState.addToInventory(item, count);
        });

        setGrid(Array(9).fill(null));
        setResult(null);
        setCraftMessage({ type: 'success', text: `Crafted ${result.name}!` });
        setTimeout(() => setCraftMessage(null), 2000);

        if (GameMethods.grantXP) GameMethods.grantXP(10);
    };

    return (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
            <div className="game-panel p-8 text-white min-w-[600px] flex flex-col gap-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center">
                    <h2 className="text-3xl font-bold tracking-tight">🔨 Advanced Crafting</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-3xl">&times;</button>
                </div>

                <div className="flex flex-row justify-around items-center gap-12 py-4">
                    {/* 3x3 Grid */}
                    <div className="grid grid-cols-3 gap-2 p-2 bg-black/40 rounded-lg shadow-inner">
                        {grid.map((item, i) => {
                            const blockConfig = item ? BLOCK_TYPES[item] : null;
                            return (
                                <div
                                    key={i}
                                    onClick={() => handleGridClick(i)}
                                    className="w-16 h-16 bg-white/5 border-2 border-white/10 rounded flex items-center justify-center cursor-pointer hover:bg-white/10 transition-all relative overflow-hidden"
                                >
                                    {item ? (
                                        <div className="flex flex-col items-center">
                                            <div
                                                className="w-8 h-8 rounded shadow-lg flex items-center justify-center text-xl"
                                                style={{ backgroundColor: blockConfig?.color || '#333' }}
                                            >
                                                {item.match(/[\uE000-\uF8FF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF]/g) || ''}
                                            </div>
                                            <span className="text-[10px] opacity-60 mt-1 truncate w-14 text-center">
                                                {item.replace(/[\uE000-\uF8FF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF]/g, '').trim()}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="w-4 h-4 rounded-full border border-white/5" />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Arrow */}
                    <div className="text-4xl text-white/20 animate-pulse">→</div>

                    {/* Result Slot */}
                    <div className="flex flex-col items-center gap-4">
                        <div 
                            onClick={doCraft}
                            className={`w-24 h-24 rounded-lg border-4 transition-all flex items-center justify-center ${result ? 'border-green-500/50 bg-green-500/10 cursor-pointer hover:scale-105 shadow-[0_0_20px_rgba(34,197,94,0.3)]' : 'border-white/10 bg-white/5 cursor-not-allowed'}`}
                        >
                            {result ? (
                                <div className="text-center">
                                    <div className="text-3xl">✨</div>
                                    <div className="text-xs font-bold mt-1 text-green-400">
                                        {Object.values(result.output)[0]}x {result.name}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-gray-600 text-xs italic">Empty</div>
                            )}
                        </div>
                    </div>
                </div>

                {craftMessage && (
                    <div className="text-center p-2 bg-green-500/20 text-green-400 rounded-full text-sm font-bold border border-green-500/30 animate-bounce">
                        {craftMessage.text}
                    </div>
                )}

                {/* Quick Info */}
                <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Inventory Tip</h3>
                    <div className="text-sm text-gray-400 flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-blue-500/20 flex items-center justify-center text-blue-400 text-xs">i</div>
                        <span>Select an item in your hotbar, then click a slot to place it. Click placed items to remove them.</span>
                    </div>
                </div>

                <div className="text-center text-[10px] text-gray-600 uppercase tracking-widest">
                    Pattern Matcher v2.0 • Press C to close
                </div>
            </div>
        </div>
    );
});

const MagicSystem = ({ onClose }) => {
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

export const BuildingTools = React.memo(({ onClose }) => {
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
        useGameStore.setState({ buildingMode: selectedTool });
        useGameStore.setState({ buildSize: buildSize });
        useGameStore.setState({ selectedBuildBlock: gameState.selectedBlock });

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
});

export const SettingsPanel = React.memo(({ onClose, showStats, setShowStats }) => {
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
                <div className="mt-6 text-sm text-gray-400 text-center">
                    Press ESC to return to game
                </div>
                </div>
                </div>
                );
                });
