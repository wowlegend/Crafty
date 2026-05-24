import { useShallow } from 'zustand/react/shallow';
import React, { useState, useEffect } from 'react';
import './App.css';
import { AuthProvider, useAuth } from './AuthContext';
import { SoundProvider, useSounds, useGameSounds } from './SoundManager';
import { useSimpleExperience } from './SimpleExperienceSystem';
import { GameSystemsProvider, useGameSystems } from './GameSystems';
import { useGameStore } from './store/useGameStore';
import { useQuestSystem, useTreasureChests } from './QuestSystem';
import { useSurvivalMode, useBossSystem, usePetSystem, useSpellUpgrades } from './AdvancedGameFeatures';

import { HUD } from './HUD';
import { useInputManager } from './InputManager';
import { GameScene } from './GameScene';
import { MenuSystem } from './MenuSystem';
import { DebugOverlay } from './ui/DebugOverlay';

function App() {
  return (
    <AuthProvider>
      <SoundProvider>
        <GameAppWrapper />
      </SoundProvider>
    </AuthProvider>
  );
}

function GameAppWrapper() {
  const experienceSystem = useSimpleExperience();
  return (
    <GameSystemsProvider playerLevel={experienceSystem.playerLevel}>
      <GameApp experienceSystem={experienceSystem} />
    </GameSystemsProvider>
  );
}

function GameApp({ experienceSystem }) {
  const gameState = useGameStore(useShallow(state => ({
        isSpawnChunkLoaded: state.isSpawnChunkLoaded,
        isDay: state.isDay,
        isAlive: state.isAlive,
        inventory: state.inventory,
        addToInventory: state.addToInventory,
        removeFromInventory: state.removeFromInventory,
        setShowInventory: state.setShowInventory,
        setShowCrafting: state.setShowCrafting,
        setShowMagic: state.setShowMagic,
        setShowBuildingTools: state.setShowBuildingTools,
        setShowSettings: state.setShowSettings,
        setShowTradingInterface: state.setShowTradingInterface,
        showInventory: state.showInventory,
        showCrafting: state.showCrafting,
        showMagic: state.showMagic,
        showBuildingTools: state.showBuildingTools,
        showSettings: state.showSettings,
        showTradingInterface: state.showTradingInterface,
        showWorldManager: state.showWorldManager,
        setShowWorldManager: state.setShowWorldManager,
        selectedVillager: state.selectedVillager,
        loadWorldData: state.loadWorldData,
        selectedBlock: state.selectedBlock,
        activeSpell: state.activeSpell,
        setActiveSpell: state.setActiveSpell
    })));
  const { isAuthenticated, loading } = useAuth();
  const { musicEnabled, playBackgroundMusic } = useSounds();
  const { playAttack, playSwing, playHit, playDefeat } = useGameSounds();
  
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isWorldBuilt, setIsWorldBuilt] = useState(false);

  useEffect(() => {
    if (gameState.isSpawnChunkLoaded && !isWorldBuilt) {
      setIsWorldBuilt(true);
      setTimeout(() => {
        const state = useGameStore.getState();
        if (state.requestPointerLock) {
          state.requestPointerLock();
        } else {
          const canvas = document.querySelector('canvas');
          if (canvas && canvas.requestPointerLock) {
            canvas.requestPointerLock();
          } else if (document.body.requestPointerLock) {
            document.body.requestPointerLock().catch(e => console.warn('Auto-lock failed:', e));
          }
        }
      }, 100);
    }
  }, [gameState.isSpawnChunkLoaded, isWorldBuilt]);

  const gameSystems = useGameSystems();
  const questSystem = useQuestSystem();
  const treasureChests = useTreasureChests();
  const survivalMode = useSurvivalMode(gameState.isDay);
  const bossSystem = useBossSystem(experienceSystem.playerLevel);
  const petSystem = usePetSystem();
  const spellUpgrades = useSpellUpgrades();

  const {
    isPointerLocked, setIsPointerLocked,
    showStats, setShowStats,
    showAchievements, setShowAchievements,
    showSpellUpgrades, setShowSpellUpgrades
  } = useInputManager(gameState, gameSystems, questSystem);

  const anyPanelOpen = gameState.showInventory || gameState.showCrafting ||
    gameState.showMagic || gameState.showBuildingTools ||
    gameState.showSettings || gameState.showTradingInterface ||
    gameState.showWorldManager || showAchievements || showSpellUpgrades ||
    showAuthModal || gameState.showChestInterface;

  const showClickToPlay = isWorldBuilt && !isPointerLocked && !anyPanelOpen && (gameSystems?.isAlive !== false);

  useEffect(() => {
    useGameStore.getState().setGetPlayerLevel(() => experienceSystem.playerLevel);
  }, [experienceSystem.playerLevel]);

  useEffect(() => {
    const handleResizeError = (e) => {
      if (e.message === 'ResizeObserver loop limit exceeded' ||
        e.message === 'ResizeObserver loop completed with undelivered notifications.') {
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('error', handleResizeError);
    return () => window.removeEventListener('error', handleResizeError);
  }, []);

  useEffect(() => {
    useGameStore.setState({ playAttackSounds: () => {
      playSwing();
      setTimeout(() => playAttack(), 100);
    }});
    useGameStore.setState({ playHitSound: playHit });
    useGameStore.setState({ playDefeatSound: playDefeat });
  }, [playAttack, playSwing, playHit, playDefeat]);

  useEffect(() => {
    const handleContextMenu = (e) => {
      if (document.pointerLockElement) {
        e.preventDefault();
      }
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  useEffect(() => {
    if (isPointerLocked && musicEnabled) {
      playBackgroundMusic();
    }
  }, [isPointerLocked, musicEnabled, playBackgroundMusic]);

  if (loading) {
    return (
      <div className="w-full h-screen bg-gradient-to-b from-blue-400 to-blue-600 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-xl">Loading Crafty...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-screen bg-gradient-to-b from-blue-400 to-blue-600 overflow-hidden relative"
      style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0 }}
    >
      <GameScene
        gameState={gameState}
        isWorldBuilt={isWorldBuilt}
        bossSystem={bossSystem}
        petSystem={petSystem}
        showStats={showStats}
        showAchievements={showAchievements}
        showSpellUpgrades={showSpellUpgrades}
        showAuthModal={showAuthModal}
      />

      {!isWorldBuilt && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm pointer-events-auto">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-500 mb-6 shadow-lg shadow-green-500/50"></div>
          <h2 className="text-3xl font-bold text-white mb-2 font-mono tracking-widest" style={{ textShadow: '0 0 10px rgba(74, 222, 128, 0.8)' }}>
            GENERATING WORLD
          </h2>
          <p className="text-green-400 font-mono text-sm animate-pulse">Building Terrain and Physics Colliders...</p>
        </div>
      )}

      {showClickToPlay && (
        <div 
          onClick={() => {
            const state = useGameStore.getState();
            if (state.requestPointerLock) {
              state.requestPointerLock();
            } else {
              const canvas = document.querySelector('canvas');
              if (canvas && canvas.requestPointerLock) {
                canvas.requestPointerLock();
              } else if (document.body.requestPointerLock) {
                document.body.requestPointerLock();
              }
            }
          }}
          className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-md cursor-pointer transition-all duration-300 hover:bg-slate-950/50 pointer-events-auto"
        >
          <div className="max-w-md p-8 rounded-2xl bg-slate-900/80 border border-slate-700/50 shadow-2xl flex flex-col items-center justify-center text-center transform scale-100 transition-transform duration-300 hover:scale-105" style={{ boxShadow: '0 0 40px rgba(59, 130, 246, 0.15)' }}>
            <div className="w-20 h-20 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center mb-6 animate-pulse" style={{ boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)' }}>
              <svg className="w-8 h-8 text-blue-400 fill-current translate-x-0.5" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            
            <h1 className="text-3xl font-extrabold text-white mb-2 tracking-wide font-sans bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-200 to-blue-400">
              CRAFTY RPG
            </h1>
            <p className="text-slate-300 mb-6 text-sm">
              Click anywhere on the screen to capture mouse and resume gameplay
            </p>

            <div className="w-full border-t border-slate-800 my-4"></div>

            <div className="w-full text-left space-y-2.5 mt-2">
              <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-1.5 font-mono">Quick Controls</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-mono text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 shadow-sm">W A S D</span>
                  <span>Move</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 shadow-sm">Left-Click</span>
                  <span>Melee Attack</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 shadow-sm">Right-Click</span>
                  <span>Cast Active Spell</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 shadow-sm">1-4</span>
                  <span>Select Spells</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 shadow-sm">E / C / B</span>
                  <span>Inventory / Craft / Build</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 shadow-sm">G</span>
                  <span>Interact (NPC/Chest)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 shadow-sm">Tab</span>
                  <span>Quests & Achievements</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700/60 shadow-sm">U</span>
                  <span>Upgrade Spells</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <HUD
        isPointerLocked={isPointerLocked}
        isWorldBuilt={isWorldBuilt}
        gameState={gameState}
        gameSystems={gameSystems}
        experienceSystem={experienceSystem}
        questSystem={questSystem}
        treasureChests={treasureChests}
        survivalMode={survivalMode}
        bossSystem={bossSystem}
        petSystem={petSystem}
        spellUpgrades={spellUpgrades}
        showStats={showStats}
        setShowStats={setShowStats}
        setIsPointerLocked={setIsPointerLocked}
      />

      <MenuSystem
        gameState={gameState}
        showAchievements={showAchievements}
        setShowAchievements={setShowAchievements}
        showSpellUpgrades={showSpellUpgrades}
        setShowSpellUpgrades={setShowSpellUpgrades}
        isPointerLocked={isPointerLocked}
        setIsPointerLocked={setIsPointerLocked}
        showStats={showStats}
        setShowStats={setShowStats}
        questSystem={questSystem}
        spellUpgrades={spellUpgrades}
        isAuthenticated={isAuthenticated}
        showAuthModal={showAuthModal}
        setShowAuthModal={setShowAuthModal}
      />

      <DebugOverlay isWorldBuilt={isWorldBuilt} />
    </div>
  );
}

export default App;
