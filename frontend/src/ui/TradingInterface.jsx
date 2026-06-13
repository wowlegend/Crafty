import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/useGameStore';
import { useGameSounds } from '../SoundManager';
import { Panel, Button, Icon, Toast } from './primitives/index.js';

export const TradingInterface = React.memo(({ villager, onClose }) => {
  const gameState = useGameStore();
  const { playPickup, playLevelUpSound } = useGameSounds();
  const [tradeMessage, setTradeMessage] = useState('');

  const blocks = gameState.inventory?.blocks || {};
  const magic = gameState.inventory?.magic || {};

  const executeBlockTrade = (blockType, required, resultItem, resultCount = 1) => {
    const currentCount = blocks[blockType] || 0;
    if (currentCount < required) {
      setTradeMessage(`Not enough ${blockType}! Need ${required}.`);
      return;
    }

    gameState.setInventory(prev => ({
      ...prev,
      blocks: {
        ...prev.blocks,
        [blockType]: currentCount - required
      },
      magic: {
        ...prev.magic,
        [resultItem]: (prev.magic[resultItem] || 0) + resultCount
      }
    }));
    playPickup();
    setTradeMessage(`Traded ${required} ${blockType} for ${resultCount} ${resultItem}!`);
  };

  const executeCrystalTrade = (magicItem, requiredCrystals, resultCount = 1) => {
    const currentCrystals = magic.crystals || 0;
    if (currentCrystals < requiredCrystals) {
      setTradeMessage(`Not enough Crystals! Need ${requiredCrystals}.`);
      return;
    }

    gameState.setInventory(prev => ({
      ...prev,
      magic: {
        ...prev.magic,
        crystals: currentCrystals - requiredCrystals,
        [magicItem]: (prev.magic[magicItem] || 0) + resultCount
      }
    }));
    if (magicItem === 'wand') {
      playLevelUpSound();
    } else {
      playPickup();
    }
    setTradeMessage(`Traded ${requiredCrystals} Crystals for ${resultCount} ${magicItem}!`);
  };

  const trades = [
    { type: 'block', name: 'Stone to Crystal', cost: 16, costItem: 'stone', get: 1, getItem: 'crystals', costColor: 'text-gray-400', getColor: 'text-cyan-400' },
    { type: 'block', name: 'Coal to Crystal', cost: 8, costItem: 'coal', get: 1, getItem: 'crystals', costColor: 'text-slate-500', getColor: 'text-cyan-400' },
    { type: 'block', name: 'Iron to Crystal', cost: 4, costItem: 'iron', get: 1, getItem: 'crystals', costColor: 'text-orange-300', getColor: 'text-cyan-400' },
    { type: 'block', name: 'Gold to Crystal', cost: 2, costItem: 'gold', get: 1, getItem: 'crystals', costColor: 'text-yellow-400', getColor: 'text-cyan-400' },
    { type: 'crystal', name: 'Crystals to Scroll', cost: 5, costItem: 'crystals', get: 1, getItem: 'scrolls', costColor: 'text-cyan-400', getColor: 'text-purple-400' },
    { type: 'crystal', name: 'Crystals to Wand', cost: 15, costItem: 'crystals', get: 1, getItem: 'wand', costColor: 'text-cyan-400', getColor: 'text-red-400' },
  ];

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-ink/75" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg"
      >
        <Panel variant="raise" className="relative overflow-hidden p-0">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 bg-panel-raise border-b-chrome border-ink">
            <div className="flex items-center gap-3">
              <Icon name="coins" size={22} className="text-accent" />
              <h2 className="font-display text-xl tracking-wide text-accent uppercase">
                Villager Merchant
              </h2>
            </div>
            <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose} className="w-9 h-9 p-0 text-text-muted">
              <Icon name="close" size={18} />
            </Button>
          </div>

          <div className="p-5">
            {/* Resources Panel */}
            <Panel variant="inset" className="p-3 mb-4 grid grid-cols-4 gap-2 text-xs text-center">
              <div>
                <span className="text-text-muted block uppercase tracking-wider">Stone</span>
                <span className="font-display text-text">{blocks.stone || 0}</span>
              </div>
              <div>
                <span className="text-text-muted block uppercase tracking-wider">Coal</span>
                <span className="font-display text-text">{blocks.coal || 0}</span>
              </div>
              <div>
                <span className="text-text-muted block uppercase tracking-wider">Iron</span>
                <span className="font-display text-text">{blocks.iron || 0}</span>
              </div>
              <div>
                <span className="text-text-muted block uppercase tracking-wider">Gold</span>
                <span className="font-display text-text">{blocks.gold || 0}</span>
              </div>
              <div className="col-span-2 border-t-chrome border-ink pt-2 mt-2">
                <span className="text-accent block font-bold uppercase tracking-wider">Crystals</span>
                <span className="font-display text-text text-sm">{magic.crystals || 0}</span>
              </div>
              <div className="col-span-1 border-t-chrome border-ink pt-2 mt-2">
                <span className="text-accent block font-bold uppercase tracking-wider">Scrolls</span>
                <span className="font-display text-text text-sm">{magic.scrolls || 0}</span>
              </div>
              <div className="col-span-1 border-t-chrome border-ink pt-2 mt-2">
                <span className="text-accent block font-bold uppercase tracking-wider">Wands</span>
                <span className="font-display text-text text-sm">{magic.wand || 0}</span>
              </div>
            </Panel>

            {/* Trade Message Feedback */}
            {tradeMessage && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-4"
              >
                <Toast
                  status={tradeMessage.includes('Not enough') ? 'danger' : 'success'}
                  className="w-full justify-center text-sm"
                >
                  {tradeMessage}
                </Toast>
              </motion.div>
            )}

            {/* Trades Scroll Area */}
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {trades.map((t, idx) => {
                const currentStock = t.type === 'block' ? (blocks[t.costItem] || 0) : (magic[t.costItem] || 0);
                const canTrade = currentStock >= t.cost;

                return (
                  <Panel
                    key={idx}
                    variant="inset"
                    className="flex items-center justify-between p-3"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-display tracking-wide text-text uppercase">{t.name}</span>
                      <span className="text-xs text-text-muted mt-0.5">
                        Cost: <span className="font-bold text-text">{t.cost} {t.costItem}</span> (Have: {currentStock})
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right flex flex-col">
                        <span className="text-xs text-text-muted uppercase tracking-wider">Receive</span>
                        <span className="text-sm font-display tracking-wide text-accent">+{t.get} {t.getItem}</span>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!canTrade}
                        onClick={() => {
                          if (t.type === 'block') {
                            executeBlockTrade(t.costItem, t.cost, t.getItem, t.get);
                          } else {
                            executeCrystalTrade(t.getItem, t.cost, t.get);
                          }
                        }}
                      >
                        Trade
                      </Button>
                    </div>
                  </Panel>
                );
              })}
            </div>
          </div>
        </Panel>
      </motion.div>
    </div>
  );
});
