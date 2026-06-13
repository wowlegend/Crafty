// Extracted from AdvancedGameFeatures S3-M4 (the AGF dissolve, part 1): verbatim, same behavior.
import React from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/useGameStore';
import { useT } from '../i18n/i18n.js';
import { Panel, Button, Icon, Slot } from './primitives/index.js';

export const ChestInventoryPanel = React.memo(({ coords, onClose }) => {
    const t = useT();
    const playerInventory = useGameStore(state => state.inventory?.blocks || {});
    const chestsMap = useGameStore(state => state.chests || new Map());
    const transferItem = useGameStore(state => state.transferItem);

    const chestData = chestsMap.get(coords) || { inventory: {}, name: 'Wooden Chest' };
    const chestInventory = chestData.inventory || {};

    const availableItems = Object.entries(playerInventory).filter(([_, qty]) => qty > 0);
    const chestItems = Object.entries(chestInventory).filter(([_, qty]) => qty > 0);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-ink/75"
        >
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="max-w-3xl w-full"
            >
                <Panel variant="raise" className="p-6 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-6 pb-4 border-b-chrome border-ink">
                        <div>
                            <h2 className="font-display text-2xl uppercase tracking-wide text-accent flex items-center gap-2">
                                <Icon name="chest-open" size={24} className="flex-none" /> Storage Container Chest
                            </h2>
                            <p className="text-text-muted text-xs mt-1">Coordinate Grid Position: {coords}</p>
                        </div>
                        <Button variant="ghost" size="sm" aria-label={t('ui.close')} onClick={onClose} className="w-10 h-10 p-0 text-text-muted">
                            <Icon name="close" size={18} />
                        </Button>
                    </div>

                    {/* Double Columns grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Player inventory panel */}
                        <Panel variant="inset" className="p-4 bg-panel flex flex-col gap-3">
                            <h3 className="flex items-center gap-2 font-display text-sm text-text uppercase tracking-widest border-b-chrome border-ink pb-2"><Icon name="backpack" size={16} className="flex-none" /> Player Backpack Inventory</h3>
                            {availableItems.length === 0 ? (
                                <div className="py-8 text-center text-xs text-text-muted">Your backpack is completely empty.</div>
                            ) : (
                                <div className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
                                    {availableItems.map(([item, qty]) => (
                                        <Slot
                                            key={item}
                                            onClick={() => transferItem(coords, item, 1, 'to_chest')}
                                            className="!aspect-auto p-2 cursor-pointer active:translate-x-[2px] active:translate-y-[2px] transition-transform duration-150 flex flex-col justify-between items-center min-h-16"
                                        >
                                            <div className="text-text text-xs font-bold truncate max-w-full">{item}</div>
                                            <div className="px-2 py-0.5 rounded-sm bg-track text-[10px] text-text-muted font-bold mt-1 tabular-nums">x{qty}</div>
                                        </Slot>
                                    ))}
                                </div>
                            )}
                            <p className="text-[10px] text-text-muted text-center mt-2">Click on items to transfer them to the chest.</p>
                        </Panel>

                        {/* Chest inventory panel */}
                        <Panel variant="inset" className="p-4 bg-panel flex flex-col gap-3">
                            <h3 className="flex items-center gap-2 font-display text-sm text-accent uppercase tracking-widest border-b-chrome border-ink pb-2"><Icon name="chest-open" size={16} className="flex-none" /> Storage Vault Inventory</h3>
                            {chestItems.length === 0 ? (
                                <div className="py-8 text-center text-xs text-text-muted">This chest container is currently empty.</div>
                            ) : (
                                <div className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto pr-1">
                                    {chestItems.map(([item, qty]) => (
                                        <Slot
                                            key={item}
                                            onClick={() => transferItem(coords, item, 1, 'from_chest')}
                                            className="!aspect-auto p-2 cursor-pointer active:translate-x-[2px] active:translate-y-[2px] transition-transform duration-150 flex flex-col justify-between items-center min-h-16"
                                        >
                                            <div className="text-accent text-xs font-bold truncate max-w-full">{item}</div>
                                            <div className="px-2 py-0.5 rounded-sm bg-track text-[10px] text-text-muted font-bold mt-1 tabular-nums">x{qty}</div>
                                        </Slot>
                                    ))}
                                </div>
                            )}
                            <p className="text-[10px] text-text-muted text-center mt-2">Click on items to retrieve them to your backpack.</p>
                        </Panel>
                    </div>
                </Panel>
            </motion.div>
        </motion.div>
    );
});
