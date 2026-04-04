import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Inventory,
  CraftingTable,
  BuildingTools,
  SettingsPanel
} from './ui/GamePanels';
import { WorldManager } from './WorldManager';
import { TradingInterface } from './SimplifiedNPCSystem';
import { AuthModal } from './AuthComponents';
import { AchievementsPanel } from './QuestSystem';
import { SpellUpgradePanel } from './AdvancedGameFeatures';

export function MenuSystem({
  gameState,
  showAchievements,
  setShowAchievements,
  showSpellUpgrades,
  setShowSpellUpgrades,
  isPointerLocked,
  setIsPointerLocked,
  showStats,
  setShowStats,
  questSystem,
  spellUpgrades,
  isAuthenticated,
  showAuthModal,
  setShowAuthModal
}) {
  return (
    <>
      <AnimatePresence>
        {showAchievements && (
          <AchievementsPanel
            achievements={questSystem.achievements}
            unlockedAchievements={questSystem.unlockedAchievements}
            stats={questSystem.stats}
            onClose={() => {
              setShowAchievements(false);
              setTimeout(() => {
                if (document.body.requestPointerLock) document.body.requestPointerLock().catch(e => console.warn(e));
              }, 100);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSpellUpgrades && (
          <SpellUpgradePanel
            spellLevels={spellUpgrades.spellLevels}
            onUpgrade={spellUpgrades.upgradeSpell}
            onClose={() => {
              setShowSpellUpgrades(false);
              setTimeout(() => {
                if (document.body.requestPointerLock) document.body.requestPointerLock().catch(e => console.warn(e));
              }, 100);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {gameState.showInventory && (
          <Inventory
            gameState={gameState}
            onClose={() => {
              gameState.setShowInventory(false);
              setIsPointerLocked(true);
            }}
          />
        )}
        {gameState.showCrafting && (
          <CraftingTable
            gameState={gameState}
            onClose={() => {
              gameState.setShowCrafting(false);
              setIsPointerLocked(true);
            }}
          />
        )}
        {gameState.showBuildingTools && (
          <BuildingTools
            gameState={gameState}
            onClose={() => {
              gameState.setShowBuildingTools(false);
              setIsPointerLocked(true);
            }}
          />
        )}
        {gameState.showSettings && (
          <SettingsPanel
            gameState={gameState}
            onClose={() => {
              gameState.setShowSettings(false);
              setIsPointerLocked(true);
            }}
            showStats={showStats}
            setShowStats={setShowStats}
          />
        )}
        {gameState.showWorldManager && isAuthenticated && (
          <WorldManager
            gameState={gameState}
            onWorldLoad={gameState.loadWorldData}
            onClose={() => gameState.setShowWorldManager(false)}
          />
        )}
      </AnimatePresence>

      {gameState.showTradingInterface && (
        <TradingInterface
          villager={gameState.selectedVillager}
          gameState={gameState}
          onClose={() => {
            gameState.setShowTradingInterface(false);
            gameState.setSelectedVillager(null);
          }}
        />
      )}

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />

      <AnimatePresence>
        {!isPointerLocked && !gameState.showInventory && !gameState.showCrafting &&
          !gameState.showMagic && !gameState.showBuildingTools && !gameState.showSettings && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 flex items-center justify-center pointer-events-auto"
              style={{ zIndex: 9999, background: 'radial-gradient(ellipse at 50% 30%, #1a1040 0%, #0a0a1a 50%, #050510 100%)' }}
            >
              {Array.from({ length: 40 }, (_, i) => (
                <div
                  key={`star-${i}`}
                  className="menu-star"
                  style={{
                    left: `${Math.random() * 100}%`,
                    top: `${Math.random() * 100}%`,
                    animationDuration: `${1.5 + Math.random() * 3}s`,
                    animationDelay: `${Math.random() * 3}s`,
                    width: `${2 + Math.random() * 2}px`,
                    height: `${2 + Math.random() * 2}px`,
                  }}
                />
              ))}

              {Array.from({ length: 15 }, (_, i) => {
                const colors = ['#567C35', '#976D4D', '#808080', '#8B6914', '#5B9BD5', '#9932CC', '#FF4500', '#00BFFF'];
                const color = colors[i % colors.length];
                const size = 12 + Math.random() * 20;
                return (
                  <div
                    key={`particle-${i}`}
                    className="menu-particle"
                    style={{
                      width: `${size}px`,
                      height: `${size}px`,
                      backgroundColor: color,
                      top: `${10 + Math.random() * 80}%`,
                      animationDuration: `${8 + Math.random() * 12}s`,
                      animationDelay: `${Math.random() * 8}s`,
                      opacity: 0.3 + Math.random() * 0.4,
                      filter: `blur(${Math.random() > 0.5 ? 1 : 0}px)`,
                      boxShadow: `0 0 ${size / 2}px ${color}40`,
                    }}
                  />
                );
              })}

              <div className="text-center text-white max-w-xl mx-4 relative z-10">
                <motion.div
                  initial={{ y: -40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: "spring", duration: 1 }}
                  className="text-7xl mb-2"
                  style={{ animation: 'float 4s ease-in-out infinite' }}
                >
                  🧙‍♂️
                </motion.div>

                <motion.h1
                  className="text-8xl font-bold mb-2 pixel-font shimmer-text"
                  initial={{ scale: 0.3, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", duration: 0.8, delay: 0.2 }}
                >
                  Crafty
                </motion.h1>

                <motion.p
                  className="text-xl mb-10 tracking-wider"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.8 }}
                  style={{ color: 'rgba(200, 180, 255, 0.8)' }}
                >
                  Build • Craft • Cast Spells • Explore Infinite Worlds
                </motion.p>

                <motion.button
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9, duration: 0.5 }}
                  onClick={() => {
                    setIsPointerLocked(true);
                    setTimeout(() => {
                      if (document.body.requestPointerLock) {
                        document.body.requestPointerLock().catch(e => console.warn(e));
                      }
                    }, 100);
                  }}
                  className="glow-button bg-purple-600 hover:bg-purple-500 text-white font-bold py-4 px-10 rounded-xl text-xl pixel-font"
                  style={{ border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  ⚔️ Start Adventure
                </motion.button>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.5, duration: 1 }}
                  className="mt-12 flex justify-center gap-6 text-xs"
                  style={{ color: 'rgba(150, 140, 180, 0.6)' }}
                >
                  <span>WASD Move</span>
                  <span>•</span>
                  <span>Space Jump</span>
                  <span>•</span>
                  <span>F Cast</span>
                  <span>•</span>
                  <span>1-4 Spells</span>
                  <span>•</span>
                  <span>Q Claim Quest</span>
                </motion.div>
              </div>
            </motion.div>
          )}
      </AnimatePresence>
    </>
  );
}
