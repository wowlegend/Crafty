import React from 'react';
import { GameMethods } from '../../GameMethods';
import { useGameStore } from '../../store/useGameStore';
import { BLOCK_TYPES } from '../../world/Blocks';
import { useT } from '../../i18n/i18n.js';
import { Panel, Button, Slot, Icon, Modal } from '../primitives/index.js';
import { Grid } from 'lucide-react';
import { getItemRarity } from '../../data/items.js';
import { ItemIcon } from './itemUi';
import { RECIPES } from '../../data/recipes';

export const CraftingTable = React.memo(({ onClose }) => {
    const gameState = useGameStore();
    const t = useT();
    const [grid, setGrid] = React.useState(Array(9).fill(null));
    const [result, setResult] = React.useState(null);
    const [craftMessage, setCraftMessage] = React.useState(null);


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

        if (window.playCraft) window.playCraft(); // craft was silent (dead voice) -> a connected craft beat
        if (GameMethods.grantXP) GameMethods.grantXP(10);
    };

    return (
        <Modal className="absolute inset-0 bg-ink/75 grid place-items-center z-50 select-none animate-fade-in" label="Crafting" onClose={onClose}>
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
                                        title={item ? item : undefined}
                                    >
                                        <Slot className="w-16 h-16">
                                            {item ? (
                                                <div className="flex flex-col items-center justify-center gap-0.5">
                                                    <div
                                                        className="w-8 h-8 rounded-sm border-chrome border-ink"
                                                        style={{ backgroundColor: blockColor || 'rgb(var(--ui-slot))' }}
                                                    />
                                                    <span className="text-[9px] text-text-muted truncate w-14 text-center leading-tight">
                                                        {item}
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
                        <div className="text-accent"><Icon name="arrow-right" size={36} strokeWidth={3} /></div>

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
                                        title={type}
                                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md border-chrome transition-colors ${isSelected ? 'border-accent bg-slot' : 'border-ink bg-panel-inset hover:bg-slot'}`}
                                    >
                                        <div
                                            className="w-6 h-6 rounded-sm border-chrome border-ink"
                                            style={{ backgroundColor: blockColor || 'rgb(var(--ui-slot))' }}
                                        />
                                        <span className="text-xs text-text">{type}</span>
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
        </Modal>
    );
});
