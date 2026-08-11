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
import { QuestLog } from './ui/QuestLog';
import { SpellUpgradePanel } from './ui/SpellUpgradePanel';
import { ChestInventoryPanel } from './ui/ChestInventoryPanel';
import { shouldShowTitleMenu, shouldShowResumeOverlay } from './ui/panelState.js';
import { isCaptureMode } from './devtest/captureMode.js';
import { isTouchDevice } from './input/touchDevice';
import { useT } from './i18n/i18n.js';
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
  questSystem
}) {
  const t = useT();
  // The title/pause menu shows on pointer-unlock, but opening ANY panel exits pointer-lock, so it must be
  // suppressed whenever a panel is open. The whole gate lives in panelState.js (shouldShowTitleMenu) so the
  // old hardcoded `!showInventory && ...` list can't silently omit panels (it omitted 8 -> menu-over-panel).
  const titleMenuVisible = shouldShowTitleMenu({ isPointerLocked, ...gameState, showSpellUpgrades, showAchievements, showStats });
  // The pointer-lock RECOVERY surface (Kevin, 2026-08-05: "ESC to open the menu, ESC to quit it, and
  // the character is frozen and dies"). The browser refuses to re-lock the mouse immediately after the
  // player's own ESC, so the optimistic relock every panel's onClose performs is guaranteed to fail on
  // that path and the player was left with no input and no UI. Derived from state, so no close path —
  // present or future — can strand a player again. Capture-suppressed: the visual gate must never see it.
  const resumeOverlayVisible = !isCaptureMode() &&
    shouldShowResumeOverlay({ isPointerLocked, ...gameState, showSpellUpgrades, showAchievements, showStats });

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
        {gameState.showQuestLog && (
          <QuestLog
            quests={questSystem.quests}
            onClose={() => {
              gameState.setShowQuestLog(false);
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

      {/* WRAPPED 2026-08-11. TradingInterface declares an `exit` variant and sat in the gap between two
          AnimatePresence blocks with no such ancestor anywhere on the path -- App.jsx has none at all and
          MenuSystem's own root is a bare fragment -- so framer-motion never deferred its unmount and the
          exit tween was discarded on every close. Every sibling panel here IS wrapped, so the merchant
          was the one panel that POPPED out while the rest faded. */}
      <AnimatePresence>
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
      </AnimatePresence>

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

                {/* The tagline sits over the hero's blue robe, where the middle words were
                    near-invisible (low contrast). Two fixes: (1) it now uses the LIGHT `text` token
                    (#ECECEF) — the old `text-inverse` (#231708) is the near-black "text on gold
                    fills" token and was the real culprit (dark text on a busy mid-tone robe); (2) it
                    is given its OWN focused legibility scrim — a soft dark pill behind the text only —
                    so the near-white text stays fully legible against the robe (and against the
                    drifting hero in non-capture mode), mirroring the page's bottom-scrim pattern. */}
                <motion.p
                  className="text-xl mb-8 tracking-wider whitespace-nowrap text-text rounded-full px-6 py-1.5"
                  style={{
                    textShadow: '0 2px 12px rgba(0,0,0,0.95)',
                    background: 'radial-gradient(ellipse 70% 135% at center, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.78) 50%, rgba(0,0,0,0.30) 82%, rgba(0,0,0,0) 100%)',
                  }}
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
                  <span>{t('hint.wasdMove')}</span>
                  <span>•</span>
                  <span>{t('hint.spaceJump')}</span>
                  <span>•</span>
                  <span>{t('hint.fCast')}</span>
                  <span>•</span>
                  <span>{t('hint.spells14')}</span>
                  <span>•</span>
                  <span>{t('hint.tMelee')}</span>
                  <span>•</span>
                  <span>{t('hint.qClaimQuest')}</span>
                </motion.div>
              </div>
            </motion.div>
          )}
      </AnimatePresence>

      {/* PAUSED / click-to-resume. Deliberately NOT animated and NOT lazy: this is the surface a
          player sees when they have already lost control, so it must paint on the first frame it is
          true. The whole overlay is the click target (a fresh user gesture is the ONE thing that can
          restore pointer lock), with an explicit button for keyboard/screen-reader users. */}
      {resumeOverlayVisible && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('ui.paused')}
          data-testid="resume-overlay"
          onClick={enterPlay}
          // Bold-flat scrim — the S1-C locked language bans frosted-glass blur on shipped in-game UI, and
          // the design-language gate caught the first draft doing it. Same tokens the panels already use.
          className="fixed inset-0 z-modal flex flex-col items-center justify-center gap-5 bg-ink/75 cursor-pointer"
        >
          {/* `text-text` (#ECECEF), NOT `text-text-inverse` — the inverse token is '#231708', documented in
              tokens.js as "text on gold fills". The first draft used it on a near-black scrim and the word
              PAUSED came out dark-brown-on-black: legible in a jsdom assertion, unreadable in the frame. */}
          <h2 className="text-3xl font-bold tracking-wide text-text" style={{ textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}>
            {t('ui.paused')}
          </h2>
          <p className="max-w-sm px-6 text-center text-sm text-text/85" style={{ textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}>
            {t('ui.resume_hint')}
          </p>
          {/* No onClick of its own: a click here — including one synthesized by keyboard activation —
              bubbles to the overlay handler, so the gesture is handled exactly once. */}
          <Button variant="primary" size="lg" data-testid="resume-button">
            <Icon name="sword" size={20} className="flex-none" /> {t('ui.resume')}
          </Button>
        </div>
      )}
    </>
  );
}
