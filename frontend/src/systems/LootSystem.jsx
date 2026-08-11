import { useFrame, useThree } from '@react-three/fiber';
import { useGameSounds } from '../SoundManager';
import { useGameStore } from '../store/useGameStore';
import { ecs } from '../ecs/world';
import { GameMethods } from '../GameMethods';
import { isCaptureMode } from '../devtest/captureMode';
import { stepLootDrop } from '../game/xpOrbStepper';
import { getItemRarity } from '../data/items.js';
import { rarityBeam } from '../game/lootJuice.js';
import { lootDropsQuery } from './_npcShared';

// LootSystem -- loot-drop magnet/pull + collect side-effects (physics is the pure game/xpOrbStepper.js
// stepLootDrop). Extracted VERBATIM from SimplifiedNPCSystem.jsx (v6 de-monolith A1.7); behavior
// unchanged. The shared lootDropsQuery comes from ./_npcShared (A1.5).
export const LootSystem = () => {
  const { camera } = useThree();
  const { playPickup } = useGameSounds();

  useFrame((state, delta) => {
    if (!camera) return;
    // Capture-determinism: SETTLE the loot to its declared resting state rather than stopping the loop.
    //
    // The early return froze each drop wherever its parabola had got to, and capture is entered after a
    // boot of run-dependent length -- so "hold their exact spawn position" was only true if the flag
    // flipped on the spawn frame. Any later and the frame recorded a mid-arc pose that varied with
    // machine load, which is the exact class this repo documents: a guard must RESET TO A DECLARED VALUE,
    // never early-return, because stopping an animation leaves it wherever it happened to be.
    if (isCaptureMode()) {
      for (const entity of lootDropsQuery.entities) {
        if (!entity || !entity.position) continue;
        if (entity.velocity && entity.velocity.set) entity.velocity.set(0, 0, 0); // no arc
        entity.magnetized = false;   // no camera pull
        if (Number.isFinite(entity.spawnY)) entity.position.y = entity.spawnY; // the declared rest height
      }
      return;
    }
    const store = useGameStore.getState();
    const playerPos = camera.position;

    for (const entity of [...lootDropsQuery.entities]) {
      // physics extracted to the pure game/xpOrbStepper.js stepLootDrop (S3-M6, byte-equivalent;
      // magnet range 7 / base 40 / floor 3); the component keeps the loot collect side-effects.
      const collected = stepLootDrop(entity, delta, {
        playerPos,
        groundYAt: store.getMobGroundLevel,
      }).collected;
      if (collected) {
        if (store.addToInventory) store.addToInventory(entity.item, 1);
        if (entity.xp > 0 && GameMethods.grantXP) GameMethods.grantXP(entity.xp, entity.item);
        if (entity.xp > 0 && GameMethods.spawnXPText) GameMethods.spawnXPText(entity.xp, entity.position);
        if (store.addNotification) store.addNotification(`Looted: ${entity.item}`, 'loot');
        playPickup();
        // M3c-T2: rarity-tinted pickup pop at the collect point (same color as the drop's beam).
        if (GameMethods.spawnLootPop) GameMethods.spawnLootPop(entity.position, rarityBeam(getItemRarity(entity.item)).color);
        ecs.remove(entity);
      }
    }
  });

  return null;
};
