/**
 * touchTray.js — the touch panel-access registry (touch M3a). On desktop E/B/M open these panels and G talks;
 * touch has no keyboard, so the tray surface (<TouchControlsSurface>) offers each as a button. PURE
 * producer — the panels themselves already render (MenuSystem). Icons are lucide names
 * (the 2-tone game-icons don't tint; M2a switched touch chrome to lucide).
 */
import { talk, talkOpenedPanel } from '../input/talk.js';

// id -> { labelKey (the i18n key every surface renders through), lucide icon name, and either
//         the store action (value-or-fn updater) and boolean store key of a panel, or `talk` for the G verb }
export const TRAY_PANELS = [
  { id: 'inventory', labelKey: 'ui.inventory', icon: 'Package',  action: 'setShowInventory',    show: 'showInventory' },
  // The talk verb (input/talk.js): Mara's Forge, the merchant, the healer and the warden, as G reaches them.
  { id: 'talk',      labelKey: 'ui.talk',      icon: 'MessageCircle', talk: true },
  { id: 'build',     labelKey: 'ui.build',     icon: 'Blocks',   action: 'setShowBuildingTools', show: 'showBuildingTools' },
  { id: 'magic',     labelKey: 'ui.magic',     icon: 'Sparkles', action: 'setShowMagic',         show: 'showMagic' },
];

/**
 * Open the Talents panel from touch — the KeyU open branch (InputManager.jsx), which a tablet has no key for. Until
 * Phase 0c NOTHING on touch opened this panel, so no Aspect could ever be unlocked on an iPad (refute F9). The panel's
 * open flag is App-local state (useInputManager), not a store key, which is why it is not a TRAY_PANELS row: App
 * passes its setters in. Closes the other panels first, exactly as the key does.
 */
export const openTalents = (store, { setShowSpellUpgrades, setShowAchievements }) => {
  for (const k of ['setShowInventory', 'setShowForge', 'setShowMagic', 'setShowBuildingTools', 'setShowSettings']) {
    store?.[k]?.(false);
  }
  setShowAchievements?.(false);
  setShowSpellUpgrades(true);
};

/** Flip one panel through its verified store setter (which accepts a fn updater). Returns false if unwired. */
export const togglePanel = (panel, store) => {
  if (!panel || !store || typeof store[panel.action] !== 'function') return false;
  store[panel.action]((prev) => !prev);
  return true;
};

/**
 * A tray button pressed: a panel row toggles its panel, the talk row talks. Returns whether a panel took the input, so
 * the overlay yields control only then (a heal or a hint leaves the player in play).
 */
export const activateTrayRow = (row, store) => (row?.talk ? talkOpenedPanel(talk(store)) : togglePanel(row, store));
