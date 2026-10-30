import React, { useState } from 'react';
import { m } from 'framer-motion';
import { useGameStore } from '../store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import { useGameSounds } from '../SoundManager';
import { Panel, Button, Icon, Toast, Modal } from './primitives/index.js';
import { useT } from '../i18n/i18n.js';

// The villager merchant sells consumables for coins; mined blocks buy nothing here.
export const TradingInterface = React.memo(({ villager, onClose }) => {
  const t = useT();
  const gameState = useGameStore(useShallow(state => ({
    coins: state.coins,
    spendCoins: state.spendCoins,
    addToInventory: state.addToInventory,
  })));
  const { playPickup } = useGameSounds();
  const [tradeMessage, setTradeMessage] = useState('');

  const coins = gameState.coins || 0;

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
  ];

  return (
    <Modal className="fixed inset-0 z-modal flex items-center justify-center bg-ink/75" label={villager?.npcName || "Villager Merchant"} onClose={onClose}>
      <m.div
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
            <Button variant="ghost" size="icon" text="text-text-muted" aria-label="Close" onClick={onClose} className="w-9 h-9">
              <Icon name="close" size={18} />
            </Button>
          </div>

          <div className="p-5">
            {/* Resources Panel */}
            <Panel variant="inset" className="p-3 mb-4 flex items-center justify-center gap-1.5 text-xs">
              <Icon name="coins" size={14} className="text-accent" />
              <span className="text-accent font-bold uppercase tracking-wider">Coins</span>
              <span className="font-display text-text text-sm tabular-nums">{coins}</span>
            </Panel>

            {/* Trade Message Feedback */}
            {tradeMessage && (
              <m.div
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
              </m.div>
            )}

            {/* Trades Scroll Area */}
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {trades.map((trade, idx) => {
                const currentStock = coins;
                const canTrade = currentStock >= trade.cost;

                return (
                  <Panel
                    key={idx}
                    variant="inset"
                    className="flex items-center justify-between p-3"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-display tracking-wide text-text uppercase">{trade.name}</span>
                      <span className="text-xs text-text-muted mt-0.5">
                        Cost: <span className="font-bold text-text">{trade.cost} {trade.costItem}</span> (Have: {currentStock})
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right flex flex-col">
                        <span className="text-xs text-text-muted uppercase tracking-wider">{t('ui.receive')}</span>
                        <span className="text-sm font-display tracking-wide text-accent">+{trade.get} {trade.getItem}</span>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!canTrade}
                        onClick={() => executeCoinTrade(trade.getItem, trade.cost, trade.get)}
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
      </m.div>
    </Modal>
  );
});
