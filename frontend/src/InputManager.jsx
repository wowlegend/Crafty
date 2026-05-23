import { useGameStore } from './store/useGameStore';
import { useState, useEffect, useRef } from 'react';
import { HOTBAR_BLOCKS } from './world/Blocks';

const requestPointerLockSafely = (state) => {
  if (state.requestPointerLock) {
    state.requestPointerLock();
  } else {
    const canvas = document.querySelector('canvas');
    if (canvas && canvas.requestPointerLock) {
      canvas.requestPointerLock();
    } else if (document.body.requestPointerLock) {
      document.body.requestPointerLock();
    }
  }
};

export function useInputManager(gameState, gameSystems, questSystem) {
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showSpellUpgrades, setShowSpellUpgrades] = useState(false);

  useEffect(() => {
    const handleWheel = (event) => {
      const state = useGameStore.getState();
      const { isPointerLocked, showAchievements, showSpellUpgrades } = localRefs.current;
      const anyPanelOpen = state.showInventory || state.showCrafting ||
        state.showMagic || state.showBuildingTools ||
        state.showSettings || showAchievements || showSpellUpgrades ||
        state.showTradingInterface || state.showChestInterface;

      if (isPointerLocked && !anyPanelOpen) {
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
  const localRefs = useRef({ isPointerLocked, showStats, showAchievements, showSpellUpgrades, questSystem });
  useEffect(() => {
    localRefs.current = { isPointerLocked, showStats, showAchievements, showSpellUpgrades, questSystem };
  });

  useEffect(() => {
    const handleKeyDown = (event) => {
      const state = useGameStore.getState();
      const { isPointerLocked, showStats, showAchievements, showSpellUpgrades, questSystem } = localRefs.current;

      const anyPanelOpen = state.showInventory || state.showCrafting ||
        state.showMagic || state.showBuildingTools ||
        state.showSettings || showAchievements || showSpellUpgrades ||
        state.showTradingInterface || state.showChestInterface;

      if (event.code === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();

        if (anyPanelOpen) {
          state.setShowInventory(false);
          state.setShowCrafting(false);
          state.setShowMagic(false);
          state.setShowBuildingTools(false);
          state.setShowSettings(false);
          state.setShowTradingInterface(false);
          state.setSelectedVillager(null);
          state.setShowChestInterface(false);
          state.setActiveChestCoords(null);
          setShowAchievements(false);
          setShowSpellUpgrades(false);
          requestPointerLockSafely(state);
        } else if (isPointerLocked) {
          state.setShowSettings(true);
          if (document.pointerLockElement) {
            document.exitPointerLock();
          }
        } else {
          setIsPointerLocked(true);
          requestPointerLockSafely(state);
        }
        return;
      }

      if (isPointerLocked || anyPanelOpen) {
        const toggleUI = (setter, currentValue) => {
          event.preventDefault();
          event.stopImmediatePropagation();

          state.setShowInventory(false);
          state.setShowCrafting(false);
          state.setShowMagic(false);
          state.setShowBuildingTools(false);
          state.setShowSettings(false);

          const newValue = !currentValue;
          setter(newValue);

          if (newValue && document.pointerLockElement) {
            document.exitPointerLock();
          }

          if (!newValue) {
            requestPointerLockSafely(state);
          }
        };

        if (event.code === 'KeyE') toggleUI(state.setShowInventory, state.showInventory);
        if (event.code === 'KeyC') toggleUI(state.setShowCrafting, state.showCrafting);
        if (event.code === 'KeyB') toggleUI(state.setShowBuildingTools, state.showBuildingTools);
      }

      if (isPointerLocked && !anyPanelOpen) {
        if (event.code === 'Digit1') state.setActiveSpell('fireball');
        if (event.code === 'Digit2') state.setActiveSpell('iceball');
        if (event.code === 'Digit3') state.setActiveSpell('lightning');
        if (event.code === 'Digit4') state.setActiveSpell('arcane');
      }

      if (event.code === 'KeyQ' && isPointerLocked && !anyPanelOpen) {
        event.preventDefault();
        if (questSystem && questSystem.quests) {
          questSystem.quests.forEach(quest => {
            if (quest.progress >= quest.target && !quest.claimed) {
              questSystem.claimQuest(quest.id);
            }
          });
        }
        return;
      }

      if (event.key === 'F3') {
        setShowStats(!showStats);
        event.preventDefault();
        return;
      }

      if (event.code === 'Tab' && (isPointerLocked || anyPanelOpen)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        state.setShowInventory(false);
        state.setShowCrafting(false);
        state.setShowMagic(false);
        state.setShowBuildingTools(false);
        state.setShowSettings(false);
        const newVal = !showAchievements;
        setShowAchievements(newVal);
        if (newVal && document.pointerLockElement) document.exitPointerLock();
        if (!newVal) {
          requestPointerLockSafely(state);
        }
        return;
      }

      if (event.code === 'KeyG' && isPointerLocked && !anyPanelOpen) {
        event.preventDefault();
        let nearestVillager = null;
        if (state.mobEntities && state.gameCamera) {
          const camera = state.gameCamera;
          const px = camera.position.x, pz = camera.position.z;
          let nearestDist = 4;
          state.mobEntities.forEach(mob => {
            if (mob.type === 'villager') {
              const dx = mob.position[0] - px;
              const dz = mob.position[2] - pz;
              const d = Math.sqrt(dx * dx + dz * dz);
              if (d < nearestDist) {
                nearestVillager = mob;
                nearestDist = d;
              }
            }
          });
        }

        if (nearestVillager) {
          state.setSelectedVillager(nearestVillager);
          state.setShowTradingInterface(true);
          if (document.exitPointerLock) {
            document.exitPointerLock();
          }
        } else if (state.openNearbyChest) {
          const loot = state.openNearbyChest();
          if (loot && loot.length > 0) {
          }
        }
        return;
      }

      if (event.code === 'KeyT' && isPointerLocked && !anyPanelOpen) {
        event.preventDefault();
        // Offloaded nearest Euclidean distance calculation slightly by referencing state
        if (state.mobEntities && state.gameCamera) {
          const camera = state.gameCamera;
          const px = camera.position.x, pz = camera.position.z;
          let nearest = null, nearestDist = 4;
          state.mobEntities.forEach(mob => {
            if (!mob.passive) return;
            const dx = mob.position[0] - px;
            const dz = mob.position[2] - pz;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < nearestDist) { nearest = mob; nearestDist = d; }
          });
          if (nearest && state.tameMob) {
            state.tameMob(nearest.id, nearest.type, nearest.position);
          }
        }
        return;
      }

      if (event.code === 'KeyU' && (isPointerLocked || anyPanelOpen)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        state.setShowInventory(false);
        state.setShowCrafting(false);
        state.setShowMagic(false);
        state.setShowBuildingTools(false);
        state.setShowSettings(false);
        setShowAchievements(false);
        const newVal = !showSpellUpgrades;
        setShowSpellUpgrades(newVal);
        if (newVal && document.pointerLockElement) document.exitPointerLock();
        if (!newVal) {
          requestPointerLockSafely(state);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true, passive: false });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);

  useEffect(() => {
    const handlePointerLockChange = () => {
      try {
        const isLocked = document.pointerLockElement !== null;
        setIsPointerLocked(isLocked);
      } catch (error) {
        setIsPointerLocked(true);
      }
    };
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    return () => document.removeEventListener('pointerlockchange', handlePointerLockChange);
  }, []);

  useEffect(() => {
    if (gameSystems && !gameSystems.isAlive && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [gameSystems?.isAlive]);

  return {
    isPointerLocked, setIsPointerLocked,
    showStats, setShowStats,
    showAchievements, setShowAchievements,
    showSpellUpgrades, setShowSpellUpgrades
  };
}
