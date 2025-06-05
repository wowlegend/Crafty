import React, { useState, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
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
  Player, 
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

  const loadWorldData = (worldData) => {
    if (worldData.world_data) {
      const blockMap = new Map();
      Object.entries(worldData.world_data).forEach(([key, value]) => {
        blockMap.set(key, value);
      });
      setWorldBlocks(blockMap);
    }
    
    if (worldData.settings) {
      const settings = worldData.settings;
      if (settings.gameMode) setGameMode(settings.gameMode);
      if (settings.isDay !== undefined) setIsDay(settings.isDay);
      if (settings.inventory) setInventory(settings.inventory);
      if (settings.playerStats) setPlayerStats(settings.playerStats);
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
    playerStats, setPlayerStats, addToInventory, removeFromInventory, loadWorldData
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
  const [worldSeed, setWorldSeed] = useState('minecraft-clone-' + Date.now());
  const [playerPosition, setPlayerPosition] = useState({ x: 0, y: 0, z: 0 });

  // Initialize experience system
  const experienceSystem = useSimpleExperience();

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

  // Basic key handlers
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsPointerLocked(false);
        event.preventDefault();
      }
      if (event.key === 'e' || event.key === 'E') {
        gameState.setShowInventory(!gameState.showInventory);
      }
      if (event.key === 'c' || event.key === 'C') {
        gameState.setShowCrafting(!gameState.showCrafting);
      }
      if (event.key === 'm' || event.key === 'M') {
        gameState.setShowMagic(!gameState.showMagic);
      }
      if (event.key === 'b' || event.key === 'B') {
        gameState.setShowBuildingTools(!gameState.showBuildingTools);
      }
      if (event.key === 'F3') {
        setShowStats(!showStats);
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.showInventory, gameState.showCrafting, gameState.showMagic, gameState.showBuildingTools, showStats]);

  const handlePointerLockChange = () => {
    // BULLETPROOF pointer lock state handling
    try {
      const isLocked = document.pointerLockElement !== null;
      setIsPointerLocked(isLocked);
    } catch (error) {
      // If we can't check, assume we're locked (iframe fallback)
      setIsPointerLocked(true);
    }
  };

  useEffect(() => {
    // COMPREHENSIVE event listener setup with error handling
    try {
      document.addEventListener('pointerlockchange', handlePointerLockChange);
      document.addEventListener('pointerlockerror', (event) => {
        console.log('⚠️ Pointer lock error - continuing anyway');
        setIsPointerLocked(true);
      });
      
      // Also handle vendor prefixes
      document.addEventListener('webkitpointerlockchange', handlePointerLockChange);
      document.addEventListener('mozpointerlockchange', handlePointerLockChange);
    } catch (error) {
      console.log('⚠️ Event listener setup failed - using fallback mode');
      setIsPointerLocked(true);
    }
    
    return () => {
      // SAFE cleanup
      try {
        document.removeEventListener('pointerlockchange', handlePointerLockChange);
        document.removeEventListener('pointerlockerror', () => {});
        document.removeEventListener('webkitpointerlockchange', handlePointerLockChange);
        document.removeEventListener('mozpointerlockchange', handlePointerLockChange);
      } catch (error) {
        // Ignore cleanup errors
      }
    };
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
    <div className="w-full h-screen bg-gradient-to-b from-blue-400 to-blue-600 overflow-hidden relative">
      {/* Basic Loading screen */}
      <AnimatePresence>
        {!isPointerLocked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-gradient-to-br from-green-600 via-green-700 to-green-900 flex items-center justify-center"
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
              <motion.p 
                className="text-2xl mb-8 text-green-100"
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                ENHANCED: Magic System • Experience • Wind Grass • Fixed Errors
              </motion.p>

              {/* Experience Display */}
              <motion.div
                className="mb-6 bg-black/30 rounded-lg p-4"
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <div className="text-yellow-400 font-bold text-lg mb-2">
                  🌟 Level {experienceSystem.playerLevel} Mage
                </div>
                <div className="text-sm text-blue-200">
                  XP: {experienceSystem.currentXP} / {experienceSystem.xpRequired}
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                  <div 
                    className="bg-gradient-to-r from-yellow-400 to-yellow-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${experienceSystem.xpProgress}%` }}
                  ></div>
                </div>
              </motion.div>
              <motion.div
                className="mb-6 text-left bg-black/20 rounded-lg p-4"
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <div className="text-center text-yellow-400 font-bold mb-3">🎮 Enhanced Controls</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>🔮 <strong>F:</strong> Cast Spell</div>
                  <div>🔄 <strong>Q:</strong> Change Spell</div>
                  <div>📦 <strong>E:</strong> Inventory</div>
                  <div>⚒️ <strong>C:</strong> Crafting</div>
                  <div>✨ <strong>M:</strong> Magic</div>
                  <div>🏗️ <strong>B:</strong> Building</div>
                </div>
              </motion.div>

              {/* Authentication Status */}
              {isAuthenticated ? (
                <div className="mb-6">
                  <UserProfile onShowWorldManager={() => gameState.setShowWorldManager(true)} />
                </div>
              ) : (
                <motion.div
                  className="mb-6"
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  <p className="text-green-200 mb-4">Sign in to save worlds and access multiplayer features</p>
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-lg text-lg transition-all duration-200 transform hover:scale-105 shadow-lg pixel-font mr-4"
                  >
                    <LogIn className="inline mr-2" size={20} />
                    Sign In / Register
                  </button>
                </motion.div>
              )}

              {/* Sound Controls */}
              <div className="mb-6 flex justify-center space-x-4">
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`p-3 rounded-lg transition-all ${
                    soundEnabled ? 'bg-green-600 hover:bg-green-500' : 'bg-gray-600 hover:bg-gray-500'
                  } text-white`}
                  title={soundEnabled ? 'Disable Sound' : 'Enable Sound'}
                >
                  {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                </button>
                <button
                  onClick={() => setMusicEnabled(!musicEnabled)}
                  className={`p-3 rounded-lg transition-all ${
                    musicEnabled ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-600 hover:bg-gray-500'
                  } text-white`}
                  title={musicEnabled ? 'Disable Music' : 'Enable Music'}
                >
                  {musicEnabled ? '🎵' : '🔇'}
                </button>
              </div>

              <motion.button
                onClick={() => {
                  // BULLETPROOF iframe detection and handling
                  console.log('🎮 Starting game...');
                  
                  // Method 1: Check if we can access window.top (most reliable)
                  let isInIframe = false;
                  try {
                    isInIframe = window.self !== window.top;
                  } catch (e) {
                    // SecurityError means we're definitely in a cross-origin iframe
                    isInIframe = true;
                  }
                  
                  // Method 2: Check for frameElement (secondary check)
                  try {
                    if (window.frameElement !== null) {
                      isInIframe = true;
                    }
                  } catch (e) {
                    // Cross-origin iframe
                    isInIframe = true;
                  }
                  
                  // Method 3: Check URL for iframe indicators
                  if (window.location.href.includes('preview') || 
                      window.location.href.includes('embed') ||
                      window.location.href.includes('iframe')) {
                    isInIframe = true;
                  }
                  
                  if (isInIframe) {
                    console.log('🔒 Iframe detected - starting without pointer lock');
                    setIsPointerLocked(true);
                    return;
                  }
                  
                  // For standalone windows, try pointer lock with comprehensive fallbacks
                  if (!document.body) {
                    console.log('⚠️ No document.body - starting without pointer lock');
                    setIsPointerLocked(true);
                    return;
                  }
                  
                  // Check if requestPointerLock exists
                  if (typeof document.body.requestPointerLock !== 'function') {
                    console.log('⚠️ Pointer lock not supported - starting anyway');
                    setIsPointerLocked(true);
                    return;
                  }
                  
                  // Try pointer lock with ultimate error handling
                  try {
                    const lockPromise = document.body.requestPointerLock();
                    
                    // Handle promise-based API
                    if (lockPromise && typeof lockPromise.catch === 'function') {
                      lockPromise.catch((error) => {
                        console.log('🔄 Pointer lock promise failed - starting anyway');
                        setIsPointerLocked(true);
                      });
                    }
                    
                    // Fallback timeout
                    setTimeout(() => {
                      if (!document.pointerLockElement) {
                        console.log('⏰ Pointer lock timeout - starting anyway');
                        setIsPointerLocked(true);
                      }
                    }, 150);
                    
                  } catch (error) {
                    console.log('❌ Pointer lock error - starting anyway');
                    setIsPointerLocked(true);
                  }
                }}
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-4 px-8 rounded-lg text-xl transition-all duration-200 transform hover:scale-105 shadow-lg pixel-font"
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                🧙‍♂️ Start Magical Adventure
              </motion.button>
              <p className="text-sm text-green-200 mt-4">
                Click to lock mouse pointer and begin your magical journey
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FIXED Game Canvas with proper camera settings */}
      <Canvas
        shadows={false}
        className="w-full h-full"
        gl={{ 
          antialias: true,
          alpha: false,
          depth: true,
          powerPreference: "high-performance"
        }}
        performance={{ min: 0.3 }}
        camera={{
          fov: 75,
          near: 0.1,
          far: 500,
          position: [0, 18, 0]
        }}
        onCreated={({ gl }) => {
          // Optimize WebGL settings for performance
          gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
          gl.shadowMap.enabled = false; // Disable shadows for performance
          
          // NO camera manipulation here - let PointerLockControls handle it
        }}
      >
        {/* Enhanced lighting */}
        <MinecraftSky isDay={gameState.isDay} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[50, 50, 25]} intensity={1.2} castShadow={false} />

        {/* Player Controls - Mouse Look Only */}
        <PointerLockControls makeDefault />
        
        {/* Position tracker */}
        <PositionTracker onPositionUpdate={setPlayerPosition} />
        
        {/* FIXED Game World with throttled infinite generation */}
        <MinecraftWorld gameState={gameState} />
        
        {/* FIXED Player with properly positioned hands */}
        <Player gameState={gameState} />

        {/* NPCs */}
        <NPCSystem gameState={gameState} />

        {/* Performance Stats */}
        {showStats && <Stats />}
      </Canvas>

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
            
            {/* Experience System UI - Outside Canvas */}
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
            onClose={() => gameState.setShowInventory(false)}
          />
        )}
        
        {gameState.showCrafting && (
          <CraftingTable 
            gameState={gameState}
            onClose={() => gameState.setShowCrafting(false)}
          />
        )}
        
        {gameState.showMagic && (
          <MagicSystem 
            gameState={gameState}
            onClose={() => gameState.setShowMagic(false)}
          />
        )}
        
        {gameState.showBuildingTools && (
          <BuildingTools 
            gameState={gameState}
            onClose={() => gameState.setShowBuildingTools(false)}
          />
        )}
        
        {gameState.showSettings && (
          <SettingsPanel 
            gameState={gameState}
            onClose={() => gameState.setShowSettings(false)}
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

      {/* Trading Interface */}
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

      {/* Authentication Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />

      {/* Crosshair */}
      {isPointerLocked && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30">
          <div className="w-6 h-6">
            <div className="absolute top-1/2 left-1/2 w-4 h-0.5 bg-white transform -translate-x-1/2 -translate-y-1/2 shadow-lg"></div>
            <div className="absolute top-1/2 left-1/2 w-0.5 h-4 bg-white transform -translate-x-1/2 -translate-y-1/2 shadow-lg"></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
