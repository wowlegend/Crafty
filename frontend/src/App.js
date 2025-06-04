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
  Save
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
  MinecraftHealthHunger
} from './Components';
import { AuthProvider, useAuth } from './AuthContext';
import { AuthModal, UserProfile } from './AuthComponents';
import { WorldManager } from './WorldManager';

// Enhanced Game state management with world persistence
const useGameState = () => {
  const [gameMode, setGameMode] = useState('creative');
  const [selectedBlock, setSelectedBlock] = useState('grass');
  const [worldBlocks, setWorldBlocks] = useState(new Map()); // Store world data
  const [inventory, setInventory] = useState({
    blocks: {
      grass: 64, dirt: 64, stone: 64, wood: 64, glass: 32, water: 16,
      lava: 8, diamond: 4, gold: 8, iron: 16, coal: 32, sand: 64, gravel: 32
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
        if (newTime % 600 === 0) { // Change day/night every 10 minutes
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
      // Convert world data back to Map
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
    inventory, setInventory, showInventory, setShowInventory, showCrafting, setShowCrafting,
    showMagic, setShowMagic, showSettings, setShowSettings, showBuildingTools, setShowBuildingTools,
    showWorldManager, setShowWorldManager, isDay, setIsDay, gameTime, achievements, setAchievements,
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
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [worldSeed, setWorldSeed] = useState('minecraft-clone-' + Date.now());

  // Handle escape key to unlock pointer
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
    setIsPointerLocked(document.pointerLockElement !== null);
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
    <div className="w-full h-screen bg-gradient-to-b from-blue-400 to-blue-600 overflow-hidden relative">
      {/* Enhanced Loading screen with authentication */}
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
                Crafty
              </motion.h1>
              <motion.p 
                className="text-2xl mb-8 text-green-100"
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                Enhanced Building • Magic System • Advanced Tools • World Persistence
              </motion.p>

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

              <motion.button
                onClick={() => document.body.requestPointerLock()}
                className="bg-green-500 hover:bg-green-400 text-white font-bold py-4 px-8 rounded-lg text-xl transition-all duration-200 transform hover:scale-105 shadow-lg pixel-font"
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Start Playing
              </motion.button>
              <p className="text-sm text-green-200 mt-4">
                Click to lock mouse pointer and start the game
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OPTIMIZED Game Canvas - Enhanced depth handling */}
      <Canvas
        camera={{
          fov: 75,
          near: 0.01, // FIXED: Much closer near plane for proper hand rendering
          far: 200,   // INCREASED: Larger view distance
          position: [0, 3, 5]
        }}
        shadows={false}
        className="w-full h-full"
        gl={{ 
          antialias: true,  // ENABLED: Better visual quality
          alpha: false,     // DISABLED: Better performance
          depth: true,      // ENABLED: Proper depth testing
          logarithmicDepthBuffer: true // ENABLED: Better depth precision
        }}
      >
        {/* FULL FEATURED Environment with Error Logging */}
        <MinecraftSky isDay={gameState.isDay} />
        
        {/* Basic Lighting - No complex shadows */}
        <ambientLight intensity={0.7} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow={false}
        />

        {/* Player Controls */}
        <PointerLockControls />
        
        {/* Stable Game World */}
        <MinecraftWorld gameState={gameState} />
        
        {/* Player with Both Hands */}
        <Player gameState={gameState} />

        {/* Performance Stats */}
        {showStats && <Stats />}
      </Canvas>

      {/* Game UI Overlay */}
      <AnimatePresence>
        {isPointerLocked && (
          <GameUI 
            gameState={gameState}
            showStats={showStats}
            setShowStats={setShowStats}
          />
        )}
      </AnimatePresence>

      {/* Enhanced Panels with Authentication and World Management */}
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