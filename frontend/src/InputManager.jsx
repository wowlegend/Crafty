import { useGameStore } from './store/useGameStore';
import { useState, useEffect, useRef } from 'react';
import { HOTBAR_BLOCKS } from './world/Blocks';
// `setActive` is intentionally imported-but-unused: tests/gates/input-abstraction-gates.test.js
// REQUIRES InputManager to import it, so the centralized active gate stays declared at this seam
// (Components.jsx remains the authoritative writer). Deleting it pleases the linter and breaks the gate.
// eslint-disable-next-line no-unused-vars
import { getInput, setActive } from './input/inputState';
import { isAnyPanelOpen, coveringSurfaceUp } from './ui/panelState.js';
import { isInputLive } from './input/inputLive.js';
import { talk } from './input/talk.js';
import { toggleGroupTarget, openTab, panelWrites, applyPanelWrites, closeAllPanels } from './ui/panelGroups.js';
import { releasePointerLock, requestGameLock } from './input/pointerLock.js';

// The input types a key types into. A checkbox, a button or a slider takes no text, so the game's keys stay live on them.
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);
function isTextEntry(target) {
  if (!target || typeof target !== 'object') return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return tag === 'INPUT' && !NON_TEXT_INPUTS.has(String(target.type || 'text').toLowerCase());
}
// The keys that toggle something: a held one's auto-repeat strobed its panel open and shut.
const TOGGLE_KEYS = new Set(['KeyB', 'KeyH', 'KeyJ', 'Tab', 'KeyG', 'F3']);

export function useInputManager(gameState, gameSystems) {
  const [showStats, setShowStats] = useState(false);
  // The Talents panel and the Journal's Feats tab are store flags (ui/panelState.js), returned here as they always were.
  const showAchievements = useGameStore((s) => s.showAchievements);
  const setShowAchievements = useGameStore((s) => s.setShowAchievements);
  const showSpellUpgrades = useGameStore((s) => s.showSpellUpgrades);
  const setShowSpellUpgrades = useGameStore((s) => s.setShowSpellUpgrades);

  useEffect(() => {
    const handleWheel = (event) => {
      const state = useGameStore.getState();
      if (isInputLive(state, getInput().active)) {
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

  // Keep the latest Show Stats value in a ref to avoid rebinding the key listener.
  const showStatsRef = useRef(showStats);
  useEffect(() => {
    showStatsRef.current = showStats;
  });

  useEffect(() => {
    const handleKeyDown = (event) => {
      // This listener runs on the window in the capture phase, ahead of every field. A key mid-composition is the IME's
      // (keyCode 229 is the signal some engines send for the key that ends one), and a key aimed at a text field is text:
      // World Manager's name field lost b, h and j to Build, Controls and the Journal ("Hobbit Hole" became "it ").
      // Esc still closes the panel the field is on.
      if (event.isComposing || event.keyCode === 229) return;
      if (event.code !== 'Escape' && isTextEntry(event.target)) return;
      if (event.repeat && TOGGLE_KEYS.has(event.code)) return;
      const state = useGameStore.getState();
      // Show Stats is not a panel (ui/panelState.js): spells, claims and every other key act with the readout up.
      const anyPanelOpen = isAnyPanelOpen(state);
      // Input acts on the world only while it is live and nothing covers the game (input/inputLive.js).
      const live = isInputLive(state, getInput().active);

      if (event.code === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();

        if (anyPanelOpen) {
          // Every panel, from the one list (ui/panelGroups.js closeAllPanels over PANEL_FLAGS): this hand list missed
          // World Manager and Credits, so Esc never closed them.
          closeAllPanels(state);
          requestGameLock(useGameStore.getState());
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

      // Tab in any other dialog is that dialog's: it reaches the focus trap (ui/primitives/Modal.jsx). It only closes
      // Character, whose key it is.
      if (event.code === 'Tab' && anyPanelOpen && !openTab('character', state)) return;

      if (live || anyPanelOpen) {
        // B opens Build and H the controls panel, or closes it when it is up. Tab opens Character (gear, spells, talents)
        // and J the Journal (quests, feats), each on its first tab, or closes the group when one of its tabs is up
        // (ui/panelGroups.js). Each closes every other panel first, from the one list.
        const group = event.code === 'Tab' ? 'character' : event.code === 'KeyJ' ? 'journal' : null;
        if (group || event.code === 'KeyH' || event.code === 'KeyB') {
          event.preventDefault();
          event.stopImmediatePropagation();
          let target;
          if (group) target = toggleGroupTarget(group, state);
          else if (event.code === 'KeyH') target = state.showControls ? null : 'showControls';
          else target = state.showBuildingTools ? null : 'showBuildingTools';
          applyPanelWrites(panelWrites(target), state);
          if (target === 'showControls') state.markControlsSeen?.();
          // Opening needs no release here: the panel is a covering surface, and the effect below gives the pointer back.
          if (!target) requestGameLock(useGameStore.getState());
          return;
        }
      }

      if (live) {
        if (event.code === 'Digit1') state.setActiveSpell('fireball');
        if (event.code === 'Digit2') state.setActiveSpell('iceball');
        if (event.code === 'Digit3') state.setActiveSpell('lightning');
        if (event.code === 'Digit4') state.setActiveSpell('arcane');
      }

      if (event.key === 'F3') {
        setShowStats(!showStatsRef.current);
        event.preventDefault();
        return;
      }

      if (event.code === 'KeyG' && live) {
        event.preventDefault();
        // The talk verb (input/talk.js): the smith opens Mara's Forge, the merchant trades, the healer heals, the warden
        // hints, and with no villager near a chest beside the player opens. Only a panel exits pointer lock, through the
        // covering-surface effect below.
        talk(state);
        return;
      }

    };

    window.addEventListener('keydown', handleKeyDown, { capture: true, passive: false });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);

  // A surface that covers the game takes the pointer back, whatever opened it: the one release for every opener (the
  // panel keys, G, a chest from the world, VICTORY, a lost WebGL context). Under a lock every click goes to the canvas,
  // so a surface raised with the lock held left its control unclickable while the clicks mined and placed behind it;
  // each opener used to be trusted to release the lock itself, and VICTORY and the context loss did not. App's
  // pause-on-unlock is suppressed for the release (ui/panelState.js).
  const covered = useGameStore((s) => coveringSurfaceUp(s));
  useEffect(() => {
    if (covered) releasePointerLock();
  }, [covered]);

  useEffect(() => {
    if (gameSystems && !gameSystems.isAlive) releasePointerLock();
  }, [gameSystems?.isAlive]);

  return {
    showStats, setShowStats,
    showAchievements, setShowAchievements,
    showSpellUpgrades, setShowSpellUpgrades
  };
}
