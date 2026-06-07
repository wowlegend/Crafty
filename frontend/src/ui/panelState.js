// panelState.js — the SINGLE SOURCE OF TRUTH for "is a modal/panel open".
//
// The title/pause menu must hide, and gameplay keys must be suppressed, whenever ANY panel is open.
// Before this, TWO hand-maintained lists encoded that — MenuSystem's menu-overlay guard and
// InputManager's key gate — and they DRIFTED: the menu guard listed only 5 of the 13 panels, so opening
// the Aspect tree (or achievements / chest / world-manager / credits / trading / auth / stats) popped the
// main menu OVER the panel (2026-06-07, caught in playtest). Both call-sites now read THIS list, so a new
// panel can't be half-wired. (Most flags live in the zustand store; the 4 React-local ones —
// showSpellUpgrades / showAchievements / showStats / showAuthModal — are merged in by each caller. The
// durable follow-up is to move those 4 into the store so a single store selector suffices.)

export const PANEL_FLAGS = [
  // store-backed
  'showInventory', 'showCrafting', 'showMagic', 'showBuildingTools', 'showSettings',
  'showChestInterface', 'showTradingInterface', 'showWorldManager', 'showCredits',
  // React-local (passed in by the caller)
  'showSpellUpgrades', 'showAchievements', 'showStats', 'showAuthModal',
];

/**
 * isAnyPanelOpen(flags) -> true if ANY known panel flag in `flags` is truthy.
 * `flags` = a merged object of the store panel flags + the React-local ones. Missing keys read falsy
 * (treated as closed). Pure + unit-tested so the canonical list can't silently lose an entry.
 */
export function isAnyPanelOpen(flags) {
  if (!flags) return false;
  for (const key of PANEL_FLAGS) {
    if (flags[key]) return true;
  }
  return false;
}
