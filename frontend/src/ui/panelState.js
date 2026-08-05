// panelState.js — the SINGLE SOURCE OF TRUTH for "is a modal/panel open".
//
// The title/pause menu must hide, and gameplay keys must be suppressed, whenever ANY panel is open.
// Before this, TWO hand-maintained lists encoded that — MenuSystem's menu-overlay guard and
// InputManager's key gate — and they DRIFTED: the menu guard listed only 5 of the 13 panels, so opening
// the Aspect tree (or achievements / chest / world-manager / credits / trading / auth / stats) popped the
// main menu OVER the panel (2026-06-07, caught in playtest). Both call-sites now read THIS list, so a new
// panel can't be half-wired. (Most flags live in the zustand store; the 3 React-local ones —
// showSpellUpgrades / showAchievements / showStats — are merged in by each caller. The
// durable follow-up is to move those 3 into the store so a single store selector suffices.)

export const PANEL_FLAGS = [
  // store-backed
  'showInventory', 'showCrafting', 'showMagic', 'showBuildingTools', 'showSettings',
  'showChestInterface', 'showTradingInterface', 'showWorldManager', 'showCredits', 'showQuestLog',
  // React-local (passed in by the caller)
  'showSpellUpgrades', 'showAchievements', 'showStats',
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

/**
 * shouldShowTitleMenu(state) -> whether the title/pause menu overlay should render.
 * It shows ONLY when the pointer is unlocked AND no panel is open. Opening a panel exits pointer-lock,
 * so WITHOUT the panel check the menu wrongly renders OVER the panel (the 2026-06-07 U-key bug). Pure +
 * unit-tested so the exact gate — not just the panel list — is locked. `state` = { isPointerLocked, ...panelFlags }.
 */
/**
 * shouldShowResumeOverlay(state) -> whether the "input is dead, here is the way back" overlay renders.
 *
 * THE BUG IT EXISTS FOR (Kevin, 2026-08-05): ESC opened the pause menu, ESC closed it, and the player
 * was left frozen and was killed by a mob. ESC is the browser's DEFAULT UNLOCK GESTURE, and MDN is
 * explicit that calling requestPointerLock() immediately after that gesture "will fail, even if a
 * transient activation is available". So the relock-on-close every panel performs (KEVIN-FIX C4) is
 * GUARANTEED to be refused on the ESC path — not racily, always. On refusal the player held:
 * no panel, active=false (Components.jsx:861 gates all movement on it), and no title menu (it is
 * suppressed once gameStarted). No surface, no input, and mobs that do not care.
 *
 * Retrying cannot fix this: the browser requires a fresh user gesture, by design, to stop a page
 * trapping the cursor. Only a CLICKABLE surface can recover — hence this overlay.
 *
 * It is deliberately DERIVED FROM STATE rather than opened by an event handler. The defect was never
 * in one branch; it was that no branch owned the refusal case. A predicate over state cannot be
 * bypassed by a path nobody thought of — including focus loss, a browser-initiated exit, or the next
 * panel someone adds with an optimistic relock in its onClose.
 *
 * @param {object} state { isPointerLocked, gameStarted, isAlive, ...panelFlags }
 */
export function shouldShowResumeOverlay(state) {
  if (!state) return false;
  if (state.isAlive === false) return false; // the DeathScreen owns that moment (as with the title menu)
  if (!state.gameStarted) return false; // pre-game unlock is the title/click-to-play screen's job
  return !state.isPointerLocked && !isAnyPanelOpen(state);
}

export function shouldShowTitleMenu(state) {
  if (!state) return false;
  // KEVIN-FIX C5: dying exits pointer lock, and without this gate the z-9999 title menu
  // mounted OVER the DeathScreen (z-50) — the respawn UI was occluded (2026-06-10 playtest).
  if (state.isAlive === false) return false;
  // KEVIN-FIX (2026-06-18 ESC flow): the title menu is a PRE-GAME screen only. Once the game has
  // started, an unlock means PAUSE — App opens the settings/pause panel on the unlock TRANSITION. On
  // that transition isPointerLocked flips false ONE render BEFORE showSettings is set, so without this
  // gate the title menu flashed in for a frame (then the pause panel) = the "overlapping/weird menu
  // sequence" Kevin reported. Suppressing it post-gameStarted leaves exactly ONE pause menu, no flash.
  if (state.gameStarted) return false;
  return !state.isPointerLocked && !isAnyPanelOpen(state);
}
