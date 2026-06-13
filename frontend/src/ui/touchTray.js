/**
 * touchTray.js — the touch panel-access registry (touch M3a). On desktop E/C/B/M open these panels
 * (InputManager:117-120); touch has no keyboard, so the tray surface (<TouchTray>) calls togglePanel
 * for each. PURE producer — the panels themselves already render (MenuSystem). Icons are lucide names
 * (the 2-tone game-icons don't tint; M2a switched touch chrome to lucide).
 */

// id -> { label, lucide icon name, store action (value-or-fn updater), the boolean store key }
export const TRAY_PANELS = [
  { id: 'inventory', label: 'Inventory', icon: 'Package',  action: 'setShowInventory',    show: 'showInventory' },
  { id: 'craft',     label: 'Craft',     icon: 'Hammer',   action: 'setShowCrafting',      show: 'showCrafting' },
  { id: 'build',     label: 'Build',     icon: 'Blocks',   action: 'setShowBuildingTools', show: 'showBuildingTools' },
  { id: 'magic',     label: 'Magic',     icon: 'Sparkles', action: 'setShowMagic',         show: 'showMagic' },
];

/** Flip one panel through its verified store setter (which accepts a fn updater). Returns false if unwired. */
export const togglePanel = (panel, store) => {
  if (!panel || !store || typeof store[panel.action] !== 'function') return false;
  store[panel.action]((prev) => !prev);
  return true;
};
