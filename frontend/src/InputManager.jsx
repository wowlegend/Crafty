import { useState, useEffect } from 'react';

export function useInputManager(gameState, gameSystems, questSystem) {
  const [isPointerLocked, setIsPointerLocked] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showAchievements, setShowAchievements] = useState(false);
  const [showSpellUpgrades, setShowSpellUpgrades] = useState(false);

  useEffect(() => {
    const originalRequestPointerLock = Element.prototype.requestPointerLock;
    Element.prototype.requestPointerLock = function () {
      try {
        const promise = originalRequestPointerLock.apply(this, arguments);
        if (promise && typeof promise.catch === 'function') {
          return promise.catch(e => {
            console.warn('Pointer lock failed (safely caught):', e);
          });
        }
        return promise;
      } catch (e) {
        console.warn('Pointer lock blocked (safely caught):', e);
      }
    };

    return () => {
      Element.prototype.requestPointerLock = originalRequestPointerLock;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const anyPanelOpen = gameState.showInventory || gameState.showCrafting ||
        gameState.showMagic || gameState.showBuildingTools ||
        gameState.showSettings || showAchievements;

      if (event.code === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();

        if (anyPanelOpen) {
          gameState.setShowInventory(false);
          gameState.setShowCrafting(false);
          gameState.setShowMagic(false);
          gameState.setShowBuildingTools(false);
          gameState.setShowSettings(false);
          setShowAchievements(false);
          setTimeout(() => {
            if (document.body.requestPointerLock) {
              document.body.requestPointerLock().catch(e => console.warn(e));
            }
          }, 100);
        } else if (isPointerLocked) {
          gameState.setShowSettings(true);
          if (document.pointerLockElement) {
            document.exitPointerLock();
          }
        } else {
          setIsPointerLocked(true);
          setTimeout(() => {
            if (document.body.requestPointerLock) {
              document.body.requestPointerLock().catch(e => console.warn(e));
            }
          }, 100);
        }
        return;
      }

      if (isPointerLocked || anyPanelOpen) {
        const toggleUI = (setter, currentValue) => {
          event.preventDefault();
          event.stopImmediatePropagation();

          gameState.setShowInventory(false);
          gameState.setShowCrafting(false);
          gameState.setShowMagic(false);
          gameState.setShowBuildingTools(false);
          gameState.setShowSettings(false);

          const newValue = !currentValue;
          setter(newValue);

          if (newValue && document.pointerLockElement) {
            document.exitPointerLock();
          }

          if (!newValue) {
            setTimeout(() => {
              if (document.body.requestPointerLock) {
                document.body.requestPointerLock().catch(e => console.warn(e));
              }
            }, 100);
          }
        };

        if (event.code === 'KeyE') toggleUI(gameState.setShowInventory, gameState.showInventory);
        if (event.code === 'KeyC') toggleUI(gameState.setShowCrafting, gameState.showCrafting);
        if (event.code === 'KeyB') toggleUI(gameState.setShowBuildingTools, gameState.showBuildingTools);
      }

      if (isPointerLocked && !anyPanelOpen) {
        if (event.code === 'Digit1') gameState.setActiveSpell('fireball');
        if (event.code === 'Digit2') gameState.setActiveSpell('iceball');
        if (event.code === 'Digit3') gameState.setActiveSpell('lightning');
        if (event.code === 'Digit4') gameState.setActiveSpell('arcane');
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
        gameState.setShowInventory(false);
        gameState.setShowCrafting(false);
        gameState.setShowMagic(false);
        gameState.setShowBuildingTools(false);
        gameState.setShowSettings(false);
        const newVal = !showAchievements;
        setShowAchievements(newVal);
        if (newVal && document.pointerLockElement) document.exitPointerLock();
        if (!newVal) {
          setTimeout(() => {
            if (document.body.requestPointerLock) document.body.requestPointerLock().catch(e => console.warn(e));
          }, 100);
        }
        return;
      }

      if (event.code === 'KeyG' && isPointerLocked && !anyPanelOpen) {
        event.preventDefault();
        if (window.openNearbyChest) {
          const loot = window.openNearbyChest();
          if (loot && loot.length > 0) {
          }
        }
        return;
      }

      if (event.code === 'KeyT' && isPointerLocked && !anyPanelOpen) {
        event.preventDefault();
        if (window._mobEntities && window.gameCamera) {
          const px = window.gameCamera.position.x, pz = window.gameCamera.position.z;
          let nearest = null, nearestDist = 4;
          window._mobEntities.forEach(mob => {
            if (!mob.passive) return;
            const dx = mob.position[0] - px;
            const dz = mob.position[2] - pz;
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d < nearestDist) { nearest = mob; nearestDist = d; }
          });
          if (nearest && window.tameMob) {
            window.tameMob(nearest.id, nearest.type, nearest.position);
          }
        }
        return;
      }

      if (event.code === 'KeyU' && (isPointerLocked || anyPanelOpen)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        gameState.setShowInventory(false);
        gameState.setShowCrafting(false);
        gameState.setShowMagic(false);
        gameState.setShowBuildingTools(false);
        gameState.setShowSettings(false);
        setShowAchievements(false);
        const newVal = !showSpellUpgrades;
        setShowSpellUpgrades(newVal);
        if (newVal && document.pointerLockElement) document.exitPointerLock();
        if (!newVal) {
          setTimeout(() => {
            if (document.body.requestPointerLock) document.body.requestPointerLock().catch(e => console.warn(e));
          }, 100);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true, passive: false });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [gameState, showStats, isPointerLocked, showAchievements, showSpellUpgrades, questSystem]);

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
