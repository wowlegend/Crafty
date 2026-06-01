import React, { useCallback } from 'react';
import { GameMethods } from '../GameMethods';
import { useGameStore, EQUIPMENT_STATS } from '../store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import { BLOCK_TYPES } from '../world/Blocks';
import { useT } from '../i18n/i18n.js';
import { Panel, Button, Slot, Icon, SpellRing } from './primitives/index.js';
import { Grid, Square, Layers, Grid3x3, Box, Trash2, Map as MapIcon, Sun, Moon } from 'lucide-react';

// Paper-doll avatar voxel-body colors (CHARACTER ART, not chrome — mirrors the
// PrimitivesShowcase inventory comp / mockup .ava). Inline hex is intentional here:
// these are sprite colors, not design-system chrome.
const AVA = {
    head: '#E8C07A',  // skin
    torso: '#6E4A30', // tunic
    belt: '#3A2A1E',
    leg: '#2F4F7E',   // trousers
    arm: '#5A3C26',
    eye: '#1B2740',
};

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

// Rarity tier (from getItemRarity) → bold-flat token text color (for the inspector
// rarity label). The TILE rarity fill is handled by the <Slot rarity> primitive.
const RARITY_TEXT = {
    common: 'text-rarity-common',
    rare: 'text-rarity-rare',
    epic: 'text-rarity-epic',
    legendary: 'text-rarity-legendary',
};

// Item name → Icon primitive name (the locked bold-flat game-icon set). Returns null
// when nothing maps, so the caller can fall back to a color swatch (never crash).
const getItemIcon = (itemName) => {
    if (!itemName) return null;
    if (itemName === 'Golden Crown') return 'helmet';
    if (itemName.includes('Helmet')) return 'helmet';
    if (itemName.includes('Chestplate')) return 'chest';
    if (itemName.includes('Boots')) return 'boots';
    if (itemName.includes('Shield')) return 'shield';
    if (itemName.includes('Sword')) return 'sword';
    if (itemName === 'sword') return 'sword';
    if (itemName === 'pickaxe') return 'pickaxe';
    if (itemName === 'Health Potion' || itemName === 'Mana Potion' || itemName.includes('Potion')) return 'potion';
    if (itemName.includes('Porkchop') || itemName.includes('Beef')) return 'meat';
    if (itemName === 'Apple') return 'apple';
    if (itemName === 'diamond') return 'gem';
    if (itemName === 'Star Fragment') return 'gem';
    if (itemName === 'gold') return 'coins';
    if (itemName === 'Scroll' || itemName.includes('Scroll')) return 'scroll';
    if (itemName === 'Bow' || itemName.includes('Bow')) return 'bow';
    if (itemName === 'Dagger' || itemName.includes('Dagger')) return 'dagger';
    if (itemName === 'Mace' || itemName.includes('Mace')) return 'mace';
    return null;
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

// Renders a 2-tone game Icon for an item; if no icon maps, falls back to a small
// color swatch (block color when known, else neutral) carrying the emoji — never
// crashes on an unmapped item. `size` is the Icon px size.
const ItemIcon = ({ itemName, size = 42 }) => {
    const icon = getItemIcon(itemName);
    if (icon) return <Icon name={icon} size={size} />;
    const swatch = Math.round(size * 0.62);
    const blockColor = BLOCK_TYPES[itemName]?.color;
    return (
        <div
            className="rounded-sm grid place-items-center border-chrome border-ink"
            style={{ width: swatch, height: swatch, backgroundColor: blockColor || 'rgb(var(--ui-slot))', fontSize: Math.round(swatch * 0.55) }}
            title={itemName}
        >
            {getItemEmoji(itemName)}
        </div>
    );
};

// Paper-doll gear cell — bold-flat. Equipped → a gold `Slot gear` with the 2-tone
// item Icon + a Remove hover overlay; empty → an empty `Slot` with the placeholder
// Icon + label. Preserves onUnequip (click) + onHover (hover-inspect).
const PaperDollSlot = ({ slotName, label, placeholderIcon, equippedItem, onUnequip, onHover }) => {
    const t = useT();
    if (equippedItem) {
        return (
            <div
                onClick={onUnequip}
                onMouseEnter={() => onHover(equippedItem)}
                onMouseLeave={() => onHover(null)}
                className="relative group cursor-pointer select-none w-14 h-14"
            >
                <Slot gear className="w-full h-full">
                    <ItemIcon itemName={equippedItem} size={30} />
                </Slot>
                {/* Remove (unequip) hover overlay */}
                <div className="absolute inset-0 grid place-items-center rounded-md bg-danger/25 border-chrome border-danger opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] text-text font-bold uppercase tracking-wider">{t('ui.unequip')}</span>
                </div>
            </div>
        );
    }
    return (
        <Slot className="w-14 h-14 group">
            <div className="flex flex-col items-center justify-center gap-0.5 text-text-muted opacity-50 group-hover:opacity-80 transition-opacity">
                <Icon name={placeholderIcon} size={20} />
                <span className="text-[7px] font-bold uppercase tracking-wider">{label}</span>
            </div>
        </Slot>
    );
};

// Gear Inspector — bold-flat hover-inspect card. Shows the item's 2-tone Icon,
// name, rarity+slot label, and (for gear) the per-stat diff vs. the currently
// equipped item in the same slot. Renders inside an `inset` Panel.
const GearInspector = ({ itemName, equippedGear }) => {
    const stats = EQUIPMENT_STATS[itemName];
    const slot = getItemSlot(itemName);
    const rarity = getItemRarity(itemName);
    const rarityText = RARITY_TEXT[rarity];

    if (!stats) {
        // Fallback for blocks/consumables
        const isFood = ['Cooked Porkchop', 'Cooked Beef', 'Apple'].includes(itemName);
        const isPotion = itemName.includes('Potion');
        let desc = 'Standard building voxel or crafting element.';
        if (isFood) desc = 'Consumable: Feeds and heals champion.';
        if (isPotion) desc = 'Consumable: Restores Health or Mana.';

        return (
            <Panel variant="inset" className="p-3 text-center select-none">
                <div className="grid place-items-center mb-1"><ItemIcon itemName={itemName} size={36} /></div>
                <div className="font-bold text-sm text-text truncate">{itemName}</div>
                <div className={`text-[10px] font-bold capitalize mt-0.5 ${rarityText}`}>{rarity} Item</div>
                <div className="text-[10px] text-text-muted italic mt-2 border-t-chrome border-ink pt-2">{desc}</div>
            </Panel>
        );
    }

    // Comparison with equipped item in the same slot
    const activeEquippedName = equippedGear[slot];
    const activeStats = activeEquippedName ? EQUIPMENT_STATS[activeEquippedName] : null;

    const renderStatDiff = (key, val) => {
        const activeVal = activeStats ? (activeStats[key] || 0) : 0;
        const diff = val - activeVal;

        if (diff === 0) return <span className="text-text-muted">({val})</span>;
        if (diff > 0) return <span className="text-success font-bold">+{val} (+{diff} ▲)</span>;
        return <span className="text-danger font-bold">+{val} ({diff} ▼)</span>;
    };

    return (
        <Panel variant="inset" className="p-3 flex flex-col gap-2 select-none">
            {/* Header info */}
            <div className="text-center pb-2 border-b-chrome border-ink">
                <div className="grid place-items-center mb-1"><ItemIcon itemName={itemName} size={42} /></div>
                <div className="font-bold text-sm text-text truncate">{itemName}</div>
                <div className={`text-[9px] uppercase tracking-widest font-bold ${rarityText}`}>{rarity} {slot}</div>
            </div>

            {/* Attributes List */}
            <div className="space-y-1 mt-1 text-xs">
                {stats.strength !== undefined && (
                    <div className="flex justify-between">
                        <span className="text-text-muted flex items-center gap-1"><Icon name="sword" size={14} className="text-stat-atk" /> Strength:</span>
                        <span className="tabular-nums">{renderStatDiff('strength', stats.strength)}</span>
                    </div>
                )}
                {stats.agility !== undefined && (
                    <div className="flex justify-between">
                        <span className="text-text-muted flex items-center gap-1"><Icon name="run" size={14} className="text-stat-spd" /> Agility:</span>
                        <span className="tabular-nums">{renderStatDiff('agility', stats.agility)}</span>
                    </div>
                )}
                {stats.intellect !== undefined && (
                    <div className="flex justify-between">
                        <span className="text-text-muted flex items-center gap-1"><Icon name="magic" size={14} className="text-spell-arcane" /> Intellect:</span>
                        <span className="tabular-nums">{renderStatDiff('intellect', stats.intellect)}</span>
                    </div>
                )}
                {stats.armor !== undefined && (
                    <div className="flex justify-between">
                        <span className="text-text-muted flex items-center gap-1"><Icon name="shield" size={14} className="text-stat-def" /> Armor:</span>
                        <span className="tabular-nums">{renderStatDiff('armor', stats.armor)}</span>
                    </div>
                )}
            </div>

            {/* Compare Gear warning */}
            {activeEquippedName && activeEquippedName !== itemName && (
                <div className="text-[8px] text-text-muted text-center italic border-t-chrome border-ink pt-1.5 mt-1">
                    Compared against equipped: <span className="font-semibold text-text">{activeEquippedName}</span>
                </div>
            )}
        </Panel>
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
    const t = useT();

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

    const slotsUsed = Object.values(gameState.inventory.blocks).filter(v => v > 0).length;

    return (
        <div data-testid="inventory-modal" className="absolute inset-0 bg-ink/75 grid place-items-center z-50 select-none animate-fade-in" onClick={onClose}>
            <Panel
                variant="raise"
                className="w-[884px] max-w-[95vw] overflow-hidden shadow-elev-xl p-0"
                onClick={e => e.stopPropagation()}
            >
                {/* Header bar */}
                <div className="flex items-center justify-between px-5 py-4 bg-panel-raise border-b-chrome border-ink">
                    <div className="flex items-baseline gap-3">
                        <span className="font-display text-xxl tracking-wide">{t('ui.inventory')}</span>
                        <span className="text-xs font-bold tracking-[2px] uppercase text-accent">{t('ui.backpack')} · {t('ui.level_short')} {playerLevel}</span>
                    </div>
                    <Button variant="ghost" size="sm" aria-label={t('ui.close')} onClick={onClose} className="w-9 h-9 p-0 text-text-muted">
                        <Icon name="close" size={18} />
                    </Button>
                </div>

                {/* Body — 3 columns: paper doll · live inspect + combat · item grid */}
                <div className="grid grid-cols-3 gap-4 px-5 pt-5 pb-5 h-[440px]">
                    {/* ── Column 1: paper-doll well + gear slots + core attributes ── */}
                    <div className="flex flex-col gap-3 overflow-y-auto">
                        {/* Avatar well */}
                        <Panel variant="inset" className="relative h-[160px] bg-well grid place-items-center overflow-hidden flex-none">
                            <div className="relative w-24 h-[150px] scale-90">
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[46px] h-[46px] rounded-md" style={{ background: AVA.head }}>
                                    <div className="absolute top-5 left-3.5 w-[7px] h-[9px] rounded-sm" style={{ background: AVA.eye }} />
                                    <div className="absolute top-5 right-3.5 w-[7px] h-[9px] rounded-sm" style={{ background: AVA.eye }} />
                                </div>
                                <div className="absolute top-[54px] left-1.5 w-[18px] h-12 rounded-md" style={{ background: AVA.arm }} />
                                <div className="absolute top-[54px] right-1.5 w-[18px] h-12 rounded-md" style={{ background: AVA.arm }} />
                                <div className="absolute top-12 left-1/2 -translate-x-1/2 w-[60px] h-16 rounded-md" style={{ background: AVA.torso }} />
                                <div className="absolute top-[104px] left-1/2 -translate-x-1/2 w-[62px] h-3" style={{ background: AVA.belt }} />
                                <div className="absolute top-[116px] left-[18px] w-6 h-[34px] rounded-md" style={{ background: AVA.leg }} />
                                <div className="absolute top-[116px] right-[18px] w-6 h-[34px] rounded-md" style={{ background: AVA.leg }} />
                            </div>
                        </Panel>

                        {/* Gear slots */}
                        <div>
                            <h3 className="font-display text-xs font-bold text-text-muted uppercase tracking-[2px] mb-2 text-center">Gear Slots</h3>
                            <div className="flex flex-col gap-2 items-center">
                                {/* Head Slot */}
                                <PaperDollSlot
                                    slotName="head"
                                    label="Head"
                                    placeholderIcon="helmet"
                                    equippedItem={gameState.equipment?.head}
                                    onUnequip={() => handleUnequip('head')}
                                    onHover={setHoveredItem}
                                />
                                <div className="flex gap-2 w-full justify-center">
                                    {/* Weapon Slot */}
                                    <PaperDollSlot
                                        slotName="weapon"
                                        label="Main"
                                        placeholderIcon="sword"
                                        equippedItem={gameState.equipment?.weapon}
                                        onUnequip={() => handleUnequip('weapon')}
                                        onHover={setHoveredItem}
                                    />
                                    {/* Chest Slot */}
                                    <PaperDollSlot
                                        slotName="chest"
                                        label="Chest"
                                        placeholderIcon="chest"
                                        equippedItem={gameState.equipment?.chest}
                                        onUnequip={() => handleUnequip('chest')}
                                        onHover={setHoveredItem}
                                    />
                                    {/* Off-Hand Slot */}
                                    <PaperDollSlot
                                        slotName="offhand"
                                        label="Off"
                                        placeholderIcon="shield"
                                        equippedItem={gameState.equipment?.offhand}
                                        onUnequip={() => handleUnequip('offhand')}
                                        onHover={setHoveredItem}
                                    />
                                </div>
                                {/* Boots Slot */}
                                <PaperDollSlot
                                    slotName="boots"
                                    label="Boots"
                                    placeholderIcon="boots"
                                    equippedItem={gameState.equipment?.boots}
                                    onUnequip={() => handleUnequip('boots')}
                                    onHover={setHoveredItem}
                                />
                            </div>
                        </div>

                        {/* Core attributes */}
                        <Panel variant="base" className="bg-slot px-3 py-2 mt-auto">
                            <h4 className="font-display text-[10px] font-bold text-accent uppercase tracking-[2px] mb-1.5">Core Attributes</h4>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                                <div className="flex items-center gap-1.5"><Icon name="sword" size={14} className="text-stat-atk flex-none" /><span className="flex-1 text-text-muted">Str</span><span className="font-bold tabular-nums">{effective.strength}</span></div>
                                <div className="flex items-center gap-1.5"><Icon name="run" size={14} className="text-stat-spd flex-none" /><span className="flex-1 text-text-muted">Agi</span><span className="font-bold tabular-nums">{effective.agility}</span></div>
                                <div className="flex items-center gap-1.5"><Icon name="magic" size={14} className="text-spell-arcane flex-none" /><span className="flex-1 text-text-muted">Int</span><span className="font-bold tabular-nums">{effective.intellect}</span></div>
                                <div className="flex items-center gap-1.5"><Icon name="shield" size={14} className="text-stat-def flex-none" /><span className="flex-1 text-text-muted">Def</span><span className="font-bold tabular-nums">{effective.armor}</span></div>
                            </div>
                        </Panel>
                    </div>

                    {/* ── Column 2: live inspect card + combat stats ── */}
                    <div className="flex flex-col gap-3 overflow-hidden">
                        {/* Live inspect */}
                        <div className="flex-1 flex flex-col justify-center min-h-0 overflow-y-auto">
                            {hoveredItem ? (
                                <GearInspector itemName={hoveredItem} equippedGear={gameState.equipment} />
                            ) : (
                                <Panel variant="inset" className="text-center p-4">
                                    <div className="grid place-items-center mb-2 text-text-muted opacity-40"><Icon name="upgrade" size={32} /></div>
                                    <div className="text-xs text-text-muted font-semibold">Hover any item or equipment slot to inspect gear stats</div>
                                </Panel>
                            )}
                        </div>

                        {/* Combat stats */}
                        <Panel variant="base" className="bg-slot px-4 py-3 flex-none">
                            <h4 className="font-display text-[10px] font-bold text-accent uppercase tracking-[2px] mb-2">Combat Stats</h4>
                            <div className="space-y-1.5 text-xs">
                                <div className="flex items-center gap-2"><Icon name="sword" size={16} className="text-stat-atk flex-none" /><span className="flex-1 text-text-muted">Physical Hit</span><span className="font-bold tabular-nums">{meleeDmg} DMG</span></div>
                                <div className="flex items-center gap-2"><Icon name="force" size={16} className="text-stat-crit flex-none" /><span className="flex-1 text-text-muted">Crit Strike</span><span className="font-bold tabular-nums">{critChance}%</span></div>
                                <div className="flex items-center gap-2"><Icon name="shield" size={16} className="text-stat-def flex-none" /><span className="flex-1 text-text-muted">Mitigation</span><span className="font-bold tabular-nums">-{armorMitigation}%</span></div>
                                <div className="flex items-center gap-2"><Icon name="magic" size={16} className="text-spell-arcane flex-none" /><span className="flex-1 text-text-muted">Spell Power</span><span className="font-bold tabular-nums">{spellDmg} DMG</span></div>
                                <div className="flex items-center gap-2"><Icon name="run" size={16} className="text-stat-spd flex-none" /><span className="flex-1 text-text-muted">Move Velocity</span><span className="font-bold tabular-nums">+{speedBonus}%</span></div>
                            </div>
                        </Panel>
                    </div>

                    {/* ── Column 3: item bag grid ── */}
                    <div className="flex flex-col overflow-hidden">
                        <div className="font-display text-sm font-bold tracking-[2px] uppercase text-text-muted mb-2.5 flex items-baseline justify-between">
                            <span>{t('ui.items')}</span>
                            <span className="tabular-nums text-accent text-xs">{slotsUsed} Slots</span>
                        </div>

                        {/* Grid scroll */}
                        <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-2 pr-1 content-start">
                            {Object.entries(gameState.inventory.blocks).map(([type, count]) => {
                                if (count <= 0) return null;
                                const isEquip = getItemSlot(type) !== null;
                                const rarity = getItemRarity(type);

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
                                        className="relative group cursor-pointer"
                                        title={type}
                                    >
                                        <Slot rarity={rarity} className="w-full">
                                            <ItemIcon itemName={type} size={34} />
                                            {/* Quantity badge */}
                                            {count > 1 && (
                                                <span className="absolute bottom-1 right-1.5 text-[12px] font-bold text-text tabular-nums" style={{ textShadow: '0 1px 2px #000' }}>
                                                    {count}
                                                </span>
                                            )}
                                        </Slot>

                                        {/* Consumable "Use" overlay button */}
                                        {isConsumable(type) && (
                                            <div className="absolute top-0.5 right-0.5 hidden group-hover:block z-10">
                                                <Button
                                                    variant="primary"
                                                    size="sm"
                                                    onClick={(e) => handleConsume(e, type)}
                                                    className="text-[8px] px-1.5 py-0.5 leading-none"
                                                >
                                                    Use
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Equip CTA — equips the hovered/inspected gear item (mirrors showcase) */}
                        <Button
                            variant="primary"
                            size="lg"
                            disabled={!hoveredItem || getItemSlot(hoveredItem) === null}
                            onClick={() => hoveredItem && handleEquip(hoveredItem)}
                            className="w-full h-[48px] gap-2 mt-3 flex-none"
                        >
                            <Icon name="upgrade" size={20} />
                            {t('ui.equip')}
                        </Button>
                    </div>
                </div>

                {/* Footer Tip */}
                <div className="text-[10px] text-text-muted uppercase tracking-widest text-center border-t-chrome border-ink px-5 py-2 bg-panel-inset">
                    Press E to close • Click gear to equip • Hover to inspect • Click equipped gear to unequip
                </div>
            </Panel>
        </div>
    );
};

export const CraftingTable = React.memo(({ onClose }) => {
    const gameState = useGameStore();
    const t = useT();
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

    // Strip private-use + emoji glyphs from a block/item key so the cell shows a
    // clean text label alongside the color swatch (mirrors the old extraction).
    const EMOJI_RE = /[-]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDDFF]/g;
    const cleanName = (s) => (s || '').replace(EMOJI_RE, '').trim();

    return (
        <div className="absolute inset-0 bg-ink/75 grid place-items-center z-50 select-none animate-fade-in" onClick={onClose}>
            <Panel
                variant="raise"
                className="w-[640px] max-w-[95vw] overflow-hidden shadow-elev-xl p-0"
                onClick={e => e.stopPropagation()}
            >
                {/* Header bar */}
                <div className="flex items-center justify-between px-5 py-4 bg-panel-raise border-b-chrome border-ink">
                    <div className="flex items-center gap-3">
                        <Icon name="pickaxe" size={26} className="text-accent" />
                        <span className="font-display text-xxl tracking-wide">{t('ui.craft')}</span>
                        <span className="text-xs font-bold tracking-[2px] uppercase text-accent">Pattern Matcher</span>
                    </div>
                    <Button variant="ghost" size="sm" aria-label={t('ui.close')} onClick={onClose} className="w-9 h-9 p-0 text-text-muted">
                        <Icon name="close" size={18} />
                    </Button>
                </div>

                {/* Body */}
                <div className="flex flex-col gap-5 px-5 pt-5 pb-5">
                    {/* Craft bench: 3x3 grid, arrow, result */}
                    <div className="flex flex-row justify-around items-center gap-8">
                        {/* 3x3 Grid */}
                        <Panel variant="inset" className="grid grid-cols-3 gap-2 p-3 bg-well">
                            {grid.map((item, i) => {
                                const blockColor = item ? BLOCK_TYPES[item]?.color : null;
                                return (
                                    <div
                                        key={i}
                                        onClick={() => handleGridClick(i)}
                                        className="cursor-pointer"
                                        title={item ? cleanName(item) : undefined}
                                    >
                                        <Slot className="w-16 h-16">
                                            {item ? (
                                                <div className="flex flex-col items-center justify-center gap-0.5">
                                                    <div
                                                        className="w-8 h-8 rounded-sm grid place-items-center text-xl border-chrome border-ink"
                                                        style={{ backgroundColor: blockColor || 'rgb(var(--ui-slot))' }}
                                                    >
                                                        {item.match(EMOJI_RE) || ''}
                                                    </div>
                                                    <span className="text-[9px] text-text-muted truncate w-14 text-center leading-tight">
                                                        {cleanName(item)}
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="w-3.5 h-3.5 rounded-full border-chrome border-ink opacity-30" />
                                            )}
                                        </Slot>
                                    </div>
                                );
                            })}
                        </Panel>

                        {/* Arrow */}
                        <div className="font-display text-4xl text-accent">{'→'}</div>

                        {/* Result Slot */}
                        <div className="flex flex-col items-center gap-2">
                            <div
                                onClick={doCraft}
                                className={result ? 'cursor-pointer transition-transform hover:scale-105' : 'cursor-not-allowed'}
                                title={result ? `${Object.values(result.output)[0]} ${result.name}` : undefined}
                            >
                                <Slot rarity={result ? getItemRarity(result.name) : undefined} className="w-24 h-24">
                                    {result ? (
                                        <div className="flex flex-col items-center justify-center gap-1 px-1">
                                            <ItemIcon itemName={result.name} size={36} />
                                            <span className="text-[10px] font-bold text-center text-text leading-tight">
                                                {Object.values(result.output)[0]}{'×'} {result.name}
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-text-muted text-xs italic">Empty</span>
                                    )}
                                </Slot>
                            </div>
                        </div>
                    </div>

                    {/* Mini Inventory for Selection */}
                    <div className="border-t-chrome border-ink pt-4">
                        <h3 className="font-display text-sm font-bold tracking-[2px] uppercase text-text-muted mb-2.5">Select Item to Craft With</h3>
                        <div className="flex flex-wrap gap-2 max-h-[150px] overflow-y-auto pr-1">
                            {Object.entries(gameState.inventory?.blocks || {}).map(([type, count]) => {
                                if (count <= 0) return null;
                                const blockColor = BLOCK_TYPES[type]?.color;
                                const isSelected = gameState.selectedBlock === type;
                                return (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => gameState.setSelectedBlock(type)}
                                        title={cleanName(type)}
                                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md border-chrome transition-colors ${isSelected ? 'border-accent bg-slot' : 'border-ink bg-panel-inset hover:bg-slot'}`}
                                    >
                                        <div
                                            className="w-6 h-6 rounded-sm grid place-items-center text-sm border-chrome border-ink"
                                            style={{ backgroundColor: blockColor || 'rgb(var(--ui-slot))' }}
                                        >
                                            {type.match(EMOJI_RE) || ''}
                                        </div>
                                        <span className="text-xs text-text">{cleanName(type)}</span>
                                        <span className="text-[10px] text-text-muted tabular-nums">{'×'}{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {craftMessage && (
                        <div className="text-center px-3 py-2 rounded-md font-bold text-sm bg-slot text-success border-chrome border-success animate-fade-in">
                            {craftMessage.text}
                        </div>
                    )}

                    {/* Quick Info */}
                    <Panel variant="base" className="bg-slot px-4 py-3">
                        <h3 className="font-display text-[10px] font-bold text-accent uppercase tracking-[2px] mb-2">Inventory Tip</h3>
                        <div className="text-sm text-text-muted flex items-center gap-2">
                            <span className="w-6 h-6 flex-none rounded-sm grid place-items-center text-accent text-xs font-bold border-chrome border-ink bg-panel-inset">i</span>
                            <span>Select an item in your hotbar, then click a slot to place it. Click placed items to remove them.</span>
                        </div>
                    </Panel>
                </div>

                {/* Footer Tip */}
                <div className="text-[10px] text-text-muted uppercase tracking-widest text-center border-t-chrome border-ink px-5 py-2 bg-panel-inset">
                    Pattern Matcher v2.0 {'•'} Press C to close
                </div>
            </Panel>
        </div>
    );
});

const MagicSystem = ({ onClose }) => {
    const gameState = useGameStore();
    const t = useT();
    // `spell` keys the bold-flat SpellRing comp (color via --ui-spell-<spell>); `icon`
    // keys the 2-tone game-icon. Each ring's color IS the spell's MAGIC color.
    const spells = [
        { name: 'Fireball', spell: 'fire', icon: 'fire', key: '1', damage: 50, mana: 15, description: 'Launches a fiery projectile that burns on impact' },
        { name: 'Iceball', spell: 'ice', icon: 'ice', key: '2', damage: 40, mana: 12, description: 'Freezes and slows enemies on impact' },
        { name: 'Lightning', spell: 'lightning', icon: 'lightning', key: '3', damage: 75, mana: 25, description: 'Fast electric strike that chains to nearby enemies' },
        { name: 'Arcane', spell: 'arcane', icon: 'magic', key: '4', damage: 60, mana: 18, description: 'Mystical blast that pierces through enemies' },
    ];

    return (
        <div className="absolute inset-0 bg-ink/75 grid place-items-center z-50 select-none animate-fade-in" onClick={onClose}>
            <Panel
                variant="raise"
                className="w-[440px] max-w-[95vw] overflow-hidden shadow-elev-xl p-0"
                onClick={e => e.stopPropagation()}
            >
                {/* Header bar */}
                <div className="flex items-center justify-between px-5 py-4 bg-panel-raise border-b-chrome border-ink">
                    <div className="flex items-center gap-3">
                        <Icon name="magic" size={26} className="text-spell-arcane" />
                        <span className="font-display text-xxl tracking-wide">Magic Spells</span>
                    </div>
                    <Button variant="ghost" size="sm" aria-label={t('ui.close')} onClick={onClose} className="w-9 h-9 p-0 text-text-muted">
                        <Icon name="close" size={18} />
                    </Button>
                </div>

                {/* Body — spell rows */}
                <div className="flex flex-col gap-3 px-5 pt-5 pb-5">
                    {spells.map((spell, i) => (
                        <Panel
                            key={i}
                            variant="inset"
                            className={`flex items-center gap-4 p-3 bg-slot text-spell-${spell.spell}`}
                        >
                            <SpellRing spell={spell.spell} keyLabel={spell.key} size={52} className="flex-none">
                                <Icon name={spell.icon} size={28} />
                            </SpellRing>
                            <div className="flex-1 min-w-0">
                                <div className="font-display font-bold tracking-wide text-text">{spell.name}</div>
                                <div className="text-xs text-text-muted leading-tight">{spell.description}</div>
                                <div className="flex gap-4 text-xs mt-1.5">
                                    <span className="flex items-center gap-1 text-stat-atk font-bold tabular-nums">
                                        <Icon name="sword" size={13} className="flex-none" />{spell.damage} DMG
                                    </span>
                                    <span className="flex items-center gap-1 text-spell-ice font-bold tabular-nums">
                                        <Icon name="mana" size={13} className="flex-none" />{spell.mana} MP
                                    </span>
                                </div>
                            </div>
                        </Panel>
                    ))}
                </div>

                {/* Footer Tip */}
                <div className="text-[10px] text-text-muted uppercase tracking-widest text-center border-t-chrome border-ink px-5 py-2 bg-panel-inset">
                    Press M to close • Click or F to cast selected spell
                </div>
            </Panel>
        </div>
    );
};

export const BuildingTools = React.memo(({ onClose }) => {
    const gameState = useGameStore();
    const [selectedTool, setSelectedTool] = React.useState('single');
    const [buildSize, setBuildSize] = React.useState(3);

    const t = useT();
    // ToolIcon = lucide chrome glyph per build mode (app-chrome, not game-icon content).
    const tools = [
        { id: 'single', name: 'Single Block', ToolIcon: Square, description: 'Place one block at a time', hotkey: '1' },
        { id: 'wall', name: 'Wall Builder', ToolIcon: Layers, description: `Build ${buildSize}-high walls`, hotkey: '2' },
        { id: 'floor', name: 'Floor Builder', ToolIcon: Grid3x3, description: `Create ${buildSize}x${buildSize} floors`, hotkey: '3' },
        { id: 'cube', name: 'Cube Builder', ToolIcon: Box, description: `Build ${buildSize}x${buildSize}x${buildSize} cubes`, hotkey: '4' },
        { id: 'delete', name: 'Delete Tool', ToolIcon: Trash2, description: 'Remove multiple blocks', hotkey: '5' },
    ];

    // Set global building mode
    React.useEffect(() => {
        useGameStore.setState({ buildingMode: selectedTool });
        useGameStore.setState({ buildSize: buildSize });
        useGameStore.setState({ selectedBuildBlock: gameState.selectedBlock });

    }, [selectedTool, buildSize, gameState.selectedBlock]);

    return (
        <div className="absolute inset-0 bg-ink/75 grid place-items-center z-50 select-none animate-fade-in" onClick={onClose}>
            <Panel
                variant="raise"
                className="w-[480px] max-w-[95vw] overflow-hidden shadow-elev-xl p-0"
                onClick={e => e.stopPropagation()}
            >
                {/* Header bar */}
                <div className="flex items-center justify-between px-5 py-4 bg-panel-raise border-b-chrome border-ink">
                    <div className="flex items-center gap-3">
                        <Grid width={26} height={26} strokeWidth={2.5} className="text-accent" aria-hidden />
                        <span className="font-display text-xxl tracking-wide">Building Tools</span>
                    </div>
                    <Button variant="ghost" size="sm" aria-label={t('ui.close')} onClick={onClose} className="w-9 h-9 p-0 text-text-muted">
                        <Icon name="close" size={18} />
                    </Button>
                </div>

                {/* Body */}
                <div className="flex flex-col gap-4 px-5 pt-5 pb-5">
                    {/* Size Slider */}
                    <Panel variant="inset" className="bg-slot p-3">
                        <div className="flex justify-between items-center mb-2">
                            <span className="font-display text-xs font-bold tracking-[2px] uppercase text-text-muted">Build Size</span>
                            <span className="font-display font-bold text-accent tabular-nums text-lg">{buildSize}</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="10"
                            value={buildSize}
                            onChange={(e) => setBuildSize(parseInt(e.target.value))}
                            className="w-full accent-[rgb(var(--ui-accent))]"
                        />
                    </Panel>

                    {/* Tool Selection */}
                    <div className="grid grid-cols-2 gap-3">
                        {tools.map((tool) => {
                            const isSelected = selectedTool === tool.id;
                            return (
                                <button
                                    key={tool.id}
                                    type="button"
                                    onClick={() => setSelectedTool(tool.id)}
                                    className={`text-left rounded-md border-chrome p-3 transition-colors ${isSelected ? 'border-accent bg-slot' : 'border-ink bg-panel-inset hover:bg-slot'}`}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <Slot selected={isSelected} className="w-11 h-11 flex-none">
                                            <tool.ToolIcon width={22} height={22} strokeWidth={2.5} className={isSelected ? 'text-accent' : 'text-text-muted'} aria-hidden />
                                        </Slot>
                                        <div className="min-w-0">
                                            <div className="font-display font-bold text-sm text-text leading-tight">{tool.name}</div>
                                            <div className="text-[11px] text-text-muted leading-tight">{tool.description}</div>
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-text-muted uppercase tracking-widest mt-1.5">Press {tool.hotkey}</div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Selected Block Preview */}
                    <Panel variant="inset" className="bg-slot p-3 flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-sm border-chrome border-ink flex-none"
                            style={{ backgroundColor: BLOCK_TYPES[gameState.selectedBlock]?.color || '#567C35' }}
                        />
                        <div>
                            <div className="font-display text-[10px] font-bold text-accent uppercase tracking-[2px]">Selected Block</div>
                            <div className="font-bold text-text">{BLOCK_TYPES[gameState.selectedBlock]?.name || gameState.selectedBlock}</div>
                        </div>
                    </Panel>
                </div>

                {/* Footer Tip */}
                <div className="text-[10px] text-text-muted uppercase tracking-widest text-center border-t-chrome border-ink px-5 py-2 bg-panel-inset">
                    Press B to close • Right-click to build • Left-click to remove
                </div>
            </Panel>
        </div>
    );
});

export const SettingsPanel = React.memo(({ onClose, showStats, setShowStats, onOpenWorldManager }) => {
    const gameState = useGameStore();
    const t = useT();
    return (
        <div className="absolute inset-0 bg-ink/75 grid place-items-center z-50 select-none animate-fade-in" onClick={onClose}>
            <Panel
                variant="raise"
                className="w-[380px] max-w-[95vw] overflow-hidden shadow-elev-xl p-0"
                onClick={e => e.stopPropagation()}
            >
                {/* Header bar */}
                <div className="flex items-center justify-between px-5 py-4 bg-panel-raise border-b-chrome border-ink">
                    <div className="flex items-center gap-3">
                        <Icon name="settings" size={26} className="text-accent" />
                        <span className="font-display text-xxl tracking-wide">{t('ui.settings')}</span>
                    </div>
                    <Button variant="ghost" size="sm" aria-label={t('ui.close')} onClick={onClose} className="w-9 h-9 p-0 text-text-muted">
                        <Icon name="close" size={18} />
                    </Button>
                </div>

                {/* Body */}
                <div className="flex flex-col gap-3 px-5 pt-5 pb-5">
                    {/* Show Stats toggle */}
                    <Panel variant="inset" className="bg-slot flex items-center justify-between px-3 py-2.5">
                        <span className="font-bold text-text">Show Stats (F3)</span>
                        <Button
                            variant={showStats ? 'primary' : 'secondary'}
                            size="sm"
                            onClick={() => setShowStats(!showStats)}
                            className="min-w-[64px]"
                        >
                            {showStats ? 'ON' : 'OFF'}
                        </Button>
                    </Panel>

                    {/* Game Mode toggle */}
                    <Panel variant="inset" className="bg-slot flex items-center justify-between px-3 py-2.5">
                        <span className="font-bold text-text">Game Mode</span>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => gameState.setGameMode(gameState.gameMode === 'creative' ? 'survival' : 'creative')}
                            className="min-w-[96px]"
                        >
                            {gameState.gameMode}
                        </Button>
                    </Panel>

                    {/* Time toggle */}
                    <Panel variant="inset" className="bg-slot flex items-center justify-between px-3 py-2.5">
                        <span className="font-bold text-text">Time</span>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => gameState.setIsDay(!gameState.isDay)}
                            className="min-w-[96px] gap-1.5"
                        >
                            {gameState.isDay
                                ? (<><Sun width={15} height={15} strokeWidth={2.5} aria-hidden /> Day</>)
                                : (<><Moon width={15} height={15} strokeWidth={2.5} aria-hidden /> Night</>)}
                        </Button>
                    </Panel>

                    <hr className="border-ink border-t-chrome my-1" />

                    {onOpenWorldManager && (
                        <Button
                            variant="secondary"
                            size="md"
                            onClick={onOpenWorldManager}
                            className="w-full gap-2"
                        >
                            <MapIcon width={18} height={18} strokeWidth={2.5} aria-hidden /> Manage Worlds
                        </Button>
                    )}
                    <Button
                        variant="primary"
                        size="md"
                        onClick={onClose}
                        className="w-full"
                    >
                        Resume Game
                    </Button>
                </div>

                {/* Footer Tip */}
                <div className="text-[10px] text-text-muted uppercase tracking-widest text-center border-t-chrome border-ink px-5 py-2 bg-panel-inset">
                    Press ESC to return to game
                </div>
            </Panel>
        </div>
    );
});
