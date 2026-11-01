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

import ReactDOM from 'react-dom/client';
import './index.css';
import './theme/fonts.css';
import { applyThemeVars } from './theme/cssVars.js';
import { startGame } from './startGame.jsx';
import { useGameStore } from './store/useGameStore';
import { GameMethods } from './GameMethods';
import { parseLookbookParam } from './render/lookbookState.js';
import { setActive, getActiveSnapshot } from './input/inputState.js';
import { cycleFraction } from './game/dayPhase.js';
import { glInfo, contextLossCount } from './render/glDiagnostics.js';
import { ecs, mobsQuery } from './ecs/world.js';
import { skyFrameRef } from './render/mood.js';
import { handNodeCount } from './render/viewmodel.js';
import { worldNow } from './game/worldClock.js';
import { _roots } from '@react-three/fiber';
import { loadNightWhenBuilt } from './night/nightLoader.js';

applyThemeVars(); // write --ui-* onto :root before first paint

// The page's start. `installLookbookSeam` is the lookbook probe's door into the PRODUCTION build
// (render/lookbookSeam.js) or undefined: that module is its own chunk, fetched only for a `?lookbook=1` page, so no
// player downloads it. Everything that waits on the store (the e2e boot, the probes, scripts/ci/prod-smoke.mjs) finds
// the seam installed the moment window.useGameStore exists, because both happen here in one run, before the first render.
function boot(installLookbookSeam) {
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
    // Called only on `?lookbook=1` pages (the seam checks the parameter itself too), and inert until a script calls it.
    // Not DEV-gated on purpose — the probe shoots the shipped bundle.
    installLookbookSeam?.(window, {
      store: useGameStore, setActive, getActive: getActiveSnapshot, cycleOf: cycleFraction, glInfo, contextLosses: contextLossCount,
      hostiles: () => mobsQuery.entities,
      removeEntity: (e) => ecs.remove(e),
      // A dynamic import, so the timer is its own chunk that no player downloads.
      loadPassTimer: () => import('./render/passTimer.js'),
      sunDir: () => skyFrameRef.current.sunDir,
      handNodes: handNodeCount,
      // The boss system installs this only on a ?lookbook=1 page; read at the call, after App has mounted it.
      spawnDragon: (o) => useGameStore.getState().lookbookSpawnDragon?.(o),
      worldNow, // a staged windup is planted on the world clock
      keyDir: () => skyFrameRef.current.keyDir,
      roots: () => _roots, // frame() finds the game's scene among them
    });
  }

  // The world this tab plays is loaded before the first render (startGame.jsx, game/worldBoot.js).
  startGame(ReactDOM.createRoot(document.getElementById('root')));
  // The First Night's chunk, fetched once that world is built (night/nightLoader.js).
  loadNightWhenBuilt();
}

// A `?lookbook=1` page boots when the seam's chunk arrives; if that fetch fails the page stops with the error, and only
// the probe opens that page. The destructuring is the form knip and the bundler read as using one export.
async function bootLookbookPage() {
  const { installLookbookSeam } = await import('./render/lookbookSeam.js');
  boot(installLookbookSeam);
}

// A player's page boots in this same run.
if (typeof window !== 'undefined' && parseLookbookParam(window.location?.search)) {
  bootLookbookPage();
} else {
  boot(null);
}
