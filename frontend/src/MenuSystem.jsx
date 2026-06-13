import React, { useMemo, lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { isCaptureMode, captureRandom } from './devtest/captureMode';
import {
  Inventory,
  CraftingTable,
  BuildingTools,
  SettingsPanel
} from './ui/GamePanels';
import { Icon } from './ui/primitives/index.js';
import { CreditsScreen } from './ui/CreditsScreen';
import { WorldManager } from './WorldManager';
import { TradingInterface } from './ui/TradingInterface';
import { AuthModal } from './AuthComponents';
import { AchievementsPanel } from './QuestSystem';
import { SpellUpgradePanel, ChestInventoryPanel } from './AdvancedGameFeatures';
import { shouldShowTitleMenu } from './ui/panelState.js';

// The live 3D "Crafty Hero" brand face for the title screen. Lazy + Suspense-wrapped so the
// three/R3F chunk never blocks the menu's first paint; the old 2D icon is the fallback until
// the canvas mounts. The hero's idle freezes in capture mode, so the `menu` frame stays
// deterministic for the visual gate.
const TitleMascot = lazy(() =>
  import('./render/mascots/TitleMascot').then((m) => ({ default: m.TitleMascot }))
);

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
  // Menu starfield/particles. In dev capture mode positions are seeded (order-independent)
  // and CSS twinkle/float animations are frozen, so the menu frame is byte-stable. In normal
  // gameplay this is identical to the original random, animated decoration.
  const capture = isCaptureMode();
  const menuStars = useMemo(() => {
    return Array.from({ length: 40 }, (_, i) => {
      const r = captureRandom(`menu-star-${i}`);
      const left = r() * 100, top = r() * 100;
      const dur = 1.5 + r() * 3, delay = r() * 3;
      const w = 2 + r() * 2, h = 2 + r() * 2;
      const style = {
        left: `${left}%`, top: `${top}%`,
        width: `${w}px`, height: `${h}px`,
      };
      if (capture) { style.animation = 'none'; style.opacity = 1; }
      else { style.animationDuration = `${dur}s`; style.animationDelay = `${delay}s`; }
      return { key: `star-${i}`, style };
    });
  }, [capture]);

  const menuParticles = useMemo(() => {
    const colors = ['#567C35', '#976D4D', '#808080', '#8B6914', '#5B9BD5', '#9932CC', '#FF4500', '#00BFFF'];
    return Array.from({ length: 15 }, (_, i) => {
      const r = captureRandom(`menu-particle-${i}`);
      const color = colors[i % colors.length];
      const size = 12 + r() * 20;
      const top = 10 + r() * 80;
      const dur = 8 + r() * 12, delay = r() * 8;
      const opacity = 0.3 + r() * 0.4;
      const blur = r() > 0.5 ? 1 : 0;
      const style = {
        width: `${size}px`, height: `${size}px`,
        backgroundColor: color, top: `${top}%`,
        opacity,
        filter: `blur(${blur}px)`,
        boxShadow: `0 0 ${size / 2}px ${color}40`,
      };
      if (capture) { style.animation = 'none'; style.left = `${(i / 15) * 100}%`; }
      else { style.animationDuration = `${dur}s`; style.animationDelay = `${delay}s`; }
      return { key: `particle-${i}`, style };
    });
  }, [capture]);

  // The title/pause menu shows on pointer-unlock, but opening ANY panel exits pointer-lock, so it must be
  // suppressed whenever a panel is open. The whole gate lives in panelState.js (shouldShowTitleMenu) so the
  // old hardcoded `!showInventory && ...` list can't silently omit panels (it omitted 8 -> menu-over-panel).
  const titleMenuVisible = shouldShowTitleMenu({ isPointerLocked, ...gameState, showSpellUpgrades, showAchievements, showStats, showAuthModal });

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
              if (gameState.requestPointerLock) gameState.requestPointerLock();
              else if (document.body.requestPointerLock) document.body.requestPointerLock().catch(e => console.warn(e));
            }}
          />
        )}
      </AnimatePresence>
 
      <AnimatePresence>
        {showSpellUpgrades && (
          <SpellUpgradePanel
            onClose={() => {
              setShowSpellUpgrades(false);
              if (gameState.requestPointerLock) gameState.requestPointerLock();
              else if (document.body.requestPointerLock) document.body.requestPointerLock().catch(e => console.warn(e));
            }}
          />
        )}
      </AnimatePresence>
 
      <AnimatePresence>
        {gameState.showChestInterface && (
          <ChestInventoryPanel
            coords={gameState.activeChestCoords}
            onClose={() => {
              gameState.setShowChestInterface(false);
              gameState.setActiveChestCoords(null);
              if (gameState.requestPointerLock) gameState.requestPointerLock();
              else if (document.body.requestPointerLock) document.body.requestPointerLock().catch(e => console.warn(e));
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
              if (gameState.requestPointerLock) gameState.requestPointerLock();
              else if (document.body.requestPointerLock) document.body.requestPointerLock().catch(e => console.warn(e));
            }}
          />
        )}
        {gameState.showCrafting && (
          <CraftingTable
            gameState={gameState}
            onClose={() => {
              gameState.setShowCrafting(false);
              if (gameState.requestPointerLock) gameState.requestPointerLock();
              else if (document.body.requestPointerLock) document.body.requestPointerLock().catch(e => console.warn(e));
            }}
          />
        )}
        {gameState.showBuildingTools && (
          <BuildingTools
            gameState={gameState}
            onClose={() => {
              gameState.setShowBuildingTools(false);
              if (gameState.requestPointerLock) gameState.requestPointerLock();
              else if (document.body.requestPointerLock) document.body.requestPointerLock().catch(e => console.warn(e));
            }}
          />
        )}
        {gameState.showSettings && (
          <SettingsPanel
            gameState={gameState}
            onClose={() => {
              gameState.setShowSettings(false);
              if (gameState.requestPointerLock) gameState.requestPointerLock();
              else if (document.body.requestPointerLock) document.body.requestPointerLock().catch(e => console.warn(e));
            }}
            onOpenWorldManager={() => {
              gameState.setShowSettings(false);
              gameState.setShowWorldManager(true);
            }}
            onOpenCredits={() => {
              gameState.setShowSettings(false);
              gameState.setShowCredits(true);
            }}
            showStats={showStats}
            setShowStats={setShowStats}
          />
        )}
        {gameState.showWorldManager && (
          <WorldManager
            gameState={gameState}
            onWorldLoad={gameState.loadWorldData}
            onClose={() => {
              gameState.setShowWorldManager(false);
              // KEVIN-FIX C4: the relock-on-close the other panels already do (in-game only)
              if (gameState.gameStarted && gameState.requestPointerLock) gameState.requestPointerLock();
            }}
          />
        )}
        {gameState.showCredits && (
          <CreditsScreen
            onClose={() => {
              gameState.setShowCredits(false);
              if (gameState.requestPointerLock) gameState.requestPointerLock();
              else if (document.body.requestPointerLock) document.body.requestPointerLock().catch(e => console.warn(e));
            }}
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
            // KEVIN-FIX C4: trading never relocked — the player landed unlocked needing a click
            if (gameState.gameStarted && gameState.requestPointerLock) gameState.requestPointerLock();
          }}
        />
      )}

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          // KEVIN-FIX C4: relock only mid-game (the title-menu auth path must NOT lock)
          if (gameState.gameStarted && gameState.isAlive && gameState.requestPointerLock) gameState.requestPointerLock();
        }}
      />

      <AnimatePresence>
        {titleMenuVisible && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 flex items-center justify-center pointer-events-auto"
              style={{ zIndex: 9999, background: 'radial-gradient(ellipse at 50% 30%, #1a1040 0%, #0a0a1a 50%, #050510 100%)' }}
            >
              {menuStars.map((s) => (
                <div
                  key={s.key}
                  className="menu-star"
                  style={s.style}
                />
              ))}

              {menuParticles.map((p) => (
                <div
                  key={p.key}
                  className="menu-particle"
                  style={p.style}
                />
              ))}

              <div className="text-center text-white max-w-xl mx-4 relative z-10">
                <motion.div
                  initial={{ y: -40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: "spring", duration: 1 }}
                  className="flex justify-center mb-2 text-purple-300"
                  // The 3D hero carries its own idle bob; the wrapper float is purely
                  // decorative and is frozen in capture mode so the `menu` frame is stable.
                  style={capture ? undefined : { animation: 'float 4s ease-in-out infinite' }}
                >
                  {/* Live 3D Crafty Hero brand face (replaces the old 2D pointy-hat icon).
                      Suspense fallback = the original icon so first paint is never empty. */}
                  <Suspense fallback={<Icon name="mascot" size={96} />}>
                    <TitleMascot size={176} />
                  </Suspense>
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
                    // KEVIN-FIX C3: the lock state follows reality (pointerlockchange), not hope.
                    if (gameState.requestPointerLock) {
                      gameState.requestPointerLock();
                    } else if (document.body.requestPointerLock) {
                      document.body.requestPointerLock().catch(e => console.warn(e));
                    }
                  }}
                  className="glow-button inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-bold py-4 px-10 rounded-xl text-xl pixel-font"
                  style={{ border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  <Icon name="sword" size={22} className="flex-none" /> Start Adventure
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
