import { useGameStore } from './store/useGameStore';
import { useState, useEffect, useRef } from 'react';
import { HOTBAR_BLOCKS } from './world/Blocks';
// `setActive` is intentionally imported-but-unused: tests/gates/input-abstraction-gates.test.js
// REQUIRES InputManager to import it, so the centralized active gate stays declared at this seam
// (Components.jsx remains the authoritative writer). Deleting it pleases the linter and breaks the gate.
// eslint-disable-next-line no-unused-vars
import { getInput, setActive } from './input/inputState';
import { isAnyPanelOpen } from './ui/panelState.js';
import { talk, talkOpenedPanel } from './input/talk.js';
import { toggleGroupTarget, panelWrites, applyPanelWrites } from './ui/panelGroups.js';
import { releasePointerLock, requestGameLock } from './input/pointerLock.js';

export function useInputManager(gameState, gameSystems) {
  const [showStats, setShowStats] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showSpellUpgrades, setShowSpellUpgrades] = useState(false);

  useEffect(() => {
    const handleWheel = (event) => {
      const state = useGameStore.getState();
      const active = getInput().active;
      const { showAchievements, showSpellUpgrades } = localRefs.current;
      // Show Stats is not a panel (ui/panelState.js): the hotbar scrolls with the readout up.
      const anyPanelOpen = isAnyPanelOpen({ ...state, showAchievements, showSpellUpgrades });

      if (active && !anyPanelOpen) {
        const currentIndex = HOTBAR_BLOCKS.indexOf(state.selectedBlock);
        if (currentIndex === -1) return;

        let nextIndex;
        if (event.deltaY > 0) {
          nextIndex = (currentIndex + 1) % HOTBAR_BLOCKS.length;
        } else {
          nextIndex = (currentIndex - 1 + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length;
        }
        state.setSelectedBlock(HOTBAR_BLOCKS[nextIndex]);
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  // Declared clean state-bound pointer lock requester

  // Keep latest values in refs to avoid rebinding event listener
  const localRefs = useRef({ showStats, showAchievements, showSpellUpgrades });
  useEffect(() => {
    localRefs.current = { showStats, showAchievements, showSpellUpgrades };
  });

  useEffect(() => {
    const handleKeyDown = (event) => {
      const state = useGameStore.getState();
      const active = getInput().active;
      const { showStats, showAchievements, showSpellUpgrades } = localRefs.current;

      // Show Stats is not a panel (ui/panelState.js): spells, claims and every other key act with the readout up.
      const anyPanelOpen = isAnyPanelOpen({ ...state, showAchievements, showSpellUpgrades });

      if (event.code === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();

        if (anyPanelOpen) {
          state.setShowInventory(false);
          state.setShowForge(false);
          state.setShowMagic(false);
          state.setShowBuildingTools(false);
          state.setShowSettings(false);
          state.setShowQuestLog(false);
          state.setShowControls(false);
          state.setShowTradingInterface(false);
          state.setSelectedVillager(null);
          state.setShowChestInterface(false);
          state.setActiveChestCoords(null);
          setShowAchievements(false);
          setShowSpellUpgrades(false);
          requestGameLock(state);
        } else {
          // KEVIN-FIX C5: the old `else if (active) -> settings` branch was UNREACHABLE —
          // while locked the browser consumes the Escape keydown entirely; the pause menu
          // now opens from the unlock TRANSITION (App). Here ESC only means: title-menu
          // context, re-enter the game.
          // KEVIN-FIX C3: request only — the lock-change listener (Components, the one
          // authority) sets active when the browser GRANTS the lock.
          requestGameLock(state);
        }
        return;
      }

      if (active || anyPanelOpen) {
        const toggleUI = (setter, currentValue) => {
          event.preventDefault();
          event.stopImmediatePropagation();

          state.setShowInventory(false);
          state.setShowForge(false);
          state.setShowMagic(false);
          state.setShowBuildingTools(false);
          state.setShowSettings(false);
          state.setShowQuestLog(false);
          state.setShowControls(false);
          setShowSpellUpgrades(false);
          setShowAchievements(false);

          const newValue = !currentValue;
          setter(newValue);

          if (newValue) {
            releasePointerLock();
          }

          if (!newValue) {
            requestGameLock(state);
          }
        };

        if (event.code === 'KeyB') toggleUI(state.setShowBuildingTools, state.showBuildingTools);
        // Tab opens Character (gear, spells, talents) and J the Journal (quests, feats), each on its first tab, or closes
        // the group when one of its tabs is up (ui/panelGroups.js). H opens the controls panel the same way.
        const group = event.code === 'Tab' ? 'character' : event.code === 'KeyJ' ? 'journal' : null;
        if (group || event.code === 'KeyH') {
          event.preventDefault();
          event.stopImmediatePropagation();
          const flags = { ...state, showAchievements, showSpellUpgrades };
          const target = group ? toggleGroupTarget(group, flags) : (state.showControls ? null : 'showControls');
          applyPanelWrites(panelWrites(target), state, { setShowSpellUpgrades, setShowAchievements });
          if (target === 'showControls') state.markControlsSeen?.();
          if (target) releasePointerLock();
          else requestGameLock(state);
          return;
        }
      }

      if (active && !anyPanelOpen) {
        if (event.code === 'Digit1') state.setActiveSpell('fireball');
        if (event.code === 'Digit2') state.setActiveSpell('iceball');
        if (event.code === 'Digit3') state.setActiveSpell('lightning');
        if (event.code === 'Digit4') state.setActiveSpell('arcane');
      }

      if (event.key === 'F3') {
        setShowStats(!showStats);
        event.preventDefault();
        return;
      }

      if (event.code === 'KeyG' && active && !anyPanelOpen) {
        event.preventDefault();
        // The talk verb (input/talk.js): the smith opens Mara's Forge, the merchant trades, the healer heals, the warden
        // hints, and with no villager near a chest beside the player opens. Only a panel exits pointer lock.
        if (talkOpenedPanel(talk(state))) releasePointerLock();
        return;
      }

    };

    window.addEventListener('keydown', handleKeyDown, { capture: true, passive: false });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);

  useEffect(() => {
    if (gameSystems && !gameSystems.isAlive) releasePointerLock();
  }, [gameSystems?.isAlive]);

  return {
    showStats, setShowStats,
    showAchievements, setShowAchievements,
    showSpellUpgrades, setShowSpellUpgrades
  };
}
