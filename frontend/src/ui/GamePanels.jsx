import React, { useCallback } from 'react';
import { GameMethods } from '../GameMethods';
import { useGameStore, EQUIPMENT_STATS } from '../store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import { BLOCK_TYPES } from '../world/Blocks';

const getItemSlot = (itemName) => {
    if (!itemName) return null;
    if (['sword', 'pickaxe', 'Stone Sword', 'Iron Sword', 'Diamond Sword'].includes(itemName)) return 'weapon';
    if (['Wooden Shield', 'Iron Shield', 'Diamond Shield'].includes(itemName)) return 'offhand';
    if (['Golden Crown', 'Leather Helmet', 'Iron Helmet', 'Diamond Helmet'].includes(itemName)) return 'head';
    if (['Leather Chestplate', 'Iron Chestplate', 'Diamond Chestplate'].includes(itemName)) return 'chest';
    if (['Leather Boots', 'Iron Boots', 'Diamond Boots'].includes(itemName)) return 'boots';
    return null;
};

const getItemRarity = (itemName) => {
    if (!itemName) return 'common';
    if (itemName.includes('Diamond') || itemName === 'Golden Crown' || itemName === 'Star Fragment') return 'legendary';
    if (itemName.includes('Iron') || itemName === 'Mana Potion') return 'epic';
    if (itemName.includes('Stone') || itemName.includes('Leather') || itemName === 'Health Potion' || itemName === 'Cooked Porkchop' || itemName === 'Cooked Beef') return 'rare';
    return 'common';
};

const RARITY_COLORS = {
    common: { text: 'text-gray-400', border: 'border-gray-500/30', bg: 'bg-gray-500/10', glow: '' },
    rare: { text: 'text-blue-400', border: 'border-blue-500/30', bg: 'bg-blue-500/10', glow: 'shadow-[0_0_10px_rgba(59,130,246,0.15)]' },
    epic: { text: 'text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-500/10', glow: 'shadow-[0_0_15px_rgba(168,85,247,0.25)]' },
    legendary: { text: 'text-orange-400', border: 'border-orange-500/30', bg: 'bg-orange-500/10', glow: 'shadow-[0_0_20px_rgba(249,115,22,0.35)]' }
};

const getItemEmoji = (itemName) => {
    if (!itemName) return '';
    if (itemName === 'Golden Crown') return '👑';
    if (itemName.includes('Helmet')) return '🪖';
    if (itemName.includes('Chestplate')) return '👕';
    if (itemName.includes('Boots')) return '🥾';
    if (itemName.includes('Shield')) return '🛡️';
    if (itemName.includes('Sword')) return '🗡️';
    if (itemName === 'sword') return '🗡️';
    if (itemName === 'pickaxe') return '⛏️';
    if (itemName === 'Health Potion') return '❤️';
    if (itemName === 'Mana Potion') return '💧';
    if (itemName.includes('Porkchop') || itemName.includes('Beef')) return '🍖';
    if (itemName === 'Apple') return '🍎';
    if (itemName === 'Rotten Flesh') return '🧟';
    if (itemName === 'diamond') return '💎';
    if (itemName === 'gold') return '🪙';
    if (itemName === 'iron') return '⛓️';
    if (itemName === 'wood') return '🪵';
    if (itemName === 'cobblestone') return '🪨';
    if (itemName === 'sand') return '⏳';
    return '📦';
};

// Paper Doll Individual Slot Render Component
const PaperDollSlot = ({ slotName, label, placeholderEmoji, equippedItem, onUnequip, onHover }) => {
    const rarity = getItemRarity(equippedItem);
    const rarityStyle = RARITY_COLORS[rarity];

    return (
        <div 
            onClick={equippedItem ? onUnequip : undefined}
            onMouseEnter={equippedItem ? () => onHover(equippedItem) : undefined}
            onMouseLeave={equippedItem ? () => onHover(null) : undefined}
            className={`w-14 h-14 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-all duration-200 relative group select-none ${equippedItem ? `${rarityStyle.border} ${rarityStyle.bg} ${rarityStyle.glow} hover:border-red-500/50 hover:bg-red-950/20` : 'border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/20'}`}
        >
            {equippedItem ? (
                <>
                    <span className="text-2xl">{getItemEmoji(equippedItem)}</span>
                    <span className="text-[8px] opacity-70 text-gray-400 truncate max-w-[50px] uppercase font-bold text-center absolute bottom-1">
                        {equippedItem.replace('Sword', '').replace('Chestplate', '').replace('Helmet', '').replace('Shield', '').replace('Boots', '').trim()}
                    </span>
                    <div className="absolute inset-0 bg-red-600/10 border border-red-500/30 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <span className="text-[9px] text-red-400 font-bold uppercase tracking-wider">Remove</span>
                    </div>
                </>
            ) : (
                <>
                    <span className="text-xl opacity-30 group-hover:opacity-50">{placeholderEmoji}</span>
                    <span className="text-[7px] text-gray-500 font-bold uppercase mt-1 tracking-wider">{label}</span>
                </>
            )}
        </div>
    );
};

// Gear Inspector Component showing full stat compare details
const GearInspector = ({ itemName, equippedGear }) => {
    const stats = EQUIPMENT_STATS[itemName];
    const slot = getItemSlot(itemName);
    const rarity = getItemRarity(itemName);
    const rarityStyle = RARITY_COLORS[rarity];

    if (!stats) {
        // Fallback for blocks/consumables
        const isFood = ['Cooked Porkchop', 'Cooked Beef', 'Apple'].includes(itemName);
        const isPotion = itemName.includes('Potion');
        let desc = 'Standard building voxel or crafting element.';
        if (isFood) desc = 'Consumable: Feeds and heals champion.';
        if (isPotion) desc = 'Consumable: Restores Health or Mana.';
        
        return (
            <div className="p-3 text-center">
                <div className="text-3xl mb-1">{getItemEmoji(itemName)}</div>
                <div className="font-bold text-sm text-gray-200 truncate">{itemName}</div>
                <div className="text-[10px] text-gray-400 font-medium capitalize mt-0.5">{getItemRarity(itemName)} Item</div>
                <div className="text-[10px] text-gray-500 italic mt-2 border-t border-white/5 pt-2">{desc}</div>
            </div>
        );
    }

    // Comparison with equipped item in the same slot
    const activeEquippedName = equippedGear[slot];
    const activeStats = activeEquippedName ? EQUIPMENT_STATS[activeEquippedName] : null;

    const renderStatDiff = (key, val) => {
        const activeVal = activeStats ? (activeStats[key] || 0) : 0;
        const diff = val - activeVal;
        
        if (diff === 0) return <span className="text-gray-400">({val})</span>;
        if (diff > 0) return <span className="text-green-400 font-bold">+{val} (+{diff} 🔺)</span>;
        return <span className="text-red-400 font-bold">+{val} ({diff} 🔻)</span>;
    };

    return (
        <div className="p-3 flex flex-col gap-2 bg-black/40 border border-white/10 rounded-xl select-none">
            {/* Header info */}
            <div className="text-center pb-2 border-b border-white/10">
                <div className="text-4xl mb-1">{getItemEmoji(itemName)}</div>
                <div className="font-bold text-sm text-gray-100 truncate">{itemName}</div>
                <div className={`text-[9px] uppercase tracking-widest font-bold ${rarityStyle.text}`}>{rarity} {slot}</div>
            </div>

            {/* Attributes List */}
            <div className="space-y-1 mt-1 text-xs">
                {stats.strength !== undefined && (
                    <div className="flex justify-between">
                        <span className="text-gray-400">🎒 Strength:</span>
                        <span>{renderStatDiff('strength', stats.strength)}</span>
                    </div>
                )}
                {stats.agility !== undefined && (
                    <div className="flex justify-between">
                        <span className="text-gray-400">👟 Agility:</span>
                        <span>{renderStatDiff('agility', stats.agility)}</span>
                    </div>
                )}
                {stats.intellect !== undefined && (
                    <div className="flex justify-between">
                        <span className="text-gray-400">🔮 Intellect:</span>
                        <span>{renderStatDiff('intellect', stats.intellect)}</span>
                    </div>
                )}
                {stats.armor !== undefined && (
                    <div className="flex justify-between">
                        <span className="text-gray-400">🛡️ Armor Rating:</span>
                        <span>{renderStatDiff('armor', stats.armor)}</span>
                    </div>
                )}
            </div>

            {/* Compare Gear warning */}
            {activeEquippedName && activeEquippedName !== itemName && (
                <div className="text-[8px] text-gray-500 text-center italic border-t border-white/5 pt-1.5 mt-1">
                    Compared against equipped: <span className="font-semibold">{activeEquippedName}</span>
                </div>
            )}
        </div>
    );
};

export const Inventory = ({ onClose }) => {
    const gameState = useGameStore(useShallow(state => ({
        inventory: state.inventory,
        removeFromInventory: state.removeFromInventory,
        setSelectedBlock: state.setSelectedBlock,
        selectedBlock: state.selectedBlock,
        equipment: state.equipment || { head: null, chest: null, boots: null, weapon: null, offhand: null },
        equipItem: state.equipItem,
        unequipItem: state.unequipItem,
        attributes: state.attributes,
        getEffectiveAttributes: state.getEffectiveAttributes,
        getPlayerLevel: state.getPlayerLevel
    })));

    const [hoveredItem, setHoveredItem] = React.useState(null);

    const isConsumable = (item) => {
        if (!item) return false;
        return ['Health Potion', 'Mana Potion', 'Cooked Porkchop', 'Cooked Beef', 'Apple', 'Raw Porkchop', 'Raw Beef', 'Rotten Flesh', 'Diamond', 'Golden Crown', 'Star Fragment'].some(c => item.includes(c));
    };

    const handleConsume = (e, item) => {
        e.stopPropagation();
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
        } else if (item.includes('Mana Potion')) {
            if (window.addMana) window.addMana(40);
        } else if (item.includes('Diamond')) {
            if (GameMethods.grantXP) GameMethods.grantXP(50, item);
        } else if (item.includes('Golden Crown')) {
            if (GameMethods.grantXP) GameMethods.grantXP(200, item);
        } else if (item.includes('Star Fragment')) {
            if (GameMethods.grantXP) GameMethods.grantXP(100, item);
        }
        gameState.removeFromInventory(item, 1);
    };

    const handleEquip = (itemName) => {
        const slot = getItemSlot(itemName);
        if (slot && gameState.equipItem) {
            gameState.equipItem(slot, itemName);
        }
    };

    const handleUnequip = (slot) => {
        if (gameState.unequipItem) {
            gameState.unequipItem(slot);
        }
    };

    // Calculate dynamic stats sheets
    const effective = gameState.getEffectiveAttributes ? gameState.getEffectiveAttributes() : { strength: 10, agility: 10, intellect: 10, armor: 0 };
    const playerLevel = gameState.getPlayerLevel ? gameState.getPlayerLevel() : 1;
    
    // Weapon base damage
    const equippedWeapon = gameState.equipment?.weapon;
    let baseWeaponDmg = 5;
    if (equippedWeapon === 'Stone Sword') baseWeaponDmg = 12;
    else if (equippedWeapon === 'Iron Sword') baseWeaponDmg = 20;
    else if (equippedWeapon === 'Diamond Sword') baseWeaponDmg = 35;
    else if (equippedWeapon === 'pickaxe') baseWeaponDmg = 8;
    else if (equippedWeapon === 'sword') baseWeaponDmg = 10;

    const meleeDmg = Math.round(baseWeaponDmg + effective.strength * 1.5);
    const critChance = Math.min(75, Math.round((0.05 + effective.agility * 0.005) * 100));
    const armorMitigation = Math.round((effective.armor / (effective.armor + 100)) * 100);
    const spellDmgMultiplier = 1.0 + (effective.intellect * 0.02);
    const spellDmg = Math.round(20 * spellDmgMultiplier);
    const speedBonus = Math.round(effective.agility * 2);

    return (
        <div className="absolute inset-0 bg-black/75 flex items-center justify-center z-50 select-none animate-fade-in" onClick={onClose}>
            <div 
                className="game-panel p-6 text-white max-w-4xl w-[850px] bg-black/85 border border-white/10 rounded-2xl shadow-2xl backdrop-blur-md flex flex-col gap-4 relative overflow-hidden" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center border-b border-white/10 pb-3">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl">🛡️</span>
                        <div>
                            <h2 className="text-xl font-bold tracking-tight">Character Equipment & Bag</h2>
                            <div className="text-xs text-yellow-400 font-semibold uppercase tracking-wider">Level {playerLevel} Champion</div>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors text-2xl font-bold">&times;</button>
                </div>

                {/* 3-Column Interface */}
                <div className="grid grid-cols-12 gap-4 h-[420px]">
                    {/* Column 1: Equipment Paper-Doll Slots & Base Attributes */}
                    <div className="col-span-4 bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col justify-between overflow-y-auto">
                        <div>
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 text-center">Gear Slots</h3>
                            <div className="flex flex-col gap-2 items-center">
                                {/* Head Slot */}
                                <PaperDollSlot 
                                    slotName="head" 
                                    label="Head" 
                                    placeholderEmoji="🪖"
                                    equippedItem={gameState.equipment?.head} 
                                    onUnequip={() => handleUnequip('head')}
                                    onHover={setHoveredItem}
                                />
                                <div className="flex gap-2 w-full justify-center">
                                    {/* Weapon Slot */}
                                    <PaperDollSlot 
                                        slotName="weapon" 
                                        label="Main-Hand" 
                                        placeholderEmoji="🗡️"
                                        equippedItem={gameState.equipment?.weapon} 
                                        onUnequip={() => handleUnequip('weapon')}
                                        onHover={setHoveredItem}
                                    />
                                    {/* Chest Slot */}
                                    <PaperDollSlot 
                                        slotName="chest" 
                                        label="Chest" 
                                        placeholderEmoji="👕"
                                        equippedItem={gameState.equipment?.chest} 
                                        onUnequip={() => handleUnequip('chest')}
                                        onHover={setHoveredItem}
                                    />
                                    {/* Off-Hand Slot */}
                                    <PaperDollSlot 
                                        slotName="offhand" 
                                        label="Off-Hand" 
                                        placeholderEmoji="🛡️"
                                        equippedItem={gameState.equipment?.offhand} 
                                        onUnequip={() => handleUnequip('offhand')}
                                        onHover={setHoveredItem}
                                    />
                                </div>
                                {/* Boots Slot */}
                                <PaperDollSlot 
                                    slotName="boots" 
                                    label="Boots" 
                                    placeholderEmoji="🥾"
                                    equippedItem={gameState.equipment?.boots} 
                                    onUnequip={() => handleUnequip('boots')}
                                    onHover={setHoveredItem}
                                />
                            </div>
                        </div>

                        {/* Attribute Breakdown */}
                        <div className="border-t border-white/10 pt-2 mt-2">
                            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Core Attributes</h4>
                            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                                <div className="flex justify-between"><span className="text-gray-400">Strength:</span> <span className="font-bold text-red-400">{effective.strength}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">Agility:</span> <span className="font-bold text-green-400">{effective.agility}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">Intellect:</span> <span className="font-bold text-blue-400">{effective.intellect}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">Armor:</span> <span className="font-bold text-amber-400">{effective.armor}</span></div>
                            </div>
                        </div>
                    </div>

                    {/* Column 2: Live Inspect Card & RPG Stats breakdown */}
                    <div className="col-span-4 bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col justify-between overflow-hidden">
                        {/* Selected Gear Stats Inspector */}
                        <div className="flex-1 flex flex-col justify-center">
                            {hoveredItem ? (
                                <GearInspector itemName={hoveredItem} equippedGear={gameState.equipment} />
                            ) : (
                                <div className="text-center p-4">
                                    <div className="text-4xl opacity-20 mb-2">👁️</div>
                                    <div className="text-xs text-gray-500 font-semibold">Hover over any item or equipment slot to inspect gear stats</div>
                                </div>
                            )}
                        </div>

                        {/* Dynamic Combat Stats Panel */}
                        <div className="border-t border-white/10 pt-2">
                            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Combat Stats Solver</h4>
                            <div className="space-y-1 text-xs">
                                <div className="flex justify-between"><span className="text-gray-400">⚔️ Physical Hit:</span> <span className="font-bold text-orange-400">{meleeDmg} DMG</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">💥 Crit Strike:</span> <span className="font-bold text-orange-300">{critChance}% Chance</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">🛡️ Mitigate Damage:</span> <span className="font-bold text-amber-400">-{armorMitigation}% (DR)</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">🔮 Spell Power:</span> <span className="font-bold text-blue-300">{spellDmg} Spell DMG</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">👟 Move Velocity:</span> <span className="font-bold text-emerald-400">+{speedBonus}% Speed</span></div>
                            </div>
                        </div>
                    </div>

                    {/* Column 3: Grid inventory bags */}
                    <div className="col-span-4 bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col justify-between overflow-hidden">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Inventory Bag</h3>
                            <span className="text-[10px] text-gray-500 font-bold uppercase">{Object.values(gameState.inventory.blocks).filter(v => v > 0).length} Slots Used</span>
                        </div>
                        
                        {/* Grid list scroll */}
                        <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-1.5 pr-1 max-h-[350px]">
                            {Object.entries(gameState.inventory.blocks).map(([type, count]) => {
                                if (count <= 0) return null;
                                const isEquip = getItemSlot(type) !== null;
                                const blockConfig = BLOCK_TYPES[type];
                                const rarity = getItemRarity(type);
                                const rarityStyle = RARITY_COLORS[rarity];

                                return (
                                    <div
                                        key={type}
                                        onMouseEnter={() => setHoveredItem(type)}
                                        onMouseLeave={() => setHoveredItem(null)}
                                        onClick={() => {
                                            if (isEquip) {
                                                handleEquip(type);
                                            } else {
                                                gameState.setSelectedBlock(type);
                                                onClose();
                                            }
                                        }}
                                        className={`game-panel-item p-1.5 cursor-pointer relative group flex flex-col justify-between border rounded transition-all duration-200 aspect-square ${rarityStyle.border} ${rarityStyle.bg} ${rarityStyle.glow} hover:scale-105 hover:border-white/40`}
                                    >
                                        {/* Emoji & Block swatch */}
                                        <div className="flex-1 flex items-center justify-center">
                                            <div
                                                className="w-7 h-7 rounded flex items-center justify-center text-base shadow"
                                                style={{ backgroundColor: blockConfig?.color || '#333' }}
                                            >
                                                {getItemEmoji(type)}
                                            </div>
                                        </div>
                                        
                                        {/* Dynamic item name & amount overlay */}
                                        <div className="flex justify-between items-center text-[9px] w-full mt-1 bg-black/40 px-0.5 rounded">
                                            <span className="truncate max-w-[40px] text-gray-300 font-medium" title={type}>
                                                {type.replace(/[\uE000-\uF8FF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF]/g, '').replace('Sword', 'Sw.').replace('Chestplate', 'Ch.').replace('Helmet', 'Hl.').replace('Shield', 'Sh.').replace('Boots', 'Bt.')}
                                            </span>
                                            <span className="text-gray-400 font-bold">x{count}</span>
                                        </div>

                                        {/* Consumable "Use" overlay button */}
                                        {isConsumable(type) && (
                                            <div className="absolute top-0.5 right-0.5 hidden group-hover:block z-10">
                                                <button
                                                    onClick={(e) => handleConsume(e, type)}
                                                    className="bg-green-600 hover:bg-green-500 text-white text-[8px] px-1 py-0.5 rounded shadow-lg border border-green-400/30"
                                                >
                                                    Use
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer Tip */}
                <div className="text-[10px] text-gray-500 uppercase tracking-widest text-center border-t border-white/5 pt-2">
                    Press E to close bag • Click gear to equip • Hover items to inspect details • Click equipped gear to unequip
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
        // Swords & Weapons
        {
            name: 'Stone Sword',
            pattern: [[null, 'cobblestone', null], [null, 'cobblestone', null], [null, 'wood', null]],
            output: { 'Stone Sword': 1 }
        },
        {
            name: 'Iron Sword',
            pattern: [[null, 'iron', null], [null, 'iron', null], [null, 'wood', null]],
            output: { 'Iron Sword': 1 }
        },
        {
            name: 'Iron Sword (Nuggets)',
            pattern: [[null, '🗡️ Iron Nugget', null], [null, '🗡️ Iron Nugget', null], [null, 'wood', null]],
            output: { 'Iron Sword': 1 }
        },
        {
            name: 'Diamond Sword',
            pattern: [[null, 'diamond', null], [null, 'diamond', null], [null, 'wood', null]],
            output: { 'Diamond Sword': 1 }
        },
        // Shields
        {
            name: 'Wooden Shield',
            pattern: [['wood', 'wood', 'wood'], ['wood', 'wood', 'wood'], [null, 'wood', null]],
            output: { 'Wooden Shield': 1 }
        },
        {
            name: 'Iron Shield',
            pattern: [['iron', 'iron', 'iron'], ['iron', 'iron', 'iron'], [null, 'iron', null]],
            output: { 'Iron Shield': 1 }
        },
        {
            name: 'Diamond Shield',
            pattern: [['diamond', 'diamond', 'diamond'], ['diamond', 'diamond', 'diamond'], [null, 'diamond', null]],
            output: { 'Diamond Shield': 1 }
        },
        // Helmets
        {
            name: 'Leather Helmet',
            pattern: [['🧶 Leather', '🧶 Leather', '🧶 Leather'], ['🧶 Leather', null, '🧶 Leather']],
            output: { 'Leather Helmet': 1 }
        },
        {
            name: 'Iron Helmet',
            pattern: [['iron', 'iron', 'iron'], ['iron', null, 'iron']],
            output: { 'Iron Helmet': 1 }
        },
        {
            name: 'Diamond Helmet',
            pattern: [['diamond', 'diamond', 'diamond'], ['diamond', null, 'diamond']],
            output: { 'Diamond Helmet': 1 }
        },
        {
            name: 'Golden Crown',
            pattern: [['gold', 'gold', 'gold'], ['gold', null, 'gold']],
            output: { 'Golden Crown': 1 }
        },
        // Chestplates
        {
            name: 'Leather Chestplate',
            pattern: [['🧶 Leather', null, '🧶 Leather'], ['🧶 Leather', '🧶 Leather', '🧶 Leather'], ['🧶 Leather', '🧶 Leather', '🧶 Leather']],
            output: { 'Leather Chestplate': 1 }
        },
        {
            name: 'Iron Chestplate',
            pattern: [['iron', null, 'iron'], ['iron', 'iron', 'iron'], ['iron', 'iron', 'iron']],
            output: { 'Iron Chestplate': 1 }
        },
        {
            name: 'Diamond Chestplate',
            pattern: [['diamond', null, 'diamond'], ['diamond', 'diamond', 'diamond'], ['diamond', 'diamond', 'diamond']],
            output: { 'Diamond Chestplate': 1 }
        },
        // Boots
        {
            name: 'Leather Boots',
            pattern: [['🧶 Leather', null, '🧶 Leather'], ['🧶 Leather', null, '🧶 Leather']],
            output: { 'Leather Boots': 1 }
        },
        {
            name: 'Iron Boots',
            pattern: [['iron', null, 'iron'], ['iron', null, 'iron']],
            output: { 'Iron Boots': 1 }
        },
        {
            name: 'Diamond Boots',
            pattern: [['diamond', null, 'diamond'], ['diamond', null, 'diamond']],
            output: { 'Diamond Boots': 1 }
        },
        // Tools & Materials
        {
            name: 'Stone Pickaxe',
            pattern: [['cobblestone', 'cobblestone', 'cobblestone'], [null, 'wood', null], [null, 'wood', null]],
            output: { pickaxe: 1 }
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

                {/* Mini Inventory for Selection */}
                <div className="mt-4 border-t border-white/10 pt-4">
                    <h3 className="text-sm font-bold text-gray-400 mb-2">Select Item to Craft With</h3>
                    <div className="flex flex-wrap gap-2 max-h-[150px] overflow-y-auto pr-2">
                        {Object.entries(gameState.inventory?.blocks || {}).map(([type, count]) => {
                            if (count <= 0) return null;
                            const blockConfig = BLOCK_TYPES[type];
                            return (
                                <div
                                    key={type}
                                    onClick={() => gameState.setSelectedBlock(type)}
                                    className={`p-2 rounded cursor-pointer border ${gameState.selectedBlock === type ? 'border-blue-400 bg-blue-500/20' : 'border-white/10 bg-white/5 hover:bg-white/10'} flex items-center gap-2`}
                                >
                                    <div
                                        className="w-6 h-6 rounded flex items-center justify-center text-sm"
                                        style={{ backgroundColor: blockConfig?.color || '#333' }}
                                    >
                                        {type.match(/[\uE000-\uF8FF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF]/g) || ''}
                                    </div>
                                    <span className="text-xs">{type.replace(/[\uE000-\uF8FF]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF]/g, '').trim()}</span>
                                    <span className="text-[10px] text-gray-400">x{count}</span>
                                </div>
                            );
                        })}
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

export const SettingsPanel = React.memo(({ onClose, showStats, setShowStats, onOpenWorldManager }) => {
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
                    {onOpenWorldManager && (
                        <button
                            onClick={onOpenWorldManager}
                            className="w-full bg-purple-600 hover:bg-purple-500 py-2 rounded font-medium mb-2 flex items-center justify-center gap-2 transition-colors duration-200"
                        >
                            <span>🗺️</span> Manage Worlds
                        </button>
                    )}
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
