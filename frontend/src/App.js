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
  EyeOff
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

// Game state management
const useGameState = () => {
  const [gameMode, setGameMode] = useState('creative'); // 'creative' | 'survival'
  const [selectedBlock, setSelectedBlock] = useState('grass');
  const [inventory, setInventory] = useState({
    blocks: {
      grass: 64,
      dirt: 64,
      stone: 64,
      wood: 64,
      glass: 32,
      water: 16,
      lava: 8,
      diamond: 4,
      gold: 8,
      iron: 16,
      coal: 32,
      sand: 64,
      gravel: 32
    },
    tools: {
      pickaxe: 1,
      shovel: 1,
      axe: 1,
      sword: 1
    },
    magic: {
      wand: 1,
      crystals: 8,
      scrolls: 4
    }
  });
  const [showInventory, setShowInventory] = useState(false);
  const [showCrafting, setShowCrafting] = useState(false);
  const [showMagic, setShowMagic] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBuildingTools, setShowBuildingTools] = useState(false);
  const [isDay, setIsDay] = useState(true);
  const [gameTime, setGameTime] = useState(0);
  const [achievements, setAchievements] = useState([]);
  const [playerStats, setPlayerStats] = useState({
    blocksPlaced: 0,
    blocksDestroyed: 0,
    distanceTraveled: 0,
    timeplayed: 0
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
      blocks: {
        ...prev.blocks,
        [item]: (prev.blocks[item] || 0) + quantity
      }
    }));
  };

  const removeFromInventory = (item, quantity = 1) => {
    setInventory(prev => ({
      ...prev,
      blocks: {
        ...prev.blocks,
        [item]: Math.max(0, (prev.blocks[item] || 0) - quantity)
      }
    }));
  };

  return {
    gameMode, setGameMode,
    selectedBlock, setSelectedBlock,
    inventory, setInventory,
    showInventory, setShowInventory,
    showCrafting, setShowCrafting,
    showMagic, setShowMagic,
    showSettings, setShowSettings,
    showBuildingTools, setShowBuildingTools,
    isDay, setIsDay,
    gameTime,
    achievements, setAchievements,
    playerStats, setPlayerStats,
    addToInventory,
    removeFromInventory
  };
};

function App() {
  const gameState = useGameState();
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [showStats, setShowStats] = useState(false);
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

  return (
    <div className="w-full h-screen bg-gradient-to-b from-blue-400 to-blue-600 overflow-hidden relative">
      {/* Loading screen */}
      <AnimatePresence>
        {!isPointerLocked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-gradient-to-br from-green-600 via-green-700 to-green-900 flex items-center justify-center"
          >
            <div className="text-center text-white">
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
                Enhanced Building • Magic System • Advanced Tools
              </motion.p>
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

      {/* Stable Game Canvas - Simplified for performance */}
      <Canvas
        camera={{
          fov: 75,
          near: 0.1,
          far: 100,
          position: [0, 3, 5]
        }}
        shadows={false} // Disabled to prevent errors
        className="w-full h-full"
        gl={{ antialias: false }}
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

      {/* Panels */}
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
      </AnimatePresence>

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