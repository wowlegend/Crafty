import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../store/useGameStore';
import { Bug, X, Copy, RefreshCw, Trash2, ShieldAlert, Navigation } from 'lucide-react';

// Fetch WebGL info once per page load to avoid creating redundant WebGL contexts on every render
const webglInfo = (() => {
  try {
    if (typeof document === 'undefined') return { supported: false };
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return { supported: false };
    
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    let info;
    if (!debugInfo) {
      info = {
        supported: true,
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER)
      };
    } else {
      info = {
        supported: true,
        vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
        renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      };
    }
    
    // Explicitly release WebGL context immediately to free up GPU resources
    const loseContextExt = gl.getExtension('WEBGL_lose_context');
    if (loseContextExt) {
      loseContextExt.loseContext();
    }
    
    return info;
  } catch (e) {
    return { supported: false, error: e.message };
  }
})();

export function DebugOverlay({ isWorldBuilt }) {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [errorCount, setErrorCount] = useState(0);
  const logEndRef = useRef(null);

  // Read state directly from store
  const playerPosition = useGameStore(state => state.playerPosition);
  const isSpawnChunkLoaded = useGameStore(state => state.isSpawnChunkLoaded);
  const debugChunks = useGameStore(state => state.debugChunks);
  const mobEntities = useGameStore(state => state.mobEntities);
  const isDay = useGameStore(state => state.isDay);

  useEffect(() => {
    // Read initial logs
    if (window.__debugLogs) {
      setLogs([...window.__debugLogs]);
      setErrorCount(window.__debugLogs.filter(l => l.type === 'error').length);
    }

    // Register log listener
    const listener = (newLog) => {
      setLogs(prev => {
        const updated = [...prev, newLog];
        if (updated.length > 100) updated.shift();
        return updated;
      });
      if (newLog.type === 'error') {
        setErrorCount(c => c + 1);
      }
    };

    if (window.__debugListeners) {
      window.__debugListeners.add(listener);
    }

    return () => {
      if (window.__debugListeners) {
        window.__debugListeners.delete(listener);
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, logs]);

  const handleTeleport = () => {
    const store = useGameStore.getState();
    const rb = store.playerRigidBodyRef?.current;
    if (rb) {
      rb.setTranslation({ x: 0, y: 80, z: 0 }, true);
      rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
      console.log('[DEBUG] Manually teleported player to safety at (0, 80, 0)');
    } else {
      console.warn('[DEBUG] RigidBody not available for teleportation. Updating fallback position.');
      store.setPlayerPosition({ x: 0, y: 80, z: 0 });
    }
  };

  const handleForceStart = () => {
    console.log('[DEBUG] Manually forcing Spawn Chunk active and building world...');
    const store = useGameStore.getState();
    store.setIsSpawnChunkLoaded(true);
    
    // Teleport
    setTimeout(() => {
      handleTeleport();
    }, 100);
  };

  const handleCopyLogs = () => {
    const stats = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      webgl: webglInfo,
      gameState: {
        isWorldBuilt,
        isSpawnChunkLoaded,
        playerPosition,
        loadedChunks: Object.keys(debugChunks || {}),
        loadedChunksCount: Object.keys(debugChunks || {}).length,
        mobEntitiesCount: (mobEntities || []).length,
        isDay,
        groundLevelAtOrigin: storeGetGroundLevel()
      },
      logs: logs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`)
    };

    navigator.clipboard.writeText(JSON.stringify(stats, null, 2))
      .then(() => alert('Diagnostics copied to clipboard!'))
      .catch(err => console.error('Failed to copy', err));
  };

  const storeGetGroundLevel = () => {
    try {
      const getMobGroundLevel = useGameStore.getState().getMobGroundLevel;
      if (getMobGroundLevel) {
        return getMobGroundLevel(0, 0);
      }
      return 'getMobGroundLevel is undefined';
    } catch (e) {
      return `Error: ${e.message}`;
    }
  };

  const handleClearLogs = () => {
    if (window.__debugLogs) window.__debugLogs = [];
    setLogs([]);
    setErrorCount(0);
    console.log('[DEBUG] Diagnostics console cleared.');
  };

  const handleHardRefresh = () => {
    console.log('[DEBUG] Performing hard refresh...');
    const origin = window.location.origin;
    window.location.href = origin + '?cb=' + Math.random();
  };

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 left-4 z-50 p-3 rounded-full flex items-center justify-center pointer-events-auto transition-all shadow-lg backdrop-blur-md"
        style={{
          backgroundColor: isOpen ? 'rgba(239, 68, 68, 0.4)' : 'rgba(31, 41, 55, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
        }}
      >
        <Bug className={`w-5 h-5 ${isOpen ? 'text-white' : 'text-green-400'}`} />
        {errorCount > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {errorCount}
          </span>
        )}
      </button>

      {/* Expanded Debug Panel */}
      {isOpen && (
        <div
          className="fixed inset-y-4 left-4 w-[480px] z-[49] rounded-2xl flex flex-col pointer-events-auto overflow-hidden shadow-2xl backdrop-blur-xl border border-white/10"
          style={{
            backgroundColor: 'rgba(10, 15, 25, 0.85)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
          }}
        >
          {/* Header */}
          <div className="px-5 py-4 flex items-center justify-between border-b border-white/5 bg-white/5">
            <div className="flex items-center space-x-2">
              <Bug className="w-5 h-5 text-green-400 animate-pulse" />
              <span className="font-mono text-sm font-semibold text-white tracking-wider">CRAFTY ENGINE DIAGNOSTICS</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="p-4 grid grid-cols-2 gap-3 border-b border-white/5 text-[11px] font-mono">
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-gray-400">World Built:</span>{' '}
              <span className={isWorldBuilt ? 'text-green-400' : 'text-red-400 font-bold animate-pulse'}>
                {isWorldBuilt ? 'TRUE' : 'FALSE (LOADING...)'}
              </span>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-gray-400">Spawn Chunk:</span>{' '}
              <span className={isSpawnChunkLoaded ? 'text-green-400' : 'text-red-400 font-bold animate-pulse'}>
                {isSpawnChunkLoaded ? 'LOADED' : 'NOT LOADED'}
              </span>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-gray-400">Loaded Chunks:</span>{' '}
              <span className="text-blue-400 font-semibold">
                {Object.keys(debugChunks || {}).length}
              </span>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5">
              <span className="text-gray-400">Player Position:</span>{' '}
              <span className="text-yellow-400">
                {playerPosition ? `${playerPosition.x}, ${playerPosition.y}, ${playerPosition.z}` : 'N/A'}
              </span>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5 col-span-2">
              <span className="text-gray-400">Ground level at (0,0):</span>{' '}
              <span className="text-purple-400">{storeGetGroundLevel()}</span>
            </div>
            <div className="bg-white/5 p-2 rounded-lg border border-white/5 col-span-2 overflow-x-auto whitespace-nowrap scrollbar-none">
              <span className="text-gray-400">WebGL Renderer:</span>{' '}
              <span className="text-indigo-300">
                {webglInfo.supported ? webglInfo.renderer : 'UNSUPPORTED'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="p-3 bg-white/5 border-b border-white/5 grid grid-cols-2 gap-2 text-xs font-semibold">
            <button
              onClick={handleForceStart}
              className="flex items-center justify-center space-x-1.5 px-3 py-2 bg-green-500/20 hover:bg-green-500/35 border border-green-500/30 text-green-300 rounded-lg transition-colors"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Force Build World</span>
            </button>
            <button
              onClick={handleTeleport}
              className="flex items-center justify-center space-x-1.5 px-3 py-2 bg-yellow-500/20 hover:bg-yellow-500/35 border border-yellow-500/30 text-yellow-300 rounded-lg transition-colors"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>Teleport Safety</span>
            </button>
            <button
              onClick={handleHardRefresh}
              className="flex items-center justify-center space-x-1.5 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/35 border border-blue-500/30 text-blue-300 rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Hard Refresh</span>
            </button>
            <button
              onClick={handleCopyLogs}
              className="flex items-center justify-center space-x-1.5 px-3 py-2 bg-indigo-500/20 hover:bg-indigo-500/35 border border-indigo-500/30 text-indigo-300 rounded-lg transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Diagnostics</span>
            </button>
          </div>

          {/* Logs scroll area */}
          <div className="flex-1 p-4 overflow-y-auto font-mono text-[10px] space-y-2 select-text">
            {logs.length === 0 ? (
              <div className="text-gray-500 text-center py-8">No diagnostics recorded.</div>
            ) : (
              logs.map((log) => {
                let color = 'text-gray-300';
                if (log.type === 'error') color = 'text-red-400 bg-red-950/20 p-1 rounded border border-red-900/30';
                else if (log.type === 'warn') color = 'text-yellow-400 bg-yellow-950/10 p-1 rounded';
                else if (log.type === 'info') color = 'text-cyan-400';

                return (
                  <div key={log.id} className={`${color} leading-relaxed break-words`}>
                    <span className="opacity-40 text-[9px] mr-1.5">[{log.timestamp}]</span>
                    <span>{log.message}</span>
                  </div>
                );
              })
            )}
            <div ref={logEndRef} />
          </div>

          {/* Footer Controls */}
          <div className="px-4 py-3 bg-white/5 border-t border-white/5 flex justify-end">
            <button
              onClick={handleClearLogs}
              className="flex items-center space-x-1 text-[10px] text-gray-400 hover:text-white transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear Console</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
