import React from 'react';
import App from './App';
import { ErrorBoundary } from './ui/ErrorBoundary.jsx';
import { useGameStore } from './store/useGameStore';
import { bootWorld } from './game/worldBoot.js';
import { sessionStore } from './game/worldSwitch.js';
import { listWorlds, readWorld, pruneEmptySlots } from './game/worldSaves.js';

/**
 * The page's start: load the world this tab plays into the store, then render (game/worldBoot.js says why the load comes
 * first). `root` is a React root, or anything with its `render`.
 * @param {{ render: (el: React.ReactElement) => void }} root
 */
export function startGame(root) {
  bootWorld({ store: useGameStore, session: sessionStore(), saves: { listWorlds, readWorld, pruneEmptySlots } });
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
