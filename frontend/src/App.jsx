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
  const gameState = useGameStore();
  const { isAuthenticated, loading } = useAuth();
  const { musicEnabled, playBackgroundMusic } = useSounds();
  const { playAttack, playSwing, playHit, playDefeat } = useGameSounds();
  
  const [playerPosition, setPlayerPosition] = useState({ x: 0, y: 0, z: 0 });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isWorldBuilt, setIsWorldBuilt] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      if (window.isSpawnChunkLoaded) {
        setIsWorldBuilt(true);
        clearInterval(interval);
        setTimeout(() => {
          if (document.body.requestPointerLock) {
            document.body.requestPointerLock().catch(e => console.warn('Auto-lock failed:', e));
          }
        }, 100);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const gameSystems = useGameSystems();
  const questSystem = useQuestSystem();
  const treasureChests = useTreasureChests(playerPosition);
  const survivalMode = useSurvivalMode(gameState.isDay);
  const bossSystem = useBossSystem(experienceSystem.playerLevel, playerPosition);
  const petSystem = usePetSystem();
  const spellUpgrades = useSpellUpgrades();

  const {
    isPointerLocked, setIsPointerLocked,
    showStats, setShowStats,
    showAchievements, setShowAchievements,
    showSpellUpgrades, setShowSpellUpgrades
  } = useInputManager(gameState, gameSystems, questSystem);

  useEffect(() => {
    window._playerLevel = experienceSystem.playerLevel;
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
    window.playAttackSounds = () => {
      playSwing();
      setTimeout(() => playAttack(), 100);
    };
    window.playHitSound = playHit;
    window.playDefeatSound = playDefeat;
  }, [playAttack, playSwing, playHit, playDefeat]);

  useEffect(() => {
    window.addToInventory = gameState.addToInventory;
    window.removeFromInventory = gameState.removeFromInventory;
  }, [gameState.addToInventory, gameState.removeFromInventory]);

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
        playerPosition={playerPosition}
        setPlayerPosition={setPlayerPosition}
        isWorldBuilt={isWorldBuilt}
        bossSystem={bossSystem}
        petSystem={petSystem}
        showStats={showStats}
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
        playerPosition={playerPosition}
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
    </div>
  );
}

export default App;
