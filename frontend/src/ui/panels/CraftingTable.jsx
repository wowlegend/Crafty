import React from 'react';
import { GameMethods } from '../../GameMethods';
import { useGameStore } from '../../store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import { useT } from '../../i18n/i18n.js';
import { Panel, Button, Slot, Icon, Modal } from '../primitives/index.js';
import { getItemRarity, getItemName } from '../../data/items.js';
import { ItemIcon } from './itemUi';
import { RECIPES } from '../../data/recipes';

import { matchRecipe } from '../../game/crafting';
import { returnGridToInventory } from '../../game/craftingGrid';

// A recipe's NAME is its title; its OUTPUT KEY is the item the inventory receives. They diverge -- and
// every identity the result slot draws (icon, rarity, toast) has to come from the key, not the title.
const outKey = (r) => Object.keys(r.output)[0];
const outCount = (r) => Object.values(r.output)[0];

export const CraftingTable = React.memo(({ onClose }) => {
    const gameState = useGameStore(useShallow(state => ({
        inventory: state.inventory,
        selectedBlock: state.selectedBlock,
        addToInventory: state.addToInventory,
        removeFromInventory: state.removeFromInventory,
        setSelectedBlock: state.setSelectedBlock,
    })));
    const t = useT();
    const [grid, setGrid] = React.useState(Array(9).fill(null));

    // B3d escrow-return: materials are debited from inventory the moment they are placed into the grid,
    // and the grid is React-LOCAL state that MenuSystem discards when it unmounts the panel on close. Keep
    // a ref to the latest grid (an empty-dep unmount effect otherwise closes over the initial empty grid),
    // and on teardown credit whatever is still escrowed back to inventory — else it is destroyed. doCraft
    // clears the grid before teardown, so a successful craft returns nothing (its inputs were consumed).
    const gridRef = React.useRef(grid);
    React.useEffect(() => { gridRef.current = grid; }, [grid]);
    // AND ON PAGE TEARDOWN. React does not run effect cleanups when the tab closes, while the autosave
    // DOES flush on pagehide -- and the place-time debit already went through removeFromInventory, which
    // spreads a new inventory object and therefore schedules a save. So a save written mid-crafting
    // recorded the debit WITHOUT the escrow: up to nine items paid for and gone, surfacing only when the
    // player later loads that slot. The B3d decision record chose "return on unmount" over "defer the
    // removal" on blast-radius grounds and never considered the persistence path, so this is an unclosed
    // residual rather than an accepted trade.
    React.useEffect(() => {
        const returnEscrow = () => {
            const g = gridRef.current;
            if (!g || !g.some(Boolean)) return;
            returnGridToInventory(g, useGameStore.getState().addToInventory);
            gridRef.current = Array(9).fill(null); // idempotent: pagehide can fire more than once
        };
        window.addEventListener('pagehide', returnEscrow);
        return () => window.removeEventListener('pagehide', returnEscrow);
    }, []);
    React.useEffect(() => () => {
        returnGridToInventory(gridRef.current, useGameStore.getState().addToInventory);
    }, []);
    const [result, setResult] = React.useState(null);
    const [craftMessage, setCraftMessage] = React.useState(null);


    // B3a: recipe matching lives in the pure, unit-tested seam `game/crafting.js`. It trims BOTH the player
    // grid AND each recipe pattern to their bounding box before comparing — the inline version here trimmed
    // only the player grid, so the null-bordered sword patterns ([null,X,null] middle columns) could never
    // match and the ENTIRE sword tree was uncraftable.
    React.useEffect(() => {
        setResult(matchRecipe(grid, RECIPES));
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
        // Name what the player RECEIVED. The recipe name and the output key are not the same string:
        // 'Stone Pickaxe' grants 'pickaxe', 'Iron Sword (Nuggets)' grants 'Iron Sword'. A toast built from
        // the recipe name is a claim about the inventory that the inventory does not have to honour.
        const [craftedKey, craftedCount] = Object.entries(result.output)[0];
        setCraftMessage({ type: 'success', text: `Crafted ${craftedCount}× ${getItemName(craftedKey)}!` });
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
                        <span className="text-xs font-bold tracking-[2px] uppercase text-accent">{t('panel.patternMatcher')}</span>
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
                                                    {/* ItemIcon, not a raw BLOCK_TYPES swatch. Every recipe token that
                                                        names an ITEM rather than a block -- iron_nugget, Iron Sword,
                                                        every tool -- has no BLOCK_TYPES entry, so `blockColor` was null
                                                        and the fallback painted the SAME generic square for all of
                                                        them: a grid of identical grey tiles the player has to read the
                                                        captions to tell apart. ItemIcon already falls back to the block
                                                        swatch for real blocks, so this is strictly more information. */}
                                                    <ItemIcon itemName={item} size={32} />
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
                                title={result ? `${outCount(result)}× ${getItemName(outKey(result))} — ${result.name}` : undefined}
                            >
                                {/* Rarity and icon come from the OUTPUT KEY, never the recipe name. The name is a
                                    recipe TITLE -- 'Stone Pickaxe', 'Iron Sword (Nuggets)' -- and looking an item up
                                    by it either hit the substring fallback ('Stone' -> rare) for an item the registry
                                    calls common, or resolved to nothing and drew a blank swatch for an item with a
                                    perfectly good icon. */}
                                <Slot rarity={result ? getItemRarity(outKey(result)) : undefined} className="w-24 h-24">
                                    {result ? (
                                        <div className="flex flex-col items-center justify-center gap-1 px-1">
                                            <ItemIcon itemName={outKey(result)} size={36} />
                                            <span className="text-[10px] font-bold text-center text-text leading-tight">
                                                {outCount(result)}{'×'} {result.name}
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
                        <h3 className="font-display text-sm font-bold tracking-[2px] uppercase text-text-muted mb-2.5">{t('panel.selectItemToCraft')}</h3>
                        <div className="flex flex-wrap gap-2 max-h-[150px] overflow-y-auto pr-1">
                            {Object.entries(gameState.inventory?.blocks || {}).map(([type, count]) => {
                                if (count <= 0) return null;
                                const isSelected = gameState.selectedBlock === type;
                                return (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => gameState.setSelectedBlock(type)}
                                        title={type}
                                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md border-chrome transition-colors ${isSelected ? 'border-accent bg-slot' : 'border-ink bg-panel-inset hover:bg-slot'}`}
                                    >
                                        {/* Same fix as the grid above: the mini-inventory painted a raw
                                            BLOCK_TYPES swatch, so every ITEM in the bag -- nuggets, tools,
                                            swords -- collapsed to one identical grey square. */}
                                        <ItemIcon itemName={type} size={24} />
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
                        <h3 className="font-display text-[10px] font-bold text-accent uppercase tracking-[2px] mb-2">{t('panel.inventoryTip')}</h3>
                        <div className="text-sm text-text-muted flex items-center gap-2">
                            <span className="w-6 h-6 flex-none rounded-sm grid place-items-center text-accent text-xs font-bold border-chrome border-ink bg-panel-inset">i</span>
                            <span>{t('panel.craftPlaceHint')}</span>
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
