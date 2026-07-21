/**
 * touchTray.js — the touch panel-access registry (touch M3a). On desktop E/C/B/M open these panels;
 * touch has no keyboard, so the tray surface (<TouchControlsSurface>) calls togglePanel for each. PURE
 * producer — the panels themselves already render (MenuSystem). Icons are lucide names
 * (the 2-tone game-icons don't tint; M2a switched touch chrome to lucide).
 */

// id -> { label (English fallback), labelKey (i18n key for localized aria-labels), lucide icon name,
//         store action (value-or-fn updater), the boolean store key }
export const TRAY_PANELS = [
  { id: 'inventory', label: 'Inventory', labelKey: 'ui.inventory', icon: 'Package',  action: 'setShowInventory',    show: 'showInventory' },
  { id: 'craft',     label: 'Craft',     labelKey: 'ui.craft',     icon: 'Hammer',   action: 'setShowCrafting',      show: 'showCrafting' },
  { id: 'build',     label: 'Build',     labelKey: 'ui.build',     icon: 'Blocks',   action: 'setShowBuildingTools', show: 'showBuildingTools' },
  { id: 'magic',     label: 'Magic',     labelKey: 'ui.magic',     icon: 'Sparkles', action: 'setShowMagic',         show: 'showMagic' },
];

/** Flip one panel through its verified store setter (which accepts a fn updater). Returns false if unwired. */
export const togglePanel = (panel, store) => {
  if (!panel || !store || typeof store[panel.action] !== 'function') return false;
  store[panel.action]((prev) => !prev);
  return true;
};
