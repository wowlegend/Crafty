if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__debugLogs = window.__debugLogs || [];
  window.__debugListeners = window.__debugListeners || new Set();

  const addLog = (type, args) => {
    const message = args.map(arg => {
      if (arg instanceof Error) return arg.stack || arg.toString();
      if (typeof arg === 'object') {
        try { return JSON.stringify(arg); } catch { return String(arg); }
      }
      return String(arg);
    }).join(' ');

    const logEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message
    };

    window.__debugLogs.push(logEntry);
    if (window.__debugLogs.length > 100) {
      window.__debugLogs.shift();
    }

    window.__debugListeners.forEach(listener => {
      try { listener(logEntry); } catch {}
    });
  };

  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = (...args) => { origLog(...args); addLog('info', args); };
  console.warn = (...args) => { origWarn(...args); addLog('warn', args); };
  console.error = (...args) => { origError(...args); addLog('error', args); };

  // addEventListener (not window.onerror = ) so we augment rather than clobber any other handler
  window.addEventListener('error', (event) => {
    addLog('error', [`error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`, event.error]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    addLog('error', [`unhandledrejection: ${event.reason}`]);
  });
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './theme/fonts.css';
import { applyThemeVars } from './theme/cssVars.js';
import App from './App';
import { useGameStore } from './store/useGameStore';
import { GameMethods } from './GameMethods';
import { ErrorBoundary } from './ui/ErrorBoundary.jsx';

applyThemeVars(); // write --ui-* onto :root before first paint

if (typeof window !== 'undefined') {
  window.useGameStore = useGameStore;
  // DEV-only: the terrain verbs (mine/place/open) and the build raycasts live on GameMethods, a plain
  // module object Terrain populates on mount. Exposing it here lets an E2E drive the REAL verb closures
  // the mouse router calls, rather than a re-implementation — the same reason window.useGameStore and
  // window.__craftyTest exist. Added 2026-08-11 because no E2E had ever placed a block, in a game whose
  // core loop is build-by-day / survive-by-night, which is how an inert Building Tools panel survived on
  // four advertised entry surfaces. `import.meta.env.DEV` is statically false in prod, so this is
  // tree-shaken out of the shipped bundle.
  if (import.meta.env.DEV) window.GameMethods = GameMethods;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
