import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import { useGameSounds } from '../SoundManager';
import { Panel, Button, Icon, Toast, Modal } from './primitives/index.js';
import { wandManaMultiplier } from '../game/wandFocus';

export const TradingInterface = React.memo(({ villager, onClose }) => {
  const gameState = useGameStore(useShallow(state => ({
    inventory: state.inventory,
    coins: state.coins,
    setInventory: state.setInventory,
    spendCoins: state.spendCoins,
    addToInventory: state.addToInventory,
  })));
  const { playPickup, playLevelUpSound } = useGameSounds();
  const [tradeMessage, setTradeMessage] = useState('');

  const blocks = gameState.inventory?.blocks || {};
  const magic = gameState.inventory?.magic || {};
  const coins = gameState.coins || 0;

  const executeBlockTrade = (blockType, required, resultItem, resultCount = 1) => {
    const currentCount = blocks[blockType] || 0;
    if (currentCount < required) {
      setTradeMessage(`Not enough ${blockType}! Need ${required}.`);
      return;
    }

    // M5 #15 fix: route the bought item into `blocks` (the flat bucket the Inventory panel renders) --
    // it used to land in `magic`, which NO panel renders, so the purchase vanished (lost-buy bug).
    gameState.setInventory(prev => ({
      ...prev,
      blocks: {
        ...prev.blocks,
        [blockType]: currentCount - required,
        [resultItem]: (prev.blocks[resultItem] || 0) + resultCount
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

    // M5 #15 fix: spend the crystal currency from `magic` but route the bought item into `blocks` (the
    // flat bucket the Inventory renders) so it is visible + usable (was landing in unrendered `magic`).
    gameState.setInventory(prev => ({
      ...prev,
      magic: {
        ...prev.magic,
        crystals: currentCrystals - requiredCrystals
      },
      blocks: {
        ...prev.blocks,
        [magicItem]: (prev.blocks[magicItem] || 0) + resultCount
      }
    }));
    if (magicItem === 'wand') {
      playLevelUpSound();
    } else {
      playPickup();
    }
    setTradeMessage(`Traded ${requiredCrystals} Crystals for ${resultCount} ${magicItem}!`);
  };

  // Coin sink: coins (earned from surviving nights) buy genuinely-usable consumables. addToInventory routes
  // to inventory.blocks[name], the flat bucket GamePanels consumes potions from -> the bought item is usable.
  const executeCoinTrade = (resultItem, coinCost, resultCount = 1) => {
    if (!gameState.spendCoins(coinCost)) {
      setTradeMessage(`Not enough Coins! Need ${coinCost}.`);
      return;
    }
    gameState.addToInventory(resultItem, resultCount);
    playPickup();
    setTradeMessage(`Bought ${resultCount} ${resultItem} for ${coinCost} coins!`);
  };

  // M6 #14: costColor/getColor were dead off-brand raw-Tailwind palette fields (never read in the JSX) -- removed.
  const trades = [
    { type: 'coin', name: 'Coins to Health Potion', cost: 12, costItem: 'coins', get: 1, getItem: 'Health Potion' },
    { type: 'coin', name: 'Coins to Mana Potion', cost: 10, costItem: 'coins', get: 1, getItem: 'Mana Potion' },
    { type: 'block', name: 'Stone to Crystal', cost: 16, costItem: 'stone', get: 1, getItem: 'crystals' },
    { type: 'block', name: 'Coal to Crystal', cost: 8, costItem: 'coal', get: 1, getItem: 'crystals' },
    { type: 'block', name: 'Iron to Crystal', cost: 4, costItem: 'iron', get: 1, getItem: 'crystals' },
    { type: 'block', name: 'Gold to Crystal', cost: 2, costItem: 'gold', get: 1, getItem: 'crystals' },
    { type: 'crystal', name: 'Crystals to Wand', cost: 15, costItem: 'crystals', get: 1, getItem: 'wand' },
  ];

  return (
    <Modal className="fixed inset-0 z-modal flex items-center justify-center bg-ink/75" label={villager?.npcName || "Villager Merchant"} onClose={onClose}>
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
                {villager?.npcName || 'Villager Merchant'}
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
                <span className="text-accent block font-bold uppercase tracking-wider">Wands</span>
                <span className="font-display text-text text-sm">{magic.wand || 0}</span>
                {/* B7: a wand is a spell focus — surface the live mana-cost reduction so the trade has a payoff. */}
                <span className="block text-spell-arcane text-[10px] font-bold tabular-nums">
                  {`-${Math.round((1 - wandManaMultiplier(magic.wand || 0)) * 100)}% spell mana`}
                </span>
              </div>
              <div className="col-span-4 border-t-chrome border-ink pt-2 mt-2 flex items-center justify-center gap-1.5">
                <Icon name="coins" size={14} className="text-accent" />
                <span className="text-accent font-bold uppercase tracking-wider">Coins</span>
                <span className="font-display text-text text-sm tabular-nums">{coins}</span>
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
                const currentStock = t.type === 'block' ? (blocks[t.costItem] || 0)
                  : t.type === 'coin' ? coins
                  : (magic[t.costItem] || 0);
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
                          } else if (t.type === 'coin') {
                            executeCoinTrade(t.getItem, t.cost, t.get);
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
    </Modal>
  );
});
