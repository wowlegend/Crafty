import React, { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Sky, Stats } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';
import {
  Pickaxe,
  Package,
  Settings,
  Sun,
  Moon,
  Wand2,
  Copy,
  Download,
  Upload,
  Trash2,
  Grid3X3,
  Eye,
  EyeOff,
  LogIn,
  Save,
  Volume2,
  VolumeX
} from 'lucide-react';
import './App.css';
import {
  GameUI,
  MinecraftSky,
  MinecraftHotbar,
  MinecraftHealthHunger,
  PositionTracker
} from './Components';
import {
  Inventory,
  CraftingTable,
  MagicSystem,
  BuildingTools,
  SettingsPanel
} from './ui/GamePanels';
import { Player } from './Components'; // Fixed import - Player is in Components.js now
import { MinecraftWorld } from './world/Terrain'; // Terrain generator with Physics
import { AuthProvider, useAuth } from './AuthContext';
import { AuthModal, UserProfile } from './AuthComponents';
import { WorldManager } from './WorldManager';
import { SoundProvider, useSounds, useGameSounds } from './SoundManager';
import { NPCSystem, TradingInterface, CombatInstructions } from './SimplifiedNPCSystem';

// Import experience system for UI outside Canvas
import { useSimpleExperience, SimpleXPGainVisual, SimpleLevelUpEffect, SimpleExperienceBar } from './SimpleExperienceSystem';

// Import quest & progression system
import { useQuestSystem, useTreasureChests, QuestTracker, NotificationStack, AchievementsPanel, ChestIndicator } from './QuestSystem';

// Import advanced game features
import { useSurvivalMode, SurvivalWarning, useBossSystem, BossHealthBar, BossEntity, usePetSystem, PetIndicator, PetEntities, useSpellUpgrades, SpellUpgradePanel } from './AdvancedGameFeatures';
import { EnhancedMagicSystem } from './EnhancedMagicSystem';

// Import game systems (health, mana, hunger, combat)
import {
  GameSystemsProvider,
  useGameSystems,
  PlayerHealthBar,
  PlayerManaBar,
  PlayerHungerBar,
  DamageOverlay,
  DeathScreen,
  ActiveSpellIndicator,
  SPELL_MANA_COSTS
} from './GameSystems';

// === MINIMAP COMPONENT ===
const Minimap = React.memo(({ playerPosition }) => {
  const canvasRef = useRef(null);
  const MAP_SIZE = 130;
  const MAP_RANGE = 60; // world units visible

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const draw = () => {
      ctx.fillStyle = 'rgba(10, 10, 20, 0.85)';
      ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

      // Grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < MAP_SIZE; i += MAP_SIZE / 6) {
        ctx.beginPath();
        ctx.moveTo(i, 0); ctx.lineTo(i, MAP_SIZE);
        ctx.moveTo(0, i); ctx.lineTo(MAP_SIZE, i);
        ctx.stroke();
      }

      const cx = MAP_SIZE / 2;
      const cy = MAP_SIZE / 2;
      const scale = MAP_SIZE / MAP_RANGE;

      // Draw mobs from global entitiesRef
      if (window._mobEntities) {
        window._mobEntities.forEach(mob => {
          const dx = (mob.position[0] - playerPosition.x) * scale;
          const dz = (mob.position[2] - playerPosition.z) * scale;
          if (Math.abs(dx) < MAP_SIZE / 2 && Math.abs(dz) < MAP_SIZE / 2) {
            ctx.beginPath();
            ctx.arc(cx + dx, cy + dz, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = mob.passive ? '#4ade80' : '#ef4444';
            ctx.fill();
          }
        });
      }

      // Player dot (center)
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Player direction indicator
      ctx.beginPath();
      ctx.moveTo(cx, cy - 4);
      ctx.lineTo(cx - 2.5, cy + 2);
      ctx.lineTo(cx + 2.5, cy + 2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fill();

      // Cardinal N label
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '9px Orbitron, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('N', cx, 10);
    };

    const interval = setInterval(draw, 250);
    draw();
    return () => clearInterval(interval);
  }, [playerPosition]);

  return (
    <div className="absolute bottom-20 right-4 z-20 pointer-events-none">
      <div className="minimap-container">
        <canvas ref={canvasRef} width={MAP_SIZE} height={MAP_SIZE} />
      </div>
      <div className="text-center text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'Orbitron, monospace' }}>
        {playerPosition.x}, {playerPosition.z}
      </div>
    </div>
  );
});

import { useGameStore } from './store/useGameStore';

function App() {
  return (
    <AuthProvider>
      <SoundProvider>
        <GameAppWrapper />
      </SoundProvider>
    </AuthProvider>
  );
}

// Wrapper to provide experience level to GameSystems
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
  const { soundEnabled, setSoundEnabled, musicEnabled, setMusicEnabled, playBackgroundMusic } = useSounds();
  const { playAttack, playSwing, playHit, playDefeat } = useGameSounds();
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [playerPosition, setPlayerPosition] = useState({ x: 0, y: 0, z: 0 });
  const [showAchievements, setShowAchievements] = useState(false);
  const [showSpellUpgrades, setShowSpellUpgrades] = useState(false);
  const [isWorldBuilt, setIsWorldBuilt] = useState(false);

  // Poll for world generation completion to remove the loading screen
  useEffect(() => {
    const interval = setInterval(() => {
      if (window.isSpawnChunkLoaded) {
        setIsWorldBuilt(true);
        clearInterval(interval);

        // Auto-lock the pointer to drop the player into the game once generated
        setTimeout(() => {
          if (document.body.requestPointerLock) {
            document.body.requestPointerLock().catch(e => console.warn('Auto-lock failed:', e));
          }
        }, 100);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Game systems (health, mana, hunger)
  const gameSystems = useGameSystems();

  // Quest & progression system
  const questSystem = useQuestSystem();
  const treasureChests = useTreasureChests(playerPosition);

  // Advanced game features
  const survivalMode = useSurvivalMode(gameState.isDay);
  const bossSystem = useBossSystem(experienceSystem.playerLevel, playerPosition);
  const petSystem = usePetSystem();
  const spellUpgrades = useSpellUpgrades();

  // Expose player level globally for spell upgrade checks
  useEffect(() => {
    window._playerLevel = experienceSystem.playerLevel;
  }, [experienceSystem.playerLevel]);

  // Suppress benign ResizeObserver loop limit exceeded warnings
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

  // PREVENT POINTER LOCK SECURITY ERROR (Iframe/Sandbox support)
  useEffect(() => {
    const originalRequestPointerLock = Element.prototype.requestPointerLock;
    Element.prototype.requestPointerLock = function () {
      try {
        const promise = originalRequestPointerLock.apply(this, arguments);
        if (promise && typeof promise.catch === 'function') {
          return promise.catch(e => {
            console.warn('Pointer lock failed (safely caught):', e);
          });
        }
        return promise;
      } catch (e) {
        console.warn('Pointer lock blocked (safely caught):', e);
      }
    };

    return () => {
      Element.prototype.requestPointerLock = originalRequestPointerLock;
    };
  }, []);

  // Expose combat sounds globally for NPC system
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

  // Start background music
  useEffect(() => {
    if (isPointerLocked && musicEnabled) {
      playBackgroundMusic();
    }
  }, [isPointerLocked, musicEnabled, playBackgroundMusic]);

  // ENHANCED ESC and UI key handlers
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Check if any UI panel is currently open
      const anyPanelOpen = gameState.showInventory || gameState.showCrafting ||
        gameState.showMagic || gameState.showBuildingTools ||
        gameState.showSettings || showAchievements;

      if (event.code === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();

        // If any UI panel is open, close it and return to game
        if (anyPanelOpen) {
          gameState.setShowInventory(false);
          gameState.setShowCrafting(false);
          gameState.setShowMagic(false);
          gameState.setShowBuildingTools(false);
          gameState.setShowSettings(false);
          setShowAchievements(false);
          // Re-lock pointer to return to game
          setTimeout(() => {
            if (document.body.requestPointerLock) {
              document.body.requestPointerLock().catch(e => console.warn(e));
            }
          }, 100);
        } else if (isPointerLocked) {
          // Open settings/pause menu
          gameState.setShowSettings(true);
          if (document.pointerLockElement) {
            document.exitPointerLock();
          }
        } else {
          // Main menu is showing, start the game
          setIsPointerLocked(true);
          setTimeout(() => {
            if (document.body.requestPointerLock) {
              document.body.requestPointerLock().catch(e => console.warn(e));
            }
          }, 100);
        }
        return;
      }

      // UI Panel toggles - only work when in game (not on main menu)
      if (isPointerLocked || anyPanelOpen) {
        const toggleUI = (setter, currentValue) => {
          event.preventDefault();
          event.stopImmediatePropagation();

          // Close all other panels first
          gameState.setShowInventory(false);
          gameState.setShowCrafting(false);
          gameState.setShowMagic(false);
          gameState.setShowBuildingTools(false);
          gameState.setShowSettings(false);

          // Toggle the requested panel
          const newValue = !currentValue;
          setter(newValue);

          // Exit pointer lock for mouse control in panel
          if (newValue && document.pointerLockElement) {
            document.exitPointerLock();
          }

          // If closing panel, re-lock pointer
          if (!newValue) {
            setTimeout(() => {
              if (document.body.requestPointerLock) {
                document.body.requestPointerLock().catch(e => console.warn(e));
              }
            }, 100);
          }
        };

        if (event.code === 'KeyE') toggleUI(gameState.setShowInventory, gameState.showInventory);
        if (event.code === 'KeyC') toggleUI(gameState.setShowCrafting, gameState.showCrafting);
        if (event.code === 'KeyB') toggleUI(gameState.setShowBuildingTools, gameState.showBuildingTools);
      }

      // Spell selection (1-4 keys) - only when in game
      if (isPointerLocked && !anyPanelOpen) {
        if (event.code === 'Digit1') gameState.setActiveSpell('fireball');
        if (event.code === 'Digit2') gameState.setActiveSpell('iceball');
        if (event.code === 'Digit3') gameState.setActiveSpell('lightning');
        if (event.code === 'Digit4') gameState.setActiveSpell('arcane');
      }

      // Q = Claim all completed quests
      if (event.code === 'KeyQ' && isPointerLocked && !anyPanelOpen) {
        event.preventDefault();
        if (questSystem && questSystem.quests) {
          questSystem.quests.forEach(quest => {
            if (quest.progress >= quest.target && !quest.claimed) {
              questSystem.claimQuest(quest.id);
            }
          });
        }
        return;
      }

      if (event.key === 'F3') {
        setShowStats(!showStats);
        event.preventDefault();
        return;
      }

      // Tab = Achievements panel
      if (event.code === 'Tab' && (isPointerLocked || anyPanelOpen)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        gameState.setShowInventory(false);
        gameState.setShowCrafting(false);
        gameState.setShowMagic(false);
        gameState.setShowBuildingTools(false);
        gameState.setShowSettings(false);
        const newVal = !showAchievements;
        setShowAchievements(newVal);
        if (newVal && document.pointerLockElement) document.exitPointerLock();
        if (!newVal) {
          setTimeout(() => {
            if (document.body.requestPointerLock) document.body.requestPointerLock().catch(e => console.warn(e));
          }, 100);
        }
        return;
      }

      // G = Open nearby treasure chest
      if (event.code === 'KeyG' && isPointerLocked && !anyPanelOpen) {
        event.preventDefault();
        if (window.openNearbyChest) {
          const loot = window.openNearbyChest();
          if (loot && loot.length > 0) {
          }
        }
        return;
      }

      // T = Tame nearby passive mob
      if (event.code === 'KeyT' && isPointerLocked && !anyPanelOpen) {
        event.preventDefault();
        // Find nearest passive mob within 3 blocks
        if (window._mobEntities && window.gameCamera) {
          const px = window.gameCamera.position.x, pz = window.gameCamera.position.z;
          let nearest = null, nearestDist = 4;
          window._mobEntities.forEach(mob => {
            if (!mob.passive) return;
            const dx = mob.position[0] - px;
            const dz = mob.position[2] - pz;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < nearestDist) { nearest = mob; nearestDist = d; }
          });
          if (nearest && window.tameMob) {
            window.tameMob(nearest.id, nearest.type, nearest.position);
          }
        }
        return;
      }

      // U = Spell upgrades panel
      if (event.code === 'KeyU' && (isPointerLocked || anyPanelOpen)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        gameState.setShowInventory(false);
        gameState.setShowCrafting(false);
        gameState.setShowMagic(false);
        gameState.setShowBuildingTools(false);
        gameState.setShowSettings(false);
        setShowAchievements(false);
        const newVal = !showSpellUpgrades;
        setShowSpellUpgrades(newVal);
        if (newVal && document.pointerLockElement) document.exitPointerLock();
        if (!newVal) {
          setTimeout(() => {
            if (document.body.requestPointerLock) document.body.requestPointerLock().catch(e => console.warn(e));
          }, 100);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true, passive: false });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [gameState, showStats, isPointerLocked, showAchievements, showSpellUpgrades, questSystem]);

  const handlePointerLockChange = () => {
    try {
      const isLocked = document.pointerLockElement !== null;
      setIsPointerLocked(isLocked);
    } catch (error) {
      setIsPointerLocked(true);
    }
  };

  useEffect(() => {
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => document.removeEventListener('pointerlockchange', handlePointerLockChange);
  }, []);

  // Auto-release pointer lock when player dies so they can click Respawn
  useEffect(() => {
    if (!gameSystems.isAlive && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [gameSystems.isAlive]);

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
      {/* Game Canvas */}
      <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 0 }}>
        <Canvas
          shadows={false}
          className="w-full h-full"
          gl={{
            antialias: true,
            alpha: false,
            depth: true,
            powerPreference: "high-performance"
          }}
          camera={{
            fov: 75,
            near: 0.1,
            far: 500,
            position: [0, 30, 0]
          }}
          onCreated={({ gl, camera }) => {
            gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            // Force horizontal initial gaze so PointerLockControls doesn't cache a -90 degree floor pitch
            camera.rotation.set(0, 0, 0);
            camera.lookAt(0, 30, -100);
          }}
        >
          <MinecraftSky isDay={gameState.isDay} />
          <ambientLight intensity={gameState.isDay ? 0.6 : 0.2} />
          <directionalLight
            position={[50, 50, 25]}
            intensity={gameState.isDay ? 1.2 : 0.3}
          />
          {!gameState.isDay && (
            <pointLight position={[0, 20, 0]} intensity={0.1} distance={30} color="#4169E1" />
          )}

          <PointerLockControls
            makeDefault
          />

          <PositionTracker onPositionUpdate={setPlayerPosition} />

          {/* INSTANCED RENDERING WORLD */}
          <Suspense fallback={null}>
            <Physics gravity={[0, -30, 0]}>
              <MinecraftWorld />

              <Player isWorldBuilt={isWorldBuilt} />

              <EnhancedMagicSystem playerPosition={playerPosition} />

              <NPCSystem />

              {/* Boss Mob 3D Entity */}
              <BossEntity
                bossActive={bossSystem.bossActive}
                bossPositionRef={bossSystem.bossPositionRef}
                bossPhase={bossSystem.bossPhase}
                playerPosition={playerPosition}
              />

              {/* Pet 3D Entities */}
              <PetEntities pets={petSystem.pets} />
            </Physics>
          </Suspense>

          {showStats && <Stats />}
        </Canvas>
      </div>

      {/* Crosshair overlay removed — was blocking all UI clicks.
           Crosshair is rendered separately as a CSS element below. */}

      {/* Generating World Loading Screen */}
      {!isWorldBuilt && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm pointer-events-auto">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-green-500 mb-6 shadow-lg shadow-green-500/50"></div>
          <h2 className="text-3xl font-bold text-white mb-2 font-mono tracking-widest" style={{ textShadow: '0 0 10px rgba(74, 222, 128, 0.8)' }}>
            GENERATING WORLD
          </h2>
          <p className="text-green-400 font-mono text-sm animate-pulse">Building Terrain and Physics Colliders...</p>
        </div>
      )}

      {/* Game UI */}
      <AnimatePresence>
        {isPointerLocked && gameSystems.isAlive && isWorldBuilt && (
          <>
            <GameUI
              gameState={gameState}
              showStats={showStats}
              setShowStats={setShowStats}
              playerPosition={playerPosition}
            />
            <CombatInstructions />

            {/* NEW: Health, Mana, Hunger Bars */}
            <div className="absolute top-16 left-4 pointer-events-none z-20 space-y-2">
              <PlayerHealthBar health={gameSystems.playerHealth} maxHealth={gameSystems.maxHealth} />
              <PlayerManaBar mana={gameSystems.mana} maxMana={gameSystems.maxMana} />
              <PlayerHungerBar hunger={gameSystems.hunger} />
            </div>

            {/* Active Spell Indicator */}
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none">
              <div className="bg-black/60 px-4 py-2 rounded-lg text-white text-sm text-center">
                <span className="text-gray-400">Spell: </span>
                <span style={{ color: gameState.activeSpell === 'fireball' ? '#FF4500' : gameState.activeSpell === 'iceball' ? '#00BFFF' : gameState.activeSpell === 'lightning' ? '#FFD700' : '#9932CC' }}>
                  {gameState.activeSpell.toUpperCase()}
                </span>
                <span className="text-gray-400 ml-2">({SPELL_MANA_COSTS[gameState.activeSpell]} MP)</span>
              </div>
            </div>

            <SimpleExperienceBar
              level={experienceSystem.playerLevel}
              currentXP={experienceSystem.currentXP}
              xpRequired={experienceSystem.xpRequired}
              xpProgress={experienceSystem.xpProgress}
            />

            <SimpleXPGainVisual xpGains={experienceSystem.xpGains} />

            <SimpleLevelUpEffect
              levelUpEffects={experienceSystem.levelUpEffects}
              onEffectComplete={(id) => {
                experienceSystem.setLevelUpEffects(prev =>
                  prev.filter(effect => effect.id !== id)
                );
              }}
            />

            {/* Minimap */}
            <Minimap playerPosition={playerPosition} />

            {/* Quest Tracker */}
            <QuestTracker quests={questSystem.quests} onClaim={questSystem.claimQuest} />

            {/* Notification Popups */}
            <NotificationStack notifications={questSystem.notifications} />

            {/* Chest Proximity Indicator */}
            <ChestIndicator
              playerPosition={playerPosition}
              chests={treasureChests.chests}
              openedChestIds={treasureChests.openedChestIds}
            />

            {/* Pet Indicator */}
            <PetIndicator pets={petSystem.pets} />

            {/* Survival Warning */}
            <AnimatePresence>
              <SurvivalWarning message={survivalMode.survivalWarning} />
            </AnimatePresence>

            {/* Boss Health Bar */}
            <BossHealthBar
              bossActive={bossSystem.bossActive}
              bossHealth={bossSystem.bossHealth}
              bossMaxHealth={bossSystem.bossMaxHealth}
              bossPhase={bossSystem.bossPhase}
            />

            {/* Boss / Pet / Spell Upgrade Notifications */}
            {bossSystem.bossNotification && (
              <div className="absolute top-48 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none">
                <div className="px-6 py-3 rounded-xl text-white font-bold text-sm" style={{
                  background: 'linear-gradient(135deg, rgba(75,0,130,0.9), rgba(139,0,139,0.9))',
                  border: '2px solid #8B00FF',
                  boxShadow: '0 0 25px rgba(139,0,255,0.4)',
                  textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                }}>{bossSystem.bossNotification}</div>
              </div>
            )}
            {petSystem.petNotification && (
              <div className="absolute top-56 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none">
                <div className="px-4 py-2 rounded-lg text-white text-sm font-bold" style={{
                  background: 'rgba(255,105,180,0.9)',
                  border: '1px solid #ff69b4',
                  boxShadow: '0 0 15px rgba(255,105,180,0.4)',
                }}>{petSystem.petNotification}</div>
              </div>
            )}
            {spellUpgrades.upgradeNotification && (
              <div className="absolute top-64 left-1/2 transform -translate-x-1/2 z-30 pointer-events-none">
                <div className="px-4 py-2 rounded-lg text-white text-sm font-bold" style={{
                  background: 'rgba(147,51,234,0.9)',
                  border: '1px solid #9333ea',
                  boxShadow: '0 0 15px rgba(147,51,234,0.4)',
                }}>{spellUpgrades.upgradeNotification}</div>
              </div>
            )}
          </>
        )}
      </AnimatePresence>

      {/* Achievements Panel (Tab key) */}
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

      {/* Spell Upgrades Panel (U key) */}
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

      {/* Damage Overlay */}
      <DamageOverlay active={gameSystems.damageFlash} intensity={gameSystems.screenShake} />

      {/* Death Screen */}
      {!gameSystems.isAlive && (
        <DeathScreen onRespawn={() => {
          gameSystems.respawn();
          if (window.onPlayerDeath) window.onPlayerDeath();
          setIsPointerLocked(true);
        }} />
      )}

      {/* UI Panels */}
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

      {isPointerLocked && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30">
          <div className="w-6 h-6">
            <div className="absolute top-1/2 left-1/2 w-4 h-0.5 bg-white transform -translate-x-1/2 -translate-y-1/2 shadow-lg"></div>
            <div className="absolute top-1/2 left-1/2 w-0.5 h-4 bg-white transform -translate-x-1/2 -translate-y-1/2 shadow-lg"></div>
          </div>
        </div>
      )}

      {/* EPIC MAIN MENU */}
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
              {/* Twinkling Stars */}
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

              {/* Floating Block Particles */}
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
                {/* Wizard Emoji with Float */}
                <motion.div
                  initial={{ y: -40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ type: "spring", duration: 1 }}
                  className="text-7xl mb-2"
                  style={{ animation: 'float 4s ease-in-out infinite' }}
                >
                  🧙‍♂️
                </motion.div>

                {/* Title with Golden Shimmer */}
                <motion.h1
                  className="text-8xl font-bold mb-2 pixel-font shimmer-text"
                  initial={{ scale: 0.3, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", duration: 0.8, delay: 0.2 }}
                >
                  Crafty
                </motion.h1>

                {/* Subtitle */}
                <motion.p
                  className="text-xl mb-10 tracking-wider"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.8 }}
                  style={{ color: 'rgba(200, 180, 255, 0.8)' }}
                >
                  Build • Craft • Cast Spells • Explore Infinite Worlds
                </motion.p>

                {/* Start Button with Glow Pulse */}
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

                {/* Controls hint */}
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
    </div>
  );
}

export default App;
