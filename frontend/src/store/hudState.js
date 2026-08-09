/**
 * hudState.js — the ONE definition of the store slice the HUD subtree receives as `gameState` (X3).
 *
 * WHY THIS IS A MODULE AND NOT AN INLINE LITERAL IN App.jsx. It used to be an inline object inside
 * `useGameStore(useShallow(state => ({ ... })))`. That literal carried `selectedBlock` but NOT
 * `setSelectedBlock`, so `GameHud`'s hotbar `onClick={() => gameState.setSelectedBlock(blockType)}` threw
 * "gameState.setSelectedBlock is not a function" — **on desktop as well as touch**. Nobody noticed for two
 * reasons: the keyboard and scroll paths call `useGameStore.getState().setSelectedBlock` DIRECTLY
 * (InputManager.jsx), so block selection appeared to work; and on touch the throw was invisible behind a
 * full-screen overlay that swallowed the tap before it ever reached the handler.
 *
 * A prop-producer and its consumers form a CONTRACT, and while the producer was an anonymous literal inside
 * a component, nothing could test that contract — a test would have had to retype the slice, which only
 * proves the copy agrees with itself. Naming it makes it importable, so `hudState.test.js` builds the real
 * slice from the real store and renders the real HUD against it.
 *
 * Pure: takes a store state, returns a plain object. No React, no subscription — App.jsx wraps it in
 * `useShallow` exactly as before, so the render behaviour is unchanged.
 */

/**
 * The HUD's view of the store. Keep VALUE and SETTER together when both are used: a value without its
 * setter is precisely the shape of the bug above, and it fails at click time rather than at render time,
 * which is why it survived so long.
 */
export const selectHudState = (state) => ({
  isSpawnChunkLoaded: state.isSpawnChunkLoaded,
  isDay: state.isDay,
  isAlive: state.isAlive,
  gameStarted: state.gameStarted,
  inventory: state.inventory,
  addToInventory: state.addToInventory,
  removeFromInventory: state.removeFromInventory,
  setShowInventory: state.setShowInventory,
  setShowCrafting: state.setShowCrafting,
  setShowMagic: state.setShowMagic,
  setShowBuildingTools: state.setShowBuildingTools,
  setShowSettings: state.setShowSettings,
  setShowTradingInterface: state.setShowTradingInterface,
  setShowQuestLog: state.setShowQuestLog,
  showInventory: state.showInventory,
  showCrafting: state.showCrafting,
  showMagic: state.showMagic,
  showBuildingTools: state.showBuildingTools,
  showSettings: state.showSettings,
  showTradingInterface: state.showTradingInterface,
  showQuestLog: state.showQuestLog,
  showWorldManager: state.showWorldManager,
  setShowWorldManager: state.setShowWorldManager,
  selectedVillager: state.selectedVillager,
  // 2026-08-09 AUDIT — this setter's absence was the single most self-indicting finding of the 108.
  // The header four lines above says "keep VALUE and SETTER together"; selectedVillager was selected
  // without it, so MenuSystem.jsx:203's onClose threw a TypeError AFTER unmounting the panel, and the
  // pointer-lock relock on the next line never ran. HUD_CALLABLE_KEYS omitted the same key, so the
  // guard written to catch this class never examined it.
  setSelectedVillager: state.setSelectedVillager,
  // Chest interface: gate + payload + setter. MenuSystem.jsx:100 mounts ChestInventoryPanel on
  // showChestInterface, which was never selected, so the panel could not render at all — while
  // Terrain.jsx's open(h) faithfully set the flag. A live write path feeding a dead read.
  showChestInterface: state.showChestInterface,
  activeChestCoords: state.activeChestCoords,
  setShowChestInterface: state.setShowChestInterface,
  // Credits: unreachable twice over — the gate key was missing AND the Settings button's handler called
  // an undefined setter. This is where the game-icons.net CC BY 3.0 attribution is discharged, per the
  // Design Language section of AGENTS.md, so the licence obligation rode on a path that could not run.
  showCredits: state.showCredits,
  setShowCredits: state.setShowCredits,
  // WorldManager "Create World" called an undefined function inside a try, so the failure was swallowed
  // and the button did nothing at all.
  startNewWorld: state.startNewWorld,
  // NOT in the store literal: GameScene.jsx:98 installs it via setState on mount and nulls it on
  // unmount. The KEY must still be selected or useShallow never propagates it, and every
  // `if (gameState.requestPointerLock)` takes its false branch forever.
  requestPointerLock: state.requestPointerLock,
  loadWorldData: state.loadWorldData,
  selectedBlock: state.selectedBlock,
  setSelectedBlock: state.setSelectedBlock, // X3: absent until 2026-08-05 — the hotbar click threw
  gameMode: state.gameMode,
  activeSpell: state.activeSpell,
  setActiveSpell: state.setActiveSpell,
});

/**
 * Every key the HUD subtree CALLS. `hudState.test.js` asserts each resolves to a function against the live
 * store, which is the check that would have caught `setSelectedBlock` the day it went missing — a value
 * silently reads `undefined`, but a missing handler only explodes when a player touches it.
 */
export const HUD_CALLABLE_KEYS = [
  'addToInventory',
  'removeFromInventory',
  'setShowInventory',
  'setShowCrafting',
  'setShowMagic',
  'setShowBuildingTools',
  'setShowSettings',
  'setShowTradingInterface',
  'setShowQuestLog',
  'setShowWorldManager',
  'loadWorldData',
  'setSelectedBlock',
  'setActiveSpell',
  'setSelectedVillager',
  'setShowChestInterface',
  'setShowCredits',
  'startNewWorld',
  // requestPointerLock is deliberately NOT here. This list means "called UNCONDITIONALLY, so it must be
  // a function"; GameScene installs requestPointerLock on mount and every caller guards with
  // `if (gameState.requestPointerLock)`, so undefined is a supported state. Adding it made the existing
  // hud-hotbar gate red — correctly. It still has to be SELECTED (see the slice above) or useShallow
  // never propagates it once GameScene installs it.
];
