// worldSwitch.js — the world switches the UI offers (the World Manager's Load and Create, the title's New World), wired to
// the live store, this tab's sessionStorage and the page reload. The switch itself is game/worldBoot.js switchWorld.
import { useGameStore } from '../store/useGameStore';
import { switchWorld } from './worldBoot.js';
import { reloadPage } from './pageReload.js';

/** This tab's sessionStorage, or null where the browser refuses it (private mode, sandboxed frames). */
export function sessionStore() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Save the world in play, leave `note` for the reload, and reload (game/worldBoot.js writeBootNote names the notes). */
export function goToWorld(note) {
  switchWorld(note, { getState: useGameStore.getState, storage: sessionStore(), reload: reloadPage });
}
