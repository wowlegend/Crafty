import React, { lazy, Suspense } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Inventory,
  CraftingTable,
  BuildingTools,
  SettingsPanel,
  MagicSystem
} from './ui/GamePanels';
import { Icon, Button } from './ui/primitives/index.js';
import { CreditsScreen } from './ui/CreditsScreen';
import { WorldManager } from './WorldManager';
import { TradingInterface } from './ui/TradingInterface';
import { AchievementsPanel } from './QuestSystem';
import { SpellUpgradePanel } from './ui/SpellUpgradePanel';
import { ChestInventoryPanel } from './ui/ChestInventoryPanel';
import { shouldShowTitleMenu } from './ui/panelState.js';
import { isTouchDevice } from './input/touchDevice';
import { useGameStore } from './store/useGameStore';

// The full-bleed live 3D Hearth diorama VISTA — the title screen's hero face (W2). It REPLACES
// the old fixed-size 2D-canvas TitleMascot lockup (which double-stacked a second hero over the
// vista). Lazy + Suspense-wrapped so the three/R3F chunk never blocks the menu's first paint; the
// diorama camera + motes FREEZE in capture mode (isCaptureMode), so the `menu` frame stays
// deterministic for the visual gate.
const TitleDiorama = lazy(() =>
  import('./render/TitleDiorama').then((m) => ({ default: m.TitleDiorama }))
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
  spellUpgrades
}) {
  // The title/pause menu shows on pointer-unlock, but opening ANY panel exits pointer-lock, so it must be
  // suppressed whenever a panel is open. The whole gate lives in panelState.js (shouldShowTitleMenu) so the
  // old hardcoded `!showInventory && ...` list can't silently omit panels (it omitted 8 -> menu-over-panel).
  const titleMenuVisible = shouldShowTitleMenu({ isPointerLocked, ...gameState, showSpellUpgrades, showAchievements, showStats });

  // Enter (or re-enter) play = open the active gate. On desktop the active SoT is Pointer Lock
  // (Components.jsx's pointerlockchange -> setActive). iPad/iPhone have NO Pointer Lock, and the title
  // menu hides ONLY when active -- so without a direct bridge, tapping "Start Adventure" did nothing and
  // touch was stuck on the title screen (confirmed by scripts/visual/touch-probe.mjs). On touch we set the
  // active gate ourselves (single-active-authority still holds -- touch owns setActive on this path).
  const enterPlay = () => {
    if (gameState.requestPointerLock) gameState.requestPointerLock();
    else if (document.body.requestPointerLock) document.body.requestPointerLock().catch(e => console.warn(e));
    if (isTouchDevice()) setIsPointerLocked(true);
    // W1: touch has no pointerlockchange event, so latch gameStarted here too (one-way; desktop also
    // re-latches via Components' pointer-lock writer -- idempotent).
    useGameStore.getState().markGameStarted();
  };

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
              enterPlay();
            }}
          />
        )}
      </AnimatePresence>
 
      <AnimatePresence>
        {showSpellUpgrades && (
          <SpellUpgradePanel
            onClose={() => {
              setShowSpellUpgrades(false);
              enterPlay();
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
              enterPlay();
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
              enterPlay();
            }}
          />
        )}
        {gameState.showCrafting && (
          <CraftingTable
            gameState={gameState}
            onClose={() => {
              gameState.setShowCrafting(false);
              enterPlay();
            }}
          />
        )}
        {gameState.showMagic && (
          <MagicSystem
            onClose={() => {
              gameState.setShowMagic(false);
              enterPlay();
            }}
          />
        )}
        {gameState.showBuildingTools && (
          <BuildingTools
            gameState={gameState}
            onClose={() => {
              gameState.setShowBuildingTools(false);
              enterPlay();
            }}
          />
        )}
        {gameState.showSettings && (
          <SettingsPanel
            gameState={gameState}
            onClose={() => {
              gameState.setShowSettings(false);
              enterPlay();
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
              enterPlay();
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

      <AnimatePresence>
        {titleMenuVisible && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 flex flex-col items-center justify-end pb-16 pointer-events-auto bg-panel overflow-hidden"
              style={{ zIndex: 9999 }}
            >
              {/* Full-bleed live 3D Hearth VISTA — the Crafty Hero IS the subject of the vista
                  (replaces the flat purple gradient + 2D confetti AND the old front-layer 2D-canvas
                  mascot lockup, which double-stacked a second hero over this one). Camera + motes
                  freeze in capture mode so the `menu` frame is byte-stable. Suspense fallback =
                  empty (the bg-panel surface shows through) so first paint is never broken while
                  the three/R3F chunk loads. */}
              <Suspense fallback={null}>
                <TitleDiorama />
              </Suspense>

              {/* Bottom scrim so the wordmark + CTA + controls stay legible against the vista. */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0) 28%, rgba(0,0,0,0.42) 55%, rgba(0,0,0,0.86) 100%)' }}
              />

              <div className="text-center max-w-xl mx-4 relative z-10 flex flex-col items-center">
                <motion.h1
                  className="text-8xl mb-1 font-display text-accent"
                  style={{ textShadow: '0 4px 20px rgba(0,0,0,0.7)' }}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", duration: 0.8, delay: 0.2 }}
                >
                  Crafty
                </motion.h1>

                <motion.p
                  className="text-xl mb-8 tracking-wider whitespace-nowrap text-text-inverse/90"
                  style={{ textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.8 }}
                >
                  Build • Craft • Cast Spells • Explore
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9, duration: 0.5 }}
                >
                  <Button variant="primary" size="lg" onClick={enterPlay}>
                    <Icon name="sword" size={22} className="flex-none" /> Start Adventure
                  </Button>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.5, duration: 1 }}
                  className="mt-8 flex justify-center gap-5 text-xs text-text-inverse/75"
                  style={{ textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}
                >
                  <span>WASD Move</span>
                  <span>•</span>
                  <span>Space Jump</span>
                  <span>•</span>
                  <span>F Attack</span>
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
