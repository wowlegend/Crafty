// S3-M5 (part 1): the HUD chrome — extracted BYTE-EXACT from Components.jsx (the god-file de-monolith).
// MinecraftHotbar (the bottom block hotbar) + GameUI (the HUD overlay: mode/settings + side action
// rail + the hotbar). Both take `gameState` as a prop (no store coupling). GameUI renders MinecraftHotbar
// (intra-module). Extraction-only — NO behavior change.
import React from 'react';
import { motion } from 'framer-motion';
import { Panel, Slot, Button, Icon } from './primitives/index.js';
import { Package, Hammer, Wand2, Grid } from 'lucide-react';
import { BLOCK_TYPES, HOTBAR_BLOCKS } from '../world/Blocks';

const MinecraftHotbar = React.memo(({ gameState }) => {
  if (!gameState) return null;
  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 pointer-events-auto">
      <Panel variant="base" className="flex gap-2 p-2.5">
        {HOTBAR_BLOCKS.map((blockType, index) => {
          const blockConfig = BLOCK_TYPES[blockType];
          if (!blockConfig) return null;
          const isSelected = gameState.selectedBlock === blockType;
          const quantity = gameState.inventory?.blocks?.[blockType] || 0;
          return (
            <Slot
              key={blockType}
              selected={isSelected}
              className="w-[62px] cursor-pointer"
              onClick={() => gameState.setSelectedBlock(blockType)}
              title={`${blockConfig.name} (${quantity})`}
            >
              {/* block-color swatch — gameplay data (inline color allowed) */}
              <div
                className="w-9 h-9 rounded-sm border-chrome border-ink"
                style={{ backgroundColor: blockConfig.color || '#567C35' }}
              />
              <span className="absolute top-1 left-1.5 text-[11px] font-bold text-text-muted tabular-nums">{index + 1}</span>
              {quantity > 1 && (
                <span
                  className="absolute bottom-1 right-1.5 text-[13px] font-bold text-text tabular-nums"
                  style={{ textShadow: '0 1px 2px #000' }}
                >
                  {quantity > 999 ? '999+' : quantity}
                </span>
              )}
            </Slot>
          );
        })}
      </Panel>
    </div>
  );
});

export const GameUI = ({ gameState, showStats, setShowStats }) => {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 pointer-events-none z-20">
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-auto">
        <Panel variant="base" className="flex items-center gap-2 px-3 py-2 text-text">
          <span className="text-sm text-text-muted">Mode:</span>
          <span className="text-sm font-bold text-success">{gameState.gameMode}</span>
        </Panel>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" aria-label="Settings" className="w-[42px] h-[42px] p-0 text-text-muted" onClick={() => gameState.setShowSettings(true)}>
            <Icon name="settings" size={20} />
          </Button>
        </div>
      </div>
      <MinecraftHotbar gameState={gameState} />
      <div className="absolute left-4 top-1/2 transform -translate-y-1/2 pointer-events-auto">
        <Panel variant="base" className="flex flex-col gap-2 p-2">
          <Button variant="ghost" size="sm" aria-label="Inventory" className="w-[42px] h-[42px] p-0 text-text" onClick={() => gameState.setShowInventory(true)}><Package size={20} /></Button>
          <Button variant="ghost" size="sm" aria-label="Crafting" className="w-[42px] h-[42px] p-0 text-text" onClick={() => gameState.setShowCrafting(true)}><Hammer size={20} /></Button>
          <Button variant="ghost" size="sm" aria-label="Magic" className="w-[42px] h-[42px] p-0 text-text" onClick={() => gameState.setShowMagic(true)}><Wand2 size={20} /></Button>
          <Button variant="ghost" size="sm" aria-label="Building tools" className="w-[42px] h-[42px] p-0 text-text" onClick={() => gameState.setShowBuildingTools(true)}><Grid size={20} /></Button>
        </Panel>
      </div>
    </motion.div>
  );
};
