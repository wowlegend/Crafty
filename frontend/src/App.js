import React, { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Sky, Stats } from '@react-three/drei';
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
  MinecraftWorld, 
  GameUI, 
  Inventory, 
  CraftingTable, 
  MagicSystem,
  BuildingTools,
  SettingsPanel,
  MinecraftSky,
  MinecraftHotbar,
  MinecraftHealthHunger,
  PositionTracker
} from './Components';
import { Player } from './Components'; // Fixed import - Player is in Components.js now
import { AuthProvider, useAuth } from './AuthContext';
import { AuthModal, UserProfile } from './AuthComponents';
import { WorldManager } from './WorldManager';
import { SoundProvider, useSounds, useGameSounds } from './SoundManager';
import { NPCSystem, TradingInterface, CombatInstructions } from './SimplifiedNPCSystem';

// Import experience system for UI outside Canvas
import { useSimpleExperience, SimpleXPGainVisual, SimpleLevelUpEffect, SimpleExperienceBar } from './SimpleExperienceSystem';

// Game state management
const useGameState = () => {
  const [gameMode, setGameMode] = useState('creative');
  const [selectedBlock, setSelectedBlock] = useState('grass');
  const [worldBlocks, setWorldBlocks] = useState(new Map());
  const [activeSpell, setActiveSpell] = useState(null);
  const [showTradingInterface, setShowTradingInterface] = useState(false);
  const [selectedVillager, setSelectedVillager] = useState(null);
  const [inventory, setInventory] = useState({
    blocks: {
      grass: 64, dirt: 64, stone: 64, wood: 64, glass: 32, water: 16,
      lava: 8, diamond: 4, gold: 8, iron: 16, coal: 32, sand: 64, cobblestone: 32
    },
    tools: { pickaxe: 1, shovel: 1, axe: 1, sword: 1 },
    magic: { wand: 1, crystals: 8, scrolls: 4 }
  });
  const [showInventory, setShowInventory] = useState(false);
  const [showCrafting, setShowCrafting] = useState(false);
  const [showMagic, setShowMagic] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBuildingTools, setShowBuildingTools] = useState(false);
  const [showWorldManager, setShowWorldManager] = useState(false);
  const [isDay, setIsDay] = useState(true);
  const [gameTime, setGameTime] = useState(0);
  const [achievements, setAchievements] = useState([]);
  const [playerStats, setPlayerStats] = useState({
    blocksPlaced: 0, blocksDestroyed: 0, distanceTraveled: 0, timeplayed: 0
  });

  // Time cycle
  useEffect(() => {
    const timer = setInterval(() => {
      setGameTime(prev => {
        const newTime = prev + 1;
        if (newTime % 600 === 0) {
          setIsDay(prev => !prev);
        }
        return newTime;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const addToInventory = (item, quantity = 1) => {
    setInventory(prev => ({
      ...prev,
      blocks: { ...prev.blocks, [item]: (prev.blocks[item] || 0) + quantity }
    }));
  };

  const removeFromInventory = (item, quantity = 1) => {
    setInventory(prev => ({
      ...prev,
      blocks: { ...prev.blocks, [item]: Math.max(0, (prev.blocks[item] || 0) - quantity) }
    }));
  };

  // Save/Load functionality
  const saveGame = async () => {
    try {
      const authData = JSON.parse(localStorage.getItem('authToken') || '{}');
      if (!authData.token) {
        alert('Please log in to save your game');
        return;
      }

      const saveData = {
        save_name: `Save_${new Date().toLocaleString()}`,
        world_data: { blocks: worldBlocks }, // Note: Map needs serialization handling if sent as JSON
        player_data: { 
          position: { x: 0, y: 18, z: 0 }, 
          inventory: inventory,
          stats: playerStats
        },
        game_state: {
          gameMode,
          selectedBlock,
          activeSpell,
          isDay,
          gameTime,
          achievements
        }
      };

      // Simple map serialization for the example
      const serializedBlocks = Array.from(worldBlocks.entries());
      const payload = { ...saveData, world_data: { blocks: serializedBlocks } };

      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/world/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authData.token}`
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Game saved successfully: ${result.save_name}`);
        console.log('✅ Game saved:', result);
      } else {
        throw new Error('Failed to save game');
      }
    } catch (error) {
      console.error('❌ Save error:', error);
      alert('Failed to save game. Please try again.');
    }
  };

  const loadGame = async () => {
    try {
      const authData = JSON.parse(localStorage.getItem('authToken') || '{}');
      if (!authData.token) {
        alert('Please log in to load your game');
        return;
      }

      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/world/saves`, {
        headers: {
          'Authorization': `Bearer ${authData.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch saves');
      }

      const { saves } = await response.json();
      
      if (saves.length === 0) {
        alert('No saved games found');
        return;
      }

      const mostRecentSave = saves[0];
      
      const loadResponse = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/world/load/${mostRecentSave.save_id}`, {
        headers: {
          'Authorization': `Bearer ${authData.token}`
        }
      });

      if (!loadResponse.ok) {
        throw new Error('Failed to load game');
      }

      const saveData = await loadResponse.json();
      
      // Restore game state
      if (saveData.world_data?.blocks) setWorldBlocks(new Map(saveData.world_data.blocks));
      if (saveData.player_data?.inventory) setInventory(saveData.player_data.inventory);
      if (saveData.player_data?.stats) setPlayerStats(saveData.player_data.stats);
      if (saveData.game_state?.gameMode) setGameMode(saveData.game_state.gameMode);
      if (saveData.game_state?.selectedBlock) setSelectedBlock(saveData.game_state.selectedBlock);
      if (saveData.game_state?.activeSpell) setActiveSpell(saveData.game_state.activeSpell);
      if (saveData.game_state?.isDay !== undefined) setIsDay(saveData.game_state.isDay);
      if (saveData.game_state?.gameTime) setGameTime(saveData.game_state.gameTime);
      if (saveData.game_state?.achievements) setAchievements(saveData.game_state.achievements);

      alert(`Game loaded successfully: ${saveData.save_name}`);
      console.log('✅ Game loaded:', saveData);
    } catch (error) {
      console.error('❌ Load error:', error);
      alert('Failed to load game. Please try again.');
    }
  };

  return {
    gameMode, setGameMode, selectedBlock, setSelectedBlock, worldBlocks, setWorldBlocks,
    activeSpell, setActiveSpell, showTradingInterface, setShowTradingInterface,
    selectedVillager, setSelectedVillager, inventory, setInventory, 
    showInventory, setShowInventory, showCrafting, setShowCrafting,
    showMagic, setShowMagic, showSettings, setShowSettings, 
    showBuildingTools, setShowBuildingTools, showWorldManager, setShowWorldManager, 
    isDay, setIsDay, gameTime, achievements, setAchievements,
    playerStats, setPlayerStats, addToInventory, removeFromInventory, 
    saveGame, loadGame
  };
};

function App() {
  return (
    <AuthProvider>
      <SoundProvider>
        <GameApp />
      </SoundProvider>
    </AuthProvider>
  );
}

function GameApp() {
  const gameState = useGameState();
  const { isAuthenticated, loading } = useAuth();
  const { soundEnabled, setSoundEnabled, musicEnabled, setMusicEnabled, playBackgroundMusic } = useSounds();
  const { playAttack, playSwing, playHit, playDefeat } = useGameSounds();
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [playerPosition, setPlayerPosition] = useState({ x: 0, y: 0, z: 0 });

  // Initialize experience system
  const experienceSystem = useSimpleExperience();
  
  // PREVENT RUNTIME ERROR: ResizeObserver loop limit exceeded
  useEffect(() => {
    const resizeObserverError = (e) => {
      if (e.message === 'ResizeObserver loop limit exceeded') {
        const resizeObserverErrDiv = document.getElementById(
          'webpack-dev-server-client-overlay-div'
        );
        const resizeObserverErrStyle = document.getElementById(
          'webpack-dev-server-client-overlay'
        );
        if (resizeObserverErrDiv) resizeObserverErrDiv.setAttribute('style', 'display: none');
        if (resizeObserverErrStyle) resizeObserverErrStyle.setAttribute('style', 'display: none');
      }
    };
    window.addEventListener('error', resizeObserverError);
    return () => window.removeEventListener('error', resizeObserverError);
  }, []);

  // PREVENT POINTER LOCK SECURITY ERROR (Iframe/Sandbox support)
  useEffect(() => {
    const originalRequestPointerLock = Element.prototype.requestPointerLock;
    Element.prototype.requestPointerLock = function() {
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

  // Start background music
  useEffect(() => {
    if (isPointerLocked && musicEnabled) {
      playBackgroundMusic();
    }
  }, [isPointerLocked, musicEnabled, playBackgroundMusic]);

  // ENHANCED ESC and UI key handlers
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        
        if (gameState.showSettings) {
          gameState.setShowSettings(false);
        } else {
          setIsPointerLocked(false);
          gameState.setShowSettings(true);
          if (document.pointerLockElement) {
            document.exitPointerLock();
          }
        }
        return;
      }
      
      const toggleUI = (setter, value) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        setIsPointerLocked(false);
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
        setter(!value);
      };

      if (event.code === 'KeyE') toggleUI(gameState.setShowInventory, gameState.showInventory);
      if (event.code === 'KeyC') toggleUI(gameState.setShowCrafting, gameState.showCrafting);
      if (event.code === 'KeyM') toggleUI(gameState.setShowMagic, gameState.showMagic);
      if (event.code === 'KeyB') toggleUI(gameState.setShowBuildingTools, gameState.showBuildingTools);
      
      if (event.key === 'F3') {
        setShowStats(!showStats);
        event.preventDefault();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true, passive: false });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [gameState, showStats]);

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
          onCreated={({ gl }) => {
            gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
            selector="#game-canvas-overlay" // Important: Only lock when clicking the overlay, not the menu
          />
          
          <PositionTracker onPositionUpdate={setPlayerPosition} />
          
          {/* INSTANCED RENDERING WORLD */}
          <MinecraftWorld gameState={gameState} />
          
          <Player 
            gameState={gameState} 
          />

          <NPCSystem gameState={gameState} />

          {showStats && <Stats />}
        </Canvas>
      </div>

      {/* Overlay for PointerLock - Only visible when we want to capture clicks */}
      {isPointerLocked && (
        <div id="game-canvas-overlay" className="absolute inset-0 z-10" />
      )}

      {/* Game UI */}
      <AnimatePresence>
        {isPointerLocked && (
          <>
            <GameUI 
              gameState={gameState}
              showStats={showStats}
              setShowStats={setShowStats}
              playerPosition={playerPosition}
            />
            <CombatInstructions />
            
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
          </>
        )}
      </AnimatePresence>

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
        {gameState.showMagic && (
          <MagicSystem 
            gameState={gameState}
            onClose={() => {
              gameState.setShowMagic(false);
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

      {/* MAIN MENU - HIGH Z-INDEX FIX */}
      <AnimatePresence>
        {!isPointerLocked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center pointer-events-auto"
            style={{ zIndex: 9999, background: 'linear-gradient(to bottom right, #1a202c, #2d3748)' }}
          >
             <div className="text-center text-white max-w-lg mx-4">
              <motion.h1 
                className="text-8xl font-bold mb-4 pixel-font text-shadow-lg"
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", duration: 0.8 }}
              >
                🧙‍♂️ Crafty
              </motion.h1>
              <p className="text-2xl mb-8 text-green-100">
                FIXED: High Performance • Infinite World • Working Menu
              </p>

              <button
                onClick={() => {
                  console.log('🎮 Starting game...');
                  setIsPointerLocked(true);
                  // Allow time for state update before requesting lock
                  setTimeout(() => {
                    if (document.body.requestPointerLock) {
                      document.body.requestPointerLock().catch(e => console.warn(e));
                    }
                  }, 100);
                }}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-4 px-8 rounded-lg text-xl transition-all duration-200 transform hover:scale-105 shadow-lg pixel-font"
              >
                🧙‍♂️ Start Magical Adventure
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
