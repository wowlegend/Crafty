import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Globe,
  Lock,
  Users,
  Calendar,
  Settings,
  Trash2,
  Download,
  Upload,
  Save
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from './AuthContext';

export const WorldManager = ({ gameState, onWorldLoad, onClose }) => {
  const { user } = useAuth();
  const [worlds, setWorlds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('my-worlds');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWorldName, setNewWorldName] = useState('');
  const [newWorldPublic, setNewWorldPublic] = useState(false);
  const [error, setError] = useState('');

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';

  const getLocalWorlds = () => {
    try {
      const data = localStorage.getItem('crafty_world_saves');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  };

  const saveLocalWorlds = (list) => {
    localStorage.setItem('crafty_world_saves', JSON.stringify(list));
  };

  useEffect(() => {
    loadWorlds();
  }, []);

  const loadWorlds = async () => {
    try {
      setLoading(true);
      setError('');
      if (user) {
        const response = await axios.get(`${BACKEND_URL}/api/worlds`);
        setWorlds(response.data);
      } else {
        const localList = getLocalWorlds();
        setWorlds(localList);
      }
    } catch (error) {
      console.warn('Backend load failed, falling back to LocalStorage:', error);
      const localList = getLocalWorlds();
      setWorlds(localList);
    } finally {
      setLoading(false);
    }
  };

  const saveCurrentWorld = async () => {
    try {
      setError('');
      const name = `${user?.username || 'Guest'}'s World - ${new Date().toLocaleDateString()}`;
      const worldData = {
        name,
        world_data: { blocks: Array.from(gameState.worldBlocks.entries()) },
        player_data: {
          position: { x: 0, y: 18, z: 0 },
          inventory: gameState.inventory,
          stats: gameState.playerStats
        },
        game_state: {
          gameMode: gameState.gameMode,
          selectedBlock: gameState.selectedBlock,
          activeSpell: gameState.activeSpell,
          isDay: gameState.isDay,
          gameTime: gameState.gameTime,
          achievements: gameState.achievements
        },
        is_public: false
      };

      if (user) {
        await axios.post(`${BACKEND_URL}/api/worlds`, worldData);
        loadWorlds();
        setError('World saved to cloud successfully!');
      } else {
        const localList = getLocalWorlds();
        const id = `local_${Date.now()}`;
        const newMetadata = {
          id,
          name,
          created_at: new Date().toISOString(),
          is_public: false,
          is_owner: true
        };
        localList.unshift(newMetadata);
        saveLocalWorlds(localList);
        localStorage.setItem(`crafty_world_save_${id}`, JSON.stringify({ ...newMetadata, ...worldData }));
        
        setWorlds(localList);
        setError('World saved to LocalStorage successfully!');
      }
    } catch (error) {
      console.warn('Backend save failed, saving to LocalStorage instead:', error);
      const name = `${user?.username || 'Guest'}'s World - ${new Date().toLocaleDateString()}`;
      const worldData = {
        name,
        world_data: { blocks: Array.from(gameState.worldBlocks.entries()) },
        player_data: {
          position: { x: 0, y: 18, z: 0 },
          inventory: gameState.inventory,
          stats: gameState.playerStats
        },
        game_state: {
          gameMode: gameState.gameMode,
          selectedBlock: gameState.selectedBlock,
          activeSpell: gameState.activeSpell,
          isDay: gameState.isDay,
          gameTime: gameState.gameTime,
          achievements: gameState.achievements
        },
        is_public: false
      };
      const localList = getLocalWorlds();
      const id = `local_${Date.now()}`;
      const newMetadata = {
        id,
        name,
        created_at: new Date().toISOString(),
        is_public: false,
        is_owner: true
      };
      localList.unshift(newMetadata);
      saveLocalWorlds(localList);
      localStorage.setItem(`crafty_world_save_${id}`, JSON.stringify({ ...newMetadata, ...worldData }));
      
      setWorlds(localList);
      setError('World saved to LocalStorage successfully (offline fallback)!');
    }
  };

  const createWorld = async () => {
    if (!newWorldName.trim()) {
      setError('Please enter a world name');
      return;
    }

    try {
      setError('');
      const worldData = {
        name: newWorldName,
        world_data: { blocks: [] },
        player_data: {
          position: { x: 0, y: 18, z: 0 },
          inventory: gameState.inventory,
          stats: { blocksPlaced: 0, blocksDestroyed: 0 }
        },
        game_state: {
          gameMode: 'creative',
          selectedBlock: 'grass',
          activeSpell: 'fireball',
          isDay: true,
          gameTime: 0,
          achievements: []
        },
        is_public: newWorldPublic
      };

      if (user) {
        await axios.post(`${BACKEND_URL}/api/worlds`, worldData);
        setNewWorldName('');
        setNewWorldPublic(false);
        setShowCreateModal(false);
        loadWorlds();
      } else {
        const localList = getLocalWorlds();
        const id = `local_${Date.now()}`;
        const newMetadata = {
          id,
          name: newWorldName,
          created_at: new Date().toISOString(),
          is_public: newWorldPublic,
          is_owner: true
        };
        localList.unshift(newMetadata);
        saveLocalWorlds(localList);
        localStorage.setItem(`crafty_world_save_${id}`, JSON.stringify({ ...newMetadata, ...worldData }));
        
        setNewWorldName('');
        setNewWorldPublic(false);
        setShowCreateModal(false);
        setWorlds(localList);
        setError('New world created locally!');
      }
    } catch (error) {
      console.warn('Backend create failed, creating locally instead:', error);
      const localList = getLocalWorlds();
      const id = `local_${Date.now()}`;
      const newMetadata = {
        id,
        name: newWorldName,
        created_at: new Date().toISOString(),
        is_public: newWorldPublic,
        is_owner: true
      };
      localList.unshift(newMetadata);
      saveLocalWorlds(localList);
      localStorage.setItem(`crafty_world_save_${id}`, JSON.stringify({
        ...newMetadata,
        world_data: { blocks: [] },
        player_data: {
          position: { x: 0, y: 18, z: 0 },
          inventory: gameState.inventory,
          stats: { blocksPlaced: 0, blocksDestroyed: 0 }
        },
        game_state: {
          gameMode: 'creative',
          selectedBlock: 'grass',
          activeSpell: 'fireball',
          isDay: true,
          gameTime: 0,
          achievements: []
        }
      }));
      
      setNewWorldName('');
      setNewWorldPublic(false);
      setShowCreateModal(false);
      setWorlds(localList);
      setError('New world created locally (offline fallback)!');
    }
  };

  const loadWorld = async (worldId) => {
    try {
      setError('');
      let worldData;
      
      if (typeof worldId === 'string' && worldId.startsWith('local_')) {
        const stored = localStorage.getItem(`crafty_world_save_${worldId}`);
        if (!stored) throw new Error('Local save not found');
        worldData = JSON.parse(stored);
      } else {
        const response = await axios.get(`${BACKEND_URL}/api/worlds/${worldId}`);
        worldData = response.data;
      }

      if (onWorldLoad) {
        onWorldLoad(worldData);
      }

      onClose();
    } catch (error) {
      setError('Failed to load world');
      console.error('Error loading world:', error);
    }
  };

  const deleteWorld = async (worldId) => {
    if (!window.confirm('Are you sure you want to delete this world?')) {
      return;
    }

    try {
      setError('');
      if (typeof worldId === 'string' && worldId.startsWith('local_')) {
        const localList = getLocalWorlds().filter(w => w.id !== worldId);
        saveLocalWorlds(localList);
        localStorage.removeItem(`crafty_world_save_${worldId}`);
        setWorlds(localList);
        setError('World deleted locally.');
      } else {
        await axios.delete(`${BACKEND_URL}/api/worlds/${worldId}`);
        loadWorlds();
      }
    } catch (error) {
      setError('Failed to delete world');
      console.error('Error deleting world:', error);
    }
  };

  const myWorlds = worlds.filter(world => world.is_owner || (typeof world.id === 'string' && world.id.startsWith('local_')));
  const publicWorlds = worlds.filter(world => world.is_public && !world.is_owner && !(typeof world.id === 'string' && world.id.startsWith('local_')));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute inset-0 bg-black/50 flex items-center justify-center z-30"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">World Manager</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {error && (
          <div className={`mb-4 p-3 rounded ${error.includes('success') ? 'bg-green-600' : 'bg-red-600'
            } text-white`}>
            {error}
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={saveCurrentWorld}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded"
          >
            <Save size={16} />
            Save Current World
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded"
          >
            <Plus size={16} />
            Create New World
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 mb-6">
          <button
            onClick={() => setActiveTab('my-worlds')}
            className={`px-4 py-2 rounded-t ${activeTab === 'my-worlds'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300'
              }`}
          >
            My Worlds ({myWorlds.length})
          </button>
          <button
            onClick={() => setActiveTab('public-worlds')}
            className={`px-4 py-2 rounded-t ${activeTab === 'public-worlds'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300'
              }`}
          >
            Public Worlds ({publicWorlds.length})
          </button>
        </div>

        {/* World List */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center text-gray-400 py-8">Loading worlds...</div>
          ) : (
            <>
              {activeTab === 'my-worlds' && (
                <>
                  {myWorlds.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">
                      No worlds yet. Create your first world!
                    </div>
                  ) : (
                    myWorlds.map(world => (
                      <WorldCard
                        key={world.id}
                        world={world}
                        onLoad={loadWorld}
                        onDelete={deleteWorld}
                        isOwner={true}
                      />
                    ))
                  )}
                </>
              )}

              {activeTab === 'public-worlds' && (
                <>
                  {publicWorlds.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">
                      No public worlds available
                    </div>
                  ) : (
                    publicWorlds.map(world => (
                      <WorldCard
                        key={world.id}
                        world={world}
                        onLoad={loadWorld}
                        isOwner={false}
                      />
                    ))
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Create World Modal */}
        <AnimatePresence>
          {showCreateModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                className="bg-gray-700 rounded-lg p-6 max-w-md w-full mx-4"
              >
                <h3 className="text-xl font-bold text-white mb-4">Create New World</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-white font-medium mb-2">World Name</label>
                    <input
                      type="text"
                      value={newWorldName}
                      onChange={(e) => setNewWorldName(e.target.value)}
                      className="w-full bg-gray-600 text-white p-2 rounded"
                      placeholder="Enter world name..."
                    />
                  </div>

                  <div>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={newWorldPublic}
                        onChange={(e) => setNewWorldPublic(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-white">Make world public</span>
                    </label>
                  </div>
                </div>

                <div className="flex space-x-2 mt-6">
                  <button
                    onClick={createWorld}
                    className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-2 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

const WorldCard = ({ world, onLoad, onDelete, isOwner }) => {
  return (
    <div className="bg-gray-700 p-4 rounded-lg">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="text-white font-semibold mb-1">{world.name}</h3>
          <div className="flex items-center space-x-4 text-sm text-gray-300">
            <span className="flex items-center gap-1">
              {world.is_public ? <Globe size={14} /> : <Lock size={14} />}
              {world.is_public ? 'Public' : 'Private'}
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={14} />
              {new Date(world.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="flex space-x-2">
          <button
            onClick={() => onLoad(world.id)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-sm"
          >
            Load
          </button>
          {isOwner && (
            <button
              onClick={() => onDelete(world.id)}
              className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-sm"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};